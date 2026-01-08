import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
	const imageUrl = url.searchParams.get('url');

	if (!imageUrl) {
		throw error(400, 'Missing url query parameter');
	}

	try {
		const response = await fetch(imageUrl, {
			headers: {
				// Forward some headers to avoid being blocked
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
			}
		});

		// Check for non-image content types if possible, though IA might not always be accurate
		const contentType = response.headers.get('content-type');
		if (contentType && !contentType.startsWith('image/')) {
			// Don't throw an error, but return a "not found" or placeholder response
			// to avoid breaking the UI for a single failed image.
			// For now, we'll let it pass and let the browser handle it.
		}

		// Create a new response with the image data and appropriate headers
		const headers = new Headers();
		headers.set('Access-Control-Allow-Origin', '*'); // Allow any origin
		headers.set('Content-Type', contentType || 'image/jpeg');
		headers.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: headers
		});
	} catch (e: any) {
		console.error('CORS Proxy Error:', e);
		throw error(500, `Failed to proxy image: ${e.message}`);
	}
};
