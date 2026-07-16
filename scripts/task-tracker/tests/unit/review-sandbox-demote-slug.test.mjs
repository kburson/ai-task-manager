// @story #844 (D6 — sandbox-verify-fail demote emits review:failed, not bare develop)
// #844 (D6) — the review verb has TWO demote-to-Develop paths. The gate-objection
// path (fixed by #831, guarded by review-verb-timing-order.test.mjs) emits a
// V3-legal `review:failed` audit row and demotes with `--demote`. The
// SANDBOX-VERIFICATION-FAILURE path was left emitting a bare `develop` ladder
// slug (which V3 `timing-log-sequence` rejects as `malformed — unknown event
// slug "develop"`) and demoting WITHOUT `--demote` — permanently failing the
// Agent Review Gate on any issue whose Review-stage re-verify failed (the live
// #823 stranding). These tests pin the corrected emission so the bare-`develop`
// regression cannot return.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { emitSandboxVerificationFailureTimeline } from '../../verbs/review.mjs';
import { validate as validateTimingSequence } from '../../lib/agent-review/validators/timing-log-sequence.mjs';

// Drive the helper with fakes that record every emitted Event slug and every
// runMoveState invocation. A fake buildRow carries the Event slug through
// safePostTiming (the real buildRow rejects a retroactive ts, and we assert
// slug/flags, not formatting).
function drive() {
  const posted = []; // event slugs handed to safePostTiming
  const moves = []; // { state, extraArgs }
  const deps = {
    buildRow: ({ event }) => ({ event }),
    safePostTiming: async (_target, row) => {
      posted.push(row.event);
    },
    runMoveState: async (_target, state, opts = {}) => {
      moves.push({ state, extraArgs: Array.isArray(opts.extraArgs) ? opts.extraArgs : [] });
      return { ok: true };
    },
  };
  return { posted, moves, deps };
}

test('sandbox-verify-fail: emits a `review:failed` audit slug, never a bare `develop`', async () => {
  const { posted, moves, deps } = drive();
  await emitSandboxVerificationFailureTimeline({
    target: '#844',
    ts: '2026-07-16T00:00:00.000Z',
    delta: { activeSec: 12, idleSec: 0 },
    wordMarker: 7,
    deps,
  });

  assert.deepEqual(posted, ['review:failed'], 'the audit row event must be review:failed');
  assert.ok(
    !posted.includes('develop'),
    'a bare `develop` ladder slug must never be emitted (V3-malformed, blocks the gate)'
  );
  // The demote move is present exactly once.
  const demoteMoves = moves.filter((m) => m.state === 'develop');
  assert.equal(demoteMoves.length, 1, 'exactly one Review→Develop move');
});

test('sandbox-verify-fail: demotes with `--demote` + `--demote-reason` (canonical demoted:develop entry row)', async () => {
  const { moves, deps } = drive();
  await emitSandboxVerificationFailureTimeline({
    target: '#844',
    ts: '2026-07-16T00:00:00.000Z',
    delta: { activeSec: 0, idleSec: 0 },
    wordMarker: 0,
    deps,
  });

  const move = moves.find((m) => m.state === 'develop');
  assert.ok(move, 'a Review→Develop move is issued');
  assert.ok(move.extraArgs.includes('--demote'), 'the move carries --demote');
  const ri = move.extraArgs.indexOf('--demote-reason');
  assert.notEqual(ri, -1, 'the move carries --demote-reason');
  assert.equal(move.extraArgs[ri + 1], 'sandbox verification failed', 'reason is descriptive');
});

test('sandbox-verify-fail: the produced audit slug is accepted by V3 timing-log-sequence (bare `develop` is not)', async () => {
  const { posted, deps } = drive();
  await emitSandboxVerificationFailureTimeline({
    target: '#844',
    ts: '2026-07-16T00:00:03.000Z',
    delta: { activeSec: 3, idleSec: 0 },
    wordMarker: 0,
    deps,
  });
  const producedSlug = posted[0]; // 'review:failed'

  // Build a minimal, V3-legal timing log that walks develop → test → review,
  // then splices the produced audit slug (an audit row does not move the walk)
  // followed by the canonical demote back to develop.
  const makeLog = (auditSlug) =>
    [
      '## ⏱ Timing Log',
      '',
      '| Timestamp | Event | Engaged | Idle | ΔWords | Description |',
      '|---|---|---|---|---|---|',
      '| 2026-07-16T00:00:00.000Z | develop:started | 0h 00m 00s | 0h | 0 | start development |',
      '| 2026-07-16T00:00:01.000Z | develop:completed | 0h 00m 01s | 0h | 0 | development complete |',
      '| 2026-07-16T00:00:01.000Z | test:started | 0h 00m 00s | 0h | 0 | start testing |',
      '| 2026-07-16T00:00:02.000Z | test:passed | 0h 00m 01s | 0h | 0 | testing complete |',
      '| 2026-07-16T00:00:02.000Z | review:started | 0h 00m 00s | 0h | 0 | start review |',
      `| 2026-07-16T00:00:03.000Z | ${auditSlug} | 0h 00m 01s | 0h | 0 | sandbox verification failed, reverted to Develop |`,
      '| 2026-07-16T00:00:04.000Z | demoted:develop | 0h 00m 01s | 0h | 0 | reverted to develop |',
      '| 2026-07-16T00:00:04.000Z | develop:started | 0h 00m 00s | 0h | 0 | start development |',
    ].join('\n');

  const context = {
    comments: [{ body: makeLog(producedSlug) }],
    markers: {
      enteredStages: [{ stage: 'develop' }, { stage: 'test' }, { stage: 'review' }],
    },
  };
  const res = validateTimingSequence(context);
  assert.equal(
    res.pass,
    true,
    `V3 must accept the corrected log; failures: ${JSON.stringify(res.failures)}`
  );

  // Regression sentinel: the OLD bare `develop` slug in the same slot is rejected
  // as malformed — this is exactly the failure that stranded #823.
  const bad = validateTimingSequence({ ...context, comments: [{ body: makeLog('develop') }] });
  assert.equal(bad.pass, false, 'a bare `develop` audit slug must be rejected by V3');
  assert.ok(
    bad.failures.some((f) => /unknown event slug "develop"/.test(f)),
    `bare develop should fail as malformed; got ${JSON.stringify(bad.failures)}`
  );
});
