import type { RequestHandler } from './$types';

/**
 * Server-side FunkWhale audio proxy.
 *
 * Two modes:
 * 1. Direct proxy: /api/fw-listen?url=<encoded-listen-url>
 *    Fetches the given URL server-side and streams audio back.
 * 2. Resolve + proxy: /api/fw-listen?instance=<url>&track=<id>
 *    Resolves the listen URL from the FW API, then streams.
 *
 * This eliminates CORS issues and browser rate-limiting from open.audio.
 */
export const GET: RequestHandler = async ({ url, request }) => {
	const directUrl = url.searchParams.get('url');
	const instanceUrl = url.searchParams.get('instance');
	const trackId = url.searchParams.get('track');

	let listenUrl: string | null = null;

	if (directUrl) {
		// Mode 1: Direct proxy — URL already known
		try {
			new URL(directUrl);
			listenUrl = directUrl;
		} catch {
			return new Response('Invalid URL', { status: 400 });
		}
	} else if (instanceUrl && trackId) {
		// Mode 2: Resolve from FW API
		try {
			new URL(instanceUrl);
		} catch {
			return new Response('Invalid instance URL', { status: 400 });
		}
		const baseUrl = instanceUrl.replace(/\/+$/, '');
		const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; Inde/1.0; +https://inde.cc)' };
		listenUrl = await resolveListenUrl(baseUrl, trackId, headers);
	} else {
		return new Response('Missing url or instance+track parameters', { status: 400 });
	}

	if (!listenUrl) {
		return new Response('Could not resolve audio URL', { status: 404 });
	}

	// Fetch the audio server-side, with retries for 503 rate-limiting
	const fetchHeaders: Record<string, string> = {
		'User-Agent': 'Mozilla/5.0 (compatible; Inde/1.0; +https://inde.cc)'
	};
	if (request.headers.has('Range')) {
		fetchHeaders['Range'] = request.headers.get('Range') || '';
	}

	let audioResponse: Response | null = null;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			audioResponse = await fetch(listenUrl, {
				headers: fetchHeaders,
				redirect: 'follow'
			});
			if (audioResponse.status !== 503) break;
			// Rate limited — wait and retry
			await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
		} catch (error: any) {
			if (attempt === 2) {
				return new Response(`Proxy fetch error: ${error.message}`, { status: 502 });
			}
			await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
		}
	}

	if (!audioResponse || (!audioResponse.ok && audioResponse.status !== 206)) {
		return new Response(`Audio fetch failed: HTTP ${audioResponse?.status}`, {
			status: audioResponse?.status || 502
		});
	}

	// Stream audio back with proper headers
	const responseHeaders = new Headers();
	for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
		const v = audioResponse.headers.get(h);
		if (v) responseHeaders.set(h, v);
	}
	responseHeaders.set('Access-Control-Allow-Origin', '*');
	responseHeaders.set('Cache-Control', 'public, max-age=3600');

	return new Response(audioResponse.body, {
		status: audioResponse.status,
		headers: responseHeaders
	});
};

/**
 * Resolve listen URL from FW API (for tracks without known upload URLs).
 */
async function resolveListenUrl(
	baseUrl: string,
	trackId: string,
	headers: Record<string, string>
): Promise<string | null> {
	// Try v2 track detail
	try {
		const resp = await fetch(`${baseUrl}/api/v2/tracks/${trackId}/`, { headers });
		if (resp.ok) {
			const track = await resp.json();
			const uploads = track.uploads || [];
			if (uploads.length > 0 && uploads[0].listen_url) {
				const url = uploads[0].listen_url;
				return url.startsWith('http') ? url : `${baseUrl}${url}`;
			}
		}
	} catch { /* continue */ }

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
