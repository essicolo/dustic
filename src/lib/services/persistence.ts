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

// In-memory cache of the last known good profile.
// This prevents data loss when iOS Safari clears localStorage in PWA mode:
// without it, stores re-read empty localStorage and overwrite IndexedDB with blank data.
let cachedProfile: UserProfile | null = null;

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
	// Migrate webdav: old autoSync boolean → autoSyncMinutes number
	if (rawProfile.settings?.webdav && !('autoSyncMinutes' in rawProfile.settings.webdav)) {
		rawProfile.settings.webdav.autoSyncMinutes = 0;
		delete rawProfile.settings.webdav.autoSync;
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
		cachedProfile = profile;

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
		if (!stored) return cachedProfile;

		const rawProfile = JSON.parse(stored) as any;
		const profile = migrateAndValidateProfile(rawProfile);
		cachedProfile = profile;
		return profile;
	} catch (error) {
		console.error('Failed to load profile from localStorage:', error);
		return cachedProfile;
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

		// Update in-memory cache first (prevents data loss if storage fails)
		cachedProfile = toSave;

		// Save to localStorage (fast, synchronous)
		localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));

		// Also save to IndexedDB for iOS PWA reliability
		// CRITICAL: Wait for IndexedDB write to complete before resolving
		await saveToIndexedDB(toSave);
	} catch (error) {
		console.error('[Persistence] Failed to save profile to storage:', error);
		// Re-throw to let caller know save failed
		throw error;
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
 * Get the in-memory cached profile (never reads disk).
 * Use this instead of loadFromStorageSync() in auto-save paths
 * to avoid reading potentially cleared localStorage.
 */
export function getCachedProfile(): UserProfile | null {
	return cachedProfile;
}

/**
 * Auto-save middleware - debounced to avoid excessive writes
 */
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function scheduleAutoSave(profile: UserProfile, immediate: boolean = false): void {
	if (!browser) return;

	// Immediate save for critical operations (profile import, app close)
	if (immediate) {
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}
		saveToStorage(profile).catch((error) => {
			console.error('[Persistence] Immediate save failed:', error);
		});
		return;
	}

	if (saveTimeout) {
		clearTimeout(saveTimeout);
	}

	// Debounce by 5 seconds — avoids frequent JSON.stringify + localStorage + IndexedDB writes
	saveTimeout = setTimeout(async () => {
		await saveToStorage(profile);
		saveTimeout = null;
	}, 5000);
}
