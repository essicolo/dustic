// FunkWhale API client - searches public FunkWhale instances

import type { Track, SearchParams, SearchResult, FunkwhaleInstance } from '$lib/types';
import { DEFAULT_FUNKWHALE_INSTANCES } from '$lib/utils/constants';
import { withCache } from '$lib/utils/cache';
import { fetchWithRetry } from '$lib/utils/retry';
import { browser } from '$app/environment';

// ---- FunkWhale API response types ----

interface FWArtist {
	id: number;
	name: string;
	content_category?: string;
}

interface FWAlbumCover {
	urls: {
		original?: string;
		medium_square_crop?: string;
		large_square_crop?: string;
	};
}

interface FWAlbum {
	id: number;
	title: string;
	artist: FWArtist;
	cover?: FWAlbumCover;
	release_date?: string;
	tracks_count?: number;
}

interface FWUpload {
	uuid: string;
	listen_url: string;
	duration?: number;
	extension?: string;
	size?: number;
}

interface FWTrack {
	id: number;
	title: string;
	artist: FWArtist;
	album?: FWAlbum | number; // Can be nested object or just an ID
	uploads: FWUpload[];
	creation_date?: string;
	position?: number;
	disc_number?: number;
	is_playable?: boolean;
	listen_url?: string; // Relative path, e.g. /api/v1/listen/<uuid>/
	duration?: number; // Some responses include duration at track level
	tags: string[];
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
function fwIdentifier(instanceUrl: string, trackId: number): string {
	const host = new URL(instanceUrl).host;
	return `fw:${host}:${trackId}`;
}

/** Convert a FunkWhale track to a dustic Track */
function toTrack(fwTrack: FWTrack, instanceUrl: string): Track {
	const baseUrl = normalizeUrl(instanceUrl);
	const upload = fwTrack.uploads[0];

	// Build stream URL: prefer track-level listen_url, fall back to upload's
	const rawListenUrl = fwTrack.listen_url || upload?.listen_url || '';
	const listenUrl = rawListenUrl
		? rawListenUrl.startsWith('http')
			? rawListenUrl
			: `${baseUrl}${rawListenUrl}`
		: '';

	// Album can be a nested object or just an integer ID
	const album = typeof fwTrack.album === 'object' ? fwTrack.album : undefined;
	const albumId = typeof fwTrack.album === 'number' ? fwTrack.album : album?.id;

	// Cover art lives on the album object
	const coverUrl = album?.cover?.urls?.medium_square_crop
		|| album?.cover?.urls?.original
		|| undefined;

	// Cover URLs may be relative
	const thumbnailUrl = coverUrl
		? coverUrl.startsWith('http')
			? coverUrl
			: `${baseUrl}${coverUrl}`
		: undefined;

	// Duration can be at track level or on the upload
	const duration = fwTrack.duration || upload?.duration;

	return {
		identifier: fwIdentifier(baseUrl, fwTrack.id),
		filename: '',
		title: fwTrack.title,
		artist: fwTrack.artist.name,
		album: album?.title,
		date: album?.release_date || fwTrack.creation_date?.substring(0, 10),
		duration,
		collection: [],
		genre: fwTrack.tags?.length > 0 ? fwTrack.tags : undefined,
		format: upload?.extension || 'mp3',
		streamUrl: listenUrl,
		thumbnailUrl,
		source: 'funkwhale',
		metadata: {
			funkwhaleInstance: baseUrl,
			funkwhaleTrackId: fwTrack.id,
			funkwhaleArtistId: fwTrack.artist.id,
			funkwhaleAlbumId: albumId
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
	const urlParams = new URLSearchParams({
		q: query,
		page_size: pageSize.toString(),
		ordering: '-creation_date'
	});

	// FunkWhale v1 uses per-resource search: /api/v1/tracks/?q=<query>
	const url = `${baseUrl}/api/v1/tracks/?${urlParams.toString()}`;
	console.log(`[FW] Searching ${baseUrl}: "${query}"`);

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
			.filter((t) => t.uploads.length > 0) // Only playable tracks
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
	const trackId = parseInt(parts[2], 10);
	if (isNaN(trackId)) return null;

	// Find the matching instance
	const instances = getInstances();
	const instance = instances.find((i) => new URL(i.url).host === host);
	const baseUrl = instance ? normalizeUrl(instance.url) : `https://${host}`;

	const url = `${baseUrl}/api/v1/tracks/${trackId}/`;
	console.log(`[FW] Fetching track: ${url}`);

	try {
		const fwTrack: FWTrack = await withCache(
			`fw:track:${identifier}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
				return response.json();
			},
			60 * 60 * 1000
		);

		if (!fwTrack.uploads || fwTrack.uploads.length === 0) {
			console.warn(`[FW] Track ${trackId} has no uploads`);
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
	const url = `${baseUrl}/api/v1/tracks/?album=${albumId}&page_size=100&ordering=position`;

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
			.filter((t) => t.uploads.length > 0)
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
	const url = `${baseUrl}/api/v1/tracks/?artist=${artistId}&page_size=20&ordering=-creation_date`;

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
			.filter((t) => t.uploads.length > 0)
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
	const url = `${baseUrl}/api/v1/tracks/?tag=${encodeURIComponent(tag)}&page_size=20&ordering=-creation_date`;

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
			.filter((t) => t.uploads.length > 0)
			.map((t) => toTrack(t, baseUrl))
			.filter((t) => t.identifier !== excludeIdentifier);
	} catch (error: any) {
		console.warn(`[FW] Failed to search by tag:`, error?.message || error);
		return [];
	}
}

/**
 * Fetch popular tags from a FunkWhale instance
 */
export async function fetchTags(
	instanceUrl: string,
	limit: number = 10
): Promise<string[]> {
	const baseUrl = normalizeUrl(instanceUrl);
	const url = `${baseUrl}/api/v1/tags/?page_size=${limit}&ordering=-length`;

	try {
		const data = await withCache(
			`fw:tags:${baseUrl}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 2 });
				return response.json();
			},
			30 * 60 * 1000 // Cache tags for 30 minutes
		);

		const results = data.results || data || [];
		return results.map((t: any) => t.name || t).filter(Boolean);
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
	const url = `${baseUrl}/api/v1/tracks/?page_size=${pageSize}&ordering=-creation_date`;

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
			.filter((t) => t.uploads.length > 0)
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
