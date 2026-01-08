// Internet Archive API client

import type {
	SearchParams,
	SearchResult,
	Track,
	IASearchResponse,
	IAMetadataResponse
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

// Get quality preference from settings (browser only)
function getQualityPreference(): AudioQuality {
	if (!browser) return 'medium';

	try {
		const stored = localStorage.getItem('dustic-profile');
		if (!stored) return 'medium';

		const profile = JSON.parse(stored);
		return profile?.settings?.audioQuality || 'medium';
	} catch {
		return 'medium';
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
		// Require at least one audio format to filter out metadata-only items
		const commonFormats = ['mp3', 'ogg', 'flac', 'vbr mp3', '128kbps mp3', 'VBR', 'Ogg Vorbis'];
		const formatFilter = commonFormats.map((f) => `format:"${f}"`).join(' OR ');
		q += ` AND (${formatFilter})`;
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

	try {
		// Use cache and retry logic for search
		const data = await withCache<IASearchResponse>(
			`search:${url}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 3 });
				return response.json();
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
		} else if (error.status >= 500) {
			throw new Error('Internet Archive is experiencing issues. Please try again later.');
		} else if (error.message?.includes('fetch')) {
			throw new Error('Network error. Please check your internet connection.');
		}

		throw new Error('Failed to search Internet Archive');
	}
}

/**
 * Get full metadata for an item including file list
 */
export async function getItemMetadata(identifier: string): Promise<IAMetadataResponse> {
	const url = `${IA_METADATA_URL}/${identifier}`;

	try {
		// Cache metadata for 10 minutes
		return await withCache<IAMetadataResponse>(
			`metadata:${identifier}`,
			async () => {
				const response = await fetchWithRetry(url, {}, { maxAttempts: 3 });
				return response.json();
			},
			10 * 60 * 1000
		);
	} catch (error: any) {
		console.error('Metadata fetch error:', error);

		// Provide specific error messages
		if (error.status === 404) {
			throw new Error('Item not found on Internet Archive');
		} else if (error.status === 429) {
			throw new Error('Too many requests. Please wait a moment and try again.');
		} else if (error.message?.includes('fetch')) {
			throw new Error('Network error. Please check your internet connection.');
		}

		throw new Error('Failed to fetch item metadata');
	}
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

	return audioFiles.map(file => ({
		filename: file.name,
		format: file.format || file.name.split('.').pop() || 'mp3',
		duration: file.length ? parseFloat(file.length) : undefined
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
	return `/api/cors-proxy?url=${encodeURIComponent(streamUrl)}`;
}

/**
 * Get thumbnail URL for an item
 * Use higher quality version for better display on modern devices
 */
export function getThumbnailUrl(identifier: string, size: 'default' | 'large' = 'default'): string {
	let imageUrl: string;
	if (size === 'large') {
		// Try to get high-res version first (may be on a CDN and cause opaque responses)
		imageUrl = `https://archive.org/download/${identifier}/__ia_thumb.jpg`;
	} else {
		imageUrl = `${IA_BASE_URL}/services/img/${identifier}`;
	}
	// Route all thumbnail requests through the CORS proxy
	return `/api/cors-proxy?url=${encodeURIComponent(imageUrl)}`;
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

		const track: Track = {
			identifier,
			filename: audioFile.filename,
			title: trackIndexStr
				? extractChapterTitle(audioFile.filename, trackIndex + 1, metadata.metadata.title)
				: metadata.metadata.title || 'Untitled',
			artist: Array.isArray(metadata.metadata.creator)
				? metadata.metadata.creator[0]
				: metadata.metadata.creator || 'Unknown Artist',
			album: metadata.metadata.title,
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

		const tracks: Track[] = audioFiles.map((audioFile, index) => ({
			identifier: `${identifier}#${index}`,
			filename: audioFile.filename,
			title: extractChapterTitle(audioFile.filename, index + 1, metadata.metadata.title),
			artist: Array.isArray(metadata.metadata.creator)
				? metadata.metadata.creator[0]
				: metadata.metadata.creator || 'Unknown Artist',
			album: metadata.metadata.title,
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
		}));

		return tracks;
	} catch (error) {
		console.error(`Error fetching tracks for ${identifier}:`, error);
		return [];
	}
}

/**
 * Extract a readable chapter title from filename
 */
function extractChapterTitle(filename: string, chapterNumber: number, albumTitle?: string): string {
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
			return match[2].trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
		}
	}

	// If no pattern matches, use the filename as-is, cleaned up
	const cleaned = nameWithoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

	// If it's just a number or very short, prefix with "Chapter"
	if (cleaned.length < 5 || /^\d+$/.test(cleaned)) {
		return `Chapter ${chapterNumber}`;
	}

	return cleaned;
}
