// FunkWhale API client - searches public FunkWhale instances
// Supports both API v1 (FunkWhale <2.0) and API v2 (FunkWhale 2.0+)

import type { Track, SearchParams, SearchResult, FunkwhaleInstance } from '$lib/types';
import { DEFAULT_FUNKWHALE_INSTANCES } from '$lib/utils/constants';
import { withCache } from '$lib/utils/cache';
import { fetchWithRetry } from '$lib/utils/retry';
import { browser } from '$app/environment';

// ---- API version detection ----

type ApiVersion = 'v2' | 'v1';

/** Cache of detected API versions per instance */
const apiVersionCache = new Map<string, ApiVersion>();

/**
 * Detect which API version a FunkWhale instance supports.
 * Tries v2 first (FunkWhale 2.0+), falls back to v1.
 */
async function detectApiVersion(baseUrl: string): Promise<ApiVersion> {
	const cached = apiVersionCache.get(baseUrl);
	if (cached) return cached;

	try {
		// Try v2 endpoint first (FunkWhale 2.0+)
		const response = await fetch(`${baseUrl}/api/v2/tracks/?page_size=1`, {
			method: 'GET',
			signal: AbortSignal.timeout(5000)
		});
		if (response.ok) {
			apiVersionCache.set(baseUrl, 'v2');
			console.log(`[FW] ${baseUrl} uses API v2`);
			return 'v2';
		}
	} catch {
		// v2 not available
	}

	try {
		// Try v1 endpoint (FunkWhale <2.0)
		const response = await fetch(`${baseUrl}/api/v1/tracks/?page_size=1`, {
			method: 'GET',
			signal: AbortSignal.timeout(5000)
		});
		if (response.ok) {
			apiVersionCache.set(baseUrl, 'v1');
			console.log(`[FW] ${baseUrl} uses API v1`);
			return 'v1';
		}
	} catch {
		// v1 not available either
	}

	// Default to v2 (most likely for newer instances)
	apiVersionCache.set(baseUrl, 'v2');
	console.warn(`[FW] Could not detect API version for ${baseUrl}, defaulting to v2`);
	return 'v2';
}

/** Get the tracks/recordings endpoint path for the detected API version */
function tracksPath(version: ApiVersion): string {
	return version === 'v2' ? '/api/v2/tracks/' : '/api/v1/tracks/';
}

/** Get the search query parameter name for the detected API version */
function searchParam(version: ApiVersion): string {
	// v2 uses Django REST framework default 'search', v1 uses 'q'
	return version === 'v2' ? 'q' : 'q';
}

// ---- FunkWhale API response types (work for both v1 and v2) ----

interface FWArtist {
	id?: number;
	guid?: string;
	name: string;
	content_category?: string;
}

interface FWArtistCredit {
	artist: FWArtist;
	credit: string;
	joinphrase: string;
	index: number;
}

interface FWCover {
	uuid?: string;
	urls?: {
		original?: string;
		medium_square_crop?: string;
		large_square_crop?: string;
	};
}

interface FWAlbum {
	id?: number;
	guid?: string;
	title?: string;
	artist?: FWArtist;
	artist_credit?: FWArtistCredit[];
	cover?: FWCover;
	release_date?: string;
	tracks_count?: number;
}

interface FWUpload {
	uuid: string;
	listen_url?: string;
	duration?: number;
	extension?: string;
	size?: number;
}

interface FWTrack {
	id?: number;
	guid?: string;
	title?: string;
	artist?: FWArtist; // v1
	artist_credit?: FWArtistCredit[]; // v2
	album?: FWAlbum | number;
	uploads?: FWUpload[];
	creation_date?: string;
	position?: number;
	disc_number?: number;
	is_playable?: boolean;
	listen_url?: string;
	duration?: number;
	tags?: string[];
}

interface FWPaginatedResponse<T> {
	count: number;
	next: string | null;
	previous: string | null;
	results: T[];
}

