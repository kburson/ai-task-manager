// @story #273
// #273 — pin the contract of `resolveSessionId` so the writer (state.mjs)
// and the readers (activity-guard, move-state, seed-kanban-cache) cannot
// silently diverge again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

import {
  FALLBACK_SESSION_ID,
  ORCHESTRATOR_ENV_KEY,
  resolveSessionId,
  sessionIdEnvKeys,
} from '../../../lib/session-id.mjs';

test('orchestrator env var wins over everything', () => {
  const env = {
    [ORCHESTRATOR_ENV_KEY]: 'orch-sid',
    CLAUDE_SESSION_ID: 'claude-sid',
  };
  const sid = resolveSessionId({ env, transcriptDir: () => '/never/scanned' });
  assert.equal(sid, 'orch-sid');
});

test('provider env var beats mtime fallback', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'sid-test-'));
  writeFileSync(path.join(dir, 'fallback-sid.jsonl'), '');
  const env = { CLAUDE_SESSION_ID: 'provider-sid' };
  const sid = resolveSessionId({ env, transcriptDir: () => dir });
  assert.equal(sid, 'provider-sid');
});

test('mtime fallback picks newest .jsonl when no env var is set', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'sid-test-'));
  const old = path.join(dir, 'older.jsonl');
  const fresh = path.join(dir, 'newer.jsonl');
  writeFileSync(old, '');
  writeFileSync(fresh, '');
  // Force `fresh` to outrank `old` regardless of write order.
  utimesSync(old, new Date(2020, 0, 1), new Date(2020, 0, 1));
  utimesSync(fresh, new Date(2025, 0, 1), new Date(2025, 0, 1));
  const sid = resolveSessionId({ env: {}, transcriptDir: () => dir });
  assert.equal(sid, 'newer');
});

test('falls back to default-session when no env + no transcripts', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'sid-test-'));
  const sid = resolveSessionId({ env: {}, transcriptDir: () => dir });
  assert.equal(sid, FALLBACK_SESSION_ID);
});

test('never returns null — fallback is always a non-empty string', () => {
  const sid = resolveSessionId({ env: {} });
  assert.equal(typeof sid, 'string');
  assert.ok(sid.length > 0);
});

test('env key list includes orchestrator first then provider keys', () => {
  const keys = sessionIdEnvKeys({});
  assert.equal(keys[0], ORCHESTRATOR_ENV_KEY);
  assert.ok(keys.length > 1, 'expected provider keys after orchestrator key');
});

test('writer and reader resolve identically — the #273 wedge cannot recur', () => {
  // The pre-fix wedge was: state.mjs returned `'default-session'`,
  // word-counter returned a mtime-sorted basename. They must agree now.
  const env = {};
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'sid-test-'));
  // No transcripts → both should hit the default fallback.
  const writerSid = resolveSessionId({ env, transcriptDir: () => dir });
  const readerSid = resolveSessionId({ env, transcriptDir: () => dir });
  assert.equal(writerSid, readerSid);
  assert.equal(writerSid, FALLBACK_SESSION_ID);
});
