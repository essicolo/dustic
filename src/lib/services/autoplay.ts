// Autoplay service - Smart next track selection (source-aware)

import type { Track, AutoplayRule } from '$lib/types';
import { search as iaSearch } from './internetArchive';
import {
	isFunkwhaleTrack,
	parseFunkwhaleTrack,
	getAlbumTracks,
	searchByArtist,
	searchByTag,
	getRandomTracks
} from './funkwhale';
import { autoplayStore } from '$lib/stores/autoplay';
import { get } from 'svelte/store';

/** Pick a random item from an array, excluding current track */
function pickRandom(tracks: Track[], excludeId?: string): Track | null {
	const filtered = excludeId ? tracks.filter((t) => t.identifier !== excludeId) : tracks;
	return filtered.length > 0 ? filtered[Math.floor(Math.random() * filtered.length)] : null;
}

// ---- Internet Archive strategies ----

async function iaFindNextInAlbum(currentTrack: Track): Promise<Track | null> {
	if (!currentTrack.album) return null;
	try {
		const result = await iaSearch({
			query: `creator:"${currentTrack.artist}" AND title:"${currentTrack.album}"`,
			pageSize: 20
		});
		return pickRandom(result.items, currentTrack.identifier);
	} catch {
		return null;
	}
}

async function iaFindSameArtist(currentTrack: Track): Promise<Track | null> {
	if (!currentTrack.artist || currentTrack.artist === 'Unknown Artist') return null;
	try {
		const result = await iaSearch({
			query: `creator:"${currentTrack.artist}"`,
			pageSize: 20
		});
		return pickRandom(result.items, currentTrack.identifier);
	} catch {
		return null;
	}
}

async function iaFindSimilarGenre(currentTrack: Track): Promise<Track | null> {
	if (!currentTrack.genre || currentTrack.genre.length === 0) return null;
	try {
		const genreQuery = currentTrack.genre
			.slice(0, 3)
			.map((g) => `subject:"${g}"`)
			.join(' OR ');
		const result = await iaSearch({ query: genreQuery, pageSize: 20 });
		return pickRandom(result.items, currentTrack.identifier);
	} catch {
		return null;
	}
}

async function iaFindSameCollection(currentTrack: Track): Promise<Track | null> {
	if (!currentTrack.collection || currentTrack.collection.length === 0) return null;
	try {
		const result = await iaSearch({
			query: `collection:${currentTrack.collection[0]}`,
			pageSize: 20
		});
		return pickRandom(result.items, currentTrack.identifier);
	} catch {
		return null;
	}
}

async function iaFindSameDecade(currentTrack: Track): Promise<Track | null> {
	if (!currentTrack.date) return null;
	try {
		const year = parseInt(currentTrack.date.substring(0, 4));
		if (isNaN(year)) return null;
		const decade = Math.floor(year / 10) * 10;
		const result = await iaSearch({
			query: `date:[${decade} TO ${decade + 9}]`,
			pageSize: 20
		});
		return pickRandom(result.items, currentTrack.identifier);
	} catch {
		return null;
	}
}

async function iaFindRandom(): Promise<Track | null> {
	try {
		const result = await iaSearch({
			query: 'mediatype:audio',
			sort: 'downloads',
			pageSize: 100
		});
		return pickRandom(result.items);
	} catch {
		return null;
	}
}

// ---- FunkWhale strategies ----

async function fwFindNextInAlbum(currentTrack: Track): Promise<Track | null> {
	const info = parseFunkwhaleTrack(currentTrack);
	if (!info?.albumId || !info.instanceUrl) return null;
	try {
		const tracks = await getAlbumTracks(info.instanceUrl, info.albumId);
		return pickRandom(tracks, currentTrack.identifier);
	} catch {
		return null;
	}
}

async function fwFindSameArtist(currentTrack: Track): Promise<Track | null> {
	const info = parseFunkwhaleTrack(currentTrack);
	if (!info?.artistId || !info.instanceUrl) return null;
	try {
		const tracks = await searchByArtist(info.instanceUrl, info.artistId, currentTrack.identifier);
		return pickRandom(tracks);
	} catch {
		return null;
	}
}

