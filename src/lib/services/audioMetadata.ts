// Embedded audio-tag reader for WebDAV tracks.
//
// Folder-based heuristics ("/Artist/Album/Track.mp3") are unreliable —
// every collection has its own conventions and many tracks land outside
// any predictable structure. The robust solution is to read the file's
// own metadata tags (ID3v2 for mp3, Vorbis comments for flac/ogg/opus,
// MP4 atoms for m4a) via a Range request and `music-metadata-browser`.
//
// We pull the first ~256KB of each audio file, which is enough for the
// tag block on every common format including embedded cover art. Results
// (and their pictures) are cached in IndexedDB keyed by track identifier,
// so each file is read at most once.

import { browser } from '$app/environment';
import type { WebDAVLibrary } from '$lib/types';
import { decryptValue } from './crypto';

const DB_NAME = 'dustic-audio-meta';
const DB_VERSION = 1;
const STORE = 'meta';
const TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year — file rarely changes
const HEAD_BYTES = 256 * 1024;

export interface AudioMetadata {
	artist?: string;
	album?: string;
	title?: string;
	albumArtist?: string;
	year?: number;
	trackNumber?: number;
	duration?: number;
	pictureUrl?: string; // Blob URL of embedded cover, if any
}

interface CacheRow {
	key: string;
	meta: Omit<AudioMetadata, 'pictureUrl'> & {
		pictureBytes?: Uint8Array;
		pictureMime?: string;
	};
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

async function writeCache(row: CacheRow): Promise<void> {
	const db = await openDb();
	if (!db) return;
	return new Promise((resolve) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(row);
		tx.oncomplete = () => resolve();
		tx.onerror = () => resolve();
	});
}

const inflight = new Map<string, Promise<AudioMetadata | null>>();
// Tracks live blob URLs for embedded covers so we can revoke them later
// if needed. We don't currently revoke (they outlive the page reasonably)
// but the registry exists for future cleanup if we add a "clear cache"
// settings action.
const livePictureUrls = new Set<string>();

/**
 * Read embedded audio metadata for a WebDAV track. Returns null if the
 * file can't be fetched or has no readable tags.
 *
 * `trackId` is the Dustic track identifier (used as cache key). `library`
 * + `path` describe where to fetch.
 */
export async function fetchAudioMetadata(
	trackId: string,
	library: WebDAVLibrary,
	path: string
): Promise<AudioMetadata | null> {
	if (!browser) return null;

	const cached = await readCache(trackId);
	if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
		return hydrate(cached);
	}

	if (inflight.has(trackId)) return inflight.get(trackId)!;
	const promise = doFetch(trackId, library, path);
	inflight.set(trackId, promise);
	try {
		return await promise;
	} finally {
		inflight.delete(trackId);
	}
}

function hydrate(row: CacheRow): AudioMetadata {
	const { pictureBytes, pictureMime, ...rest } = row.meta;
	let pictureUrl: string | undefined;
	if (pictureBytes && pictureMime) {
		const blob = new Blob([pictureBytes as BlobPart], { type: pictureMime });
		pictureUrl = URL.createObjectURL(blob);
		livePictureUrls.add(pictureUrl);
	}
	return { ...rest, pictureUrl };
}

async function doFetch(
	trackId: string,
	library: WebDAVLibrary,
	path: string
): Promise<AudioMetadata | null> {
	try {
		const buffer = await fetchHead(library, path);
		if (!buffer || buffer.byteLength < 32) return null;

		// music-metadata-browser is large; dynamic-import so the bundle only
		// pays the cost on pages that actually browse WebDAV folders.
		const { parseBuffer } = await import('music-metadata-browser');
		const parsed = await parseBuffer(new Uint8Array(buffer), undefined, {
			skipCovers: false,
			duration: false
		});
		const c = parsed.common ?? {};

		const picture = Array.isArray(c.picture) && c.picture.length > 0 ? c.picture[0] : undefined;
		const meta: CacheRow['meta'] = {
			artist: nonEmpty(c.artist),
			album: nonEmpty(c.album),
			title: nonEmpty(c.title),
			albumArtist: nonEmpty(c.albumartist),
			year: typeof c.year === 'number' ? c.year : undefined,
			trackNumber: typeof c.track?.no === 'number' ? c.track.no : undefined
		};
		if (picture && picture.data && picture.format) {
			meta.pictureBytes = new Uint8Array(picture.data);
			meta.pictureMime = picture.format;
		}

		await writeCache({ key: trackId, meta, fetchedAt: Date.now() });
		return hydrate({ key: trackId, meta, fetchedAt: Date.now() });
	} catch (err) {
		// Cache a tombstone so we don't keep retrying broken / un-tagged files.
		await writeCache({ key: trackId, meta: {}, fetchedAt: Date.now() });
		console.warn('[audioMeta] fetch failed for', path, err);
		return null;
	}
}

function nonEmpty(s: string | undefined): string | undefined {
	if (!s) return undefined;
	const t = s.trim();
	return t || undefined;
}

async function fetchHead(library: WebDAVLibrary, path: string): Promise<ArrayBuffer | null> {
	const base = library.url.replace(/\/+$/, '');
	const prefix = path.startsWith('/') ? path : `/${path}`;
	const encoded = prefix
		.split('/')
		.map((seg) => (seg ? encodeURIComponent(seg) : ''))
		.join('/');
	const targetUrl = `${base}${encoded}`;
	const password = await decryptValue(library.password);

	const res = await fetch('/api/webdav-proxy', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			url: targetUrl,
			method: 'GET',
			headers: {
				Authorization: 'Basic ' + utf8Btoa(`${library.username}:${password}`),
				Range: `bytes=0-${HEAD_BYTES - 1}`
			}
		})
	});
	if (!res.ok) return null;
	return await res.arrayBuffer();
}

function utf8Btoa(s: string): string {
	const bytes = new TextEncoder().encode(s);
	let bin = '';
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return btoa(bin);
}
