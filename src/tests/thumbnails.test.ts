import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getThumbnailFor } from '$lib/services/thumbnails';
import type { Track } from '$lib/types';

function makeTrack(over: Partial<Track> = {}): Track {
	return {
		identifier: 'wd:lib:abc',
		filename: 'track.mp3',
		title: 'Helicon 1',
		artist: 'Mogwai',
		album: 'Ten Rapid',
		collection: ['koofr'],
		format: 'mp3',
		streamUrl: '/webdav-track/x',
		metadata: {},
		...over
	};
}

// Decode the proxied URL one level up: callers fetch
// `/api/cors-proxy?url=<encoded deezer URL>`, and the inner Deezer URL
// itself carries a `q=` parameter that's also URL-encoded.
function parseProxiedCall(called: string): { target: URL; q: string } {
	const proxy = new URL(called, 'http://test');
	const inner = proxy.searchParams.get('url');
	if (!inner) throw new Error(`No url param in ${called}`);
	const target = new URL(inner);
	const q = target.searchParams.get('q') ?? '';
	return { target, q };
}

describe('getThumbnailFor', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('returns null when the track has no artist nor title', async () => {
		const url = await getThumbnailFor(makeTrack({ artist: '', album: '', title: '' }));
		expect(url).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns null when there is only an artist (too little signal)', async () => {
		const url = await getThumbnailFor(
			makeTrack({ identifier: 'wd:lib:artist-only', album: '', title: '' })
		);
		expect(url).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns null for an HTTP error', async () => {
		fetchMock.mockResolvedValue({ ok: false });
		const url = await getThumbnailFor(makeTrack({ identifier: 'wd:lib:err' }));
		expect(url).toBeNull();
	});

	it('returns null when Deezer results are empty', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ data: [] })
		});
		const url = await getThumbnailFor(makeTrack({ identifier: 'wd:lib:empty' }));
		expect(url).toBeNull();
	});

	it('returns the album cover_xl from a Deezer album search', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				data: [
					{ cover_xl: 'https://e-cdns-images.dzcdn.net/images/cover/abc/1000x1000-000000-80-0-0.jpg' }
				]
			})
		});
		const url = await getThumbnailFor(makeTrack({ identifier: 'wd:lib:album' }));
		expect(url).toBe(
			'https://e-cdns-images.dzcdn.net/images/cover/abc/1000x1000-000000-80-0-0.jpg'
		);
		// Album path: must hit /search/album with fielded artist+album query,
		// routed through the same-origin cors-proxy.
		const called = fetchMock.mock.calls[0][0] as string;
		expect(called).toMatch(/^\/api\/cors-proxy\?url=/);
		const { target, q } = parseProxiedCall(called);
		expect(target.hostname).toBe('api.deezer.com');
		expect(target.pathname).toBe('/search/album');
		expect(q).toContain('artist:"Mogwai"');
		expect(q).toContain('album:"Ten Rapid"');
	});

	it('strips release-variant suffixes like (Explicit) before querying', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ data: [{ cover_xl: 'https://x.example/c.jpg' }] })
		});
		await getThumbnailFor(
			makeTrack({
				identifier: 'wd:lib:variant',
				artist: 'Pink Floyd',
				album: 'The Dark Side of the Moon (Explicit)'
			})
		);
		const called = fetchMock.mock.calls[0][0] as string;
		const { q } = parseProxiedCall(called);
		expect(q).toContain('album:"The Dark Side of the Moon"');
		expect(q).not.toMatch(/Explicit/i);
	});

	it('treats the empty-cover Deezer placeholder as a miss', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				data: [{ cover_xl: 'https://e-cdns-images.dzcdn.net/images/cover//1000x1000-000000-80-0-0.jpg' }]
			})
		});
		const url = await getThumbnailFor(makeTrack({ identifier: 'wd:lib:placeholder' }));
		expect(url).toBeNull();
	});

	it('falls back to a track search when only artist+title are available', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				data: [{ album: { cover_xl: 'https://x.example/track-cover.jpg' } }]
			})
		});
		const url = await getThumbnailFor(
			makeTrack({ identifier: 'wd:lib:track', album: '' })
		);
		expect(url).toBe('https://x.example/track-cover.jpg');
		const called = fetchMock.mock.calls[0][0] as string;
		const { target, q } = parseProxiedCall(called);
		expect(target.pathname).toBe('/search/track');
		expect(q).toContain('track:"Helicon 1"');
	});

	it('does not refetch on a second call (in-flight dedupe + cache)', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				data: [{ cover_xl: 'https://x.example/dedupe.jpg' }]
			})
		});
		const track = makeTrack({ identifier: 'wd:lib:dedupe' });
		const [a, b] = await Promise.all([getThumbnailFor(track), getThumbnailFor(track)]);
		expect(a).toBe(b);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
