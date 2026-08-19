#!/usr/bin/env node
// @story #189
// Unit tests for isPausedTask in scripts/task-tracker/hook-handler.mjs.
//
// Regression coverage for #189: SessionStart hook used to interpret any
// (!active && lastActive) state as "paused", which falsely flagged
// closed-and-deregistered tasks. The hook now consults the fleet registry
// via this pure helper.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  isPausedTask,
  isTerminalIssueState,
  fetchIssueState,
  claimRecoveryOnce,
  buildOrphanRecoveryRowSpecs,
} from '../../../../task-tracker/hook-handler.mjs';
import { SUSPICIOUS_GAP_SEC } from '../../../../task-tracker/lib/bind-event.mjs';

const hookIdempotency = await import(
  '../../../../task-tracker/lib/hook-idempotency.mjs'
).catch(() => null);
assert.ok(hookIdempotency, 'hook idempotency module must exist');
const { claimHookStamp, hookStampKey } = hookIdempotency;

test('hookStampKey hashes the complete normalized identity without exposing the sid', () => {
  const key = hookStampKey({
    sid: 'secret/grok-sid',
    hookEventName: 'SessionStart',
    promptId: 'prompt-1',
    eventTimestamp: '2026-08-19T05:00:00.000Z',
  });
  assert.match(key, /^hook-event-[a-f0-9]{64}\.stamp$/);
  assert.doesNotMatch(key, /secret|grok|sid/);
});

test('claimHookStamp deduplicates exact identities and anchors sibling worktrees together', () => {
  const repo = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-hook-stamp-repo-'));
  const sibling = `${repo}-sibling`;
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'AITM Test'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'aitm@example.invalid'], { cwd: repo });
    execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'baseline'], { cwd: repo });
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'sibling', sibling], { cwd: repo });
    const identity = {
      sid: 'grok-sid',
      hookEventName: 'SessionStart',
      promptId: 'prompt-1',
      eventTimestamp: '2026-08-19T05:00:00.000Z',
    };
    const first = claimHookStamp({ projectDir: repo, ...identity });
    const duplicate = claimHookStamp({ projectDir: sibling, ...identity });
    const laterTimestamp = claimHookStamp({
      projectDir: sibling,
      ...identity,
      eventTimestamp: '2026-08-19T05:00:01.000Z',
    });
    const preCompact = claimHookStamp({
      projectDir: sibling,
      ...identity,
      hookEventName: 'PreCompact',
    });
    assert.equal(first.claimed, true);
    assert.equal(duplicate.claimed, false);
    assert.equal(laterTimestamp.claimed, true);
    assert.equal(preCompact.claimed, true);
    assert.equal(path.dirname(first.stampPath), path.dirname(duplicate.stampPath));
    assert.notEqual(first.stampPath, preCompact.stampPath);
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', sibling], { cwd: repo });
    } catch {
      /* best-effort fixture cleanup */
    }
    rmSync(repo, { recursive: true, force: true });
    rmSync(sibling, { recursive: true, force: true });
  }
});

test('claimHookStamp propagates non-EEXIST write errors', () => {
  const projectDir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-hook-stamp-error-'));
  assert.throws(
    () =>
      claimHookStamp({
        projectDir,
        sid: 'grok-sid',
        hookEventName: 'SessionStart',
        promptId: 'prompt-1',
        eventTimestamp: '2026-08-19T05:00:00.000Z',
        openFile: () => {
          const error = new Error('synthetic stamp failure');
          error.code = 'EACCES';
          throw error;
        },
      }),
    /synthetic stamp failure/
  );
  rmSync(projectDir, { recursive: true, force: true });
});

test('isPausedTask: returns true when entry status is "paused"', () => {
  const fleet = { '#167': { status: 'paused' } };
  assert.equal(isPausedTask(fleet, '#167'), true);
});

test('isPausedTask: returns false when entry status is "active"', () => {
  const fleet = { '#167': { status: 'active' } };
  assert.equal(isPausedTask(fleet, '#167'), false);
});

test('isPausedTask: returns false when entry status is "done"', () => {
  const fleet = { '#167': { status: 'done' } };
  assert.equal(isPausedTask(fleet, '#167'), false);
});

test('isPausedTask: returns false when entry is absent (post-close)', () => {
  const fleet = {};
  assert.equal(isPausedTask(fleet, '#167'), false);
});

test('isPausedTask: returns false when lastActive is null', () => {
  const fleet = { '#167': { status: 'paused' } };
  assert.equal(isPausedTask(fleet, null), false);
});

test('isPausedTask: returns false when lastActive is undefined', () => {
  const fleet = { '#167': { status: 'paused' } };
  assert.equal(isPausedTask(fleet, undefined), false);
});

test('isPausedTask: returns false when fleet is null', () => {
  assert.equal(isPausedTask(null, '#167'), false);
});

test('isPausedTask: returns false when entry has no status field', () => {
  const fleet = { '#167': {} };
  assert.equal(isPausedTask(fleet, '#167'), false);
});

