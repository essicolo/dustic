import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getThumbnailFor } from '$lib/services/thumbnails';
import type { Track } from '$lib/types';

function makeTrack(over: Partial<Track> = {}): Track {
	return {
		identifier: 'wd:lib:abc',
		filename: 'track.mp3',
		title: 'Helicon 1',
		artist: 'Mogwai',
		collection: ['koofr'],
		format: 'mp3',
		streamUrl: '/webdav-track/x',
		metadata: {},
		...over
	};
}

describe('getThumbnailFor', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		// Reset the IndexedDB cache by using a fresh in-memory shim through fake-indexeddb if available;
		// otherwise we rely on cache being empty per test run.
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('returns null when the track has no artist nor title', async () => {
		const url = await getThumbnailFor(makeTrack({ artist: '', title: '' }));
		expect(url).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns null for an HTTP error', async () => {
		fetchMock.mockResolvedValue({ ok: false });
		const url = await getThumbnailFor(makeTrack({ identifier: 'wd:lib:err' }));
		expect(url).toBeNull();
	});

	it('returns null when iTunes results are empty', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ results: [] })
		});
		const url = await getThumbnailFor(makeTrack({ identifier: 'wd:lib:empty' }));
		expect(url).toBeNull();
	});

	it('upgrades artwork URL from 100x100 to 600x600', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				results: [
					{ artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/cover/100x100bb.jpg' }
				]
			})
		});
		const url = await getThumbnailFor(makeTrack({ identifier: 'wd:lib:upgrade' }));
		expect(url).toBe('https://is1-ssl.mzstatic.com/image/thumb/cover/600x600bb.jpg');
	});

	it('does not refetch on a second call (in-flight dedupe + cache)', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				results: [{ artworkUrl100: 'https://x.example/100x100bb.jpg' }]
			})
		});
		const track = makeTrack({ identifier: 'wd:lib:dedupe' });
		const [a, b] = await Promise.all([getThumbnailFor(track), getThumbnailFor(track)]);
		expect(a).toBe(b);
		// Both calls share one in-flight fetch.
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
