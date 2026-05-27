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
import { unifiedGetTrack as getTrack } from './sources';
import { autoplayStore } from '$lib/stores/autoplay';
import { library } from '$lib/stores/library';
import {
	settings,
	resolveAutoplayContentTypes,
	resolveAutoplaySources,
	type AutoplayContentType,
	type AutoplaySource
} from '$lib/stores/settings';
import { CONTENT_TYPES, DEFAULT_FUNKWHALE_INSTANCES } from '$lib/utils/constants';
import { listFolder, buildTrack } from './webdavLibrary';
import type { WebDAVLibrary } from '$lib/types';
import { get } from 'svelte/store';

/**
 * Map an IA-style track to one of the three autoplay content types based
 * on its `collection` field. Returns null when no collection matches —
 * we treat that as "unknown / probably music" rather than dropping, since
 * a lot of legitimate music sits in catch-all collections we don't list.
 */
function classifyContentType(track: Track): AutoplayContentType | null {
	if (!track.collection || track.collection.length === 0) return null;
	for (const type of CONTENT_TYPES) {
		if (track.collection.some((c) => type.iaCollections.includes(c))) {
			return type.id as AutoplayContentType;
		}
	}
	return null;
}

/**
 * Honor the user's per-content-type toggles. FunkWhale is music-only by
 * design, so its tracks always pass. IA tracks get classified by their
 * collection; unclassified items are allowed through (most music falls
 * here — the alternative is filtering out ~half of IA's audio corpus).
 */
function isAutoplayAllowed(track: Track): boolean {
	if (isFunkwhaleTrack(track.identifier)) return true;
	const type = classifyContentType(track);
	if (!type) return true; // unknown → assume music-ish, let through
	const allowed = resolveAutoplayContentTypes(get(settings));
	return allowed[type] === true;
}

/** Pick a random item from an array, excluding identifiers AND blocked content types */
function pickRandom(tracks: Track[], excludeIds: Set<string> | string = new Set()): Track | null {
	const excludeSet = typeof excludeIds === 'string' ? new Set([excludeIds]) : excludeIds;
	const filtered = tracks.filter((t) => !excludeSet.has(t.identifier) && isAutoplayAllowed(t));
	return filtered.length > 0 ? filtered[Math.floor(Math.random() * filtered.length)] : null;
}

/**
 * Weighted random permutation. The previous implementation rolled each
 * rule's `weight/totalWeight` probability independently in shuffled
 * order, which warps the distribution badly: a rule at weight 10 (out of
 * 100) only fires when every earlier rule's independent roll missed —
 * effective probability collapses to a small fraction of the intended
 * 10%. This cumulative variant keeps the original ratios intact and
 * still yields a full order so we can fall through if a strategy
 * returns null.
 */
function weightedShuffle<T extends { weight: number }>(items: T[]): T[] {
	const remaining = [...items];
	const order: T[] = [];
	while (remaining.length > 0) {
		const total = remaining.reduce((s, r) => s + r.weight, 0);
		if (total <= 0) {
			// All remaining weights are zero — append in their existing order.
			order.push(...remaining);
			break;
		}
		let r = Math.random() * total;
		let pickedIdx = remaining.length - 1;
		for (let i = 0; i < remaining.length; i++) {
			r -= remaining[i].weight;
			if (r < 0) {
				pickedIdx = i;
				break;
			}
		}
		order.push(remaining[pickedIdx]);
		remaining.splice(pickedIdx, 1);
	}
	return order;
}

// Exported only for unit tests — distribution correctness is the kind of
// thing that silently regresses, so it gets its own coverage.
export const __test = { weightedShuffle, classifyContentType, isAutoplayAllowed };

// Tracks already tried by autoplay this session, to avoid repeating
const autoplayTriedIds = new Set<string>();

// ---- Internet Archive strategies ----

