// Internet Archive: search.
//
// Note the shape of this file: a cascade of strategies, because
// advancedsearch ignores boost operators and will not rank for us. See
// searchExactMatches for the measurement behind that.

import type { SearchParams, SearchResult, Track, AudioQuality } from '$lib/types';
import {
	IA_BASE_URL,
	IA_SEARCH_URL,
	IA_METADATA_URL,
	IA_DOWNLOAD_URL,
	AUDIO_FORMATS,
	CONFIG
} from '$lib/utils/constants';
import { withCache } from '$lib/utils/cache';
import { isUnplayableItemError } from '$lib/stores/unavailable';
import { fetchWithRetry } from '$lib/utils/retry';
import { browser } from '$app/environment';
import { offlineStorage } from '../offlineStorage';
import { IASearchResponseSchema, IAMetadataResponseSchema } from '$lib/schemas/archive';
import type { IAMetadataResponse } from '$lib/schemas/archive';
import { requestDeduplicator } from '$lib/utils/requestDeduplication';
import {
	cleanSearchInput,
	docToTrack,
	buildRelevanceQuery,
	isPlainTextQuery,
	looksLikeIdentifier,
	getThumbnailUrl,
	SEARCH_FIELDS
} from './query';

async function resolveIdentifier(identifier: string): Promise<SearchResult | null> {
	const url = `${IA_METADATA_URL}/${identifier}`;
	console.log(`[IA] Trying direct metadata lookup: ${identifier}`);

	try {
		const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
		const rawData = await response.json();

		// Check for dark/private items
		if (rawData.is_dark) {
			console.warn(`[IA] Item "${identifier}" is dark (restricted)`);
			return { items: [], total: 0, page: 1, pageSize: 1, error: `Item "${identifier}" is restricted (dark archive). It has been made unavailable.` };
		}

		// Check for explicit error from API
		if (rawData.error) {
			console.warn(`[IA] Metadata error for "${identifier}":`, rawData.error);
			return null; // Let fallback handle it
		}

		// Empty metadata means item doesn't exist
		if (!rawData.metadata || Object.keys(rawData.metadata).length === 0) {
			console.log(`[IA] No metadata for "${identifier}"`);
			return null;
		}

		// Validate with Zod
		const metadata = IAMetadataResponseSchema.parse(rawData);

		const item: Track = {
			identifier: metadata.metadata.identifier,
			filename: '',
			title: metadata.metadata.title || 'Untitled',
			artist: Array.isArray(metadata.metadata.creator)
				? metadata.metadata.creator[0]
				: metadata.metadata.creator || 'Unknown Artist',
			date: metadata.metadata.date,
			collection: Array.isArray(metadata.metadata.collection)
				? metadata.metadata.collection
				: metadata.metadata.collection
					? [metadata.metadata.collection]
					: [],
			genre: Array.isArray(metadata.metadata.subject)
				? metadata.metadata.subject
				: metadata.metadata.subject
					? [metadata.metadata.subject]
					: undefined,
			format: 'mp3',
			streamUrl: '',
			thumbnailUrl: getThumbnailUrl(metadata.metadata.identifier),
			metadata: metadata.metadata
		};

		console.log(`[IA] Direct lookup succeeded: "${item.title}"`);
		return { items: [item], total: 1, page: 1, pageSize: 1 };
	} catch (error: any) {
		if (error?.status === 404 || error?.message?.includes('404')) {
			console.log(`[IA] Item "${identifier}" not found via direct lookup`);
		} else {
			console.warn(`[IA] Direct lookup failed for "${identifier}":`, error?.message || error);
		}
		return null;
	}
}

/**
 * Search by identifier field using the Advanced Search API
 * Catches items that text search misses (e.g., identifiers with dots)
 * Tries exact match first, then wildcard if no results
 */
