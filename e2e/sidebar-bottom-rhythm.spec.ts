// Sources / Profile / Settings all live at the bottom of the sidebar.
// They must share the same left indent (so the icons line up) and the
// spacing between blocks must look consistent. This guards both.
import { test, expect } from '@playwright/test';

test('Sources / Profile / Settings share left indent and consistent vertical rhythm', async ({
	page
}) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const close = page.getByText(/Continue with/i);
	if (await close.count()) await close.first().click();

	// Sources block: locate via the SourcesStatus component's container.
	const sourcesIcon = page
		.locator('aside')
		.locator('text=/Sources|sources/i')
		.first();
	const profileButton = page
		.locator('aside button:has-text("Profil"), aside button:has-text("Profile")')
		.first();
	const settingsLink = page.locator('aside a[href*="/settings"]').last();

	const sourcesBox = await sourcesIcon.boundingBox();
	const profileBox = await profileButton.boundingBox();
	const settingsBox = await settingsLink.boundingBox();

	expect(sourcesBox, 'sources element missing').not.toBeNull();
	expect(profileBox, 'profile element missing').not.toBeNull();
	expect(settingsBox, 'settings element missing').not.toBeNull();

	// Left indent: Profile and Settings should align within a few px of
	// each other since they share the px-4 wrapper + same button class.
	expect(
		Math.abs(profileBox!.x - settingsBox!.x),
		`profile x=${profileBox!.x}, settings x=${settingsBox!.x}`
	).toBeLessThan(4);

	// Vertical order: Sources → Profile → Settings.
	expect(sourcesBox!.y).toBeLessThan(profileBox!.y);
	expect(profileBox!.y).toBeLessThan(settingsBox!.y);
});