async function fwFindSimilarGenre(currentTrack: Track): Promise<Track | null> {
	const info = parseFunkwhaleTrack(currentTrack);
	if (!info?.instanceUrl || !currentTrack.genre || currentTrack.genre.length === 0) return null;
	try {
		// Try each tag until we find results
		for (const tag of currentTrack.genre.slice(0, 3)) {
			const tracks = await searchByTag(info.instanceUrl, tag, currentTrack.identifier);
			const pick = pickRandom(tracks);
			if (pick) return pick;
		}
		return null;
	} catch {
		return null;
	}
}

async function fwFindRandom(currentTrack: Track): Promise<Track | null> {
	const info = parseFunkwhaleTrack(currentTrack);
	if (!info?.instanceUrl) return null;
	try {
		const tracks = await getRandomTracks(info.instanceUrl, 50);
		return pickRandom(tracks, currentTrack.identifier);
	} catch {
		return null;
	}
}

// ---- Strategy routing ----

/** Get the right strategy function based on source and rule */
function getStrategy(
	ruleId: string,
	isFW: boolean
): ((track: Track) => Promise<Track | null>) | null {
	if (isFW) {
		switch (ruleId) {
			case 'same-album': return fwFindNextInAlbum;
			case 'same-artist': return fwFindSameArtist;
			case 'similar-genre': return fwFindSimilarGenre;
			case 'same-collection': return () => Promise.resolve(null); // N/A for FunkWhale
			case 'same-decade': return () => Promise.resolve(null); // FW API doesn't support date range queries
			case 'random': return fwFindRandom;
			default: return null;
		}
	} else {
		switch (ruleId) {
			case 'same-album': return iaFindNextInAlbum;
			case 'same-artist': return iaFindSameArtist;
			case 'similar-genre': return iaFindSimilarGenre;
			case 'same-collection': return iaFindSameCollection;
			case 'same-decade': return iaFindSameDecade;
			case 'random': return () => iaFindRandom();
			default: return null;
		}
	}
}

/**
 * Get next track based on user-configured rules (source-aware)
 */
export async function getNextTrack(currentTrack: Track | null): Promise<Track | null> {
	if (!currentTrack) {
		return await iaFindRandom();
	}

	const state = get(autoplayStore);

	if (!state.enabled) {
		return null;
	}

	const isFW = isFunkwhaleTrack(currentTrack.identifier);
	const enabledRules = state.rules.filter((r) => r.enabled && r.weight > 0);

	if (enabledRules.length === 0) {
		return isFW ? await fwFindRandom(currentTrack) : await iaFindRandom();
	}

	// Calculate total weight
	const totalWeight = enabledRules.reduce((sum, rule) => sum + rule.weight, 0);

	// Try rules in weighted random order
	const shuffledRules = [...enabledRules].sort(() => Math.random() - 0.5);

	for (const rule of shuffledRules) {
		const probability = rule.weight / totalWeight;
		if (Math.random() < probability) {
			const strategy = getStrategy(rule.id, isFW);
			if (strategy) {
				try {
					const track = await strategy(currentTrack);
					if (track) {
						console.log(`[Autoplay] Found next track using rule: ${rule.name} (${isFW ? 'FW' : 'IA'})`);
						return track;
					}
				} catch (e) {
					console.warn(`[Autoplay] Strategy ${rule.id} failed:`, e);
					continue;
				}
			}
		}
	}

	// If weighted random failed, try sequentially
	for (const rule of enabledRules) {
		const strategy = getStrategy(rule.id, isFW);
		if (strategy) {
			try {
				const track = await strategy(currentTrack);
				if (track) {
					console.log(`[Autoplay] Found next track using fallback rule: ${rule.name} (${isFW ? 'FW' : 'IA'})`);
					return track;
				}
			} catch (e) {
				console.warn(`[Autoplay] Fallback strategy ${rule.id} failed:`, e);
			}
		}
	}

	// Ultimate fallback — stay on the same source
	return isFW ? await fwFindRandom(currentTrack) : await iaFindRandom();
}
