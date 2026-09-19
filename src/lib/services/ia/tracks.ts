// Internet Archive: item metadata, audio file selection and track building.

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
import { getQualityPreference, getStreamUrl, getThumbnailUrl } from './query';

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

		// Nothing online, nothing offline. Same reasoning as getAllTracks: if
		// the archive has removed or darkened the item, the caller needs to
		// tell that apart from "no audio here" so it can say so and stop
		// offering it. Returning null loses that, and a saved track then just
		// disappears from a playlist or from history.
		if (isUnplayableItemError(error)) throw error;

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
			const matching = allOffline
				.filter(
					(t) =>
						t.track.identifier.startsWith(identifier + '#') || t.track.identifier === identifier
				);

			// Regenerate blob URLs for offline playback
			const itemTracks = await Promise.all(
				matching.map(async (t) => {
					const offlineReady = await offlineStorage.getOfflineTrack(t.track.identifier);
					return offlineReady || t.track;
				})
			);

			// Sort by index
			itemTracks.sort((a, b) => {
				const idxA = parseInt(a.identifier.split('#')[1] || '0');
				const idxB = parseInt(b.identifier.split('#')[1] || '0');
				return idxA - idxB;
			});

			if (itemTracks.length > 0) return itemTracks;
		} catch (offlineError) {
			console.error('Offline fallback failed:', offlineError);
		}

		// Nothing online, nothing offline. If the reason was that the archive
		// no longer has this item, say so instead of returning an empty list:
		// the search index keeps serving documents for removed items, so the
		// caller needs to tell "this item is gone" apart from "this item has
		// no audio files" — one is worth reporting and remembering, the other
		// is not.
		if (isUnplayableItemError(error)) throw error;

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