// ---- Helpers ----

/** Get enabled FunkWhale instances from settings or defaults */
function getInstances(): FunkwhaleInstance[] {
	if (!browser) return DEFAULT_FUNKWHALE_INSTANCES;

	try {
		const stored = localStorage.getItem('dustic-profile');
		if (!stored) return DEFAULT_FUNKWHALE_INSTANCES;

		const profile = JSON.parse(stored);
		const instances = profile?.settings?.funkwhaleInstances;
		if (Array.isArray(instances) && instances.length > 0) {
			return instances.filter((i: FunkwhaleInstance) => i.enabled);
		}
	} catch {
		// fall through
	}
	return DEFAULT_FUNKWHALE_INSTANCES;
}

/** Normalize instance URL (strip trailing slash) */
function normalizeUrl(url: string): string {
	return url.replace(/\/+$/, '');
}

/** Build a FunkWhale track identifier */
function fwIdentifier(instanceUrl: string, trackId: number | string): string {
	const host = new URL(instanceUrl).host;
	return `fw:${host}:${trackId}`;
}

/**
 * Strip Internet Archive search syntax from a query before sending to FunkWhale.
 * IA uses creator:"name", subject:"tag", title:"name" etc. FunkWhale just wants plain text.
 */
function cleanQueryForFW(query: string): string {
	// Remove IA field prefixes: creator:"...", creator: "...", subject:"...", etc.
	let cleaned = query
		// Match field:"value" or field: "value" (with optional space after colon)
		.replace(/\b(creator|subject|title|identifier|collection|mediatype|format):\s*"([^"]*)"/gi, '$2')
		// Remove leftover field: prefixes
		.replace(/\b(creator|subject|title|identifier|collection|mediatype|format):\s*/gi, '')
		// Remove boolean operators
		.replace(/\bAND\b/gi, ' ')
		.replace(/\bOR\b/gi, ' ')
		.replace(/\bNOT\b/gi, ' ')
		// Remove parentheses used in IA query grouping
		.replace(/[()]/g, ' ')
		// Remove remaining standalone quotes
		.replace(/"/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	return cleaned;
}

/** Convert a FunkWhale track (v1 or v2) to a dustic Track */
function toTrack(fwTrack: FWTrack, instanceUrl: string): Track {
	const baseUrl = normalizeUrl(instanceUrl);

	const trackTitle = fwTrack.title || 'Unknown';
	const trackId = fwTrack.id || fwTrack.guid || 0;
	const creationDate = fwTrack.creation_date;
	const rawListenUrl = fwTrack.listen_url;
	const uploads = fwTrack.uploads || [];
	const upload = uploads[0];

	// Artist: v1 uses 'artist', v2 uses 'artist_credit' array
	const artistName = fwTrack.artist?.name
		|| fwTrack.artist_credit?.[0]?.credit
		|| fwTrack.artist_credit?.[0]?.artist?.name
		|| 'Unknown Artist';
	const artistId = fwTrack.artist?.id
		|| fwTrack.artist_credit?.[0]?.artist?.id;

	// Album object (v1 and v2 both use 'album')
	const albumObj = typeof fwTrack.album === 'object' ? fwTrack.album : undefined;
	const albumId = typeof fwTrack.album === 'number' ? fwTrack.album : albumObj?.id;
	const albumTitle = albumObj?.title;

	// Build stream URL (listen_url is relative in v2, e.g. /api/v2/listen/<uuid>/)
	const streamRaw = rawListenUrl || upload?.listen_url || '';
	const streamUrl = streamRaw
		? streamRaw.startsWith('http')
			? streamRaw
			: `${baseUrl}${streamRaw}`
		: '';

	// Cover art (v2 uses S3 presigned URLs which are already absolute)
	const coverUrl = albumObj?.cover?.urls?.medium_square_crop
		|| albumObj?.cover?.urls?.original
		|| undefined;
	const thumbnailUrl = coverUrl
		? coverUrl.startsWith('http')
			? coverUrl
			: `${baseUrl}${coverUrl}`
		: undefined;

	// Duration
	const duration = fwTrack.duration || upload?.duration;

	// Tags
	const tags = fwTrack.tags;

	return {
		identifier: fwIdentifier(baseUrl, trackId),
		filename: '',
		title: trackTitle,
		artist: artistName,
		album: albumTitle,
		date: albumObj?.release_date || creationDate?.substring(0, 10),
		duration,
		collection: [],
		genre: tags && tags.length > 0 ? tags : undefined,
		format: upload?.extension || 'mp3',
		streamUrl,
		thumbnailUrl,
		source: 'funkwhale',
		metadata: {
			funkwhaleInstance: baseUrl,
			funkwhaleTrackId: typeof trackId === 'number' ? trackId : 0,
			funkwhaleArtistId: typeof artistId === 'number' ? artistId : 0,
			funkwhaleAlbumId: typeof albumId === 'number' ? albumId : 0
		}
	};
}

