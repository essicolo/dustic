import { test, expect } from './fixtures';

test.describe('Search Page', () => {
	test('search page loads with input and content type tabs', async ({ page }) => {
		await page.goto('/search');
		await expect(page.locator('input[type="search"]')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Music' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Podcasts' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Audiobooks' })).toBeVisible();
	});

	test('selecting a content type updates tag chips', async ({ page }) => {
		await page.goto('/search');

		// Default tags should include music tags (POPULAR_TAGS)
		await expect(page.locator('button.badge', { hasText: 'rock' })).toBeVisible();

		// Click Podcasts tab
		await page.getByRole('button', { name: 'Podcasts' }).click();
		await page.waitForTimeout(300);

		// Podcast tags should appear
		await expect(page.locator('button.badge', { hasText: 'interview' })).toBeVisible({ timeout: 5000 });
	});

	test('typing in search box does not navigate away', async ({ page }) => {
		await page.goto('/search');
		const input = page.locator('input[type="search"]');

		await input.fill('test query');
		await page.waitForTimeout(500);

		// Should still be on search page
		await expect(page).toHaveURL(/search/);
		await expect(input).toHaveValue('test query');
	});

	test('navigating with query param populates search box', async ({ page }) => {
		await page.goto('/search?q=Mozart');
		const input = page.locator('input[type="search"]');
		await expect(input).toHaveValue('Mozart');
	});

	test('editing search box is not overwritten by URL params', async ({ page }) => {
		await page.goto('/search?q=Mozart');
		const input = page.locator('input[type="search"]');
		await expect(input).toHaveValue('Mozart');

		// Focus, clear, and type new query
		await input.click();
		await input.clear();
		await input.fill('Beethoven');

		// Wait for debounce
		await page.waitForTimeout(600);

		// Input should still show what the user typed
		await expect(input).toHaveValue('Beethoven');
	});

	test('artist search URL uses plain text, not creator: syntax', async ({ page }) => {
		await page.goto('/search?q=Godspeed%20You%20Black%20Emperor');
		const input = page.locator('input[type="search"]');
		await expect(input).toHaveValue('Godspeed You Black Emperor');
	});

	test('filters panel toggles', async ({ page }) => {
		await page.goto('/search');

		const filtersBtn = page.getByText('Filters');
		if (await filtersBtn.isVisible()) {
			await filtersBtn.click();
			// Should show sort options
			await expect(page.getByText('Sort by')).toBeVisible();
		}
	});

	test('shows an error, not "No results", when every source is unreachable', async ({ page }) => {
		// Abort all source traffic in the browser to simulate a full outage
		// (captive portal, blocked network, archive.org down). Match on
		// hostname only — a plain regex would also hit the vite dev
		// server's module URLs (e.g. /src/lib/services/funkwhale.ts).
		await page.route('**/*', (route) => {
			const host = new URL(route.request().url()).hostname;
			if (host.endsWith('archive.org') || host.endsWith('open.audio') || host.includes('funkwhale')) {
				return route.abort();
			}
			return route.continue();
		});

		await page.goto('/search');
		const input = page.locator('input[type="search"]');
		await input.fill('Mozart');
		await input.press('Enter');

		// The failure must surface as an error alert — never as
		// "No results for Mozart", which implies the archive has nothing.
		// Generous timeout: the IA client retries with backoff first.
		await expect(page.locator('.alert-error')).toBeVisible({ timeout: 25000 });
		await expect(page.getByText(/No results for/)).not.toBeVisible();
	});

	// Routes every external request: FunkWhale aborted, advancedsearch
	// answered from `respond`, other archive.org/thumbnail traffic aborted.
	async function mockSources(
		page: import('@playwright/test').Page,
		respond: (q: string) => Promise<any[]> | any[]
	) {
		await page.route('**/*', async (route) => {
			const u = new URL(route.request().url());
			if (u.hostname.endsWith('open.audio') || u.hostname.includes('funkwhale')) {
				return route.abort();
			}
			if (u.pathname.includes('advancedsearch.php')) {
				const docs = await respond(u.searchParams.get('q') ?? '');
				return route.fulfill({
					contentType: 'application/json',
					body: JSON.stringify({ response: { numFound: docs.length, start: 0, docs } })
				});
			}
			if (u.hostname.endsWith('archive.org') || u.hostname.includes('weserv')) {
				return route.abort();
			}
			return route.continue();
		});
	}

	const doc = (id: string, title: string) => ({
		identifier: id,
		title,
		creator: 'Mock Artist',
		collection: ['etree']
	});

	test('renders results returned by the sources', async ({ page }) => {
		await mockSources(page, (q) => (q.includes('mockband') ? [doc('mock-1', 'First Mock Album'), doc('mock-2', 'Second Mock Album')] : []));

		await page.goto('/search');
		const input = page.locator('input[type="search"]');
		await input.fill('mockband');
		await input.press('Enter');

		await expect(page.getByText('First Mock Album')).toBeVisible();
		await expect(page.getByText('Second Mock Album')).toBeVisible();
	});

	test('a slow stale response cannot overwrite a newer search', async ({ page }) => {
		await mockSources(page, async (q) => {
			if (q.includes('slowband')) {
				// Old query answers long after the user has moved on.
				await new Promise((r) => setTimeout(r, 3000));
				return [doc('slow-1', 'Slow Band Result')];
			}
			if (q.includes('fastband')) return [doc('fast-1', 'Fast Band Result')];
			return [];
		});

		await page.goto('/search');
		const input = page.locator('input[type="search"]');
		await input.fill('slowband');
		await input.press('Enter');
		// Supersede the in-flight search immediately.
		await input.fill('fastband');
		await input.press('Enter');

		await expect(page.getByText('Fast Band Result')).toBeVisible();

		// Let the stale slowband response land — it must be discarded.
		await page.waitForTimeout(3500);
		await expect(page.getByText('Fast Band Result')).toBeVisible();
		await expect(page.getByText('Slow Band Result')).not.toBeVisible();
	});
});
