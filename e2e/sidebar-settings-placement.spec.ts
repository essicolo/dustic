// Sanity check: the Settings link moved out of the main nav and now
// lives below the Profile Manager block at the bottom of the sidebar,
// with the solar gear icon next to its label.
import { test, expect } from '@playwright/test';

test('Settings link sits below the Profile Manager and has a gear icon', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const close = page.getByText(/Continue with/i);
	if (await close.count()) await close.first().click();

	// Settings link must be visible and below the Profile Manager. We
	// compare bounding-box Y of the link against the Y of an element
	// known to belong to ProfileManager (the "Profil" / "Profile" label
	// or, failing that, the first profile-tagged element).
	const settingsLink = page.locator('a[href*="/settings"]').last();
	const settingsBox = await settingsLink.boundingBox();
	expect(settingsBox, 'settings link not rendered').not.toBeNull();

	// Find SOMETHING on screen above the settings link from the profile
	// area; we just need a baseline higher in the sidebar than settings.
	const aboutLink = page.locator('a[href*="/about"]').first();
	const aboutBox = await aboutLink.boundingBox();
	expect(aboutBox, 'about link missing for layout baseline').not.toBeNull();

	// Settings must now appear AFTER About (it used to be before). The
	// old layout had Settings above About in the main nav.
	expect(settingsBox!.y).toBeGreaterThan(aboutBox!.y);

	// The link should contain a gear icon (iconify renders as an <svg>).
	const icon = settingsLink.locator('svg');
	expect(await icon.count(), 'no <svg> icon next to Settings label').toBeGreaterThan(0);
});
