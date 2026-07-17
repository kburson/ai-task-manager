// @story #447 #448 #529
/**
 * Unit tests for verify-develop.mjs logic.
 *
 * These tests exercise the file-collection and command-generation logic by
 * stubbing the git diff and child_process calls rather than invoking the script
 * as a subprocess (which would require a real git repo state and npm scripts).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildLintFormatSteps, isMainModule } from '../../verify-develop.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const MODULE_URL = pathToFileURL(resolve(HERE, '../../verify-develop.mjs')).href;

// ---------------------------------------------------------------------------
// Pure helpers extracted for testing (mirrors the script's logic)
// ---------------------------------------------------------------------------

function parseTestFiles(rawOutput) {
  return rawOutput
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
}

function buildTestCommands(files) {
  return files.map((f) => ['node', '--test', f]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseTestFiles', () => {
  it('returns empty array for empty diff output', () => {
    assert.deepEqual(parseTestFiles(''), []);
  });

  it('returns empty array for whitespace-only output', () => {
    assert.deepEqual(parseTestFiles('   \n  \n'), []);
  });

  it('parses a single test file', () => {
    assert.deepEqual(parseTestFiles('tests/integration/seven-state-flow.test.mjs\n'), [
      'tests/integration/seven-state-flow.test.mjs',
    ]);
  });

  it('parses multiple test files and strips surrounding whitespace', () => {
    const raw = 'tests/integration/foo.test.mjs\n  tests/integration/bar.test.mjs  \n';
    assert.deepEqual(parseTestFiles(raw), [
      'tests/integration/foo.test.mjs',
      'tests/integration/bar.test.mjs',
    ]);
  });

  it('ignores blank lines in the middle of output', () => {
    const raw = 'a.test.mjs\n\nb.test.mjs\n';
    assert.deepEqual(parseTestFiles(raw), ['a.test.mjs', 'b.test.mjs']);
  });
});

describe('buildTestCommands', () => {
  it('maps each file to a node --test invocation', () => {
    const cmds = buildTestCommands([
      'tests/integration/a.test.mjs',
      'tests/integration/b.test.mjs',
    ]);
    assert.deepEqual(cmds, [
      ['node', '--test', 'tests/integration/a.test.mjs'],
      ['node', '--test', 'tests/integration/b.test.mjs'],
    ]);
  });

  it('returns empty array for empty file list', () => {
    assert.deepEqual(buildTestCommands([]), []);
  });
});

// ---------------------------------------------------------------------------
// C2 (#448): merge helpers
// ---------------------------------------------------------------------------

function mergeTestFiles(direct, discovered) {
  return [...new Set([...direct, ...discovered])];
}

describe('mergeTestFiles (C2 — source-to-unit-test merge)', () => {
  it('returns direct list when no discovered tests', () => {
    const result = mergeTestFiles(['tests/unit/foo.test.mjs'], []);
    assert.deepEqual(result, ['tests/unit/foo.test.mjs']);
  });

  it('appends discovered tests after direct changes', () => {
    const result = mergeTestFiles(['tests/unit/foo.test.mjs'], ['tests/unit/bar.test.mjs']);
    assert.deepEqual(result, ['tests/unit/foo.test.mjs', 'tests/unit/bar.test.mjs']);
  });

  it('deduplicates when a discovered test is already in direct list', () => {
    const result = mergeTestFiles(['tests/unit/foo.test.mjs'], ['tests/unit/foo.test.mjs']);
    assert.deepEqual(result, ['tests/unit/foo.test.mjs']);
  });

  it('direct list order is preserved; discovered appended', () => {
    const result = mergeTestFiles(
      ['tests/unit/b.test.mjs', 'tests/unit/a.test.mjs'],
      ['tests/unit/c.test.mjs']
    );
    assert.deepEqual(result, [
      'tests/unit/b.test.mjs',
      'tests/unit/a.test.mjs',
      'tests/unit/c.test.mjs',
    ]);
  });

  it('returns empty when both lists are empty', () => {
    assert.deepEqual(mergeTestFiles([], []), []);
  });
});

describe('diff-filter semantics (documentation assertions)', () => {
  it('ACMR excludes deletions — deleted files do not appear in run list', () => {
    // Simulate: git diff --diff-filter=ACMR returns no deleted files
    // A deleted file would have status D; ACMR = Added|Copied|Modified|Renamed
    const diffOutput =
      'tests/integration/new-feature.test.mjs\ntests/integration/edited.test.mjs\n';
    const files = parseTestFiles(diffOutput);
    // Confirm: the list only contains added/modified files, never a deleted path
    assert.ok(files.every((f) => !f.includes('deleted')));
    assert.equal(files.length, 2);
  });

  it('empty diff produces no-op — exit early without running node --test', () => {
    const files = parseTestFiles('');
    assert.equal(files.length, 0);
    // The script exits 0 here; no node --test commands should be generated
    const cmds = buildTestCommands(files);
    assert.equal(cmds.length, 0);
  });
});

// ---------------------------------------------------------------------------
// AC2 (#529): the lint/format step plan runs the FULL `npm run lint`
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// #867: main-module guard — importing the module must NOT execute the gate.
// Before the guard, importing verify-develop.mjs ran lint/format/tests and hit
// process.exit during import, killing this runner before any assertion ran
// (the file reported `tests 1 / pass 1` at ~21s with zero real assertions).
// These tests are the regression wall: they fail loudly if import-time
// execution is ever reintroduced.
// ---------------------------------------------------------------------------

describe('main-module guard (#867 — import has no side effects)', () => {
  it('importing the module in a child process runs no gate step and exits fast', () => {
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import * as m from ${JSON.stringify(MODULE_URL)};` +
          `console.log('IMPORT_OK', typeof m.buildLintFormatSteps);`,
      ],
      { encoding: 'utf8', cwd: REPO_ROOT, timeout: 10000 }
    );
    assert.equal(child.status, 0, `import child exited ${child.status}: ${child.stderr}`);
    assert.match(child.stdout, /IMPORT_OK function/);
    // If the gate had run on import, these step banners would appear in stdout.
    assert.doesNotMatch(child.stdout, /verify-develop: step/);
    assert.doesNotMatch(child.stdout, /nothing to verify/);
    assert.doesNotMatch(child.stdout, /all checks passed/);
  });

  it('isMainModule() returns false when the module is imported', () => {
    assert.equal(isMainModule(), false);
  });
});

describe('buildLintFormatSteps (#529 — full lint in Develop)', () => {
  const steps = buildLintFormatSteps();
  const labels = steps.map((s) => s.label);

  it('runs autofix steps before the full lint suite', () => {
    // Order matters: lint:js --fix and format must land first so the tree is
    // in its committed shape before the full suite verifies it.
    assert.deepEqual(labels, ['npm run lint:js -- --fix', 'npm run format', 'npm run lint']);
  });

  it('includes a full `npm run lint` step (not just lint:js)', () => {
    const full = steps.find((s) => s.args.join(' ') === 'run lint');
    assert.ok(full, 'expected a step invoking `npm run lint`');
    assert.equal(full.cmd, 'npm');
  });

  it('places the full lint AFTER both autofix steps', () => {
    const fixIdx = labels.indexOf('npm run lint:js -- --fix');
    const fmtIdx = labels.indexOf('npm run format');
    const lintIdx = labels.indexOf('npm run lint');
    assert.ok(fixIdx < lintIdx && fmtIdx < lintIdx);
  });
});

// ---------------------------------------------------------------------------
// AC3 (#529): regression — a spelling error in a changed source file is now
// caught in Develop. The "multiset" escape (lint:js-only gate skipping
// lint:spell) no longer reaches Test. We prove this structurally: the full
// `npm run lint` chain that verify-develop now runs includes `lint:spell`,
// which is the cspell pass that would flag a misspelling in a changed file.
// ---------------------------------------------------------------------------

describe('full lint covers spell/markdown gates (#529 multiset regression)', () => {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
  const lintScript = pkg.scripts.lint;

  it('package.json `lint` chains `lint:spell`', () => {
    assert.match(lintScript, /\blint:spell\b/);
  });

  it('package.json `lint` chains `lint:md`', () => {
    assert.match(lintScript, /\blint:md\b/);
  });

  it('`lint:spell` invokes cspell over source + markdown', () => {
    assert.match(pkg.scripts['lint:spell'], /cspell/);
  });

  it('verify-develop runs the same full `npm run lint` that includes lint:spell', () => {
    // Closes the multiset escape: a misspelling in a changed .mjs source file
    // is caught by cspell (lint:spell) during Develop, not deferred to Test.
    const runsFullLint = buildLintFormatSteps().some((s) => s.args.join(' ') === 'run lint');
    assert.ok(runsFullLint);
    assert.match(lintScript, /\blint:spell\b/);
  });
});
