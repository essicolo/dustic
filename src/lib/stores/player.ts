// Player store with audio controls

import { writable, derived, get } from 'svelte/store';
import type { Track } from '$lib/types';
import { queue } from './queue';
import { history } from './history';
import { getNextTrack as getAutoplayTrack } from '$lib/services/autoplay';
import { unifiedGetTrack as getTrack } from '$lib/services/sources';
import { offlineStorage } from '$lib/services/offlineStorage';
import { settings } from './settings';
import { decodeIdentifier, fetchTrackBlob, findLibrary } from '$lib/services/webdavLibrary';
import { loadFromStorageSync, getCachedProfile, scheduleAutoSave } from '$lib/services/persistence';

export interface PlayerState {
	currentTrack: Track | null;
	isPlaying: boolean;
	volume: number; // 0-1
	currentTime: number; // seconds
	duration: number; // seconds
	repeat: 'off' | 'one' | 'all';
	shuffle: boolean;
	isLoading: boolean;
}

// Load last played track from storage
const storedProfile = loadFromStorageSync();
const initialState: PlayerState = {
	currentTrack: storedProfile?.lastPlayedTrack || null,
	isPlaying: false,
	volume: storedProfile?.settings?.volume || 0.7,
	currentTime: storedProfile?.lastPlayedPosition || 0,
	duration: 0,
	repeat: storedProfile?.settings?.repeat || 'off',
	shuffle: false,
	isLoading: false
};

