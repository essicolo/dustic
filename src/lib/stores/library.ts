// Library store - favorites and playlists

import { writable, get } from 'svelte/store';
import type { Playlist } from '$lib/types';

// Simple UUID generator
function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export interface LibraryState {
	favorites: string[]; // Track identifiers
	playlists: Record<string, Playlist>;
	isDirty: boolean; // Has unsaved changes
}

const initialState: LibraryState = {
	favorites: [],
	playlists: {},
	isDirty: false
};

function createLibraryStore() {
	const { subscribe, set, update } = writable<LibraryState>(initialState);

	return {
		subscribe,

		// Mark as dirty (has unsaved changes)
		markDirty() {
			update((state) => ({ ...state, isDirty: true }));
		},

		// Mark as clean (saved)
		markClean() {
			update((state) => ({ ...state, isDirty: false }));
		},

		// Favorites
		toggleFavorite(trackId: string) {
			update((state) => {
				const isFavorite = state.favorites.includes(trackId);
				return {
					...state,
					favorites: isFavorite
						? state.favorites.filter((id) => id !== trackId)
						: [...state.favorites, trackId],
					isDirty: true
				};
			});
		},

		isFavorite(trackId: string): boolean {
			const state = get({ subscribe });
			return state.favorites.includes(trackId);
		},

		// Playlists
		createPlaylist(name: string, description?: string): string {
			const id = generateId();
			update((state) => ({
				...state,
				playlists: {
					...state.playlists,
					[id]: {
						id,
						name,
						description,
						tracks: [],
						created: Date.now(),
						updated: Date.now()
					}
				},
				isDirty: true
			}));
			return id;
		},

		updatePlaylist(id: string, updates: Partial<Omit<Playlist, 'id' | 'created'>>) {
			update((state) => {
				if (!state.playlists[id]) return state;

				return {
					...state,
					playlists: {
						...state.playlists,
						[id]: {
							...state.playlists[id],
							...updates,
							updated: Date.now()
						}
					},
					isDirty: true
				};
			});
		},

		deletePlaylist(id: string) {
			update((state) => {
				const { [id]: deleted, ...rest } = state.playlists;
				return {
					...state,
					playlists: rest,
					isDirty: true
				};
			});
		},

		addToPlaylist(playlistId: string, trackId: string) {
			update((state) => {
				const playlist = state.playlists[playlistId];
				if (!playlist) return state;

				// Don't add duplicates
				if (playlist.tracks.includes(trackId)) return state;

				return {
					...state,
					playlists: {
						...state.playlists,
						[playlistId]: {
							...playlist,
							tracks: [...playlist.tracks, trackId],
							updated: Date.now()
						}
					},
					isDirty: true
				};
			});
		},

		removeFromPlaylist(playlistId: string, trackId: string) {
			update((state) => {
				const playlist = state.playlists[playlistId];
				if (!playlist) return state;

				return {
					...state,
					playlists: {
						...state.playlists,
						[playlistId]: {
							...playlist,
							tracks: playlist.tracks.filter((id) => id !== trackId),
							updated: Date.now()
						}
					},
					isDirty: true
				};
			});
		},

		reorderPlaylistTracks(playlistId: string, fromIndex: number, toIndex: number) {
			update((state) => {
				const playlist = state.playlists[playlistId];
				if (!playlist) return state;

				const newTracks = [...playlist.tracks];
				const [removed] = newTracks.splice(fromIndex, 1);
				newTracks.splice(toIndex, 0, removed);

				return {
					...state,
					playlists: {
						...state.playlists,
						[playlistId]: {
							...playlist,
							tracks: newTracks,
							updated: Date.now()
						}
					},
					isDirty: true
				};
			});
		},

		// Load from imported profile
		loadFromProfile(data: { favorites: string[]; playlists: Record<string, Playlist> }) {
			update((state) => ({
				...state,
				favorites: data.favorites,
				playlists: data.playlists,
				isDirty: false
			}));
		},

		// Reset to empty
		reset() {
			set(initialState);
		}
	};
}

export const library = createLibraryStore();
