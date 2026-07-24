#!/usr/bin/env node
/**
 * Develop-phase verification: lint-first auto-fix, full lint, then targeted
 * test execution.
 *
 * Replaces ad-hoc `npm run test:all` during Develop. Full regression (test:all)
 * runs exclusively at the Test stage.
 *
 * Steps:
 *  1. `npm run lint:js -- --fix` — auto-fix eslint violations; abort if unfixable
 *  2. `npm run format`           — prettier auto-format (tree now in committed shape)
 *  3. `npm run lint`             — full lint suite (lint:js, lint:md, lint:spell, …)
 *                                  so spell/markdown violations fail in Develop,
 *                                  not deferred to Test (#529; closes the
 *                                  "multiset" spell-escape gap)
 *  4. Collect *.test.mjs files changed vs HEAD via git diff, unioned with
 *     never-`git add`-ed *.test.mjs files via `git ls-files --others`
 *  5. `node --test <file>` for each; abort on first failure
 *
 * Exit codes: 0 = pass, 1 = lint/format/test failure
 */

import { execSync, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findUnitTests } from './find-unit-tests.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

/**
 * The ordered lint/format command plan run before tests. Autofix steps
 * (`lint:js --fix`, `format`) land first so the tree is in its committed
 * shape; the final full `npm run lint` then verifies that shape against the
 * complete suite — including `lint:spell` and `lint:md`, which the old
 * `lint:js`-only gate skipped (#529). Exported pure so the command set is
 * unit-testable without spawning npm.
 */
export function buildLintFormatSteps() {
  return [
    { cmd: 'npm', args: ['run', 'lint:js', '--', '--fix'], label: 'npm run lint:js -- --fix' },
    { cmd: 'npm', args: ['run', 'format'], label: 'npm run format' },
    { cmd: 'npm', args: ['run', 'lint'], label: 'npm run lint' },
  ];
}

/**
 * Collects the `*.test.mjs` files verify-develop should run: the tracked diff
 * vs HEAD (`ACMR` — added/copied/modified/renamed) unioned with never-`git
 * add`-ed test files (`git ls-files --others --exclude-standard`, which
 * respects `.gitignore`). Without the untracked union, a brand-new test file
 * that was never staged is invisible to `git diff` and silently skipped
 * (#855). Exported and `cwd`-parameterized so it is unit-testable against a
 * real temp git fixture rather than the live repo.
 */
export function collectTestFiles({ cwd = process.cwd() } = {}) {
  const rawTests = execSync("git diff --diff-filter=ACMR --name-only HEAD -- '*.test.mjs'", {
    encoding: 'utf8',
    shell: true,
    cwd,
  });
  const rawUntrackedTests = execSync("git ls-files --others --exclude-standard -- '*.test.mjs'", {
    encoding: 'utf8',
    shell: true,
    cwd,
  });
  return [
    ...new Set(
      [rawTests, rawUntrackedTests]
        .join('\n')
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean)
    ),
  ];
}

function run(cmd, args = [], { label = cmd, allowFailure = false } = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    console.error(`\nverify-develop: "${label}" failed (exit ${result.status})`);
    process.exit(1);
  }
  return result.status;
}

/**
 * True only when this file is the process entry point (invoked as
 * `node verify-develop.mjs`), false when it is `import`-ed. Guards the gate so
 * importing a pure export (e.g. `buildLintFormatSteps`) never executes lint,
 * format, tests, or `process.exit` as an import side effect (#867). Uses the
 * `argv[1]`/`import.meta.url` realpath compare (portable to Node 18; survives
 * the `node_modules/ai-task-manager` self-symlink this repo relies on) rather
 * than the newer `import.meta.main`.
 */
export function isMainModule() {
  try {
    return (
      Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
    );
  } catch {
    return false;
  }
}

/**
 * The Develop gate. Runs steps 1–4 and exits the process on completion or
 * failure. Only invoked under the main-module guard, never on import.
 */
export function main() {
  if (wantsHelp(process.argv.slice(2))) {
    emitSelfDoc('verify-develop');
    process.exit(0);
  }

  // Steps 1–3: lint:js --fix, format, then full lint suite
  const lintFormatSteps = buildLintFormatSteps();
  lintFormatSteps.forEach((step, i) => {
    console.log(`verify-develop: step ${i + 1} — ${step.label}`);
    run(step.cmd, step.args, { label: step.label });
  });

  // Step 3: Collect changed files (working tree vs HEAD)
  console.log('verify-develop: step 3 — collecting changed files');
  let testFiles = [];
  let rawSources = '';
  try {
    testFiles = collectTestFiles();
    rawSources = execSync(
      "git diff --diff-filter=ACMR --name-only HEAD -- '*.mjs' ':!*.test.mjs'",
      {
        encoding: 'utf8',
        shell: true,
      }
    );
  } catch {
    console.error('verify-develop: git diff failed');
    process.exit(1);
  }

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
}

if (isMainModule()) {
  main();
}
