// WebDAV service for profile synchronization.
// Uses a same-origin Cloudflare Pages Function (/api/webdav-proxy) to avoid CORS issues.
import type { UserProfile, WebDAVConfig } from '$lib/types';
import { browser } from '$app/environment';
import { decryptValue } from './crypto';

const PROFILE_FILENAME = 'dustic-profile.json';

/**
 * Send a request through the built-in same-origin proxy (Cloudflare Pages Function).
 */
async function proxiedFetch(
	config: WebDAVConfig,
	targetUrl: string,
	method: string,
	extraHeaders?: Record<string, string>,
	body?: string
): Promise<Response> {
	const headers = { ...(await getAuthHeaders(config)), ...extraHeaders };

	return fetch('/api/webdav-proxy', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url: targetUrl, method, headers, body })
	});
}

/**
 * Test WebDAV connection
 */
export async function testWebDAVConnection(config: WebDAVConfig): Promise<{ success: boolean; error?: string }> {
	if (!browser) return { success: false, error: 'Not in browser environment' };

	try {
		const targetUrl = buildTargetUrl(config.url, '');
		const response = await proxiedFetch(config, targetUrl, 'OPTIONS');

		if (!response.ok) {
			return {
				success: false,
				error: `Server returned ${response.status}: ${response.statusText}`
			};
		}

		return { success: true };
	} catch (error) {
		console.error('[WebDAV] Connection test failed:', error);

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

	const targetUrl = buildTargetUrl(config.url, PROFILE_FILENAME);
	const profileJson = JSON.stringify(profile, null, 2);

	const response = await proxiedFetch(
		config,
		targetUrl,
		'PUT',
		{ 'Content-Type': 'application/json' },
		profileJson
	);

	if (!response.ok) {
		throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
	}

	console.log('[WebDAV] Profile uploaded successfully');
}

/**
 * Download profile from WebDAV server
 */
export async function downloadProfileFromWebDAV(config: WebDAVConfig): Promise<UserProfile> {
	if (!browser) throw new Error('WebDAV download only available in browser');

	const targetUrl = buildTargetUrl(config.url, PROFILE_FILENAME);
	const response = await proxiedFetch(config, targetUrl, 'GET');

	if (!response.ok) {
		throw new Error(`Download failed: ${response.status} ${response.statusText}`);
	}

	const profileData = await response.json();
	console.log('[WebDAV] Profile downloaded successfully');
	return profileData as UserProfile;
}

/**
 * Check if profile exists on WebDAV server
 */
export async function checkProfileExists(config: WebDAVConfig): Promise<boolean> {
	if (!browser) return false;

	try {
		const targetUrl = buildTargetUrl(config.url, PROFILE_FILENAME);
		const response = await proxiedFetch(config, targetUrl, 'HEAD');
		return response.ok;
	} catch (error) {
		console.error('[WebDAV] Profile exists check failed:', error);
		return false;
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTargetUrl(baseUrl: string, filename: string): string {
	const normalizedBase = baseUrl.replace(/\/+$/, '');
	return filename ? `${normalizedBase}/${filename}` : normalizedBase;
}

async function getAuthHeaders(config: WebDAVConfig): Promise<Record<string, string>> {
	const password = await decryptValue(config.password);
	return {
		Authorization: 'Basic ' + btoa(`${config.username}:${password}`)
	};
}
