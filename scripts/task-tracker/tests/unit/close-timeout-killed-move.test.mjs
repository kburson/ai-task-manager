#!/usr/bin/env node
// @story #752
// Regression: a terminal review→done close whose move-state child is
// SIGTERM-killed mid-tail (its board write already committed) must NOT print a
// false `⛔ ... Issue left OPEN`.
//
// Root cause (the read side): when the killed child returns non-benign failure,
// close re-reads the board ONCE to disambiguate a real failure from a race. Under
// GitHub Projects read-after-write lag that single read can still return the
// pre-move column, so `decideBoardMoveFailure` — which already treats
// board=='done' as benign — is fed a stale value and surfaces `true`.
//
// The fix: `resolveBoardStateForClose` re-reads with bounded exponential backoff,
// short-circuiting the instant it reads 'done' and returning the last value
// otherwise. Under lag the board converges → surface:false; a GENUINE failure
// (board never Done) still reads non-done every attempt → surface:true.
//
// vc:1 = node --test scripts/task-tracker/tests/unit/close-timeout-killed-move.test.mjs

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { resolveBoardStateForClose, decideBoardMoveFailure } from '../../lib/close-convergence.mjs';

// A SIGTERM-killed move-state child: execFile rejects with code:null,
// signal:'SIGTERM'; runtime.buildMoveStateErrorResult yields ok:false,
// benign:false, status:null. This is the exact #752 moveResult shape.
const KILLED_MOVE = { ok: false, benign: false, status: null, stderr: '' };

// A getIssueBoardState stub that returns each queued value in turn, recording
// how many reads happened, then repeats the final value.
function boardReader(sequence) {
  let i = 0;
  const reads = [];
  const fn = async (active) => {
    const value = sequence[Math.min(i, sequence.length - 1)];
    i += 1;
    reads.push(active);
    return value;
  };
  fn.reads = reads;
  return fn;
}

test('AC1/AC2/#752: kill-mid-tail + read-after-write lag converges — no false failure', async () => {
  // The board committed Done but the first two reads still observe the stale
  // 'review' column (Projects lag); the third read sees 'done'.
  const getIssueBoardState = boardReader(['review', 'review', 'done']);
  const sleeps = [];
  const boardState = await resolveBoardStateForClose({
    getIssueBoardState,
    active: 752,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  assert.equal(boardState, 'done', 'the retried re-read converges on the committed Done');
  assert.equal(getIssueBoardState.reads.length, 3, 'it retried until the board read Done');
  assert.deepEqual(sleeps, [500, 1000], 'exponential backoff between the pre-convergence reads');

  const decision = decideBoardMoveFailure({ moveResult: KILLED_MOVE, boardState });
  assert.equal(decision.surface, false, 'the killed-but-committed move is NOT surfaced as failure');
  assert.equal(decision.reason, 'board-already-done');
});

test('AC1: a GENUINE failure (board never reaches Done) still surfaces', async () => {
  const getIssueBoardState = boardReader(['review']); // never converges
  const sleeps = [];
  const boardState = await resolveBoardStateForClose({
    getIssueBoardState,
    active: 752,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  assert.equal(boardState, 'review', 'the last observed value is returned unchanged');
  assert.equal(getIssueBoardState.reads.length, 4, 'all attempts were spent before giving up');
  assert.deepEqual(sleeps, [500, 1000, 2000], 'backoff ran between every attempt');

  const decision = decideBoardMoveFailure({ moveResult: KILLED_MOVE, boardState });
  assert.equal(decision.surface, true, 'a board that never reaches Done is a genuine failure');
  assert.equal(decision.reason, 'board-not-done');
});

test('AC5: happy path — first read is Done ⇒ exactly one read, no sleep', async () => {
  const getIssueBoardState = boardReader(['done']);
  let slept = false;
  const boardState = await resolveBoardStateForClose({
    getIssueBoardState,
    active: 752,
    sleep: async () => {
      slept = true;
    },
  });

  assert.equal(boardState, 'done');
  assert.equal(getIssueBoardState.reads.length, 1, 'a converged board is read exactly once');
  assert.equal(slept, false, 'the happy path never sleeps — behaviorally unchanged');
});

test('AC5: an ok move short-circuits the decision without re-reading at all', () => {
  // close only calls resolveBoardStateForClose when the move is non-benign
  // failed; an ok/benign move feeds boardState:'done' directly. Guard that the
  // decision itself is unchanged for the ok case.
  const decision = decideBoardMoveFailure({ moveResult: { ok: true }, boardState: 'done' });
  assert.equal(decision.surface, false);
  assert.equal(decision.reason, 'ok-or-benign');
});
