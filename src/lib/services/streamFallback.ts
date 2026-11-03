// Alternate stream URLs for a track, used when the primary src fails with
// MEDIA_ERR_SRC_NOT_SUPPORTED (undecodable format or a dead URL).
//
// Internet Archive items usually contain the same recording in several
// formats (VBR MP3, FLAC, Ogg Vorbis…). getBestAudioFile picks one by quality
// preference, but that pick can be a format the browser cannot decode (or a
// file the archive has since removed while its metadata row lingers), so the
// player needs the other candidates, most-decodable first.

import type { Track } from '$lib/types';
import { IA_DOWNLOAD_URL } from '$lib/utils/constants';
import { getItemMetadata } from './internetArchive';

/** Formats every mainstream browser can decode, best-effort order. */
const BROADLY_PLAYABLE = ['mp3', 'vbr mp3', '128kbps mp3', '64kbps mp3', 'ogg', 'ogg vorbis'];

/**
 * Build the list of stream URLs to try after `failedSrc` fails, for an
 * Internet Archive track. Returns [] for non-IA tracks (FunkWhale/WebDAV/
 * offline blobs have a single source of truth — their proxy/blob URL).
 * Fetches the item's file list on demand; only runs on the failure path.
 */
export async function alternateStreamUrls(track: Track | null, failedSrc: string): Promise<string[]> {
	if (!track || track.source === 'webdav' || track.source === 'funkwhale') return [];
	if (failedSrc.startsWith('blob:')) return [];

	const itemId = track.identifier.split('#')[0];
	if (!itemId) return [];

	let files: { name?: string; format?: string }[] = [];
	try {
		const metadata = await getItemMetadata(itemId);
		files = metadata.files || [];
	} catch {
		return [];
	}

	// The failed src names the file that didn't work (…/serve/<item>/<file>).
	const failedFile = decodeURIComponent(failedSrc.split('/').pop() || '');

	const audioFiles = files
		.filter((f) => f.name && f.format !== undefined || f.name)
		.map((f) => f.name as string)
		.filter((name) => {
			if (name.includes('__MACOSX/')) return false;
			const base = name.split('/').pop() || '';
			if (base.startsWith('._')) return false;
			const ext = base.split('.').pop()?.toLowerCase() || '';
			return ['mp3', 'ogg', 'flac', 'wav', 'm4a', 'aac', 'opus'].includes(ext);
		})
		.filter((name) => name !== failedFile)
		.sort((a, b) => {
			const rank = (n: string) => {
				const ext = (n.split('.').pop() || '').toLowerCase();
				const i = BROADLY_PLAYABLE.indexOf(ext);
				return i === -1 ? 99 : i;
			};
			return rank(a) - rank(b) || a.localeCompare(b);
		});

	// Prefer /serve/ (streaming-optimised); /download/ as a last resort per file.
	return audioFiles.flatMap((name) => [
		`https://archive.org/serve/${itemId}/${name}`,
		`${IA_DOWNLOAD_URL}/${itemId}/${name}`
	]);
}