// ---------------------------------------------------------------------------
// #709 — terminal-state guard: the SessionStart recovery branch must not rebind
// the timer to an issue that already reached a terminal (Done/CLOSED) board
// state, and the recovery post must be idempotent per session.
// ---------------------------------------------------------------------------

test('isTerminalIssueState: true for CLOSED (case-insensitive, padded)', () => {
  assert.equal(isTerminalIssueState('CLOSED'), true);
  assert.equal(isTerminalIssueState('closed'), true);
  assert.equal(isTerminalIssueState('  Closed  '), true);
});

test('isTerminalIssueState: false for OPEN and unknown/nullish (fail-open)', () => {
  assert.equal(isTerminalIssueState('OPEN'), false);
  assert.equal(isTerminalIssueState('open'), false);
  assert.equal(isTerminalIssueState(''), false);
  assert.equal(isTerminalIssueState(null), false);
  assert.equal(isTerminalIssueState(undefined), false);
  assert.equal(isTerminalIssueState('MERGED'), false);
});

test('fetchIssueState: returns trimmed state from injected runner', async () => {
  const run = async () => ({ stdout: 'CLOSED\n' });
  const state = await fetchIssueState(709, { repo: 'o/r', timeoutMs: 5000, run });
  assert.equal(state, 'CLOSED');
});

test('fetchIssueState: returns null on runner error (offline fail-open)', async () => {
  const run = async () => {
    throw new Error('gh: network unreachable');
  };
  const state = await fetchIssueState(709, { repo: 'o/r', timeoutMs: 5000, run });
  assert.equal(state, null);
});

test('fetchIssueState: returns null for non-numeric / missing active ref', async () => {
  let called = false;
  const run = async () => {
    called = true;
    return { stdout: 'OPEN' };
  };
  assert.equal(await fetchIssueState('discover', { run }), null);
  assert.equal(await fetchIssueState(null, { run }), null);
  assert.equal(await fetchIssueState(undefined, { run }), null);
  assert.equal(called, false, 'runner must not be invoked for a non-issue ref');
});

test('fetchIssueState: returns null when runner yields empty stdout', async () => {
  const run = async () => ({ stdout: '   \n' });
  assert.equal(await fetchIssueState(709, { repo: 'o/r', run }), null);
});

test('claimRecoveryOnce: first call wins, second call for same path loses', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-recovery-'));
  const lock = path.join(dir, 'recovery.lock');
  assert.equal(claimRecoveryOnce(lock), true, 'first claim should win');
  assert.equal(claimRecoveryOnce(lock), false, 'second claim should lose');
});

test('claimRecoveryOnce: a fresh path in the same dir wins independently', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-recovery-'));
  assert.equal(claimRecoveryOnce(path.join(dir, 'a.lock')), true);
  assert.equal(claimRecoveryOnce(path.join(dir, 'b.lock')), true);
});

// #983 — background-agent termination leaves an open Develop span; recovery
// must not credit a suspiciously large gap as active time (the #899 shape).
test('buildOrphanRecoveryRowSpecs: below threshold posts a single active session-end-recovery row', () => {
  const specs = buildOrphanRecoveryRowSpecs({
    wallMin: 30,
    wordMarker: 42,
    fullWordMarker: 84,
  });
  assert.equal(specs.length, 1);
  assert.equal(specs[0].event, 'session-end-recovery');
  assert.equal(specs[0].activeMin, 30);
  assert.equal(specs[0].idleMin, 0);
  assert.equal(specs[0].wordMarker, 42);
  assert.equal(specs[0].fullWordMarker, 84);
});

test('buildOrphanRecoveryRowSpecs: at the threshold still posts the active row (boundary is exclusive)', () => {
  const wallMin = SUSPICIOUS_GAP_SEC / 60;
  const specs = buildOrphanRecoveryRowSpecs({ wallMin, wordMarker: 1 });
  assert.equal(specs.length, 1);
  assert.equal(specs[0].event, 'session-end-recovery');
  assert.equal(specs[0].activeMin, wallMin);
});

test('buildOrphanRecoveryRowSpecs: above threshold posts an honest pause/resumed pair, no fabricated active time', () => {
  const wallMin = SUSPICIOUS_GAP_SEC / 60 + 10; // ~8h10m — the #899 shape
  const specs = buildOrphanRecoveryRowSpecs({ wallMin, wordMarker: 7, fullWordMarker: 14 });
  assert.equal(specs.length, 2);
  assert.equal(specs[0].event, 'pause:orphan-recovery');
  assert.equal(specs[0].activeMin, 0);
  assert.equal(specs[0].idleMin, wallMin);
  assert.equal(specs[0].wordMarker, 7);
  assert.equal(specs[0].fullWordMarker, 14);
  assert.equal(specs[1].event, 'resumed');
  assert.equal(specs[1].activeMin, 0);
  assert.equal(specs[1].idleMin, 0);
  assert.equal(specs[1].wordMarker, 7);
  assert.equal(specs[1].fullWordMarker, 14);
});
