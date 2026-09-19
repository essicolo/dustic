import { describe, it, expect } from 'vitest';
import { generateMotes } from '$lib/utils/coverArt';

describe('generateMotes', () => {
	it('is deterministic: the same item always draws the same tile', () => {
		// Otherwise the grid would reshuffle on every render and every scroll.
		expect(generateMotes('same-identifier')).toEqual(generateMotes('same-identifier'));
	});

	it('gives different items different constellations', () => {
		// The point is that a column of artwork-less results reads as varied
		// rather than as one placeholder repeated.
		expect(generateMotes('item-one')).not.toEqual(generateMotes('item-two'));
	});

	it('varies with a single character of difference', () => {
		expect(generateMotes('gd1977-05-08')).not.toEqual(generateMotes('gd1977-05-09'));
	});

	it('draws enough motes to read as a composition', () => {
		for (const seed of ['a', 'zzzz', 'gd1977-05-08.sbd.hicks', '日本語', '   ', '']) {
			const motes = generateMotes(seed);
			expect(motes.length, seed).toBeGreaterThanOrEqual(14);
			expect(motes.length, seed).toBeLessThanOrEqual(24);
		}
	});

	it('keeps every mote inside the frame with a visible radius', () => {
		// A mote drawn outside the 0–100 viewBox is invisible; a zero or
		// negative radius makes SVG drop the circle entirely.
		for (const seed of ['a', 'zz', 'x'.repeat(200), '日本語', '💿', '']) {
			for (const m of generateMotes(seed)) {
				expect(m.r, `${seed} r`).toBeGreaterThan(0);
				expect(m.cx, `${seed} cx`).toBeGreaterThanOrEqual(0);
				expect(m.cx, `${seed} cx`).toBeLessThanOrEqual(100);
				expect(m.cy, `${seed} cy`).toBeGreaterThanOrEqual(0);
				expect(m.cy, `${seed} cy`).toBeLessThanOrEqual(100);
				expect(m.opacity, `${seed} opacity`).toBeGreaterThan(0);
				expect(m.opacity, `${seed} opacity`).toBeLessThanOrEqual(1);
			}
		}
	});

	it('produces no NaN for any seed', () => {
		for (const m of generateMotes('🎵 mixed ünicode 123')) {
			expect(Number.isFinite(m.cx) && Number.isFinite(m.cy)).toBe(true);
			expect(Number.isFinite(m.r) && Number.isFinite(m.opacity)).toBe(true);
		}
	});

	it('thins towards the top, like the logo', () => {
		// First motes sit near the horizon and are larger; later ones rise and
		// shrink. Compare the two halves rather than adjacent pairs, which the
		// per-mote jitter can legitimately invert.
		const motes = generateMotes('post-rock');
		const half = Math.floor(motes.length / 2);
		const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

		const lowerR = avg(motes.slice(0, half).map((m) => m.r));
		const upperR = avg(motes.slice(half).map((m) => m.r));
		expect(lowerR).toBeGreaterThan(upperR);

		const lowerY = avg(motes.slice(0, half).map((m) => m.cy));
		const upperY = avg(motes.slice(half).map((m) => m.cy));
		expect(lowerY).toBeGreaterThan(upperY); // larger cy = closer to the horizon
	});
});
