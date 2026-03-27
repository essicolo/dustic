// Automatic persistence to localStorage

import { browser } from '$app/environment';
import type { UserProfile } from '$lib/types';
import { createDefaultProfile } from './storage';
import { UserProfileSchema } from '$lib/schemas/archive';

const STORAGE_KEY = 'dustic-profile';
// Storage schema version - only increment when data structure changes (breaking changes)
// This is SEPARATE from app version and should rarely change
const STORAGE_SCHEMA_VERSION = 2;

/**
 * Load profile from localStorage
 */
export function loadFromStorage(): UserProfile | null {
	if (!browser) return null;

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return null;

		const rawProfile = JSON.parse(stored) as any;

		// Get schema version (default to 1 for old data)
		const schemaVersion = rawProfile.schemaVersion || 1;

		// Migrate data if schema changed
		if (schemaVersion < STORAGE_SCHEMA_VERSION) {
			console.log(`Migrating profile schema from v${schemaVersion} to v${STORAGE_SCHEMA_VERSION}`);

			// v1 → v2: favorites changed from string[] to FavoriteEntry[]
			if (schemaVersion < 2 && Array.isArray(rawProfile.favorites)) {
				const oldFavorites = rawProfile.favorites;
				if (oldFavorites.length > 0 && typeof oldFavorites[0] === 'string') {
					rawProfile.favorites = oldFavorites.map((id: string) => ({
						id,
						type: 'track',
						addedAt: Date.now()
					}));
				}
			}
		}

		rawProfile.schemaVersion = STORAGE_SCHEMA_VERSION;

		// Backward compatibility: add missing fields with defaults
		if (!rawProfile.settings) {
			rawProfile.settings = {
				volume: 0.7,
				repeat: 'off',
				audioQuality: 'medium'
			};
		}
		if (!rawProfile.settings.audioQuality) {
			rawProfile.settings.audioQuality = 'medium';
		}
		if (!rawProfile.playlists) {
			rawProfile.playlists = {};
		}
		if (!rawProfile.favorites) {
			rawProfile.favorites = [];
		}
		if (!rawProfile.history) {
			rawProfile.history = [];
		}
		if (!rawProfile.autoplayRules) {
			rawProfile.autoplayRules = [];
		}

		// Validate with Zod before returning
		const profile = UserProfileSchema.parse(rawProfile);

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
			schemaVersion: STORAGE_SCHEMA_VERSION,
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
