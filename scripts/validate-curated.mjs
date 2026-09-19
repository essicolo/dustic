#!/usr/bin/env node
// Check that every track in the shipped curated playlists still plays.
//
// Curated content rots quietly. Over one review pass the list had accumulated
// a Mogwai item the archive had darkened, and three entries whose identifier
// carried an item-page query string ("LostChildren025?track=3") and so could
// not resolve at all — on the page that exists to show the app at its best.
// Nothing in the build noticed any of it.
//
// Hits the live archive, so it is a separate CI job from the unit tests
// rather than part of them: a network wobble should not fail a pull request
// that changed CSS. Run locally with `node scripts/validate-curated.mjs`.

import { readFileSync } from 'node:fs';

const PLAYLISTS = JSON.parse(readFileSync('src/lib/data/curatedPlaylists.json', 'utf-8'));
const META = 'https://archive.org/metadata';
const AUDIO = ['VBR MP3', 'MP3', 'Ogg Vorbis', 'FLAC', '24bit Flac'];

/** Only Internet Archive identifiers can be checked this way. */
const isIA = (id) => !id.startsWith('fw:') && !id.startsWith('wd:');

async function check(entry) {
  const { identifier, trackIndex, note } = entry;
  const label = note ? `${identifier} (${note.slice(0, 40)})` : identifier;

  if (identifier.includes('?') || identifier.includes('#')) {
    return { label, ok: false, why: 'identifier carries a query string or fragment' };
  }
  if (!isIA(identifier)) return { label, ok: true, why: 'not an archive item, skipped' };

  let data;
  try {
    const res = await fetch(`${META}/${identifier}`, { signal: AbortSignal.timeout(30000) });
    data = await res.json();
  } catch (error) {
    return { label, ok: false, why: `metadata request failed: ${error.message}`, transient: true };
  }

  if (data.is_dark) return { label, ok: false, why: 'darkened by the archive' };
  if (!data.metadata) return { label, ok: false, why: 'no longer exists' };

  const playable = (data.files ?? []).filter((f) => AUDIO.includes(f.format));
  if (playable.length === 0) return { label, ok: false, why: 'no playable audio files' };

  if (trackIndex !== undefined && trackIndex >= playable.length) {
    return {
      label,
      ok: false,
      why: `trackIndex ${trackIndex} is out of range (${playable.length} audio files)`
    };
  }

  return { label, ok: true };
}

let failures = 0;
let transient = 0;

for (const playlist of PLAYLISTS) {
  console.log(`\n${playlist.name} — ${playlist.tracks.length} tracks`);
  const results = await Promise.all(playlist.tracks.map(check));
  for (const r of results) {
    if (r.ok) {
      console.log(`  ok    ${r.label}`);
    } else {
      console.log(`  FAIL  ${r.label}\n        ${r.why}`);
      failures++;
      if (r.transient) transient++;
    }
  }
}

if (failures === 0) {
  console.log('\nAll curated tracks resolve and have playable audio.');
  process.exit(0);
}

// Network failures are not the playlist's fault; do not fail the build on them.
const real = failures - transient;
console.log(`\n${failures} problem(s): ${real} in the playlists, ${transient} network.`);
process.exit(real > 0 ? 1 : 0);
