#!/usr/bin/env node
// @story #309
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
// #764 — move-state.mjs is import-only; spawn the test-only CLI harness instead.
const SCRIPT = path.resolve(__dir, '..', 'helpers/move-state-cli.mjs');

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

// Test: each new state with TT_SKIP_NETWORK completes as a silent, side-effect-
// free admission probe without claiming a board move.
for (const state of ['backlog', 'refine', 'plan', 'develop', 'test', 'review', 'done']) {
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), `tt-ms-${state}-`));
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
  const r = await run(['123', state], {
    TT_SKIP_NETWORK: '1',
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
  });
  assert.doesNotMatch(r.stdout, /moved to:/, `offline ${state} probe must not claim a move`);
  rmSync(sandbox, { recursive: true });
}

// Test (#1049): the offline boundary performs no local cache write, including
// migration of a legacy state field.
{
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-ms-state-write-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      {
        repo: 'o/r',
        projectId: 'P',
        kanbanFieldId: 'F',
        kanbanOptionDevelop: 'D',
        kanbanOptionTest: 'V',
      },
      null,
      2
    )
  );
  // #573: the global ledger lives under `.tmp/aitm/state/`. Seed there so the
  // CLI reads what we wrote and we read back what it wrote.
  const sp = path.join(sandbox, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
  mkdirSync(path.dirname(sp), { recursive: true });
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
  assert.equal(after.state, 'develop', 'offline probe must leave tracker-state untouched');
  assert.equal(after.active, '#777', 'active should be preserved');

  rmSync(sandbox, { recursive: true });
}

console.log('move-state.test.mjs: all passed');
