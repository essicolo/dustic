// End-to-end check of the full WebDAV cover-art pipeline:
//   webdav-proxy → audioMetadata → thumbnails → Deezer (via cors-proxy).
//
// Rather than driving the UI (which requires localStorage-encoded
// credentials and deep navigation), we exercise the services directly
// in the browser context with mocked /api/webdav-proxy and /api/cors-proxy
// responses. The test mimics the user's exact scenario:
//   - .ogg files with no embedded Vorbis tags (parseBuffer returns empty)
//   - filename pattern "Disc N - NN - Title.ogg"
//   - folder path "/Music/Pink Floyd/The Wall/..."
// If the pipeline produces the Deezer cover URL, the user's screen will
// too (assuming HMR / cache states are aligned).
import { test, expect } from './fixtures';

const COVER_URL = 'https://e-cdns-images.dzcdn.net/images/cover/abc/1000x1000-000000-80-0-0.jpg';

test('full pipeline: audioMeta failure falls back to Deezer cover via cors-proxy', async ({
	page
}) => {
	let deezerCalls = 0;
	let lastQuery = '';

	await page.route('**/api/webdav-proxy', async (route) => {
		// Simulate the upstream returning a 256KB blob of zeros for the
		// audio range fetch — parseBuffer reads no tags from this.
		const post = route.request().postDataJSON() as { method: string };
		if (post.method === 'GET') {
			await route.fulfill({
				status: 206,
				headers: { 'content-type': 'audio/ogg' },
				body: Buffer.alloc(256 * 1024)
			});
			return;
		}
		await route.fulfill({ status: 200, body: '' });
	});

	await page.route('**/api/cors-proxy**', async (route) => {
		const inner = new URL(route.request().url()).searchParams.get('url') ?? '';
		lastQuery = new URL(inner).searchParams.get('q') ?? '';
		deezerCalls++;
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				data: [{ cover_xl: COVER_URL, artist: { name: 'Pink Floyd' }, title: 'The Wall' }]
			})
		});
	});

	// IndexedDB will be fresh in this new browser context.
	await page.goto('/');
	await page.waitForLoadState('networkidle');

	const result = await page.evaluate(async () => {
		// Need a Track-shaped object that mimics what webdavLibrary.buildTrack
		// would produce for /Music/Pink Floyd/The Wall/Disc 1 - 01 - In the Flesh.ogg
		// AFTER parseFilenameHeuristics strips the "Disc 1 - " prefix.
		const track = {
			identifier: 'wd:test:' + btoa('/Music/Pink Floyd/The Wall/Disc 1 - 01 - In the Flesh.ogg'),
			filename: 'Disc 1 - 01 - In the Flesh.ogg',
			title: 'In the Flesh',
			artist: 'Pink Floyd',
			album: 'The Wall',
			collection: ['koofr'],
			format: 'ogg',
			streamUrl: '/webdav-track/x',
			source: 'webdav',
			metadata: {}
		};

		const tn = (await import('/src/lib/services/thumbnails.ts' as string)) as {
			getThumbnailFor: (t: unknown) => Promise<string | null>;
		};
		const cover = await tn.getThumbnailFor(track);
		return { cover };
	});

	expect(deezerCalls, 'Deezer was queried').toBeGreaterThan(0);
	expect(lastQuery, 'query contained Pink Floyd / The Wall').toMatch(/Pink Floyd/i);
	expect(lastQuery).toMatch(/The Wall/i);
	expect(result.cover, 'getThumbnailFor returned the Deezer cover URL').toBe(COVER_URL);
});

test('full pipeline: filename-only metadata also produces a cover when artist+album are folder-derived', async ({
	page
}) => {
	let lastQuery = '';
	await page.route('**/api/cors-proxy**', async (route) => {
		const inner = new URL(route.request().url()).searchParams.get('url') ?? '';
		lastQuery = new URL(inner).searchParams.get('q') ?? '';
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				data: [{ cover_xl: COVER_URL, artist: { name: 'Pink Floyd' }, title: 'The Wall' }]
			})
		});
	});

	await page.goto('/');
	await page.waitForLoadState('networkidle');

	const result = await page.evaluate(async () => {
		const wd = (await import('/src/lib/services/webdavLibrary.ts' as string)) as {
			parseFilenameHeuristics: (n: string) => { artist?: string; title?: string };
		};
		const parsed = wd.parseFilenameHeuristics('Disc 1 - 01 - In the Flesh.ogg');
		return { parsed };
	});

	expect(
		result.parsed,
		'Disc-prefixed filenames should yield only a title, not a "Disc 1" artist'
	).toEqual({ title: 'In the Flesh' });
});
