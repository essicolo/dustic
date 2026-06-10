// Unified source aggregator - routes to Internet Archive or FunkWhale

import type { Track, SearchParams, SearchResult } from '$lib/types';
import { smartSearch as iaSearch, getTrack as iaGetTrack } from './internetArchive';
import { search as fwSearch, getTrack as fwGetTrack, isFunkwhaleTrack } from './funkwhale';
import { isWebDAVTrack, decodeIdentifier, buildTrack as buildWebDAVTrack, findLibrary } from './webdavLibrary';
import { settings } from '$lib/stores/settings';
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

	// FW doesn't support tag filtering in the API; pass tags through so the
	// caller can fold them into the FW query as keywords.
	return { params: updated, fwTags: ct.fwTags };
}

/**
 * Apply tag filter to search params.
 * Tags are added as keywords to the search query for both sources.
 */
function applyTag(params: SearchParams): SearchParams {
	if (!params.tag) return params;

	const updated = { ...params };
	const tag = params.tag;

	// Don't duplicate if the query already contains the tag
	if (updated.query && updated.query.toLowerCase().includes(tag.toLowerCase())) {
		return updated;
	}

	if (updated.query) {
		updated.query = `${updated.query} ${tag}`;
	} else {
		updated.query = tag;
	}

	return updated;
}

/**
 * Unified search across all sources (Internet Archive + FunkWhale instances)
 * Supports content type filtering and tag-based discovery.
 */
export async function unifiedSearch(params: SearchParams): Promise<SearchResult> {
	const enableIA = params.sources?.ia !== false;
	const enableFW = params.sources?.fw !== false;

	// Apply content type and tag filters
	const { params: typedParams, fwTags } = applyContentType(params);
	const enriched = applyTag(typedParams);

	// For FW, build a separate query with content-type tags folded in.
	const fwParams = { ...enriched };
	if (fwTags.length && !fwParams.query) {
		fwParams.query = fwTags[0];
	}

	// Search enabled sources in parallel
	const promises: [Promise<SearchResult> | null, Promise<SearchResult> | null] = [
		enableIA ? iaSearch(enriched) : null,
		enableFW ? fwSearch(fwParams) : null
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

	const pageSize = params.pageSize || 50;
	return {
		items: merged,
		total: iaTotal + fwTotal,
		page: params.page || 1,
		pageSize,
		// Each page pulls up to pageSize from BOTH sources, so the real
		// page count follows the larger source. Deriving it from the
		// combined total would promise trailing pages that come up empty.
		pageCount: Math.max(Math.ceil(iaTotal / pageSize), Math.ceil(fwTotal / pageSize)),
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
