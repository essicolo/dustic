import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getThumbnailUrl, cleanSearchInput } from '$lib/services/internetArchive';

describe('getThumbnailUrl', () => {
	it('should return a weserv.nl proxied thumbnail URL', () => {
		const identifier = 'test_identifier';
		const result = getThumbnailUrl(identifier);
		expect(result).toContain('images.weserv.nl');
		expect(result).toContain(encodeURIComponent(`https://archive.org/services/img/${identifier}`));
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

		const q = new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('q') ?? '';
		expect(q).toContain('title:(unique relevance probe)^4');
		expect(q).toContain('creator:(unique relevance probe)^3');
		expect(q).toContain('AND mediatype:audio');
		vi.unstubAllGlobals();
	});
});
