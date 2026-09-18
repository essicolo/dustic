import { describe, it, expect } from 'vitest';
import playlists from '$lib/data/curatedPlaylists.json';

// The shape checks that need no network. Whether each item still *plays* is
// checked by scripts/validate-curated.mjs in its own CI job, because that
// talks to archive.org and a network wobble should not fail a pull request
// that only changed CSS.
//
// Both exist because this file rots silently: it had accumulated an item the
// archive had darkened, and three identifiers carrying an item-page query
// string ("LostChildren025?track=3") which could not resolve at all — on the
// page meant to show the app at its best.

interface Entry {
	identifier: string;
	trackIndex?: number;
	note?: string;
}
interface Playlist {
	id: string;
	name: string;
	description: string;
	curator: string;
	tracks: Entry[];
}

const all = playlists as Playlist[];
const entries = all.flatMap((p) => p.tracks.map((t) => [p.name, t] as const));

describe('curated playlists', () => {
	it('ships at least one playlist, each with tracks', () => {
		expect(all.length).toBeGreaterThan(0);
		for (const p of all) {
			expect(p.tracks.length, p.name).toBeGreaterThan(0);
		}
	});

	it('has a unique id and the fields the UI renders', () => {
		const ids = all.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const p of all) {
			for (const field of ['id', 'name', 'description', 'curator'] as const) {
				expect(p[field], `${p.name}.${field}`).toBeTruthy();
			}
		}
	});

	it('never encodes a track position in the identifier', () => {
		// "LostChildren025?track=3" is an item-page URL pasted into the
		// identifier field. It resolves to nothing; trackIndex is the field
		// that means what was intended.
		for (const [playlist, entry] of entries) {
			expect(entry.identifier, `${playlist}: ${entry.identifier}`).not.toMatch(/[?#]/);
		}
	});

	it('uses identifiers the archive could actually have', () => {
		for (const [playlist, entry] of entries) {
			expect(entry.identifier, `${playlist}: ${entry.identifier}`).toMatch(/^[A-Za-z0-9._-]+$/);
		}
	});

	it('gives trackIndex as a non-negative integer when present', () => {
		for (const [playlist, entry] of entries) {
			if (entry.trackIndex === undefined) continue;
			expect(Number.isInteger(entry.trackIndex), `${playlist}: ${entry.identifier}`).toBe(true);
			expect(entry.trackIndex, `${playlist}: ${entry.identifier}`).toBeGreaterThanOrEqual(0);
		}
	});

	it('does not list the same track twice in one playlist', () => {
		for (const p of all) {
			const keys = p.tracks.map((t) => `${t.identifier}#${t.trackIndex ?? ''}`);
			const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
			expect(dupes, `${p.name} repeats: ${dupes.join(', ')}`).toEqual([]);
		}
	});
});
