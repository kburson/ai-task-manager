#!/usr/bin/env node
// W2.3 / issue #66: verify move-state.mjs internal-only gate and matrix gate.
//
// Coverage:
//   1. Direct subprocess call without AITM_INTERNAL and without a TTY → refused
//      with the internal-only message; exit code 3.
//   2. Same with AITM_INTERNAL=1 → permitted; succeeds end-to-end under
//      TT_SKIP_NETWORK.
//   3. Invalid transition with --from and AITM_INTERNAL=1 → refused with the
//      state-machine matrix reason; exit code 5.
//   4. Valid forward transition with --from → permitted.
//   5. Valid backward rework transition (validate→development) with --from →
//      permitted.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dir, '../../gh/move-state.mjs');

function makeSandbox() {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-ms-igate-'));
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
  return sandbox;
}

// Build a fresh env that does NOT inherit AITM_INTERNAL from the parent test
// runner (the move-state.test.mjs harness sets it as a default). We only keep
// the variables move-state actually needs to run under TT_SKIP_NETWORK.
function cleanEnv(sandbox, extra = {}) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    TT_SKIP_NETWORK: '1',
    ...extra,
  };
}

async function run(args, env) {
  return pexec(process.execPath, [SCRIPT, ...args], { env, timeout: 10000 });
}

async function runExpectFail(args, env) {
  try {
    await run(args, env);
    assert.fail('Expected non-zero exit but command succeeded');
  } catch (e) {
    return e;
  }
}

// 1. No AITM_INTERNAL, non-TTY (execFile child has no TTY) → refused.
{
  const sandbox = makeSandbox();
  const e = await runExpectFail(['123', 'groom'], cleanEnv(sandbox));
  assert.match(
    String(e.stderr || ''),
    /move-state\.mjs is internal/,
    'agent-context (no env, no TTY) must be refused with internal-only message'
  );
  assert.equal(e.code, 3, `expected exit code 3 for internal-gate refusal, got ${e.code}`);
  rmSync(sandbox, { recursive: true });
}

// 2. AITM_INTERNAL=1 → permitted; transition succeeds under TT_SKIP_NETWORK.
{
  const sandbox = makeSandbox();
  const r = await run(['123', 'groom'], cleanEnv(sandbox, { AITM_INTERNAL: '1' }));
  assert.match(r.stdout, /moved to: groom/, 'chokepoint-driven call should succeed');
  rmSync(sandbox, { recursive: true });
}

// 3. Invalid transition with --from → refused with matrix reason.
{
  const sandbox = makeSandbox();
  const e = await runExpectFail(
    ['123', 'development', '--from', 'backlog'],
    cleanEnv(sandbox, { AITM_INTERNAL: '1' })
  );
  assert.match(
    String(e.stderr || ''),
    /illegal transition: backlog → development/,
    'matrix refusal must surface the state-machine reason'
  );
  assert.equal(e.code, 5, `expected exit code 5 for matrix refusal, got ${e.code}`);
  rmSync(sandbox, { recursive: true });
}

// 4. Valid forward transition with --from → permitted.
{
  const sandbox = makeSandbox();
  const r = await run(
    ['123', 'analyze', '--from', 'groom'],
    cleanEnv(sandbox, { AITM_INTERNAL: '1' })
  );
  assert.match(r.stdout, /moved to: analyze/, 'forward groom->analyze should succeed');
  rmSync(sandbox, { recursive: true });
}

// 5. Valid backward rework transition (validate -> development) → permitted.
{
  const sandbox = makeSandbox();
  const r = await run(
    ['123', 'development', '--from', 'validate'],
    cleanEnv(sandbox, { AITM_INTERNAL: '1' })
  );
  assert.match(r.stdout, /moved to: development/, 'validate->development rework should succeed');
  rmSync(sandbox, { recursive: true });
}

console.log('move-state-internal-gate.test.mjs: all passed');
