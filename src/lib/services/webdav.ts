// WebDAV service for profile synchronization
import type { UserProfile, WebDAVConfig } from '$lib/types';
import { browser } from '$app/environment';

const PROFILE_FILENAME = 'dustic-profile.json';

/**
 * Test WebDAV connection
 */
export async function testWebDAVConnection(config: WebDAVConfig): Promise<{ success: boolean; error?: string }> {
	if (!browser) return { success: false, error: 'Not in browser environment' };

	try {
		const url = buildWebDAVUrl(config.url, '', config.corsProxy);
		const response = await fetch(url, {
			method: 'OPTIONS',
			headers: getAuthHeaders(config)
		});

		if (!response.ok) {
			return {
				success: false,
				error: `Server returned ${response.status}: ${response.statusText}`
			};
		}

		return { success: true };
	} catch (error) {
		console.error('[WebDAV] Connection test failed:', error);

		if (isCorsOrNetworkError(error)) {
			const proxyHint = config.corsProxy
				? 'CORS proxy may be down or blocking requests. Try a different proxy or host your own.'
				: 'CORS blocked: WebDAV server does not allow browser access. Try enabling a CORS proxy in advanced settings.';
			return { success: false, error: proxyHint };
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Upload profile to WebDAV server
 */
export async function uploadProfileToWebDAV(
	profile: UserProfile,
	config: WebDAVConfig
): Promise<void> {
	if (!browser) throw new Error('WebDAV upload only available in browser');

	try {
		const url = buildWebDAVUrl(config.url, PROFILE_FILENAME, config.corsProxy);
		const profileJson = JSON.stringify(profile, null, 2);

		const response = await fetch(url, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				...getAuthHeaders(config)
			},
			body: profileJson
		});

		if (!response.ok) {
			throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
		}

		console.log('[WebDAV] Profile uploaded successfully');
	} catch (error) {
		console.error('[WebDAV] Upload failed:', error);

		if (isCorsOrNetworkError(error)) {
			throw new Error(config.corsProxy
				? 'CORS proxy may be down or blocking requests. Try a different proxy or host your own.'
				: 'CORS blocked: Cannot upload to WebDAV server from browser. Enable CORS proxy in settings.');
		}

		throw error;
	}
}

/**
 * Download profile from WebDAV server
 */
export async function downloadProfileFromWebDAV(config: WebDAVConfig): Promise<UserProfile> {
	if (!browser) throw new Error('WebDAV download only available in browser');

	try {
		const url = buildWebDAVUrl(config.url, PROFILE_FILENAME, config.corsProxy);

		const response = await fetch(url, {
			method: 'GET',
			headers: getAuthHeaders(config)
		});

		if (!response.ok) {
			throw new Error(`Download failed: ${response.status} ${response.statusText}`);
		}

		const profileData = await response.json();
		console.log('[WebDAV] Profile downloaded successfully');

		return profileData as UserProfile;
	} catch (error) {
		console.error('[WebDAV] Download failed:', error);

		if (isCorsOrNetworkError(error)) {
			throw new Error(config.corsProxy
				? 'CORS proxy may be down or blocking requests. Try a different proxy or host your own.'
				: 'CORS blocked: Cannot download from WebDAV server from browser. Enable CORS proxy in settings.');
		}

		throw error;
	}
}

/**
 * Check if profile exists on WebDAV server
 */
export async function checkProfileExists(config: WebDAVConfig): Promise<boolean> {
	if (!browser) return false;

	try {
		const url = buildWebDAVUrl(config.url, PROFILE_FILENAME, config.corsProxy);

		const response = await fetch(url, {
			method: 'HEAD',
			headers: getAuthHeaders(config)
		});

		return response.ok;
	} catch (error) {
		console.error('[WebDAV] Profile exists check failed:', error);
		return false;
	}
}

/**
 * Detect CORS or network errors across browsers.
 * Firefox: "NetworkError when attempting to fetch resource."
 * Chrome/Safari: "Failed to fetch"
 */
function isCorsOrNetworkError(error: unknown): boolean {
	if (!(error instanceof TypeError)) return false;
	const msg = error.message.toLowerCase();
	return msg.includes('failed to fetch') || msg.includes('networkerror');
}

/**
 * Build WebDAV URL with optional CORS proxy.
 * Handles common proxy URL formats:
 * - https://corsproxy.io/?https://target.com
 * - https://api.allorigins.win/raw?url=https://target.com
 */
function buildWebDAVUrl(baseUrl: string, filename: string, corsProxy?: string): string {
	const normalizedBase = baseUrl.replace(/\/+$/, '');
	const fullPath = filename ? `${normalizedBase}/${filename}` : normalizedBase;

	if (corsProxy) {
		const trimmedProxy = corsProxy.trimEnd();
		// If the proxy URL already ends with ? or = (e.g., "https://corsproxy.io/?" or "?url="),
		// append the target URL directly. Otherwise, add a ? separator.
		if (trimmedProxy.endsWith('?') || trimmedProxy.endsWith('=')) {
			return `${trimmedProxy}${fullPath}`;
		}
		return `${trimmedProxy}?${fullPath}`;
	}

	return fullPath;
}

/**
 * Get authentication headers for WebDAV requests
 */
function getAuthHeaders(config: WebDAVConfig): Record<string, string> {
	return {
		Authorization: 'Basic ' + btoa(`${config.username}:${config.password}`)
	};
}
