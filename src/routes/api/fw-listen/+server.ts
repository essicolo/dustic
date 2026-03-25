import type { RequestHandler } from './$types';

/**
 * Server-side FunkWhale audio proxy.
 *
 * Resolves the correct listen URL (including required ?upload= param for v2)
 * and streams audio back to the browser. This eliminates CORS issues and
 * the v2 upload UUID requirement from the client side entirely.
 *
 * Usage: /api/fw-listen?instance=https://open.audio&track=12345
 */
export const GET: RequestHandler = async ({ url, request }) => {
	const instanceUrl = url.searchParams.get('instance');
	const trackId = url.searchParams.get('track');

	if (!instanceUrl || !trackId) {
		return new Response('Missing instance or track parameter', { status: 400 });
	}

	// Validate instance URL
	try {
		const parsed = new URL(instanceUrl);
		if (!parsed.protocol.startsWith('http')) {
			return new Response('Invalid instance URL', { status: 400 });
		}
	} catch {
		return new Response('Invalid instance URL', { status: 400 });
	}

	const headers: Record<string, string> = {
		'User-Agent': 'Mozilla/5.0 (compatible; Dustic/1.0)'
	};

	try {
		// Strategy: try multiple approaches to get a working audio stream

		// 1. Fetch track detail to get listen_url and uploads
		const listenUrl = await resolveListenUrl(instanceUrl, trackId, headers);

		if (!listenUrl) {
			return new Response('Could not resolve audio URL', { status: 404 });
		}

		// 2. Fetch the audio, forwarding Range header for seeking
		const fetchHeaders: Record<string, string> = { ...headers };
		if (request.headers.has('Range')) {
			fetchHeaders['Range'] = request.headers.get('Range') || '';
		}

		const audioResponse = await fetch(listenUrl, {
			headers: fetchHeaders,
			redirect: 'follow'
		});

		if (!audioResponse.ok && audioResponse.status !== 206) {
			return new Response(`Audio fetch failed: HTTP ${audioResponse.status}`, {
				status: audioResponse.status
			});
		}

		// 3. Stream audio back with proper headers
		const responseHeaders = new Headers();
		const ct = audioResponse.headers.get('content-type');
		if (ct) responseHeaders.set('Content-Type', ct);
		const cl = audioResponse.headers.get('content-length');
		if (cl) responseHeaders.set('Content-Length', cl);
		const cr = audioResponse.headers.get('content-range');
		if (cr) responseHeaders.set('Content-Range', cr);
		const ar = audioResponse.headers.get('accept-ranges');
		if (ar) responseHeaders.set('Accept-Ranges', ar);

		responseHeaders.set('Access-Control-Allow-Origin', '*');
		responseHeaders.set('Cache-Control', 'public, max-age=3600');

		return new Response(audioResponse.body, {
			status: audioResponse.status,
			headers: responseHeaders
		});
	} catch (error: any) {
		console.error('[FW Listen Proxy] Error:', error.message);
		return new Response(`Proxy error: ${error.message}`, { status: 502 });
	}
};

/**
 * Try multiple strategies to resolve a working listen URL for a FW track.
 */
async function resolveListenUrl(
	instanceUrl: string,
	trackId: string,
	headers: Record<string, string>
): Promise<string | null> {
	const baseUrl = instanceUrl.replace(/\/+$/, '');

	// Strategy 1: Get track detail from v2 API - check for uploads
	try {
		const resp = await fetch(`${baseUrl}/api/v2/tracks/${trackId}/`, { headers });
		if (resp.ok) {
			const track = await resp.json();
			const uploads = track.uploads || [];
			if (uploads.length > 0 && uploads[0].listen_url) {
				// Upload listen_url includes ?upload= param - this is the reliable path
				const listenUrl = uploads[0].listen_url;
				return listenUrl.startsWith('http') ? listenUrl : `${baseUrl}${listenUrl}`;
			}
			// Track has listen_url but no uploads - try it directly first
			if (track.listen_url) {
				const directUrl = track.listen_url.startsWith('http')
					? track.listen_url : `${baseUrl}${track.listen_url}`;
				// Test if it actually works
				const testResp = await fetch(directUrl, { headers, method: 'HEAD', redirect: 'follow' });
				if (testResp.ok || testResp.status === 206) {
					return directUrl;
				}
			}
			// v2 track has guid - try fetching uploads separately
			if (track.guid || track.uuid) {
				const uploadUrl = await fetchUploadUrl(baseUrl, trackId, track.guid || track.uuid, headers);
				if (uploadUrl) return uploadUrl;
			}
		}
	} catch (e: any) {
		console.log(`[FW Listen] v2 track detail failed: ${e.message}`);
	}

	// Strategy 2: Try v1 API - it includes uploads array
	try {
		const resp = await fetch(`${baseUrl}/api/v1/tracks/${trackId}/`, { headers });
		if (resp.ok) {
			const track = await resp.json();
			const uploads = track.uploads || [];
			if (uploads.length > 0 && uploads[0].listen_url) {
				const listenUrl = uploads[0].listen_url;
				return listenUrl.startsWith('http') ? listenUrl : `${baseUrl}${listenUrl}`;
			}
			if (track.listen_url) {
				const directUrl = track.listen_url.startsWith('http')
					? track.listen_url : `${baseUrl}${track.listen_url}`;
				return directUrl;
			}
		}
	} catch (e: any) {
		console.log(`[FW Listen] v1 track detail failed: ${e.message}`);
	}

	// Strategy 3: Try common upload endpoints
	const uploadUrl = await fetchUploadUrl(baseUrl, trackId, null, headers);
	if (uploadUrl) return uploadUrl;

	return null;
}

/**
 * Try to fetch upload UUID for a track and construct a listen URL.
 */
async function fetchUploadUrl(
	baseUrl: string,
	trackId: string,
	trackGuid: string | null,
	headers: Record<string, string>
): Promise<string | null> {
	// Try various endpoints that might return uploads
	const endpoints = [
		`${baseUrl}/api/v2/uploads/?track=${trackId}&page_size=1`,
		`${baseUrl}/api/v2/uploads/?track_id=${trackId}&page_size=1`,
	];

	for (const ep of endpoints) {
		try {
			const resp = await fetch(ep, { headers });
			if (!resp.ok) continue;
			const data = await resp.json();
			const results = data.results || data;
			if (Array.isArray(results) && results.length > 0) {
				const upload = results[0];
				if (upload.listen_url) {
					const url = upload.listen_url;
					return url.startsWith('http') ? url : `${baseUrl}${url}`;
				}
				// Build listen URL manually from upload UUID
				if (upload.uuid && trackGuid) {
					return `${baseUrl}/api/v2/listen/${trackGuid}/?upload=${upload.uuid}`;
				}
			}
		} catch {
			// Try next endpoint
		}
	}

	return null;
}

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Range, Content-Type'
		}
	});
};
