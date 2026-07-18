#!/usr/bin/env node
// Carve-out: uses spawnSync (not execFileSync) because the test runner needs non-throwing exit-code introspection to accumulate failures across files (see #22).
//
// Lanes (#305, canonicalized #874):
//   --lane fast (default) — unit ∪ integration (every *.test.mjs except slow)
//   --lane slow           — the slow lane only
//   --lane all            — every lane; what DoD verification (`test:all`) invokes
//
// Discovery and lane assignment come from the canonical modules
// (`discoverTestFiles` #872 + `laneManifest` #873) via `run-tests-lanes.mjs`;
// there is no hardcoded directory list here. A divergence guard fails the run if
// the selection ever omits an on-disk `*.test.mjs`, so a green run provably ran
// every committed test file (the 624-vs-652 false green cannot recur).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_RUNNER_TIMEOUT_MS } from './task-tracker/lib/process-timeouts.mjs';
import {
  findMainWorktreePath,
  fleetRegistryPath,
  readFleet,
} from './task-tracker/fleet-registry.mjs';
import { describeSpawnResult, formatFleetLeak, RUN_TESTS_MAX_BUFFER } from './run-tests-report.mjs';
import { TEST_NO_RETRY_ENV } from './gh/lib/with-retry.mjs';
import { RUN_LANES, SKIP, laneFiles, discoveryDivergence } from './run-tests-lanes.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dir, '..');

// ---- arg parsing ---------------------------------------------------------
const VALID_LANES = new Set(RUN_LANES);
let lane = 'fast';
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--lane') {
    lane = process.argv[++i];
  } else if (a.startsWith('--lane=')) {
    lane = a.slice('--lane='.length);
  } else {
    console.error(`run-tests: unknown argument: ${a}`);
    process.exit(2);
  }
}
if (!VALID_LANES.has(lane)) {
  console.error(`run-tests: --lane must be one of fast|slow|all (got: ${lane})`);
  process.exit(2);
}

// ---- divergence guard ----------------------------------------------------
// Every lane's selection is a slice of the canonical manifest; the union of the
// three lanes must equal the on-disk `*.test.mjs` set. If it ever doesn't, a
// test would silently vanish from the suite — fail loudly instead of printing a
// false green. Runs on every invocation, independent of the selected lane.
const { missing, extra } = discoveryDivergence();
if (missing.length || extra.length) {
  console.error('run-tests: discovery divergence — the runner is not covering every on-disk test:');
  for (const f of missing) console.error(`  MISSING (on disk, not selected): ${f}`);
  for (const f of extra) console.error(`  EXTRA   (selected, not on disk): ${f}`);
  process.exit(1);
}

// Canonical selection: repo-relative paths → { label, full } run entries.
const files = laneFiles(lane).map((rel) => ({ label: rel, full: path.join(repoRoot, rel) }));

console.log(`▶ lane=${lane} (${files.length} files)\n`);

// AC2 (#442) — authoritative runtime guard against test-sandbox registry leaks.
// A test that creates a non-git sandbox and then reaches `registerTask` will
// have its registry path escape the sandbox (via findMainWorktreePath →
// git rev-parse) and land on THIS repo's live `.ai-task-manager/task-fleet.json`,
// injecting bogus issue entries (#777/#888/#999/#108/#200/...). We snapshot the
// live registry key-SET before the suite and fail if the suite ADDS any key.
// Comparing key-sets (not contents) ignores benign timestamp churn on entries
// that legitimately already exist (e.g. the active task driving this run).
function liveRegistryKeySet() {
  try {
    const regPath = fleetRegistryPath(findMainWorktreePath(repoRoot));
    const fleet = readFleet(regPath) || {};
    return new Set(Object.keys(fleet));
  } catch {
    return new Set();
  }
}
const registryKeysBefore = liveRegistryKeySet();

let failed = 0;
const failures = [];
for (const entry of files) {
  const { label, full } = entry;
  if (SKIP.has(label)) {
    console.log(`▶ ${label} ... SKIP (${SKIP.get(label)})`);
    continue;
  }
  process.stdout.write(`▶ ${label} ... `);
  const t0 = process.hrtime.bigint();
  const res = spawnSync('node', [full], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: TEST_RUNNER_TIMEOUT_MS,
    // #531 AC2 — raise the per-file ceiling so a chatty-but-passing file is
    // never buffer-killed (and mis-reported as a hang) by the 1 MB default.
    maxBuffer: RUN_TESTS_MAX_BUFFER,
    // #531 AC1 — cap `gh` retries to 0 in every spawned test child, so a test
    // that escapes its shim and reaches a live `gh` call against an
    // unresolvable repo fails fast instead of hanging until timeout-kill.
    env: { ...process.env, [TEST_NO_RETRY_ENV]: '1' },
  });
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  if (res.status === 0) {
    console.log('ok');
  } else {
    failed++;
    failures.push({ file: label, stdout: res.stdout, stderr: res.stderr, status: res.status });
    // #531 AC2 — never print a bare `(exit null)`; name the real kill cause.
    console.log(
      describeSpawnResult({
        status: res.status,
        signal: res.signal,
        error: res.error,
        elapsedMs: Math.round(elapsedMs),
      })
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${files.length} test file(s) failed:\n`);
  for (const fail of failures) {
    console.error(`── ${fail.file} ──`);
    if (fail.stdout) console.error(fail.stdout);
    if (fail.stderr) console.error(fail.stderr);
  }
  process.exit(1);
}

const registryKeysAfter = liveRegistryKeySet();
const leaked = [...registryKeysAfter].filter((k) => !registryKeysBefore.has(k));
if (leaked.length) {
  // #746 — dump each leaked entry's full record (worktreePath / sessionId /
  // kind / branch), not just the key, so the CI log names the exact escaping
  // sandbox. Re-read the live fleet OBJECT (the key-set snapshot above discards
  // the values) to source those fields.
  let liveFleet = {};
  try {
    liveFleet = readFleet(fleetRegistryPath(findMainWorktreePath(repoRoot))) || {};
  } catch {
    liveFleet = {};
  }
  console.error(formatFleetLeak(leaked, liveFleet));
  process.exit(1);
}

console.log(`\nAll ${files.length} test files passed.`);
