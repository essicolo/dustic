// Storage service for user profile export/import

import type { UserProfile, AutoplayRule } from '$lib/types';
import { DEFAULT_AUTOPLAY_RULES, CONFIG } from '$lib/utils/constants';

/**
 * Export user profile as JSON file
 */
export function exportProfile(profile: UserProfile): void {
	const json = JSON.stringify(profile, null, 2);
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
				const profile = JSON.parse(content) as UserProfile;

				// Validate profile structure
				if (!validateProfile(profile)) {
					throw new Error('Invalid profile format');
				}

				resolve(profile);
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
 * Validate profile structure
 */
function validateProfile(profile: any): profile is UserProfile {
	if (!profile || typeof profile !== 'object') return false;

	// Check required fields
	if (!profile.version || !profile.exported) return false;
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
		version: CONFIG.profileVersion,
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
 * Merge imported profile with current data
 */
export function mergeProfiles(current: UserProfile, imported: UserProfile): UserProfile {
	return {
		...imported,
		version: CONFIG.profileVersion,
		exported: Date.now(),
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
