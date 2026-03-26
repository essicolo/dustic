// Player store with audio controls

import { writable, derived, get } from 'svelte/store';
import type { Track } from '$lib/types';
import { queue } from './queue';
import { history } from './history';
import { getNextTrack as getAutoplayTrack } from '$lib/services/autoplay';
import { unifiedGetTrack as getTrack } from '$lib/services/sources';
import { offlineStorage } from '$lib/services/offlineStorage';

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

const initialState: PlayerState = {
	currentTrack: null,
	isPlaying: false,
	volume: 0.7,
	currentTime: 0,
	duration: 0,
	repeat: 'off',
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

	return {
		subscribe,

		// iOS audio unlock - must be called synchronously in a user gesture
		unlockIOSAudio(): void {
			if (iosAudioUnlocked || !audioElement) {
				return;
			}

			// Simply calling play() on iOS, even if it fails, unlocks the audio context
			// This must be called synchronously within a user gesture event handler
			const playPromise = audioElement.play();

			if (playPromise !== undefined) {
				playPromise
					.then(() => {
						// Play started successfully (shouldn't happen with no src)
						audioElement.pause();
						iosAudioUnlocked = true;
						console.log('[iOS] Audio unlocked via play');
					})
					.catch(() => {
						// Expected to fail - but this unlocks iOS audio context
						iosAudioUnlocked = true;
						console.log('[iOS] Audio context unlocked (expected failure)');
					});
			} else {
				// Older browsers without promise-based play()
				iosAudioUnlocked = true;
			}
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
				update((state) => ({
					...state,
					currentTime: element.currentTime,
					duration: element.duration || 0
				}));
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
						setTimeout(() => this.next(), 500);
					} else {
						console.warn('[Player] Too many consecutive errors, stopping playback');
						consecutiveErrors = 0;
					}
				}
			});

			element.addEventListener('loadeddata', () => {
				consecutiveErrors = 0; // Reset on successful load
			});

			element.addEventListener('waiting', () => {});
			element.addEventListener('stalled', () => {});

			// Set initial volume
			element.volume = initialState.volume;
		},

		// Play a track
		async play(track: Track) {
			if (!audioElement) {
				console.error('[Player] Audio element not set');
				return;
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

			update((state) => ({
				...state,
				currentTrack: track,
				isLoading: true
			}));

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

			// All FW tracks now use /api/fw-listen proxy (local URL, no CORS).
			// IA tracks, blob: URLs, and proxy URLs all just set src directly.
			audioElement.src = track.streamUrl;

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
			const currentTrack = state.currentTrack;

			update((s) => ({ ...s, isLoading: true }));

			try {
				const nextTrackMeta = await getAutoplayTrack(currentTrack);
				if (nextTrackMeta) {
					// Fetch full track data
					const track = await getTrack(nextTrackMeta.identifier);
					if (track) {
						queue.addToEnd(track);
						const addedTrack = queue.next();
						if (addedTrack) {
							this.play(addedTrack);
						}
					}
				} else {
					update((s) => ({ ...s, isLoading: false, isPlaying: false }));
				}
			} catch (e) {
				console.error('Autoplay failed:', e);
				update((s) => ({ ...s, isLoading: false, isPlaying: false }));
			}
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