async function searchByIdentifier(identifier: string, useWildcard = false): Promise<SearchResult | null> {
	// For exact search, use the identifier as-is
	// For wildcard search, add * at the end to catch variants (e.g., dmst2004-10-13*)
	const q = useWildcard ? `identifier:${identifier}*` : `identifier:${identifier}`;
	const urlParams = new URLSearchParams({
		q,
		fl: ['identifier', 'title', 'creator', 'date', 'subject', 'format', 'collection', 'downloads'].join(','),
		rows: '10',
		page: '1',
		output: 'json',
		sort: 'downloads desc' // Prefer most popular when using wildcard
	});

	const url = `${IA_SEARCH_URL}?${urlParams.toString()}`;
	console.log(`[IA] Trying identifier field search${useWildcard ? ' (wildcard)' : ''}: ${q}`);

	try {
		const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
		const rawData = await response.json();
		const data = IASearchResponseSchema.parse(rawData);

		if (data.response.docs.length === 0) {
			// If exact match failed and we haven't tried wildcard yet, try it
			if (!useWildcard) {
				console.log(`[IA] No exact match, trying wildcard search`);
				return searchByIdentifier(identifier, true);
			}
			console.log(`[IA] No results for identifier field search: ${identifier}`);
			return null;
		}

		const items: Track[] = data.response.docs.map((doc) => ({
			identifier: doc.identifier,
			filename: '',
			title: Array.isArray(doc.title) ? doc.title[0] : (doc.title || 'Untitled'),
			artist: Array.isArray(doc.creator)
				? doc.creator[0]
				: doc.creator || 'Unknown Artist',
			date: doc.date,
			collection: Array.isArray(doc.collection) ? doc.collection : doc.collection ? [doc.collection] : [],
			genre: Array.isArray(doc.subject)
				? doc.subject
				: doc.subject
					? [doc.subject]
					: undefined,
			format: Array.isArray(doc.format) ? doc.format[0] : doc.format || 'mp3',
			streamUrl: '',
			thumbnailUrl: getThumbnailUrl(doc.identifier),
			metadata: doc
		}));

		console.log(`[IA] Identifier field search found ${items.length} result(s)`);
		return { items, total: data.response.numFound, page: 1, pageSize: 10 };
	} catch (error) {
		console.warn('[IA] Identifier field search failed:', error);
		return null;
	}
}

/**
 * Fetch display metadata for many items in one advancedsearch request
 * (chunked). Used by the favorites page: one query for N favorites
 * instead of N metadata calls. Returned tracks have no streamUrl —
 * playback resolves it lazily via getTrack.
 */
export async function fetchItemsByIdentifiers(identifiers: string[]): Promise<Map<string, Track>> {
	const found = new Map<string, Track>();
	if (identifiers.length === 0) return found;

	const CHUNK = 50; // keep the q= parameter well under URL length limits
	const chunks: string[][] = [];
	for (let i = 0; i < identifiers.length; i += CHUNK) {
		chunks.push(identifiers.slice(i, i + CHUNK));
	}

	await Promise.all(
		chunks.map(async (chunk) => {
			const q = `identifier:(${chunk.join(' OR ')})`;
			const urlParams = new URLSearchParams({
				q,
				fl: ['identifier', 'title', 'creator', 'date', 'subject', 'format', 'collection'].join(','),
				rows: String(chunk.length),
				page: '1',
				output: 'json'
			});
			const url = `${IA_SEARCH_URL}?${urlParams.toString()}`;

			const data = await withCache(
				`ia:batch:${q}`,
				async () => {
					const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
					const rawData = await response.json();
					return IASearchResponseSchema.parse(rawData);
				},
				3 * 60 * 1000
			);

			for (const doc of data.response.docs) {
				found.set(doc.identifier, {
					identifier: doc.identifier,
					filename: '',
					title: Array.isArray(doc.title) ? doc.title[0] : doc.title || 'Untitled',
					artist: Array.isArray(doc.creator) ? doc.creator[0] : doc.creator || 'Unknown Artist',
					date: doc.date,
					collection: Array.isArray(doc.collection) ? doc.collection : doc.collection ? [doc.collection] : [],
					genre: Array.isArray(doc.subject) ? doc.subject : doc.subject ? [doc.subject] : undefined,
					format: Array.isArray(doc.format) ? doc.format[0] : doc.format || 'mp3',
					streamUrl: '',
					thumbnailUrl: getThumbnailUrl(doc.identifier),
					metadata: doc
				});
			}
		})
	);

	return found;
}

