// Automatic persistence to localStorage

import { browser } from '$app/environment';
import type { UserProfile } from '$lib/types';
import { createDefaultProfile } from './storage';

const STORAGE_KEY = 'dustic-profile';
const STORAGE_VERSION = '1.0.0';

/**
 * Load profile from localStorage
 */
export function loadFromStorage(): UserProfile | null {
	if (!browser) return null;

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return null;

		const profile = JSON.parse(stored) as UserProfile;

		// Migrate old version data instead of deleting
		if (profile.version !== STORAGE_VERSION) {
			console.log(`Migrating profile from version ${profile.version} to ${STORAGE_VERSION}`);
			profile.version = STORAGE_VERSION;
		}

		// Backward compatibility: add missing fields with defaults
		if (!profile.settings) {
			profile.settings = {
				volume: 0.7,
				repeat: 'off',
				audioQuality: 'medium'
			};
		}
		if (!profile.settings.audioQuality) {
			profile.settings.audioQuality = 'medium';
		}
		if (!profile.playlists) {
			profile.playlists = {};
		}
		if (!profile.favorites) {
			profile.favorites = [];
		}
		if (!profile.history) {
			profile.history = [];
		}
		if (!profile.autoplayRules) {
			profile.autoplayRules = [];
		}

		// Save migrated profile
		saveToStorage(profile);

		return profile;
	} catch (error) {
		console.error('Failed to load profile from storage:', error);
		return null;
	}
}

/**
 * Save profile to localStorage
 */
export function saveToStorage(profile: UserProfile): void {
	if (!browser) return;

	try {
		const toSave = {
			...profile,
			version: STORAGE_VERSION,
			exported: Date.now()
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
	} catch (error) {
		console.error('Failed to save profile to storage:', error);
	}
}

/**
 * Clear all stored data
 */
export function clearStorage(): void {
	if (!browser) return;
	localStorage.removeItem(STORAGE_KEY);
}

/**
 * Auto-save middleware - debounced to avoid excessive writes
 */
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function scheduleAutoSave(profile: UserProfile): void {
	if (!browser) return;

	if (saveTimeout) {
		clearTimeout(saveTimeout);
	}

	// Debounce by 1 second
	saveTimeout = setTimeout(() => {
		saveToStorage(profile);
		saveTimeout = null;
	}, 1000);
}
