#!/usr/bin/env node
// @story #558
//
// Characterization harness for the three state-machine orchestrators:
//   1. move-state.mjs — the single audited Status mutator (subprocess boundary).
//   2. promote.mjs    — `runPromote` forward-transition router (pure core).
//   3. close.mjs       — `verbClose` terminal-close pipeline (injected ctx).
//
// PURPOSE (US-09 / #558): pin the EXTERNAL, observable behavior of these
// orchestrators so the US-10/US-11/US-12 refactors (#559/#560/#561) can move
// internal structure freely and rely on a red bar if behavior drifts.
//
// BINDING CONSTRAINT (the reason this file exists): every assertion below reads
// ONLY the public boundary — process exit code, stdout, the structured value a
// pure core returns, an emitted marker, refusal text, or the ORDER of injected
// side-effect calls. No assertion names a private function or inspects module
// shape. A characterization test that secretly couples to structure is worse
// than none: it would give a false green during exactly the refactors it exists
// to protect. If a refactor renames an internal helper, these tests stay green;
// if it changes what a caller observes, they go red. That is the contract.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import {
  runPromote,
  spawnVerbTimeout,
  MOVE_STATE_DELEGATE_TIMEOUT_MS,
} from '../../verbs/promote.mjs';
import { writeLastKnownState } from '../../gh-timing-comment.mjs';
import { PHASE_EVENTS } from '../../phase-events.mjs';
import { verbClose } from '../../verbs/close.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
// #764 — move-state.mjs is import-only; spawn the test-only CLI harness instead.
const MOVE_STATE = path.resolve(__dir, '..', 'helpers/move-state-cli.mjs');

// ===========================================================================
// 1. move-state.mjs — subprocess boundary (exit codes + stdout/stderr text).
// ===========================================================================
//
// move-state is import-only in production; its test-only CLI harness preserves
// the genuine process contract. TT_SKIP_NETWORK=1 is intentionally a silent,
// lock-only dry-run: it exercises lock ownership, returns the policy/matrix exit
// code, and invokes none of the guard, status, body, timing, cache, tail, or
// child-process collaborators. It must not print a "moved" success/readout for a
// board write that never happened.

function makeMoveStateSandbox() {
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-char-ms-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  mkdirSync(path.join(sandbox, '.tmp', 'aitm', 'locks'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({
      repo: 'test-owner/test-repo',
      projectId: 'PVT_char',
      kanbanFieldId: 'PVTF_char',
      kanbanOptionBacklog: 'PVTO_b',
      kanbanOptionRefine: 'PVTO_g',
      kanbanOptionPlan: 'PVTO_a',
      kanbanOptionDevelop: 'PVTO_d',
      kanbanOptionTest: 'PVTO_v',
      kanbanOptionReview: 'PVTO_r',
      kanbanOptionDone: 'PVTO_done',
    })
  );
  return sandbox;
}

// A clean env that does NOT inherit AITM_INTERNAL from the parent test runner.
function moveStateEnv(sandbox, extra = {}) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_NO_WARNINGS: '1',
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    TT_SKIP_NETWORK: '1',
    ...extra,
  };
}

async function runMoveState(args, env) {
  const result = await pexec(process.execPath, [MOVE_STATE, ...args], { env, timeout: 10000 });
  return { ...result, exitCode: 0 };
}

async function runMoveStateExpectFail(args, env) {
  try {
    await runMoveState(args, env);
    assert.fail('expected non-zero exit but the command succeeded');
  } catch (e) {
    return e;
  }
}

function snapshotSandboxState(root, relativeDir = '') {
  const absoluteDir = path.join(root, relativeDir);
  const snapshot = [];
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      snapshot.push([relativePath, 'directory']);
      snapshot.push(...snapshotSandboxState(root, relativePath));
    } else {
      snapshot.push([relativePath, 'file', readFileSync(path.join(root, relativePath), 'utf8')]);
    }
  }
  return snapshot;
}

function assertSilentOfflineProbe(result, sandbox, beforeState) {
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, '', 'offline probe must not claim a board move/readout');
  assert.equal(result.stderr, '');
  assert.deepEqual(
    snapshotSandboxState(sandbox),
    beforeState,
    'offline probe left an observable sandbox mutation'
  );
}

