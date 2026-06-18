#!/usr/bin/env node
/**
 * Develop-phase verification: lint-first auto-fix, then targeted test execution.
 *
 * Replaces ad-hoc `npm run test:all` during Develop. Full regression (test:all)
 * runs exclusively at the Test stage.
 *
 * Steps:
 *  1. `npm run lint:js -- --fix` — auto-fix eslint violations; abort if unfixable
 *  2. `npm run format`           — prettier auto-format
 *  3. Collect *.test.mjs files changed vs HEAD via git diff
 *  4. `node --test <file>` for each; abort on first failure
 *
 * Exit codes: 0 = pass, 1 = lint/format/test failure
 */

import { execSync, spawnSync } from 'node:child_process';
import { findUnitTests } from './find-unit-tests.mjs';

function run(cmd, args = [], { label = cmd, allowFailure = false } = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    console.error(`\nverify-develop: "${label}" failed (exit ${result.status})`);
    process.exit(1);
  }
  return result.status;
}

// Step 1: Lint auto-fix
console.log('verify-develop: step 1 — lint:js --fix');
run('npm', ['run', 'lint:js', '--', '--fix'], { label: 'npm run lint:js -- --fix' });

// Step 2: Format
console.log('verify-develop: step 2 — format');
run('npm', ['run', 'format'], { label: 'npm run format' });

// Step 3: Collect changed files (working tree vs HEAD)
console.log('verify-develop: step 3 — collecting changed files');
let rawTests = '';
let rawSources = '';
try {
  rawTests = execSync("git diff --diff-filter=ACMR --name-only HEAD -- '*.test.mjs'", {
    encoding: 'utf8',
    shell: true,
  });
  rawSources = execSync("git diff --diff-filter=ACMR --name-only HEAD -- '*.mjs' ':!*.test.mjs'", {
    encoding: 'utf8',
    shell: true,
  });
} catch {
  console.error('verify-develop: git diff failed');
  process.exit(1);
}

const testFiles = rawTests
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean);

const sourceFiles = rawSources
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean);

// Step 3b: Discover unit tests for changed source files (C2 of #431)
const discoveredTests = findUnitTests(sourceFiles);
if (discoveredTests.length > 0) {
  console.log(
    `verify-develop: step 3b — discovered ${discoveredTests.length} unit test(s) from source changes`
  );
}

const allTestFiles = [...new Set([...testFiles, ...discoveredTests])];

if (allTestFiles.length === 0) {
  console.log('verify-develop: nothing to verify (no test files changed vs HEAD)');
  process.exit(0);
}

console.log(`verify-develop: step 4 — running ${allTestFiles.length} test file(s)`);

// Step 4: Run each test file
for (const file of allTestFiles) {
  console.log(`  node --test ${file}`);
  run('node', ['--test', file], { label: `node --test ${file}` });
}

console.log('verify-develop: all checks passed');
