// Automatic persistence to localStorage and IndexedDB
// Uses dual storage strategy for iOS PWA reliability:
// - localStorage: fast, synchronous access
// - IndexedDB: more reliable on iOS Safari in standalone PWA mode

import { browser } from '$app/environment';
import type { UserProfile } from '$lib/types';
import { saveToIndexedDB, loadFromIndexedDB } from './indexedDbPersistence';
import { devLog } from '$lib/utils/logger';
import {
	normalizeProfile,
	isNewerSchema,
	ProfileTooNewError,
	STORAGE_SCHEMA_VERSION
} from './profileNormalize';

export { ProfileTooNewError, STORAGE_SCHEMA_VERSION };

const STORAGE_KEY = 'dustic-profile';
const BACKUP_KEY = 'dustic-profile-backup';

// In-memory cache of the last known good profile.
// This prevents data loss when iOS Safari clears localStorage in PWA mode:
// without it, stores re-read empty localStorage and overwrite IndexedDB with blank data.
let cachedProfile: UserProfile | null = null;

/**
 * Set when the stored profile was written by a newer app version. The
 * profile is still read, but automatic saves are suspended so this older
 * build never overwrites data it doesn't understand. An explicit import
 * (saveToStorage) lifts it, as does reloading into an up-to-date build.
 */
let readOnlyVersion: number | null = null;
let readOnlyNotified = false;

export function isProfileReadOnly(): boolean {
	return readOnlyVersion !== null;
}

function notify(kind: 'info' | 'error', key: string) {
	// Lazy import: persistence is loaded at module scope by several stores.
	import('$lib/stores/notifications')
		.then(({ notifications }) => notifications[kind](key))
		.catch(() => {});
}

function markReadOnlyIfNewer(profile: UserProfile): void {
	if (!isNewerSchema(profile)) return;
	readOnlyVersion = profile.schemaVersion;
	console.warn(
		`[Persistence] Profile schema v${profile.schemaVersion} is newer than v${STORAGE_SCHEMA_VERSION}; auto-save suspended`
	);
	if (!readOnlyNotified) {
		readOnlyNotified = true;
		notify('error', 'errors.profileNewer');
	}
}

/**
 * Keep a verbatim copy of a stored profile that could not be read at all,
 * before anything gets a chance to save over it.
 */
function backupUnreadable(raw: string): void {
	try {
		if (!localStorage.getItem(BACKUP_KEY)) {
			localStorage.setItem(BACKUP_KEY, raw);
		}
		console.error('[Persistence] Stored profile unreadable; raw copy kept under', BACKUP_KEY);
		notify('error', 'errors.profileUnreadable');
	} catch {
		// storage full — nothing more we can do
	}
}

/** Read + normalize a stored profile; null when absent or not salvageable. */
function readStored(stored: string): UserProfile | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stored);
	} catch {
		backupUnreadable(stored);
		return null;
	}
	try {
		const profile = normalizeProfile(parsed);
		markReadOnlyIfNewer(profile);
		return profile;
	} catch {
		backupUnreadable(stored);
		return null;
	}
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
			const fromLocal = readStored(stored);
			if (fromLocal) rawProfile = fromLocal;
		}

		// If localStorage is empty or invalid, try IndexedDB
		// This is especially important for iOS PWAs where localStorage can be cleared
		if (!rawProfile) {
			devLog('localStorage empty, trying IndexedDB...');
			const idbProfile = await loadFromIndexedDB();
			if (idbProfile) {
				rawProfile = idbProfile;
				fromIndexedDB = true;
				devLog('Profile recovered from IndexedDB');
			}
		}

		if (!rawProfile) return null;

		const profile = fromIndexedDB ? normalizeProfile(rawProfile) : (rawProfile as UserProfile);
		if (fromIndexedDB) markReadOnlyIfNewer(profile);
		cachedProfile = profile;

		// If we loaded from IndexedDB, restore to localStorage
		if (fromIndexedDB) {
			devLog('Restoring profile to localStorage from IndexedDB');
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

	// Five stores call this at module scope, and every one of them used to
	// re-read, re-parse and re-validate the same blob. The cache is the
	// single source of truth: it is populated here, by loadFromStorage() and
	// by every save, and dropped by invalidateProfileCache() whenever the
	// stored profile is replaced from outside (import, profile switch, clear).
	if (cachedProfile) return cachedProfile;

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return null;

		cachedProfile = readStored(stored);
		return cachedProfile;
	} catch (error) {
		console.error('Failed to load profile from localStorage:', error);
		return null;
	}
}

/**
 * Forget the in-memory profile, so the next read comes from storage.
 * Needed wherever the stored profile is replaced behind the stores' backs.
 */
export function invalidateProfileCache(): void {
	cachedProfile = null;
}

/**
 * Save profile to both localStorage and IndexedDB
 * Dual storage strategy ensures persistence on iOS PWAs
 */
export async function saveToStorage(profile: UserProfile): Promise<void> {
	if (!browser) return;

	// Importing a profile from a newer version would downgrade it.
	if (isNewerSchema(profile)) throw new ProfileTooNewError(profile.schemaVersion);

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
		// An explicit save replaced the newer profile: writing is safe again.
		readOnlyVersion = null;

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
	invalidateProfileCache();

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

	// Never auto-save over a profile written by a newer app version.
	if (readOnlyVersion !== null) {
		devLog('[Persistence] Auto-save skipped: profile is read-only (newer schema)');
		return;
	}

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
		saveTimeout = null;
		if (readOnlyVersion !== null) return;
		try {
			await saveToStorage(profile);
		} catch (error) {
			console.error('[Persistence] Auto-save failed:', error);
		}
	}, 5000);
}