/**
 * Extract potential identifier from concert title patterns
 * e.g., "Mono Live at Venue on 2010-03-21" → "mono2010-03-21"
 */
function extractPotentialIdentifier(title: string): string | null {
	// Pattern: "Artist Live at Venue on YYYY-MM-DD"
	const concertPattern = /^(.+?)\s+(?:Live\s+at|@)\s+.+?\s+on\s+(\d{4}[-]\d{2}[-]\d{2})/i;
	const match = title.match(concertPattern);

	if (match) {
		const artist = match[1].trim();
		const date = match[2].replace(/-/g, '-'); // Keep hyphens

		// Create potential identifiers
		// Common patterns: "artistYYYY-MM-DD", "artist-YYYY-MM-DD", "artistYYYYMMDD"
		const artistSlug = artist.toLowerCase()
			.replace(/\s+/g, '')  // Remove spaces
			.replace(/[^a-z0-9-]/g, ''); // Remove special chars except hyphens

		return `${artistSlug}${date}`;
	}

	return null;
}

/**
 * Smart search: tries multiple strategies to find items
 * 1. Direct identifier lookup (if looks like identifier)
 * 2. Identifier field search (if looks like identifier)
 * 3. Extract potential identifier from concert title pattern
 * 4. Regular text search with filters
 * 5. Text search without format filters (if no results)
 * 6. Creator + date search (for concerts)
 */
export async function smartSearch(params: SearchParams): Promise<SearchResult> {
	const cleaned = cleanSearchInput(params.query);

	// Strategy 1 & 2: If the input looks like an identifier, try direct resolution first
	if (looksLikeIdentifier(cleaned)) {
		// 1. Try direct metadata API lookup
		const directResult = await resolveIdentifier(cleaned);
		if (directResult) {
			if (directResult.error || directResult.items.length > 0) {
				return directResult;
			}
		}

		// 2. Try searching by identifier field (catches partial matches)
		const idSearchResult = await searchByIdentifier(cleaned);
		if (idSearchResult && idSearchResult.items.length > 0) {
			return idSearchResult;
		}

		console.log(`[IA] Identifier lookup failed for "${cleaned}", falling back to text search`);
	}

	// Strategy 3: Try to extract identifier from concert title pattern
	const potentialId = extractPotentialIdentifier(cleaned);
	if (potentialId) {
		console.log(`[IA] Extracted potential identifier: ${potentialId}`);
		const idResult = await searchByIdentifier(potentialId);
		if (idResult && idResult.items.length > 0) {
			return idResult;
		}
	}

	// Strategy 4: Regular text search with format filters
	const textResult = await search({ ...params, query: cleaned });
	if (textResult.items.length > 0) {
		return textResult;
	}

	console.log(`[IA] Text search returned no results, trying without format filters`);

	// Strategy 5: Try without restrictive format filters (for edge cases).
	//
	// This used to be fired speculatively alongside strategy 4 to save a
	// round trip when strategy 4 came back empty. That optimised the rare
	// path at the expense of the common one: it doubled the request count on
	// every successful search, and because the search box is debounced rather
	// than cancelled, a user typing (or backspacing over) a query produced a
	// full extra request per intermediate fragment. Run it only when it is
	// actually needed.
	const noFilterResult = await searchWithoutFormatFilter({ ...params, query: cleaned });
	if (noFilterResult.items.length > 0) {
		return noFilterResult;
	}

	console.log(`[IA] Still no results, trying creator+date search`);

	// Strategy 6: For concert titles, try searching by creator and date
	const concertMatch = cleaned.match(/^(.+?)\s+(?:Live|@)\s+.+?\s+on\s+(\d{4}[-]\d{2}[-]\d{2})/i);
	if (concertMatch) {
		const artist = concertMatch[1].trim();
		const date = concertMatch[2];
		const creatorDateResult = await searchByCreatorAndDate(artist, date);
		if (creatorDateResult && creatorDateResult.items.length > 0) {
			return creatorDateResult;
		}
	}

	// All strategies failed, return empty result
	console.log(`[IA] All search strategies failed for "${cleaned}"`);
	return { items: [], total: 0, page: params.page || 1, pageSize: params.pageSize || 50 };
}

