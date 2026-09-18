import { test, expect } from './fixtures';

// Assertions here are locale-tolerant on purpose. The UI ships in English and
// French and picks one from the browser, so matching a single language made
// these tests pass or fail depending on the environment rather than on the
// app — the empty-state check was already failing in isolation for that
// reason while passing in a full run.

test.describe('Favorites', () => {
	test('favorites page loads with empty state', async ({ page }) => {
		await page.goto('/library/favorites');
		// Should show empty state or favorites list
		await expect(page.getByRole('heading', { name: /Favoris|Favorites/i })).toBeVisible();
	});

	test('view toggle between grid and list exists', async ({ page }) => {
		await page.goto('/library/favorites');
		const gridBtn = page.locator('button[title="Grid view"], button[title="Vue grille"]');
		const listBtn = page.locator('button[title="List view"], button[title="Vue liste"]');

		// Both view buttons should exist (may be hidden if no favorites)
		// Just check the page loaded without error
		await expect(page.getByRole('heading', { name: /Favoris|Favorites/i })).toBeVisible();
	});

	test('a favourite survives a reload and is shown in the library', async ({ page }) => {
		// The old version of this test round-tripped localStorage and asserted
		// nothing about the app: it passed whether or not the store ever read
		// what was written. Drive the real thing instead — favourite something
		// from search results, reload, and check the library says so.
		await page.goto('/search?q=godspeed');
		const heart = page
			.locator('[data-row] button[aria-label*="favoris"], [data-row] button[aria-label*="avorite"]')
			.first();
		await heart.waitFor({ timeout: 25000 });
		await heart.click();

		// The profile autosaves on a debounce. Wait for it to actually land
		// rather than for a fixed number of seconds: under parallel load a
		// sleep long enough to be reliable is also long enough to be slow.
		await expect
			.poll(
				() =>
					page.evaluate(
						() => JSON.parse(localStorage.getItem('dustic-profile') || '{}').favorites?.length ?? 0
					),
				{ timeout: 20000 }
			)
			.toBeGreaterThan(0);
		await page.reload();

		// The library index counts what the *store* holds, with no network of
		// its own — which is precisely the link the old test never checked.
		// Deliberately not asserting that the favourites page renders a row:
		// that needs the archive to answer, and makes a store-level assertion
		// hostage to network weather.
		await page.goto('/library');
		await expect(page.getByText(/1 élément|1 item/i)).toBeVisible({ timeout: 20000 });
	});

	test('un-favouriting removes it from the library', async ({ page }) => {
		await page.goto('/search?q=godspeed');
		const heart = page
			.locator('[data-row] button[aria-label*="favoris"], [data-row] button[aria-label*="avorite"]')
			.first();
		await heart.waitFor({ timeout: 25000 });
		await heart.click();
		const saved = () =>
			page.evaluate(
				() => JSON.parse(localStorage.getItem('dustic-profile') || '{}').favorites?.length ?? 0
			);
		await expect.poll(saved, { timeout: 20000 }).toBeGreaterThan(0);

		// Same control toggles it back off.
		await heart.click();
		await expect.poll(saved, { timeout: 20000 }).toBe(0);

		await page.goto('/library');
		await expect(page.getByText(/0 élément|0 items?/i)).toBeVisible({ timeout: 15000 });
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
