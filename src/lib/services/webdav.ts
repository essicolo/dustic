// WebDAV service for profile synchronization.
// Uses a same-origin Cloudflare Pages Function (/api/webdav-proxy) to avoid
// CORS issues. Falls back to an external CORS proxy if one is configured.
import type { UserProfile, WebDAVConfig } from '$lib/types';
import { browser } from '$app/environment';

const PROFILE_FILENAME = 'dustic-profile.json';

/**
 * Send a request through the built-in proxy or an external CORS proxy.
 */
async function proxiedFetch(
	config: WebDAVConfig,
	targetUrl: string,
	method: string,
	extraHeaders?: Record<string, string>,
	body?: string
): Promise<Response> {
	const headers = { ...getAuthHeaders(config), ...extraHeaders };

	if (config.corsProxy) {
		// External CORS proxy: rewrite the URL and do a normal fetch
		const url = buildExternalProxyUrl(targetUrl, config.corsProxy);
		return fetch(url, { method, headers, body });
	}

	// Built-in same-origin proxy (Cloudflare Pages Function)
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

		if (isCorsOrNetworkError(error)) {
			return {
				success: false,
				error: config.corsProxy
					? 'CORS proxy may be down or blocking requests. Try removing the custom proxy to use the built-in one.'
					: 'Network error connecting to WebDAV server. Check the URL and try again.'
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

function isCorsOrNetworkError(error: unknown): boolean {
	if (!(error instanceof TypeError)) return false;
	const msg = error.message.toLowerCase();
	return msg.includes('failed to fetch') || msg.includes('networkerror');
}

function buildTargetUrl(baseUrl: string, filename: string): string {
	const normalizedBase = baseUrl.replace(/\/+$/, '');
	return filename ? `${normalizedBase}/${filename}` : normalizedBase;
}

/**
 * Build URL for an external CORS proxy (legacy/optional).
 */
function buildExternalProxyUrl(targetUrl: string, corsProxy: string): string {
	const trimmedProxy = corsProxy.trimEnd();
	if (trimmedProxy.endsWith('?') || trimmedProxy.endsWith('=')) {
		return `${trimmedProxy}${targetUrl}`;
	}
	return `${trimmedProxy}?${targetUrl}`;
}

function getAuthHeaders(config: WebDAVConfig): Record<string, string> {
	return {
		Authorization: 'Basic ' + btoa(`${config.username}:${config.password}`)
	};
}