/**
 * Search without format filters (more permissive, catches edge cases)
 */
async function searchWithoutFormatFilter(params: SearchParams): Promise<SearchResult> {
	const {
		query,
		collection = [],
		sort = 'relevance',
		page = 1,
		pageSize = CONFIG.defaultPageSize
	} = params;

	let q = buildRelevanceQuery(query);

	// Add creator filter for artist searches (exact match)
	if (params.creator) {
		q += ` AND creator:"${params.creator}"`;
	}

	// Only add mediatype filter, no format restrictions
	q += ` AND mediatype:audio`;

	// Add collection filter if specified
	if (collection.length > 0) {
		const collectionQuery = collection.map((c) => `collection:(${c})`).join(' OR ');
		q += ` AND (${collectionQuery})`;
	}

	const urlParams = new URLSearchParams({
		q,
		fl: ['identifier', 'title', 'creator', 'date', 'subject', 'format', 'collection', 'downloads'].join(','),
		rows: pageSize.toString(),
		page: page.toString(),
		output: 'json'
	});

	if (sort === 'date') {
		urlParams.set('sort[]', 'date desc');
	} else if (sort === 'downloads') {
		urlParams.set('sort[]', 'downloads desc');
	}

	const url = `${IA_SEARCH_URL}?${urlParams.toString()}`;
	console.log('[IA Search NoFilter] Query:', q);

	try {
		// smartSearch fires this speculatively alongside every text search,
		// so it runs on each keystroke-debounced query, page change and
		// revisit — not only on the zero-result path it exists for. Cached
		// like the primary search, it stops that speculation from doubling
		// the request volume the app puts on archive.org.
		const data = await withCache(
			`search:nofilter:${url}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
				const rawData = await response.json();
				return IASearchResponseSchema.parse(rawData);
			},
			3 * 60 * 1000
		);

		const items: Track[] = data.response.docs.map((doc) => ({
			identifier: doc.identifier,
			filename: '',
			title: Array.isArray(doc.title) ? doc.title[0] : (doc.title || 'Untitled'),
			artist: Array.isArray(doc.creator)
				? doc.creator[0]
				: doc.creator || 'Unknown Artist',
			date: doc.date,
			collection: Array.isArray(doc.collection) ? doc.collection : doc.collection ? [doc.collection] : [],
			genre: Array.isArray(doc.subject)
				? doc.subject
				: doc.subject
					? [doc.subject]
					: undefined,
			format: Array.isArray(doc.format) ? doc.format[0] : doc.format || 'mp3',
			streamUrl: '',
			thumbnailUrl: getThumbnailUrl(doc.identifier),
			metadata: doc
		}));

		console.log(`[IA Search NoFilter] Found ${items.length} results`);
		return { items, total: data.response.numFound, page, pageSize };
	} catch (error) {
		console.warn('[IA Search NoFilter] Failed:', error);
		return { items: [], total: 0, page, pageSize };
	}
}

/**
 * Search by creator (artist) and date for concert recordings
 */
async function searchByCreatorAndDate(creator: string, date: string): Promise<SearchResult | null> {
	const q = `creator:"${creator}" AND date:${date} AND mediatype:audio`;
	const urlParams = new URLSearchParams({
		q,
		fl: ['identifier', 'title', 'creator', 'date', 'subject', 'format', 'collection', 'downloads'].join(','),
		rows: '10',
		page: '1',
		output: 'json'
	});

	const url = `${IA_SEARCH_URL}?${urlParams.toString()}`;
	console.log(`[IA] Trying creator+date search: ${q}`);

	try {
		const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
		const rawData = await response.json();
		const data = IASearchResponseSchema.parse(rawData);

		if (data.response.docs.length === 0) {
			return null;
		}

		const items: Track[] = data.response.docs.map((doc) => ({
			identifier: doc.identifier,
			filename: '',
			title: Array.isArray(doc.title) ? doc.title[0] : (doc.title || 'Untitled'),
			artist: Array.isArray(doc.creator)
				? doc.creator[0]
				: doc.creator || 'Unknown Artist',
			date: doc.date,
			collection: Array.isArray(doc.collection) ? doc.collection : doc.collection ? [doc.collection] : [],
			genre: Array.isArray(doc.subject)
				? doc.subject
				: doc.subject
					? [doc.subject]
					: undefined,
			format: Array.isArray(doc.format) ? doc.format[0] : doc.format || 'mp3',
			streamUrl: '',
			thumbnailUrl: getThumbnailUrl(doc.identifier),
			metadata: doc
		}));

		console.log(`[IA] Creator+date search found ${items.length} result(s)`);
		return { items, total: data.response.numFound, page: 1, pageSize: 10 };
	} catch (error) {
		console.warn('[IA] Creator+date search failed:', error);
		return null;
	}
}

/**
 * Search for audio items in the Internet Archive
 */
/**
 * The filter suffix shared by the broad search and the exact-match pass, so
 * the two only ever differ in how they match the query itself.
 */
function buildSearchFilters(params: SearchParams): string {
	const { collection = [], format = [] } = params;
	let filters = '';

	// Creator filter for artist searches (exact match)
	if (params.creator) {
		filters += ` AND creator:"${params.creator}"`;
	}

	// Genre browsing. Always paired with the collection scope below: on its
	// own `subject:("rock")` matches 368k documents, the bulk of them radio
	// station recordings whose subject lists read like genre tags.
	if (params.subject) {
		filters += ` AND subject:("${params.subject}")`;
	}

	filters += ` AND mediatype:audio`;

	if (collection.length > 0) {
		filters += ` AND (${collection.map((c) => `collection:(${c})`).join(' OR ')})`;
	}

	// Exclusions, for content types that are defined by what they are not.
	for (const excluded of params.excludeCollection ?? []) {
		filters += ` AND NOT collection:(${excluded})`;
	}

	if (format.length > 0) {
		filters += ` AND (${format.map((f) => `format:(${f})`).join(' OR ')})`;
	} else {
		// Minimal format filter — mediatype:audio already limits to audio items,
		// so we only need the most common playable formats to keep URLs small
		filters += ` AND (format:"MP3" OR format:"VBR MP3" OR format:"Ogg Vorbis" OR format:"FLAC")`;
	}

	return filters;
}

/**
 * High-precision pass: items whose *title or creator* contains the query as a
 * phrase.
 *
 * advancedsearch ignores boost operators. Verified against the live API:
 * `(title:(explosions in the sky)^4 OR creator:(...)^3 OR (...))` returns the
 * same 459 documents in the same order as the bare terms, headed by Voice of
 * America broadcasts — the archive indexes descriptions and transcripts, so
 * any programme that says those words somewhere competes with the band. The
 * `^` weights in buildRelevanceQuery therefore do nothing for ordering.
 *
 * A phrase query on the two fields that actually identify a recording does
 * work: `title:"explosions in the sky"` returns 17 items, all of them the
 * band. So the ranking the API will not do is done here instead, by running
 * the precise query alongside the broad one and putting its hits first.
 */
async function searchExactMatches(params: SearchParams, limit = 12): Promise<Track[]> {
	const phrase = params.query.trim();
	if (!phrase || !isPlainTextQuery(phrase)) return [];

	const q = `(title:"${phrase}" OR creator:"${phrase}")${buildSearchFilters(params)}`;
	const urlParams = new URLSearchParams({
		q,
		fl: SEARCH_FIELDS.join(','),
		rows: String(limit),
		page: '1',
		output: 'json'
	});
	const url = `${IA_SEARCH_URL}?${urlParams.toString()}`;

	try {
		const data = await withCache(
			`search:exact:${url}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
				return IASearchResponseSchema.parse(await response.json());
			},
			3 * 60 * 1000
		);
		return data.response.docs.map(docToTrack);
	} catch (error) {
		// Never let the precision pass break the search; the broad results
		// are still perfectly usable on their own.
		console.warn('[IA Search] Exact-match pass failed:', error);
		return [];
	}
}

