#!/usr/bin/env node
// Carve-out (see #22; parallelized by #863): the runner needs non-throwing
// exit-code introspection to accumulate failures across files. #863 replaced the
// blocking `for … spawnSync` loop with an async bounded pool (run-tests-pool.mjs)
// so the parallel-safe unit subset runs at `cpus - 1` concurrency; `spawnTestChild`
// reshapes each async child into the same `{status,signal,error}` object
// spawnSync gave, so failure accounting and `describeSpawnResult` are unchanged.
// Direct-subprocess unit files run in a separate two-worker phase after the
// saturated pure pool drains. Explicit `@parallel-unsafe`/unreadable unit files,
// integration files, and unmarked slow files remain one-at-a-time serial. A
// small audited slow subset can opt into a separate two-worker phase with the
// source-local `@slow-parallel-safe (rationale)` marker.
//
// Lanes (#305, canonicalized #874; sectioned #864):
//   --lane unit           — all unit tests (pure subset pooled; directly
//                           detected subprocess subset reduced-pooled;
//                           explicit unsafe/unreadable subset serial)
//   --lane integration    — the integration population (serial)
//   --lane fast (default)  — unit only (the deterministic local regression floor)
//   --lane slow           — the slow lane (explicit-safe subset bounded at two;
//                           every other file serial)
//   --lane all            — every lane; INTERNAL union for the divergence guard
//                           and `test:coverage` only — no `test:all` script exists
//
// #864 — every lane except `all` is fail-closed against a 10-minute wall-time
// ceiling (run-tests-ceiling.mjs): a section over budget exits non-zero so it
// cannot silently regrow; the overage goes to #945, the ceiling is never relaxed.
//
// Discovery and lane assignment come from the canonical modules
// (`discoverTestFiles` #872 + `laneManifest` #873) via `run-tests-lanes.mjs`;
// there is no hardcoded directory list here. A divergence guard fails the run if
// the complete lane union ever omits an on-disk `*.test.mjs`, proving that the
// union accounts for every discovered committed test file. The selected lane
// still executes only its own slice (the 624-vs-652 false green cannot recur).
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_FILE_TIMEOUT_MS } from './task-tracker/lib/process-timeouts.mjs';
import {
  poolConcurrency,
  slowPoolConcurrency,
  subprocessPoolConcurrency,
  spawnTestChild,
} from './run-tests-pool.mjs';
import { partitionTestEntries, runTestPhases } from './run-tests-schedule.mjs';
import {
  findMainWorktreePath,
  fleetRegistryPath,
  readFleet,
} from './task-tracker/fleet-registry.mjs';
import {
  describeSpawnResult,
  findFleetLeaks,
  formatFleetLeak,
  RUN_TESTS_MAX_BUFFER,
} from './run-tests-report.mjs';
import { TEST_NO_RETRY_ENV } from './gh/lib/with-retry.mjs';
import { RUN_LANES, SKIP, laneFiles, discoveryDivergence } from './run-tests-lanes.mjs';
import { evaluateSections, formatSectionSummary } from './run-tests-ceiling.mjs';
import { wantsHelp, emitSelfDoc } from './lib/self-doc.mjs';
import {
  parseInProcessDurationMs,
  formatPassLine,
  buildTimingReport,
  formatTimingReport,
  serializeArtifact,
} from './run-tests-timing.mjs';

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('run-tests');
  process.exit(0);
}

const __dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dir, '..');

// ---- arg parsing ---------------------------------------------------------
const VALID_LANES = new Set(RUN_LANES);
let lane = 'fast';
// #861 — opt-in slow-test report. The per-file timing dataset and JSON artifact
// are ALWAYS produced; this flag (or AITM_TEST_TIMING=1) only controls whether
// the human-readable top-N/Pareto/slow-bucket report is printed at the end.
let timingReport = process.env.AITM_TEST_TIMING === '1';
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--lane') {
    lane = process.argv[++i];
  } else if (a.startsWith('--lane=')) {
    lane = a.slice('--lane='.length);
  } else if (a === '--timing-report') {
    timingReport = true;
  } else {
    console.error(`run-tests: unknown argument: ${a}`);
    process.exit(2);
  }
}
if (!VALID_LANES.has(lane)) {
  console.error(`run-tests: --lane must be one of ${RUN_LANES.join('|')} (got: ${lane})`);
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

function registeredWorktreePaths() {
  try {
    const output = execFileSync('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain', '-z'], {
      encoding: 'utf8',
    });
    return new Set(
      output
        .split('\0')
        .filter((field) => field.startsWith('worktree '))
        .map((field) => field.slice('worktree '.length))
    );
  } catch {
    return new Set();
  }
}