async function iaFindNextInAlbum(currentTrack: Track): Promise<Track | null> {
	if (!currentTrack.album) return null;
	try {
		const result = await iaSearch({
			query: `creator:"${currentTrack.artist}" AND title:"${currentTrack.album}"`,
			pageSize: 20
		});
		return pickRandom(result.items, autoplayTriedIds);
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
		return pickRandom(result.items, autoplayTriedIds);
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
		return pickRandom(result.items, autoplayTriedIds);
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
		return pickRandom(result.items, autoplayTriedIds);
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
		return pickRandom(result.items, autoplayTriedIds);
	} catch {
		return null;
	}
}

async function iaFindRandom(): Promise<Track | null> {
	try {
		// Build a positive collection filter from the user's enabled content
		// types so the underlying query never even surfaces blocked items.
		// We deliberately drop the old `sort: 'downloads'` — on Internet
		// Archive the most-downloaded audio is heavily talk/podcast and
		// politically skewed, which is exactly how the user kept ending up
		// in conspiracy podcasts.
		const allowed = resolveAutoplayContentTypes(get(settings));
		const collections: string[] = [];
		for (const ct of CONTENT_TYPES) {
			if (allowed[ct.id as AutoplayContentType]) collections.push(...ct.iaCollections);
		}
		if (collections.length === 0) return null; // shouldn't happen — settings setter enforces ≥1

		// Randomize the page so we don't always hit the same first-page
		// results. IA caps the practical depth; 20 gives us ~1000 unique
		// items across the chosen collections.
		const page = Math.floor(Math.random() * 20) + 1;
		const result = await iaSearch({
			query: 'mediatype:audio',
			collection: collections,
			page,
			pageSize: 50
		});
		return pickRandom(result.items, autoplayTriedIds);
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
		return pickRandom(tracks, autoplayTriedIds);
	} catch {
		return null;
	}
}

async function fwFindSameArtist(currentTrack: Track): Promise<Track | null> {
	const info = parseFunkwhaleTrack(currentTrack);
	if (!info?.artistId || !info.instanceUrl) return null;
	try {
		const tracks = await searchByArtist(info.instanceUrl, info.artistId, currentTrack.identifier);
		return pickRandom(tracks, autoplayTriedIds);
	} catch {
		return null;
	}
}

async function fwFindSimilarGenre(currentTrack: Track): Promise<Track | null> {
	const info = parseFunkwhaleTrack(currentTrack);
	if (!info?.instanceUrl || !currentTrack.genre || currentTrack.genre.length === 0) return null;
	try {
		for (const tag of currentTrack.genre.slice(0, 3)) {
			const tracks = await searchByTag(info.instanceUrl, tag, currentTrack.identifier);
			const pick = pickRandom(tracks, autoplayTriedIds);
			if (pick) return pick;
		}
		return null;
	} catch {
		return null;
	}
}

// Cross-source picker variants: these don't need a currentTrack and are
// what the "Random Discovery" rule and the ultimate fallback use to walk
// across IA / FunkWhale / WebDAV honoring the source toggles.
//
// (Note: the older `fwFindRandom(currentTrack)` was removed when the
// random rule moved cross-source — there's no reason to require an
// already-FW track just to surface a random FW one.)

async function fwFindRandomAny(): Promise<Track | null> {
	const instances = (get(settings).funkwhaleInstances ?? DEFAULT_FUNKWHALE_INSTANCES).filter(
		(i) => i.enabled
	);
	if (instances.length === 0) return null;
	for (const inst of [...instances].sort(() => Math.random() - 0.5)) {
		try {
			const tracks = await getRandomTracks(inst.url, 50);
			const pick = pickRandom(tracks, autoplayTriedIds);
			if (pick) return pick;
		} catch {
			// Skip dead instances, try next
		}
	}
	return null;
}

const WD_WALK_MAX_DEPTH = 4;
// Probability we STOP and play a file at the current depth (when both
// files and folders are present). Without this we'd always descend until
// the tree ends, biasing toward deeply-nested artists. 0.35 gives a
// reasonable spread across depths in real catalogs.
const WD_DESCEND_VS_STOP = 0.35;

function libRelative(library: WebDAVLibrary, absPath: string): string {
	const root = (library.rootPath || '/').replace(/\/+$/, '') || '/';
	if (root === '/') return absPath;
	if (absPath.startsWith(root)) return absPath.slice(root.length) || '/';
	return absPath;
}

