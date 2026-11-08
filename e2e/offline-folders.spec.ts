// Keep a WebDAV folder offline, check the figures in Settings → Offline,
// then cut the server off and check the folder is still browsable from the
// downloaded copies. The WebDAV server is simulated at the proxy boundary.
import { test, expect } from './fixtures';

const xml = (items: string) =>
	`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${items}</d:multistatus>`;
const folder = (href: string) =>
	`<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>`;
const file = (href: string, size: number) =>
	`<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>${size}</d:getcontentlength></d:prop></d:propstat></d:response>`;

const LISTINGS: Record<string, string> = {
	'https://dav.example.com/dav/': xml(folder('/dav/') + folder('/dav/Rock/')),
	'https://dav.example.com/dav/Rock/': xml(
		folder('/dav/Rock/') +
			folder('/dav/Rock/Live/') +
			file('/dav/Rock/Artist%20-%20One.mp3', 1000) +
			file('/dav/Rock/Artist%20-%20Two.mp3', 2000)
	),
	'https://dav.example.com/dav/Rock/Live/': xml(
		folder('/dav/Rock/Live/') + file('/dav/Rock/Live/Artist%20-%20Three.ogg', 3000)
	)
};
const SIZES: Record<string, number> = {
	'https://dav.example.com/dav/Rock/Artist%20-%20One.mp3': 1000,
	'https://dav.example.com/dav/Rock/Artist%20-%20Two.mp3': 2000,
	'https://dav.example.com/dav/Rock/Live/Artist%20-%20Three.ogg': 3000
};

test('a WebDAV folder can be kept offline and browsed without the server', async ({ page }) => {
	let serverUp = true;
	await page.route('**/api/webdav-proxy', async (route) => {
		if (!serverUp) return route.abort('internetdisconnected');
		const req = route.request().postDataJSON() as { url: string; method: string };
		if (req.method === 'PROPFIND') {
			return route.fulfill({ status: 207, contentType: 'application/xml', body: LISTINGS[req.url] ?? xml('') });
		}
		if (req.method === 'GET' && SIZES[req.url]) {
			return route.fulfill({
				status: 200,
				headers: { 'content-type': 'audio/mpeg' },
				body: Buffer.alloc(SIZES[req.url], 1)
			});
		}
		return route.fulfill({ status: 404, body: '' });
	});

	await page.goto('/');
	await page.evaluate(async () => {
		const { settings } = (await import('/src/lib/stores/settings.ts' as string)) as any;
		settings.addWebDAVLibrary({
			id: 'lib1',
			name: 'My NAS',
			url: 'https://dav.example.com/dav',
			username: 'u',
			password: 'p',
			rootPath: '/',
			enabled: true
		});
	});

	// Settings are saved on a debounce; wait until the library is persisted.
	await page.waitForFunction(() => (localStorage.getItem('dustic-profile') || '').includes('lib1'));

	// Keep the "Rock" folder offline straight from its tile.
	await page.goto('/library/webdav/lib1?p=%2F');
	const rock = page.getByTestId('folder-card').filter({ hasText: 'Rock' });
	await expect(rock).toBeVisible();
	await page.screenshot({ path: 'test-results/folder-tiles.png' });
	await rock.getByTestId('folder-keep-offline').click();
	await expect(rock.getByText(/3 files offline|3 fichiers hors ligne/)).toBeVisible({ timeout: 15000 });
	await rock.getByTestId('folder-menu').click();
	await page.screenshot({ path: 'test-results/folder-menu.png' });
	await page.keyboard.press('Escape');

	// Favorite the folder from its tile; it shows up under Favorites.
	await rock.getByTestId('folder-favorite').click();
	await page.waitForFunction(() => (localStorage.getItem('dustic-profile') || '').includes('favoriteFolders'));
	await page.goto('/library/favorites');
	await expect(page.getByTestId('favorite-folders')).toContainText('Rock');
	await page.screenshot({ path: 'test-results/favorite-folders.png' });

	// Settings → Offline shows the files and their volume.
	await page.goto('/settings/offline');
	await expect(page.getByTestId('offline-stat-files')).toContainText('3');
	await expect(page.getByTestId('offline-stat-size')).toContainText('5.86 KB');
	await expect(page.getByTestId('offline-folders')).toContainText('Rock');

	// Downloaded audio resolves to a local blob URL.
	const playable = await page.evaluate(async () => {
		const { offlineStorage } = (await import('/src/lib/services/offlineStorage.ts' as string)) as any;
		const all = await offlineStorage.getAllTracks();
		const t = await offlineStorage.getOfflineTrack(all[0].track.identifier);
		return t.streamUrl as string;
	});
	expect(playable.startsWith('blob:')).toBe(true);

	// Server gone: the folder is still listed from the downloads.
	serverUp = false;
	await page.goto('/library/webdav/lib1?p=%2FRock');
	await expect(page.getByText(/Server unreachable|Serveur injoignable/)).toBeVisible({ timeout: 15000 });
	await expect(page.getByText('Live', { exact: true })).toBeVisible();
	await expect(page.getByText('One', { exact: true }).first()).toBeVisible();
});
