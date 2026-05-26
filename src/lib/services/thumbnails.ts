// Cover art lookup for tracks that don't carry their own thumbnail
// (primarily WebDAV files — Internet Archive and FunkWhale already ship
// artwork). Uses the public Deezer API: no auth, CORS-enabled, and its
// fielded search (`artist:"X" album:"Y"`) returns far more reliable
// matches than iTunes Search did for non-Anglo / catalog-edge releases.
//
// Results are cached in IndexedDB so we hit Deezer at most once per
// (artist+album) or (artist+title) — including "no result" outcomes,
// cached as `null` to avoid re-querying.

import { browser } from '$app/environment';
import type { Track } from '$lib/types';

const DB_NAME = 'dustic-thumbnails';
const DB_VERSION = 1;
const STORE = 'cache';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Schema epoch: cache entries written before this timestamp are treated
// as misses and refetched. Bump this constant to invalidate every cached
// cover. Preferable to IDB version migrations because it survives the
// common dev-mode footgun where an HMR-stranded connection blocks the
// versionchange transaction, leaving the user permanently on the old
// cache. History:
//   2026-05-26 — invalidates the iTunes era (Lil Wayne for Pink Floyd…)
//                and the first Deezer rollout that cached "no cover"
//                from CORS-failed requests.
const SCHEMA_EPOCH = 1779820988594; // 2026-05-26T18:43:08Z — must sit
// after every previous failed write in this session: the CORS-failed
// rollout (~17:25Z), the gzip-confused proxy responses (~18:10Z), and any
// nulls written while audioMeta was still tombstoning (~18:30Z). After
// this refactor, failures don't get cached at all — but historical bad
// rows still need this epoch to be evicted.

interface CacheRow {
	key: string;
	url: string | null;
	fetchedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
	if (!browser || typeof indexedDB === 'undefined') return Promise.resolve(null);
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve) => {
		try {
			const req = indexedDB.open(DB_NAME, DB_VERSION);
			req.onupgradeneeded = () => {
				if (!req.result.objectStoreNames.contains(STORE)) {
					req.result.createObjectStore(STORE, { keyPath: 'key' });
				}
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => resolve(null);
			// If a previous tab/HMR connection is still holding the DB open
			// we'd otherwise hang. Resolve to null and fall back to a no-op
			// cache rather than blocking the page.
			req.onblocked = () => resolve(null);
		} catch {
			resolve(null);
		}
	});
	return dbPromise;
}

async function readCache(key: string): Promise<CacheRow | null> {
	const db = await openDb();
	if (!db) return null;
	return new Promise((resolve) => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).get(key);
		req.onsuccess = () => {
			const row = (req.result as CacheRow | undefined) ?? null;
			// Treat pre-epoch rows as misses (see SCHEMA_EPOCH).
			if (row && row.fetchedAt < SCHEMA_EPOCH) {
				resolve(null);
				return;
			}
			resolve(row);
		};
		req.onerror = () => resolve(null);
	});
}

async function writeCache(key: string, url: string | null): Promise<void> {
	const db = await openDb();
	if (!db) return;
	return new Promise((resolve) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put({ key, url, fetchedAt: Date.now() } as CacheRow);
		tx.oncomplete = () => resolve();
		tx.onerror = () => resolve();
	});
}

// In-flight requests deduper so a grid of tiles for the same album doesn't
// fan out into N parallel Deezer hits.
const inflight = new Map<string, Promise<string | null>>();

/**
 * Resolve a cover-art URL for the given track, or null if none can be found.
 * Uses Deezer Search; cached results persist for {@link TTL_MS}.
 */
export async function getThumbnailFor(track: Track): Promise<string | null> {
	if (!browser) return null;

	const key = makeKey(track);
	if (!key) return null;

	const cached = await readCache(key);
	if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
		return cached.url;
	}

	if (inflight.has(key)) return inflight.get(key)!;

	const promise = (async () => {
		try {
			const url = await queryDeezer(track);
			// Only cache real outcomes (a URL or a genuine Deezer "no match").
			// Network/CORS/parse failures throw — we skip the writeCache so
			// the next render re-queries instead of being stuck on a stale
			// `null` for 30 days when a bug or outage is later fixed.
			await writeCache(key, url);
			return url;
		} catch {
			return null;
		}
	})();
	inflight.set(key, promise);
	try {
		return await promise;
	} finally {
		inflight.delete(key);
	}
}

function makeKey(track: Track): string | null {
	// Prefer artist+album for shared-album dedup, fall back to artist+title.
	const artist = (track.artist || '').trim().toLowerCase();
	const album = (track.album || '').trim().toLowerCase();
	const title = (track.title || '').trim().toLowerCase();
	if (artist && album) return `a:${artist}|al:${album}`;
	if (artist && title) return `a:${artist}|t:${title}`;
	if (title) return `t:${title}`;
	return null;
}

interface DeezerAlbumHit {
	cover_xl?: string;
	cover_big?: string;
	cover_medium?: string;
}
interface DeezerTrackHit {
	album?: DeezerAlbumHit;
}