// ---- Public API ----

/**
 * Search a single FunkWhale instance for tracks
 */
async function searchInstance(
	instanceUrl: string,
	query: string,
	pageSize: number = 20
): Promise<{ tracks: Track[]; total: number }> {
	const baseUrl = normalizeUrl(instanceUrl);
	const cleanedQuery = cleanQueryForFW(query);
	if (!cleanedQuery) return { tracks: [], total: 0 };

	const apiVersion = await detectApiVersion(baseUrl);
	const path = tracksPath(apiVersion);
	const qParam = searchParam(apiVersion);

	const urlParams = new URLSearchParams({
		[qParam]: cleanedQuery,
		page_size: pageSize.toString(),
		ordering: '-creation_date'
	});

	const url = `${baseUrl}${path}?${urlParams.toString()}`;
	console.log(`[FW] Searching ${baseUrl} (${apiVersion}): "${cleanedQuery}"`);

	try {
		const data: FWPaginatedResponse<FWTrack> = await withCache(
			`fw:search:${url}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
				return response.json();
			},
			3 * 60 * 1000
		);

		const fwTracks = data.results || [];
		const tracks = fwTracks
			.filter((t) => (t.uploads && t.uploads.length > 0) || t.is_playable || t.listen_url)
			.map((t) => toTrack(t, baseUrl));

		console.log(`[FW] Found ${tracks.length} tracks on ${baseUrl} (total: ${data.count})`);
		return { tracks, total: data.count || tracks.length };
	} catch (error: any) {
		console.warn(`[FW] Search failed on ${baseUrl}:`, error?.message || error);
		return { tracks: [], total: 0 };
	}
}

/**
 * Search all enabled FunkWhale instances in parallel
 */
export async function search(params: SearchParams): Promise<SearchResult> {
	const instances = getInstances();
	if (instances.length === 0) {
		return { items: [], total: 0, page: params.page || 1, pageSize: params.pageSize || 20 };
	}

	const pageSize = params.pageSize || 20;

	// Search all instances in parallel
	const results = await Promise.allSettled(
		instances.map((instance) => searchInstance(instance.url, params.query, pageSize))
	);

	// Merge results from all instances
	const allTracks: Track[] = [];
	let totalCount = 0;

	for (const result of results) {
		if (result.status === 'fulfilled') {
			allTracks.push(...result.value.tracks);
			totalCount += result.value.total;
		}
	}

	return {
		items: allTracks,
		total: totalCount,
		page: params.page || 1,
		pageSize
	};
}

/**
 * Get a single track by its FunkWhale identifier (fw:host:trackId)
 */
export async function getTrack(identifier: string): Promise<Track | null> {
	const parts = identifier.split(':');
	if (parts.length !== 3 || parts[0] !== 'fw') return null;

	const host = parts[1];
	const trackId = parts[2];

	// Find the matching instance
	const instances = getInstances();
	const instance = instances.find((i) => new URL(i.url).host === host);
	const baseUrl = instance ? normalizeUrl(instance.url) : `https://${host}`;

	const apiVersion = await detectApiVersion(baseUrl);
	const path = tracksPath(apiVersion);
	const url = `${baseUrl}${path}${trackId}/`;
	console.log(`[FW] Fetching track (${apiVersion}): ${url}`);

	try {
		const fwTrack: FWTrack = await withCache(
			`fw:track:${identifier}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
				return response.json();
			},
			60 * 60 * 1000
		);

		// v1 requires uploads, v2 may use 'playable' flag
		if (!fwTrack.uploads?.length && !fwTrack.is_playable && !fwTrack.listen_url) {
			console.warn(`[FW] Track ${trackId} has no uploads and is not playable`);
			return null;
		}

		return toTrack(fwTrack, baseUrl);
	} catch (error: any) {
		console.warn(`[FW] Failed to fetch track ${identifier}:`, error?.message || error);
		return null;
	}
}

/**
 * Get all tracks in an album
 */
export async function getAlbumTracks(
	instanceUrl: string,
	albumId: number
): Promise<Track[]> {
	const baseUrl = normalizeUrl(instanceUrl);
	const apiVersion = await detectApiVersion(baseUrl);
	const path = tracksPath(apiVersion);
	const url = `${baseUrl}${path}?album=${albumId}&page_size=100&ordering=position`;

	try {
		const data: FWPaginatedResponse<FWTrack> = await withCache(
			`fw:album:${baseUrl}:${albumId}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
				return response.json();
			},
			60 * 60 * 1000
		);

		return data.results
			.filter((t) => (t.uploads && t.uploads.length > 0) || t.is_playable || t.listen_url)
			.map((t) => toTrack(t, baseUrl));
	} catch (error: any) {
		console.warn(`[FW] Failed to fetch album tracks:`, error?.message || error);
		return [];
	}
}

/**
 * Search tracks by artist on a FunkWhale instance
 */
export async function searchByArtist(
	instanceUrl: string,
	artistId: number,
	excludeIdentifier?: string
): Promise<Track[]> {
	const baseUrl = normalizeUrl(instanceUrl);
	const apiVersion = await detectApiVersion(baseUrl);
	const path = tracksPath(apiVersion);
	const url = `${baseUrl}${path}?artist=${artistId}&page_size=20&ordering=-creation_date`;

	try {
		const data: FWPaginatedResponse<FWTrack> = await withCache(
			`fw:artist-tracks:${baseUrl}:${artistId}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
				return response.json();
			},
			10 * 60 * 1000
		);

		return data.results
			.filter((t) => (t.uploads && t.uploads.length > 0) || t.is_playable || t.listen_url)
			.map((t) => toTrack(t, baseUrl))
			.filter((t) => t.identifier !== excludeIdentifier);
	} catch (error: any) {
		console.warn(`[FW] Failed to search by artist:`, error?.message || error);
		return [];
	}
}

/**
 * Search tracks by tag on a FunkWhale instance
 */
export async function searchByTag(
	instanceUrl: string,
	tag: string,
	excludeIdentifier?: string
): Promise<Track[]> {
	const baseUrl = normalizeUrl(instanceUrl);
	const apiVersion = await detectApiVersion(baseUrl);
	const path = tracksPath(apiVersion);
	const url = `${baseUrl}${path}?tag=${encodeURIComponent(tag)}&page_size=20&ordering=-creation_date`;

	try {
		const data: FWPaginatedResponse<FWTrack> = await withCache(
			`fw:tag-tracks:${baseUrl}:${tag}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
				return response.json();
			},
			10 * 60 * 1000
		);

		return data.results
			.filter((t) => (t.uploads && t.uploads.length > 0) || t.is_playable || t.listen_url)
			.map((t) => toTrack(t, baseUrl))
			.filter((t) => t.identifier !== excludeIdentifier);
	} catch (error: any) {
		console.warn(`[FW] Failed to search by tag:`, error?.message || error);
		return [];
	}
}