let failed = 0;
const failures = [];
// #861 — one timing record per executed file, keyed later by repo-relative path.
const timingRecords = [];

// #863 — run ONE file: async `spawn` shaped into a spawnSync-style result, timed
// here so run-tests-pool.mjs stays a generic scheduler. env/timeout/maxBuffer are
// the runner's policy — #531 AC1 (TEST_NO_RETRY_ENV) + AC2 (RUN_TESTS_MAX_BUFFER)
// carry forward unchanged into every child, serial or pooled.
async function runEntry(entry) {
  const t0 = process.hrtime.bigint();
  const env = { ...process.env, [TEST_NO_RETRY_ENV]: '1' };
  if (process.env.AITM_GH_CENSUS_BIN) env.AITM_GH_CENSUS_CALLER = entry.label;
  const res = await spawnTestChild({
    full: entry.full,
    timeout: TEST_FILE_TIMEOUT_MS,
    maxBuffer: RUN_TESTS_MAX_BUFFER,
    env,
  });
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  return { res, elapsedMs };
}

// #863/#1208 — pure unit files run at the bounded `cpus - 1` pool. Direct
// subprocess users must not overlap that saturated pool (the historic child
// starvation flake), but can overlap each other at the fixed reduced cap after
// the pure barrier. Explicit unsafe/unreadable files remain exclusive serial,
// alongside integration and unmarked slow files. Slow concurrency is a
// separate explicit opt-in; unit describes behavior while scheduling classes
// describe safe execution mechanics.
// Output is emitted in INPUT order below, so the log stays deterministic
// regardless of which child finishes first.
const CONCURRENCY = poolConcurrency();
const SUBPROCESS_CONCURRENCY = subprocessPoolConcurrency();
const SLOW_CONCURRENCY = slowPoolConcurrency();
const runnable = files.filter((e) => !SKIP.has(e.label));
const { pooledEntries, subprocessEntries, slowParallelEntries, serialEntries } =
  partitionTestEntries(runnable);

// The aggregate remains useful observational timing, while #1157 evaluates the
// already-distinct pool and serial execution phases as independently bounded
// sections below.
const sectionStart = process.hrtime.bigint();

const {
  pooledResults,
  subprocessResults,
  slowParallelResults,
  serialResults,
  pooledPeakConcurrency,
  subprocessPeakConcurrency,
  slowParallelPeakConcurrency,
  pooledElapsedMs,
  subprocessElapsedMs,
  slowParallelElapsedMs,
  serialElapsedMs,
} = await runTestPhases({
  pooledEntries,
  subprocessEntries,
  slowParallelEntries,
  serialEntries,
  pooledConcurrency: CONCURRENCY,
  subprocessConcurrency: SUBPROCESS_CONCURRENCY,
  slowParallelConcurrency: SLOW_CONCURRENCY,
  runOne: runEntry,
});

const sectionElapsedMs = Number(process.hrtime.bigint() - sectionStart) / 1e6;

// Stitch results back onto their entries so emission can walk `files` in INPUT
// order (#863 AC6 — deterministic output independent of completion order).
const resultByLabel = new Map();
pooledEntries.forEach((e, i) => resultByLabel.set(e.label, pooledResults[i]));
subprocessEntries.forEach((e, i) => resultByLabel.set(e.label, subprocessResults[i]));
slowParallelEntries.forEach((e, i) => resultByLabel.set(e.label, slowParallelResults[i]));
serialEntries.forEach((e, i) => resultByLabel.set(e.label, serialResults[i]));

for (const entry of files) {
  const { label, full } = entry;
  if (SKIP.has(label)) {
    console.log(`▶ ${label} ... SKIP (${SKIP.get(label)})`);
    continue;
  }
  const { res, elapsedMs } = resultByLabel.get(label);
  // #861 — in-process test time comes from node:test's own duration line, so
  // spawn/IO overhead = wall − in-process. Null when the child printed none.
  const inProcMs = parseInProcessDurationMs(res.stdout);
  timingRecords.push({
    file: path.relative(repoRoot, full),
    label,
    wallMs: elapsedMs,
    inProcMs,
    status: res.status,
  });
  if (res.status === 0) {
    // #861 — the pass path surfaces per-file elapsed time (`ok (1.7s)`), so a
    // green run is a timing dataset instead of a wall of bare `ok`s.
    console.log(`▶ ${label} ... ${formatPassLine(elapsedMs)}`);
  } else {
    failed++;
    failures.push({ file: label, stdout: res.stdout, stderr: res.stderr, status: res.status });
    // #531 AC2 — never print a bare `(exit null)`; name the real kill cause.
    console.log(
      `▶ ${label} ... ` +
        describeSpawnResult({
          status: res.status,
          signal: res.signal,
          error: res.error,
          elapsedMs: Math.round(elapsedMs),
        })
    );
  }
}

