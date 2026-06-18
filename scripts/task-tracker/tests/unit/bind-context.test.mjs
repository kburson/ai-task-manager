// @story #449 — assertBoundToIssue guard: missing bind, mismatch, and match cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  assertBoundToIssue,
  BindMissingError,
  BindMismatchError,
} from '../../lib/bind-context.mjs';
import { mkdtempOutsideRepo } from '../../lib/scratch-dir.mjs';

function makeProjectDir(active) {
  const root = mkdtempOutsideRepo('aitm-test-');
  const dir = path.join(root, '.ai-task-manager');
  mkdirSync(dir, { recursive: true });
  const state = active === undefined ? {} : { active };
  writeFileSync(path.join(dir, 'task-tracker-state.json'), JSON.stringify(state));
  return root;
}

test('throws BindMissingError when no active bind in state file', () => {
  const projectDir = makeProjectDir(undefined);
  assert.throws(
    () => assertBoundToIssue(449, { projectDir }),
    (err) => err instanceof BindMissingError && /No active bind/.test(err.message)
  );
});

test('throws BindMissingError when state file is empty object', () => {
  const projectDir = makeProjectDir(null);
  // null active means the file exists but active is not a string
  const dir = path.join(projectDir, '.ai-task-manager');
  writeFileSync(path.join(dir, 'task-tracker-state.json'), JSON.stringify({ active: null }));
  assert.throws(
    () => assertBoundToIssue(449, { projectDir }),
    (err) => err instanceof BindMissingError
  );
});

test('throws BindMismatchError when bound to a different issue', () => {
  const projectDir = makeProjectDir('#450');
  assert.throws(
    () => assertBoundToIssue(449, { projectDir }),
    (err) =>
      err instanceof BindMismatchError &&
      /active is #450/.test(err.message) &&
      /target is #449/.test(err.message)
  );
});

test('does not throw when bound to the matching issue (numeric)', () => {
  const projectDir = makeProjectDir('#449');
  assert.doesNotThrow(() => assertBoundToIssue(449, { projectDir }));
});

test('does not throw when bound to the matching issue (hash-prefixed string)', () => {
  const projectDir = makeProjectDir('#449');
  assert.doesNotThrow(() => assertBoundToIssue('#449', { projectDir }));
});

test('BindMissingError and BindMismatchError are distinct error classes', () => {
  assert.notEqual(BindMissingError, BindMismatchError);
  const m = new BindMissingError('a');
  const mm = new BindMismatchError('b');
  assert.equal(m.name, 'BindMissingError');
  assert.equal(mm.name, 'BindMismatchError');
  assert.ok(m instanceof BindMissingError);
  assert.ok(!(m instanceof BindMismatchError));
});
