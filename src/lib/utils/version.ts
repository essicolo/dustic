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

export async function reloadApp() {
	if (typeof window !== 'undefined') {
		// Clear all caches
		if ('caches' in window) {
			const cacheNames = await caches.keys();
			await Promise.all(cacheNames.map(name => caches.delete(name)));
		}

		// Clear localStorage version
		localStorage.removeItem('app_version');

		// Force reload without cache
		window.location.reload();
	}
}
