#!/usr/bin/env node
// @story #747
// Regression test: state markers + the timing-log state-move row must be
// stamped ONLY after the board `Status` move is verified. `runStatusWrite`
// (scripts/task-tracker/lib/move-state/github-mutation.mjs) writes the kanban
// field, reads the live Status optionId back, and returns a non-null `exit`
// unless the read-back confirms the target. The host
// (scripts/gh/move-state.mjs) gates on that exit BEFORE running the
// post-commit tail — and the tail is the only place the `aitm-last-known-state`
// marker (`stampEntryMarkers`) and the timing row (`emitPhasePairRows`) are
// written. So a non-null exit provably skips both.
//
// #711 already fails-closed on a concrete NON-EMPTY mismatch. #747 closes the
// remaining hole: an EMPTY / unreadable read-back used to soft-proceed (exit
// null → tail stamps an unverified marker). That is the plausible cause of the
// #737 split-brain that recurred 2026-07-08, two days after #711 landed. The
// invariant is absolute — an unconfirmed write must never stamp — so an empty
// read-back now retries across the whole budget and, if it never confirms,
// fails closed (exit 7) exactly like a concrete mismatch.
//
// Coverage:
//   AC1/AC3 — concrete mismatch that never confirms → exit 7, no success line.
//   AC3/AC4 — persistent EMPTY read-back → exit 7 fail-closed (the #747 hole).
//   AC1/AC2 — empty read-back that RECOVERS on a later attempt → exit null,
//             success (a transiently-degraded read path must not block).
//   AC1/AC2/AC3 — host exit-gate precedes the post-commit tail in the source,
//             so a non-null exit skips both marker stamp and timing row.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runStatusWrite,
  STATUS_WRITE_MAX_ATTEMPTS,
  STATUS_WRITE_READBACK_EXIT,
} from '../../lib/move-state/github-mutation.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dir, '..', '..', '..', '..');

const TARGET_OPTION = 'opt-develop';
const WRONG_OPTION = 'opt-stale';

function makeCtx({ readBack, gh } = {}) {
  const editCalls = [];
  return {
    ctx: {
      issueArg: '747',
      stateArg: 'develop',
      optionId: TARGET_OPTION,
      itemIdOverride: 'ITEM_1',
      SKIP_NETWORK: false,
      cfg: { repo: 'owner/repo', projectId: 'PROJ_1', kanbanFieldId: 'FIELD_1' },
      gh:
        gh ||
        (async (args) => {
          editCalls.push(args);
        }),
      readBackStatusOptionId: readBack,
    },
    editCalls,
  };
}

async function capture(fn) {
  const origLog = console.log;
  const origErr = process.stderr.write;
  const out = [];
  const err = [];
  console.log = (...a) => out.push(a.join(' '));
  process.stderr.write = (s) => (err.push(String(s)), true);
  try {
    const result = await fn();
    return { result, out, err };
  } finally {
    console.log = origLog;
    process.stderr.write = origErr;
  }
}

test('AC1/AC3: a concrete-mismatch write never confirms and fails closed (exit 7)', async () => {
  let readBackCalls = 0;
  const readBack = async () => {
    readBackCalls++;
    return WRONG_OPTION;
  };
  const { ctx, editCalls } = makeCtx({ readBack });

  const { result, out } = await capture(() => runStatusWrite(ctx));

  assert.equal(
    result.exit,
    STATUS_WRITE_READBACK_EXIT,
    'non-null exit halts before the marker stamp'
  );
  assert.equal(editCalls.length, STATUS_WRITE_MAX_ATTEMPTS, 'write retried to the ceiling');
  assert.equal(readBackCalls, STATUS_WRITE_MAX_ATTEMPTS, 'read-back runs after every attempt');
  assert.equal(
    out.filter((l) => l.includes('moved to')).length,
    0,
    'no success line on an unconfirmed write'
  );
});

