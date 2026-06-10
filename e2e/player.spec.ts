import { test, expect } from './fixtures';

test.describe('Player', () => {
	test('player bar shows an idle placeholder when nothing is playing', async ({ page }) => {
		await page.goto('/');
		// The bar is always rendered; with no track it shows a dimmed
		// placeholder instead of track metadata.
		const playerBar = page.locator('footer.fixed.bottom-0');
		await expect(playerBar).toBeVisible();
		await expect(playerBar.getByText('No track loaded')).toBeVisible();
		await expect(playerBar.getByText('Select a track to play')).toBeVisible();
	});
});
