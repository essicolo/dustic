// Cache-behavior tests for thumbnails — exercises the real IndexedDB path
// via fake-indexeddb. The plain thumbnails.test.ts runs in jsdom with no
// IndexedDB, so it bypasses the cache layer entirely and can't catch
// regressions like "stale `null` from a prior CORS-failed run is served
// forever". Each test ESM-imports the module fresh so module-level state
// (dbPromise, inflight) doesn't leak between cases.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Track } from '$lib/types';

function makeTrack(over: Partial<Track> = {}): Track {
	return {
		identifier: 'wd:lib:cache',
		filename: 'track.mp3',
		title: 'Speak to Me',
		artist: 'Pink Floyd',
		album: 'The Dark Side of the Moon',
		collection: ['koofr'],
		format: 'mp3',
		streamUrl: '/webdav-track/x',
		metadata: {},
		...over
	};
}

async function importFresh() {
	vi.resetModules();
	// Force a brand-new IndexedDB instance per test so the singleton
	// dbPromise in the module sees an empty store.
	(globalThis as any).indexedDB = new IDBFactory();
	return await import('$lib/services/thumbnails');
}

describe('getThumbnailFor — cache behavior', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('caches a successful cover URL and reuses it on the next call', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ data: [{ cover_xl: 'https://cdn.example/cover.jpg' }] })
		});
		const { getThumbnailFor } = await importFresh();
		const first = await getThumbnailFor(makeTrack());
		const second = await getThumbnailFor(makeTrack());
		expect(first).toBe('https://cdn.example/cover.jpg');
		expect(second).toBe('https://cdn.example/cover.jpg');
		// Cache hit on the second call — no second Deezer fetch.
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('caches a null outcome so we do not hammer Deezer for unmatched tracks', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ data: [] })
		});
		const { getThumbnailFor } = await importFresh();
		const first = await getThumbnailFor(makeTrack({ identifier: 'wd:lib:miss' }));
		const second = await getThumbnailFor(makeTrack({ identifier: 'wd:lib:miss' }));
		expect(first).toBeNull();
		expect(second).toBeNull();
		// Track-search fallback fires too when the album path returns empty,
		// so the first call burns up to two fetches; the SECOND call must
		// hit cache only.
		const firstCallCount = fetchMock.mock.calls.length;
		expect(firstCallCount).toBeGreaterThanOrEqual(1);
		// After the second call, no additional fetch should have fired.
		expect(fetchMock).toHaveBeenCalledTimes(firstCallCount);
	});

	it('does NOT cache transient failures (would otherwise poison the cache for 30 days)', async () => {
		// First call: simulate a network/CORS/parse failure. With the old
		// "swallow then writeCache(null)" pattern, this poisoned the cache
		// — a subsequent fix would be invisible until the TTL elapsed.
		fetchMock
			.mockRejectedValueOnce(new Error('fetch blew up'))
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: [{ cover_xl: 'https://x.example/recovered.jpg' }] })
			});

		const { getThumbnailFor } = await importFresh();
		const first = await getThumbnailFor(makeTrack({ identifier: 'wd:lib:transient' }));
		const second = await getThumbnailFor(makeTrack({ identifier: 'wd:lib:transient' }));
		// First call returns null (failure) but does NOT cache it.
		expect(first).toBeNull();
		// Second call retries and recovers.
		expect(second).toBe('https://x.example/recovered.jpg');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('ignores rows written before SCHEMA_EPOCH and refetches them', async () => {
		// Reset modules so thumbnails.ts re-runs against the fresh IDB we
		// seed below (otherwise it reuses the cached dbPromise from prior
		// tests, which points at a different IDBFactory).
		vi.resetModules();
		(globalThis as any).indexedDB = new IDBFactory();
		// Seed a pre-epoch null row directly into IDB, simulating the
		// CORS-failed Deezer cache from earlier today.
		const seedDb = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open('dustic-thumbnails', 1);
			req.onupgradeneeded = () => req.result.createObjectStore('cache', { keyPath: 'key' });
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		await new Promise<void>((resolve) => {
			const tx = seedDb.transaction('cache', 'readwrite');
			tx.objectStore('cache').put({
				key: 'a:pink floyd|al:the dark side of the moon',
				url: null,
				fetchedAt: 1, // ancient — well before any plausible SCHEMA_EPOCH
				} as { key: string; url: string | null; fetchedAt: number });
			tx.oncomplete = () => resolve();
		});
		seedDb.close();

		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ data: [{ cover_xl: 'https://cdn.example/fresh.jpg' }] })
		});

		// Now import the module — its readCache should treat the stale
		// pre-epoch null as a miss and re-query Deezer, picking up the
		// fresh cover.
		const { getThumbnailFor } = await import('$lib/services/thumbnails');
		const url = await getThumbnailFor(makeTrack());
		expect(url).toBe('https://cdn.example/fresh.jpg');
		expect(fetchMock).toHaveBeenCalled();
	});
});
