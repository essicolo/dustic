// Unified source aggregator - routes to Internet Archive or FunkWhale

import type { Track, SearchParams, SearchResult } from '$lib/types';
import { smartSearch as iaSearch, getTrack as iaGetTrack } from './internetArchive';
import { search as fwSearch, getTrack as fwGetTrack, isFunkwhaleTrack } from './funkwhale';
import { isWebDAVTrack, decodeIdentifier, buildTrack as buildWebDAVTrack, findLibrary } from './webdavLibrary';
import { settings } from '$lib/stores/settings';
import { CONTENT_TYPES } from '$lib/utils/constants';
import { withCache } from '$lib/utils/cache';

/**
 * Apply content type filtering to search params.
 * Maps content types to IA collections and FW tag queries.
 */
function applyContentType(params: SearchParams): SearchParams {
	if (!params.contentType) return params;

	const ct = CONTENT_TYPES.find((t) => t.id === params.contentType);
	if (!ct) return params;

	const updated = { ...params };

	// Set IA collections from content type (unless already specified)
	if (!updated.collection?.length && ct.iaCollections.length > 0) {
		updated.collection = ct.iaCollections;
	}

	// For FW: prepend content type tags to the query
	// (FW doesn't support tag filtering in the API, so we add keywords)
	if (ct.fwTags.length > 0) {
		// Store FW tags for the FW search to use
		(updated as any)._fwTags = ct.fwTags;
	}

	return updated;
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
	let enriched = applyContentType(params);
	enriched = applyTag(enriched);

	// For FW, build a separate query with content type tags if needed
	const fwParams = { ...enriched };
	const fwTags = (enriched as any)._fwTags as string[] | undefined;
	if (fwTags?.length) {
		// If no query, use first FW tag as the query
		if (!fwParams.query) {
			fwParams.query = fwTags[0];
		}
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

	const iaItems = iaSettled?.status === 'fulfilled' ? iaSettled.value.items : [];
	const iaTotal = iaSettled?.status === 'fulfilled' ? iaSettled.value.total : 0;

	const fwItems = fwSettled?.status === 'fulfilled' ? fwSettled.value.items : [];
	const fwTotal = fwSettled?.status === 'fulfilled' ? fwSettled.value.total : 0;

	// Pass through IA errors
	const error = iaSettled?.status === 'fulfilled' ? iaSettled.value.error : undefined;

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

	return {
		items: merged,
		total: iaTotal + fwTotal,
		page: params.page || 1,
		pageSize: params.pageSize || 50,
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
