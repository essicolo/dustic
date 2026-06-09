import { test, expect } from './fixtures';

test.describe('Navigation', () => {
	test('home page loads', async ({ page }) => {
		await page.goto('/');
		// Check for the welcome section or curated playlists
		await expect(page.getByText('Welcome to Dustic')).toBeVisible();
	});

	test('sidebar navigation works', async ({ page }) => {
		await page.goto('/');

		// Click Search in sidebar
		await page.getByRole('link', { name: 'Search', exact: true }).click();
		await expect(page).toHaveURL(/search/);
		// The layout crossfades pages, so the home page (which has its own
		// search input) lingers in the DOM for ~150ms; wait for it to leave.
		const searchInput = page.locator('input[type="search"]');
		await expect(searchInput).toHaveCount(1);
		await expect(searchInput).toBeVisible();
	});

	test('browse page loads content types', async ({ page }) => {
		await page.goto('/browse/music');
		// Wait for the page content area (not the sidebar heading)
		await expect(page.locator('main h1, main h2, .p-4 h2').first()).toBeVisible({ timeout: 10000 });
	});

	test('library page loads', async ({ page }) => {
		await page.goto('/library');
		await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
	});
});
