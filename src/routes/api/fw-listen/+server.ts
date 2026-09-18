import type { RequestHandler } from './$types';
import {
	checkProxyTarget,
	fetchFollowingSafeRedirects,
	isSameOriginRequest
} from '$lib/server/proxyGuard';

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
 *
 * FunkWhale is federated and instances are user-configurable, so there is
 * no fixed host allowlist to apply here the way cors-proxy has one.
 * Three limits stand in for it: the target must be a public http(s)
 * address (checkProxyTarget), the request must look like it came from the
 * app (isSameOriginRequest), and the upstream must answer with audio
 * (ALLOWED_MEDIA_TYPES) — which is what stops the route from being reused
 * as a general-purpose web proxy.
 */
const ALLOWED_MEDIA_TYPES = ['audio/', 'video/', 'application/ogg', 'application/octet-stream'];

export const GET: RequestHandler = async ({ url, request }) => {
	const directUrl = url.searchParams.get('url');
	const instanceUrl = url.searchParams.get('instance');
	const trackId = url.searchParams.get('track');

	if (!isSameOriginRequest(request, url.origin)) {
		return new Response('Forbidden', { status: 403 });
	}

	let listenUrl: string | null = null;

	if (directUrl) {
		// Mode 1: Direct proxy — URL already known
		const checked = checkProxyTarget(directUrl);
		if (!checked.ok) {
			return new Response(checked.message, { status: checked.status });
		}
		listenUrl = checked.url.toString();
	} else if (instanceUrl && trackId) {
		// Mode 2: Resolve from FW API
		const checkedInstance = checkProxyTarget(instanceUrl);
		if (!checkedInstance.ok) {
			return new Response(checkedInstance.message, { status: checkedInstance.status });
		}
		const baseUrl = checkedInstance.url.toString().replace(/\/+$/, '');
		const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; Dustic/1.0)' };
		listenUrl = await resolveListenUrl(baseUrl, trackId, headers);
	} else {
		return new Response('Missing url or instance+track parameters', { status: 400 });
	}

	if (!listenUrl) {
		return new Response('Could not resolve audio URL', { status: 404 });
	}

	// The instance's own listen URL is resolved server-side, so re-check it
	// before fetching: it is still a URL the instance chose, not one we did.
	const checkedListen = checkProxyTarget(listenUrl);
	if (!checkedListen.ok) {
		return new Response(checkedListen.message, { status: checkedListen.status });
	}

	// Fetch the audio server-side, with retries for 503 rate-limiting
	const fetchHeaders: Record<string, string> = {
		'User-Agent': 'Mozilla/5.0 (compatible; Dustic/1.0)'
	};
	if (request.headers.has('Range')) {
		fetchHeaders['Range'] = request.headers.get('Range') || '';
	}

	let audioResponse: Response | null = null;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			// Redirects are followed by hand so each hop is re-checked; a
			// public instance that 302s to 169.254.169.254 must not be
			// chased there.
			const result = await fetchFollowingSafeRedirects(checkedListen.url, {
				headers: fetchHeaders
			});
			if (!(result instanceof Response)) {
				return new Response(result.message, { status: result.status });
			}
			audioResponse = result;
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

	// This route streams audio and nothing else. Refusing other content
	// types is what keeps it from doubling as an open web proxy.
	const upstreamType = (audioResponse.headers.get('content-type') || '').toLowerCase();
	if (upstreamType && !ALLOWED_MEDIA_TYPES.some((t) => upstreamType.startsWith(t))) {
		return new Response('Upstream did not return audio', { status: 502 });
	}

	// Stream audio back with proper headers
	const responseHeaders = new Headers();
	for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
		const v = audioResponse.headers.get(h);
		if (v) responseHeaders.set(h, v);
	}
	responseHeaders.set('Access-Control-Allow-Origin', url.origin);
	responseHeaders.set('Vary', 'Origin');
	// Public: this is public FunkWhale audio, and edge caching is half the
	// reason the proxy exists (it keeps repeat plays off the instance,
	// which is what was triggering their rate limiting).
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
		const resp = await fetch(`${baseUrl}/api/v2/tracks/${encodeURIComponent(trackId)}/`, {
			headers
		});
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

export const OPTIONS: RequestHandler = async ({ url }) => {
	return new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': url.origin,
			'Vary': 'Origin',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Range, Content-Type'
		}
	});
};
