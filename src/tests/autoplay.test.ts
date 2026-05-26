// Unit tests for the autoplay service's pure-ish helpers. The full
// getNextTrack chain has too many external dependencies (FunkWhale, IA
// search, library, settings stores) to mock cleanly here — but the bits
// that previously had subtle bugs are mathematical/pure and worth
// covering directly.
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('autoplay — weightedShuffle distribution', () => {
	it('roughly matches the configured weights over many draws', async () => {
		const { __test } = await import('$lib/services/autoplay');
		const rules = [
			{ id: 'a', weight: 80 },
			{ id: 'b', weight: 10 },
			{ id: 'c', weight: 10 }
		];

		// Record which rule landed FIRST in the shuffle, many times. The
		// frequencies should track the configured weight ratios — under
		// the old "independent rolls" implementation, rule `c` showed up
		// first only when both `a` and `b` had failed their independent
		// rolls, so its real chance collapsed to ~1% instead of 10%.
		const N = 5000;
		const firstCounts: Record<string, number> = { a: 0, b: 0, c: 0 };
		for (let i = 0; i < N; i++) {
			const order = __test.weightedShuffle(rules);
			firstCounts[order[0].id]++;
		}

		// Allow generous slack — random tests need it.
		expect(firstCounts.a / N).toBeGreaterThan(0.7);
		expect(firstCounts.a / N).toBeLessThan(0.9);
		expect(firstCounts.b / N).toBeGreaterThan(0.05);
		expect(firstCounts.b / N).toBeLessThan(0.15);
		expect(firstCounts.c / N).toBeGreaterThan(0.05);
		expect(firstCounts.c / N).toBeLessThan(0.15);
	});

	it('returns a full permutation (every rule appears exactly once)', async () => {
		const { __test } = await import('$lib/services/autoplay');
		const rules = [
			{ id: 'a', weight: 1 },
			{ id: 'b', weight: 1 },
			{ id: 'c', weight: 1 },
			{ id: 'd', weight: 1 }
		];
		for (let i = 0; i < 100; i++) {
			const order = __test.weightedShuffle(rules);
			expect(order).toHaveLength(4);
			expect(new Set(order.map((r) => r.id))).toEqual(new Set(['a', 'b', 'c', 'd']));
		}
	});

	it('handles zero total weight gracefully (appends remaining in place)', async () => {
		const { __test } = await import('$lib/services/autoplay');
		const order = __test.weightedShuffle([
			{ id: 'a', weight: 0 },
			{ id: 'b', weight: 0 }
		]);
		expect(order).toHaveLength(2);
		expect(new Set(order.map((r) => r.id))).toEqual(new Set(['a', 'b']));
	});
});

describe('autoplay — content-type classification', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	function track(collection: string[]) {
		return {
			identifier: 'ia:test',
			filename: 'x.mp3',
			title: 't',
			artist: 'a',
			collection,
			format: 'mp3',
			streamUrl: '',
			metadata: {}
		};
	}

	it('classifies music / podcasts / audiobooks by collection', async () => {
		const { __test } = await import('$lib/services/autoplay');
		expect(__test.classifyContentType(track(['audio_music']))).toBe('music');
		expect(__test.classifyContentType(track(['etree']))).toBe('music');
		expect(__test.classifyContentType(track(['audio_podcast']))).toBe('podcasts');
		expect(__test.classifyContentType(track(['radioprograms']))).toBe('podcasts');
		expect(__test.classifyContentType(track(['librivoxaudio']))).toBe('audiobooks');
	});

	it('returns null for unknown collections (callers should treat as music-ish)', async () => {
		const { __test } = await import('$lib/services/autoplay');
		expect(__test.classifyContentType(track(['opensource_audio']))).toBeNull();
		expect(__test.classifyContentType(track([]))).toBeNull();
	});

	it('isAutoplayAllowed honors the user-disabled content types', async () => {
		// Pretend the user kept music on and switched podcasts off.
		vi.doMock('svelte/store', async () => {
			const actual = await vi.importActual<typeof import('svelte/store')>('svelte/store');
			return {
				...actual,
				get: vi.fn((store: unknown) => {
					if (store && typeof store === 'object' && 'subscribe' in store) {
						return { autoplayContentTypes: { music: true, podcasts: false, audiobooks: false } };
					}
					return actual.get(store as Parameters<typeof actual.get>[0]);
				})
			};
		});
		const { __test } = await import('$lib/services/autoplay');
		expect(__test.isAutoplayAllowed(track(['audio_music']))).toBe(true);
		expect(__test.isAutoplayAllowed(track(['audio_podcast']))).toBe(false);
		expect(__test.isAutoplayAllowed(track(['radioprograms']))).toBe(false);
		expect(__test.isAutoplayAllowed(track(['librivoxaudio']))).toBe(false);
		// Unknowns still pass — see classifyContentType rationale.
		expect(__test.isAutoplayAllowed(track(['opensource_audio']))).toBe(true);
	});
});

describe('autoplay — source setter enforces at-least-one', () => {
	beforeEach(() => {
		vi.doUnmock('svelte/store');
		vi.resetModules();
		localStorage.clear();
	});

	it('refuses to disable the last enabled source', async () => {
		const { settings } = await import('$lib/stores/settings');
		// Defaults have all three sources on. Disable two; the third refuses.
		expect(settings.setAutoplaySource('funkwhale', false)).toBe(true);
		expect(settings.setAutoplaySource('webdav', false)).toBe(true);
		expect(settings.setAutoplaySource('ia', false)).toBe(false);

		const { resolveAutoplaySources } = await import('$lib/stores/settings');
		const { get } = await import('svelte/store');
		const srcs = resolveAutoplaySources(get(settings));
		expect(srcs.ia).toBe(true);
		expect(srcs.funkwhale).toBe(false);
		expect(srcs.webdav).toBe(false);
	});
});

describe('autoplay — content type setter enforces at-least-one', () => {
	beforeEach(() => {
		// Clear any svelte/store mocks left behind by sibling describe
		// blocks — otherwise the settings store's `get(...)` returns the
		// mocked value and ignores live updates.
		vi.doUnmock('svelte/store');
		vi.resetModules();
		// Fresh localStorage per test so the persistence layer doesn't bleed.
		localStorage.clear();
	});

	it('refuses to disable the last enabled type', async () => {
		const { settings } = await import('$lib/stores/settings');

		// Start from defaults (music only). Disabling music must be blocked.
		const ok = settings.setAutoplayContentType('music', false);
		expect(ok).toBe(false);

		// And the stored value should still report music as enabled.
		const { resolveAutoplayContentTypes } = await import('$lib/stores/settings');
		const { get } = await import('svelte/store');
		const types = resolveAutoplayContentTypes(get(settings));
		expect(types.music).toBe(true);
	});

	it('allows disabling once another type is enabled', async () => {
		const { settings } = await import('$lib/stores/settings');
		// Enable podcasts first; THEN disabling music is OK.
		expect(settings.setAutoplayContentType('podcasts', true)).toBe(true);
		expect(settings.setAutoplayContentType('music', false)).toBe(true);
		const { resolveAutoplayContentTypes } = await import('$lib/stores/settings');
		const { get } = await import('svelte/store');
		const types = resolveAutoplayContentTypes(get(settings));
		expect(types.music).toBe(false);
		expect(types.podcasts).toBe(true);
	});
});
