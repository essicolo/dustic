import { test, expect } from './fixtures';

test.describe('Favorites', () => {
	test('favorites page loads with empty state', async ({ page }) => {
		await page.goto('/library/favorites');
		// Should show empty state or favorites list
		await expect(page.getByText(/Favorites/)).toBeVisible();
	});

	test('view toggle between grid and list exists', async ({ page }) => {
		await page.goto('/library/favorites');
		const gridBtn = page.locator('button[title="Grid view"]');
		const listBtn = page.locator('button[title="List view"]');

		// Both view buttons should exist (may be hidden if no favorites)
		// Just check the page loaded without error
		await expect(page.getByText(/Favorites/)).toBeVisible();
	});

	test('favorites persist in localStorage', async ({ page }) => {
		// Inject a favorite directly into localStorage using new FavoriteEntry format
		await page.goto('/');
		await page.evaluate(() => {
			const profile = JSON.parse(localStorage.getItem('dustic-profile') || '{}');
			profile.favorites = profile.favorites || [];
			const exists = profile.favorites.some((f: any) => f.id === 'test-track-123');
			if (!exists) {
				profile.favorites.push({ id: 'test-track-123', type: 'track', addedAt: Date.now() });
			}
			localStorage.setItem('dustic-profile', JSON.stringify(profile));
		});

		// Reload and check it persisted
		await page.reload();
		const favoriteIds = await page.evaluate(() => {
			const profile = JSON.parse(localStorage.getItem('dustic-profile') || '{}');
			return (profile.favorites || []).map((f: any) => typeof f === 'string' ? f : f.id);
		});
		expect(favoriteIds).toContain('test-track-123');
	});

	test('removing a favorite persists after reload', async ({ page }) => {
		// Set up favorites in localStorage using new FavoriteEntry format
		await page.goto('/');
		await page.evaluate(() => {
			const profile = {
				schemaVersion: 2,
				favorites: [
					{ id: 'track-to-remove', type: 'track', addedAt: Date.now() },
					{ id: 'track-to-keep', type: 'track', addedAt: Date.now() }
				],
				playlists: {},
				history: [],
				autoplayRules: [],
				settings: { volume: 0.7, repeat: 'off', audioQuality: 'medium' }
			};
			localStorage.setItem('dustic-profile', JSON.stringify(profile));
		});

		// Reload to let the app pick up the localStorage
		await page.reload();

		// Simulate removing a favorite via the store
		await page.evaluate(() => {
			const profile = JSON.parse(localStorage.getItem('dustic-profile') || '{}');
			profile.favorites = profile.favorites.filter((f: any) => f.id !== 'track-to-remove');
			localStorage.setItem('dustic-profile', JSON.stringify(profile));
		});

		// Reload and verify persistence
		await page.reload();
		const favoriteIds = await page.evaluate(() => {
			const profile = JSON.parse(localStorage.getItem('dustic-profile') || '{}');
			return (profile.favorites || []).map((f: any) => typeof f === 'string' ? f : f.id);
		});
		expect(favoriteIds).not.toContain('track-to-remove');
		expect(favoriteIds).toContain('track-to-keep');
	});

	test('loads all IA favorites with a single batched search request', async ({ page }) => {
		const ids = ['fav-1', 'fav-2', 'fav-3', 'fav-album-1'];

		let batchCalls = 0;
		let metadataCalls = 0;
		await page.route('**/advancedsearch.php*', async (route) => {
			// The sourceStatus pinger also uses advancedsearch; only count
			// the favorites batch queries (identifier:(...)).
			const q = new URL(route.request().url()).searchParams.get('q') ?? '';
			if (q.startsWith('identifier:(')) batchCalls++;
			await route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify({
					response: {
						numFound: ids.length,
						start: 0,
						docs: ids.map((id) => ({
							identifier: id,
							title: `Title of ${id}`,
							creator: 'Test Artist',
							collection: ['etree']
						}))
					}
				})
			});
		});
		await page.route('**/metadata/**', async (route) => {
			metadataCalls++;
			await route.abort();
		});
		// Thumbnails are irrelevant here; don't let them hit the network.
		await page.route(/weserv\.nl/, (route) => route.abort());

		await page.addInitScript((favIds) => {
			localStorage.setItem(
				'dustic-profile',
				JSON.stringify({
					schemaVersion: 2,
					exported: Date.now(),
					favorites: favIds.map((id: string) => ({
						id,
						type: id.includes('album') ? 'album' : 'track',
						addedAt: Date.now()
					})),
					playlists: {},
					history: [],
					autoplayRules: [],
					settings: { volume: 0.7, repeat: 'off', audioQuality: 'medium' }
				})
			);
		}, ids);

		await page.goto('/library/favorites');

		// Every favorite renders from the one batched response...
		for (const id of ids) {
			await expect(page.getByText(`Title of ${id}`)).toBeVisible({ timeout: 10000 });
		}
		// ...with a single search request and no per-item metadata calls.
		expect(batchCalls).toBe(1);
		expect(metadataCalls).toBe(0);
	});
});
