/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

// Create unique cache names for this deployment (Issue #10 - aggressive caching).
// Cache names are versioned to force a refresh on the Dustic→Inde rebrand.
const CACHE = `cache-${version}`;
const AUDIO_CACHE = 'inde-audio-cache-v1';
const IMAGE_CACHE = 'inde-image-cache-v1';
const METADATA_CACHE = 'inde-metadata-cache-v1';

const ASSETS = [
	'/',
	...build, // the app itself
	...files  // everything in `static`
];

// Stale-while-revalidate helper (Issue #10)
async function staleWhileRevalidate(request: Request, cacheName: string, maxAge: number): Promise<Response> {
	const cache = await caches.open(cacheName);
	const cachedResponse = await cache.match(request);

	const fetchPromise = fetch(request).then(async (response) => {
		if (response.ok) {
			await cache.put(request, response.clone());
		}
		return response;
	}).catch(() => {
		if (cachedResponse) return cachedResponse;
		return new Response('Network Error', { status: 503, statusText: 'Service Unavailable' });
	});

	if (cachedResponse) {
		const cachedDate = new Date(cachedResponse.headers.get('date') || 0);
		const age = Date.now() - cachedDate.getTime();

		if (age < maxAge) {
			return cachedResponse; // Fresh enough
		}
	}

	return fetchPromise as Promise<Response>;
}

self.addEventListener('install', (event) => {
	// Create a new cache and add all files to it
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);
	}

	event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
	// Remove previous caches
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			// Delete old version caches, but keep the content caches
			if (key !== CACHE && key !== AUDIO_CACHE && key !== IMAGE_CACHE && key !== METADATA_CACHE) {
				await caches.delete(key);
			}
		}
	}

	event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event) => {
	// ignore POST requests etc
	if (event.request.method !== 'GET') return;

	// Skip cross-origin requests entirely - let the browser handle them directly.
	// This is critical for FunkWhale audio streams: the <audio> element can play
	// cross-origin media natively, but if the SW intercepts and returns an opaque
	// response, the browser blocks it (OpaqueResponseBlocking).
	const requestUrl = new URL(event.request.url);
	if (requestUrl.origin !== self.location.origin) return;

	async function respond() {
		const url = new URL(event.request.url);
		const cache = await caches.open(CACHE);

		// `build`/`files` can always be served from the cache
		if (ASSETS.includes(url.pathname)) {
			const response = await cache.match(event.request);
			if (response) return response;
		}

		// Handle proxied requests
		const targetUrl = url.pathname === '/api/cors-proxy' ? url.searchParams.get('url') : null;

		// Route to appropriate cache strategy based on content type
		// Images: 7 days aggressive caching (Issue #10)
		if (
			url.pathname.includes('/services/img/') || 
			url.pathname.includes('__ia_thumb.jpg') ||
			(targetUrl && (targetUrl.includes('/services/img/') || targetUrl.includes('__ia_thumb.jpg')))
		) {
			return staleWhileRevalidate(event.request, IMAGE_CACHE, 7 * 24 * 60 * 60 * 1000);
		}

		// Audio streams: 1 hour caching (Issue #10)
		if (
			url.pathname.endsWith('.mp3') || 
			url.pathname.includes('/serve/') ||
			(targetUrl && (targetUrl.endsWith('.mp3') || targetUrl.includes('/serve/')))
		) {
			return staleWhileRevalidate(event.request, AUDIO_CACHE, 60 * 60 * 1000);
		}

		// Metadata: 1 hour caching (Issue #10)
		if (url.pathname.includes('/metadata/')) {
			return staleWhileRevalidate(event.request, METADATA_CACHE, 60 * 60 * 1000);
		}

		// for everything else, try the network first, but
		// fall back to the cache if we're offline
		try {
			const response = await fetch(event.request);

			if (response.status === 200) {
				// Don't cache everything in the app shell cache
				// SvelteKit handles navigation
			}

			return response;
		} catch {
			// fall back to cache
			const cachedResponse = await cache.match(event.request);
			if (cachedResponse) {
				return cachedResponse;
			}

			return new Response('Offline', { status: 408 });
		}
	}

	event.respondWith(respond());
});