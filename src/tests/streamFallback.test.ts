import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Track } from '$lib/types';

// Mock the IA metadata fetch used by alternateStreamUrls before importing it.
vi.mock('$lib/services/internetArchive', () => ({
	getItemMetadata: vi.fn()
}));

import { getItemMetadata } from '$lib/services/internetArchive';
import { alternateStreamUrls } from '$lib/services/streamFallback';

const mockedGetItemMetadata = vi.mocked(getItemMetadata);

function iaTrack(identifier: string): Track {
	return {
		identifier,
		filename: '01-song.flac',
		title: 'Song',
		artist: 'Artist',
		streamUrl: `https://archive.org/serve/${identifier.split('#')[0]}/01-song.flac`,
		format: 'flac',
		collection: [],
		metadata: {}
	};
}

function itemWithFiles(files: { name: string; format: string }[]) {
	return { metadata: { identifier: 'item' }, files };
}

describe('alternateStreamUrls', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns [] for non-IA (funkwhale/webdav) tracks', async () => {
		const fw = { ...iaTrack('fw:host:1'), source: 'funkwhale' as const };
		expect(await alternateStreamUrls(fw, fw.streamUrl)).toEqual([]);
		const wd = { ...iaTrack('wd:lib:/a.mp3'), source: 'webdav' as const };
		expect(await alternateStreamUrls(wd, wd.streamUrl)).toEqual([]);
	});

	it('returns [] for blob: URLs', async () => {
		const t = iaTrack('item#0');
		expect(await alternateStreamUrls(t, 'blob:http://localhost/xyz')).toEqual([]);
	});

	it('excludes the failed file and ranks broadly-playable formats first', async () => {
		mockedGetItemMetadata.mockResolvedValue(
			itemWithFiles([
				{ name: '01-song.flac', format: 'FLAC' }, // the one that failed
				{ name: '01-song.ogg', format: 'Ogg Vorbis' },
				{ name: '01-song.mp3', format: 'VBR MP3' },
				{ name: 'readme.txt', format: 'Text' },
				{ name: '__MACOSX/01-song.mp3', format: 'MP3' },
				{ name: '._01-song.mp3', format: 'MP3' }
			]) as any
		);

		const alts = await alternateStreamUrls(iaTrack('item#0'), 'https://archive.org/serve/item/01-song.flac');

		expect(alts[0]).toBe('https://archive.org/serve/item/01-song.mp3');
		expect(alts[1]).toBe('https://archive.org/download/item/01-song.mp3');
		expect(alts[2]).toBe('https://archive.org/serve/item/01-song.ogg');
		// failed file, txt, __MACOSX and resource-fork files are all excluded
		expect(alts.some((u) => u.includes('flac') || u.includes('txt') || u.includes('MACOSX') || u.includes('._'))).toBe(false);
	});

	it('returns [] when metadata fetch fails', async () => {
		mockedGetItemMetadata.mockRejectedValue(new Error('404'));
		expect(await alternateStreamUrls(iaTrack('gone#0'), 'https://archive.org/serve/gone/a.mp3')).toEqual([]);
	});
});
