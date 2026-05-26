// SvelteKit server route — same-origin WebDAV proxy.
// Eliminates CORS issues by proxying requests through the app's own domain.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface ProxyRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
}

const ALLOWED_METHODS = ['OPTIONS', 'GET', 'PUT', 'HEAD', 'PROPFIND', 'DELETE', 'MKCOL'];

export const POST: RequestHandler = async ({ request }) => {
	let payload: ProxyRequest;

	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (!payload.url || !payload.method) {
		return json({ error: 'Missing url or method' }, { status: 400 });
	}

	if (!ALLOWED_METHODS.includes(payload.method.toUpperCase())) {
		return json({ error: 'Method not allowed' }, { status: 405 });
	}

	try {
		// Some WebDAV servers reject requests with the default Workers fetch
		// User-Agent (or an empty one). Send a realistic UA unless the caller
		// already provided one. Native clients (Obsidian, etc.) always send one.
		const outboundHeaders: Record<string, string> = { ...(payload.headers || {}) };
		const hasUA = Object.keys(outboundHeaders).some((h) => h.toLowerCase() === 'user-agent');
		if (!hasUA) {
			outboundHeaders['User-Agent'] = 'Dustic/1.0 (WebDAV client)';
		}

		const response = await fetch(payload.url, {
			method: payload.method,
			headers: outboundHeaders,
			body: payload.body || undefined
		});

		const forwardedHeaders: Record<string, string> = {
			'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream'
		};
		// Forward headers needed for range requests and progress reporting.
		for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Last-Modified', 'ETag']) {
			const value = response.headers.get(name);
			if (value) forwardedHeaders[name] = value;
		}

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: forwardedHeaders
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Proxy error' },
			{ status: 502 }
		);
	}
};
