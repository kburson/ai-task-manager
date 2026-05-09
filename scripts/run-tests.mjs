#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.resolve(__dir, 'task-tracker', 'tests');
// Tests skipped due to unrelated tracked bugs. Each entry must reference an issue.
const SKIP = new Map([]);

const files = readdirSync(testsDir).filter(f => f.endsWith('.test.mjs')).sort();

let failed = 0;
const failures = [];
for (const f of files) {
  if (SKIP.has(f)) {
    console.log(`▶ ${f} ... SKIP (${SKIP.get(f)})`);
    continue;
  }
  const full = path.join(testsDir, f);
  process.stdout.write(`▶ ${f} ... `);
  const res = spawnSync('node', [full], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 60000 });
  if (res.status === 0) {
    console.log('ok');
  } else {
    failed++;
    failures.push({ file: f, stdout: res.stdout, stderr: res.stderr, status: res.status });
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
