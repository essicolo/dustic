import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Track } from '$lib/types';

// Minimal in-memory Cache API: enough for put/match/delete/keys.
class MemoryCache {
	store = new Map<string, Response>();
	private key(req: RequestInfo | URL) {
		const url = typeof req === 'string' ? req : req instanceof URL ? req.href : req.url;
		return new URL(url, location.origin).href;
	}
	async put(req: RequestInfo | URL, res: Response) {
		this.store.set(this.key(req), res);
	}
	async match(req: RequestInfo | URL) {
		const r = this.store.get(this.key(req));
		return r ? r.clone() : undefined;
	}
	async delete(req: RequestInfo | URL) {
		return this.store.delete(this.key(req));
	}
	async keys() {
		return [...this.store.keys()].map((url) => new Request(url));
	}
}
const cacheStorage = new Map<string, MemoryCache>();
(globalThis as any).caches = {
	open: async (name: string) => {
		if (!cacheStorage.has(name)) cacheStorage.set(name, new MemoryCache());
		return cacheStorage.get(name)!;
	},
	delete: async (name: string) => cacheStorage.delete(name)
};

let urlCounter = 0;
URL.createObjectURL = vi.fn(() => `blob:test/${++urlCounter}`);
URL.revokeObjectURL = vi.fn();

const { offlineStorage, identifierVariants, resolveMimeType, OFFLINE_CACHE_NAME } = await import(
	'$lib/services/offlineStorage'
);

function track(id: string, url = `https://archive.org/serve/${id}/a.mp3`): Track {
	return { identifier: id, title: id, artist: 'x', streamUrl: url, filename: 'a.mp3' } as Track;
}

describe('offlineStorage', () => {
	beforeEach(async () => {
		await offlineStorage.clearAll();
		vi.restoreAllMocks();
	});

	it('stores audio and metadata, then serves a blob URL', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-type': 'audio/ogg' } })
		);
		await offlineStorage.downloadTrack(track('item1#0'));

		const all = await offlineStorage.getAllTracks();
		expect(all).toHaveLength(1);
		expect(all[0].fileSize).toBe(4);
		expect(all[0].mimeType).toBe('audio/ogg');

		const playable = await offlineStorage.getOfflineTrack('item1');
		expect(playable?.streamUrl.startsWith('blob:')).toBe(true);
		// Same session → same URL, no new blob per play.
		const again = await offlineStorage.getOfflineTrack('item1#0');
		expect(again?.streamUrl).toBe(playable?.streamUrl);
	});

	it('falls back to the CORS proxy when a cross-origin fetch fails', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockResolvedValueOnce(new Response(new Uint8Array([9, 9])));
		await offlineStorage.downloadTrack(track('item2'));
		expect(fetchMock.mock.calls[1][0]).toContain('/api/cors-proxy?url=');
		expect(await offlineStorage.isDownloaded('item2')).toBe(true);
	});

	it('refuses tracks without a real URL and empty bodies', async () => {
		await expect(offlineStorage.downloadTrack(track('x', 'blob:abc'))).rejects.toThrow();
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([])));
		await expect(offlineStorage.downloadTrack(track('empty'))).rejects.toThrow(/empty/);
		expect(await offlineStorage.isDownloaded('empty')).toBe(false);
	});

	it('verifyIntegrity drops metadata whose audio was evicted', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array([1])));
		await offlineStorage.downloadTrack(track('keep'));
		await offlineStorage.downloadTrack(track('gone'));
		const cache = await caches.open(OFFLINE_CACHE_NAME);
		await cache.delete(track('gone').streamUrl);

		const removed = await offlineStorage.verifyIntegrity();
		expect(removed).toEqual(['gone']);
		expect(await offlineStorage.isDownloaded('keep')).toBe(true);
		expect(await offlineStorage.isDownloaded('gone')).toBe(false);
	});

	it('deleteTrack removes both the bytes and the metadata', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([1])));
		const t = track('del#0');
		await offlineStorage.downloadTrack(t);
		await offlineStorage.deleteTrack('del');
		expect(await offlineStorage.isDownloaded('del#0')).toBe(false);
		const cache = await caches.open(OFFLINE_CACHE_NAME);
		expect(await cache.match(t.streamUrl)).toBeUndefined();
	});
});

describe('helpers', () => {
	it('identifierVariants treats foo and foo#0 as the same track', () => {
		expect(identifierVariants('foo')).toEqual(['foo', 'foo#0']);
		expect(identifierVariants('foo#0')).toEqual(['foo#0', 'foo']);
		expect(identifierVariants('foo#3')).toEqual(['foo#3']);
	});

	it('resolveMimeType prefers audio content-types, else the extension', () => {
		expect(resolveMimeType('audio/flac', 'x.mp3')).toBe('audio/flac');
		expect(resolveMimeType('application/octet-stream', '/a/b.flac')).toBe('audio/flac');
		expect(resolveMimeType(null, 'https://h/x.ogg?y=1')).toBe('audio/ogg');
		expect(resolveMimeType(null, 'noext')).toBe('audio/mpeg');
	});
});
