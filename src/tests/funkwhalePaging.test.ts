import { describe, it, expect } from 'vitest';
import { pageCountAcrossInstances } from '$lib/services/funkwhale';

// Every page queries all configured instances in parallel and concatenates
// what comes back, so the number of pages that actually hold anything follows
// the largest instance, not the sum of their totals. The sum advertised pages
// that came back empty. It takes 2+ enabled instances to show, which is why
// it went unnoticed.

describe('pageCountAcrossInstances', () => {
	it('follows the largest instance rather than the sum', () => {
		// 60 + 60 = 120 would promise 3 pages; there are only 2.
		expect(pageCountAcrossInstances([60, 60], 50)).toBe(2);
		expect(pageCountAcrossInstances([60, 60], 50)).not.toBe(Math.ceil(120 / 50));
	});

	it('matches the obvious answer for a single instance', () => {
		expect(pageCountAcrossInstances([120], 50)).toBe(3);
		expect(pageCountAcrossInstances([50], 50)).toBe(1);
		expect(pageCountAcrossInstances([51], 50)).toBe(2);
	});

	it('is driven by the deepest instance whatever the order', () => {
		expect(pageCountAcrossInstances([10, 200, 30], 50)).toBe(4);
		expect(pageCountAcrossInstances([200, 10, 30], 50)).toBe(4);
	});

	it('handles nothing found, and nothing configured', () => {
		expect(pageCountAcrossInstances([0, 0], 50)).toBe(0);
		expect(pageCountAcrossInstances([], 50)).toBe(0);
	});

	it('never returns a negative or infinite page count', () => {
		expect(pageCountAcrossInstances([-5], 50)).toBe(0);
		expect(pageCountAcrossInstances([100], 0)).toBe(0);
	});
});
