#!/usr/bin/env node
// @story #332
// Regression tests for projectDirForState (#332).
//
// Worktrees rooted under `<main>/.claude/worktrees/<wt>/` produce paths that
// contain TWO `/.claude/` segments. Pre-#332 the helper used `indexOf` and
// returned the OUTER (`<main>`) anchor, contaminating worktree session state
// into the main checkout. The fix swaps to `lastIndexOf` so the rightmost
// anchor (closest to the state file) wins — that is always the correct
// project root for the state file at hand.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { projectDirForState } from '../../state.mjs';

// AC1 + AC2 case (a): main checkout, modern path.
test('projectDirForState: main checkout, modern .ai-task-manager path', () => {
  const sp = '/Users/alice/projects/repo/.ai-task-manager/task-tracker-state.json';
  assert.equal(projectDirForState(sp), '/Users/alice/projects/repo');
});

// AC1 + AC2 case (b): worktree under .claude/worktrees/, modern path.
test('projectDirForState: worktree, modern .ai-task-manager path', () => {
  const sp =
    '/Users/alice/projects/repo/.claude/worktrees/agent-abc/.ai-task-manager/task-tracker-state.json';
  assert.equal(projectDirForState(sp), '/Users/alice/projects/repo/.claude/worktrees/agent-abc');
});

// AC1 + AC2 case (c): worktree under .claude/worktrees/, legacy .claude path.
// This is the regression case — pre-fix returned the main checkout root.
test('projectDirForState: worktree, legacy .claude path (regression #332)', () => {
  const sp =
    '/Users/alice/projects/repo/.claude/worktrees/agent-abc/.claude/task-tracker-state.json';
  assert.equal(projectDirForState(sp), '/Users/alice/projects/repo/.claude/worktrees/agent-abc');
});

// AC2 (nested subdir under the worktree resolves to the same worktree root).
test('projectDirForState: nested subdir inside worktree resolves to worktree root', () => {
  const sp =
    '/Users/alice/projects/repo/.claude/worktrees/agent-abc/.ai-task-manager/sessions/sid-xyz/active-task.json';
  assert.equal(projectDirForState(sp), '/Users/alice/projects/repo/.claude/worktrees/agent-abc');
});

// AC1: legacy .claude path under main checkout still resolves to main.
test('projectDirForState: main checkout, legacy .claude path', () => {
  const sp = '/Users/alice/projects/repo/.claude/task-tracker-state.json';
  assert.equal(projectDirForState(sp), '/Users/alice/projects/repo');
});

// Marker order tiebreaker: when BOTH markers appear, prefer .ai-task-manager.
// (Pathological synthetic shape — guards the loop's marker-order contract.)
test('projectDirForState: prefers .ai-task-manager over .claude when both appear', () => {
  const sp = '/Users/alice/.claude/repo/.ai-task-manager/task-tracker-state.json';
  assert.equal(projectDirForState(sp), '/Users/alice/.claude/repo');
});

// Fallback: a path with neither marker returns the file's parent directory.
test('projectDirForState: fallback to dirname when no marker present', () => {
  const sp = '/Users/alice/random/path/state.json';
  assert.equal(projectDirForState(sp), '/Users/alice/random/path');
});
