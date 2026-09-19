import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';

// The fonts are self-hosted on purpose: the app is an offline-capable PWA
// that makes no third-party requests. That also means a missing file fails
// silently — the browser just falls back to Georgia/system and the brand
// quietly disappears — so the wiring is asserted here rather than noticed
// later in a screenshot.
const css = readFileSync('src/fonts.css', 'utf-8');

describe('self-hosted fonts', () => {
	const referenced = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);

	it('references both families across latin and latin-ext', () => {
		expect(referenced).toHaveLength(4);
		for (const expected of [
			'/fonts/inter-latin.woff2',
			'/fonts/inter-latin-ext.woff2',
			'/fonts/lora-latin.woff2',
			'/fonts/lora-latin-ext.woff2'
		]) {
			expect(referenced, expected).toContain(expected);
		}
	});

	it('ships every file it references', () => {
		for (const ref of referenced) {
			const path = `static${ref}`;
			expect(existsSync(path), `${path} is referenced by fonts.css but missing`).toBe(true);
			// A truncated download would still "exist"; a real woff2 is tens of KB.
			expect(statSync(path).size, path).toBeGreaterThan(10_000);
		}
	});

	it('declares a weight range, so one variable file covers every weight', () => {
		const weights = [...css.matchAll(/font-weight:\s*(\d+)\s+(\d+);/g)];
		expect(weights.length).toBe(4);
	});

	it('swaps rather than blocking first paint', () => {
		expect(css.match(/font-display:\s*swap/g)).toHaveLength(4);
	});

	it('restricts each face to a unicode-range so latin-ext is not fetched needlessly', () => {
		expect(css.match(/unicode-range:/g)).toHaveLength(4);
		// French lives entirely in the latin subset; if that stopped being
		// true the app would pull latin-ext on every page.
		const latin = css.split('@font-face').find((b) => b.includes('inter-latin.woff2'));
		expect(latin).toMatch(/U\+0000-00FF/);
		expect(latin).toMatch(/U\+0152-0153/); // œ
	});

	it('includes the OFL licence for each family', () => {
		expect(existsSync('static/fonts/OFL-Inter.txt')).toBe(true);
		expect(existsSync('static/fonts/OFL-Lora.txt')).toBe(true);
	});
});