async function wdWalkRandom(
	library: WebDAVLibrary,
	relPath: string,
	depth: number
): Promise<Track | null> {
	if (depth > WD_WALK_MAX_DEPTH) return null;
	let entries;
	try {
		entries = await listFolder(library, relPath);
	} catch {
		return null;
	}
	if (entries.length === 0) return null;
	const files = entries.filter((e) => e.type === 'file');
	const folders = entries.filter((e) => e.type === 'folder');

	// If files exist and we have no folders OR we randomly decide to stop:
	if (files.length > 0 && (folders.length === 0 || Math.random() < WD_DESCEND_VS_STOP)) {
		const pick = files[Math.floor(Math.random() * files.length)];
		const track = buildTrack(library, pick);
		if (!autoplayTriedIds.has(track.identifier) && isAutoplayAllowed(track)) return track;
	}
	// Otherwise descend through folders in random order until one yields a track.
	for (const folder of [...folders].sort(() => Math.random() - 0.5)) {
		const child = await wdWalkRandom(library, libRelative(library, folder.path), depth + 1);
		if (child) return child;
	}
	return null;
}

async function wdFindRandom(): Promise<Track | null> {
	const libs = (get(settings).webdavLibraries ?? []).filter((l) => l.enabled !== false);
	if (libs.length === 0) return null;
	for (const lib of [...libs].sort(() => Math.random() - 0.5)) {
		const track = await wdWalkRandom(lib, '/', 0);
		if (track) return track;
	}
	return null;
}

/**
 * Source-agnostic discovery: rolls across IA / FunkWhale / WebDAV
 * according to the user's source toggles, skipping sources with no
 * underlying configuration. Used by the "Random Discovery" rule and as
 * the ultimate fallback when per-source strategies exhaust.
 */
async function findRandomAcrossSources(): Promise<Track | null> {
	const s = get(settings);
	const sources = resolveAutoplaySources(s);
	const candidates: AutoplaySource[] = [];
	if (sources.ia && s.iaEnabled !== false) candidates.push('ia');
	if (
		sources.funkwhale &&
		(s.funkwhaleInstances ?? DEFAULT_FUNKWHALE_INSTANCES).some((i) => i.enabled)
	) {
		candidates.push('funkwhale');
	}
	if (sources.webdav && (s.webdavLibraries ?? []).some((l) => l.enabled !== false)) {
		candidates.push('webdav');
	}
	if (candidates.length === 0) return null;

	for (const src of candidates.sort(() => Math.random() - 0.5)) {
		const track =
			src === 'ia'
				? await iaFindRandom()
				: src === 'funkwhale'
					? await fwFindRandomAny()
					: await wdFindRandom();
		if (track) return track;
	}
	return null;
}

// ---- From Favorites strategy (source-agnostic) ----

async function findFromFavorites(): Promise<Track | null> {
	// "Opt-out" used to be a separate toggle in settings; it's now
	// covered by the per-rule weight slider in the autoplay editor —
	// setting "From Favorites" to weight 0 (or disabling the rule)
	// already short-circuits this strategy through `enabledRules`.
	const libraryState = get(library);
	const favorites = libraryState.favorites;
	if (favorites.length === 0) return null;

	// Pick favorites not yet tried, then keep trying until we find one
	// whose content type is allowed. We mark blocked picks as tried so the
	// retry loop doesn't keep landing on the same item — the user had
	// favorited podcasts that without this would still be served forever.
	const untried = favorites.filter((f) => !autoplayTriedIds.has(f.id));
	const candidates = [...untried].sort(() => Math.random() - 0.5);
	for (const picked of candidates) {
		try {
			const track = await getTrack(picked.id);
			if (!track) continue;
			if (!isAutoplayAllowed(track)) {
				autoplayTriedIds.add(picked.id);
				autoplayTriedIds.add(track.identifier);
				continue;
			}
			if (!autoplayTriedIds.has(track.identifier)) return track;
		} catch {
			// Ignore fetch errors, try the next candidate.
		}
	}
	return null;
}

