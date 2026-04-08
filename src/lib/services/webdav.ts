// WebDAV service for profile synchronization
import type { UserProfile, WebDAVConfig } from '$lib/types';
import { browser } from '$app/environment';

const PROFILE_FILENAME = 'dustic-profile.json';

/**
 * Test WebDAV connection
 */
export async function testWebDAVConnection(config: WebDAVConfig): Promise<boolean> {
	if (!browser) return false;

	try {
		const url = normalizeWebDAVUrl(config.url);
		const response = await fetch(url, {
			method: 'OPTIONS',
			headers: {
				Authorization: 'Basic ' + btoa(`${config.username}:${config.password}`)
			}
		});

		return response.ok;
	} catch (error) {
		console.error('[WebDAV] Connection test failed:', error);
		return false;
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
		const url = normalizeWebDAVUrl(config.url) + '/' + PROFILE_FILENAME;
		const profileJson = JSON.stringify(profile, null, 2);

		const response = await fetch(url, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Basic ' + btoa(`${config.username}:${config.password}`)
			},
			body: profileJson
		});

		if (!response.ok) {
			throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
		}

		console.log('[WebDAV] Profile uploaded successfully');
	} catch (error) {
		console.error('[WebDAV] Upload failed:', error);
		throw error;
	}
}

/**
 * Download profile from WebDAV server
 */
export async function downloadProfileFromWebDAV(config: WebDAVConfig): Promise<UserProfile> {
	if (!browser) throw new Error('WebDAV download only available in browser');

	try {
		const url = normalizeWebDAVUrl(config.url) + '/' + PROFILE_FILENAME;

		const response = await fetch(url, {
			method: 'GET',
			headers: {
				Authorization: 'Basic ' + btoa(`${config.username}:${config.password}`)
			}
		});

		if (!response.ok) {
			throw new Error(`Download failed: ${response.status} ${response.statusText}`);
		}

		const profileData = await response.json();
		console.log('[WebDAV] Profile downloaded successfully');

		return profileData as UserProfile;
	} catch (error) {
		console.error('[WebDAV] Download failed:', error);
		throw error;
	}
}

/**
 * Check if profile exists on WebDAV server
 */
export async function checkProfileExists(config: WebDAVConfig): Promise<boolean> {
	if (!browser) return false;

	try {
		const url = normalizeWebDAVUrl(config.url) + '/' + PROFILE_FILENAME;

		const response = await fetch(url, {
			method: 'HEAD',
			headers: {
				Authorization: 'Basic ' + btoa(`${config.username}:${config.password}`)
			}
		});

		return response.ok;
	} catch (error) {
		console.error('[WebDAV] Profile exists check failed:', error);
		return false;
	}
}

/**
 * Normalize WebDAV URL (remove trailing slash)
 */
function normalizeWebDAVUrl(url: string): string {
	return url.replace(/\/+$/, '');
}
