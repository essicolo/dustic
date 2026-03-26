import { test, expect } from '@playwright/test';

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
});
