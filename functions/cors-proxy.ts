// Cloudflare Pages Function for CORS proxy
// - URL allowlist for archive.org domains only (SSRF protection - Issue #1)
// - Range request support for pause/resume (Issue #15)
// - Aggressive caching headers (7 days images, 1 hour audio)

const ALLOWED_DOMAINS = [
	'archive.org',
	'*.archive.org',
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

export async function onRequest(context: any) {
	const { request } = context;
	const url = new URL(request.url);
	const targetUrl = url.searchParams.get('url');

	if (!targetUrl) {
		return new Response('Missing url parameter', { status: 400 });
	}

	try {
		// SSRF Protection: Validate URL is from allowed domains
		const parsedUrl = new URL(targetUrl);
		const isAllowed = ALLOWED_DOMAINS.some((domain) => {
			if (domain.startsWith('*.')) {
				return parsedUrl.hostname.endsWith(domain.slice(2));
			}
			return parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain);
		});

		if (!isAllowed) {
			return new Response('URL not allowed', { status: 403 });
		}

		// Forward Range header for chunked downloads
		const headers = new Headers();
		if (request.headers.has('Range')) {
			headers.set('Range', request.headers.get('Range'));
		}
		headers.set('User-Agent', 'Mozilla/5.0 (compatible; Dustic/1.0)');

		const response = await fetch(targetUrl, { headers });

		// Determine cache duration based on content type
		const contentType = response.headers.get('content-type') || '';
		let maxAge = 3600; // Default 1 hour
		if (contentType.startsWith('image/')) {
			maxAge = 7 * 24 * 3600; // 7 days for images
		}

		// Build response with CORS headers
		const responseHeaders = new Headers(response.headers);
		responseHeaders.set('Access-Control-Allow-Origin', '*');
		responseHeaders.set('Cache-Control', `public, max-age=${maxAge}`);

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders
		});
	} catch (error: any) {
		return new Response(`Proxy error: ${error.message}`, { status: 502 });
	}
}
