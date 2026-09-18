import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SearchResult, Track } from '$lib/types';

// Internet Archive answers in ~130-340ms; a FunkWhale instance takes
// 350-1900ms and for most queries returns nothing. Awaiting both before
// rendering made every search as slow as the slowest source. These tests pin
// the behaviour that fixes it, and the failure modes that come with it.

function track(identifier: string): Track {
	return {
		identifier,
		filename: '',
		title: identifier,
		artist: 'Artist',
		streamUrl: `https://example.test/${identifier}.mp3`,
		format: 'VBR MP3',
		collection: [],
		metadata: {}
	} as Track;
}

const result = (items: Track[], total = items.length): SearchResult => ({
	items,
	total,
	page: 1,
	pageSize: 50
});

const defer = <T>() => {
	let resolve!: (v: T) => void, reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
	return { promise, resolve, reject };
};

const iaMock = vi.hoisted(() => vi.fn());
const fwMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/services/internetArchive', async (importOriginal) => ({
	...(await importOriginal<object>()),
	smartSearch: iaMock
}));
vi.mock('$lib/services/funkwhale', async (importOriginal) => ({
	...(await importOriginal<object>()),
	search: fwMock
}));

describe('unifiedSearch progressive results', () => {
	beforeEach(() => {
		iaMock.mockReset();
		fwMock.mockReset();
	});
	afterEach(() => vi.restoreAllMocks());

	it('reports archive results before the slower source finishes', async () => {
		const fw = defer<SearchResult>();
		iaMock.mockResolvedValue(result([track('ia-1'), track('ia-2')]));
		fwMock.mockReturnValue(fw.promise);

		const { unifiedSearch } = await import('$lib/services/sources');
		const partials: SearchResult[] = [];
		const pending = unifiedSearch({ query: 'x' }, { onPartial: (r) => partials.push(r) });

		// Let the IA promise settle while FunkWhale is still outstanding.
		await vi.waitFor(() => expect(partials).toHaveLength(1));
		expect(partials[0].items.map((i) => i.identifier)).toEqual(['ia-1', 'ia-2']);

		fw.resolve(result([track('fw-1')]));
		const final = await pending;
		expect(final.items.map((i) => i.identifier)).toEqual(['ia-1', 'ia-2', 'fw-1']);
	});

	it('still resolves with the merged set when nobody is listening', async () => {
		iaMock.mockResolvedValue(result([track('ia-1')]));
		fwMock.mockResolvedValue(result([track('fw-1')]));

		const { unifiedSearch } = await import('$lib/services/sources');
		const final = await unifiedSearch({ query: 'x' });
		expect(final.items).toHaveLength(2);
	});

	it('does not report an empty partial, which would flash "no results"', async () => {
		const fw = defer<SearchResult>();
		iaMock.mockResolvedValue(result([]));
		fwMock.mockReturnValue(fw.promise);

		const { unifiedSearch } = await import('$lib/services/sources');
		const partials: SearchResult[] = [];
		const pending = unifiedSearch({ query: 'x' }, { onPartial: (r) => partials.push(r) });

		fw.resolve(result([track('fw-1')]));
		await pending;
		expect(partials).toHaveLength(0);
	});

	it('does not report a partial when the archive fails', async () => {
		const fw = defer<SearchResult>();
		iaMock.mockRejectedValue(new Error('Network error'));
		fwMock.mockReturnValue(fw.promise);

		const { unifiedSearch } = await import('$lib/services/sources');
		const partials: SearchResult[] = [];
		const pending = unifiedSearch({ query: 'x' }, { onPartial: (r) => partials.push(r) });

		fw.resolve(result([track('fw-1')]));
		const final = await pending;
		expect(partials).toHaveLength(0);
		expect(final.items.map((i) => i.identifier)).toEqual(['fw-1']);
	});

	it('an archive failure after a partial still rejects rather than half-succeeding', async () => {
		// Both sources down must still throw, so the UI can say "sources
		// unreachable" instead of "no results".
		iaMock.mockRejectedValue(new Error('Network error'));
		fwMock.mockRejectedValue(new Error('Network error'));

		const { unifiedSearch } = await import('$lib/services/sources');
		await expect(unifiedSearch({ query: 'x' }, { onPartial: () => {} })).rejects.toThrow();
	});

	it('skips the partial when FunkWhale is switched off, since there is nothing to wait for', async () => {
		iaMock.mockResolvedValue(result([track('ia-1')]));

		const { unifiedSearch } = await import('$lib/services/sources');
		const partials: SearchResult[] = [];
		const final = await unifiedSearch(
			{ query: 'x', sources: { ia: true, fw: false } },
			{ onPartial: (r) => partials.push(r) }
		);
		expect(partials).toHaveLength(0);
		expect(final.items).toHaveLength(1);
	});
});
