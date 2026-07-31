#!/usr/bin/env node
// @story #214
// Verb-level per-issue lock — EPIC #207 / #214.
//
// Static-source assertions only (avoid spinning up real GitHub I/O in unit
// tests). Verifies:
//   - State-mutator verbs (promote, approve, reconcile) import withIssueLock
//     and call it.
//   - Read-only verbs (status, list/discover, bind/start) do NOT import the
//     issue-mutator-lock module.
//
// The end-to-end contention guarantee is covered by
// `state-mutator-concurrency.test.mjs`.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const VERBS = path.resolve(__dir, '..', '../verbs');

function read(rel) {
  return readFileSync(path.join(VERBS, rel), 'utf8');
}

// State-mutators: must reference the lock module and wrap their run. Approve
// exposes the lock as an injectable seam before entering its lease scope.
for (const file of ['promote.mjs', 'approve.mjs', 'reconcile.mjs']) {
  const src = read(file);
  assert.match(
    src,
    /from '\.\.\/issue-mutator-lock\.mjs'/,
    `${file} should import from ../issue-mutator-lock.mjs`
  );
  if (file === 'approve.mjs') {
    assert.match(src, /deps\.withIssueLock \|\| withIssueLock/);
    assert.match(src, /lockIssue\s*\(/, `${file} should call the resolved issue lock`);
  } else {
    assert.match(src, /withIssueLock\s*\(/, `${file} should call withIssueLock(...)`);
  }
  assert.match(src, /IssueLockError/, `${file} should handle IssueLockError`);
}

// Read-only verbs: must NOT import the lock module.
for (const file of ['status.mjs', 'discover.mjs', 'start.mjs']) {
  const src = read(file);
  assert.ok(
    !/issue-mutator-lock/.test(src),
    `${file} (read-only) must not import issue-mutator-lock`
  );
}

console.log('verb-locks.test.mjs: all passed');