/**
 * Discover popular tags. Tries the dedicated /api/v2/tags/ endpoint first,
 * falls back to extracting tags from recent tracks.
 */
export async function fetchTags(
	instanceUrl: string,
	limit: number = 8
): Promise<string[]> {
	const baseUrl = normalizeUrl(instanceUrl);

	// Try dedicated tags endpoint first (v2)
	try {
		const tagsUrl = `${baseUrl}/api/v2/tags/?ordering=name&page_size=100`;
		const data: FWPaginatedResponse<{ name: string }> = await withCache(
			`fw:tags-api:${baseUrl}`,
			async () => {
				const response = await fetchWithRetry(tagsUrl, {}, { maxAttempts: 2 });
				return response.json();
			},
			30 * 60 * 1000
		);

		if (data.results?.length) {
			// Filter out overly long tags (likely concatenated garbage) and pick short readable ones
			const good = data.results
				.map((t) => t.name)
				.filter((name) => name.length <= 25 && name.length >= 2)
				.slice(0, limit);
			if (good.length > 0) return good;
		}
	} catch {
		// tags endpoint not available, fall back
	}

	// Fallback: extract tags from recent tracks
	const apiVersion = await detectApiVersion(baseUrl);
	const path = tracksPath(apiVersion);
	const url = `${baseUrl}${path}?page_size=50&ordering=-creation_date`;

	try {
		const data: FWPaginatedResponse<FWTrack> = await withCache(
			`fw:tags:${baseUrl}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
				return response.json();
			},
			30 * 60 * 1000
		);

		const tagCounts = new Map<string, number>();
		for (const track of data.results || []) {
			for (const tag of track.tags || []) {
				const normalized = tag.toLowerCase();
				tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + 1);
			}
		}

		return [...tagCounts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, limit)
			.map(([tag]) => tag);
	} catch (error: any) {
		console.warn(`[FW] Failed to fetch tags from ${baseUrl}:`, error?.message || error);
		return [];
	}
}

/**
 * Get random tracks from a FunkWhale instance
 */
export async function getRandomTracks(
	instanceUrl: string,
	pageSize: number = 20
): Promise<Track[]> {
	const baseUrl = normalizeUrl(instanceUrl);
	const apiVersion = await detectApiVersion(baseUrl);
	const path = tracksPath(apiVersion);
	const url = `${baseUrl}${path}?page_size=${pageSize}&ordering=-creation_date`;

	try {
		const data: FWPaginatedResponse<FWTrack> = await withCache(
			`fw:random:${baseUrl}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
				return response.json();
			},
			5 * 60 * 1000
		);

		return data.results
			.filter((t) => (t.uploads && t.uploads.length > 0) || t.is_playable || t.listen_url)
			.map((t) => toTrack(t, baseUrl));
	} catch (error: any) {
		console.warn(`[FW] Failed to get random tracks:`, error?.message || error);
		return [];
	}
}

/**
 * Extract instance URL and metadata from a FunkWhale track
 */
export function parseFunkwhaleTrack(track: Track): {
	instanceUrl: string;
	trackId: number;
	artistId?: number;
	albumId?: number;
} | null {
	if (!isFunkwhaleTrack(track.identifier)) return null;
	return {
		instanceUrl: track.metadata?.funkwhaleInstance || '',
		trackId: track.metadata?.funkwhaleTrackId || 0,
		artistId: track.metadata?.funkwhaleArtistId,
		albumId: track.metadata?.funkwhaleAlbumId
	};
}

/**
 * Check if an identifier is a FunkWhale track
 */
export function isFunkwhaleTrack(identifier: string): boolean {
	return identifier.startsWith('fw:');
}
