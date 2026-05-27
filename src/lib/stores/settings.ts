// Settings store for app preferences

import { writable, get } from 'svelte/store';
import type { AudioQuality, FunkwhaleInstance, WebDAVConfig, WebDAVLibrary } from '$lib/types';
import { loadFromStorageSync, loadFromStorage, getCachedProfile, scheduleAutoSave } from '$lib/services/persistence';
import { createDefaultProfile } from '$lib/services/storage';
import { DEFAULT_FUNKWHALE_INSTANCES } from '$lib/utils/constants';

export type AutoplayContentType = 'music' | 'podcasts' | 'audiobooks';
export type AutoplayContentTypes = Record<AutoplayContentType, boolean>;

// Default: music-only. The user explicitly asked for this after autoplay
// kept looping into Internet Archive's most-downloaded podcasts (heavily
// conservative/conspiracy-skewed). Users who want podcasts/audiobooks in
// autoplay can re-enable them in Settings → Autoplay.
export const DEFAULT_AUTOPLAY_CONTENT_TYPES: AutoplayContentTypes = {
	music: true,
	podcasts: false,
	audiobooks: false
};

export type AutoplaySource = 'ia' | 'funkwhale' | 'webdav';
export type AutoplaySources = Record<AutoplaySource, boolean>;

// Default: all sources active. The toggles only have teeth when the
// corresponding source is actually configured (e.g. webdav: true is a
// no-op until the user adds a library), so leaving them on doesn't
// surprise users with extra requests.
export const DEFAULT_AUTOPLAY_SOURCES: AutoplaySources = {
	ia: true,
	funkwhale: true,
	webdav: true
};

export interface Settings {
	audioQuality: AudioQuality;
	volume: number;
	repeat: 'off' | 'one' | 'all';
	defaultCollection?: string;
	funkwhaleInstances?: FunkwhaleInstance[];
	autoplayContentTypes?: AutoplayContentTypes;
	autoplaySources?: AutoplaySources;
	webdav?: WebDAVConfig;
	webdavLibraries?: WebDAVLibrary[];
	theme?: string;
	iaEnabled?: boolean; // Internet Archive search/browse toggle (defaults true)
	language?: string; // UI language code (e.g. 'en', 'fr'); undefined = auto-detect
}

/**
 * Resolve the effective content-type toggles. Always returns a fully
 * populated object so callers don't have to check for undefined.
 */
export function resolveAutoplayContentTypes(s: Settings): AutoplayContentTypes {
	return { ...DEFAULT_AUTOPLAY_CONTENT_TYPES, ...(s.autoplayContentTypes ?? {}) };
}

/** Same shape, for the source toggles (IA / FunkWhale / WebDAV). */
export function resolveAutoplaySources(s: Settings): AutoplaySources {
	return { ...DEFAULT_AUTOPLAY_SOURCES, ...(s.autoplaySources ?? {}) };
}

// Load from storage or use defaults (sync version for initial load)
const storedProfile = loadFromStorageSync();
const initialSettings: Settings = storedProfile?.settings || createDefaultProfile().settings;

function createSettingsStore() {
	const { subscribe, set, update } = writable<Settings>(initialSettings);

	return {
		subscribe,

		/**
		 * Initialize from storage (tries IndexedDB if localStorage is empty)
		 * Important for iOS PWAs
		 */
		async init() {
			const profile = await loadFromStorage();
			if (profile?.settings) {
				update(() => profile.settings);
			}
		},

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
		 * Toggle one of the autoplay content-type filters (music / podcasts /
		 * audiobooks). Refuses the change if it would leave zero categories
		 * enabled — autoplay needs at least one source to draw from.
		 *
		 * Returns true if the change was applied, false if it was blocked
		 * (so callers can keep the UI in sync).
		 */
		setAutoplayContentType(type: AutoplayContentType, enabled: boolean): boolean {
			const current = resolveAutoplayContentTypes(get({ subscribe }));
			const next: AutoplayContentTypes = { ...current, [type]: enabled };
			const anyEnabled = Object.values(next).some(Boolean);
			if (!anyEnabled) return false;
			update((state) => {
				const newState = { ...state, autoplayContentTypes: next };
				saveSettings(newState);
				return newState;
			});
			return true;
		},

		/**
		 * Toggle one of the autoplay SOURCE filters (IA / FunkWhale / WebDAV).
		 * Same at-least-one constraint as setAutoplayContentType: refusing
		 * the change keeps the UI honest about why nothing happened.
		 */
		setAutoplaySource(source: AutoplaySource, enabled: boolean): boolean {
			const current = resolveAutoplaySources(get({ subscribe }));
			const next: AutoplaySources = { ...current, [source]: enabled };
			const anyEnabled = Object.values(next).some(Boolean);
			if (!anyEnabled) return false;
			update((state) => {
				const newState = { ...state, autoplaySources: next };
				saveSettings(newState);
				return newState;
			});
			return true;
		},

		/**
		 * Set WebDAV configuration
		 */
		setWebDAVConfig(config: WebDAVConfig) {
			update((state) => {
				const newState = { ...state, webdav: config };
				saveSettings(newState);
				return newState;
			});
		},

		/**
		 * Update WebDAV last sync timestamp
		 */
		updateWebDAVLastSync(timestamp: number) {
			update((state) => {
				if (!state.webdav) return state;
				const newState = {
					...state,
					webdav: { ...state.webdav, lastSync: timestamp }
				};
				saveSettings(newState);
				return newState;
			});
		},

		getWebDAVLibraries(): WebDAVLibrary[] {
			return get({ subscribe }).webdavLibraries || [];
		},

		addWebDAVLibrary(library: WebDAVLibrary) {
			update((state) => {
				const current = state.webdavLibraries || [];
				if (current.some((l) => l.id === library.id)) return state;
				const newState = { ...state, webdavLibraries: [...current, library] };
				saveSettings(newState);
				return newState;
			});
		},

		updateWebDAVLibrary(id: string, patch: Partial<WebDAVLibrary>) {
			update((state) => {
				const current = state.webdavLibraries || [];
				const newState = {
					...state,
					webdavLibraries: current.map((l) => (l.id === id ? { ...l, ...patch } : l))
				};
				saveSettings(newState);
				return newState;
			});
		},

		removeWebDAVLibrary(id: string) {
			update((state) => {
				const current = state.webdavLibraries || [];
				const newState = { ...state, webdavLibraries: current.filter((l) => l.id !== id) };
				saveSettings(newState);
				return newState;
			});
		},

		toggleWebDAVLibrary(id: string) {
			update((state) => {
				const current = state.webdavLibraries || [];
				const newState = {
					...state,
					webdavLibraries: current.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l))
				};
				saveSettings(newState);
				return newState;
			});
		},

		setLanguage(language: string | undefined) {
			update((state) => {
				const newState = { ...state, language };
				saveSettings(newState);
				return newState;
			});
		},

		setIaEnabled(enabled: boolean) {
			update((state) => {
				const newState = { ...state, iaEnabled: enabled };
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
	const profile = getCachedProfile() || loadFromStorageSync() || createDefaultProfile();
	profile.settings = settings;
	scheduleAutoSave(profile);
}

export const settings = createSettingsStore();
