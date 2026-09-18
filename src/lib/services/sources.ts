// Unified source aggregator - routes to Internet Archive or FunkWhale

import type { Track, SearchParams, SearchResult } from '$lib/types';
import { smartSearch as iaSearch, getTrack as iaGetTrack } from './internetArchive';
import { search as fwSearch, getTrack as fwGetTrack, isFunkwhaleTrack } from './funkwhale';
import { isWebDAVTrack, decodeIdentifier, buildTrack as buildWebDAVTrack, findLibrary } from './webdavLibrary';
import { settings } from '$lib/stores/settings';
import { unavailableItems } from '$lib/stores/unavailable';
import { CONTENT_TYPES } from '$lib/utils/constants';
import { withCache } from '$lib/utils/cache';

interface EnrichedParams {
	params: SearchParams;
	/** Extra keywords FW should prepend to its query (content-type tags). */
	fwTags: string[];
}

/**
 * Apply content type filtering to search params.
 * Maps content types to IA collections and FW tag queries.
 */
function applyContentType(params: SearchParams): EnrichedParams {
	if (!params.contentType) return { params, fwTags: [] };

	const ct = CONTENT_TYPES.find((t) => t.id === params.contentType);
	if (!ct) return { params, fwTags: [] };

	const updated = { ...params };

	// Set IA collections from content type (unless already specified)
	if (!updated.collection?.length && ct.iaCollections.length > 0) {
		updated.collection = ct.iaCollections;
	}

	// Some types are defined by what they are not; see iaExcludeCollections.
	if (!updated.excludeCollection?.length && ct.iaExcludeCollections?.length) {
		updated.excludeCollection = ct.iaExcludeCollections;
	}

	// FW doesn't support tag filtering in the API; pass tags through so the
	// caller can fold them into the FW query as keywords.
	return { params: updated, fwTags: ct.fwTags };
}

/**
 * Apply a genre tag to search params.
 *
 * The tag used to be appended to the query as a keyword, which did not filter
 * by genre at all — it added a term the archive then matched against
 * descriptions and transcripts. Measured: "Tori Amos" ranks the artist second,
 * while "Tori Amos rock" returns 137 documents headed by Voice of America
 * broadcasts, with the artist gone entirely. A tag made results worse.
 *
 * Tags are now a browse filter on the `subject` field instead, and the UI only
 * offers them when there is no query to damage. `subject` alone is still far
 * too noisy (`subject:("rock")` is 368k documents, mostly radio station
 * recordings, because the radio archive tags everything with genre-like
 * subjects), so it is always scoped to the collections of the active content
 * type — which is what makes it return music rather than talk radio.
 *
 * FunkWhale has no equivalent field, so there the tag stays a keyword.
 */
function applyTag(params: SearchParams): SearchParams {
	if (!params.tag) return params;
	return { ...params, subject: params.tag };
}

/** Exposed for tests; the mapping is the whole point of the change. */
export const applyTagForTest = applyTag;

/** FunkWhale has no subject field; fold the tag into its text query instead. */
function applyTagForFunkwhale(params: SearchParams): SearchParams {
	const tag = params.tag;
	if (!tag) return params;
	if (params.query?.toLowerCase().includes(tag.toLowerCase())) return params;
	return { ...params, query: params.query ? `${params.query} ${tag}` : tag };
}

export interface UnifiedSearchOptions {
	/**
	 * Called as soon as Internet Archive answers, before FunkWhale has.
	 *
	 * The two sources are queried in parallel but differ by an order of
	 * magnitude: measured over several queries, IA returns in ~130-340ms
	 * while a FunkWhale instance takes 350-1900ms, and for most queries it
	 * contributes nothing. Waiting for both before showing anything made
	 * every search as slow as the slowest source. Callers that pass this get
	 * the archive's results immediately and the merged set when it is ready.
	 *
	 * Skipped when IA is disabled or returned nothing, since there would be
	 * nothing to show early.
	 */
	onPartial?: (result: SearchResult) => void;
}

/**
 * Unified search across all sources (Internet Archive + FunkWhale instances)
 * Supports content type filtering and tag-based discovery.
 */
