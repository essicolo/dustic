// Automatic persistence to localStorage and IndexedDB
// Uses dual storage strategy for iOS PWA reliability:
// - localStorage: fast, synchronous access
// - IndexedDB: more reliable on iOS Safari in standalone PWA mode

import { browser } from '$app/environment';
import type { UserProfile } from '$lib/types';
import { createDefaultProfile } from './storage';
import { UserProfileSchema } from '$lib/schemas/archive';
import { saveToIndexedDB, loadFromIndexedDB } from './indexedDbPersistence';

const STORAGE_KEY = 'dustic-profile';
// Storage schema version - only increment when data structure changes (breaking changes)
// This is SEPARATE from app version and should rarely change
const STORAGE_SCHEMA_VERSION = 2;

/**
 * Migrate and validate profile data
 */
function migrateAndValidateProfile(rawProfile: any): UserProfile {
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
	return UserProfileSchema.parse(rawProfile);
}

/**
 * Load profile from storage (tries localStorage first, then IndexedDB)
 * IndexedDB is used as fallback for iOS PWA reliability
 */
export async function loadFromStorage(): Promise<UserProfile | null> {
	if (!browser) return null;

	try {
		// Try localStorage first (fast, synchronous)
		const stored = localStorage.getItem(STORAGE_KEY);
		let rawProfile: any = null;
		let fromIndexedDB = false;

		if (stored) {
			try {
				rawProfile = JSON.parse(stored);
			} catch (e) {
				console.warn('Failed to parse localStorage profile:', e);
			}
		}

		// If localStorage is empty or invalid, try IndexedDB
		// This is especially important for iOS PWAs where localStorage can be cleared
		if (!rawProfile) {
			console.log('localStorage empty, trying IndexedDB...');
			const idbProfile = await loadFromIndexedDB();
			if (idbProfile) {
				rawProfile = idbProfile;
				fromIndexedDB = true;
				console.log('Profile recovered from IndexedDB');
			}
		}

		if (!rawProfile) return null;

		const profile = migrateAndValidateProfile(rawProfile);

		// If we loaded from IndexedDB, restore to localStorage
		if (fromIndexedDB) {
			console.log('Restoring profile to localStorage from IndexedDB');
			localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
		}

		return profile;
	} catch (error) {
		console.error('Failed to load profile from storage:', error);
		return null;
	}
}

/**
 * Synchronous version of loadFromStorage for components that can't await
 * Falls back to localStorage only (won't recover from IndexedDB)
 */
export function loadFromStorageSync(): UserProfile | null {
	if (!browser) return null;

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return null;

		const rawProfile = JSON.parse(stored) as any;
		return migrateAndValidateProfile(rawProfile);
	} catch (error) {
		console.error('Failed to load profile from localStorage:', error);
		return null;
	}
}

/**
 * Save profile to both localStorage and IndexedDB
 * Dual storage strategy ensures persistence on iOS PWAs
 */
export async function saveToStorage(profile: UserProfile): Promise<void> {
	if (!browser) return;

	try {
		const toSave = {
			...profile,
			schemaVersion: STORAGE_SCHEMA_VERSION,
			exported: Date.now()
		};

		// Save to localStorage (fast, synchronous)
		localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));

		// Also save to IndexedDB for iOS PWA reliability
		// This runs asynchronously and won't block the UI
		await saveToIndexedDB(toSave);
	} catch (error) {
		console.error('Failed to save profile to storage:', error);
	}
}

/**
 * Clear all stored data from both localStorage and IndexedDB
 */
export async function clearStorage(): Promise<void> {
	if (!browser) return;

	localStorage.removeItem(STORAGE_KEY);

	// Also clear IndexedDB
	const { clearIndexedDB } = await import('./indexedDbPersistence');
	await clearIndexedDB();
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
	saveTimeout = setTimeout(async () => {
		await saveToStorage(profile);
		saveTimeout = null;
	}, 1000);
}
