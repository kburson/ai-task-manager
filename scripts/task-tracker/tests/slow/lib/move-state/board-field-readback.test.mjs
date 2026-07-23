#!/usr/bin/env node
// @story #711
// Regression test for the silent board-field lag defect: a dropped/failed
// GitHub Projects Status field write during a state move left the board behind
// the `aitm-last-known-state` marker with no error, only surfacing much later
// as drift blocking an unrelated command.
//
// Fix under test (`runStatusWrite`, scripts/task-tracker/lib/move-state/
// github-mutation.mjs): after the `project item-edit` write, read the live
// Status optionId back and confirm it reached the target. On mismatch, retry
// with backoff; if still unconfirmed after the final attempt, fail loudly
// (non-null `exit`) BEFORE the host stamps the entry marker.
//
// Coverage:
//   AC1 — dropped write: read-back never equals target → non-null exit, no
//         success line printed, all attempts made.
//   AC2 — healthy write: read-back equals target → exit null, itemId threaded.
//   AC4 — this file IS the automated reproduction of the dropped-write path.
//   AC3 — the reworded verb-preflight drift refusal names a dropped/failed
//         board-field write as a possible cause.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runStatusWrite,
  STATUS_WRITE_MAX_ATTEMPTS,
  STATUS_WRITE_READBACK_EXIT,
} from '../../../../lib/move-state/github-mutation.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/../..';
const repoRoot = path.resolve(__dir, '..', '..', '..', '..');

const TARGET_OPTION = 'opt-develop';
const WRONG_OPTION = 'opt-stale';

// Build a ctx for runStatusWrite with an item id already resolved (so the
// projectItemForIssue path is skipped) and injected I/O doubles.
function makeCtx({ readBack, gh }) {
  const editCalls = [];
  return {
    ctx: {
      issueArg: '711',
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

// Capture console.log + process.stderr.write around a call.
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

test('AC1/AC4: dropped board-field write fails loudly and never prints success', async () => {
  let readBackCalls = 0;
  // read-back always returns the wrong option → the write never confirms.
  const readBack = async () => {
    readBackCalls++;
    return WRONG_OPTION;
  };
  const { ctx, editCalls } = makeCtx({ readBack });

  const { result, out, err } = await capture(() => runStatusWrite(ctx));

  assert.equal(result.exit, STATUS_WRITE_READBACK_EXIT, 'returns the loud non-null exit code');
  assert.notEqual(result.exit, null, 'exit is non-null so the host halts before marker stamp');
  assert.equal(
    editCalls.length,
    STATUS_WRITE_MAX_ATTEMPTS,
    'the write is retried up to the attempt ceiling'
  );
  assert.equal(
    readBackCalls,
    STATUS_WRITE_MAX_ATTEMPTS,
    'read-back runs after every write attempt'
  );
  assert.equal(
    out.filter((l) => l.includes('moved to')).length,
    0,
    'no ✓ success line is printed on an unconfirmed write'
  );
  assert.ok(
    err.some((l) => l.includes('did NOT confirm')),
    'a loud refusal is written to stderr'
  );
});

test('AC2: a write that confirms on read-back proceeds normally', async () => {
  let readBackCalls = 0;
  const readBack = async () => {
    readBackCalls++;
    return TARGET_OPTION; // confirms immediately
  };
  const { ctx, editCalls } = makeCtx({ readBack });

  const { result, out, err } = await capture(() => runStatusWrite(ctx));

  assert.equal(result.exit, null, 'no false failure — exit is null');
  assert.equal(result.itemId, 'ITEM_1', 'the resolved item id is threaded back');
  assert.equal(editCalls.length, 1, 'a single write suffices once read-back confirms');
  assert.equal(readBackCalls, 1, 'read-back runs exactly once on the happy path');
  assert.ok(
    out.some((l) => l.includes('moved to: develop')),
    'the ✓ success line is printed'
  );
  assert.equal(err.length, 0, 'no loud refusal on a confirmed write');
});

test('AC2: read-back recovers after an initial dropped write (retry succeeds)', async () => {
  const seen = [WRONG_OPTION, TARGET_OPTION]; // first read stale, second confirms
  let i = 0;
  const readBack = async () => seen[i++] ?? TARGET_OPTION;
  const { ctx, editCalls } = makeCtx({ readBack });

  const { result } = await capture(() => runStatusWrite(ctx));

  assert.equal(result.exit, null, 'recovered write reports success');
  assert.equal(editCalls.length, 2, 'exactly one retry was needed');
});

test('AC1: a persistently empty/unreadable read-back fails closed (#747 supersedes #711 soft-proceed)', async () => {
  let readBackCalls = 0;
  // read-back always returns '' — the read path is unavailable (offline, a
  // shimmed gh, or a statusless item). #711 soft-proceeded here, but an
  // unreadable read is NOT proof the write landed; #747 makes an unconfirmed
  // move fail closed after exhausting the retry budget so the marker + timing
  // row can never be stamped on an unverified write.
  const readBack = async () => {
    readBackCalls++;
    return '';
  };
  const { ctx, editCalls } = makeCtx({ readBack });

  const { result, out, err } = await capture(() => runStatusWrite(ctx));

  assert.equal(
    result.exit,
    STATUS_WRITE_READBACK_EXIT,
    'an unverifiable move fails closed, not soft-proceed'
  );
  assert.equal(
    editCalls.length,
    STATUS_WRITE_MAX_ATTEMPTS,
    'empty read-back retries the full budget before failing closed'
  );
  assert.equal(readBackCalls, STATUS_WRITE_MAX_ATTEMPTS, 'read-back runs after every attempt');
  assert.equal(
    out.filter((l) => l.includes('moved to')).length,
    0,
    'no success line — the write was never confirmed'
  );
  assert.ok(
    err.some((l) => l.includes('did NOT confirm')),
    'the loud refusal names the unconfirmed write'
  );
});

test('SKIP_NETWORK short-circuits the read-back entirely', async () => {
  let readBackCalls = 0;
  const ctx = {
    issueArg: '711',
    stateArg: 'develop',
    optionId: TARGET_OPTION,
    itemIdOverride: 'ITEM_1',
    SKIP_NETWORK: true,
    cfg: { repo: 'owner/repo', projectId: 'PROJ_1', kanbanFieldId: 'FIELD_1' },
    gh: async () => {
      throw new Error('gh must not be called under SKIP_NETWORK');
    },
    readBackStatusOptionId: async () => (readBackCalls++, WRONG_OPTION),
  };

  const { result } = await capture(() => runStatusWrite(ctx));
  assert.equal(result.exit, null, 'offline/dry runs still succeed');
  assert.equal(readBackCalls, 0, 'read-back is skipped under SKIP_NETWORK');
});

test('AC3: the drift-refusal message names a dropped/failed board-field write', () => {
  const src = readFileSync(
    path.join(repoRoot, 'scripts', 'task-tracker', 'lib', 'verb-preflight.mjs'),
    'utf8'
  );
  assert.ok(
    /dropped\/failed board-field write/.test(src),
    'the human-move refusal names a dropped/failed board-field write as a cause'
  );
});
