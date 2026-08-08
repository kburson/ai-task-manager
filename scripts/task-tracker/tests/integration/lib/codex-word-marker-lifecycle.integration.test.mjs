#!/usr/bin/env node
// @story #1092
import { strict as assert } from 'node:assert';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const THREAD_ID = '019fbe04-test-codex-lifecycle';
const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'codex-word-lifecycle-'));
const projectDir = path.join(tmp, 'project');
const homeDir = path.join(tmp, 'home');
const rolloutDir = path.join(homeDir, '.codex', 'sessions', '2026', '08', '01');
const rolloutPath = path.join(rolloutDir, `rollout-2026-08-01T12-00-00-${THREAD_ID}.jsonl`);

const savedEnv = Object.fromEntries(
  [
    'AI_TASK_MANAGER_PROJECT_DIR',
    'AI_TASK_MANAGER_APP_NAME',
    'CODEX_THREAD_ID',
    'CODEX_SESSION_ID',
    'CLAUDE_SESSION_ID',
    'CLAUDE_CODE_SESSION_ID',
    'HOME',
    'USERPROFILE',
    'TT_SKIP_FIELD_SELF_CHECK',
    'TT_SKIP_NETWORK',
  ].map((key) => [key, process.env[key]])
);

function message(role, text) {
  const type = role === 'user' ? 'input_text' : 'output_text';
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    type: 'response_item',
    payload: { type: 'message', role, content: [{ type, text }] },
  });
}

try {
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(rolloutDir, { recursive: true });
  writeFileSync(rolloutPath, `${message('user', 'first visible lifecycle segment')}\n`);

  process.env.AI_TASK_MANAGER_PROJECT_DIR = projectDir;
  process.env.AI_TASK_MANAGER_APP_NAME = 'codex';
  process.env.CODEX_THREAD_ID = THREAD_ID;
  delete process.env.CODEX_SESSION_ID;
  delete process.env.CLAUDE_SESSION_ID;
  delete process.env.CLAUDE_CODE_SESSION_ID;
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  process.env.TT_SKIP_FIELD_SELF_CHECK = '1';
  process.env.TT_SKIP_NETWORK = '1';

  const { buildContext } = await import('../../../runtime.mjs');
  const ctx = buildContext(['status']);
  const rows = [];
  const refs = [];
  ctx.safePostTiming = async (_issue, row) => {
    rows.push(row);
    return { ok: true };
  };
  ctx.safeRecordSessionRef = async (_issue, ref) => {
    refs.push(ref);
    return { ok: true };
  };
  ctx.safeReadLastRow = async () => null;

  const state = {
    active: '#1092',
    entryStartTs: new Date(Date.now() - 2_000).toISOString(),
    lastWordMarker: 0,
  };

  const first = await ctx.flushActiveToGH(state, 'pause:test', 'first lifecycle flush');
  appendFileSync(rolloutPath, `${message('assistant', 'second visible lifecycle segment')}\n`);
  const second = await ctx.flushActiveToGH(state, 'pause:test', 'second lifecycle flush');

  assert.ok(first.deltaWords > 0, 'first Codex segment produces a positive word delta');
  assert.ok(second.deltaWords > 0, 'new Codex records produce a positive next-segment delta');
  assert.ok(second.wordMarker > first.wordMarker, 'the durable Word Marker grows monotonically');
  assert.equal(rows.length, 2, 'the real lifecycle flush emits both timing rows');
  assert.equal(refs.length, 2, 'each live flush checks the append-only session reference');
  assert.equal(refs[0].sid, THREAD_ID, 'session reference uses Codex Desktop thread identity');
  assert.equal(refs[0].jsonlPath, rolloutPath, 'session reference uses the native rollout path');
} finally {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(tmp, { recursive: true, force: true });
}

console.log('codex-word-marker-lifecycle.integration.test.mjs: all passed');
