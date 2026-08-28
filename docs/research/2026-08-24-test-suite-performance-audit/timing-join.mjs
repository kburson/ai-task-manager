// Join a run-tests timing artifact with the static inventory.
import { readFileSync, writeFileSync } from 'node:fs';

const artifactPath = process.argv[2] || '.aitm/test-timing.json';
const outPath = process.argv[3] || '.tmp/testaudit/joined.json';
const art = JSON.parse(readFileSync(artifactPath, 'utf8'));
const inv = new Map(
  JSON.parse(readFileSync('.tmp/testaudit/test-inventory.json', 'utf8')).map((r) => [r.file, r])
);

const rows = Object.entries(art.files).map(([file, t]) => {
  const i = inv.get(file) || {};
  const overhead = t.inProcMs == null ? null : Math.max(0, t.wallMs - t.inProcMs);
  return {
    file,
    lane: i.lane || 'unknown',
    wallMs: t.wallMs,
    inProcMs: t.inProcMs,
    overheadMs: overhead,
    tests: i.tests ?? null,
    asserts: i.asserts ?? null,
    lines: i.lines ?? null,
    msPerTest: i.tests ? +(t.wallMs / i.tests).toFixed(1) : null,
    spawns: i.spawnsSubprocess ?? null,
    nodeChildSpawns: i.nodeChildOfNode ?? 0,
    execFileSync: i.execFileSync ?? 0,
    mkdtemp: i.mkdtemp ?? 0,
    gitInit: i.gitInitCalls ?? 0,
    imports: (i.imports || []).length,
  };
});
rows.sort((a, b) => b.wallMs - a.wallMs);
writeFileSync(outPath, JSON.stringify({ meta: { ...art, files: undefined }, rows }, null, 1));

const sum = (f, xs = rows) => xs.reduce((a, r) => a + (f(r) || 0), 0);
const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`;

console.log(`artifact: lane=${art.lane} files=${art.count} generated=${art.generatedAt}`);
console.log(`runner wall: ${fmt(art.elapsed.runnerMs)}`);
console.log(
  `  pool=${fmt(art.elapsed.poolMs)} subprocessPool=${fmt(art.elapsed.subprocessPoolMs)} slowPool=${fmt(art.elapsed.slowPoolMs)} serial=${fmt(art.elapsed.serialMs)}`
);
console.log(
  `sum file wall=${fmt(sum((r) => r.wallMs))} inProc=${fmt(sum((r) => r.inProcMs))} overhead=${fmt(sum((r) => r.overheadMs))} (${((sum((r) => r.overheadMs) / sum((r) => r.wallMs)) * 100).toFixed(1)}%)`
);

console.log('\n--- by lane ---');
for (const lane of ['unit', 'integration', 'slow', 'unknown']) {
  const xs = rows.filter((r) => r.lane === lane);
  if (!xs.length) continue;
  console.log(
    `${lane.padEnd(12)} files=${String(xs.length).padStart(4)}  wall=${fmt(sum((r) => r.wallMs, xs)).padStart(9)}  inProc=${fmt(sum((r) => r.inProcMs, xs)).padStart(9)}  overhead=${fmt(sum((r) => r.overheadMs, xs)).padStart(9)}  tests=${sum((r) => r.tests, xs)}`
  );
}

console.log('\n--- spawn-class split (unit lane) ---');
for (const [label, pred] of [
  ['pure (pooled)', (r) => !r.spawns],
  ['subprocess', (r) => r.spawns],
]) {
  const xs = rows.filter((r) => r.lane === 'unit' && pred(r));
  console.log(
    `${label.padEnd(16)} files=${String(xs.length).padStart(4)} wall=${fmt(sum((r) => r.wallMs, xs)).padStart(9)} median=${(xs.map((r) => r.wallMs).sort((a, b) => a - b)[Math.floor(xs.length / 2)] || 0).toFixed(0)}ms mean=${(sum((r) => r.wallMs, xs) / xs.length).toFixed(0)}ms`
  );
}

console.log('\n--- top 35 by wall ---');
for (const r of rows.slice(0, 35)) {
  console.log(
    `${fmt(r.wallMs).padStart(8)}  inProc=${(r.inProcMs ?? 0).toFixed(0).padStart(7)}ms  ovh=${(r.overheadMs ?? 0).toFixed(0).padStart(6)}ms  tests=${String(r.tests).padStart(3)}  spawn=${r.spawns ? 'Y' : 'n'}  ${r.file.replace('scripts/tests/', '')}`
  );
}

console.log('\n--- overhead-dominated (overhead > 3x inProc, wall > 500ms) ---');
const ovh = rows.filter(
  (r) => r.inProcMs != null && r.overheadMs > 3 * r.inProcMs && r.wallMs > 500
);
console.log(
  `count=${ovh.length}  total wall=${fmt(sum((r) => r.wallMs, ovh))}  reclaimable≈${fmt(sum((r) => r.overheadMs, ovh))}`
);
for (const r of ovh.slice(0, 20))
  console.log(
    `  ${fmt(r.wallMs).padStart(8)} ovh=${r.overheadMs.toFixed(0)}ms inProc=${r.inProcMs.toFixed(0)}ms  ${r.file.replace('scripts/tests/', '')}`
  );

console.log('\n--- tiny files (wall < 400ms) ---');
const tiny = rows.filter((r) => r.wallMs < 400);
console.log(`count=${tiny.length} total=${fmt(sum((r) => r.wallMs, tiny))}`);