export async function search(params: SearchParams): Promise<SearchResult> {
	const {
		query,
		sort = 'relevance',
		page = 1,
		pageSize = CONFIG.defaultPageSize
	} = params;

	// Build search query, ranking title/creator matches first. Browsing a
	// genre supplies no search terms at all, so the filters have to be able
	// to stand alone rather than trailing a leading " AND ".
	let q = (buildRelevanceQuery(query) + buildSearchFilters(params)).replace(/^\s*AND\s+/, '');

	// Build URL parameters
	const urlParams = new URLSearchParams({
		q,
		fl: ['identifier', 'title', 'creator', 'date', 'subject', 'format', 'collection', 'downloads'].join(
			','
		),
		rows: pageSize.toString(),
		page: page.toString(),
		output: 'json'
	});

	// Add sort
	if (sort === 'date') {
		urlParams.set('sort[]', 'date desc');
	} else if (sort === 'downloads') {
		urlParams.set('sort[]', 'downloads desc');
	} else if (params.subject && !query?.trim()) {
		// Browsing a genre with no search terms: there is no relevance to
		// rank by, so the archive returns an arbitrary slice of tens of
		// thousands of items. Popularity is the only signal available, and
		// it is what makes the genre pages show records people listen to.
		urlParams.set('sort[]', 'downloads desc');
	}

	const url = `${IA_SEARCH_URL}?${urlParams.toString()}`;

	// Log search query for debugging
	console.log('[IA Search] Query:', q);
	console.log('[IA Search] URL:', url);

	// The precision pass only makes sense for the first page of a relevance
	// ranking: on later pages its handful of hits have already been shown,
	// and under an explicit date/downloads sort the user has asked for a
	// different order than "best match".
	const wantsExactPass = page === 1 && sort === 'relevance' && !!query?.trim();
	const exactPromise = wantsExactPass ? searchExactMatches(params) : Promise.resolve([]);

	try {
		// Use cache and retry logic for search with Zod validation
		const data = await withCache(
			`search:${url}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 3 });
				const rawData = await response.json();
				return IASearchResponseSchema.parse(rawData); // Validate with Zod
			},
			3 * 60 * 1000 // Cache for 3 minutes
		);
		const broad: Track[] = data.response.docs.map(docToTrack);

		// Put phrase matches on title/creator first, then the broad results,
		// dropping anything the exact pass already contributed. Every phrase
		// match also satisfies the broad query, so the total is unaffected.
		const exact = await exactPromise;
		const seen = new Set(exact.map((t) => t.identifier));
		const items = [...exact, ...broad.filter((t) => !seen.has(t.identifier))].slice(0, pageSize);

		console.log(
			`[IA Search] Found ${data.response.numFound} results, returning ${items.length} items` +
				(exact.length ? ` (${exact.length} exact title/creator matches first)` : '')
		);

		return {
			items,
			total: data.response.numFound,
			page,
			pageSize
		};
	} catch (error: any) {
		console.error('Search error:', error);

		// Provide specific error messages
		if (error.status === 429) {
			throw new Error('Too many requests. Please wait a moment and try again.');
		} else if (error.status === 503 || error.status === 504) {
			throw new Error('Internet Archive is experiencing high load. Please try again in a moment.');
		} else if (error.status >= 500) {
			throw new Error('Internet Archive is experiencing issues. Please try again later.');
		} else if (error.message?.includes('fetch') || error.message?.includes('network')) {
			throw new Error('Network error. Please check your internet connection.');
		} else if (error.message?.includes('timeout')) {
			throw new Error('Request timed out. Internet Archive may be slow. Please try again.');
		}

		throw new Error('Failed to search Internet Archive. The service may be temporarily unavailable.');
	}
}

/**
 * Get full metadata for an item including file list
 */
