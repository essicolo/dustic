import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getThumbnailUrl, cleanSearchInput } from '$lib/services/internetArchive';

describe('getThumbnailUrl', () => {
	it('should return a weserv.nl proxied thumbnail URL', () => {
		const identifier = 'test_identifier';
		const result = getThumbnailUrl(identifier);
		expect(result).toContain('images.weserv.nl');
		expect(result).toContain(
			encodeURIComponent(`https://archive.org/download/${identifier}/__ia_thumb.jpg`)
		);
	});

	it('asks for the item thumbnail, not /services/img', () => {
		// /services/img/<id> redirects to archive.org/images/notfound.png —
		// the Internet Archive building logo — and serves it with a 200, so an
		// item with no artwork is indistinguishable from one with artwork and
		// every such result rendered as the same black tile. __ia_thumb.jpg
		// errors instead, which is what lets CoverFallback take over.
		const result = getThumbnailUrl('anything');
		expect(result).not.toContain(encodeURIComponent('services/img'));
		expect(result).toContain(encodeURIComponent('__ia_thumb.jpg'));
	});

	it('does not hand weserv a third-party placeholder to paper over failures', () => {
		const result = getThumbnailUrl('anything');
		expect(result).not.toContain('default=');
		expect(result).not.toContain('placehold');
	});
});

describe('cleanSearchInput', () => {
	it('should escape ! outside quotes to prevent Lucene NOT operator', () => {
		const result = cleanSearchInput('Godspeed You! Black Emperor');
		expect(result).toBe('Godspeed You\\! Black Emperor');
	});

	it('should not escape ! inside quoted phrases', () => {
		const result = cleanSearchInput('"Godspeed You! Black Emperor"');
		expect(result).toBe('"Godspeed You! Black Emperor"');
	});

	it('should balance unmatched quotes', () => {
		const result = cleanSearchInput('"Pink Floyd');
		expect(result).toBe('Pink Floyd');
	});

	it('should preserve matched quotes', () => {
		const result = cleanSearchInput('"Pink Floyd"');
		expect(result).toBe('"Pink Floyd"');
	});

	it('should strip archive.org URLs to identifiers', () => {
		const result = cleanSearchInput('https://archive.org/details/my-item-123');
		expect(result).toBe('my-item-123');
	});

	it('should pass through normal queries unchanged', () => {
		const result = cleanSearchInput('Bach cello suites');
		expect(result).toBe('Bach cello suites');
	});

	it('should preserve field syntax like creator:"..."', () => {
		const result = cleanSearchInput('creator:"Bach"');
		expect(result).toBe('creator:"Bach"');
	});
});

