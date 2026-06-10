// Shared test fixtures. Every page pre-marks the first-launch theme
// picker as seen, because its full-screen overlay (z-[100]) intercepts
// pointer events and races against clicks issued early in a test.
// page.goto additionally waits for the layout's hydration marker so
// clicks aren't swallowed while SvelteKit is still hydrating (a real
// risk on a cold vite dev server compiling routes on first hit).
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
	page: async ({ page }, use) => {
		await page.addInitScript(() => {
			window.localStorage.setItem('dustic-theme-picker-seen', '1');
		});
		const originalGoto = page.goto.bind(page);
		page.goto = (async (url: string, opts?: Parameters<typeof originalGoto>[1]) => {
			const res = await originalGoto(url, opts);
			await page
				.waitForSelector('body[data-hydrated="1"]', { timeout: 15000 })
				.catch(() => {});
			return res;
		}) as typeof page.goto;
		await use(page);
	}
});

export { expect };
