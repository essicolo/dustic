// Cover art lookup for tracks that don't carry their own thumbnail
// (primarily WebDAV files — Internet Archive and FunkWhale already ship
// artwork). Uses the public iTunes Search API: no auth, CORS-enabled,
// reasonable mainstream coverage.
//
// Results are cached in IndexedDB so we hit iTunes at most once per track
// (including "no result" outcomes — we cache those as `null` to avoid
// re-querying).

import { browser } from '$app/environment';
import type { Track } from '$lib/types';

const DB_NAME = 'dustic-thumbnails';
const DB_VERSION = 1;
const STORE = 'cache';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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
				req.result.createObjectStore(STORE, { keyPath: 'key' });
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => resolve(null);
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
		req.onsuccess = () => resolve((req.result as CacheRow | undefined) ?? null);
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
// fan out into N parallel iTunes hits.
const inflight = new Map<string, Promise<string | null>>();

/**
 * Resolve a cover-art URL for the given track, or null if none can be found.
 * Uses iTunes Search; cached results persist for {@link TTL_MS}.
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
		const url = await queryItunes(track);
		await writeCache(key, url);
		return url;
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

async function queryItunes(track: Track): Promise<string | null> {
	const term = buildTerm(track);
	if (!term) return null;
	try {
		const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
			term
		)}&entity=song&limit=1`;
		const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
		if (!res.ok) return null;
		const json = (await res.json()) as { results?: Array<{ artworkUrl100?: string }> };
		const raw = json.results?.[0]?.artworkUrl100;
		if (!raw) return null;
		// Upgrade artwork size from the default 100x100 to 600x600. iTunes' CDN
		// returns whatever resolution you ask for via this path swap.
		return raw.replace(/\/\d+x\d+bb\.(jpg|png)$/i, '/600x600bb.$1');
	} catch {
		return null;
	}
}

function buildTerm(track: Track): string {
	const parts: string[] = [];
	if (track.artist && track.artist !== 'Unknown Artist') parts.push(track.artist);
	if (track.album) parts.push(track.album);
	else if (track.title) parts.push(track.title);
	return parts.join(' ').trim();
}
