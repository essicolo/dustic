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
	},
    server: 'test-server',
    dir: '/test-dir',
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

		// Check that URLs are built with the item identifier, not the track identifier
		const encodedUrl = encodeURIComponent('https://archive.org/serve/test-item/02 - Track 2.mp3');
		expect(track.streamUrl).toBe(`/api/cors-proxy?url=${encodedUrl}`);

		const encodedThumbUrl = encodeURIComponent('https://archive.org/services/img/test-item');
		expect(track.thumbnailUrl).toBe(`/api/cors-proxy?url=${encodedThumbUrl}`);
	});

    it('should handle identifiers without track index', async () => {
		const track = await getTrack('test-item');

		expect(track).not.toBeNull();
		if (!track) return;

		expect(track.identifier).toBe('test-item');
		expect(track.filename).toBe('01 - Track 1.mp3');
		expect(track.title).toBe('Test Album'); // No chapter title extraction

		// Check that URLs are built correctly
		const encodedUrl = encodeURIComponent('https://archive.org/serve/test-item/01 - Track 1.mp3');
		expect(track.streamUrl).toBe(`/api/cors-proxy?url=${encodedUrl}`);
    });
});
