#!/usr/bin/env node
// @story #332
// @story #573
// @story #1857
// Nested checkout paths must select the rightmost durable owner. Legacy/config
// paths no longer grant authority, even when their dirname resembles a checkout.
import { strict as assert } from 'node:assert';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  createActivatedUnitRuntimeRoot,
  unitTest as test,
} from '../../../helpers/unit-runtime-root.mjs';
import { projectDirForState } from '../../../../task-tracker/state.mjs';

test('durable state and session records resolve to their physical owner', () => {
  const root = createActivatedUnitRuntimeRoot('state-project-dir-');
  try {
    for (const record of ['state/task-tracker-state.json', 'sessions/sid-xyz/active-task.json']) {
      const file = join(root, '.ai-task-manager/runtime/store', record);
      assert.equal(projectDirForState(file), root);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('nested worktree selects the rightmost durable owner rather than its enclosing root', () => {
  const outer = createActivatedUnitRuntimeRoot('state-project-nested-');
  const inner = join(outer, '.ai-task-manager/runtime/store/.claude/worktrees/agent-abc');
  mkdirSync(join(inner, '.ai-task-manager/runtime/store/state'), { recursive: true });
  try {
    assert.equal(
      projectDirForState(
        join(inner, '.ai-task-manager/runtime/store/state/task-tracker-state.json')
      ),
      inner
    );
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
});

for (const relative of [
  '.ai-task-manager/task-tracker-state.json',
  '.claude/worktrees/agent-abc/.ai-task-manager/task-tracker-state.json',
  '.claude/worktrees/agent-abc/.claude/task-tracker-state.json',
  '.claude/worktrees/agent-abc/.ai-task-manager/sessions/sid-xyz/active-task.json',
  '.tmp/aitm/state/task-tracker-state.json',
  '.claude/worktrees/agent-abc/.tmp/aitm/state/task-tracker-state.json',
  '.tmp/aitm/sessions/sid-xyz/active-task.json',
  '.ai-task-manager/repo/.tmp/aitm/state/task-tracker-state.json',
  '.claude/task-tracker-state.json',
  '.claude/repo/.ai-task-manager/task-tracker-state.json',
  'random/path/state.json',
]) {
  test(`legacy or arbitrary state path cannot grant owner authority: ${relative}`, () => {
    const root = createActivatedUnitRuntimeRoot('state-project-refusal-');
    try {
      assert.throws(() => projectDirForState(join(root, relative)), {
        code: 'RUNTIME_OVERRIDE_UNSAFE',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