// Returns a cover URL on a hit, null on a genuine Deezer "no match".
// THROWS on network/CORS/parse errors — caller in getThumbnailFor
// distinguishes the two so transient failures don't poison the cache.
async function queryDeezer(track: Track): Promise<string | null> {
	const artist = cleanForSearch(track.artist);
	const album = cleanForSearch(track.album);
	const title = cleanForSearch(track.title);

	// Mirror buildTerm's old guardrails: never query on a single weak signal
	// ("Lyra" alone returns thousands of unrelated hits). Require artist
	// paired with album or title, or album+title for compilation cases.
	const hasAlbumPath = artist && album;
	const hasTrackPath = artist && title;
	const hasFallbackAlbumPath = album && title && album !== title;
	if (!hasAlbumPath && !hasTrackPath && !hasFallbackAlbumPath) return null;

	// Album search — most precise when we have artist + album.
	if (hasAlbumPath) {
		const q = `artist:"${escapeDeezer(artist)}" album:"${escapeDeezer(album)}"`;
		const cover = await deezerAlbumCover(q);
		if (cover) return cover;
	}
	// Track search — when we have title but no album.
	if (hasTrackPath) {
		const q = `artist:"${escapeDeezer(artist)}" track:"${escapeDeezer(title)}"`;
		const cover = await deezerTrackCover(q);
		if (cover) return cover;
	}
	// Compilation/folder-as-album fallback: search the album name and
	// hope Deezer's relevance ranking picks the right release.
	if (!hasAlbumPath && hasFallbackAlbumPath) {
		const q = `album:"${escapeDeezer(album)}" track:"${escapeDeezer(title)}"`;
		const cover = await deezerTrackCover(q);
		if (cover) return cover;
	}
	return null;
}

// Deezer's public API does NOT serve CORS headers, so the browser refuses
// the response (status 200 but no Access-Control-Allow-Origin). Route the
// JSON request through our same-origin /api/cors-proxy, which has
// api.deezer.com on its allowlist. The cover image URLs themselves come
// straight from Deezer's CDN — <img> tags don't enforce CORS by default,
// so those load directly without proxying.
function deezerUrl(path: string, q: string): string {
	const target = `https://api.deezer.com/${path}?q=${encodeURIComponent(q)}&limit=1`;
	return `/api/cors-proxy?url=${encodeURIComponent(target)}`;
}

// Both helpers throw on transport / parse failure (so getThumbnailFor
// skips caching) and return null only for a clean "data: []" from Deezer.
async function deezerAlbumCover(q: string): Promise<string | null> {
	const res = await fetch(deezerUrl('search/album', q), {
		signal: AbortSignal.timeout(6000)
	});
	if (!res.ok) throw new Error(`Deezer album search HTTP ${res.status}`);
	const json = (await res.json()) as { data?: DeezerAlbumHit[] };
	return pickCover(json.data?.[0]);
}

async function deezerTrackCover(q: string): Promise<string | null> {
	const res = await fetch(deezerUrl('search/track', q), {
		signal: AbortSignal.timeout(6000)
	});
	if (!res.ok) throw new Error(`Deezer track search HTTP ${res.status}`);
	const json = (await res.json()) as { data?: DeezerTrackHit[] };
	return pickCover(json.data?.[0]?.album);
}

function pickCover(hit: DeezerAlbumHit | undefined): string | null {
	if (!hit) return null;
	const url = hit.cover_xl || hit.cover_big || hit.cover_medium;
	if (!url) return null;
	// Deezer's "no cover" placeholder has an empty image id in the path
	// (`images/cover//...`). Treat that as a miss so we don't display the
	// generic blank tile.
	if (/\/cover\/\/\d+x\d+/.test(url)) return null;
	return url;
}

// Deezer's fielded search uses `field:"value"` syntax. Strip characters
// that would break the syntax or change its meaning.
function escapeDeezer(s: string): string {
	return s.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Strings users have actually entered as "metadata" but mean nothing —
// we treat them as missing so we don't query Deezer with garbage.
const PLACEHOLDER_VALUES = /^(unknown( artist| album)?|various( artists)?|untitled|n\/a|no album)$/i;

// Trailing parenthesized/bracketed groups that describe a release variant
// rather than the album itself. They confuse Deezer's matcher because the
// catalog entry rarely carries these suffixes verbatim.
//   "The Dark Side of the Moon (Explicit)" → "The Dark Side of the Moon"
//   "Abbey Road (2019 Remaster)"            → "Abbey Road"
const VARIANT_SUFFIX_RE =
	/\s*[([][^()[\]]*(?:explicit|remaster(?:ed)?|deluxe|edition|version|bonus|anniversary|expanded|reissue|mono|stereo)[^()[\]]*[)\]]\s*$/i;

function cleanForSearch(value: string | undefined | null): string {
	if (!value) return '';
	let v = value.trim();
	if (!v || PLACEHOLDER_VALUES.test(v)) return '';
	// Strip leading track numbers ("01. Speak to Me" → "Speak to Me").
	v = v.replace(/^\s*\d{1,3}\s*[-_.)\s]\s*/, '');
	// Peel off variant suffixes — repeat in case of nested tags like
	// "Foo (Deluxe Edition) [Remastered]".
	let prev: string;
	do {
		prev = v;
		v = v.replace(VARIANT_SUFFIX_RE, '').trim();
	} while (v !== prev);
	return v;
}
