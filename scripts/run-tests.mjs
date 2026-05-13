#!/usr/bin/env node
// Carve-out: uses spawnSync (not execFileSync) because the test runner needs non-throwing exit-code introspection to accumulate failures across files (see #22).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_RUNNER_TIMEOUT_MS } from './task-tracker/lib/process-timeouts.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dir, '..');
const testsDir = path.resolve(__dir, 'task-tracker', 'tests');
const integrationDir = path.resolve(repoRoot, 'tests', 'integration');
// Tests skipped due to unrelated tracked bugs. Each entry must reference an issue.
const SKIP = new Map([]);

function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const unitFiles = readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => ({ label: f, full: path.join(testsDir, f) }));
const integrationFiles = safeReaddir(integrationDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => ({ label: `integration/${f}`, full: path.join(integrationDir, f) }));
const files = [...unitFiles, ...integrationFiles];

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
