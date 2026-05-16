#!/usr/bin/env node
// Issue #141: verify move-state.mjs verb-pipeline enforcement.
//
// Coverage:
//   1. AITM_VERB_CONTEXT=promote (no AITM_INTERNAL) → permitted.
//   2. No env, no TTY, no flag, no cfg → refused; refusal names `/task promote`
//      for a forward target.
//   3. Refusal for backward target (backlog) names `/task demote`.
//   4. --out-of-band "<reason>" → permitted under TT_SKIP_NETWORK (audit
//      emission is best-effort and suppressed when network is skipped).
//   5. --out-of-band with empty reason → refused (exit 2).
//   6. cfg.directMoveStateAllowed=true → permitted + warning printed.

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

function makeSandbox(extraConfig = {}) {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-vpe-'));
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
        ...extraConfig,
      },
      null,
      2
    )
  );
  return sandbox;
}

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

// 1. AITM_VERB_CONTEXT=promote permits the move (no AITM_INTERNAL needed).
{
  const sandbox = makeSandbox();
  const r = await run(['123', 'refine'], cleanEnv(sandbox, { AITM_VERB_CONTEXT: 'promote' }));
  assert.match(r.stdout, /moved to: refine/, 'AITM_VERB_CONTEXT must permit the move');
  rmSync(sandbox, { recursive: true });
}

// 2. Refusal for forward target names /task promote.
{
  const sandbox = makeSandbox();
  const e = await runExpectFail(['123', 'develop'], cleanEnv(sandbox));
  assert.match(
    String(e.stderr || ''),
    /\/task promote/,
    'refusal for forward target must name `/task promote`'
  );
  assert.equal(e.code, 3, `expected exit 3, got ${e.code}`);
  rmSync(sandbox, { recursive: true });
}

// 3. Refusal for backward target names /task demote.
{
  const sandbox = makeSandbox();
  const e = await runExpectFail(['123', 'backlog'], cleanEnv(sandbox));
  assert.match(
    String(e.stderr || ''),
    /\/task demote/,
    'refusal for backlog target must name `/task demote`'
  );
  rmSync(sandbox, { recursive: true });
}

// 4. --out-of-band <reason> permits the move under TT_SKIP_NETWORK.
{
  const sandbox = makeSandbox();
  const r = await run(['123', 'refine', '--out-of-band', 'fixing-drift'], cleanEnv(sandbox));
  assert.match(r.stdout, /moved to: refine/, '--out-of-band must permit the move');
  rmSync(sandbox, { recursive: true });
}

// 5. --out-of-band with empty reason refuses with exit 2.
{
  const sandbox = makeSandbox();
  const e = await runExpectFail(['123', 'refine', '--out-of-band', ''], cleanEnv(sandbox));
  assert.match(String(e.stderr || ''), /non-empty <reason>/, 'empty reason must be refused');
  assert.equal(e.code, 2, `expected exit 2 for empty reason, got ${e.code}`);
  rmSync(sandbox, { recursive: true });
}

// 6. cfg.directMoveStateAllowed=true permits the move + prints warning.
{
  const sandbox = makeSandbox({ directMoveStateAllowed: true });
  const r = await run(['123', 'refine'], cleanEnv(sandbox));
  assert.match(r.stdout, /moved to: refine/, 'directMoveStateAllowed=true must permit the move');
  assert.match(
    String(r.stderr || ''),
    /directMoveStateAllowed=true/,
    'directMoveStateAllowed=true must emit a per-call warning'
  );
  rmSync(sandbox, { recursive: true });
}

console.log('verb-pipeline-enforcement.test.mjs: all passed');
