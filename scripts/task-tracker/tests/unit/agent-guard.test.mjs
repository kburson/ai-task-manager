#!/usr/bin/env node
// @story #64
// Tests for scripts/task-tracker/agent-guard.mjs — the PreToolUse hook that
// refuses `Agent` tool spawns from the main git worktree.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync, existsSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const guardScript = fileURLToPath(new URL('../../agent-guard.mjs', import.meta.url));

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
  const root = realpathSync(mkdtempSync(join(projectScratchDir('test'), 'aitm-agent-guard-')));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  writeFileSync(join(root, 'README.md'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}

function writeLock(main, body) {
  const dir = join(main, '.ai-task-manager');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'orchestrator.lock'), JSON.stringify(body));
}

test('blocks when cwd === main worktree and no orchestrator lock', () => {
  const main = makeRepo();
  try {
    const r = runGuard({ cwd: main, stdin: JSON.stringify({ tool_input: {} }) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.length > 0, `expected JSON decision on stdout, got empty`);
    const decision = JSON.parse(r.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /No orchestrator lock present/);
    assert.ok(decision.reason.includes(`cwd=${main}`));
    assert.ok(decision.reason.includes(`main=${main}`));
  } finally {
    rmSync(main, { recursive: true, force: true });
  }
});

test('blocks when lock has expired (startedAt + ttlMs < now)', () => {
  const main = makeRepo();
  try {
    writeLock(main, {
      epic: '#13',
      startedAt: '2000-01-01T00:00:00Z',
      ttlMs: 1000,
    });
    const r = runGuard({
      cwd: main,
      stdin: JSON.stringify({ tool_input: { isolation: 'worktree' } }),
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const decision = JSON.parse(r.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /Orchestrator lock expired/);
  } finally {
    rmSync(main, { recursive: true, force: true });
  }
});

test('blocks when lock is held but isolation !== "worktree"', () => {
  const main = makeRepo();
  try {
    writeLock(main, {
      epic: '#13',
      startedAt: new Date().toISOString(),
      ttlMs: 3_600_000,
    });
    const r = runGuard({ cwd: main, stdin: JSON.stringify({ tool_input: {} }) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const decision = JSON.parse(r.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /must set `isolation: "worktree"`/);
  } finally {
    rmSync(main, { recursive: true, force: true });
  }
});

test('passes when lock is fresh and isolation === "worktree"', () => {
  const main = makeRepo();
  try {
    writeLock(main, {
      epic: '#13',
      startedAt: new Date().toISOString(),
      ttlMs: 3_600_000,
    });
    const r = runGuard({
      cwd: main,
      stdin: JSON.stringify({ tool_input: { isolation: 'worktree' } }),
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout, '', `expected silent pass, got: ${r.stdout}`);
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
    try {
      git(main, 'worktree', 'remove', '--force', linked);
    } catch {}
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
    try {
      git(main, 'worktree', 'remove', '--force', linked);
    } catch {}
    rmSync(main, { recursive: true, force: true });
    rmSync(linked, { recursive: true, force: true });
  }
});
