// Offline storage: audio bytes live in the Cache API, metadata in IndexedDB.
//
// The two stores are written separately, so they can drift apart: the
// browser may evict the cache under storage pressure while the IndexedDB row
// survives, or a crash can land between the two writes. `verifyIntegrity()`
// reconciles them so the UI never claims a track is available offline when
// its bytes are gone.

import type { Track } from '$lib/types';
import { browser } from '$app/environment';

const DB_NAME = 'dustic-offline';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';
export const OFFLINE_CACHE_NAME = 'dustic-audio-cache';

export interface OfflineTrack {
	track: Track;
	downloadedAt: number;
	fileSize?: number;
	mimeType?: string;
	/** Legacy field: older versions persisted a session blob URL here. Ignored. */
	blobUrl?: string;
}

export interface StorageInfo {
	/** Bytes of audio downloaded for offline use. */
	used: number;
	/** Browser storage quota for the whole app (0 if unknown). */
	quota: number;
	/** Everything the app stores (caches, IndexedDB, …), per the browser estimate. */
	appUsage: number;
	tracks: number;
	/** Whether the browser promised not to evict our data. null = API unavailable. */
	persisted: boolean | null;
}

const EXT_MIME: Record<string, string> = {
	mp3: 'audio/mpeg',
	ogg: 'audio/ogg',
	oga: 'audio/ogg',
	opus: 'audio/ogg',
	flac: 'audio/flac',
	m4a: 'audio/mp4',
	aac: 'audio/aac',
	wav: 'audio/wav',
	wma: 'audio/x-ms-wma'
};

/** Pick a usable audio MIME type; servers often answer application/octet-stream. */
export function resolveMimeType(contentType: string | null, filenameOrUrl: string): string {
	const ct = (contentType || '').split(';')[0].trim().toLowerCase();
	if (ct.startsWith('audio/') || ct.startsWith('video/ogg')) return ct;
	const ext = (filenameOrUrl.split('?')[0].split('.').pop() || '').toLowerCase();
	return EXT_MIME[ext] || 'audio/mpeg';
}

/** Identifier spellings that refer to the same track ("foo" ≡ "foo#0"). */
export function identifierVariants(identifier: string): string[] {
	if (identifier.endsWith('#0')) return [identifier, identifier.slice(0, -2)];
	if (!identifier.includes('#')) return [identifier, `${identifier}#0`];
	return [identifier];
}

function absoluteUrl(url: string): string {
	try {
		return new URL(url, browser ? location.origin : 'http://localhost').href;
	} catch {
		return url;
	}
}

async function readWithProgress(response: Response, onProgress?: (pct: number) => void): Promise<Blob> {
	const total = parseInt(response.headers.get('content-length') || '0', 10);
	const reader = response.body?.getReader();
	if (!reader) return response.blob();

	const chunks: Uint8Array[] = [];
	let received = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.length;
		if (onProgress && total) onProgress(Math.min(100, (received / total) * 100));
	}
	return new Blob(chunks as BlobPart[]);
}

/**
 * Fetch a remote audio file. Cross-origin servers (archive.org mirrors
 * especially) sometimes answer without CORS headers; in that case retry
 * through the same-origin proxy rather than failing the download.
 */
async function fetchAudio(url: string): Promise<Response> {
	const isCrossOrigin = /^https?:\/\//i.test(url) && new URL(url).origin !== location.origin;
	try {
		const response = await fetch(url);
		if (response.ok) return response;
		if (!isCrossOrigin) throw new Error(`Download failed: HTTP ${response.status}`);
	} catch (err) {
		if (!isCrossOrigin) throw err;
	}
	const proxied = await fetch(`/api/cors-proxy?url=${encodeURIComponent(url)}`);
	if (!proxied.ok) throw new Error(`Download failed: HTTP ${proxied.status}`);
	return proxied;
}

class OfflineStorage {
	private db: IDBDatabase | null = null;
	private initPromise: Promise<void> | null = null;
	/** Session blob URLs, keyed by stored identifier. Never persisted. */
	private blobUrls = new Map<string, string>();
	private persistRequested = false;

