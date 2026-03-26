import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock persistence before importing library store
const mockStorage: Record<string, string> = {};

vi.mock('$lib/services/persistence', () => ({
	loadFromStorage: vi.fn(() => {
		const stored = mockStorage['dustic-profile'];
		return stored ? JSON.parse(stored) : null;
	}),
	scheduleAutoSave: vi.fn((profile) => {
		// Simulate immediate save for testing
		mockStorage['dustic-profile'] = JSON.stringify(profile);
	})
}));

describe('library store', () => {
	beforeEach(() => {
		// Clear mock storage
		Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
		// Reset modules to get fresh store instance
		vi.resetModules();
	});

	it('should persist favorites after toggling', async () => {
		const { library } = await import('$lib/stores/library');
		const { scheduleAutoSave } = await import('$lib/services/persistence');

		// Add a favorite
		await library.toggleFavorite('track-1');

		let state = get(library);
		expect(state.favorites).toContain('track-1');

		// Check that auto-save was called with the NEW state (including track-1)
		expect(scheduleAutoSave).toHaveBeenCalledWith(
			expect.objectContaining({
				favorites: expect.arrayContaining(['track-1'])
			})
		);

		// Remove the favorite
		await library.toggleFavorite('track-1');

		state = get(library);
		expect(state.favorites).not.toContain('track-1');

		// Check that auto-save was called with track-1 REMOVED
		expect(scheduleAutoSave).toHaveBeenLastCalledWith(
			expect.objectContaining({
				favorites: expect.not.arrayContaining(['track-1'])
			})
		);
	});

	it('should persist playlist changes', async () => {
		const { library } = await import('$lib/stores/library');
		const { scheduleAutoSave } = await import('$lib/services/persistence');

		const playlistId = library.createPlaylist('Test Playlist');
		const state = get(library);

		expect(state.playlists[playlistId]).toBeDefined();
		expect(state.playlists[playlistId].name).toBe('Test Playlist');

		// Verify auto-save includes the new playlist
		expect(scheduleAutoSave).toHaveBeenCalledWith(
			expect.objectContaining({
				playlists: expect.objectContaining({
					[playlistId]: expect.objectContaining({ name: 'Test Playlist' })
				})
			})
		);
	});

	it('should persist adding tracks to playlists', async () => {
		const { library } = await import('$lib/stores/library');
		const { scheduleAutoSave } = await import('$lib/services/persistence');

		const playlistId = library.createPlaylist('My Playlist');
		library.addToPlaylist(playlistId, 'track-abc');

		const state = get(library);
		expect(state.playlists[playlistId].tracks).toContain('track-abc');

		expect(scheduleAutoSave).toHaveBeenLastCalledWith(
			expect.objectContaining({
				playlists: expect.objectContaining({
					[playlistId]: expect.objectContaining({
						tracks: expect.arrayContaining(['track-abc'])
					})
				})
			})
		);
	});
});
