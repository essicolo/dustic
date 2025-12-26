// History tracking store

import { writable, get } from 'svelte/store';
import type { HistoryEntry } from '$lib/types';
import { CONFIG } from '$lib/utils/constants';

export interface HistoryState {
	entries: HistoryEntry[];
	isDirty: boolean;
}

const initialState: HistoryState = {
	entries: [],
	isDirty: false
};

function createHistoryStore() {
	const { subscribe, set, update } = writable<HistoryState>(initialState);

	return {
		subscribe,

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

				return {
					...state,
					entries: newEntries,
					isDirty: true
				};
			});
		},

		// Clear all history
		clear() {
			update((state) => ({
				...state,
				entries: [],
				isDirty: true
			}));
		},

		// Remove specific entry
		remove(trackId: string) {
			update((state) => ({
				...state,
				entries: state.entries.filter((e) => e.trackId !== trackId),
				isDirty: true
			}));
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
