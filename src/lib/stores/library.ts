// Library store - favorites and playlists

import { writable, get } from 'svelte/store';
import type { Playlist, FavoriteEntry, FavoriteType } from '$lib/types';
import { loadFromStorage, scheduleAutoSave } from '$lib/services/persistence';

// Simple UUID generator
function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export interface LibraryState {
	favorites: FavoriteEntry[];
	playlists: Record<string, Playlist>;
	isDirty: boolean; // Has unsaved changes
}

// Try to load from localStorage first
const storedProfile = loadFromStorage();
const initialState: LibraryState = {
	favorites: storedProfile?.favorites || [],
	playlists: storedProfile?.playlists || {},
	isDirty: false
};

function createLibraryStore() {
	const { subscribe, set, update } = writable<LibraryState>(initialState);

	// Helper to trigger auto-save
	function triggerAutoSave(state: LibraryState) {
		const profile = loadFromStorage() || {
			schemaVersion: 1,
			exported: Date.now(),
			favorites: [],
			playlists: {},
			history: [],
			autoplayRules: [],
			settings: { volume: 0.7, repeat: 'off' as const, audioQuality: 'medium' as const }
		};

		scheduleAutoSave({
			...profile,
			favorites: state.favorites,
			playlists: state.playlists
		});
	}

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
		async toggleFavorite(id: string, favoriteType: FavoriteType = 'track') {
			const state = get({ subscribe });
			const isFav = state.favorites.some((f) => f.id === id);

			// If removing a track from favorites, also remove download
			if (isFav && favoriteType === 'track') {
				// Import offline store dynamically to avoid circular dependency
				const { offline } = await import('./offline');
				try {
					await offline.deleteTrack(id);
				} catch (e) {
					// Ignore if not downloaded
				}
			}

			update((state) => {
				const newState = {
					...state,
					favorites: isFav
						? state.favorites.filter((f) => f.id !== id)
						: [...state.favorites, { id, type: favoriteType, addedAt: Date.now() }],
					isDirty: true
				};
				triggerAutoSave(newState);
				return newState;
			});
		},

		isFavorite(id: string): boolean {
			const state = get({ subscribe });
			return state.favorites.some((f) => f.id === id);
		},

		getFavoritesByType(type: FavoriteType): FavoriteEntry[] {
			const state = get({ subscribe });
			return state.favorites.filter((f) => f.type === type);
		},

		// Playlists
		findPlaylistByName(name: string): Playlist | undefined {
			const state = get({ subscribe });
			const normalizedName = name.trim().toLowerCase();
			return Object.values(state.playlists).find(
				(playlist) => playlist.name.toLowerCase() === normalizedName
			);
		},

		createPlaylist(name: string, description?: string): string {
			const id = generateId();
			update((state) => {
				const newState = {
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
				};
				triggerAutoSave(newState);
				return newState;
			});
			return id;
		},

		updatePlaylist(id: string, updates: Partial<Omit<Playlist, 'id' | 'created'>>) {
			update((state) => {
				if (!state.playlists[id]) return state;

				const newState = {
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
				triggerAutoSave(newState);
				return newState;
			});
		},

		deletePlaylist(id: string) {
			update((state) => {
				const { [id]: deleted, ...rest } = state.playlists;
				const newState = {
					...state,
					playlists: rest,
					isDirty: true
				};
				triggerAutoSave(newState);
				return newState;
			});
		},

		addToPlaylist(playlistId: string, trackId: string) {
			update((state) => {
				const playlist = state.playlists[playlistId];
				if (!playlist) return state;

				// Don't add duplicates
				if (playlist.tracks.includes(trackId)) return state;

				const newState = {
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
				triggerAutoSave(newState);
				return newState;
			});
		},

		removeFromPlaylist(playlistId: string, trackId: string) {
			update((state) => {
				const playlist = state.playlists[playlistId];
				if (!playlist) return state;

				const newState = {
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
				triggerAutoSave(newState);
				return newState;
			});
		},

		reorderPlaylistTracks(playlistId: string, fromIndex: number, toIndex: number) {
			update((state) => {
				const playlist = state.playlists[playlistId];
				if (!playlist) return state;

				const newTracks = [...playlist.tracks];
				const [removed] = newTracks.splice(fromIndex, 1);
				newTracks.splice(toIndex, 0, removed);

				const newState = {
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
				triggerAutoSave(newState);
				return newState;
			});
		},

		// Load from imported profile
		loadFromProfile(data: { favorites: FavoriteEntry[]; playlists: Record<string, Playlist> }) {
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
