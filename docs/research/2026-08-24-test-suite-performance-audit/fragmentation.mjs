// Fragmentation: how many separate test FILES target the same source module,
// and what that costs in fixed per-process overhead.
import { readFileSync, writeFileSync } from 'node:fs';

const inv = JSON.parse(readFileSync('.tmp/testaudit/test-inventory.json', 'utf8'));
const timing = JSON.parse(readFileSync('.tmp/testaudit/timing-fast-2026-08-22.json', 'utf8')).files;

// A test file's "subject" = the imported production module whose basename is
// closest to the test's own basename; fall back to the first non-shared import.
const SHARED =
  /(scratch-dir|paths|process-timeouts|lifecycle-policy|fleet-registry|session-state|word-counter|providers\/)/;

function subjectOf(r) {
  const base = r.file
    .split('/')
    .pop()
    .replace(/\.(integration\.)?test\.mjs$/, '');
  const cands = r.imports.filter((i) => !SHARED.test(i));
  let best = null;
  let bestScore = -1;
  for (const c of cands) {
    const cb = c
      .split('/')
      .pop()
      .replace(/\.mjs$/, '');
    let score = 0;
    if (cb === base) score = 100;
    else if (base.startsWith(cb) || cb.startsWith(base))
      score = 50 + Math.min(cb.length, base.length);
    else {
      const toks = cb.split('-');
      score = toks.filter((t) => t.length > 3 && base.includes(t)).length * 5;
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore > 0 ? best : cands[0] || '(none)';
}

const groups = new Map();
for (const r of inv) {
  const s = subjectOf(r);
  if (!groups.has(s)) groups.set(s, []);
  groups.get(s).push(r);
}

const wall = (f) => timing[f]?.wallMs ?? null;
const inProc = (f) => timing[f]?.inProcMs ?? null;

const rows = [...groups.entries()]
  .map(([subject, files]) => {
    const measured = files.filter((f) => wall(f.file) != null);
    return {
      subject,
      fileCount: files.length,
      tests: files.reduce((a, f) => a + f.tests, 0),
      measuredFiles: measured.length,
      wallMs: +measured.reduce((a, f) => a + wall(f.file), 0).toFixed(0),
      inProcMs: +measured.reduce((a, f) => a + (inProc(f.file) || 0), 0).toFixed(0),
      files: files.map((f) => f.file),
    };
  })
  .sort((a, b) => b.fileCount - a.fileCount);

writeFileSync('.tmp/testaudit/fragmentation.json', JSON.stringify(rows, null, 1));

const multi = rows.filter((r) => r.fileCount >= 4 && r.subject !== '(none)');
console.log(`subjects=${rows.length}  subjects with >=4 test files=${multi.length}`);
console.log(
  `files inside those groups=${multi.reduce((a, r) => a + r.fileCount, 0)}  wall=${(multi.reduce((a, r) => a + r.wallMs, 0) / 1000).toFixed(0)}s`
);

// Fixed-cost estimate: median (wall - inProc) over pure files with tiny inProc.
const fixed = inv
  .filter((r) => !r.spawnsSubprocess && wall(r.file) != null && (inProc(r.file) ?? 1e9) < 50)
  .map((r) => wall(r.file) - (inProc(r.file) || 0))
  .sort((a, b) => a - b);
const medFixed = fixed[Math.floor(fixed.length / 2)];
console.log(
  `\nfixed per-file cost (median wall-inProc over ${fixed.length} near-zero-work pure files): ${medFixed?.toFixed(0)}ms`
);

console.log('\n--- most fragmented subjects (>=6 test files) ---');
for (const r of rows.filter((x) => x.fileCount >= 6 && x.subject !== '(none)').slice(0, 40)) {
  console.log(
    `${String(r.fileCount).padStart(3)} files ${String(r.tests).padStart(4)} tests ${(r.wallMs / 1000).toFixed(1).padStart(7)}s wall (${(r.inProcMs / 1000).toFixed(1)}s inProc)  ${r.subject}`
  );
}
console.log('\n--- "(none)" bucket: test files importing only shared infra ---');
const none = rows.find((r) => r.subject === '(none)');
console.log(
  none ? `${none.fileCount} files, ${none.tests} tests, ${(none.wallMs / 1000).toFixed(1)}s` : 'n/a'
);
