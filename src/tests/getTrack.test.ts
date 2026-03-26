import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTrack } from '$lib/services/internetArchive';
import type { IAMetadataResponse } from '$lib/types';

// Mock fetch
const mockMetadata: IAMetadataResponse = {
	files: [
		{ name: '01 - Track 1.mp3', format: 'VBR MP3', length: '120.5' },
		{ name: '02 - Track 2.mp3', format: 'VBR MP3', length: '185.2' }
	],
	metadata: {
		identifier: 'test-item',
		title: 'Test Album',
		creator: 'Test Artist',
		date: '2023-01-01',
		collection: 'test_collection',
		subject: ['genre1', 'genre2']
	}
};

beforeEach(() => {
	vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
		if (url.toString().includes('/metadata/test-item')) {
			return new Response(JSON.stringify(mockMetadata));
		}
		return new Response('Not Found', { status: 404 });
	});
});

describe('getTrack', () => {
	it('should handle identifiers with track index', async () => {
		const track = await getTrack('test-item#1');

		expect(track).not.toBeNull();
		if (!track) return;

		expect(track.identifier).toBe('test-item#1');
		expect(track.filename).toBe('02 - Track 2.mp3');
		expect(track.title).toBe('Track 2');

		// Stream URL should point to archive.org/serve directly
		expect(track.streamUrl).toContain('archive.org/serve/test-item/');
		expect(track.streamUrl).toContain('02 - Track 2.mp3');

		// Thumbnail should use weserv proxy
		expect(track.thumbnailUrl).toContain('images.weserv.nl');
		expect(track.thumbnailUrl).toContain(encodeURIComponent('https://archive.org/services/img/test-item'));
	});

	it('should handle identifiers without track index', async () => {
		const track = await getTrack('test-item');

		expect(track).not.toBeNull();
		if (!track) return;

		expect(track.identifier).toBe('test-item');
		expect(track.filename).toBe('01 - Track 1.mp3');
		expect(track.title).toBe('Test Album');

		expect(track.streamUrl).toContain('archive.org/serve/test-item/');
		expect(track.streamUrl).toContain('01 - Track 1.mp3');
	});
});
