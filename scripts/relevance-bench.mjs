// Relevance benchmark for search ranking.
//
// Usage:  npm run build && npm run preview
//         node scripts/relevance-bench.mjs
//
// Ranking changes against the Internet Archive cannot be reasoned about from
// the API docs — advancedsearch silently ignores `^` boost operators, so the
// only way to know whether a change helped is to measure it. Keep this set
// fixed and compare runs; a change that improves one query while sinking
// another is not an improvement.
//
// Drives the real search page and reads the rendered rows, so it exercises
// the whole path (query building, strategy cascade, merging, filtering)
// rather than a re-implementation of it.
//
// For each query a predicate says which results are relevant. Two numbers:
//   firstRank    position of the first relevant row (0 = absent from top 30)
//   p@10         how many of the top 10 rows are relevant
// Lower firstRank is better; higher p@10 is better.

import { chromium } from '/home/essi/Documents/git/dustic/node_modules/@playwright/test/index.mjs';

const B = 'http://localhost:4173';

// Each target is an artist/work known to be on the archive. The predicate is
// deliberately loose (artist OR distinctive work title) because several
// recordings can legitimately be "the right answer".
export const QUERIES = [
  { q: 'godspeed you black emperor', re: /godspeed|g_d'?s pee|gy!?be|lift yr|f#a#/i },
  { q: 'explosions in the sky',      re: /explosions in the sky/i },
  { q: 'do make say think',          re: /do make say think/i },
  { q: 'satie gymnopedies',          re: /satie|gymnop/i },
  { q: 'beethoven moonlight sonata', re: /beethoven|moonlight|mondschein|op\.?\s*27/i },
  { q: 'mono live',                  re: /\bmono\b/i },
  { q: '65daysofstatic',             re: /65\s*days\s*of\s*static/i },
  { q: 'caspian post rock',          re: /caspian/i },
  { q: 'rimsky korsakov',            re: /rimsky|korsakov|scheherazade|capriccio/i },
  { q: 'bartok concerto for orchestra', re: /bart[oó]k|concerto for orchestra/i },
];

const browser = await chromium.launch({
  executablePath: '/home/essi/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'
});
const c = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
await c.addInitScript(() => localStorage.setItem('dustic-theme-picker-seen', '1'));
const p = await c.newPage();

const rows = [];
for (const { q, re } of QUERIES) {
  await p.goto(`${B}/search?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('body[data-hydrated="1"]');
  await p.locator('.card').first().waitFor({ timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(2500); // let the merged set settle

  const results = await p.evaluate(() =>
    [...document.querySelectorAll('.card')].slice(0, 30).map((card) => {
      const title = card.querySelector('.card-title')?.textContent?.trim() ?? '';
      const artist = card.querySelector('button.text-sm, button.text-xs')?.textContent?.trim() ?? '';
      return `${title} ~ ${artist}`;
    })
  );

  const hits = results.map((r) => re.test(r));
  const firstRank = hits.indexOf(true) + 1; // 0 when absent
  const p10 = hits.slice(0, 10).filter(Boolean).length;
  rows.push({ q, firstRank, p10, total: results.length, top3: results.slice(0, 3) });
}
await browser.close();

const found = rows.filter((r) => r.firstRank > 0);
const mrr = rows.reduce((s, r) => s + (r.firstRank ? 1 / r.firstRank : 0), 0) / rows.length;

console.log('\nquery                          first  p@10  top result');
console.log('-'.repeat(100));
for (const r of rows) {
  console.log(
    r.q.padEnd(30),
    String(r.firstRank || '-').padStart(5),
    String(r.p10).padStart(5),
    ' ',
    (r.top3[0] ?? '(none)').slice(0, 52)
  );
}
console.log('-'.repeat(100));
console.log(`found in top 30: ${found.length}/${rows.length}`);
console.log(`mean first rank (found only): ${(found.reduce((s, r) => s + r.firstRank, 0) / (found.length || 1)).toFixed(2)}`);
console.log(`mean p@10: ${(rows.reduce((s, r) => s + r.p10, 0) / rows.length).toFixed(2)}`);
console.log(`MRR: ${mrr.toFixed(3)}`);
