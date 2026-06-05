#!/usr/bin/env node
// Carve-out: uses spawnSync (not execFileSync) because the test runner needs non-throwing exit-code introspection to accumulate failures across files (see #22).
//
// Lanes (#305):
//   --lane fast (default) — every *.test.mjs except scripts/task-tracker/tests/slow/
//   --lane slow           — only scripts/task-tracker/tests/slow/
//   --lane all            — both lanes
//
// `scripts/task-tracker/tests/slow/` holds the ~15 files that each take ≥2s.
// The fast lane keeps the develop tight-loop under ~40s; the slow lane and
// `--lane all` are what DoD verification (`npm run test:all`) invokes.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_RUNNER_TIMEOUT_MS } from './task-tracker/lib/process-timeouts.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dir, '..');
const testsDir = path.resolve(__dir, 'task-tracker', 'tests');
const slowDir = path.resolve(testsDir, 'slow');
const providersTestsDir = path.resolve(__dir, 'providers', 'tests');
const integrationDir = path.resolve(repoRoot, 'tests', 'integration');
const ttIntegrationDir = path.resolve(testsDir, 'integration');
// Tests skipped due to unrelated tracked bugs. Each entry must reference an issue.
const SKIP = new Map([]);

// ---- arg parsing ---------------------------------------------------------
const VALID_LANES = new Set(['fast', 'slow', 'all']);
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

function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

// Fast-lane: unit tests excluding the slow/ subdir.
const unitFiles = readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => ({ label: f, full: path.join(testsDir, f) }));
const providerFiles = safeReaddir(providersTestsDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => ({ label: `providers/${f}`, full: path.join(providersTestsDir, f) }));
const integrationFiles = safeReaddir(integrationDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => ({ label: `integration/${f}`, full: path.join(integrationDir, f) }));
const ttIntegrationFiles = safeReaddir(ttIntegrationDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => ({ label: `task-tracker/integration/${f}`, full: path.join(ttIntegrationDir, f) }));
const slowFiles = safeReaddir(slowDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => ({ label: `slow/${f}`, full: path.join(slowDir, f) }));

const fastFiles = [...unitFiles, ...providerFiles, ...integrationFiles, ...ttIntegrationFiles];

const files =
  lane === 'fast' ? fastFiles : lane === 'slow' ? slowFiles : [...fastFiles, ...slowFiles];

console.log(`▶ lane=${lane} (${files.length} files)\n`);

let failed = 0;
const failures = [];
for (const entry of files) {
  const { label, full } = entry;
  if (SKIP.has(label)) {
    console.log(`▶ ${label} ... SKIP (${SKIP.get(label)})`);
    continue;
  }
  process.stdout.write(`▶ ${label} ... `);
  const res = spawnSync('node', [full], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: TEST_RUNNER_TIMEOUT_MS,
  });
  if (res.status === 0) {
    console.log('ok');
  } else {
    failed++;
    failures.push({ file: label, stdout: res.stdout, stderr: res.stderr, status: res.status });
    console.log(`FAIL (exit ${res.status})`);
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

console.log(`\nAll ${files.length} test files passed.`);
