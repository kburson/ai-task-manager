#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dir, '../../gh/move-state.mjs');

async function run(args, env = {}) {
  // Tests spawn move-state.mjs via execFile — no TTY. The internal-only gate
  // (see W2.3 / issue #66) refuses non-TTY callers without AITM_INTERNAL=1.
  // All existing assertions exercise script behaviour, not the gate, so default
  // to AITM_INTERNAL=1; individual tests can override by passing
  // `AITM_INTERNAL: ''` in the env.
  return pexec('node', [SCRIPT, ...args], {
    env: { AITM_INTERNAL: '1', ...process.env, ...env },
  });
}

async function runExpectFail(args, env = {}) {
  try {
    await run(args, env);
    assert.fail('Expected non-zero exit but succeeded');
  } catch (e) {
    return e;
  }
}

// Test: missing args prints usage and exits non-zero
{
  const e = await runExpectFail([]);
  assert.match(e.stderr + e.stdout, /Usage/i, 'missing args should print usage');
}

// Test: non-numeric issue number prints usage and exits non-zero
{
  const e = await runExpectFail(['abc', 'develop'], { TT_SKIP_NETWORK: '1' });
  assert.match(e.stderr + e.stdout, /Usage/i, 'non-numeric issue should print usage');
}

// Test: invalid state exits non-zero
{
  const e = await runExpectFail(['123', 'flying'], { TT_SKIP_NETWORK: '1' });
  assert.match(e.stderr + e.stdout, /Unknown state/i, 'invalid state should print error');
}

// Test: legacy state names are no longer accepted (hard cut)
for (const legacy of ['in-progress', 'in-review', 'r4r', 'ready']) {
  const e = await runExpectFail(['123', legacy], { TT_SKIP_NETWORK: '1' });
  assert.match(e.stderr + e.stdout, /Unknown state/i, `legacy state ${legacy} should be rejected`);
}

// Test: each new state with TT_SKIP_NETWORK prints success without hitting GH
for (const state of ['backlog', 'refine', 'plan', 'develop', 'test', 'review', 'done']) {
  const sandbox = mkdtempSync(path.join(tmpdir(), `tt-ms-${state}-`));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      {
        repo: 'test-owner/test-repo',
        projectId: 'PVT_test123',
        kanbanFieldId: 'PVTF_test',
        kanbanOptionBacklog: 'PVTO_b',
        kanbanOptionGroom: 'PVTO_g',
        kanbanOptionAnalyze: 'PVTO_a',
        kanbanOptionDevelopment: 'PVTO_d',
        kanbanOptionValidate: 'PVTO_v',
        kanbanOptionReview: 'PVTO_r',
        kanbanOptionDone: 'PVTO_done',
      },
      null,
      2
    )
  );
  const r = await run(['123', state], {
    TT_SKIP_NETWORK: '1',
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
  });
  assert.match(r.stdout, new RegExp(`moved to: ${state}`), `state ${state} should succeed`);
  rmSync(sandbox, { recursive: true });
}

// Test (#218): tracker-state never carries a `state` field. Even if legacy
// data is on disk, move-state must not preserve or rewrite it — the issue
// body `aitm-last-known-state` marker is the single source of truth.
{
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-ms-state-write-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      {
        repo: 'o/r',
        projectId: 'P',
        kanbanFieldId: 'F',
        kanbanOptionDevelopment: 'D',
        kanbanOptionValidate: 'V',
      },
      null,
      2
    )
  );
  const sp = path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json');
  // Seed with legacy `state` field to verify it gets stripped on next write.
  writeFileSync(
    sp,
    JSON.stringify({ active: '#777', lastActive: '#777', state: 'develop' }, null, 2)
  );

  await run(['777', 'test'], {
    TT_SKIP_NETWORK: '1',
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
  });
  const after = JSON.parse(readFileSync(sp, 'utf8'));
  assert.equal(after.state, undefined, '#218: state field must be absent from tracker-state');
  assert.equal(after.active, '#777', 'active should be preserved');

  rmSync(sandbox, { recursive: true });
}

console.log('move-state.test.mjs: all passed');