	async init(): Promise<void> {
		if (!browser || typeof indexedDB === 'undefined') return;
		if (this.db) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = new Promise<void>((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			request.onerror = () => {
				this.initPromise = null;
				reject(request.error);
			};
			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};
			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					const store = db.createObjectStore(STORE_NAME, { keyPath: 'track.identifier' });
					store.createIndex('downloadedAt', 'downloadedAt', { unique: false });
				}
			};
		});
		return this.initPromise;
	}

	/**
	 * Ask the browser to keep our storage out of automatic eviction. Without
	 * this, Safari in particular wipes Cache API data after a few weeks of
	 * not opening the site, silently destroying every download.
	 */
	async requestPersistence(): Promise<boolean | null> {
		if (!browser || !navigator.storage?.persist) return null;
		try {
			if (await navigator.storage.persisted()) return true;
			return await navigator.storage.persist();
		} catch {
			return null;
		}
	}

	async isPersisted(): Promise<boolean | null> {
		if (!browser || !navigator.storage?.persisted) return null;
		try {
			return await navigator.storage.persisted();
		} catch {
			return null;
		}
	}

	/**
	 * Download a track for offline use. Bytes go to the Cache API under the
	 * track's original streamUrl; metadata goes to IndexedDB last, so a track
	 * is only ever reported as offline once its audio is fully stored.
	 */
	async downloadTrack(track: Track, onProgress?: (progress: number) => void): Promise<void> {
		if (!browser) throw new Error('Cannot download in non-browser environment');
		if (!track.streamUrl || track.streamUrl.startsWith('blob:')) {
			throw new Error('Track has no downloadable URL');
		}

		if (!this.persistRequested) {
			this.persistRequested = true;
			void this.requestPersistence();
		}

		let blob: Blob;
		let mimeType: string;

		if (track.source === 'webdav') {
			// WebDAV tracks need to go through the authenticated proxy.
			const { decodeIdentifier, fetchTrackBlob, findLibrary } = await import('./webdavLibrary');
			const { settings } = await import('$lib/stores/settings');
			const decoded = decodeIdentifier(track.identifier);
			const library = decoded
				? findLibrary(settings.getWebDAVLibraries(), decoded.libraryId)
				: undefined;
			if (!decoded || !library) throw new Error('WebDAV library not found');
			blob = await fetchTrackBlob(library, decoded.path, onProgress);
			mimeType = resolveMimeType(blob.type, decoded.path);
		} else {
			const response = await fetchAudio(track.streamUrl);
			mimeType = resolveMimeType(response.headers.get('content-type'), track.filename || track.streamUrl);
			blob = await readWithProgress(response, onProgress);
		}

		if (blob.size === 0) throw new Error('Downloaded file is empty');
		const typed = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });

		const cache = await caches.open(OFFLINE_CACHE_NAME);
		await cache.put(
			track.streamUrl,
			new Response(typed, {
				headers: { 'Content-Type': mimeType, 'Content-Length': String(typed.size) }
			})
		);

		try {
			await this.saveTrack({
				track,
				downloadedAt: Date.now(),
				fileSize: typed.size,
				mimeType
			});
		} catch (err) {
			// Don't leave orphaned bytes behind if the metadata write fails.
			await cache.delete(track.streamUrl).catch(() => {});
			throw err;
		}

		// A previous session URL for this id (re-download) is now stale.
		this.revokeBlobUrl(track.identifier);
	}

	private async saveTrack(offlineTrack: OfflineTrack): Promise<void> {
		await this.init();
		if (!this.db) throw new Error('Database not initialized');

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
			transaction.objectStore(STORE_NAME).put(offlineTrack);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
		});
	}

	async getAllTracks(): Promise<OfflineTrack[]> {
		await this.init();
		if (!this.db) return [];

		return new Promise((resolve, reject) => {
			const request = this.db!.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).getAll();
			request.onsuccess = () => resolve(request.result || []);
			request.onerror = () => reject(request.error);
		});
	}

	private async getRecord(identifier: string): Promise<OfflineTrack | null> {
		await this.init();
		if (!this.db) return null;

		return new Promise((resolve, reject) => {
			const request = this.db!.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(identifier);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	}

	/** Look a track up under any of its equivalent identifier spellings. */
	async getTrack(identifier: string): Promise<OfflineTrack | null> {
		for (const id of identifierVariants(identifier)) {
			const record = await this.getRecord(id);
			if (record) return record;
		}
		return null;
	}

	async isDownloaded(identifier: string): Promise<boolean> {
		return (await this.getTrack(identifier)) !== null;
	}

	private revokeBlobUrl(identifier: string): void {
		const url = this.blobUrls.get(identifier);
		if (url) {
			URL.revokeObjectURL(url);
			this.blobUrls.delete(identifier);
		}
	}

	private async deleteRecord(identifier: string): Promise<void> {
		await this.init();
		if (!this.db) return;
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
			transaction.objectStore(STORE_NAME).delete(identifier);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
	}

	async deleteTrack(identifier: string): Promise<void> {
		const offlineTrack = await this.getTrack(identifier);
		if (!offlineTrack) return;
		const storedId = offlineTrack.track.identifier;

		const cache = await caches.open(OFFLINE_CACHE_NAME);
		await cache.delete(offlineTrack.track.streamUrl);
		this.revokeBlobUrl(storedId);
		await this.deleteRecord(storedId);
	}

	/**
	 * Drop metadata rows whose audio is no longer in the cache (evicted by the
	 * browser, or a download interrupted between the two writes). Returns the
	 * identifiers that were removed.
	 */
	async verifyIntegrity(): Promise<string[]> {
		if (!browser || typeof caches === 'undefined') return [];
		const records = await this.getAllTracks();
		if (records.length === 0) return [];

		const cache = await caches.open(OFFLINE_CACHE_NAME);
		const cachedUrls = new Set((await cache.keys()).map((r) => r.url));
		const removed: string[] = [];

		for (const record of records) {
			if (cachedUrls.has(absoluteUrl(record.track.streamUrl))) continue;
			// URL normalisation can differ subtly; confirm with a real lookup.
			if (await cache.match(record.track.streamUrl)) continue;
			await this.deleteRecord(record.track.identifier);
			this.revokeBlobUrl(record.track.identifier);
			removed.push(record.track.identifier);
		}
		return removed;
	}

	async getStorageInfo(): Promise<StorageInfo> {
		if (!browser) return { used: 0, quota: 0, appUsage: 0, tracks: 0, persisted: null };

		const tracks = await this.getAllTracks();
		const used = tracks.reduce((sum, t) => sum + (t.fileSize || 0), 0);
		let quota = 0;
		let appUsage = 0;
		if (navigator.storage?.estimate) {
			try {
				const estimate = await navigator.storage.estimate();
				quota = estimate.quota || 0;
				appUsage = estimate.usage || 0;
			} catch {
				// estimate() is best-effort
			}
		}
		return { used, quota, appUsage, tracks: tracks.length, persisted: await this.isPersisted() };
	}

	async clearAll(): Promise<void> {
		await this.init();
		for (const url of this.blobUrls.values()) URL.revokeObjectURL(url);
		this.blobUrls.clear();

		if (this.db) {
			await new Promise<void>((resolve, reject) => {
				const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
				transaction.objectStore(STORE_NAME).clear();
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error);
			});
		}
		await caches.delete(OFFLINE_CACHE_NAME);
	}

	/**
	 * Return the track with a playable blob: streamUrl when its audio is
	 * stored locally. Returns the stored metadata unchanged when the bytes are
	 * missing, and null when the track was never downloaded.
	 */
	async getOfflineTrack(identifier: string): Promise<Track | null> {
		const offlineTrack = await this.getTrack(identifier);
		if (!offlineTrack) return null;
		const storedId = offlineTrack.track.identifier;

		const existing = this.blobUrls.get(storedId);
		if (existing) return { ...offlineTrack.track, streamUrl: existing };

		try {
			const cache = await caches.open(OFFLINE_CACHE_NAME);
			const response = await cache.match(offlineTrack.track.streamUrl);
			if (response) {
				const raw = await response.blob();
				const type = offlineTrack.mimeType || raw.type || 'audio/mpeg';
				const blob = raw.type ? raw : new Blob([raw], { type });
				// Another caller may have raced us while we read the cache.
				const raced = this.blobUrls.get(storedId);
				if (raced) return { ...offlineTrack.track, streamUrl: raced };
				const url = URL.createObjectURL(blob);
				this.blobUrls.set(storedId, url);
				return { ...offlineTrack.track, streamUrl: url };
			}
		} catch (err) {
			console.error('Failed to read offline audio from cache', err);
		}

		return offlineTrack.track;
	}
}

export const offlineStorage = new OfflineStorage();

if (browser) {
	offlineStorage.init().catch((error) => {
		console.error('Failed to initialize offline storage:', error);
	});
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
	if (!bytes || bytes <= 0) return '0 B';

	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));

	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
