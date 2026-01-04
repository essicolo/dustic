// Version checker for detecting app updates
export const APP_VERSION = '__BUILD_TIME__';

export async function checkForUpdates(): Promise<boolean> {
	if (typeof window === 'undefined') return false;

	try {
		// Fetch version.json with cache-busting timestamp
		const response = await fetch(`/version.json?t=${Date.now()}`, {
			cache: 'no-cache'
		});

		if (!response.ok) return false;

		const data = await response.json();
		const currentVersion = localStorage.getItem('app_version');

		// If this is first load or version changed
		if (!currentVersion || currentVersion !== data.version) {
			return true;
		}

		return false;
	} catch (error) {
		console.error('Error checking for updates:', error);
		return false;
	}
}

export function setCurrentVersion(version: string) {
	if (typeof window !== 'undefined') {
		localStorage.setItem('app_version', version);
	}
}

/**
 * Reload app with fresh code while preserving user data
 *
 * This safely updates the app by:
 * - Clearing app code caches (HTML, JS, CSS)
 * - Preserving downloaded music (dustic-audio-cache)
 * - Preserving user profile data (localStorage: dustic-profile)
 * - Preserving offline track metadata (IndexedDB: dustic-offline)
 * - Preserving version tracking (localStorage: app_version)
 */
export async function reloadApp() {
	if (typeof window !== 'undefined') {
		// Clear app caches but preserve user data caches
		if ('caches' in window) {
			const cacheNames = await caches.keys();
			const userDataCaches = ['dustic-audio-cache']; // Preserve downloaded music

			// Only delete non-user-data caches (app code, etc.)
			const cachesToDelete = cacheNames.filter(name => !userDataCaches.includes(name));
			await Promise.all(cachesToDelete.map(name => caches.delete(name)));
		}

		// Force reload without cache
		// Note: We do NOT remove app_version from localStorage
		// because we need it to know we're on the latest version after reload
		window.location.reload();
	}
}
