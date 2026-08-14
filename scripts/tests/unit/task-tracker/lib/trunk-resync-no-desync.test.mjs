#!/usr/bin/env node
// @story #908 (epic #912)
// vc:3 — the close attribution ref is resolved so local `trunk` is never mutated
// from a linked worktree (no main-worktree desync).
//
// resolveCloseTrunkRef must return `origin/trunk` when running inside a linked
// worktree — a remote-tracking ref that is never checked out, so reading it can
// never dirty the main worktree — and local `trunk` in the main worktree, while
// always honoring an explicit cfg.trunkRef override.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { resolveCloseTrunkRef } from '../../../../task-tracker/lib/full-auto-merge.mjs';

test('in a linked worktree → origin/trunk (never checked out → no desync)', () => {
  const ref = resolveCloseTrunkRef({ cfg: {}, inWorktree: true });
  assert.equal(ref, 'origin/trunk');
});

test('in the main worktree → local trunk', () => {
  const ref = resolveCloseTrunkRef({ cfg: {}, inWorktree: false });
  assert.equal(ref, 'trunk');
});

test('explicit cfg.trunkRef always wins (worktree)', () => {
  const ref = resolveCloseTrunkRef({ cfg: { trunkRef: 'main' }, inWorktree: true });
  assert.equal(ref, 'main');
});

test('explicit cfg.trunkRef always wins (main worktree)', () => {
  const ref = resolveCloseTrunkRef({ cfg: { trunkRef: 'origin/main' }, inWorktree: false });
  assert.equal(ref, 'origin/main');
});

test('blank cfg.trunkRef is ignored (falls through to worktree default)', () => {
  const ref = resolveCloseTrunkRef({ cfg: { trunkRef: '   ' }, inWorktree: true });
  assert.equal(ref, 'origin/trunk');
});

test('remoteTrunk overrides the origin/trunk default in a worktree', () => {
  const ref = resolveCloseTrunkRef({ cfg: {}, inWorktree: true, remoteTrunk: 'upstream/trunk' });
  assert.equal(ref, 'upstream/trunk');
});

test('remoteTrunk is ignored in the main worktree', () => {
  const ref = resolveCloseTrunkRef({ cfg: {}, inWorktree: false, remoteTrunk: 'upstream/trunk' });
  assert.equal(ref, 'trunk');
});

test('no args → safe main-worktree default (does not throw)', () => {
  assert.equal(resolveCloseTrunkRef(), 'trunk');
});

test('the worktree ref is a remote-tracking ref, so no local branch is touched', () => {
  // Guard the invariant behind the fix: the worktree default must be prefixed by
  // a remote (contains a slash) — a bare local branch name would be the desync bug.
  const ref = resolveCloseTrunkRef({ cfg: {}, inWorktree: true });
  assert.ok(ref.includes('/'), 'worktree trunk ref must be remote-tracking');
});
