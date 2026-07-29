// @story #925
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { decideCloseConvergence } from '../../../lib/close-convergence.mjs';

const expanded = {
  stateReason: 'completed',
  nonLifecycleBoxesAllTicked: true,
  fullAuto: false,
};

test('repair retains highest precedence across every closed-issue signal', () => {
  for (const boardState of ['review', 'done', null]) {
    for (const issueClosed of [true, false, null]) {
      for (const stateReason of ['completed', 'not_planned', 'duplicate', null]) {
        for (const nonLifecycleBoxesAllTicked of [true, false]) {
          assert.deepEqual(
            decideCloseConvergence({
              boardState,
              issueClosed,
              stateReason,
              nonLifecycleBoxesAllTicked,
              fullAuto: true,
              repair: true,
            }),
            { action: 'proceed', repair: true }
          );
        }
      }
    }
  }
});

test('pending recovery outranks every non-repair close decision', () => {
  for (const recoveryPhase of ['intent', 'reopened', 'review', 'timing']) {
    for (const boardState of ['review', 'done', null]) {
      for (const issueClosed of [true, false, null]) {
        assert.deepEqual(
          decideCloseConvergence({
            boardState,
            issueClosed,
            stateReason: issueClosed ? 'not_planned' : null,
            recoveryPhase,
          }),
          { action: 'aberration', resume: true }
        );
      }
    }
  }
});

test('repair remains above pending recovery and complete recovery is not pending', () => {
  assert.deepEqual(
    decideCloseConvergence({
      repair: true,
      issueClosed: false,
      recoveryPhase: 'review',
    }),
    { action: 'proceed', repair: true }
  );
  assert.deepEqual(
    decideCloseConvergence({
      issueClosed: false,
      boardState: 'review',
      recoveryPhase: 'complete',
    }),
    { action: 'proceed' }
  );
});

test('closed non-delivery dispositions are dead and untouched', () => {
  for (const stateReason of ['not_planned', 'NOT_PLANNED', 'duplicate', 'DUPLICATE', null]) {
    for (const boardState of ['review', 'develop', 'done', null]) {
      for (const nonLifecycleBoxesAllTicked of [true, false]) {
        assert.deepEqual(
          decideCloseConvergence({
            boardState,
            issueClosed: true,
            stateReason,
            nonLifecycleBoxesAllTicked,
            fullAuto: false,
          }),
          { action: 'dead' }
        );
      }
    }
  }
});

test('completed issue already at Done is a noop regardless of integrity or mode', () => {
  for (const nonLifecycleBoxesAllTicked of [true, false]) {
    for (const fullAuto of [true, false]) {
      assert.deepEqual(
        decideCloseConvergence({
          boardState: 'done',
          issueClosed: true,
          stateReason: 'COMPLETED',
          nonLifecycleBoxesAllTicked,
          fullAuto,
        }),
        { action: 'noop', boardDrift: false }
      );
    }
  }
});

test('completed not-Done issue finalizes only when integrity is satisfied', () => {
  for (const boardState of ['review', 'develop', null]) {
    for (const fullAuto of [true, false]) {
      assert.deepEqual(
        decideCloseConvergence({
          boardState,
          issueClosed: true,
          stateReason: 'completed',
          nonLifecycleBoxesAllTicked: true,
          fullAuto,
        }),
        { action: 'finalize' }
      );
      assert.deepEqual(
        decideCloseConvergence({
          boardState,
          issueClosed: true,
          stateReason: 'completed',
          nonLifecycleBoxesAllTicked: false,
          fullAuto,
        }),
        { action: 'aberration' }
      );
    }
  }
});

test('open close-first and normal pipeline paths retain their actions', () => {
  assert.deepEqual(
    decideCloseConvergence({ boardState: 'done', issueClosed: false, ...expanded }),
    { action: 'close-issue' }
  );
  assert.deepEqual(
    decideCloseConvergence({ boardState: 'review', issueClosed: false, ...expanded }),
    { action: 'proceed' }
  );
});

test('unknown issue state never assumes a terminal action', () => {
  for (const boardState of ['done', 'review', null]) {
    assert.deepEqual(decideCloseConvergence({ boardState, issueClosed: null, ...expanded }), {
      action: 'proceed',
    });
  }
});

test('legacy callers without expanded signals retain the pre-925 closed behavior', () => {
  assert.deepEqual(decideCloseConvergence({ boardState: 'done', issueClosed: true }), {
    action: 'noop',
    boardDrift: false,
  });
  assert.deepEqual(decideCloseConvergence({ boardState: 'review', issueClosed: true }), {
    action: 'noop',
    boardDrift: true,
  });
});
