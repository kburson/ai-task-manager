#!/usr/bin/env node
// @story #66
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
//   5. Valid backward rework transition (test→develop) with --from →
//      permitted.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
// #764 — move-state.mjs is import-only; spawn the test-only CLI harness instead.
const SCRIPT = path.resolve(__dir, '..', 'helpers/move-state-cli.mjs');

function makeSandbox() {
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-ms-igate-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      {
        repo: 'test-owner/test-repo',
        projectId: 'PVT_test123',
        kanbanFieldId: 'PVTF_test',
        kanbanOptionBacklog: 'PVTO_b',
        kanbanOptionRefine: 'PVTO_g',
        kanbanOptionReadyForPlan: 'PVTO_r4p',
        kanbanOptionPlan: 'PVTO_a',
        kanbanOptionDevelop: 'PVTO_d',
        kanbanOptionTest: 'PVTO_v',
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
  const e = await runExpectFail(['123', 'refine'], cleanEnv(sandbox));
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
  const r = await run(['123', 'refine'], cleanEnv(sandbox, { AITM_INTERNAL: '1' }));
  assert.match(r.stdout, /moved to: refine/, 'chokepoint-driven call should succeed');
  rmSync(sandbox, { recursive: true });
}

// 3. Invalid transition with --from → refused with matrix reason.
{
  const sandbox = makeSandbox();
  const e = await runExpectFail(
    ['123', 'develop', '--from', 'backlog'],
    cleanEnv(sandbox, { AITM_INTERNAL: '1' })
  );
  assert.match(
    String(e.stderr || ''),
    /illegal transition: backlog → develop/,
    'matrix refusal must surface the state-machine reason'
  );
  assert.equal(e.code, 5, `expected exit code 5 for matrix refusal, got ${e.code}`);
  rmSync(sandbox, { recursive: true });
}

// 4. Valid forward transition with --from → permitted.
{
  const sandbox = makeSandbox();
  const r = await run(
    ['123', 'ready-for-plan', '--from', 'refine'],
    cleanEnv(sandbox, { AITM_INTERNAL: '1' })
  );
  assert.match(r.stdout, /moved to: ready-for-plan/, 'forward refine->R4P should succeed');
  rmSync(sandbox, { recursive: true });
}

// 5. Valid backward rework transition (test -> develop) → permitted.
{
  const sandbox = makeSandbox();
  const r = await run(
    ['123', 'develop', '--from', 'test'],
    cleanEnv(sandbox, { AITM_INTERNAL: '1' })
  );
  assert.match(r.stdout, /moved to: develop/, 'test->develop rework should succeed');
  rmSync(sandbox, { recursive: true });
}

// 6. #999 — drift re-verify (review -> test) → permitted. Reproduces the
// exact #996 shape: verb-home-state-guard.mjs already let `/task test <N>`
// run from `review` (#998), and sandbox verification passed, but the
// terminal board move here used to be refused by this exact matrix gate
// because state-machine.mjs's BACKWARD map lacked a review->test entry.
{
  const sandbox = makeSandbox();
  const r = await run(
    ['123', 'test', '--from', 'review'],
    cleanEnv(sandbox, { AITM_INTERNAL: '1' })
  );
  assert.match(r.stdout, /moved to: test/, 'review->test drift re-verify should succeed');
  rmSync(sandbox, { recursive: true });
}

console.log('move-state-internal-gate.test.mjs: all passed');
