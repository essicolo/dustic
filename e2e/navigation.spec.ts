import { test, expect } from '@playwright/test';

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
		await expect(page.locator('input[type="search"]')).toBeVisible();
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
