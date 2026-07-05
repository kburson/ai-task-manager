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
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import {
  isPausedTask,
  isTerminalIssueState,
  fetchIssueState,
  claimRecoveryOnce,
} from '../../hook-handler.mjs';

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
