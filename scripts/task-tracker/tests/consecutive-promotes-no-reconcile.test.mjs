// #210 — Integration regression: two consecutive forward state transitions
// must both succeed without an interposed `/task reconcile`.
//
// Pre-fix, after a successful `develop→test` (or `refine→plan`) move, the
// local `state.state` cache stayed pinned at the prior state because the
// active-guard in move-state.mjs only synced when `s.active === '#N'`. On
// the second `promote` call, the verb-preflight saw (live=test, local=develop,
// marker=develop) and refused with exit 9 `human-move`.
//
// This test drives two consecutive `move-state.mjs` invocations against a
// sandboxed runtime config (TT_SKIP_NETWORK=1, no real gh) and asserts the
// local cache advances on every transition, including the orchestrator case
// where `s.active` is null.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const MOVE_STATE = path.join(REPO_ROOT, 'scripts/gh/move-state.mjs');

async function runMoveState(args, env) {
  return pexec(process.execPath, [MOVE_STATE, ...args], {
    env: { ...process.env, ...env },
    timeout: 30_000,
  });
}

function setupSandbox() {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-i210-'));
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
  return sandbox;
}

function writeState(sandbox, state) {
  const sp = path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json');
  writeFileSync(sp, JSON.stringify(state, null, 2));
  return sp;
}

function readState(sp) {
  return JSON.parse(readFileSync(sp, 'utf8'));
}

async function testConsecutiveBound() {
  const sandbox = setupSandbox();
  try {
    const sp = writeState(sandbox, { active: '#210', lastActive: '#210', state: 'develop' });
    const env = {
      TT_SKIP_NETWORK: '1',
      AI_TASK_MANAGER_PROJECT_DIR: sandbox,
      AITM_VERB_CONTEXT: 'promote',
    };

    await runMoveState(['210', 'test'], env);
    let s = readState(sp);
    assert.equal(s.state, 'test', 'first promote (develop→test) must sync local state');

    await runMoveState(['210', 'review'], env);
    s = readState(sp);
    assert.equal(
      s.state,
      'review',
      'second consecutive promote (test→review) must also sync — no reconcile required'
    );
  } finally {
    rmSync(sandbox, { recursive: true });
  }
}

async function testConsecutiveOrchestrator() {
  // Orchestrator / sub-agent flow: `s.active === null`. Pre-fix, the
  // active-guard left state.state untouched and the next promote's preflight
  // refused with `human-move`.
  const sandbox = setupSandbox();
  try {
    const sp = writeState(sandbox, { active: null, lastActive: null, state: 'refine' });
    const env = {
      TT_SKIP_NETWORK: '1',
      AI_TASK_MANAGER_PROJECT_DIR: sandbox,
      AITM_VERB_CONTEXT: 'promote',
    };

    await runMoveState(['311', 'plan'], env);
    let s = readState(sp);
    assert.equal(s.state, 'plan', 'orchestrator promote (refine→plan) must sync local state');
    assert.equal(s.active, null, 'orchestrator flow must not synthesize an active binding');

    await runMoveState(['311', 'develop'], env);
    s = readState(sp);
    assert.equal(s.state, 'develop', 'second orchestrator promote (plan→develop) must also sync');
  } finally {
    rmSync(sandbox, { recursive: true });
  }
}

async function main() {
  await testConsecutiveBound();
  await testConsecutiveOrchestrator();
  console.log('consecutive-promotes-no-reconcile: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
