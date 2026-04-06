// History tracking store

import { writable, get } from 'svelte/store';
import type { HistoryEntry } from '$lib/types';
import { CONFIG } from '$lib/utils/constants';
import { loadFromStorageSync, loadFromStorage, scheduleAutoSave } from '$lib/services/persistence';

export interface HistoryState {
	entries: HistoryEntry[];
	isDirty: boolean;
}

// Try to load from localStorage first (sync version for initial load)
const storedProfile = loadFromStorageSync();
const initialState: HistoryState = {
	entries: storedProfile?.history || [],
	isDirty: false
};

function createHistoryStore() {
	const { subscribe, set, update } = writable<HistoryState>(initialState);

	// Helper to trigger auto-save
	function triggerAutoSave() {
		const state = get({ subscribe });
		const profile = loadFromStorageSync() || {
			schemaVersion: 2,
			exported: Date.now(),
			favorites: [],
			playlists: {},
			history: [],
			autoplayRules: [],
			settings: { volume: 0.7, repeat: 'off' as const, audioQuality: 'medium' as const }
		};

		scheduleAutoSave({
			...profile,
			history: state.entries
		});
	}

	return {
		subscribe,

		// Initialize from storage (tries IndexedDB if localStorage is empty)
		// Important for iOS PWAs
		async init() {
			const profile = await loadFromStorage();
			if (profile?.history) {
				update((state) => ({
					...state,
					entries: profile.history
				}));
			}
		},

		// Add track to history
		addTrack(trackId: string, completionRate: number = 0) {
			update((state) => {
				// Remove existing entry for this track
				const filtered = state.entries.filter((e) => e.trackId !== trackId);

				// Add new entry at the beginning
				const newEntries = [
					{
						trackId,
						playedAt: Date.now(),
						completionRate
					},
					...filtered
				].slice(0, CONFIG.maxHistorySize);

				const newState = {
					...state,
					entries: newEntries,
					isDirty: true
				};
				triggerAutoSave();
				return newState;
			});
		},

		// Clear all history
		clear() {
			update((state) => {
				const newState = {
					...state,
					entries: [],
					isDirty: true
				};
				triggerAutoSave();
				return newState;
			});
		},

		// Remove specific entry
		remove(trackId: string) {
			update((state) => {
				const newState = {
					...state,
					entries: state.entries.filter((e) => e.trackId !== trackId),
					isDirty: true
				};
				triggerAutoSave();
				return newState;
			});
		},

		// Check if track was played recently (within last hour)
		wasRecentlyPlayed(trackId: string): boolean {
			const state = get({ subscribe });
			const oneHourAgo = Date.now() - 60 * 60 * 1000;
			return state.entries.some(
				(e) => e.trackId === trackId && e.playedAt > oneHourAgo
			);
		},

		// Get recent tracks (last N)
		getRecent(limit: number = 20): HistoryEntry[] {
			const state = get({ subscribe });
			return state.entries.slice(0, limit);
		},

		// Load from imported profile
		loadFromProfile(entries: HistoryEntry[]) {
			update((state) => ({
				...state,
				entries: entries.slice(0, CONFIG.maxHistorySize),
				isDirty: false
			}));
		},

		// Mark as dirty
		markDirty() {
			update((state) => ({ ...state, isDirty: true }));
		},

		// Mark as clean
		markClean() {
			update((state) => ({ ...state, isDirty: false }));
		},

		// Reset
		reset() {
			set(initialState);
		}
	};
}

export const history = createHistoryStore();
