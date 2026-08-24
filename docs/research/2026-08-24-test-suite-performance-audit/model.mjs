// What-if model for the unit lane, driven by the measured 2026-08-24 artifact.
import { readFileSync, writeFileSync } from 'node:fs';

const art = JSON.parse(readFileSync('.tmp/testaudit/timing-unit.json', 'utf8'));
const inv = new Map(
  JSON.parse(readFileSync('.tmp/testaudit/test-inventory.json', 'utf8')).map((r) => [r.file, r])
);
const CPUS = 10;
const WORKERS = CPUS - 1; // poolConcurrency today

const files = Object.entries(art.files).map(([file, t]) => {
  const i = inv.get(file) || {};
  return {
    file,
    wallMs: t.wallMs,
    inProcMs: t.inProcMs,
    spawns: !!i.spawnsSubprocess,
    tests: i.tests || 0,
  };
});

const sum = (xs, f = (r) => r.wallMs) => xs.reduce((a, r) => a + f(r), 0);
const s = (ms) => `${(ms / 1000).toFixed(1)}s`;

// Greedy longest-processing-time bin packing = a good proxy for a work-stealing pool.
function packWall(durations, workers) {
  const slots = new Array(workers).fill(0);
  for (const d of [...durations].sort((a, b) => b - a)) {
    let min = 0;
    for (let i = 1; i < workers; i++) if (slots[i] < slots[min]) min = i;
    slots[min] += d;
  }
  return Math.max(...slots);
}

const FIXED = 575; // measured median (wall - inProc) on near-zero-work pure files

const out = [];
const push = (name, ms, note) => out.push({ scenario: name, wallMs: Math.round(ms), note });

push(
  'measured today (4 sequential phases)',
  art.elapsed.runnerMs,
  `pool ${s(art.elapsed.poolMs)} + subprocess ${s(art.elapsed.subprocessPoolMs)} + serial ${s(art.elapsed.serialMs)}`
);

// A: single global pool, no phase barriers. Subprocess files still capped at 2 concurrent,
// but they overlap the pure pool instead of waiting behind a barrier.
const pure = files.filter((r) => !r.spawns);
const sub = files.filter((r) => r.spawns);
const aPure = packWall(
  pure.map((r) => r.wallMs),
  WORKERS - 2
);
const aSub = packWall(
  sub.map((r) => r.wallMs),
  2
);
push(
  'A. one global pool (phases overlap)',
  Math.max(aPure, aSub),
  `pure lane ${s(aPure)} on 7 workers, subprocess lane ${s(aSub)} on 2`
);

// B: A + trim the shared import graph so fixed cost drops 575ms -> 150ms.
const trim = (r) => Math.max(50, r.wallMs - (FIXED - 150));
const bPure = packWall(pure.map(trim), WORKERS - 2);
const bSub = packWall(sub.map(trim), 2);
push(
  'B. A + import-graph trim (575ms -> 150ms fixed)',
  Math.max(bPure, bSub),
  `removes ${s(files.length * (FIXED - 150))} of aggregate CPU`
);

// C: B + halve the 20 heaviest files (in-process/in-memory fixtures).
const heavy = new Set(
  [...files]
    .sort((a, b) => b.wallMs - a.wallMs)
    .slice(0, 20)
    .map((r) => r.file)
);
const cut = (r) => (heavy.has(r.file) ? trim(r) / 2 : trim(r));
const cPure = packWall(pure.map(cut), WORKERS - 2);
const cSub = packWall(sub.map(cut), 2);
push(
  'C. B + halve top-20 heaviest files',
  Math.max(cPure, cSub),
  `top-20 currently ${s(sum([...files].sort((a, b) => b.wallMs - a.wallMs).slice(0, 20)))} of ${s(sum(files))}`
);

// D: C + consolidate. Assume the 249 overhead-dominated files merge 8:1 into
// per-directory suites, paying the (trimmed) fixed cost once per merged file.
const ovhDom = pure.filter(
  (r) => r.inProcMs != null && r.wallMs - r.inProcMs > 3 * r.inProcMs && r.wallMs > 500
);
const ovhSet = new Set(ovhDom.map((r) => r.file));
const kept = pure.filter((r) => !ovhSet.has(r.file));
const mergedCount = Math.ceil(ovhDom.length / 8);
const mergedWork = sum(ovhDom, (r) => r.inProcMs || 0) + mergedCount * 150;
const dDur = [...kept.map(cut), ...new Array(mergedCount).fill(mergedWork / mergedCount)];
const dPure = packWall(dDur, WORKERS - 2);
push(
  'D. C + consolidate 249 overhead-bound files 8:1',
  Math.max(dPure, cSub),
  `${ovhDom.length} files -> ${mergedCount}, aggregate ${s(sum(ovhDom))} -> ${s(mergedWork)}`
);

console.log(`unit lane: ${files.length} files, aggregate CPU ${s(sum(files))}, ${CPUS} cpus\n`);
for (const r of out) console.log(`${s(r.wallMs).padStart(8)}  ${r.scenario}\n          ${r.note}`);

console.log('\n--- where the aggregate CPU goes ---');
const fixedTotal = files.length * FIXED;
console.log(
  `process+import fixed cost   ${s(fixedTotal).padStart(9)}  (${((fixedTotal / sum(files)) * 100).toFixed(0)}% of ${s(sum(files))})`
);
console.log(
  `top-20 heaviest files       ${s(sum([...files].sort((a, b) => b.wallMs - a.wallMs).slice(0, 20))).padStart(9)}`
);
console.log(
  `overhead-dominated (${ovhDom.length})    ${s(sum(ovhDom)).padStart(9)}  of which ${s(sum(ovhDom, (r) => r.wallMs - (r.inProcMs || 0)))} is not test work`
);

writeFileSync(
  '.tmp/testaudit/model.json',
  JSON.stringify({ cpus: CPUS, fixedMs: FIXED, scenarios: out }, null, 1)
);