if (pooledEntries.length || subprocessEntries.length || slowParallelEntries.length) {
  console.log(
    `\n▶ scheduling: ${pooledEntries.length} pure unit file(s) at pool concurrency ${CONCURRENCY} (peak ${pooledPeakConcurrency}); ` +
      `${subprocessEntries.length} direct-subprocess file(s) at pool concurrency ${SUBPROCESS_CONCURRENCY} (peak ${subprocessPeakConcurrency}); ` +
      `${slowParallelEntries.length} explicit-safe slow file(s) at pool concurrency ${SLOW_CONCURRENCY} (peak ${slowParallelPeakConcurrency}); ` +
      `${serialEntries.length} explicit-unsafe/integration/unmarked-slow file(s) serial`
  );
}

// #861 — always persist the machine-readable timing artifact, keyed by
// repo-relative file path, so two runs can be diffed rather than eyeballed. The
// artifact is gitignored; the write must never fail the run.
const TIMING_ARTIFACT_PATH = path.resolve(repoRoot, '.tmp', 'aitm', 'test-timing.json');
function writeTimingArtifact() {
  try {
    const artifact = serializeArtifact(timingRecords, {
      lane,
      generatedAt: new Date().toISOString(),
      runnerElapsedMs: sectionElapsedMs,
      poolElapsedMs: pooledElapsedMs,
      subprocessPoolElapsedMs: subprocessElapsedMs,
      slowPoolElapsedMs: slowParallelElapsedMs,
      serialElapsedMs,
    });
    mkdirSync(path.dirname(TIMING_ARTIFACT_PATH), { recursive: true });
    writeFileSync(TIMING_ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  } catch (err) {
    console.error(`run-tests: could not write timing artifact: ${err.message}`);
  }
}
writeTimingArtifact();

if (timingReport) {
  console.log(
    `\n${formatTimingReport(
      buildTimingReport(timingRecords, {
        runnerElapsedMs: sectionElapsedMs,
        poolElapsedMs: pooledElapsedMs,
        subprocessPoolElapsedMs: subprocessElapsedMs,
        slowPoolElapsedMs: slowParallelElapsedMs,
        serialElapsedMs,
      })
    )}`
  );
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

let liveFleet = {};
try {
  liveFleet = readFleet(fleetRegistryPath(findMainWorktreePath(repoRoot))) || {};
} catch {
  liveFleet = {};
}
const leaked = findFleetLeaks({
  keysBefore: registryKeysBefore,
  fleetAfter: liveFleet,
  registeredWorktreePaths: registeredWorktreePaths(),
});
if (leaked.length) {
  // #746 — dump each leaked entry's full record (worktreePath / sessionId /
  // kind / branch), not just the key, so the CI log names the exact escaping
  // sandbox.
  console.error(formatFleetLeak(leaked, liveFleet));
  process.exit(1);
}

// #864/#1157 — fail closed per non-empty execution section. The pooled and
// serial phases are already separate scheduling boundaries and now receive the
// unchanged 10-minute budget independently; their aggregate remains timing
// evidence, not a third ceiling. Single-phase lanes retain one verdict, and
// `all` (the internal coverage/divergence union) remains exempt.
const sectionCeilings = evaluateSections({
  lane,
  sections: [
    { name: 'pooled', count: pooledEntries.length, elapsedMs: pooledElapsedMs },
    {
      name: 'subprocess',
      count: subprocessEntries.length,
      elapsedMs: subprocessElapsedMs,
    },
    {
      name: 'slow-parallel',
      count: slowParallelEntries.length,
      elapsedMs: slowParallelElapsedMs,
    },
    { name: 'serial', count: serialEntries.length, elapsedMs: serialElapsedMs },
  ],
});
console.log(`\n${formatSectionSummary(sectionCeilings)}`);
if (sectionCeilings.breached) {
  for (const section of sectionCeilings.sections.filter((entry) => entry.breached)) {
    console.error(`\n${section.message}`);
  }
  process.exit(1);
}

console.log(`\nAll ${files.length} test files passed.`);
