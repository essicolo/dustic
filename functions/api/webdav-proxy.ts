// Cloudflare Pages Function — same-origin WebDAV proxy.
// Eliminates CORS issues by proxying requests through the app's own domain.
// Usage: POST /api/webdav-proxy with JSON body { url, method, headers, body? }

interface ProxyRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
}

export const onRequestPost: PagesFunction = async ({ request }) => {
	try {
		const payload: ProxyRequest = await request.json();

		if (!payload.url || !payload.method) {
			return new Response(JSON.stringify({ error: 'Missing url or method' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Only allow WebDAV-related methods
		const allowedMethods = ['OPTIONS', 'GET', 'PUT', 'HEAD', 'PROPFIND', 'DELETE', 'MKCOL'];
		if (!allowedMethods.includes(payload.method.toUpperCase())) {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), {
				status: 405,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Forward request to the actual WebDAV server
		const response = await fetch(payload.url, {
			method: payload.method,
			headers: payload.headers || {},
			body: payload.body || undefined
		});

		// Return the response with CORS headers
		const responseHeaders = new Headers();
		responseHeaders.set('Content-Type', response.headers.get('Content-Type') || 'application/octet-stream');
		responseHeaders.set('Access-Control-Allow-Origin', '*');

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders
		});
	} catch (error) {
		return new Response(
			JSON.stringify({ error: error instanceof Error ? error.message : 'Proxy error' }),
			{ status: 502, headers: { 'Content-Type': 'application/json' } }
		);
	}
};
