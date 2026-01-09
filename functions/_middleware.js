// Global middleware for security headers (Issue #5 - CSP)

export async function onRequest(context) {
	const response = await context.next();

	// Content Security Policy - prevents XSS attacks
	const csp = [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline'", // Svelte requires unsafe-inline
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob: https://archive.org https://*.archive.org",
		"media-src 'self' blob: https://archive.org https://*.archive.org",
		"connect-src 'self' https://archive.org https://*.archive.org",
		"worker-src 'self' blob:"
	].join('; ');

	response.headers.set('Content-Security-Policy', csp);

	// Additional security headers
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

	return response;
}
