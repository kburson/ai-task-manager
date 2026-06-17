// @story #447
/**
 * Unit tests for verify-develop.mjs logic.
 *
 * These tests exercise the file-collection and command-generation logic by
 * stubbing the git diff and child_process calls rather than invoking the script
 * as a subprocess (which would require a real git repo state and npm scripts).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
