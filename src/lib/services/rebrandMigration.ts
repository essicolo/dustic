// One-time migration from the legacy "dustic-*" storage keys to "inde-*".
// Safe to call on every boot: each step is idempotent and exits early when
// the new keys already exist.
//
// Scope:
// - localStorage keys: dustic-profile, dustic-encryption-key, dustic-queue-panel-open
// - Cache API: dustic-audio-cache → inde-audio-cache-v1 (preserves downloaded tracks)
//
// Out of scope:
// - IndexedDB database names (dustic-offline, dustic-profile-db) are kept
//   internally because renaming requires copying every record with risk of
//   partial failure. They are not user-visible.
// - WebDAV profile filename (dustic-profile.json) lives on the user's own
//   server and is not ours to rename.

import { browser } from '$app/environment';

const LS_KEYS: Array<[string, string]> = [
	['dustic-profile', 'inde-profile'],
	['dustic-encryption-key', 'inde-encryption-key'],
	['dustic-queue-panel-open', 'inde-queue-panel-open']
];

const OLD_AUDIO_CACHE = 'dustic-audio-cache';
const NEW_AUDIO_CACHE = 'inde-audio-cache-v1';

const MIGRATION_FLAG = 'inde-rebrand-migrated';

export async function runRebrandMigration(): Promise<void> {
	if (!browser) return;
	if (localStorage.getItem(MIGRATION_FLAG) === '1') return;

	try {
		migrateLocalStorage();
		await migrateAudioCache();
		localStorage.setItem(MIGRATION_FLAG, '1');
		console.log('[Rebrand] Migration complete.');
	} catch (err) {
		// Don't set the flag on failure — let the next boot retry.
		console.error('[Rebrand] Migration failed:', err);
	}
}

function migrateLocalStorage(): void {
	for (const [oldKey, newKey] of LS_KEYS) {
		const oldVal = localStorage.getItem(oldKey);
		if (oldVal === null) continue;
		if (localStorage.getItem(newKey) !== null) {
			// New key already populated; just clean up the legacy one.
			localStorage.removeItem(oldKey);
			continue;
		}
		localStorage.setItem(newKey, oldVal);
		localStorage.removeItem(oldKey);
	}
}

async function migrateAudioCache(): Promise<void> {
	if (!('caches' in self)) return;
	const cacheNames = await caches.keys();
	if (!cacheNames.includes(OLD_AUDIO_CACHE)) return;

	const oldCache = await caches.open(OLD_AUDIO_CACHE);
	const newCache = await caches.open(NEW_AUDIO_CACHE);
	const requests = await oldCache.keys();

	for (const req of requests) {
		// Skip if already present in the new cache.
		const existing = await newCache.match(req);
		if (existing) continue;

		const response = await oldCache.match(req);
		if (!response) continue;
		await newCache.put(req, response.clone());
	}

	await caches.delete(OLD_AUDIO_CACHE);
}