test('AC3/AC4: a persistently EMPTY read-back fails closed — no soft-proceed (#747)', async () => {
  let readBackCalls = 0;
  // The read path is degraded for the whole window: every read returns ''. An
  // unreadable read is NOT proof the write landed, so the move must refuse.
  const readBack = async () => {
    readBackCalls++;
    return '';
  };
  const { ctx, editCalls } = makeCtx({ readBack });

  const { result, out, err } = await capture(() => runStatusWrite(ctx));

  assert.equal(
    result.exit,
    STATUS_WRITE_READBACK_EXIT,
    'persistent empty read-back fails closed, not soft-proceed'
  );
  assert.equal(
    editCalls.length,
    STATUS_WRITE_MAX_ATTEMPTS,
    'empty read-back retries the full budget before giving up'
  );
  assert.equal(readBackCalls, STATUS_WRITE_MAX_ATTEMPTS, 'read-back runs after every attempt');
  assert.equal(
    out.filter((l) => l.includes('moved to')).length,
    0,
    'no success line — the write was never confirmed'
  );
  assert.ok(
    err.some((l) => l.includes('did NOT confirm')),
    'a loud refusal is written to stderr for the unconfirmed write'
  );
});

test('AC1/AC2: an empty read-back that RECOVERS on retry proceeds with success', async () => {
  // A transiently-degraded read path: first read empty, second read confirms.
  // The write did land; retry-on-empty lets the move complete without a false
  // block.
  const seen = ['', TARGET_OPTION];
  let i = 0;
  let readBackCalls = 0;
  const readBack = async () => {
    readBackCalls++;
    return seen[i++] ?? TARGET_OPTION;
  };
  const { ctx, editCalls } = makeCtx({ readBack });

  const { result, out } = await capture(() => runStatusWrite(ctx));

  assert.equal(result.exit, null, 'a recovered read-back reports success, not a false block');
  assert.equal(result.itemId, 'ITEM_1', 'the resolved item id is threaded back');
  assert.equal(editCalls.length, 2, 'exactly one retry was needed to confirm');
  assert.equal(readBackCalls, 2, 'read-back retried past the empty read');
  assert.ok(
    out.some((l) => l.includes('moved to: develop')),
    'the success line is printed'
  );
});

test('AC2: a healthy write that confirms immediately proceeds normally', async () => {
  let readBackCalls = 0;
  const readBack = async () => {
    readBackCalls++;
    return TARGET_OPTION;
  };
  const { ctx, editCalls } = makeCtx({ readBack });

  const { result, err } = await capture(() => runStatusWrite(ctx));

  assert.equal(result.exit, null, 'no false failure on the happy path');
  assert.equal(editCalls.length, 1, 'a single write suffices once read-back confirms');
  assert.equal(readBackCalls, 1, 'read-back runs exactly once on the happy path');
  assert.equal(err.length, 0, 'no refusal on a confirmed write');
});

test('AC1/AC2/AC3: the host gates on the exit BEFORE running the post-commit tail', () => {
  // Structural guarantee that a non-null exit skips BOTH the marker stamp and
  // the timing row: move-state.mjs exits on runStatusWrite's non-null exit, and
  // only reaches runPostCommitTail (which calls stampEntryMarkers +
  // emitPhasePairRows) afterward.
  const src = readFileSync(path.join(repoRoot, 'scripts', 'gh', 'move-state.mjs'), 'utf8');
  const writeIdx = src.indexOf('runStatusWrite(');
  const gateIdx = src.indexOf('writeResult.exit');
  const tailIdx = src.indexOf('runPostCommitTail(');
  assert.ok(writeIdx !== -1, 'host calls runStatusWrite');
  assert.ok(gateIdx !== -1, 'host inspects writeResult.exit');
  assert.ok(tailIdx !== -1, 'host calls runPostCommitTail');
  assert.ok(
    writeIdx < gateIdx && gateIdx < tailIdx,
    'the exit gate sits between the status write and the post-commit tail'
  );
  assert.match(
    src,
    /writeResult\.exit\s*!==\s*null[\s\S]{0,80}process\.exit\(writeResult\.exit\)/,
    'a non-null exit terminates the host before the tail stamps marker/timing'
  );
});
