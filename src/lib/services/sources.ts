// Unified source aggregator - routes to Internet Archive or FunkWhale

import type { Track, SearchParams, SearchResult } from '$lib/types';
import { smartSearch as iaSearch, getTrack as iaGetTrack } from './internetArchive';
import { search as fwSearch, getTrack as fwGetTrack, isFunkwhaleTrack } from './funkwhale';

/**
 * Unified search across all sources (Internet Archive + FunkWhale instances)
 * Results are merged with IA results first, then FunkWhale results appended.
 */
export async function unifiedSearch(params: SearchParams): Promise<SearchResult> {
	const enableIA = params.sources?.ia !== false;
	const enableFW = params.sources?.fw !== false;

	// Search enabled sources in parallel
	const promises: [Promise<SearchResult> | null, Promise<SearchResult> | null] = [
		enableIA ? iaSearch(params) : null,
		enableFW ? fwSearch(params) : null
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
 */
export async function unifiedGetTrack(identifier: string): Promise<Track | null> {
	if (isFunkwhaleTrack(identifier)) {
		return fwGetTrack(identifier);
	}
	return iaGetTrack(identifier);
}
