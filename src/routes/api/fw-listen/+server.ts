import type { RequestHandler } from './$types';

/**
 * Server-side FunkWhale audio proxy.
 *
 * Resolves the correct listen URL (including required ?upload= param for v2)
 * and streams audio back to the browser. This eliminates CORS issues and
 * the v2 upload UUID requirement from the client side entirely.
 *
 * Usage: /api/fw-listen?instance=https://open.audio&track=12345
 * Debug: /api/fw-listen?instance=https://open.audio&track=12345&debug=1
 */
export const GET: RequestHandler = async ({ url, request }) => {
	const instanceUrl = url.searchParams.get('instance');
	const trackId = url.searchParams.get('track');
	const debug = url.searchParams.get('debug') === '1';

	if (!instanceUrl || !trackId) {
		return new Response('Missing instance or track parameter', { status: 400 });
	}

	try {
		new URL(instanceUrl);
	} catch {
		return new Response('Invalid instance URL', { status: 400 });
	}

	const baseUrl = instanceUrl.replace(/\/+$/, '');
	const headers: Record<string, string> = {
		'User-Agent': 'Mozilla/5.0 (compatible; Dustic/1.0)'
	};
	const log: string[] = [];

	try {
		const listenUrl = await resolveListenUrl(baseUrl, trackId, headers, log);

		if (debug) {
			return new Response(JSON.stringify({ trackId, listenUrl, log }, null, 2), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		if (!listenUrl) {
			console.error(`[FW Listen] Could not resolve audio for track ${trackId}:\n${log.join('\n')}`);
			return new Response('Could not resolve audio URL', { status: 404 });
		}

		// Fetch the audio, forwarding Range header for seeking
		const fetchHeaders: Record<string, string> = { ...headers };
		if (request.headers.has('Range')) {
			fetchHeaders['Range'] = request.headers.get('Range') || '';
		}

		const audioResponse = await fetch(listenUrl, {
			headers: fetchHeaders,
			redirect: 'follow'
		});

		if (!audioResponse.ok && audioResponse.status !== 206) {
			console.error(`[FW Listen] Audio fetch failed: HTTP ${audioResponse.status} from ${listenUrl}`);
			return new Response(`Audio fetch failed: HTTP ${audioResponse.status}`, {
				status: audioResponse.status
			});
		}

		// Stream audio back with proper headers
		const responseHeaders = new Headers();
		for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
			const v = audioResponse.headers.get(h);
			if (v) responseHeaders.set(h, v);
		}
		responseHeaders.set('Access-Control-Allow-Origin', '*');
		responseHeaders.set('Cache-Control', 'public, max-age=3600');

		return new Response(audioResponse.body, {
			status: audioResponse.status,
			headers: responseHeaders
		});
	} catch (error: any) {
		console.error('[FW Listen Proxy] Error:', error.message, '\n', log.join('\n'));
		return new Response(`Proxy error: ${error.message}`, { status: 502 });
	}
};

async function resolveListenUrl(
	baseUrl: string,
	trackId: string,
	headers: Record<string, string>,
	log: string[]
): Promise<string | null> {

	// ── Strategy 1: v2 track detail ──
	let trackGuid: string | null = null;
	try {
		const trackUrl = `${baseUrl}/api/v2/tracks/${trackId}/`;
		log.push(`[1] GET ${trackUrl}`);
		const resp = await fetch(trackUrl, { headers });
		log.push(`[1] Status: ${resp.status}`);

		if (resp.ok) {
			const track = await resp.json();
			trackGuid = track.guid || track.uuid || null;
			const allKeys = Object.keys(track);
			log.push(`[1] Keys: ${allKeys.join(', ')}`);
			log.push(`[1] guid=${track.guid}, uuid=${track.uuid}`);
			log.push(`[1] listen_url=${track.listen_url}`);
			log.push(`[1] uploads=${JSON.stringify(track.uploads)}`);
			log.push(`[1] is_playable=${track.is_playable}`);

			// Check for alternative field names for uploads
			for (const key of ['recordings', 'sources', 'files', 'media', 'audio_files', 'media_files']) {
				if (track[key] !== undefined) {
					log.push(`[1] FOUND alt field '${key}': ${JSON.stringify(track[key])}`);
				}
			}

			const uploads = track.uploads || [];
			if (uploads.length > 0 && uploads[0].listen_url) {
				const listenUrl = uploads[0].listen_url;
				const resolved = listenUrl.startsWith('http') ? listenUrl : `${baseUrl}${listenUrl}`;
				log.push(`[1] SUCCESS: upload listen_url = ${resolved}`);
				return resolved;
			}
		}
	} catch (e: any) {
		log.push(`[1] Error: ${e.message}`);
	}

	// ── Strategy 2: v2 uploads endpoint ──
	const uploadEndpoints = [
		`${baseUrl}/api/v2/uploads/?track=${trackId}&page_size=1`,
		`${baseUrl}/api/v2/uploads/?track_id=${trackId}&page_size=1`,
		`${baseUrl}/api/v2/tracks/${trackId}/uploads/`,
		`${baseUrl}/api/v2/libraries/tracks/${trackId}/`,
	];

	for (let i = 0; i < uploadEndpoints.length; i++) {
		const ep = uploadEndpoints[i];
		try {
			log.push(`[2.${i}] GET ${ep}`);
			const resp = await fetch(ep, { headers });
			log.push(`[2.${i}] Status: ${resp.status}`);
			if (!resp.ok) continue;

			const data = await resp.json();
			const keys = Object.keys(data);
			log.push(`[2.${i}] Keys: ${keys.join(', ')}`);

			const results = data.results || (Array.isArray(data) ? data : null);
			if (results && results.length > 0) {
				const upload = results[0];
				log.push(`[2.${i}] First result keys: ${Object.keys(upload).join(', ')}`);
				log.push(`[2.${i}] First result: ${JSON.stringify(upload).substring(0, 300)}`);

				if (upload.listen_url) {
					const url = upload.listen_url;
					const resolved = url.startsWith('http') ? url : `${baseUrl}${url}`;
					log.push(`[2.${i}] SUCCESS: upload listen_url = ${resolved}`);
					return resolved;
				}
				if (upload.uuid && trackGuid) {
					const resolved = `${baseUrl}/api/v2/listen/${trackGuid}/?upload=${upload.uuid}`;
					log.push(`[2.${i}] SUCCESS: constructed URL = ${resolved}`);
					return resolved;
				}
			}
		} catch (e: any) {
			log.push(`[2.${i}] Error: ${e.message}`);
		}
	}

	// ── Strategy 3: v1 track detail ──
	try {
		const v1Url = `${baseUrl}/api/v1/tracks/${trackId}/`;
		log.push(`[3] GET ${v1Url}`);
		const resp = await fetch(v1Url, { headers });
		log.push(`[3] Status: ${resp.status}`);

		if (resp.ok) {
			const track = await resp.json();
			log.push(`[3] Keys: ${Object.keys(track).join(', ')}`);
			const uploads = track.uploads || [];
			log.push(`[3] uploads count: ${uploads.length}`);
			if (uploads.length > 0) {
				log.push(`[3] upload[0]: ${JSON.stringify(uploads[0]).substring(0, 200)}`);
				if (uploads[0].listen_url) {
					const url = uploads[0].listen_url;
					const resolved = url.startsWith('http') ? url : `${baseUrl}${url}`;
					log.push(`[3] SUCCESS: v1 upload listen_url = ${resolved}`);
					return resolved;
				}
			}
			if (track.listen_url) {
				const resolved = track.listen_url.startsWith('http')
					? track.listen_url : `${baseUrl}${track.listen_url}`;
				log.push(`[3] Trying v1 listen_url directly: ${resolved}`);
				return resolved;
			}
		}
	} catch (e: any) {
		log.push(`[3] Error: ${e.message}`);
	}

	// ── Strategy 4: Try listen endpoint directly (some instances may not need ?upload=) ──
	if (trackGuid) {
		const directListenUrls = [
			`${baseUrl}/api/v2/listen/${trackGuid}/`,
			`${baseUrl}/api/v1/listen/${trackGuid}/`,
		];
		for (const listenUrl of directListenUrls) {
			try {
				log.push(`[4] HEAD ${listenUrl}`);
				const resp = await fetch(listenUrl, { headers, method: 'HEAD', redirect: 'follow' });
				log.push(`[4] Status: ${resp.status}`);
				if (resp.ok || resp.status === 206 || resp.status === 302) {
					log.push(`[4] SUCCESS: direct listen URL works`);
					return listenUrl;
				}
			} catch (e: any) {
				log.push(`[4] Error: ${e.message}`);
			}
		}
	}

	log.push('[X] All strategies exhausted');
	return null;
}

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Range, Content-Type'
		}
	});
};