describe('fetchItemsByIdentifiers', () => {
	function searchResponse(ids: string[]) {
		return {
			ok: true,
			json: async () => ({
				response: {
					numFound: ids.length,
					start: 0,
					docs: ids.map((id) => ({
						identifier: id,
						title: `Title of ${id}`,
						creator: `Creator of ${id}`,
						collection: ['etree']
					}))
				}
			})
		};
	}

	beforeEach(async () => {
		const { cache } = await import('$lib/utils/cache');
		cache.clear();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('resolves many identifiers with a single request', async () => {
		const ids = ['item-a', 'item-b', 'item-c'];
		const fetchMock = vi.fn(async (_url: string) => searchResponse(ids));
		vi.stubGlobal('fetch', fetchMock);

		const { fetchItemsByIdentifiers } = await import('$lib/services/internetArchive');
		const result = await fetchItemsByIdentifiers(ids);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const url = String(fetchMock.mock.calls[0][0]);
		const q = new URL(url).searchParams.get('q');
		expect(q).toBe('identifier:(item-a OR item-b OR item-c)');
		expect(result.size).toBe(3);
		expect(result.get('item-b')?.title).toBe('Title of item-b');
		expect(result.get('item-b')?.artist).toBe('Creator of item-b');
	});

	it('chunks large identifier lists', async () => {
		const ids = Array.from({ length: 120 }, (_, i) => `bulk-${i}`);
		const fetchMock = vi.fn(async (url: string) => {
			const q = new URL(String(url)).searchParams.get('q') ?? '';
			const inChunk = ids.filter((id) => q.includes(id));
			return searchResponse(inChunk);
		});
		vi.stubGlobal('fetch', fetchMock);

		const { fetchItemsByIdentifiers } = await import('$lib/services/internetArchive');
		const result = await fetchItemsByIdentifiers(ids);

		// 120 ids at 50 per request = 3 requests
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(result.size).toBe(120);
	});

	it('omits identifiers the archive does not return', async () => {
		const fetchMock = vi.fn(async () => searchResponse(['exists']));
		vi.stubGlobal('fetch', fetchMock);

		const { fetchItemsByIdentifiers } = await import('$lib/services/internetArchive');
		const result = await fetchItemsByIdentifiers(['exists', 'dark-item']);

		expect(result.has('exists')).toBe(true);
		expect(result.has('dark-item')).toBe(false);
	});

	it('returns an empty map without fetching when given no identifiers', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const { fetchItemsByIdentifiers } = await import('$lib/services/internetArchive');
		const result = await fetchItemsByIdentifiers([]);

		expect(result.size).toBe(0);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('buildRelevanceQuery', () => {
	it('boosts title and creator for plain-text queries', async () => {
		const { buildRelevanceQuery } = await import('$lib/services/internetArchive');
		expect(buildRelevanceQuery('miles davis')).toBe(
			'(title:(miles davis)^4 OR creator:(miles davis)^3 OR (miles davis))'
		);
	});

	it('leaves field-syntax queries untouched', async () => {
		const { buildRelevanceQuery } = await import('$lib/services/internetArchive');
		expect(buildRelevanceQuery('creator:"Bach"')).toBe('creator:"Bach"');
	});

	it('leaves empty queries untouched', async () => {
		const { buildRelevanceQuery } = await import('$lib/services/internetArchive');
		expect(buildRelevanceQuery('')).toBe('');
		expect(buildRelevanceQuery('  ')).toBe('  ');
	});

	it('leaves queries carrying operators untouched', async () => {
		const { buildRelevanceQuery } = await import('$lib/services/internetArchive');
		// Repeating these inside three OR'd clauses changes what matches,
		// not just the order: an item whose title says "jazz" and whose
		// description says "live" would satisfy the title clause and slip
		// past the exclusion the user typed.
		for (const q of [
			'jazz -live',
			'-live jazz',
			'bach NOT organ',
			'miles AND davis',
			'jazz (live)',
			'"kind of blue"',
			'mile*',
			'+bach organ'
		]) {
			expect(buildRelevanceQuery(q), q).toBe(q);
		}
	});

	it('still boosts words that merely contain a hyphen', async () => {
		const { buildRelevanceQuery } = await import('$lib/services/internetArchive');
		// Lucene only reads "-" as exclusion at the start of a term, so
		// these are ordinary searches and should keep the ranking boost.
		expect(buildRelevanceQuery('post-rock')).toBe(
			'(title:(post-rock)^4 OR creator:(post-rock)^3 OR (post-rock))'
		);
		expect(buildRelevanceQuery('hip-hop mixtape')).toBe(
			'(title:(hip-hop mixtape)^4 OR creator:(hip-hop mixtape)^3 OR (hip-hop mixtape))'
		);
	});

	it('is applied to the advancedsearch q parameter', async () => {
		const fetchMock = vi.fn(async (_url: string) => ({
			ok: true,
			json: async () => ({ response: { numFound: 0, start: 0, docs: [] } })
		}));
		vi.stubGlobal('fetch', fetchMock);

		const { search } = await import('$lib/services/internetArchive');
		const { cache } = await import('$lib/utils/cache');
		cache.clear();
		await search({ query: 'unique relevance probe' });

		// A relevance search on page 1 issues two queries: the broad one and
		// the exact title/creator pass whose hits are placed in front of it.
		const queries = fetchMock.mock.calls.map(
			(call) => new URL(String(call[0])).searchParams.get('q') ?? ''
		);
		const broad = queries.find((q) => q.includes('^4'));
		expect(broad, 'broad relevance query was not issued').toBeDefined();
		expect(broad).toContain('title:(unique relevance probe)^4');
		expect(broad).toContain('creator:(unique relevance probe)^3');
		expect(broad).toContain('AND mediatype:audio');
		vi.unstubAllGlobals();
	});
});

describe('exact title/creator pass', () => {
	// advancedsearch ignores `^` boosts — verified against the live API, where
	// the boosted and unboosted forms return the same documents in the same
	// order. Ordering therefore has to come from running a precise query and
	// putting its hits first.
	beforeEach(async () => (await import('$lib/utils/cache')).cache.clear());
	afterEach(() => vi.unstubAllGlobals());

	function mockSearch(byQuery: (q: string) => string[]) {
		return vi.fn(async (url: string) => {
			const q = new URL(String(url)).searchParams.get('q') ?? '';
			const ids = byQuery(q);
			return {
				ok: true,
				json: async () => ({
					response: {
						numFound: ids.length,
						start: 0,
						docs: ids.map((id) => ({ identifier: id, title: id, creator: 'x' }))
					}
				})
			};
		});
	}

	it('asks for the phrase on title and creator, filtered like the broad query', async () => {
		const fetchMock = mockSearch(() => []);
		vi.stubGlobal('fetch', fetchMock);

		const { search } = await import('$lib/services/internetArchive');
		await search({ query: 'explosions in the sky' });

		const exact = fetchMock.mock.calls
			.map((c) => new URL(String(c[0])).searchParams.get('q') ?? '')
			.find((q) => q.includes('title:"'));
		expect(exact, 'no exact-match query was issued').toBeDefined();
		expect(exact).toContain('title:"explosions in the sky"');
		expect(exact).toContain('creator:"explosions in the sky"');
		expect(exact).toContain('AND mediatype:audio');
	});

	it('puts exact matches first and does not duplicate them', async () => {
		const fetchMock = mockSearch((q) =>
			q.includes('title:"') ? ['the-band'] : ['noise-1', 'the-band', 'noise-2']
		);
		vi.stubGlobal('fetch', fetchMock);

		const { search } = await import('$lib/services/internetArchive');
		const result = await search({ query: 'explosions in the sky' });

		expect(result.items.map((i) => i.identifier)).toEqual(['the-band', 'noise-1', 'noise-2']);
	});

	it('leaves the broad results alone when nothing matches exactly', async () => {
		const fetchMock = mockSearch((q) => (q.includes('title:"') ? [] : ['a', 'b']));
		vi.stubGlobal('fetch', fetchMock);

		const { search } = await import('$lib/services/internetArchive');
		const result = await search({ query: 'something obscure' });
		expect(result.items.map((i) => i.identifier)).toEqual(['a', 'b']);
	});

	it('is skipped past page 1 and under an explicit sort', async () => {
		// Later pages have already shown those few hits, and asking for
		// date/downloads order means the user does not want "best match".
		for (const params of [
			{ query: 'x', page: 2 },
			{ query: 'x', sort: 'downloads' as const },
			{ query: 'x', sort: 'date' as const }
		]) {
			const fetchMock = mockSearch(() => []);
			vi.stubGlobal('fetch', fetchMock);
			(await import('$lib/utils/cache')).cache.clear();

			const { search } = await import('$lib/services/internetArchive');
			await search(params);

			const issued = fetchMock.mock.calls.map(
				(c) => new URL(String(c[0])).searchParams.get('q') ?? ''
			);
			expect(issued.some((q) => q.includes('title:"')), JSON.stringify(params)).toBe(false);
		}
	});

	it('survives the precision pass failing', async () => {
		const fetchMock = vi.fn(async (url: string) => {
			const q = new URL(String(url)).searchParams.get('q') ?? '';
			if (q.includes('title:"')) throw new Error('Network error');
			return {
				ok: true,
				json: async () => ({
					response: { numFound: 1, start: 0, docs: [{ identifier: 'a', title: 'a' }] }
				})
			};
		});
		vi.stubGlobal('fetch', fetchMock);

		const { search } = await import('$lib/services/internetArchive');
		const result = await search({ query: 'anything' });
		expect(result.items.map((i) => i.identifier)).toEqual(['a']);
	});
});