test('move-state: agent-context call (no env, no TTY) is refused with exit 3', async () => {
  const sandbox = makeMoveStateSandbox();
  try {
    const e = await runMoveStateExpectFail(['123', 'refine'], moveStateEnv(sandbox));
    assert.match(String(e.stderr || ''), /move-state\.mjs is internal/);
    assert.equal(e.code, 3, `expected exit 3 for internal-gate refusal, got ${e.code}`);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('move-state: chokepoint offline probe succeeds silently without mutation', async () => {
  const sandbox = makeMoveStateSandbox();
  const beforeState = snapshotSandboxState(sandbox);
  try {
    const r = await runMoveState(['123', 'refine'], moveStateEnv(sandbox, { AITM_INTERNAL: '1' }));
    assertSilentOfflineProbe(r, sandbox, beforeState);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('move-state: illegal matrix transition is refused with exit 5', async () => {
  const sandbox = makeMoveStateSandbox();
  try {
    const e = await runMoveStateExpectFail(
      ['123', 'develop', '--from', 'backlog'],
      moveStateEnv(sandbox, { AITM_INTERNAL: '1' })
    );
    assert.match(String(e.stderr || ''), /illegal transition: backlog → develop/);
    assert.equal(e.code, 5, `expected exit 5 for matrix refusal, got ${e.code}`);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('move-state: valid forward-transition offline probe succeeds silently without mutation', async () => {
  const sandbox = makeMoveStateSandbox();
  const beforeState = snapshotSandboxState(sandbox);
  try {
    const r = await runMoveState(
      ['123', 'plan', '--from', 'refine'],
      moveStateEnv(sandbox, { AITM_INTERNAL: '1' })
    );
    assertSilentOfflineProbe(r, sandbox, beforeState);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

// ===========================================================================
// 2. promote.mjs — `runPromote` pre-guard routing (structured return value).
// ===========================================================================
//
// `runPromote` is a pure core with fully injectable deps. We pin its OWN
// decision surface — the routing it performs before any state-exit guard runs —
// by stubbing every I/O dep and asserting on the returned `status`/`from`/`to`.
// These four outcomes return before the guard registry is consulted, so they
// characterize promote's behavior independent of any guard internals.

const PROMOTE_CFG = { repo: 'o/r', projectId: 'P_char' };

// Build the injected deps. `bodyState` seeds the last-known-state marker the
// router reads; `liveState` is what the board reports. Unused deps are stubs.
function promoteDeps({ bodyState, liveState }) {
  const body = bodyState == null ? '# Issue\n' : writeLastKnownState('# Issue\n', bodyState);
  return {
    assertBound: () => {},
    fetchIssueBody: async () => ({ body }),
    getLiveState: async () => liveState,
    mutateIssueBody: async ({ mutate }) => mutate(body),
    spawnVerb: async () => 0,
    runMoveState: async () => 0,
  };
}

test('promote: recorded=done is terminal-refused (forward-only)', async () => {
  const r = await runPromote({
    issueNumber: 123,
    cfg: PROMOTE_CFG,
    deps: promoteDeps({ bodyState: 'done', liveState: 'done' }),
  });
  assert.equal(r.status, 'terminal-refused');
  assert.match(r.message, /already in done/);
});

test('promote: board/recorded divergence is drift-refused with both states', async () => {
  const r = await runPromote({
    issueNumber: 123,
    cfg: PROMOTE_CFG,
    deps: promoteDeps({ bodyState: 'develop', liveState: 'test' }),
  });
  assert.equal(r.status, 'drift-refused');
  assert.equal(r.recorded, 'develop');
  assert.equal(r.live, 'test');
});

test('promote: no recorded marker and no live board item is an error', async () => {
  const r = await runPromote({
    issueNumber: 123,
    cfg: PROMOTE_CFG,
    deps: promoteDeps({ bodyState: null, liveState: null }),
  });
  assert.equal(r.status, 'error');
  assert.match(r.message, /board item missing/);
});

test('promote: unknown recorded state is an error', async () => {
  const r = await runPromote({
    issueNumber: 123,
    cfg: PROMOTE_CFG,
    // live === recorded so there is no drift; the bogus state fails the
    // STATES.includes check and surfaces as an error.
    deps: promoteDeps({ bodyState: 'nonsense', liveState: 'nonsense' }),
  });
  assert.equal(r.status, 'error');
  assert.match(r.message, /unknown recorded state/);
});

test('promote: delegate-timeout policy — test gets none, close gets a bounded budget', () => {
  // The alias delegate spawned for develop→test is the sandbox `test` verb,
  // which must run uncapped by promote's outer budget; `close` keeps a bound.
  assert.equal(spawnVerbTimeout('test'), undefined);
  assert.equal(typeof spawnVerbTimeout('close'), 'number');
  assert.ok(spawnVerbTimeout('close') > 0);
  assert.ok(MOVE_STATE_DELEGATE_TIMEOUT_MS > 0);
});

// ===========================================================================
// 3. close.mjs — `verbClose` terminal pipeline (stdout + ordered side effects).
// ===========================================================================
//
// `verbClose` takes a fully-injected ctx and is observable through stdout, its
// process exit code, and the ORDER of the side-effect calls it makes. We drive
// it under SKIP_NETWORK with stub deps that record into an ordered `sequence[]`
// and assert on the resulting event order — never on any internal helper name.

function makeStatePath(state) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'tt-char-close-'));
  const p = path.join(dir, 'state.json');
  writeFileSync(p, JSON.stringify(state));
  return { statePath: p, dir };
}

function eventOf(row) {
  return String(row).split('|')[2].trim();
}

// Capture console.log for the duration of `fn`, returning the joined lines.
async function captureStdout(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = orig;
  }
  return lines.join('\n');
}

function makeCloseCtx({ statePath, dir, rest, boardState, sequence }) {
  return {
    cfg: { repo: 'o/r' },
    statePath,
    projectDir: dir,
    rest,
    SKIP_NETWORK: true,
    pexec: async () => ({ stdout: '{}', stderr: '' }),
    drainQueueIfAny: async () => {},
    flushAndForgetQueueFor: async () => ({ delivered: 0, discarded: 0 }),
    safePostTiming: async (_target, row) => {
      sequence.push({ kind: 'row', event: eventOf(row) });
    },
    runMoveState: async () => ({ ok: true, benign: false }),
    runMoveStateDone: async () => {
      sequence.push({ kind: 'move-done' });
      return { ok: true, benign: false };
    },
    runLogIssueTime: async () => {},
    fetchSubIssues: async () => [],
    getIssueBoardState: async () => boardState,
    getIssueClosedState: async () => false,
    uncheckedPreCloseCheckboxes: () => [],
    nowIso: () => new Date().toISOString(),
  };
}

test('close: no active task and no target prints "no active task" and does nothing', async () => {
  const { statePath, dir } = makeStatePath({ active: null, lastActive: null });
  const sequence = [];
  try {
    const out = await captureStdout(() =>
      verbClose(makeCloseCtx({ statePath, dir, rest: [], boardState: 'review', sequence }))
    );
    assert.match(out, /no active task/);
    assert.equal(sequence.length, 0, 'no side effects when there is nothing to close');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('close: an active review issue runs the terminal done move after the wrap rows', async () => {
  const prevSkipDirty = process.env.TT_SKIP_DIRTY_CHECK;
  process.env.TT_SKIP_DIRTY_CHECK = '1';
  const { statePath, dir } = makeStatePath({
    active: '#999',
    lastActive: '#999',
    entryStartTs: new Date(Date.now() - 60_000).toISOString(),
    wordsAtEntryStart: 0,
    lastWordMarker: 0,
  });
  const sequence = [];
  let out = '';
  try {
    out = await captureStdout(() =>
      verbClose(makeCloseCtx({ statePath, dir, rest: ['#999'], boardState: 'review', sequence }))
    );
  } finally {
    if (prevSkipDirty === undefined) delete process.env.TT_SKIP_DIRTY_CHECK;
    else process.env.TT_SKIP_DIRTY_CHECK = prevSkipDirty;
    rmSync(dir, { recursive: true, force: true });
  }

  const wrapIdx = sequence.findIndex(
    (e) => e.kind === 'row' && e.event === PHASE_EVENTS.done.enter.event
  );
  const moveIdx = sequence.findIndex((e) => e.kind === 'move-done');

  assert.ok(wrapIdx !== -1, 'expected an issue:wrap timing row');
  assert.ok(moveIdx !== -1, 'expected the terminal done board move to run');
  assert.ok(wrapIdx < moveIdx, 'the wrap row must precede the terminal board move');
  assert.match(out, /Closed #999\./);
});

console.log('orchestrators.test.mjs: ok');