// ---- Strategy routing ----

type TrackSourceId = 'ia' | 'fw' | 'wd';

function detectSource(identifier: string): TrackSourceId {
	if (identifier.startsWith('wd:')) return 'wd';
	if (isFunkwhaleTrack(identifier)) return 'fw';
	return 'ia';
}

/** Get the right strategy function based on source and rule */
function getStrategy(
	ruleId: string,
	source: TrackSourceId
): ((track: Track) => Promise<Track | null>) | null {
	// Source-agnostic strategies
	if (ruleId === 'from-favorites') return () => findFromFavorites();
	// "Random Discovery" rolls across every enabled source — that's how
	// autoplay can transition from a WebDAV track into FunkWhale music,
	// or from IA into the user's library.
	if (ruleId === 'random') return () => findRandomAcrossSources();

	if (source === 'fw') {
		switch (ruleId) {
			case 'same-album': return fwFindNextInAlbum;
			case 'same-artist': return fwFindSameArtist;
			case 'similar-genre': return fwFindSimilarGenre;
			case 'same-collection': return () => Promise.resolve(null); // N/A for FunkWhale
			case 'same-decade': return () => Promise.resolve(null); // FW API doesn't support date range queries
			default: return null;
		}
	}
	if (source === 'ia') {
		switch (ruleId) {
			case 'same-album': return iaFindNextInAlbum;
			case 'same-artist': return iaFindSameArtist;
			case 'similar-genre': return iaFindSimilarGenre;
			case 'same-collection': return iaFindSameCollection;
			case 'same-decade': return iaFindSameDecade;
			default: return null;
		}
	}
	// source === 'wd' — WebDAV has no search APIs, so per-track "more like
	// this" strategies don't apply. WebDAV tracks rely on from-favorites
	// and random (which can transition them out of WebDAV too).
	return null;
}

/**
 * Get next track based on user-configured rules (source-aware)
 */
export async function getNextTrack(currentTrack: Track | null): Promise<Track | null> {
	if (!currentTrack) {
		return await findRandomAcrossSources();
	}

	const state = get(autoplayStore);

	if (!state.enabled) {
		return null;
	}

	const source = detectSource(currentTrack.identifier);
	const enabledRules = state.rules.filter((r) => r.enabled && r.weight > 0);

	if (enabledRules.length === 0) {
		return await findRandomAcrossSources();
	}

	// Add current track to tried set
	autoplayTriedIds.add(currentTrack.identifier);

	// Prevent the tried set from growing unbounded
	if (autoplayTriedIds.size > 200) {
		const entries = [...autoplayTriedIds];
		autoplayTriedIds.clear();
		// Keep the most recent 50
		entries.slice(-50).forEach((id) => autoplayTriedIds.add(id));
	}

	// Walk rules in proper weighted-random order. weightedShuffle produces
	// a full permutation, so if a strategy returns null we keep trying
	// the next-most-likely rule rather than falling back to plain
	// sequential. Each successful candidate is run through
	// isAutoplayAllowed in case the source list slipped a podcast past
	// pickRandom (e.g. iaFindNextInAlbum on a podcast → more episodes).
	for (const rule of weightedShuffle(enabledRules)) {
		const strategy = getStrategy(rule.id, source);
		if (!strategy) continue;
		try {
			const track = await strategy(currentTrack);
			if (track && isAutoplayAllowed(track)) {
				autoplayTriedIds.add(track.identifier);
				console.log(
					`[Autoplay] Found next track using rule: ${rule.name} (source=${source})`
				);
				return track;
			}
			if (track) {
				// Strategy returned something but it's a blocked content type.
				// Mark tried so the inevitable retry doesn't land on it again.
				autoplayTriedIds.add(track.identifier);
			}
		} catch (e) {
			console.warn(`[Autoplay] Strategy ${rule.id} failed:`, e);
		}
	}

	// Ultimate fallback — cross-source random, honoring the user's source
	// AND content-type toggles. Replaces the prior "stay on the same
	// source" fallback so a WebDAV folder doesn't dead-end into IA.
	return await findRandomAcrossSources();
}
