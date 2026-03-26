import { test, expect } from '@playwright/test';

test.describe('Player', () => {
	test('player bar is hidden when nothing is playing', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(1000);
		// No track title should be displayed in a player bar
		const playerTrackTitle = page.locator('.fixed.bottom-0 .truncate');
		await expect(playerTrackTitle).not.toBeVisible();
	});
});
