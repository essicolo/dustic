// Player store with audio controls

import { writable, derived, get } from 'svelte/store';
import type { Track } from '$lib/types';
import { queue } from './queue';

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

	return {
		subscribe,

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

			element.addEventListener('ended', () => {
				const state = get({ subscribe });
				if (state.repeat === 'one') {
					element.currentTime = 0;
					element.play();
				} else if (state.repeat === 'all' || queue.getNextTrack()) {
					// Auto-play next track
					this.next();
				} else {
					update((s) => ({ ...s, isPlaying: false }));
				}
			});

			element.addEventListener('error', (e) => {
				console.error('Audio error:', e);
				update((state) => ({ ...state, isLoading: false, isPlaying: false }));
			});

			// Set initial volume
			element.volume = initialState.volume;
		},

		// Play a track
		play(track: Track) {
			if (!audioElement) {
				console.error('Audio element not set');
				return;
			}

			update((state) => ({
				...state,
				currentTrack: track,
				isLoading: true
			}));

			audioElement.src = track.streamUrl;
			audioElement.load();
			audioElement.play().catch((error) => {
				console.error('Play error:', error);
				update((state) => ({ ...state, isLoading: false }));
			});
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
		next() {
			const nextTrack = queue.next();
			if (nextTrack) {
				this.play(nextTrack);
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
