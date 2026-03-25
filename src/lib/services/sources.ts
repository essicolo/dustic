// Unified source aggregator - routes to Internet Archive or FunkWhale

import type { Track, SearchParams, SearchResult } from '$lib/types';
import { smartSearch as iaSearch, getTrack as iaGetTrack } from './internetArchive';
import { search as fwSearch, getTrack as fwGetTrack, isFunkwhaleTrack } from './funkwhale';

/**
 * Unified search across all sources (Internet Archive + FunkWhale instances)
 * Results are merged with IA results first, then FunkWhale results appended.
 */
export async function unifiedSearch(params: SearchParams): Promise<SearchResult> {
	// Search both sources in parallel
	const [iaResult, fwResult] = await Promise.allSettled([
		iaSearch(params),
		fwSearch(params)
	]);

	const iaItems = iaResult.status === 'fulfilled' ? iaResult.value.items : [];
	const iaTotal = iaResult.status === 'fulfilled' ? iaResult.value.total : 0;

	const fwItems = fwResult.status === 'fulfilled' ? fwResult.value.items : [];
	const fwTotal = fwResult.status === 'fulfilled' ? fwResult.value.total : 0;

	// Pass through IA errors
	const error = iaResult.status === 'fulfilled' ? iaResult.value.error : undefined;

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

	console.log(`[Sources] IA status: ${iaResult.status}, FW status: ${fwResult.status}`);
	console.log(`[Sources] Merged: ${iaItems.length} IA + ${fwItems.length} FW = ${merged.length} items`);
	if (fwItems.length > 0) {
		console.log(`[Sources] First FW item:`, JSON.stringify({ id: fwItems[0].identifier, title: fwItems[0].title, artist: fwItems[0].artist }));
	}
	if (fwResult.status === 'rejected') {
		console.error(`[Sources] FW search failed:`, (fwResult as PromiseRejectedResult).reason);
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
