// Theme store — persists the active theme to localStorage and applies it
// to <html>. Also exposes a flag for the first-launch picker.

import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { applyTheme, DEFAULT_THEME, THEMES, type ThemeId } from '$lib/themes';
import { loadFromStorageSync, getCachedProfile, scheduleAutoSave } from '$lib/services/persistence';

const STORAGE_KEY = 'dustic-theme';
const PICKER_SEEN_KEY = 'dustic-theme-picker-seen';

function isValidThemeId(value: string | null | undefined): value is ThemeId {
	return !!value && value in THEMES;
}

// One-off rename: the default theme was internally renamed from 'minimal'
// to 'dustic' so daisyUI's data-theme attribute matches the existing brand
// theme. Map any old stored value forward.
function migrateLegacyId(value: string | null | undefined): string | null | undefined {
	if (value === 'minimal') return 'dustic';
	return value;
}

function loadInitial(): ThemeId {
	if (!browser) return DEFAULT_THEME;
	const fromLs = migrateLegacyId(localStorage.getItem(STORAGE_KEY));
	if (isValidThemeId(fromLs)) return fromLs;
	const profile = loadFromStorageSync();
	const fromProfile = migrateLegacyId(profile?.settings?.theme);
	if (isValidThemeId(fromProfile)) return fromProfile;
	return DEFAULT_THEME;
}

function createThemeStore() {
	const initial = loadInitial();
	const { subscribe, set } = writable<ThemeId>(initial);

	if (browser) applyTheme(initial);

	return {
		subscribe,
		set(id: ThemeId) {
			set(id);
			if (!browser) return;
			localStorage.setItem(STORAGE_KEY, id);
			applyTheme(id);
			// Also persist into the profile so WebDAV sync carries the theme
			// across devices.
			const profile = getCachedProfile() || loadFromStorageSync();
			if (profile) {
				profile.settings = { ...profile.settings, theme: id };
				scheduleAutoSave(profile);
			}
		},
		/**
		 * Re-apply the theme stored in the profile (used after a profile import).
		 */
		syncFromProfile(id: string | undefined) {
			if (!browser || !isValidThemeId(id)) return;
			set(id);
			localStorage.setItem(STORAGE_KEY, id);
			applyTheme(id);
		},
		/**
		 * Mark the first-launch picker as dismissed/completed.
		 */
		markPickerSeen() {
			if (browser) localStorage.setItem(PICKER_SEEN_KEY, '1');
		},
		isFirstLaunch(): boolean {
			if (!browser) return false;
			return localStorage.getItem(PICKER_SEEN_KEY) !== '1';
		}
	};
}

export const theme = createThemeStore();
