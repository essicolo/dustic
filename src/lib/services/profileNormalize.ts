// Profile migration + tolerant validation, shared by every path that reads a
// profile: local storage, file/clipboard import and WebDAV sync.
//
// Kept free of store/persistence imports so storage.ts, persistence.ts and
// webdav.ts can all use it without import cycles.

import type { UserProfile } from '$lib/types';
import { UserProfileSchema } from '$lib/schemas/archive';
import { devLog } from '$lib/utils/logger';

/**
 * Storage schema version. Only increment on breaking data-structure changes;
 * this is separate from the app version and should rarely change.
 */
export const STORAGE_SCHEMA_VERSION = 2;

/** Raised when a profile was written by a newer schema than this build knows. */
export class ProfileTooNewError extends Error {
	constructor(public readonly schemaVersion: number) {
		super(`Profile schema v${schemaVersion} is newer than supported v${STORAGE_SCHEMA_VERSION}`);
		this.name = 'ProfileTooNewError';
	}
}

export function isNewerSchema(profile: { schemaVersion?: unknown } | null | undefined): boolean {
	return typeof profile?.schemaVersion === 'number' && profile.schemaVersion > STORAGE_SCHEMA_VERSION;
}

/**
 * Migrate an older profile and validate it tolerantly. Never throws for an
 * object: bad fields fall back to defaults, bad entries are dropped, unknown
 * fields and favorite kinds are preserved. A profile from a *newer* schema
 * keeps its schemaVersion, so callers can refuse to overwrite it.
 * Throws only when the input is not an object at all.
 */
export function normalizeProfile(input: unknown): UserProfile {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		throw new Error('Profile is not an object');
	}
	const raw: any = { ...(input as Record<string, unknown>) };
	const schemaVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;

	// v1 → v2: favorites changed from string[] to FavoriteEntry[]
	if (schemaVersion < 2 && Array.isArray(raw.favorites)) {
		devLog(`Migrating profile schema from v${schemaVersion} to v2`);
		raw.favorites = raw.favorites.map((f: unknown) =>
			typeof f === 'string' ? { id: f, type: 'track', addedAt: Date.now() } : f
		);
	}

	// Old WebDAV sync setting: autoSync boolean → autoSyncMinutes number
	const webdav = raw.settings?.webdav;
	if (webdav && typeof webdav === 'object' && !('autoSyncMinutes' in webdav)) {
		raw.settings = { ...raw.settings, webdav: { ...webdav, autoSyncMinutes: 0 } };
		delete raw.settings.webdav.autoSync;
	}

	// Older schemas are upgraded; newer ones keep their version untouched.
	if (schemaVersion <= STORAGE_SCHEMA_VERSION) raw.schemaVersion = STORAGE_SCHEMA_VERSION;
	if (!raw.exported) raw.exported = Date.now();

	return UserProfileSchema.parse(raw) as unknown as UserProfile;
}
