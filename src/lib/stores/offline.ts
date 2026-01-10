// Offline download manager store

import { writable, derived, get } from 'svelte/store';
import { offlineStorage, type OfflineTrack } from '$lib/services/offlineStorage';
import type { Track } from '$lib/types';
import { library } from './library';

export interface DownloadProgress {
	trackId: string;
	progress: number; // 0-100
	status: 'downloading' | 'completed' | 'error';
	error?: string;
}

interface OfflineState {
	downloadQueue: Map<string, DownloadProgress>;
	offlineTracks: OfflineTrack[];
	storageUsed: number;
	storageQuota: number;
	isLoading: boolean;
}

const initialState: OfflineState = {
	downloadQueue: new Map(),
	offlineTracks: [],
	storageUsed: 0,
	storageQuota: 0,
	isLoading: false
};

function createOfflineStore() {
	const { subscribe, set, update } = writable<OfflineState>(initialState);

	return {
		subscribe,

		/**
		 * Load offline tracks from storage
		 */
		async loadOfflineTracks() {
			update((state) => ({ ...state, isLoading: true }));

			try {
				const tracks = await offlineStorage.getAllTracks();
				const storageInfo = await offlineStorage.getStorageInfo();

				update((state) => ({
					...state,
					offlineTracks: tracks,
					storageUsed: storageInfo.used,
					storageQuota: storageInfo.quota,
					isLoading: false
				}));
			} catch (error) {
				console.error('Failed to load offline tracks:', error);
				update((state) => ({ ...state, isLoading: false }));
			}
		},

		/**
		 * Download a track for offline use
		 */
		async downloadTrack(track: Track) {
			const state = get({ subscribe });

			// Check if already downloading
			if (state.downloadQueue.has(track.identifier)) {
				return;
			}

			// Add to download queue
			update((state) => {
				const newQueue = new Map(state.downloadQueue);
				newQueue.set(track.identifier, {
					trackId: track.identifier,
					progress: 0,
					status: 'downloading'
				});
				return { ...state, downloadQueue: newQueue };
			});

			try {
				// Download with progress tracking
				await offlineStorage.downloadTrack(track, (progress) => {
					update((state) => {
						const newQueue = new Map(state.downloadQueue);
						const current = newQueue.get(track.identifier);
						if (current) {
							current.progress = Math.round(progress);
						}
						return { ...state, downloadQueue: newQueue };
					});
				});

				// Mark as completed
				update((state) => {
					const newQueue = new Map(state.downloadQueue);
					const current = newQueue.get(track.identifier);
					if (current) {
						current.status = 'completed';
						current.progress = 100;
					}
					return { ...state, downloadQueue: newQueue };
				});

				// Auto-add to favorites when downloading
				const baseId = track.identifier.split('#')[0];
				if (!library.isFavorite(baseId)) {
					library.toggleFavorite(baseId);
				}

				// Remove from queue after a delay
				setTimeout(() => {
					update((state) => {
						const newQueue = new Map(state.downloadQueue);
						newQueue.delete(track.identifier);
						return { ...state, downloadQueue: newQueue };
					});
				}, 2000);

				// Reload offline tracks
				await this.loadOfflineTracks();
			} catch (error: any) {
				console.error('Download failed:', error);

				// Mark as error
				update((state) => {
					const newQueue = new Map(state.downloadQueue);
					const current = newQueue.get(track.identifier);
					if (current) {
						current.status = 'error';
						current.error = error.message || 'Download failed';
					}
					return { ...state, downloadQueue: newQueue };
				});

				// Remove from queue after delay
				setTimeout(() => {
					update((state) => {
						const newQueue = new Map(state.downloadQueue);
						newQueue.delete(track.identifier);
						return { ...state, downloadQueue: newQueue };
					});
				}, 3000);
			}
		},

		/**
		 * Delete an offline track
		 */
		async deleteTrack(identifier: string) {
			try {
				await offlineStorage.deleteTrack(identifier);
				await this.loadOfflineTracks();
			} catch (error) {
				console.error('Failed to delete track:', error);
				throw error;
			}
		},

		/**
		 * Check if a track is available offline
		 */
		async isOffline(identifier: string): Promise<boolean> {
			return offlineStorage.isDownloaded(identifier);
		},

		/**
		 * Get offline track for playback
		 */
		async getOfflineTrack(identifier: string): Promise<Track | null> {
			return offlineStorage.getOfflineTrack(identifier);
		},

		/**
		 * Clear all offline data
		 */
		async clearAll() {
			try {
				await offlineStorage.clearAll();
				update((state) => ({
					...state,
					offlineTracks: [],
					storageUsed: 0,
					downloadQueue: new Map()
				}));
			} catch (error) {
				console.error('Failed to clear offline data:', error);
				throw error;
			}
		},

		/**
		 * Get download progress for a track
		 */
		getDownloadProgress(identifier: string): DownloadProgress | null {
			const state = get({ subscribe });
			return state.downloadQueue.get(identifier) || null;
		}
	};
}

export const offline = createOfflineStore();

// Derived store for checking if track is downloading
export const isDownloading = derived(offline, ($offline) => (identifier: string) => {
	const progress = $offline.downloadQueue.get(identifier);
	return progress?.status === 'downloading';
});

// Derived store for Set-based lookups (Issue #6 - O(1) instead of O(n))
export const offlineTrackSet = derived(offline, ($offline) => {
	const set = new Set<string>();
	$offline.offlineTracks.forEach((t) => {
		const trackId = t.track.identifier;
		set.add(trackId);

		// Also add base ID variants for "foo" and "foo#0" equivalence
		const baseId = trackId.split('#')[0];
		const index = trackId.includes('#') ? parseInt(trackId.split('#')[1]) : 0;
		if (index === 0) {
			set.add(baseId);
		}
	});
	return set;
});

// Optimized offline availability check with Set (Issue #6)
export const isOfflineAvailable = derived(offlineTrackSet, ($set) => (identifier: string) => {
	if ($set.has(identifier)) return true;

	// Check base ID variant
	const baseId = identifier.split('#')[0];
	const index = identifier.includes('#') ? parseInt(identifier.split('#')[1]) : 0;
	if (index === 0 && $set.has(baseId)) return true;
	if (!identifier.includes('#') && $set.has(`${baseId}#0`)) return true;

	return false;
});
