import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	checkProxyTarget,
	isSameOriginRequest,
	fetchFollowingSafeRedirects
} from '$lib/server/proxyGuard';

describe('checkProxyTarget', () => {
	it('accepts ordinary public http(s) URLs', () => {
		for (const url of [
			'https://archive.org/metadata/foo',
			'http://open.audio/api/v2/tracks/1/',
			'https://ia800207.us.archive.org/1/items/x/y.mp3'
		]) {
			expect(checkProxyTarget(url).ok, url).toBe(true);
		}
	});

	it('refuses the cloud metadata endpoint and other link-local addresses', () => {
		// The canonical SSRF target: an unauthenticated proxy that will fetch
		// this hands out the deployment's own credentials.
		const result = checkProxyTarget('http://169.254.169.254/latest/meta-data/');
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.status).toBe(403);
	});

	it('refuses loopback and private ranges', () => {
		for (const url of [
			'http://127.0.0.1:8080/admin',
			'http://localhost/admin',
			'http://10.1.2.3/',
			'http://172.16.0.1/',
			'http://172.31.255.255/',
			'http://192.168.1.5/',
			'http://[::1]/',
			'http://[fd00::1]/',
			'http://[::ffff:169.254.169.254]/',
			'http://printer.local/',
			'http://db.internal/'
		]) {
			expect(checkProxyTarget(url).ok, url).toBe(false);
		}
	});

	it('allows public addresses that merely look adjacent to private ones', () => {
		for (const url of [
			'http://172.32.0.1/',
			'http://11.0.0.1/',
			'http://192.169.0.1/',
			'https://[2001:4860:4860::8888]/'
		]) {
			expect(checkProxyTarget(url).ok, url).toBe(true);
		}
	});

	it('sees through the hex form URL parsing rewrites IPv4-mapped addresses into', () => {
		// new URL() turns [::ffff:10.0.0.1] into [::ffff:a00:1], so a check
		// that only matched the dotted spelling would wave this through.
		expect(new URL('http://[::ffff:10.0.0.1]/').hostname).toBe('[::ffff:a00:1]');
		expect(checkProxyTarget('http://[::ffff:10.0.0.1]/').ok).toBe(false);
		expect(checkProxyTarget('http://[::ffff:a00:1]/').ok).toBe(false);
	});

	it('refuses non-http schemes and embedded credentials', () => {
		expect(checkProxyTarget('file:///etc/passwd').ok).toBe(false);
		expect(checkProxyTarget('gopher://archive.org/').ok).toBe(false);
		expect(checkProxyTarget('https://user:pass@archive.org/').ok).toBe(false);
		expect(checkProxyTarget('not a url').ok).toBe(false);
	});
});

describe('isSameOriginRequest', () => {
	const req = (headers: Record<string, string>) =>
		new Request('https://dustic.app/api/x', { headers });
	const OURS = 'https://dustic.app';

	it('lets Sec-Fetch-Site decide, without consulting any hostname', () => {
		// dustic is self-hosted, so the origin the server derives depends on
		// the adapter and any proxy in front of it. The browser computes this
		// header itself, which makes the decision deployment-independent.
		expect(isSameOriginRequest(req({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
		expect(isSameOriginRequest(req({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
		expect(isSameOriginRequest(req({ 'sec-fetch-site': 'same-site' }))).toBe(false);
		// A URL typed into the address bar is not the app making a request.
		expect(isSameOriginRequest(req({ 'sec-fetch-site': 'none' }))).toBe(false);
	});

	it('trusts Sec-Fetch-Site over Origin, so a mismatched host cannot refuse the app', () => {
		// Served at music.example.org while the server thinks it is something
		// else: the browser still says same-origin, and that is what counts.
		expect(
			isSameOriginRequest(
				req({ origin: 'https://music.example.org', 'sec-fetch-site': 'same-origin' }),
				OURS
			)
		).toBe(true);
	});

	it('falls back to Origin for browsers without Fetch Metadata', () => {
		// Safari before 16.4 sends Origin but no Sec-Fetch-Site.
		expect(isSameOriginRequest(req({ origin: OURS }), OURS)).toBe(true);
		expect(isSameOriginRequest(req({ origin: 'https://evil.example' }), OURS)).toBe(false);
	});

	it('allows requests carrying neither header', () => {
		// Same-origin media loads legitimately omit both; refusing them would
		// break playback.
		expect(isSameOriginRequest(req({}), OURS)).toBe(true);
	});
});

describe('fetchFollowingSafeRedirects', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('re-checks every hop, so an allowed host cannot bounce us inside the network', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })
			)
		);

		const result = await fetchFollowingSafeRedirects(new URL('https://archive.org/a'), {});
		expect(result instanceof Response).toBe(false);
		expect((result as { status: number }).status).toBe(403);
	});

	it('enforces a host allowlist across redirects', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				new Response(null, { status: 301, headers: { location: 'https://elsewhere.example/x' } })
			)
		);

		const result = await fetchFollowingSafeRedirects(
			new URL('https://archive.org/a'),
			{},
			{ isAllowedHost: (u) => u.hostname.endsWith('archive.org') }
		);
		expect(result instanceof Response).toBe(false);
		expect((result as { status: number }).status).toBe(403);
	});

	it('returns the response once a hop stops redirecting', async () => {
		let call = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				call++;
				return call === 1
					? new Response(null, {
							status: 302,
							headers: { location: 'https://ia800207.us.archive.org/f.mp3' }
						})
					: new Response('audio', { status: 200 });
			})
		);

		const result = await fetchFollowingSafeRedirects(new URL('https://archive.org/download/x'), {});
		expect(result instanceof Response).toBe(true);
		expect((result as Response).status).toBe(200);
	});

	it('gives up rather than looping forever', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				new Response(null, { status: 302, headers: { location: 'https://archive.org/next' } })
			)
		);

		const result = await fetchFollowingSafeRedirects(new URL('https://archive.org/a'), {}, {
			maxRedirects: 2
		});
		expect(result instanceof Response).toBe(false);
		expect((result as { status: number }).status).toBe(502);
	});
});