export async function unifiedSearch(
	params: SearchParams,
	options: UnifiedSearchOptions = {}
): Promise<SearchResult> {
	const enableIA = params.sources?.ia !== false;
	const enableFW = params.sources?.fw !== false;

	// Apply content type and tag filters
	const { params: typedParams, fwTags } = applyContentType(params);
	const enriched = applyTag(typedParams);

	// For FW, build a separate query with content-type tags folded in.
	const fwParams = applyTagForFunkwhale({ ...enriched });
	if (fwTags.length && !fwParams.query) {
		fwParams.query = fwTags[0];
	}

	// Search enabled sources in parallel
	const iaPromise = enableIA ? iaSearch(enriched) : null;
	const fwPromise = enableFW ? fwSearch(fwParams) : null;

	// Hand the archive's results to the caller the moment they land, rather
	// than holding them until the slower source finishes.
	if (options.onPartial && iaPromise && fwPromise) {
		iaPromise
			.then((early) => {
				const items = unavailableItems.filter(early.items);
				if (items.length === 0) return;
				const pageSize = params.pageSize || 50;
				options.onPartial!({
					items,
					total: early.total,
					page: params.page || 1,
					pageSize,
					pageCount: early.pageCount ?? Math.ceil(early.total / pageSize)
				});
			})
			.catch(() => {
				// Handled below, where both outcomes are reconciled.
			});
	}

	const promises: [Promise<SearchResult> | null, Promise<SearchResult> | null] = [
		iaPromise,
		fwPromise
	];

	const settled = await Promise.allSettled(
		promises.filter((p): p is Promise<SearchResult> => p !== null)
	);

	// Map results back based on which sources were enabled
	let iaSettled: PromiseSettledResult<SearchResult> | undefined;
	let fwSettled: PromiseSettledResult<SearchResult> | undefined;
	let idx = 0;
	if (enableIA) iaSettled = settled[idx++];
	if (enableFW) fwSettled = settled[idx++];

	// Every enabled source failed: throw instead of returning an empty
	// result, so the UI can distinguish "sources unreachable" from
	// "genuinely no results".
	const rejections = settled.filter(
		(s): s is PromiseRejectedResult => s.status === 'rejected'
	);
	if (settled.length > 0 && rejections.length === settled.length) {
		const reason = rejections[0].reason;
		throw reason instanceof Error ? reason : new Error(String(reason));
	}

	const iaItems = iaSettled?.status === 'fulfilled' ? iaSettled.value.items : [];
	const iaTotal = iaSettled?.status === 'fulfilled' ? iaSettled.value.total : 0;

	const fwItems = fwSettled?.status === 'fulfilled' ? fwSettled.value.items : [];
	const fwTotal = fwSettled?.status === 'fulfilled' ? fwSettled.value.total : 0;
	// FunkWhale reports its own page count, because with several instances
	// the sum of their totals over-counts: every page queries all of them.
	const fwPages =
		fwSettled?.status === 'fulfilled'
			? (fwSettled.value.pageCount ?? Math.ceil(fwTotal / (params.pageSize || 50)))
			: 0;

	// Pass through IA errors; if one source failed and the other came back
	// empty, surface the failure rather than implying "no results".
	let error = iaSettled?.status === 'fulfilled' ? iaSettled.value.error : undefined;
	if (!error && rejections.length > 0 && iaItems.length + fwItems.length === 0) {
		const reason = rejections[0].reason;
		error = reason instanceof Error ? reason.message : String(reason);
	}

	// Interleave results: alternate IA and FW tracks so both sources are visible
	const merged: typeof iaItems = [];
	let ia = 0, fw = 0;
	while (ia < iaItems.length || fw < fwItems.length) {
		// Add a few IA results, then a FW result (roughly 3:1 ratio)
		for (let i = 0; i < 3 && ia < iaItems.length; i++) {
			merged.push(iaItems[ia++]);
		}
		if (fw < fwItems.length) {
			merged.push(fwItems[fw++]);
		}
	}

	// Drop rows the archive has already told us it no longer serves. Its
	// search index outlives removed items, so a dead item keeps returning a
	// healthy-looking document (formats, byte size, download count) until
	// someone presses play. See stores/unavailable.ts.
	const items = unavailableItems.filter(merged);

	const pageSize = params.pageSize || 50;
	return {
		items,
		total: iaTotal + fwTotal,
		page: params.page || 1,
		pageSize,
		// Each page pulls up to pageSize from BOTH sources, so the real
		// page count follows the larger source. Deriving it from the
		// combined total would promise trailing pages that come up empty.
		pageCount: Math.max(Math.ceil(iaTotal / pageSize), fwPages),
		error
	};
}

/**
 * Unified getTrack - routes to the correct source based on identifier prefix
 * FunkWhale identifiers start with "fw:", everything else goes to Internet Archive
 * Results are cached for 30 minutes to avoid refetching on page revisits.
 */
export async function unifiedGetTrack(identifier: string): Promise<Track | null> {
	return withCache(
		`track:${identifier}`,
		async () => {
			if (isWebDAVTrack(identifier)) {
				const decoded = decodeIdentifier(identifier);
				if (!decoded) return null;
				const library = findLibrary(settings.getWebDAVLibraries(), decoded.libraryId);
				if (!library) return null;
				const name = decoded.path.split('/').filter(Boolean).pop() || decoded.path;
				return buildWebDAVTrack(library, { type: 'file', name, path: decoded.path });
			}
			if (isFunkwhaleTrack(identifier)) {
				return fwGetTrack(identifier);
			}
			return iaGetTrack(identifier);
		},
		30 * 60 * 1000 // 30 minutes
	);
}
