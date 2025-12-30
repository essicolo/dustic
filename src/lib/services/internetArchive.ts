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

	// Add collection filter if specified
	if (collection.length > 0) {
		const collectionQuery = collection.map((c) => `collection:(${c})`).join(' OR ');
		q += ` AND (${collectionQuery})`;
	}

	// Add audio format filter
	const formatFilter =
		format.length > 0 ? format : AUDIO_FORMATS;
	const formatQuery = formatFilter.map((f) => `format:(${f})`).join(' OR ');
	q += ` AND (${formatQuery})`;

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
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`IA API error: ${response.status}`);
		}

		const data: IASearchResponse = await response.json();
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
			metadata: doc
		}));

		return {
			items,
			total: data.response.numFound,
			page,
			pageSize
		};
	} catch (error) {
		console.error('Search error:', error);
		throw new Error('Failed to search Internet Archive');
	}
}

/**
 * Get full metadata for an item including file list
 */
export async function getItemMetadata(identifier: string): Promise<IAMetadataResponse> {
	const url = `${IA_METADATA_URL}/${identifier}`;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`IA API error: ${response.status}`);
		}

		const data: IAMetadataResponse = await response.json();
		return data;
	} catch (error) {
		console.error('Metadata fetch error:', error);
		throw new Error('Failed to fetch item metadata');
	}
}

/**
 * Get the best audio file from an item's file list
 */
export function getBestAudioFile(files: IAMetadataResponse['files']): {
	filename: string;
	format: string;
	duration?: number;
} | null {
	// Prefer MP3 > OGG > FLAC
	const formatPriority = ['mp3', 'ogg', 'flac', 'wav', 'm4a', 'aac'];

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
		return null;
	}

	// Sort by format priority
	audioFiles.sort((a, b) => {
		const aFormat = a.format?.toLowerCase() || a.name.split('.').pop() || '';
		const bFormat = b.format?.toLowerCase() || b.name.split('.').pop() || '';

		const aPriority = formatPriority.indexOf(aFormat);
		const bPriority = formatPriority.indexOf(bFormat);
		return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
	});

	const best = audioFiles[0];
	return {
		filename: best.name,
		format: best.format || best.name.split('.').pop() || 'mp3',
		duration: best.length ? parseFloat(best.length) : undefined
	};
}

/**
 * Build stream URL for a file
 */
export function getStreamUrl(identifier: string, filename: string): string {
	return `${IA_DOWNLOAD_URL}/${identifier}/${encodeURIComponent(filename)}`;
}

/**
 * Get thumbnail URL for an item
 */
export function getThumbnailUrl(identifier: string): string {
	return `${IA_BASE_URL}/services/img/${identifier}`;
}

/**
 * Fetch full track details including playable URL
 */
export async function getTrack(identifier: string): Promise<Track | null> {
	try {
		const metadata = await getItemMetadata(identifier);
		const audioFile = getBestAudioFile(metadata.files);

		if (!audioFile) {
			console.warn(`No audio file found for ${identifier}`);
			return null;
		}

		const track: Track = {
			identifier,
			filename: audioFile.filename,
			title: metadata.metadata.title || 'Untitled',
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
		};

		return track;
	} catch (error) {
		console.error(`Error fetching track ${identifier}:`, error);
		return null;
	}
}
