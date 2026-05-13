// Storage service for user profile export/import

import type { UserProfile, AutoplayRule } from '$lib/types';
import { DEFAULT_AUTOPLAY_RULES, CONFIG } from '$lib/utils/constants';

/**
 * Strip device-bound secrets (encrypted passwords) from a profile before
 * exporting or copying. They're encrypted with a localStorage-only key so
 * they're unreadable on another device anyway — surfacing them in the
 * export would leak ciphertext into shareable files for nothing.
 */
function sanitizeForExport(profile: UserProfile): UserProfile {
	const clone: UserProfile = JSON.parse(JSON.stringify(profile));
	if (clone.settings?.webdav) {
		clone.settings.webdav = { ...clone.settings.webdav, password: '' };
	}
	if (clone.settings?.webdavLibraries) {
		clone.settings.webdavLibraries = clone.settings.webdavLibraries.map((l) => ({
			...l,
			password: ''
		}));
	}
	return clone;
}

/**
 * Export user profile as JSON file
 */
export function exportProfile(profile: UserProfile): void {
	const sanitized = sanitizeForExport(profile);
	const json = JSON.stringify(sanitized, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `dustic-profile-${Date.now()}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

/**
 * Import user profile from JSON file
 */
export function importProfile(file: File): Promise<UserProfile> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();

		reader.onload = (e) => {
			try {
				const content = e.target?.result as string;
				const raw = JSON.parse(content);

				// Validate profile structure (basic shape check)
				if (!validateProfile(raw)) {
					throw new Error('Invalid profile format');
				}

				// Migrate old string[] favorites to FavoriteEntry[] before using as UserProfile
				migrateFavorites(raw);

				resolve(raw as UserProfile);
			} catch (error) {
				reject(new Error('Failed to parse profile file'));
			}
		};

		reader.onerror = () => {
			reject(new Error('Failed to read file'));
		};

		reader.readAsText(file);
	});
}

/**
 * Migrate old string[] favorites to FavoriteEntry[] in-place
 */
function migrateFavorites(profile: any): void {
	if (Array.isArray(profile.favorites) && profile.favorites.length > 0 && typeof profile.favorites[0] === 'string') {
		profile.favorites = profile.favorites.map((id: string) => ({
			id,
			type: 'track',
			addedAt: Date.now()
		}));
	}
}

/**
 * Validate profile structure
 */
function validateProfile(profile: any): profile is UserProfile {
	if (!profile || typeof profile !== 'object') return false;

	// Check required fields (accept both old 'version' and new 'schemaVersion')
	if ((!profile.version && !profile.schemaVersion) || !profile.exported) return false;
	if (!Array.isArray(profile.favorites)) return false;
	if (!Array.isArray(profile.history)) return false;
	if (!Array.isArray(profile.autoplayRules)) return false;
	if (typeof profile.playlists !== 'object') return false;
	if (typeof profile.settings !== 'object') return false;

	return true;
}

/**
 * Create default/empty profile
 */
export function createDefaultProfile(): UserProfile {
	return {
		schemaVersion: 2,
		exported: Date.now(),
		favorites: [],
		playlists: {},
		history: [],
		autoplayRules: DEFAULT_AUTOPLAY_RULES,
		settings: {
			volume: 0.7,
			repeat: 'off',
			audioQuality: 'medium' // Default to medium quality (good balance)
		}
	};
}

/**
 * Export profile as JSON string (for clipboard). Passwords are stripped —
 * see sanitizeForExport().
 */
export function profileToJson(profile: UserProfile): string {
	return JSON.stringify(sanitizeForExport(profile), null, 2);
}

/**
 * Import profile from JSON string (from clipboard)
 */
export function importProfileFromText(text: string): UserProfile {
	const raw = JSON.parse(text);

	if (!validateProfile(raw)) {
		throw new Error('Invalid profile format');
	}

	migrateFavorites(raw);
	return raw as UserProfile;
}

/**
 * Merge imported profile with current data
 */
export function mergeProfiles(current: UserProfile, imported: UserProfile): UserProfile {
	// Merge favorites: union by id, keep the one with earlier addedAt
	const favMap = new Map(current.favorites.map((f) => [f.id, f]));
	for (const f of imported.favorites) {
		if (!favMap.has(f.id)) {
			favMap.set(f.id, f);
		}
	}

	return {
		...imported,
		schemaVersion: 2,
		exported: Date.now(),
		favorites: [...favMap.values()],
		// Keep newer history entries
		history: [
			...imported.history,
			...current.history.filter(
				(h) => !imported.history.some((ih) => ih.trackId === h.trackId)
			)
		]
			.sort((a, b) => b.playedAt - a.playedAt)
			.slice(0, CONFIG.maxHistorySize)
	};
}
