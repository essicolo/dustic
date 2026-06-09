// Visual sanity test for the Autoplay settings panel. Both the
// content-type and the source rows render inside a daisyUI `.alert`,
// which is `display: grid` with `auto / minmax(auto, 1fr)` columns —
// direct children get auto-distributed across those columns and our
// 3-column inner grid collapsed to a single column. The fix wraps the
// section content in a single child div so the alert treats us as one
// cell. This test guards the layout by measuring checkbox X positions.
import { test, expect } from './fixtures';

function diff(xs: number[]): number {
	const sorted = [...xs].sort((a, b) => a - b);
	return sorted[sorted.length - 1] - sorted[0];
}

async function checkboxXs(card: import('@playwright/test').Locator): Promise<number[]> {
	const cb = card.locator('input[type="checkbox"]');
	const n = await cb.count();
	const xs: number[] = [];
	for (let i = 0; i < n; i++) {
		const b = await cb.nth(i).boundingBox();
		if (b) xs.push(b.x);
	}
	return xs;
}

test('content-type checkboxes lay out horizontally without overlap', async ({ page }) => {
	await page.goto('/settings');
	await page.waitForLoadState('networkidle');

	const card = page
		.locator('.alert')
		.filter({ hasText: /Content types/i })
		.first();
	const xs = await checkboxXs(card);
	expect(xs.length, 'expected 3 content-type checkboxes').toBe(3);
	expect(diff(xs), `stacked (xs=${xs.join(',')})`).toBeGreaterThan(50);
});

test('source checkboxes lay out horizontally without overlap', async ({ page }) => {
	await page.goto('/settings');
	await page.waitForLoadState('networkidle');

	const card = page
		.locator('.alert')
		.filter({ hasText: /Sources/i })
		.first();
	const xs = await checkboxXs(card);
	expect(xs.length, 'expected 3 source checkboxes').toBe(3);
	expect(diff(xs), `stacked (xs=${xs.join(',')})`).toBeGreaterThan(50);
});
