// Internet Archive API client

import type {
	SearchParams,
	SearchResult,
	Track
} from '$lib/types';
import {
	IA_BASE_URL,
	IA_SEARCH_URL,
	IA_METADATA_URL,
	IA_DOWNLOAD_URL,
	AUDIO_FORMATS,
	CONFIG
} from '$lib/utils/constants';
import { withCache } from '$lib/utils/cache';
import { fetchWithRetry } from '$lib/utils/retry';
import type { AudioQuality } from '$lib/types';
import { browser } from '$app/environment';
import { offlineStorage } from './offlineStorage';
import { IASearchResponseSchema, IAMetadataResponseSchema } from '$lib/schemas/archive';
import type { IAMetadataResponse } from '$lib/schemas/archive';
import { requestDeduplicator } from '$lib/utils/requestDeduplication';

// Cached quality preference (Issue #9 - avoid repeated localStorage reads)
let cachedQualityPreference: AudioQuality | null = null;

// Get quality preference from settings (browser only)
function getQualityPreference(): AudioQuality {
	if (!browser) return 'medium';

	// Use memory cache
	if (cachedQualityPreference !== null) {
		return cachedQualityPreference;
	}

	try {
		const stored = localStorage.getItem('dustic-profile');
		if (!stored) {
			cachedQualityPreference = 'medium';
			return 'medium';
		}

		const profile = JSON.parse(stored);
		const quality: AudioQuality = profile?.settings?.audioQuality || 'medium';
		cachedQualityPreference = quality;
		return quality;
	} catch {
		cachedQualityPreference = 'medium';
		return 'medium';
	}
}

// Export function to invalidate cache when settings change
export function invalidateQualityCache(): void {
	cachedQualityPreference = null;
}

/**
 * Clean a search input that might be a URL or identifier
 * Strips archive.org URLs, trims whitespace
 */
