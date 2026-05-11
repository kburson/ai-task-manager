#!/usr/bin/env node
// Tests for scripts/task-tracker/agent-guard.mjs — the PreToolUse hook that
// refuses `Agent` tool spawns from the main git worktree.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const guardScript = fileURLToPath(new URL('../agent-guard.mjs', import.meta.url));

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
  // realpath to neutralize macOS /tmp -> /private/tmp symlink
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aitm-agent-guard-')));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  writeFileSync(join(root, 'README.md'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}

test('blocks when cwd === main worktree', () => {
  const main = makeRepo();
  try {
    const r = runGuard({ cwd: main, stdin: JSON.stringify({ tool_input: {} }) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.length > 0, `expected JSON decision on stdout, got empty`);
    const decision = JSON.parse(r.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /Agent tool spawns are forbidden in the main worktree/);
    assert.ok(decision.reason.includes(`cwd=${main}`), `reason missing cwd path: ${decision.reason}`);
    assert.ok(decision.reason.includes(`main=${main}`), `reason missing main path: ${decision.reason}`);
    assert.match(decision.reason, /No override exists/);
  } finally {
    rmSync(main, { recursive: true, force: true });
  }
});

test('passes when cwd is a linked worktree (cwd !== main)', () => {
  const main = makeRepo();
  const linked = join(main, '..', `agent-guard-linked-${Date.now()}`);
  try {
    git(main, 'worktree', 'add', '-b', 'feature-branch', linked);
    const r = runGuard({ cwd: linked, stdin: JSON.stringify({ tool_input: {} }) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout, '', `expected empty stdout in linked worktree, got: ${r.stdout}`);
  } finally {
    try { git(main, 'worktree', 'remove', '--force', linked); } catch {}
    rmSync(main, { recursive: true, force: true });
    rmSync(linked, { recursive: true, force: true });
  }
});

test('safe-passes on malformed stdin (does not block)', () => {
  const main = makeRepo();
  // Use a linked worktree so a malformed payload doesn't get auto-blocked
  // by the main-worktree rule. Malformed-stdin behavior is "exit 0, no
  // output" regardless of cwd, but we assert it specifically here.
  const linked = join(main, '..', `agent-guard-malformed-${Date.now()}`);
  try {
    git(main, 'worktree', 'add', '-b', 'malformed-branch', linked);
    const r = runGuard({ cwd: linked, stdin: 'not-json{{{' });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout, '', `malformed stdin must not produce a decision, got: ${r.stdout}`);
  } finally {
    try { git(main, 'worktree', 'remove', '--force', linked); } catch {}
    rmSync(main, { recursive: true, force: true });
    rmSync(linked, { recursive: true, force: true });
  }
});
