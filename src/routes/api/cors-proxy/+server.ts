import type { RequestHandler } from './$types';
import {
	checkProxyTarget,
	fetchFollowingSafeRedirects,
	isSameOriginRequest
} from '$lib/server/proxyGuard';

const ALLOWED_DOMAINS = [
	'archive.org',
	'*.archive.org',
	'open.audio',
	'*.funkwhale.audio',
	'api.deezer.com',
	'ia600000.us.archive.org',
	'ia600001.us.archive.org',
	'ia600002.us.archive.org',
	'ia600003.us.archive.org',
	'ia600004.us.archive.org',
	'ia600005.us.archive.org',
	'ia600006.us.archive.org',
	'ia600007.us.archive.org',
	'ia600008.us.archive.org',
	'ia600009.us.archive.org',
	'ia800000.us.archive.org',
	'ia800001.us.archive.org',
	'ia800002.us.archive.org',
	'ia800003.us.archive.org',
	'ia800004.us.archive.org',
	'ia800005.us.archive.org',
	'ia800006.us.archive.org',
	'ia800007.us.archive.org',
	'ia800008.us.archive.org',
	'ia800009.us.archive.org',
	'ia900000.us.archive.org',
	'ia900001.us.archive.org',
	'ia900002.us.archive.org',
	'ia900003.us.archive.org',
	'ia900004.us.archive.org',
	'ia900005.us.archive.org',
	'ia900006.us.archive.org',
	'ia900007.us.archive.org',
	'ia900008.us.archive.org',
	'ia900009.us.archive.org'
];

/**
 * Note the leading dot on the wildcard branch: matching on `archive.org`
 * alone would also accept `evilarchive.org`, which is a domain anyone can
 * register. Applied to redirect hops too, so an allowed host cannot bounce
 * the request somewhere off the list.
 */
function isAllowedHost(target: URL): boolean {
	const hostname = target.hostname.toLowerCase();
	return ALLOWED_DOMAINS.some((domain) => {
		const bare = domain.startsWith('*.') ? domain.slice(2) : domain;
		return hostname === bare || hostname.endsWith('.' + bare);
	});
}

export const GET: RequestHandler = async ({ url, request }) => {
	const targetUrl = url.searchParams.get('url');

	if (!targetUrl) {
		return new Response('Missing url parameter', { status: 400 });
	}

	if (!isSameOriginRequest(request, url.origin)) {
		return new Response('Forbidden', { status: 403 });
	}

	try {
		// SSRF protection, part one: scheme, credentials, and private address
		// ranges are refused outright.
		const checked = checkProxyTarget(targetUrl);
		if (!checked.ok) {
			return new Response(checked.message, { status: checked.status });
		}
		const parsedUrl = checked.url;

		// Part two: the host must be one we actually talk to.
		if (!isAllowedHost(parsedUrl)) {
			return new Response('URL not allowed', { status: 403 });
		}

		// Forward Range header for chunked downloads
		const headers = new Headers();
		if (request.headers.has('Range')) {
			headers.set('Range', request.headers.get('Range') || '');
		}
		headers.set('User-Agent', 'Mozilla/5.0 (compatible; Dustic/1.0)');

		const result = await fetchFollowingSafeRedirects(parsedUrl, { headers }, { isAllowedHost });
		if (!(result instanceof Response)) {
			return new Response(result.message, { status: result.status });
		}
		const response = result;

		// Determine cache duration based on content type
		const contentType = response.headers.get('content-type') || '';
		let maxAge = 3600; // Default 1 hour
		if (contentType.startsWith('image/')) {
			maxAge = 7 * 24 * 3600; // 7 days for images
		}

		// Build response with CORS headers
		const responseHeaders = new Headers(response.headers);
		// The app is the only intended consumer, so scope the response to
		// our own origin instead of handing it to every site on the web.
		responseHeaders.set('Access-Control-Allow-Origin', url.origin);
		responseHeaders.set('Vary', 'Origin');
		responseHeaders.set('Cache-Control', `public, max-age=${maxAge}`);
		// Node fetch (and Cloudflare's runtime) already decompresses upstream
		// content-encoded responses, but forwards the original encoding
		// header as-is. If we pass it through, the browser re-attempts to
		// decompress plain JSON and silently discards the body — the visible
		// symptom is "no thumbnails" because the JSON.parse rejects. Drop
		// both the encoding header and the now-wrong length.
		responseHeaders.delete('content-encoding');
		responseHeaders.delete('content-length');

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders
		});
	} catch (error: any) {
		return new Response(`Proxy error: ${error.message}`, { status: 502 });
	}
};

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
