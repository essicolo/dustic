// E2E: the cors-proxy must hand the browser a parseable JSON body. The
// classic regression here is forwarding the upstream `content-encoding:
// gzip` header alongside an already-decompressed body (Node fetch and
// the Cloudflare runtime decompress transparently), which makes the
// browser try to decompress plain JSON and silently discard it. Visible
// symptom in the app: thumbnails never appear, because every Deezer
// call goes through this proxy.
import { test, expect } from './fixtures';

test('cors-proxy returns parseable JSON for a Deezer album search', async ({ page, request }) => {
	// This test needs real egress to api.deezer.com. Sandboxed CI runners
	// often block it; in that case the proxy would only forward the
	// upstream block, telling us nothing about the proxy itself.
	const probe = await request.get('https://api.deezer.com/infos', { timeout: 10000 }).catch(() => null);
	test.skip(!probe || !probe.ok(), 'api.deezer.com unreachable from this environment');

	await page.goto('/');
	await page.waitForLoadState('networkidle');

	const data = await page.evaluate(async () => {
		const deezerUrl = `https://api.deezer.com/search/album?q=${encodeURIComponent(
			'artist:"Pink Floyd" album:"The Dark Side of the Moon"'
		)}&limit=1`;
		const proxyUrl = `/api/cors-proxy?url=${encodeURIComponent(deezerUrl)}`;
		const res = await fetch(proxyUrl);
		if (!res.ok) return { ok: false, status: res.status };
		try {
			const json = await res.json();
			return {
				ok: true,
				cover: json?.data?.[0]?.cover_xl ?? null,
				artist: json?.data?.[0]?.artist?.name ?? null
			};
		} catch (e) {
			return { ok: false, error: (e as Error).message };
		}
	});

	expect(data.ok, `proxy call failed: ${JSON.stringify(data)}`).toBe(true);
	expect(data.artist).toBe('Pink Floyd');
	expect(data.cover, 'expected a cover URL').toMatch(/^https:\/\/.+\.(jpg|png)$/);
});
