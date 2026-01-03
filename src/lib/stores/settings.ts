// Settings store for app preferences

import { writable, get } from 'svelte/store';
import type { AudioQuality } from '$lib/types';
import { loadFromStorage, scheduleAutoSave } from '$lib/services/persistence';
import { createDefaultProfile } from '$lib/services/storage';

export interface Settings {
	audioQuality: AudioQuality;
	volume: number;
	repeat: 'off' | 'one' | 'all';
	defaultCollection?: string;
}

// Load from storage or use defaults
const storedProfile = loadFromStorage();
const initialSettings: Settings = storedProfile?.settings || createDefaultProfile().settings;

function createSettingsStore() {
	const { subscribe, set, update } = writable<Settings>(initialSettings);

	return {
		subscribe,

		/**
		 * Set audio quality preference
		 */
		setAudioQuality(quality: AudioQuality) {
			update((state) => {
				const newState = { ...state, audioQuality: quality };
				saveSettings(newState);
				return newState;
			});
		},

		/**
		 * Set volume
		 */
		setVolume(volume: number) {
			update((state) => {
				const newState = { ...state, volume };
				saveSettings(newState);
				return newState;
			});
		},

		/**
		 * Set repeat mode
		 */
		setRepeat(repeat: 'off' | 'one' | 'all') {
			update((state) => {
				const newState = { ...state, repeat };
				saveSettings(newState);
				return newState;
			});
		},

		/**
		 * Set default collection
		 */
		setDefaultCollection(collection?: string) {
			update((state) => {
				const newState = { ...state, defaultCollection: collection };
				saveSettings(newState);
				return newState;
			});
		},

		/**
		 * Get current settings
		 */
		get(): Settings {
			return get({ subscribe });
		}
	};
}

/**
 * Save settings to localStorage via persistence layer
 */
function saveSettings(settings: Settings) {
	const profile = loadFromStorage() || createDefaultProfile();
	profile.settings = settings;
	scheduleAutoSave(profile);
}

export const settings = createSettingsStore();
