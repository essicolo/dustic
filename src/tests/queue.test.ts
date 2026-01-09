import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { queue } from '$lib/stores/queue';
import type { Track } from '$lib/types';

describe('Queue Store', () => {
	let mockTracks: Track[];

	beforeEach(() => {
		// Reset queue
		queue.clear();

		// Create mock tracks
		mockTracks = [
			{
				identifier: 'item1#track1.mp3',
				filename: 'track1.mp3',
				title: 'Track 1',
				artist: 'Artist 1',
				streamUrl: 'https://example.com/1.mp3',
				format: 'VBR MP3',
				duration: 180,
				date: '2024-01-01',
				collection: [],
				metadata: {}
			},
			{
				identifier: 'item1#track2.mp3',
				filename: 'track2.mp3',
				title: 'Track 2',
				artist: 'Artist 2',
				streamUrl: 'https://example.com/2.mp3',
				format: 'VBR MP3',
				duration: 200,
				date: '2024-01-02',
				collection: [],
				metadata: {}
			},
			{
				identifier: 'item1#track3.mp3',
				filename: 'track3.mp3',
				title: 'Track 3',
				artist: 'Artist 3',
				streamUrl: 'https://example.com/3.mp3',
				format: 'VBR MP3',
				duration: 220,
				date: '2024-01-03',
				collection: [],
				metadata: {}
			}
		];
	});

	describe('Basic Operations', () => {
		it('should start empty', () => {
			const state = get(queue);
			expect(state.tracks).toEqual([]);
			expect(state.currentIndex).toBe(-1);
		});

		it('should set queue with tracks', () => {
			queue.setQueue(mockTracks, 1);
			const state = get(queue);

			expect(state.tracks).toEqual(mockTracks);
			expect(state.currentIndex).toBe(1);
		});

		it('should add track to end', () => {
			queue.setQueue([mockTracks[0]], 0);
			queue.addToEnd(mockTracks[1]);

			const state = get(queue);
			expect(state.tracks).toHaveLength(2);
			expect(state.tracks[1]).toEqual(mockTracks[1]);
		});

		it('should remove track at index', () => {
			queue.setQueue(mockTracks, 0);
			queue.remove(1);

			const state = get(queue);
			expect(state.tracks).toHaveLength(2);
			expect(state.tracks[0]).toEqual(mockTracks[0]);
			expect(state.tracks[1]).toEqual(mockTracks[2]);
		});

		it('should clear all tracks', () => {
			queue.setQueue(mockTracks, 0);
			queue.clear();

			const state = get(queue);
			expect(state.tracks).toEqual([]);
			expect(state.currentIndex).toBe(-1);
		});
	});

	describe('Navigation', () => {
		beforeEach(() => {
			queue.setQueue(mockTracks, 0);
		});

		it('should get next track', () => {
			const next = queue.getNextTrack();
			expect(next).toEqual(mockTracks[1]);
		});

		it('should get previous track', () => {
			queue.setQueue(mockTracks, 1);
			const prev = queue.getPreviousTrack();
			expect(prev).toEqual(mockTracks[0]);
		});

		it('should return null when no next track', () => {
			queue.setQueue(mockTracks, 2);
			const next = queue.getNextTrack();
			expect(next).toBeNull();
		});

		it('should return null when no previous track', () => {
			const prev = queue.getPreviousTrack();
			expect(prev).toBeNull();
		});

		it('should play track at specific index', () => {
			const track = queue.playAt(2);
			expect(track).toEqual(mockTracks[2]);
			expect(get(queue).currentIndex).toBe(2);
		});
	});

	describe('State Invariants', () => {
		it('should never have currentIndex >= tracks.length', () => {
			queue.setQueue(mockTracks, 0);
			queue.remove(1);
			queue.remove(1);

			const state = get(queue);
			expect(state.currentIndex).toBeLessThan(state.tracks.length);
		});

		it('should maintain queue integrity when removing current track', () => {
			queue.setQueue(mockTracks, 1);
			const initialCurrent = get(queue).currentIndex;

			queue.remove(initialCurrent);

			const state = get(queue);
			// Current index should be adjusted
			expect(state.currentIndex).toBeGreaterThanOrEqual(-1);
			expect(state.currentIndex).toBeLessThan(state.tracks.length);
		});

		it('should handle shuffle state correctly', () => {
			queue.setQueue(mockTracks, 0);
			queue.toggleShuffle();

			const state = get(queue);
			expect(state.shuffleEnabled).toBe(true);
			expect(state.tracks).toHaveLength(mockTracks.length);

			// All original tracks should still be present
			mockTracks.forEach(track => {
				expect(state.tracks).toContainEqual(track);
			});
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty queue operations', () => {
			expect(() => queue.getNextTrack()).not.toThrow();
			expect(() => queue.getPreviousTrack()).not.toThrow();
			expect(() => queue.remove(0)).not.toThrow();
		});

		it('should handle playing at invalid index', () => {
			queue.setQueue(mockTracks, 0);

			const result1 = queue.playAt(-1);
			expect(result1).toBeNull();

			const result2 = queue.playAt(999);
			expect(result2).toBeNull();
		});

		it('should handle removing all tracks sequentially', () => {
			queue.setQueue(mockTracks, 0);

			expect(() => {
				queue.remove(0);
				queue.remove(0);
				queue.remove(0);
			}).not.toThrow();

			const state = get(queue);
			expect(state.tracks).toEqual([]);
		});
	});
});
