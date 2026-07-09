// @story #210
// #210 / #218 — Integration regression: two consecutive forward state
// transitions must both succeed without an interposed `/task reconcile`.
//
// Under #218 the local `state.state` field has been removed entirely; the
// issue body `aitm-last-known-state` marker is the single source of truth.
// This test asserts the file-level invariant: after each successful
// transition, the tracker-state file must NOT contain a `state` field —
// even when the file was seeded with a stale `state` from legacy data.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '../../..');
// #764 — move-state.mjs is import-only; spawn the test-only CLI harness instead.
const MOVE_STATE = path.join(REPO_ROOT, 'scripts/task-tracker/tests/helpers/move-state-cli.mjs');

async function runMoveState(args, env) {
  return pexec(process.execPath, [MOVE_STATE, ...args], {
    env: { ...process.env, ...env },
    timeout: 30_000,
  });
}

function setupSandbox() {
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-i210-'));
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
  return sandbox;
}

function writeState(sandbox, state) {
  // #573: the global ledger lives under `.tmp/aitm/state/`.
  const sp = path.join(sandbox, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
  mkdirSync(path.dirname(sp), { recursive: true });
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
    assert.equal(s.state, undefined, '#218: tracker-state must not carry a state field');
    assert.equal(s.active, '#210', 'active binding preserved across transition');

    await runMoveState(['210', 'review'], env);
    s = readState(sp);
    assert.equal(s.state, undefined, '#218: tracker-state stays clean across consecutive promotes');
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
    assert.equal(s.state, undefined, '#218: state field stripped on orchestrator promote');
    assert.equal(s.active, null, 'orchestrator flow must not synthesize an active binding');

    await runMoveState(['311', 'develop'], env);
    s = readState(sp);
    assert.equal(s.state, undefined, '#218: state field stays absent across orchestrator promotes');
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
