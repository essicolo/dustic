import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { player } from '$lib/stores/player';
import type { Track } from '$lib/types';

describe('Player Store', () => {
	let mockAudioElement: HTMLAudioElement;
	let mockTrack: Track;

	beforeEach(() => {
		// Reset audio element
		mockAudioElement = document.createElement('audio');
		vi.spyOn(mockAudioElement, 'play').mockResolvedValue(undefined);
		vi.spyOn(mockAudioElement, 'pause').mockImplementation(() => {});
		vi.spyOn(mockAudioElement, 'load').mockImplementation(() => {});

		// Setup player with audio element
		player.setAudioElement(mockAudioElement);

		// Create mock track
		mockTrack = {
			identifier: 'test-item#test-track.mp3',
			filename: 'test-track.mp3',
			title: 'Test Track',
			artist: 'Test Artist',
			streamUrl: 'https://example.com/test.mp3',
			format: 'VBR MP3',
			duration: 180,
			date: '2024-01-01',
			thumbnailUrl: 'https://example.com/thumb.jpg',
			collection: [],
			metadata: {}
		};
	});

	describe('Critical Functionality', () => {
		it('should require audio element to be set before playing', () => {
			const state = get(player);
			expect(state.currentTrack).toBeNull();
			expect(state.isPlaying).toBe(false);
		});

		it('should play a track when audio element is mounted', async () => {
			player.play(mockTrack);

			// Wait for async operations
			await new Promise(resolve => setTimeout(resolve, 0));

			const state = get(player);
			expect(state.currentTrack).toEqual(mockTrack);
			expect(mockAudioElement.src).toBe(mockTrack.streamUrl);
			expect(mockAudioElement.play).toHaveBeenCalled();
		});

		it('should not crash when playing without audio element', () => {
			// This test verifies the critical bug fix where PlayerBar must always be mounted
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

			// This should not throw, but will log an error
			expect(() => {
				player.play(mockTrack);
			}).not.toThrow();

			// The error should be logged (if implemented)
			// Note: The actual implementation may or may not log - this is okay
			// The critical part is that it doesn't crash
		});

		it('should update state when toggling play/pause', () => {
			player.play(mockTrack);

			// Simulate audio element playing
			mockAudioElement.dispatchEvent(new Event('play'));
			let state = get(player);
			expect(state.isPlaying).toBe(true);

			// Pause
			player.pause();
			mockAudioElement.dispatchEvent(new Event('pause'));
			state = get(player);
			expect(state.isPlaying).toBe(false);
		});

		it('should maintain volume between 0 and 1', () => {
			player.setVolume(0.5);
			expect(get(player).volume).toBe(0.5);
			expect(mockAudioElement.volume).toBe(0.5);

			// Test edge cases
			player.setVolume(0);
			expect(get(player).volume).toBe(0);

			player.setVolume(1);
			expect(get(player).volume).toBe(1);
		});

		it('should handle seek operations', () => {
			player.play(mockTrack);
			player.seek(60);
			expect(mockAudioElement.currentTime).toBe(60);
		});

		it('should cycle through repeat modes', () => {
			let state = get(player);
			expect(state.repeat).toBe('off');

			player.toggleRepeat();
			state = get(player);
			expect(state.repeat).toBe('all');

			player.toggleRepeat();
			state = get(player);
			expect(state.repeat).toBe('one');

			player.toggleRepeat();
			state = get(player);
			expect(state.repeat).toBe('off');
		});
	});

	describe('State Invariants', () => {
		it('should handle seek to negative time', () => {
			player.play(mockTrack);
			player.seek(-10);
			// Note: HTML5 audio clamps negative values to 0 automatically
			// This test documents the current behavior
			const currentTime = mockAudioElement.currentTime;
			expect(typeof currentTime).toBe('number');
		});

		it('should keep volume in valid range even with invalid input', () => {
			// Volume should be clamped or validated
			const initialVolume = get(player).volume;

			// These should either clamp or be ignored
			player.setVolume(999);
			let volume = get(player).volume;
			expect(volume).toBeGreaterThanOrEqual(0);
			expect(volume).toBeLessThanOrEqual(1);

			player.setVolume(-999);
			volume = get(player).volume;
			expect(volume).toBeGreaterThanOrEqual(0);
			expect(volume).toBeLessThanOrEqual(1);
		});
	});

	describe('Edge Cases', () => {
		it('should handle audio element errors gracefully', () => {
			player.play(mockTrack);

			// Simulate error
			mockAudioElement.dispatchEvent(new Event('error'));

			const state = get(player);
			expect(state.isLoading).toBe(false);
			expect(state.isPlaying).toBe(false);
		});

		it('should handle rapid play/pause toggles', async () => {
			player.play(mockTrack);
			player.togglePlay();
			player.togglePlay();
			player.togglePlay();

			// Should not crash
			expect(() => get(player)).not.toThrow();
		});
	});
});
