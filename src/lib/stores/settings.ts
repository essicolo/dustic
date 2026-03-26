// Settings store for app preferences

import { writable, get } from 'svelte/store';
import type { AudioQuality, FunkwhaleInstance } from '$lib/types';
import { loadFromStorage, scheduleAutoSave } from '$lib/services/persistence';
import { createDefaultProfile } from '$lib/services/storage';
import { DEFAULT_FUNKWHALE_INSTANCES } from '$lib/utils/constants';

export interface Settings {
	audioQuality: AudioQuality;
	volume: number;
	repeat: 'off' | 'one' | 'all';
	defaultCollection?: string;
	funkwhaleInstances?: FunkwhaleInstance[];
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
		 * Get FunkWhale instances (with defaults)
		 */
		getFunkwhaleInstances(): FunkwhaleInstance[] {
			const state = get({ subscribe });
			return state.funkwhaleInstances || DEFAULT_FUNKWHALE_INSTANCES;
		},

		/**
		 * Set FunkWhale instances
		 */
		setFunkwhaleInstances(instances: FunkwhaleInstance[]) {
			update((state) => {
				const newState = { ...state, funkwhaleInstances: instances };
				saveSettings(newState);
				return newState;
			});
		},

		/**
		 * Add a FunkWhale instance
		 */
		addFunkwhaleInstance(url: string, name: string) {
			update((state) => {
				const current = state.funkwhaleInstances || DEFAULT_FUNKWHALE_INSTANCES;
				const normalized = url.replace(/\/+$/, '');
				// Don't add duplicates
				if (current.some((i) => i.url.replace(/\/+$/, '') === normalized)) return state;
				const newState = {
					...state,
					funkwhaleInstances: [...current, { url: normalized, name, enabled: true }]
				};
				saveSettings(newState);
				return newState;
			});
		},

		/**
		 * Remove a FunkWhale instance
		 */
		removeFunkwhaleInstance(url: string) {
			update((state) => {
				const current = state.funkwhaleInstances || DEFAULT_FUNKWHALE_INSTANCES;
				const newState = {
					...state,
					funkwhaleInstances: current.filter((i) => i.url !== url)
				};
				saveSettings(newState);
				return newState;
			});
		},

		/**
		 * Toggle a FunkWhale instance enabled/disabled
		 */
		toggleFunkwhaleInstance(url: string) {
			update((state) => {
				const current = state.funkwhaleInstances || DEFAULT_FUNKWHALE_INSTANCES;
				const newState = {
					...state,
					funkwhaleInstances: current.map((i) =>
						i.url === url ? { ...i, enabled: !i.enabled } : i
					)
				};
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
