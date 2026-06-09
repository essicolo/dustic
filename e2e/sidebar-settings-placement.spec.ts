// Sanity check: the Settings link lives below the Profile Manager block
// at the bottom of the sidebar, with the solar gear icon next to its
// label. (The About link used to be the layout baseline, but it was
// removed from the sidebar — About now lives in the Settings tab strip —
// so the Profile Manager button is the baseline instead.)
import { test, expect } from './fixtures';

test('Settings link sits below the Profile Manager and has a gear icon', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');

	// Settings link must be visible and below the Profile Manager.
	const settingsLink = page.locator('aside a[href*="/settings"]').last();
	const settingsBox = await settingsLink.boundingBox();
	expect(settingsBox, 'settings link not rendered').not.toBeNull();

	const profileButton = page
		.locator('aside button:has-text("Profil"), aside button:has-text("Profile")')
		.first();
	const profileBox = await profileButton.boundingBox();
	expect(profileBox, 'profile manager button missing for layout baseline').not.toBeNull();

	// Settings must appear AFTER the Profile Manager block.
	expect(settingsBox!.y).toBeGreaterThan(profileBox!.y);

	// The link should contain a gear icon (iconify renders as an <svg>).
	const icon = settingsLink.locator('svg');
	expect(await icon.count(), 'no <svg> icon next to Settings label').toBeGreaterThan(0);
});
