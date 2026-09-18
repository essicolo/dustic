// Geometry for the generated cover tile drawn when an item has no artwork.
//
// Kept out of the component so it can be tested directly: the guarantees that
// matter (same identifier → same tile, different identifiers → different
// tiles, nothing drawn outside the frame) are properties of this function,
// not of the markup.

export interface Mote {
	/** All coordinates are in the tile's 0–100 viewBox space. */
	cx: number;
	cy: number;
	r: number;
	opacity: number;
}

/** FNV-1a — small, fast, well distributed over short strings. */
function hash(text: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** mulberry32 — deterministic PRNG, so a given seed always draws the same tile. */
function rng(state: number): () => number {
	return () => {
		state |= 0;
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Scatter dust motes rising from a horizon line, thinning towards the top —
 * the same motif as the logo. Density and spread vary with the seed so a
 * column of artwork-less items reads as varied rather than as one placeholder
 * repeated down the page.
 */
export function generateMotes(seed: string): Mote[] {
	const next = rng(hash(seed || 'dustic'));
	const count = 14 + Math.floor(next() * 10);
	const drift = 0.6 + next() * 0.8;
	const motes: Mote[] = [];

	for (let i = 0; i < count; i++) {
		// `t` runs 0 (just above the horizon) → 1 (top of the tile).
		const t = i / count;
		const cy = 92 - t * 84 - next() * 6;
		const spread = 12 + t * 26 * drift;
		const cx = 50 + (next() - 0.5) * 2 * spread;

		motes.push({
			cx: clamp(cx, 6, 94),
			cy: clamp(cy, 4, 96),
			r: clamp(3.6 - t * 2.6 + next() * 0.7, 0.5, 5),
			opacity: clamp(0.85 - t * 0.45, 0.2, 1)
		});
	}

	return motes;
}
