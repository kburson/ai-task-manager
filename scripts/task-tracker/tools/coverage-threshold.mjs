#!/usr/bin/env node
// @story #651
// Generic coverage-threshold gate, used as an AC verifier.
//
// The verification allowlist (`scripts/task-tracker/lib/verification-allowlist.mjs`)
// forbids every shell post-processing metacharacter — `|`, `>`, `<`, `;`, `&&`,
// `||`, backtick, `$(` — so a c8 *text* report cannot be reduced to a pass/fail
// in a one-line verifier. This Node helper fronts c8 instead: `node <helper>
// <args>` clears the allowlist with no forbidden tokens.
//
// Usage:
//   node scripts/task-tracker/tools/coverage-threshold.mjs <include-glob> <test-file>[,<test-file>...] <threshold>
//
// Runs c8 over <test-file>, restricted to <include-glob>, emitting a
// json-summary into an isolated scratch report dir, then exits 0 iff the target
// file's statements.pct AND lines.pct are both >= <threshold>, else 1. Generic
// by design so every Group-G coverage leaf (#651, #653, ...) reuses it verbatim.
//
// <test-file> accepts a comma-separated list of test files; c8 aggregates the
// V8 dumps from every named file into one summary. A single file (no comma) is
// the common case and behaves identically to the original single-file form —
// the split is used when a target file's coverage is honestly spread across
// several test files (e.g. a verb whose orchestrator + helpers were split to
// stay under the per-file line cap).

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../lib/scratch-dir.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const require = createRequire(import.meta.url);
const c8Bin = path.join(path.dirname(require.resolve('c8/package.json')), 'bin', 'c8.js');

function fail(msg) {
  process.stderr.write(`coverage-threshold: ${msg}\n`);
  process.exit(1);
}

// Split the <test-file> arg into a clean file list. A single file (no comma)
// yields a one-element list → byte-identical to the original single-file
// invocation; a comma list spreads every file into the `node --test` argv so
// c8 merges their coverage. Pure + exported so the parsing branch is unit-tested
// without spawning c8.
export function parseTestFiles(arg) {
  return String(arg ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
}

function main() {
  const [includeGlob, testFile, thresholdArg] = process.argv.slice(2);
  if (!includeGlob || !testFile || thresholdArg === undefined) {
    fail('usage: coverage-threshold <include-glob> <test-file>[,<test-file>...] <threshold>');
  }
  const testFiles = parseTestFiles(testFile);
  if (!testFiles.length) fail('no test file(s) provided');
  const threshold = Number(thresholdArg);
  if (!Number.isFinite(threshold)) fail(`threshold must be numeric, got "${thresholdArg}"`);

  const reportDir = mkdtempSync(path.join(projectScratchDir('test'), 'covthr-'));

  const res = spawnSync(
    process.execPath,
    [
      c8Bin,
      '--include',
      includeGlob,
      '--reporter',
      'json-summary',
      '--report-dir',
      reportDir,
      '--temp-directory',
      path.join(reportDir, 'v8-cov'),
      process.execPath,
      '--test',
      ...testFiles,
    ],
    { stdio: 'inherit', cwd: repoRoot }
  );
  if (res.status !== 0) fail(`c8/test run exited ${res.status} — coverage gate not evaluated`);

  const summaryPath = path.join(reportDir, 'coverage-summary.json');
  if (!existsSync(summaryPath)) fail(`no coverage summary written at ${summaryPath}`);
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

  const targetAbs = path.resolve(repoRoot, includeGlob);
  const entry =
    summary[targetAbs] ||
    Object.entries(summary).find(([k]) => k !== 'total' && path.resolve(k) === targetAbs)?.[1];
  if (!entry) fail(`target "${includeGlob}" not present in coverage summary (was it executed?)`);

  const stmt = entry.statements?.pct ?? 0;
  const lines = entry.lines?.pct ?? 0;
  process.stdout.write(
    `coverage-threshold: ${includeGlob} statements=${stmt}% lines=${lines}% (need >=${threshold}%)\n`
  );
  if (stmt + 1e-9 < threshold || lines + 1e-9 < threshold) {
    fail(`below threshold: statements ${stmt}% / lines ${lines}% < ${threshold}%`);
  }
  process.stdout.write('coverage-threshold: PASS\n');
}

// Run the CLI only when invoked directly (`node coverage-threshold.mjs ...`),
// not when imported by a test for `parseTestFiles` — import must be side-effect
// free so it doesn't read argv or call process.exit.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