// Create the store
function createPlayerStore() {
	const { subscribe, set, update } = writable<PlayerState>(initialState);

	// Audio element reference (will be set from component)
	let audioElement: HTMLAudioElement | null = null;
	let iosAudioUnlocked = false;
	let currentBlobUrl: string | null = null;
	let consecutiveErrors = 0;
	const MAX_CONSECUTIVE_ERRORS = 3;
	// Position restore only applies to the FIRST track loaded after app
	// open (the one we restore from lastPlayedPosition). Every subsequent
	// user-initiated play() starts from 0.
	let allowPositionRestore = true;
	// Track the last track that actually played successfully, so autoplay
	// can use it as basis instead of a failed track
	let lastSuccessfulTrack: Track | null = null;

	// Helper to save player state (last track and position)
	function savePlayerState(state: PlayerState) {
		const profile = getCachedProfile() || loadFromStorageSync();
		if (!profile) return;

		// Only save if track has changed or position has advanced significantly
		const positionChanged = Math.abs((profile.lastPlayedPosition || 0) - state.currentTime) > 30;
		const trackChanged = profile.lastPlayedTrack?.identifier !== state.currentTrack?.identifier;

		if (trackChanged || positionChanged) {
			profile.lastPlayedTrack = state.currentTrack || undefined;
			profile.lastPlayedPosition = state.currentTime;
			scheduleAutoSave(profile);
		}
	}

	return {
		subscribe,

		// iOS audio unlock - must be called synchronously in a user gesture.
		// Used by AudioCard where an `await` separates the gesture from the
		// actual playTrack call. PlayerBar doesn't need this because
		// togglePlay → resume → play() is already synchronous in the gesture.
		unlockIOSAudio(): void {
			if (iosAudioUnlocked || !audioElement) {
				return;
			}

			iosAudioUnlocked = true;

			const el = audioElement;
			// Calling play() in a user gesture registers the gesture with the browser,
			// unlocking future play() calls even outside gesture context.
			// Pause immediately to prevent any audible playback of a restored track.
			el.play().catch(() => {});
			el.pause();
		},

		// Set the audio element reference
		setAudioElement(element: HTMLAudioElement) {
			audioElement = element;

			// Set up event listeners
			element.addEventListener('loadstart', () => {
				update((state) => ({ ...state, isLoading: true }));
			});

			element.addEventListener('canplay', () => {
				update((state) => ({ ...state, isLoading: false }));
			});

			element.addEventListener('play', () => {
				update((state) => ({ ...state, isPlaying: true }));
			});

			element.addEventListener('pause', () => {
				update((state) => ({ ...state, isPlaying: false }));
			});

			element.addEventListener('timeupdate', () => {
				update((state) => {
					const newState = {
						...state,
						currentTime: element.currentTime,
						duration: element.duration || 0
					};
					// Save player state periodically (debounced in savePlayerState)
					savePlayerState(newState);
					return newState;
				});
			});

			element.addEventListener('ended', async () => {
				const state = get({ subscribe });
				if (state.repeat === 'one') {
					element.currentTime = 0;
					element.play();
				} else if (state.repeat === 'all' || queue.getNextTrack()) {
					// Auto-play next track from queue
					this.next();
				} else {
					// Queue is empty - use autoplay
					await this.autoplayNext();
				}
			});

			element.addEventListener('error', (e) => {
				const error = element.error;
				console.error('[Player] Audio error:', error?.code, error?.message);
				update((state) => ({ ...state, isLoading: false, isPlaying: false }));

				// Auto-skip on playback errors, but stop after MAX_CONSECUTIVE_ERRORS
				if (error?.code === 4 || error?.code === 2) {
					consecutiveErrors++;
					if (consecutiveErrors <= MAX_CONSECUTIVE_ERRORS) {
						console.log(`[Player] Skipping unplayable track (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})...`);
						// Use autoplayNext with last successful track as basis,
						// NOT the failed track (which would search for the wrong artist)
						setTimeout(() => this.autoplayNext(), 500);
					} else {
						console.warn('[Player] Too many consecutive errors, stopping playback');
						consecutiveErrors = 0;
					}
				}
			});

			element.addEventListener('loadeddata', () => {
				consecutiveErrors = 0; // Reset on successful load
				// Remember this track as last successful for autoplay fallback
				const state = get({ subscribe });
				if (state.currentTrack) {
					lastSuccessfulTrack = state.currentTrack;
				}
			});

			element.addEventListener('loadedmetadata', () => {
				// Restore the saved position only on the very first track loaded
				// after app open (the lastPlayedTrack from a previous session).
				// All later track switches start at 0.
				const state = get({ subscribe });
				if (
					allowPositionRestore &&
					state.currentTime > 0 &&
					element.currentTime === 0
				) {
					element.currentTime = state.currentTime;
					console.log('[Player] Restored position:', state.currentTime);
				}
				allowPositionRestore = false;
			});

			element.addEventListener('waiting', () => {});
			element.addEventListener('stalled', () => {});

			// Set initial volume
			element.volume = initialState.volume;

			// If there's a current track from restored state, load it into audio element.
			// WebDAV tracks need a fresh fetch on user gesture; skip auto-restore.
			const currentState = get({ subscribe });
			if (
				currentState.currentTrack &&
				currentState.currentTrack.streamUrl &&
				currentState.currentTrack.source !== 'webdav'
			) {
				console.log('[Player] Restoring track on audio element mount:', currentState.currentTrack.title);
				element.src = currentState.currentTrack.streamUrl;
				element.load();
			}
		},

		// Play a track
		async play(track: Track) {
			if (!audioElement) {
				console.error('[Player] Audio element not set');
				return;
			}
			// User-initiated play always starts at 0.
			allowPositionRestore = false;

			// Stop the previous track *before* any await. If we don't pause
			// here, the timeupdate listener keeps firing on the old audio
			// during the WebDAV blob fetch (which can take a second or two)
			// and overwrites state.currentTime back to the old track's
			// position. Then when loadedmetadata fires on the new src, the
			// restore-position logic seeks the new track to that old offset.
			try {
				audioElement.pause();
				audioElement.removeAttribute('src');
				audioElement.load();
			} catch {
				// element might not have a src yet — that's fine.
			}

			// Check if track is available offline (use blob URL instead of remote URL)
			try {
				const offlineTrack = await offlineStorage.getOfflineTrack(track.identifier);
				if (offlineTrack && offlineTrack.streamUrl !== track.streamUrl) {
					console.log('[Player] Using offline version:', track.title);
					track = { ...track, streamUrl: offlineTrack.streamUrl };
				}
			} catch {
				// Offline storage not available, continue with original URL
			}

			console.log('[Player] Playing:', track.title, track.source || 'ia');

			update((state) => {
				const newState = {
					...state,
					currentTrack: track,
					currentTime: 0, // Reset position when switching tracks
					isLoading: true
				};
				// Save the new track to profile
				savePlayerState(newState);
				return newState;
			});

			// Add to history when starting to play
			history.addTrack(track.identifier, 0);

			// Update Media Session API for lock screen/notification controls
			if ('mediaSession' in navigator) {
				navigator.mediaSession.metadata = new MediaMetadata({
					title: track.title,
					artist: track.artist,
					album: track.date || 'Internet Archive',
					artwork: track.thumbnailUrl
						? [
								{
									src: track.thumbnailUrl,
									sizes: '512x512',
									type: 'image/jpeg'
								}
							]
						: []
				});

				// Set up action handlers for media controls
				navigator.mediaSession.setActionHandler('play', () => this.resume());
				navigator.mediaSession.setActionHandler('pause', () => this.pause());
				navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
				navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
				navigator.mediaSession.setActionHandler('seekbackward', () => {
					const state = get({ subscribe });
					this.seek(Math.max(0, state.currentTime - 10));
				});
				navigator.mediaSession.setActionHandler('seekforward', () => {
					const state = get({ subscribe });
					this.seek(Math.min(state.duration, state.currentTime + 10));
				});
			}

			// Revoke previous blob URL to prevent memory leaks
			if (currentBlobUrl) {
				URL.revokeObjectURL(currentBlobUrl);
				currentBlobUrl = null;
			}

			// WebDAV tracks must be fetched through the auth proxy (POST with
			// credentials in body) and converted to a blob URL before the audio
			// element can play them.
			let playUrl = track.streamUrl;
			if (track.source === 'webdav' && !playUrl.startsWith('blob:')) {
				const decoded = decodeIdentifier(track.identifier);
				const library = decoded
					? findLibrary(settings.getWebDAVLibraries(), decoded.libraryId)
					: undefined;
				if (decoded && library) {
					try {
						const blob = await fetchTrackBlob(library, decoded.path);
						currentBlobUrl = URL.createObjectURL(blob);
						playUrl = currentBlobUrl;
					} catch (err) {
						console.error('[Player] WebDAV fetch failed:', err);
						update((state) => ({ ...state, isLoading: false, isPlaying: false }));
						return;
					}
				} else {
					console.error('[Player] No WebDAV library for', track.identifier);
					update((state) => ({ ...state, isLoading: false, isPlaying: false }));
					return;
				}
			}

			// All FW tracks now use /api/fw-listen proxy (local URL, no CORS).
			// IA tracks, blob: URLs, and proxy URLs all just set src directly.
			audioElement.src = playUrl;
			audioElement.currentTime = 0; // Ensure playback starts from beginning

			audioElement.load();
			const playPromise = audioElement.play();
			if (playPromise !== undefined) {
				playPromise.catch((error) => {
					console.error('[Player] Play error:', error.message);
					update((state) => ({ ...state, isLoading: false }));
				});
			}
		},

		// Resume playback
		resume() {
			if (!audioElement) return;

			audioElement.play().catch((error) => {
				console.error('Resume error:', error);
			});
		},

		// Pause playback
		pause() {
			if (!audioElement) return;
			audioElement.pause();
		},

		// Toggle play/pause
		togglePlay() {
			const state = get({ subscribe });
			if (state.isPlaying) {
				this.pause();
			} else {
				this.resume();
			}
		},

		// Seek to position (in seconds)
		seek(time: number) {
			if (!audioElement) return;
			audioElement.currentTime = time;
		},

		// Set volume (0-1)
		setVolume(volume: number) {
			const clampedVolume = Math.max(0, Math.min(1, volume));
			if (audioElement) {
				audioElement.volume = clampedVolume;
			}
			update((state) => ({ ...state, volume: clampedVolume }));
		},

		// Toggle repeat mode
		toggleRepeat() {
			update((state) => ({
				...state,
				repeat:
					state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off'
			}));
		},

		// Toggle shuffle
		toggleShuffle() {
			queue.toggleShuffle();
			update((state) => ({ ...state, shuffle: !state.shuffle }));
		},

		// Skip to next track
		async next() {
			const nextTrack = queue.next();
			if (nextTrack) {
				this.play(nextTrack);
			} else {
				// Queue empty, try autoplay
				await this.autoplayNext();
			}
		},

		// Get next track via autoplay
		async autoplayNext() {
			const state = get({ subscribe });
			// Use the last successfully played track as basis for autoplay,
			// NOT the current (possibly failed) track. This prevents autoplay
			// from searching for the wrong artist after a playback failure.
			const basisTrack = lastSuccessfulTrack || state.currentTrack;

			update((s) => ({ ...s, isLoading: true }));

			try {
				const nextTrackMeta = await getAutoplayTrack(basisTrack);
				if (nextTrackMeta) {
					const track = await getTrack(nextTrackMeta.identifier);
					if (track && track.streamUrl) {
						queue.addToEnd(track);
						const addedTrack = queue.next();
						if (addedTrack) {
							this.play(addedTrack);
							return;
						}
					}
				}
			} catch (e) {
				console.warn('[Autoplay] Failed:', e);
			}

			update((s) => ({ ...s, isLoading: false, isPlaying: false }));
		},

		// Skip to previous track
		previous() {
			const state = get({ subscribe });

			// If we're more than 3 seconds in, restart current track
			if (state.currentTime > 3) {
				this.seek(0);
				return;
			}

			// Otherwise go to previous track
			const prevTrack = queue.previous();
			if (prevTrack) {
				this.play(prevTrack);
			}
		},

		// Play a track and add to queue if not already there
		playNow(track: Track, addToQueue: boolean = true) {
			if (addToQueue) {
				const currentTrack = queue.getCurrentTrack();
				if (!currentTrack || currentTrack.identifier !== track.identifier) {
					queue.addNext(track);
					const nextTrack = queue.getNextTrack();
					if (nextTrack && nextTrack.identifier === track.identifier) {
						queue.next();
					}
				}
			}
			this.play(track);
		},

		// Restore last played track and position (for app startup)
		restoreLastTrack(track: Track, position: number = 0) {
			update((state) => ({
				...state,
				currentTrack: track,
				currentTime: position,
				isPlaying: false
			}));

			// If audio element is available, set the source and seek
			if (audioElement) {
				audioElement.src = track.streamUrl;
				audioElement.load();
				audioElement.currentTime = position;
			}
		}
	};
}

export const player = createPlayerStore();

// Derived stores for convenience
export const currentTrack = derived(player, ($player) => $player.currentTrack);
export const isPlaying = derived(player, ($player) => $player.isPlaying);
export const progress = derived(
	player,
	($player) => ($player.duration > 0 ? $player.currentTime / $player.duration : 0)
);
