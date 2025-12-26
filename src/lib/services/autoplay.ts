// Autoplay service - Smart next track selection

import type { Track, AutoplayRule } from '$lib/types';
import { search as searchAPI } from './internetArchive';
import { autoplayStore } from '$lib/stores/autoplay';
import { get } from 'svelte/store';

/**
 * Find next track in the same album
 */
async function findNextInAlbum(currentTrack: Track): Promise<Track | null> {
	if (!currentTrack.album) return null;

	try {
		const result = await searchAPI({
			query: `creator:"${currentTrack.artist}" AND title:"${currentTrack.album}"`,
			pageSize: 20
		});

		// Filter out current track and return next one
		const otherTracks = result.items.filter((t) => t.identifier !== currentTrack.identifier);
		return otherTracks.length > 0 ? otherTracks[Math.floor(Math.random() * otherTracks.length)] : null;
	} catch {
		return null;
	}
}

/**
 * Find random track by the same artist
 */
async function findSameArtist(currentTrack: Track): Promise<Track | null> {
	if (!currentTrack.artist || currentTrack.artist === 'Unknown Artist') return null;

	try {
		const result = await searchAPI({
			query: `creator:"${currentTrack.artist}"`,
			pageSize: 20
		});

		const otherTracks = result.items.filter((t) => t.identifier !== currentTrack.identifier);
		return otherTracks.length > 0 ? otherTracks[Math.floor(Math.random() * otherTracks.length)] : null;
	} catch {
		return null;
	}
}

/**
 * Find track with similar genre tags
 */
async function findSimilarGenre(currentTrack: Track): Promise<Track | null> {
	if (!currentTrack.genre || currentTrack.genre.length === 0) return null;

	try {
		const genreQuery = currentTrack.genre
			.slice(0, 3)
			.map((g) => `subject:"${g}"`)
			.join(' OR ');

		const result = await searchAPI({
			query: genreQuery,
			pageSize: 20
		});

		const otherTracks = result.items.filter((t) => t.identifier !== currentTrack.identifier);
		return otherTracks.length > 0 ? otherTracks[Math.floor(Math.random() * otherTracks.length)] : null;
	} catch {
		return null;
	}
}

/**
 * Find random track from the same collection
 */
async function findSameCollection(currentTrack: Track): Promise<Track | null> {
	if (!currentTrack.collection || currentTrack.collection.length === 0) return null;

	try {
		const result = await searchAPI({
			query: `collection:${currentTrack.collection[0]}`,
			pageSize: 20
		});

		const otherTracks = result.items.filter((t) => t.identifier !== currentTrack.identifier);
		return otherTracks.length > 0 ? otherTracks[Math.floor(Math.random() * otherTracks.length)] : null;
	} catch {
		return null;
	}
}

/**
 * Find track from the same decade
 */
async function findSameDecade(currentTrack: Track): Promise<Track | null> {
	if (!currentTrack.date) return null;

	try {
		const year = parseInt(currentTrack.date.substring(0, 4));
		if (isNaN(year)) return null;

		const decade = Math.floor(year / 10) * 10;
		const result = await searchAPI({
			query: `date:[${decade} TO ${decade + 9}]`,
			pageSize: 20
		});

		const otherTracks = result.items.filter((t) => t.identifier !== currentTrack.identifier);
		return otherTracks.length > 0 ? otherTracks[Math.floor(Math.random() * otherTracks.length)] : null;
	} catch {
		return null;
	}
}

/**
 * Find random popular track
 */
async function findRandom(): Promise<Track | null> {
	try {
		const result = await searchAPI({
			query: 'mediatype:audio',
			sort: 'downloads',
			pageSize: 100
		});

		return result.items.length > 0
			? result.items[Math.floor(Math.random() * result.items.length)]
			: null;
	} catch {
		return null;
	}
}

// Strategy map
const strategies: Record<string, (track: Track) => Promise<Track | null>> = {
	'same-album': findNextInAlbum,
	'same-artist': findSameArtist,
	'similar-genre': findSimilarGenre,
	'same-collection': findSameCollection,
	'same-decade': findSameDecade,
	'random': findRandom
};

/**
 * Get next track based on user-configured rules
 */
export async function getNextTrack(currentTrack: Track | null): Promise<Track | null> {
	if (!currentTrack) {
		// No current track, just play something random
		return await findRandom();
	}

	const state = get(autoplayStore);

	if (!state.enabled) {
		return null;
	}

	const enabledRules = state.rules.filter((r) => r.enabled && r.weight > 0);

	if (enabledRules.length === 0) {
		// No rules enabled, fallback to random
		return await findRandom();
	}

	// Calculate total weight
	const totalWeight = enabledRules.reduce((sum, rule) => sum + rule.weight, 0);

	// Try rules in weighted random order
	const shuffledRules = [...enabledRules].sort(() => Math.random() - 0.5);

	for (const rule of shuffledRules) {
		// Probability based on weight
		const probability = rule.weight / totalWeight;
		if (Math.random() < probability) {
			const strategy = strategies[rule.id];
			if (strategy) {
				try {
					const track = await strategy(currentTrack);
					if (track) {
						console.log(`Found next track using rule: ${rule.name}`);
						return track;
					}
				} catch (e) {
					console.warn(`Strategy ${rule.id} failed:`, e);
					continue;
				}
			}
		}
	}

	// If all strategies failed, try them sequentially
	for (const rule of enabledRules) {
		const strategy = strategies[rule.id];
		if (strategy) {
			try {
				const track = await strategy(currentTrack);
				if (track) {
					console.log(`Found next track using fallback rule: ${rule.name}`);
					return track;
				}
			} catch (e) {
				console.warn(`Fallback strategy ${rule.id} failed:`, e);
			}
		}
	}

	// Ultimate fallback
	return await findRandom();
}
