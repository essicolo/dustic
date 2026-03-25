/** Diagnostic-only: inspect what open.audio v2 API actually returns */
export async function GET({ url }) {
	const trackId = url.searchParams.get('track') || '457728';
	const base = 'https://open.audio';
	const h = { 'User-Agent': 'Dustic/1.0' };
	const out = [];

	// 1) v2 track detail - dump ALL fields
	try {
		const r = await fetch(`${base}/api/v2/tracks/${trackId}/`, { headers: h });
		const j = r.ok ? await r.json() : null;
		out.push({ step: 'v2_track', status: r.status, keys: j ? Object.keys(j) : null, uploads: j?.uploads, listen_url: j?.listen_url, guid: j?.guid, is_playable: j?.is_playable });
	} catch (e) { out.push({ step: 'v2_track', error: e.message }); }

	// 2) v2 uploads list
	try {
		const r = await fetch(`${base}/api/v2/uploads/?track=${trackId}&page_size=1`, { headers: h });
		const j = r.ok ? await r.json() : null;
		out.push({ step: 'v2_uploads_by_id', status: r.status, keys: j ? Object.keys(j) : null, count: j?.count, first: j?.results?.[0] });
	} catch (e) { out.push({ step: 'v2_uploads_by_id', error: e.message }); }

	// 3) v2 track with expand/include params
	for (const param of ['include=uploads', 'expand=uploads', 'fields=uploads,listen_url,guid,id']) {
		try {
			const r = await fetch(`${base}/api/v2/tracks/${trackId}/?${param}`, { headers: h });
			const j = r.ok ? await r.json() : null;
			out.push({ step: `v2_track_${param}`, status: r.status, uploads: j?.uploads, listen_url: j?.listen_url });
		} catch (e) { out.push({ step: `v2_track_${param}`, error: e.message }); }
	}

	// 4) v2 search for this specific track to see if search returns uploads
	try {
		const r = await fetch(`${base}/api/v2/tracks/?id=${trackId}&page_size=1`, { headers: h });
		const j = r.ok ? await r.json() : null;
		const t = j?.results?.[0];
		out.push({ step: 'v2_search_by_id', status: r.status, count: j?.count, uploads: t?.uploads, listen_url: t?.listen_url, keys: t ? Object.keys(t) : null });
	} catch (e) { out.push({ step: 'v2_search_by_id', error: e.message }); }

	// 5) v1 track
	try {
		const r = await fetch(`${base}/api/v1/tracks/${trackId}/`, { headers: h });
		out.push({ step: 'v1_track', status: r.status });
	} catch (e) { out.push({ step: 'v1_track', error: e.message }); }

	return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } });
}
