/** Diagnostic: check FW v2 API with playable=true filter */
export async function GET({ url }) {
	const q = url.searchParams.get('q') || 'classical';
	const base = 'https://open.audio';
	const h = { 'User-Agent': 'Dustic/1.0' };
	const out = [];

	// Search WITH playable=true filter
	try {
		const r = await fetch(`${base}/api/v2/tracks/?q=${encodeURIComponent(q)}&page_size=5&playable=true`, { headers: h });
		const j = r.ok ? await r.json() : null;
		const tracks = (j?.results || []).map((t) => ({
			id: t.id, title: t.title?.substring(0, 40),
			is_playable: t.is_playable,
			uploads_count: t.uploads?.length || 0,
			has_listen_url: !!t.listen_url,
			upload_listen_url: t.uploads?.[0]?.listen_url || null
		}));
		out.push({ step: 'search_playable_true', status: r.status, count: j?.count, tracks });
	} catch (e) { out.push({ step: 'search_playable_true', error: e.message }); }

	// Search WITHOUT playable filter (for comparison)
	try {
		const r = await fetch(`${base}/api/v2/tracks/?q=${encodeURIComponent(q)}&page_size=5`, { headers: h });
		const j = r.ok ? await r.json() : null;
		const tracks = (j?.results || []).map((t) => ({
			id: t.id, title: t.title?.substring(0, 40),
			is_playable: t.is_playable,
			uploads_count: t.uploads?.length || 0,
			upload_listen_url: t.uploads?.[0]?.listen_url || null
		}));
		out.push({ step: 'search_no_filter', status: r.status, count: j?.count, tracks });
	} catch (e) { out.push({ step: 'search_no_filter', error: e.message }); }

	return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } });
}
