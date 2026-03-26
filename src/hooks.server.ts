import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Content Security Policy - prevents XSS attacks
	const csp = [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com", // unsafe-eval needed for Eruda debugger
		"style-src 'self' 'unsafe-inline'",
		"font-src 'self' data:", // data: needed for Eruda icon fonts
		"img-src 'self' data: blob: https://archive.org https://*.archive.org https://images.weserv.nl https:", // https: needed for FunkWhale instance cover art
		"media-src 'self' blob: https://archive.org https://*.archive.org https:", // https: needed for FunkWhale instance audio streaming
		"connect-src 'self' https://archive.org https://*.archive.org https://api.iconify.design https://api.unisvg.com https://api.simplesvg.com https://cloudflareinsights.com https://images.weserv.nl https:", // https: needed for user-configured FunkWhale instances
		"worker-src 'self' blob:"
	].join('; ');

	response.headers.set('Content-Security-Policy', csp);

	// Additional security headers
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

	return response;
};
