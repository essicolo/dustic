import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A genre chip used to be appended to the query as a keyword. Measured
// against the live API, that made results worse rather than filtering them:
// "Tori Amos" ranks the artist second, while "Tori Amos rock" returns 137
// documents headed by Voice of America broadcasts with the artist gone — the
// archive matches the extra word against descriptions and transcripts.
//
// Tags are now a filter on `subject`, always scoped to the collections of the
// active content type, because `subject:("rock")` alone is 368k documents
// dominated by radio recordings.

function mockFetch() {
	return vi.fn(async (_url: string) => ({
		ok: true,
		json: async () => ({ response: { numFound: 0, start: 0, docs: [] } })
	}));
}

const queriesFrom = (fetchMock: ReturnType<typeof mockFetch>) =>
	fetchMock.mock.calls.map((c) => new URL(String(c[0])).searchParams.get('q') ?? '');

const urlsFrom = (fetchMock: ReturnType<typeof mockFetch>) =>
	fetchMock.mock.calls.map((c) => new URL(String(c[0])));

describe('genre tags', () => {
	beforeEach(async () => (await import('$lib/utils/cache')).cache.clear());
	afterEach(() => vi.unstubAllGlobals());

	it('filters on subject rather than appending a keyword', async () => {
		const fetchMock = mockFetch();
		vi.stubGlobal('fetch', fetchMock);

		const { search } = await import('$lib/services/internetArchive');
		await search({ query: '', subject: 'jazz', collection: ['audio_music', 'etree'] });

		const q = queriesFrom(fetchMock)[0];
		expect(q).toContain('subject:("jazz")');
		// The tag must not leak into the free-text part of the query.
		expect(q).not.toMatch(/\bjazz\b(?!"\))/);
	});

	it('scopes the subject filter to the content type collections', async () => {
		const fetchMock = mockFetch();
		vi.stubGlobal('fetch', fetchMock);

		const { search } = await import('$lib/services/internetArchive');
		await search({ query: '', subject: 'rock', collection: ['audio_music', 'etree'] });

		const q = queriesFrom(fetchMock)[0];
		expect(q).toContain('subject:("rock")');
		expect(q).toContain('collection:(audio_music)');
	});

	it('produces a valid query when browsing with no search terms', async () => {
		// buildRelevanceQuery returns nothing for an empty query, which would
		// otherwise leave the filters trailing a leading " AND ".
		const fetchMock = mockFetch();
		vi.stubGlobal('fetch', fetchMock);

		const { search } = await import('$lib/services/internetArchive');
		await search({ query: '', subject: 'folk', collection: ['audio_music'] });

		const q = queriesFrom(fetchMock)[0];
		expect(q.trimStart()).not.toMatch(/^AND\b/);
		expect(q.trimStart()).toMatch(/^subject:/);
	});

	it('sorts a genre browse by popularity, since there is no relevance to rank by', async () => {
		const fetchMock = mockFetch();
		vi.stubGlobal('fetch', fetchMock);

		const { search } = await import('$lib/services/internetArchive');
		await search({ query: '', subject: 'folk', collection: ['audio_music'] });

		expect(urlsFrom(fetchMock)[0].searchParams.get('sort[]')).toBe('downloads desc');
	});

	it('leaves ranking alone when the user actually typed something', async () => {
		const fetchMock = mockFetch();
		vi.stubGlobal('fetch', fetchMock);

		const { search } = await import('$lib/services/internetArchive');
		await search({ query: 'nick drake', subject: 'folk', collection: ['audio_music'] });

		expect(urlsFrom(fetchMock)[0].searchParams.get('sort[]')).toBeNull();
	});

	it('maps the UI tag onto the subject filter for the archive only', async () => {
		const { applyTagForTest } = await import('$lib/services/sources');
		expect(applyTagForTest({ query: 'x', tag: 'jazz' })).toMatchObject({
			query: 'x',
			subject: 'jazz'
		});
	});
});
