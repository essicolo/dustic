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
			headers: getAuthHeaders(config),
			mode: config.corsProxy ? 'cors' : 'cors'
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

		// Detect CORS errors
		if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
			return {
				success: false,
				error: 'CORS blocked: WebDAV server does not allow browser access. Try enabling CORS proxy or use a compatible server.'
			};
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
			body: profileJson,
			mode: config.corsProxy ? 'cors' : 'cors'
		});

		if (!response.ok) {
			throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
		}

		console.log('[WebDAV] Profile uploaded successfully');
	} catch (error) {
		console.error('[WebDAV] Upload failed:', error);

		if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
			throw new Error('CORS blocked: Cannot upload to WebDAV server from browser. Enable CORS proxy in settings.');
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
			headers: getAuthHeaders(config),
			mode: config.corsProxy ? 'cors' : 'cors'
		});

		if (!response.ok) {
			throw new Error(`Download failed: ${response.status} ${response.statusText}`);
		}

		const profileData = await response.json();
		console.log('[WebDAV] Profile downloaded successfully');

		return profileData as UserProfile;
	} catch (error) {
		console.error('[WebDAV] Download failed:', error);

		if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
			throw new Error('CORS blocked: Cannot download from WebDAV server from browser. Enable CORS proxy in settings.');
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
			headers: getAuthHeaders(config),
			mode: config.corsProxy ? 'cors' : 'cors'
		});

		return response.ok;
	} catch (error) {
		console.error('[WebDAV] Profile exists check failed:', error);
		return false;
	}
}

/**
 * Build WebDAV URL with optional CORS proxy
 */
function buildWebDAVUrl(baseUrl: string, filename: string, corsProxy?: string): string {
	const normalizedBase = baseUrl.replace(/\/+$/, '');
	const fullPath = filename ? `${normalizedBase}/${filename}` : normalizedBase;

	if (corsProxy) {
		// Use CORS proxy
		const proxyUrl = corsProxy.replace(/\/+$/, '');
		return `${proxyUrl}/${encodeURIComponent(fullPath)}`;
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