function cleanSearchInput(input: string): string {
	let cleaned = input.trim();

	// Strip full archive.org URLs
	// Handles: https://archive.org/details/identifier, /metadata/identifier, /download/identifier
	const urlPatterns = [
		/^https?:\/\/(?:www\.)?archive\.org\/details\/([^\s/?#]+)/i,
		/^https?:\/\/(?:www\.)?archive\.org\/metadata\/([^\s/?#]+)/i,
		/^https?:\/\/(?:www\.)?archive\.org\/download\/([^\s/?#]+)/i
	];

	for (const pattern of urlPatterns) {
		const match = cleaned.match(pattern);
		if (match) {
			cleaned = match[1];
			break;
		}
	}

	// Normalize IA field syntax: fix "creator: "value"" → "creator:"value""
	// (remove space between field name colon and quoted value)
	cleaned = cleaned.replace(/\b(creator|subject|title|identifier|collection|mediatype|format):\s+"/gi, '$1:"');

	return cleaned;
}

/**
 * Check if a string looks like an Archive.org identifier
 * Identifiers: alphanumeric, hyphens, dots, underscores, no spaces
 */
function looksLikeIdentifier(input: string): boolean {
	if (!input || input.length === 0) return false;
	// If it contains spaces, it's likely a natural language query
	if (input.includes(' ')) return false;
	// Must match typical identifier pattern
	if (!/^[a-zA-Z0-9._-]+$/.test(input)) return false;
	// Require either a separator character (hyphen, dot, underscore) or length > 12
	// to avoid treating simple words like "jazz" as identifiers
	return /[._-]/.test(input) || input.length > 12;
}

/**
 * Try to resolve an identifier directly via the Metadata API
 * Returns a SearchResult with the item if found, or null if not
 */
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
			title: doc.title || 'Untitled',
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

	// Strategy 5: Try without restrictive format filters (for edge cases)
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

	let q = query;

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
		const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
		const rawData = await response.json();
		const data = IASearchResponseSchema.parse(rawData);

		const items: Track[] = data.response.docs.map((doc) => ({
			identifier: doc.identifier,
			filename: '',
			title: doc.title || 'Untitled',
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
			title: doc.title || 'Untitled',
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
export async function search(params: SearchParams): Promise<SearchResult> {
	const {
		query,
		collection = [],
		format = [],
		sort = 'relevance',
		page = 1,
		pageSize = CONFIG.defaultPageSize
	} = params;

	// Build search query
	let q = query;

	// Add mediatype filter for audio
	q += ` AND mediatype:audio`;

	// Add collection filter if specified
	if (collection.length > 0) {
		const collectionQuery = collection.map((c) => `collection:(${c})`).join(' OR ');
		q += ` AND (${collectionQuery})`;
	}

	// Add specific format filter only if requested
	// Otherwise, ensure the item has at least one common audio format
	if (format.length > 0) {
		const formatQuery = format.map((f) => `format:(${f})`).join(' OR ');
		q += ` AND (${formatQuery})`;
	} else {
		// Minimal format filter — mediatype:audio already limits to audio items,
		// so we only need the most common playable formats to keep URLs small
		q += ` AND (format:"MP3" OR format:"VBR MP3" OR format:"Ogg Vorbis" OR format:"FLAC")`;
	}

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
	}

	const url = `${IA_SEARCH_URL}?${urlParams.toString()}`;

	// Log search query for debugging
	console.log('[IA Search] Query:', q);
	console.log('[IA Search] URL:', url);

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
		const items: Track[] = data.response.docs.map((doc) => ({
			identifier: doc.identifier,
			filename: '', // Will be populated when fetching full metadata
			title: doc.title || 'Untitled',
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
			streamUrl: '', // Will be populated when playing
			thumbnailUrl: getThumbnailUrl(doc.identifier),
			metadata: doc
		}));

		console.log(`[IA Search] Found ${data.response.numFound} results, returning ${items.length} items`);

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
export async function getItemMetadata(identifier: string): Promise<IAMetadataResponse> {
	const url = `${IA_METADATA_URL}/${identifier}`;

	// Request deduplication (Issue #7) + caching + validation
	return requestDeduplicator.dedupe(`metadata:${identifier}`, async () => {
		try {
			// Cache metadata for 1 hour with Zod validation
			return await withCache(
				`metadata:${identifier}`,
				async () => {
					const response = await fetchWithRetry(url, {}, { maxAttempts: 3 });
					const rawData = await response.json();

					// Check for dark/private items before Zod validation
					if (rawData.is_dark) {
						throw new Error(`Item "${identifier}" is restricted (dark archive). It has been made unavailable.`);
					}

					// Check for API-level errors (e.g., item not found returns {error: "..."}})
					if (rawData.error) {
						throw new Error(`Item "${identifier}" not found: ${rawData.error}`);
					}

					// Empty metadata means item doesn't exist
					if (!rawData.metadata || Object.keys(rawData.metadata).length === 0) {
						throw new Error(`Item "${identifier}" does not exist on Internet Archive.`);
					}

					return IAMetadataResponseSchema.parse(rawData); // Validate with Zod
				},
				60 * 60 * 1000 // 1 hour (aggressive caching)
			);
		} catch (error: any) {
			console.error('Metadata fetch error:', error);

			// Provide specific error messages
			if (error.status === 404) {
				throw new Error(`Item "${identifier}" not found on Internet Archive.`);
			} else if (error.status === 429) {
				throw new Error('Too many requests. Please wait a moment and try again.');
			} else if (error.message?.includes('restricted') || error.message?.includes('dark archive')) {
				throw error; // Pass through dark/restricted errors
			} else if (error.message?.includes('does not exist')) {
				throw error; // Pass through not-found errors
			} else if (error.message?.includes('not found:')) {
				throw error; // Pass through API errors
			} else if (error.message?.includes('fetch') || error.message?.includes('network')) {
				throw new Error('Network error. Please check your internet connection.');
			}

			throw new Error(`Failed to fetch metadata for "${identifier}".`);
		}
	});
}

/**
 * Get format priority based on quality preference
 */
function getFormatPriority(quality: AudioQuality): string[] {
	switch (quality) {
		case 'lowest':
			// Prefer smaller files: low bitrate MP3, Ogg Vorbis
			return ['64kbps mp3', '128kbps mp3', 'ogg vorbis', 'ogg', 'vbr mp3', 'mp3', 'flac'];
		case 'best':
			// Prefer lossless and high quality: FLAC, high bitrate MP3
			return ['flac', '320kbps mp3', 'vbr mp3', 'mp3', 'ogg', 'm4a'];
		case 'medium':
		default:
			// Balanced: good quality MP3, Ogg
			return ['vbr mp3', '128kbps mp3', 'mp3', 'ogg', 'flac', 'm4a', 'aac'];
	}
}

/**
 * Parse duration from Archive.org's length field
 * Handles multiple formats: seconds as string ("1322.5"), MM:SS ("22:32"), HH:MM:SS ("1:22:32")
 */
function parseDuration(lengthString?: string): number | undefined {
	if (!lengthString) return undefined;

	// Check if it's in time format (contains colon)
	if (lengthString.includes(':')) {
		const parts = lengthString.split(':').map(p => parseInt(p, 10));

		if (parts.length === 2) {
			// MM:SS format
			const [minutes, seconds] = parts;
			return minutes * 60 + seconds;
		} else if (parts.length === 3) {
			// HH:MM:SS format
			const [hours, minutes, seconds] = parts;
			return hours * 3600 + minutes * 60 + seconds;
		}
	}

	// Otherwise, assume it's seconds as a string
	const parsed = parseFloat(lengthString);
	return isNaN(parsed) ? undefined : parsed;
}

/**
 * Get the best audio file from an item's file list based on quality preference
 */
export function getBestAudioFile(
	files: IAMetadataResponse['files'],
	quality: AudioQuality = 'medium'
): {
	filename: string;
	format: string;
	duration?: number;
} | null {
	const allAudioFiles = getAllAudioFiles(files, quality);
	return allAudioFiles.length > 0 ? allAudioFiles[0] : null;
}

/**
 * Fetch and parse Essentia metadata file for an audio file
 * Archive.org pre-extracts ID3 tags/metadata into _esshigh.json.gz files
 */
async function fetchEssentiaMetadata(identifier: string, filename: string): Promise<{ title?: string; artist?: string; album?: string; tracknumber?: string } | null> {
	// Strip extension from filename and add _esshigh.json.gz
	const baseName = filename.replace(/\.[^.]+$/, '');
	const metadataFilename = `${baseName}_esshigh.json.gz`;
	const url = `https://archive.org/download/${identifier}/${metadataFilename}`;

	try {
		console.log(`[IA] Fetching Essentia metadata: ${metadataFilename}`);
		const response = await fetchWithRetry(url, {}, { maxAttempts: 1 });

		if (!response.ok) {
			console.log(`[IA] Essentia metadata not found for ${filename}`);
			return null;
		}

		// The response is gzip-compressed JSON
		const blob = await response.blob();
		const decompressed = await decompressGzip(blob);
		const json = JSON.parse(decompressed);

		// Extract tags from the Essentia metadata structure
		const tags = json?.metadata?.tags;
		if (!tags) {
			console.log(`[IA] No tags in Essentia metadata for ${filename}`);
			return null;
		}

		// Tags are arrays, take first element
		const title = Array.isArray(tags.title) ? tags.title[0] : tags.title;
		const artist = Array.isArray(tags.artist) ? tags.artist[0] : tags.artist;
		const album = Array.isArray(tags.album) ? tags.album[0] : tags.album;
		const tracknumber = Array.isArray(tags.tracknumber) ? tags.tracknumber[0] : tags.tracknumber;

		console.log(`[IA] Extracted from Essentia: "${title}" by "${artist}" (track ${tracknumber})`);
		return { title, artist, album, tracknumber };
	} catch (error) {
		console.warn(`[IA] Failed to fetch Essentia metadata for ${filename}:`, error);
		return null;
	}
}

/**
 * Decompress gzip data from a Blob
 */
async function decompressGzip(blob: Blob): Promise<string> {
	if (typeof DecompressionStream === 'undefined') {
		// Fallback for environments without DecompressionStream
		console.warn('[IA] DecompressionStream not supported, skipping metadata extraction');
		throw new Error('DecompressionStream not supported');
	}

	const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
	const decompressed = await new Response(stream).text();
	return decompressed;
}

/**
 * Get all audio files from an item's file list, sorted by quality preference and filename
 */
export function getAllAudioFiles(
	files: IAMetadataResponse['files'],
	quality: AudioQuality = 'medium'
): {
	filename: string;
	format: string;
	duration?: number;
}[] {
	const formatPriority = getFormatPriority(quality);

	// Filter for audio files - be more permissive
	const audioFiles = files.filter((file) => {
		if (!file.name || !file.format) return false;

		const format = file.format.toLowerCase();
		const name = file.name.toLowerCase();

		// Exclude Mac OS metadata files
		// __MACOSX folders contain resource forks and metadata
		if (file.name.includes('__MACOSX/')) return false;

		// Files starting with ._ are Mac OS resource fork files
		const filename = file.name.split('/').pop() || '';
		if (filename.startsWith('._')) return false;

		// Check if format matches known audio formats
		if (AUDIO_FORMATS.includes(format)) return true;

		// Also check file extension as fallback
		const ext = name.split('.').pop() || '';
		return AUDIO_FORMATS.includes(ext);
	});

	if (audioFiles.length === 0) {
		console.warn('No audio files found in:', files.map(f => `${f.name} (${f.format})`));
		return [];
	}

	// Sort by format priority first, then by filename for chapters
	audioFiles.sort((a, b) => {
		const aFormat = a.format?.toLowerCase() || a.name.split('.').pop() || '';
		const bFormat = b.format?.toLowerCase() || b.name.split('.').pop() || '';

		const aPriority = formatPriority.indexOf(aFormat);
		const bPriority = formatPriority.indexOf(bFormat);

		// If same format, sort by filename (for chapters)
		if (aPriority === bPriority) {
			return a.name.localeCompare(b.name);
		}

		return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
	});

	// Deduplicate: Keep only the best format for each unique track
	// Archive.org items often have the same tracks in multiple formats (MP3, FLAC, OGG, etc.)
	// We group by base filename (without extension) and keep only the first (best priority) format
	const seenTracks = new Map<string, typeof audioFiles[0]>();

	for (const file of audioFiles) {
		// Extract base name without extension for grouping
		// e.g., "01-Storm.flac" and "01-Storm.mp3" both become "01-Storm"
		const baseName = file.name.replace(/\.[^.]+$/, '');

		// Keep only the first occurrence (highest priority format)
		if (!seenTracks.has(baseName)) {
			seenTracks.set(baseName, file);
		}
	}

	const deduplicatedFiles = Array.from(seenTracks.values());

	console.log(`[IA] Found ${audioFiles.length} audio files, deduplicated to ${deduplicatedFiles.length} tracks`);

	return deduplicatedFiles.map(file => ({
		filename: file.name,
		format: file.format || file.name.split('.').pop() || 'mp3',
		duration: parseDuration(file.length)
	}));
}

/**
 * Build stream URL for a file
 * Use /serve/ endpoint which is optimized for streaming and has better CDN support
 */
export function getStreamUrl(identifier: string, filename: string): string {
	// Use /serve/ endpoint for better streaming performance
	// Falls back to /download/ if serve is not available
	const streamUrl = `https://archive.org/serve/${identifier}/${filename}`;

	// Try direct streaming first (Archive.org supports CORS)
	// The CORS proxy doesn't work on Cloudflare Pages
	console.log('[IA] Stream URL:', streamUrl);
	return streamUrl;

	// Proxy version (disabled - doesn't work on Cloudflare Pages):
	// return `/api/cors-proxy?url=${encodeURIComponent(streamUrl)}`;
}

/**
 * Get thumbnail URL for an item
 * Use higher quality version for better display on modern devices
 */
export function getThumbnailUrl(identifier: string, size: 'default' | 'large' = 'default'): string {
	// Archive.org images don't support CORS, use weserv.nl proxy
	const imageUrl = `https://archive.org/services/img/${identifier}`;

	// Use weserv.nl to proxy the image with CORS support
	// It also provides image optimization and fallback handling
	const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&w=512&h=512&fit=cover&output=jpg&default=${encodeURIComponent('https://placehold.co/512x512/1f2937/white?text=No+Image')}`;

	console.log('[IA] Thumbnail URL:', proxyUrl);
	return proxyUrl;
}

/**
 * Fetch full track details including playable URL (uses current quality preference)
 */
export async function getTrack(identifier: string, quality?: AudioQuality): Promise<Track | null> {
	const qualityToUse = quality || getQualityPreference();
	try {
		const [itemIdentifier, trackIndexStr] = identifier.split('#');
		const trackIndex = trackIndexStr ? parseInt(trackIndexStr, 10) : 0;

		const metadata = await getItemMetadata(itemIdentifier);
		const allAudioFiles = getAllAudioFiles(metadata.files, qualityToUse);
		const audioFile = allAudioFiles[trackIndex];

		if (!audioFile) {
			console.warn(`No audio file found for ${identifier}`);
			return null;
		}

		// Try to get embedded metadata from Essentia JSON
		const essentiaMetadata = await fetchEssentiaMetadata(itemIdentifier, audioFile.filename);

		// Build title: if this is a multi-track item and Essentia has a title, prefix with track number
		let title: string;
		if (trackIndexStr) {
			if (essentiaMetadata?.title) {
				// Use track number from metadata or fall back to trackIndex + 1
				const trackNum = essentiaMetadata.tracknumber || (trackIndex + 1).toString();
				// Pad single digits with leading zero if not already padded
				const paddedNum = trackNum.length === 1 ? `0${trackNum}` : trackNum;
				title = `${paddedNum}. ${essentiaMetadata.title}`;
			} else {
				title = extractChapterTitle(audioFile.filename, trackIndex + 1, metadata.metadata.title);
			}
		} else {
			title = metadata.metadata.title || 'Untitled';
		}

		const artist = essentiaMetadata?.artist
			|| (Array.isArray(metadata.metadata.creator)
				? metadata.metadata.creator[0]
				: metadata.metadata.creator || 'Unknown Artist');

		const track: Track = {
			identifier,
			filename: audioFile.filename,
			title,
			artist,
			album: essentiaMetadata?.album || metadata.metadata.title,
			date: metadata.metadata.date,
			duration: audioFile.duration,
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
			format: audioFile.format,
			streamUrl: getStreamUrl(itemIdentifier, audioFile.filename),
			thumbnailUrl: getThumbnailUrl(itemIdentifier),
			metadata: metadata.metadata
		};

		return track;
	} catch (error) {
		console.error(`Error fetching track ${identifier}:`, error);
		// Try offline fallback
		try {
			const offlineTrack = await offlineStorage.getOfflineTrack(identifier);
			if (offlineTrack) {
				return offlineTrack;
			}
		} catch (offlineError) {
			console.error('Offline fallback failed:', offlineError);
		}
		return null;
	}
}

/**
 * Get all chapters/tracks from an item (uses current quality preference)
 */
export async function getAllTracks(identifier: string, quality?: AudioQuality): Promise<Track[]> {
	const qualityToUse = quality || getQualityPreference();
	try {
		const metadata = await getItemMetadata(identifier);
		const audioFiles = getAllAudioFiles(metadata.files, qualityToUse);

		if (audioFiles.length === 0) {
			console.warn(`No audio files found for ${identifier}`);
			return [];
		}

		// Fetch Essentia metadata for all tracks in parallel
		const trackPromises = audioFiles.map(async (audioFile, index) => {
			// Try to get embedded metadata from Essentia JSON
			const essentiaMetadata = await fetchEssentiaMetadata(identifier, audioFile.filename);

			// Build title: if Essentia has a title, prefix it with track number
			let title: string;
			if (essentiaMetadata?.title) {
				// Use track number from metadata or fall back to index + 1
				const trackNum = essentiaMetadata.tracknumber || (index + 1).toString();
				// Pad single digits with leading zero if not already padded
				const paddedNum = trackNum.length === 1 ? `0${trackNum}` : trackNum;
				title = `${paddedNum}. ${essentiaMetadata.title}`;
			} else {
				title = extractChapterTitle(audioFile.filename, index + 1, metadata.metadata.title);
			}

			const artist = essentiaMetadata?.artist
				|| (Array.isArray(metadata.metadata.creator)
					? metadata.metadata.creator[0]
					: metadata.metadata.creator || 'Unknown Artist');

			return {
				identifier: `${identifier}#${index}`,
				filename: audioFile.filename,
				title,
				artist,
				album: essentiaMetadata?.album || metadata.metadata.title,
				date: metadata.metadata.date,
				duration: audioFile.duration,
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
				format: audioFile.format,
				streamUrl: getStreamUrl(identifier, audioFile.filename),
				thumbnailUrl: getThumbnailUrl(identifier),
				metadata: metadata.metadata
			};
		});

		const tracks = await Promise.all(trackPromises);
		return tracks;
	} catch (error) {
		console.error(`Error fetching tracks for ${identifier}:`, error);
		// Fallback: search offline storage for tracks belonging to this item
		try {
			const allOffline = await offlineStorage.getAllTracks();
			const itemTracks = allOffline
				.filter(
					(t) =>
						t.track.identifier.startsWith(identifier + '#') || t.track.identifier === identifier
				)
				.map((t) => t.track);

			// Sort by index
			itemTracks.sort((a, b) => {
				const idxA = parseInt(a.identifier.split('#')[1] || '0');
				const idxB = parseInt(b.identifier.split('#')[1] || '0');
				return idxA - idxB;
			});

			return itemTracks;
		} catch (offlineError) {
			console.error('Offline fallback failed:', offlineError);
		}
		return [];
	}
}

/**
 * Extract a readable chapter title from filename
 */
function extractChapterTitle(filename: string, chapterNumber: number, albumTitle?: string): string {
	// Log for debugging duplicate titles
	console.log(`[extractChapterTitle] Processing: "${filename}" (index ${chapterNumber})`);

	// Remove file extension
	const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

	// Try to extract chapter/track number and title
	// Common patterns: "01 - Title.mp3", "Chapter 1 - Title.mp3", "trackNN.mp3"
	const patterns = [
		/(?:chapter|ch|track|pt)[\s_-]*(\d+)[\s_-]*[-:]?[\s_-]*(.+)/i,
		/^(\d+)[\s_-]*[-:]?[\s_-]*(.+)/,
		/(.+?)[\s_-]*[-:]?[\s_-]*(\d+)$/
	];

	for (const pattern of patterns) {
		const match = nameWithoutExt.match(pattern);
		if (match && match[2]) {
			const title = match[2].trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
			console.log(`[extractChapterTitle] Extracted: "${title}"`);
			return title;
		}
	}

	// If no pattern matches, use the filename as-is, cleaned up
	const cleaned = nameWithoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

	// If it's just a number or very short, prefix with "Chapter"
	if (cleaned.length < 5 || /^\d+$/.test(cleaned)) {
		const title = `Chapter ${chapterNumber}`;
		console.log(`[extractChapterTitle] Using chapter number: "${title}"`);
		return title;
	}

	console.log(`[extractChapterTitle] Using cleaned filename: "${cleaned}"`);
	return cleaned;
}
