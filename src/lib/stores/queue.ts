// Queue management store

import { writable, get } from 'svelte/store';
import type { Track } from '$lib/types';
import { CONFIG } from '$lib/utils/constants';

export interface QueueState {
	tracks: Track[];
	currentIndex: number;
	history: Track[];
	shuffleEnabled: boolean;
	originalOrder: Track[]; // Store original order when shuffle is enabled
}

const initialState: QueueState = {
	tracks: [],
	currentIndex: -1,
	history: [],
	shuffleEnabled: false,
	originalOrder: []
};

function createQueueStore() {
	const { subscribe, set, update } = writable<QueueState>(initialState);

	return {
		subscribe,

		// Add track to play next
		addNext(track: Track) {
			update((state) => {
				const newTracks = [...state.tracks];
				const insertIndex = state.currentIndex + 1;
				newTracks.splice(insertIndex, 0, track);

				return {
					...state,
					tracks: newTracks
				};
			});
		},

		// Add tracks to end of queue
		addToEnd(tracks: Track | Track[]) {
			const tracksArray = Array.isArray(tracks) ? tracks : [tracks];

			update((state) => {
				if (state.tracks.length >= CONFIG.maxQueueSize) {
					console.warn('Queue is full');
					return state;
				}

				const newTracks = [...state.tracks, ...tracksArray].slice(0, CONFIG.maxQueueSize);

				return {
					...state,
					tracks: newTracks
				};
			});
		},

		// Remove track at index
		remove(index: number) {
			update((state) => {
				const newTracks = state.tracks.filter((_, i) => i !== index);
				let newIndex = state.currentIndex;

				// Adjust current index if needed
				if (index < state.currentIndex) {
					newIndex--;
				} else if (index === state.currentIndex && newTracks.length > 0) {
					// If we removed current track, keep same index (plays next track)
					newIndex = Math.min(newIndex, newTracks.length - 1);
				}

				return {
					...state,
					tracks: newTracks,
					currentIndex: newIndex
				};
			});
		},

		// Reorder track from one position to another
		reorder(fromIndex: number, toIndex: number) {
			update((state) => {
				const newTracks = [...state.tracks];
				const [removed] = newTracks.splice(fromIndex, 1);
				newTracks.splice(toIndex, 0, removed);

				// Adjust current index
				let newCurrentIndex = state.currentIndex;
				if (fromIndex === state.currentIndex) {
					newCurrentIndex = toIndex;
				} else if (fromIndex < state.currentIndex && toIndex >= state.currentIndex) {
					newCurrentIndex--;
				} else if (fromIndex > state.currentIndex && toIndex <= state.currentIndex) {
					newCurrentIndex++;
				}

				return {
					...state,
					tracks: newTracks,
					currentIndex: newCurrentIndex
				};
			});
		},

		// Clear all tracks
		clear() {
			update((state) => ({
				...state,
				tracks: [],
				currentIndex: -1,
				originalOrder: []
			}));
		},

		// Get current track
		getCurrentTrack(): Track | null {
			const state = get({ subscribe });
			if (state.currentIndex >= 0 && state.currentIndex < state.tracks.length) {
				return state.tracks[state.currentIndex];
			}
			return null;
		},

		// Get next track
		getNextTrack(): Track | null {
			const state = get({ subscribe });
			const nextIndex = state.currentIndex + 1;
			if (nextIndex < state.tracks.length) {
				return state.tracks[nextIndex];
			}
			return null;
		},

		// Get previous track
		getPreviousTrack(): Track | null {
			const state = get({ subscribe });
			const prevIndex = state.currentIndex - 1;
			if (prevIndex >= 0) {
				return state.tracks[prevIndex];
			}
			return null;
		},

		// Move to next track
		next(): Track | null {
			let nextTrack: Track | null = null;

			update((state) => {
				const nextIndex = state.currentIndex + 1;

				if (nextIndex < state.tracks.length) {
					nextTrack = state.tracks[nextIndex];

					// Add current track to history
					const newHistory = state.tracks[state.currentIndex]
						? [...state.history, state.tracks[state.currentIndex]].slice(-CONFIG.maxHistorySize)
						: state.history;

					return {
						...state,
						currentIndex: nextIndex,
						history: newHistory
					};
				}

				return state;
			});

			return nextTrack;
		},

		// Move to previous track
		previous(): Track | null {
			let prevTrack: Track | null = null;

			update((state) => {
				const prevIndex = state.currentIndex - 1;

				if (prevIndex >= 0) {
					prevTrack = state.tracks[prevIndex];

					return {
						...state,
						currentIndex: prevIndex
					};
				} else if (state.history.length > 0) {
					// Go back to history
					const historyTrack = state.history[state.history.length - 1];
					prevTrack = historyTrack;

					return {
						...state,
						tracks: [historyTrack, ...state.tracks],
						currentIndex: 0,
						history: state.history.slice(0, -1)
					};
				}

				return state;
			});

			return prevTrack;
		},

		// Play track at specific index
		playAt(index: number): Track | null {
			let track: Track | null = null;

			update((state) => {
				if (index >= 0 && index < state.tracks.length) {
					track = state.tracks[index];

					// Add current track to history if moving forward
					const newHistory = state.currentIndex >= 0 && state.tracks[state.currentIndex]
						? [...state.history, state.tracks[state.currentIndex]].slice(-CONFIG.maxHistorySize)
						: state.history;

					return {
						...state,
						currentIndex: index,
						history: newHistory
					};
				}

				return state;
			});

			return track;
		},

		// Set entire queue and start playing
		setQueue(tracks: Track[], startIndex: number = 0) {
			update((state) => ({
				...state,
				tracks,
				currentIndex: startIndex,
				originalOrder: state.shuffleEnabled ? tracks : []
			}));

			return tracks[startIndex] || null;
		},

		// Enable shuffle
		enableShuffle() {
			update((state) => {
				if (state.shuffleEnabled) return state;

				// Store original order
				const originalOrder = [...state.tracks];

				// Get current track to keep it in place
				const currentTrack = state.tracks[state.currentIndex];

				// Shuffle all tracks except current
				const beforeCurrent = state.tracks.slice(0, state.currentIndex);
				const afterCurrent = state.tracks.slice(state.currentIndex + 1);
				const toShuffle = [...beforeCurrent, ...afterCurrent];

				// Fisher-Yates shuffle
				for (let i = toShuffle.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[toShuffle[i], toShuffle[j]] = [toShuffle[j], toShuffle[i]];
				}

				// Rebuild queue with current track at same position
				const shuffledTracks = currentTrack
					? [
						...toShuffle.slice(0, state.currentIndex),
						currentTrack,
						...toShuffle.slice(state.currentIndex)
					]
					: toShuffle;

				return {
					...state,
					tracks: shuffledTracks,
					originalOrder,
					shuffleEnabled: true
				};
			});
		},

		// Disable shuffle (restore original order)
		disableShuffle() {
			update((state) => {
				if (!state.shuffleEnabled || state.originalOrder.length === 0) {
					return { ...state, shuffleEnabled: false };
				}

				// Find current track in original order
				const currentTrack = state.tracks[state.currentIndex];
				const newIndex = currentTrack
					? state.originalOrder.findIndex(t => t.identifier === currentTrack.identifier)
					: -1;

				return {
					...state,
					tracks: state.originalOrder,
					currentIndex: newIndex >= 0 ? newIndex : state.currentIndex,
					originalOrder: [],
					shuffleEnabled: false
				};
			});
		},

		// Toggle shuffle
		toggleShuffle() {
			const state = get({ subscribe });
			if (state.shuffleEnabled) {
				this.disableShuffle();
			} else {
				this.enableShuffle();
			}
		}
	};
}

export const queue = createQueueStore();
