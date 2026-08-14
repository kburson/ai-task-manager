#!/usr/bin/env node
// @story #440
// #440 — chore-mode bypass in the activity-guard PreToolUse hook.
//
// chore-mode is the sanctioned escape hatch for editing source files when no
// issue can legitimately reach `develop`. By design `chore-mode on` detaches
// the active task, so the guard sees no bound task and the no-active-task
// policy (activity-policy.isAllowed) refuses every WRITE_CODE / COMMIT_CODE.
// Pre-#440 the guard never consulted chore-mode, so the documented hatch was a
// no-op: edits stayed blocked even with chore-mode on. These tests pin the
// fix — with chore-mode ON the guard silently passes WRITE_CODE/COMMIT_CODE;
// with chore-mode OFF (and no active task) the same activity is refused.
//
// Spawns the real hook as a subprocess (mirrors agent-guard.test.mjs) so the
// inline decision flow — not just a pure helper — is exercised end-to-end.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const guardScript = fileURLToPath(
  new URL('../../../../task-tracker/activity-guard.mjs', import.meta.url)
);

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function runGuard({ cwd, stdin }) {
  return spawnSync('node', [guardScript], {
    cwd,
    encoding: 'utf8',
    input: stdin,
    env: { ...process.env, PWD: cwd },
  });
}

function makeRepo() {
  const root = realpathSync(mkdtempSync(join(projectScratchDir('test'), 'aitm-chore-guard-')));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  writeFileSync(join(root, 'README.md'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  mkdirSync(join(root, '.ai-task-manager'), { recursive: true });
  return root;
}

// Writes the global tracker state. `choreActive` toggles the chore-mode record;
// `active` is intentionally omitted so there is no bound task — faithfully
// reproducing chore-mode's detached state (and the no-active-task baseline).
function writeState(root, { choreActive }) {
  // #573: the global ledger lives under `.tmp/aitm/state/`.
  const statePath = join(root, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
  mkdirSync(dirname(statePath), { recursive: true });
  const body = choreActive
    ? {
        choreMode: {
          active: true,
          since: '2026-06-16T00:00:00Z',
          previousIssue: '#440',
          reason: 'test',
        },
      }
    : { choreMode: { active: false, since: null, previousIssue: null, reason: null } };
  writeFileSync(statePath, JSON.stringify(body, null, 2) + '\n', 'utf8');
}

function editPayload(root) {
  return JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: join(root, 'scripts', 'foo.mjs') },
  });
}

function commitPayload() {
  return JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m "chore: bootstrap edit"' },
  });
}

test('chore-mode OFF + no active task → WRITE_CODE edit is refused (baseline)', () => {
  const root = makeRepo();
  try {
    writeState(root, { choreActive: false });
    const r = runGuard({ cwd: root, stdin: editPayload(root) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.length > 0, 'expected a block decision on stdout');
    const decision = JSON.parse(r.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /no active task/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('chore-mode ON → WRITE_CODE edit under scripts/ is allowed (silent pass)', () => {
  const root = makeRepo();
  try {
    writeState(root, { choreActive: true });
    const r = runGuard({ cwd: root, stdin: editPayload(root) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout, '', `expected silent pass under chore-mode, got: ${r.stdout}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('chore-mode OFF + no active task → COMMIT_CODE bash is refused (baseline)', () => {
  const root = makeRepo();
  try {
    writeState(root, { choreActive: false });
    const r = runGuard({ cwd: root, stdin: commitPayload() });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const decision = JSON.parse(r.stdout);
    assert.equal(decision.decision, 'block');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('chore-mode ON → COMMIT_CODE bash is allowed (silent pass)', () => {
  const root = makeRepo();
  try {
    writeState(root, { choreActive: true });
    const r = runGuard({ cwd: root, stdin: commitPayload() });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout, '', `expected silent pass under chore-mode, got: ${r.stdout}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
