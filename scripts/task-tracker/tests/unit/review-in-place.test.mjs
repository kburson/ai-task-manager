// @story #882
//
// Re-running a state's verb while the issue is already in that state must simply
// re-execute the state's action. The reported case: `review <N>` on an issue
// already in Review died on its first act — the move — with
// `BLOCKED: illegal transition: review → review`, and the failure path demoted
// the issue to Develop, discarding its Test-stage verification.
//
// Two properties are pinned here:
//   1. The real `runMoveStateHost` short-circuits a self-transition and exits 0
//      WITHOUT performing the move (no guard pipeline, no body mutation, no
//      entry marker, no timing row, no board write). A satisfied no-op must not
//      re-enter the state — re-entry would double-stamp `aitm-entered-<stage>`
//      and open a duplicate stage-timing row.
//   2. The verb-layer guards that consume the structured move result read the
//      no-op as success, not as a refusal.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runMoveStateHost } from '../../../gh/move-state.mjs';
import { runMoveStateInProcess, isMoveStateNoop } from '../../runtime.mjs';

// Drive the real host with the network disabled and an explicit `--from`, so the
// self-transition is resolved from the flag rather than a live board read. The
// host writes to the real streams; capture them the way runMoveStateInProcess does.
async function runHost(issue, to, from) {
  const outParts = [];
  const errParts = [];
  const realOut = process.stdout.write;
  const realErr = process.stderr.write;
  const capture =
    (parts) =>
    (chunk, ...rest) => {
      const cb = typeof rest[rest.length - 1] === 'function' ? rest[rest.length - 1] : undefined;
      parts.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      if (cb) cb();
      return true;
    };
  process.stdout.write = capture(outParts);
  process.stderr.write = capture(errParts);
  let code;
  try {
    code = await runMoveStateHost({
      argv: [process.execPath, 'move-state.mjs', String(issue), to, '--from', from],
      env: {
        ...process.env,
        TT_SKIP_NETWORK: '1',
        AITM_INTERNAL: '1',
        AITM_VERB_CONTEXT: 'review',
      },
      isTty: false,
    });
  } finally {
    process.stdout.write = realOut;
    process.stderr.write = realErr;
  }
  return { code, stdout: outParts.join(''), stderr: errParts.join('') };
}

test('move to review while already in review exits 0 as a no-op (the reported defect)', async () => {
  const { code, stdout, stderr } = await runHost(882, 'review', 'review');
  assert.equal(code, 0, 'self-transition must not refuse');
  assert.doesNotMatch(stderr, /illegal transition/i, 'no matrix refusal');
  assert.doesNotMatch(stderr, /Refusing to move/i);
  assert.match(stdout, /already in review/i, 'human-readable no-op readout');
  assert.equal(isMoveStateNoop(stdout), true, 'machine token emitted');
});

test('the no-op path performs no move — no entry stamp, no timing row, no board write', async () => {
  const { stdout } = await runHost(882, 'review', 'review');
  // The success readout's verified-step lines are the observable signature of a
  // move actually happening. None may appear on the no-op path.
  assert.doesNotMatch(stdout, /moved to:/i);
  assert.doesNotMatch(stdout, /entry stamp/i);
  assert.doesNotMatch(stdout, /entry row/i);
  assert.doesNotMatch(stdout, /exit flush/i);
  assert.doesNotMatch(stdout, /aitm-move-complete/i);
});

test('every state is re-runnable in place, not just review', async () => {
  for (const s of ['develop', 'test', 'review', 'done']) {
    const { code, stdout } = await runHost(882, s, s);
    assert.equal(code, 0, `${s} → ${s} must exit 0`);
    assert.equal(isMoveStateNoop(stdout), true, `${s} → ${s} must emit the no-op token`);
  }
});

test('a genuine illegal transition still refuses with exit 5', async () => {
  const { code, stderr } = await runHost(882, 'done', 'refine');
  assert.equal(code, 5);
  assert.match(stderr, /illegal transition: refine → done/);
});

test('the structured result reads as success, so verb guards do not treat it as a refusal', async () => {
  const res = await runMoveStateInProcess(
    882,
    'review',
    { silent: true, extraArgs: ['--from', 'review'], env: { TT_SKIP_NETWORK: '1' } },
    { host: runMoveStateHost }
  );
  assert.equal(res.ok, true, 'no-op is a success, not a failure');
  assert.equal(res.noop, true, 'and is distinguishable from a real move');

  // verbs/review.mjs:844 — the authoritative Test→Review move is surfaced as a
  // gate failure on `ok === false && benign !== true`. A no-op must pass it, so
  // the Agent Review Gate runs in place and the issue is never demoted.
  assert.equal(res.ok === false && res.benign !== true, false, 'review guard must not trip');

  // verbs/test.mjs:565 — the in-place re-verify banner. Its condition was keyed
  // on the old exit-5 benign shape; it must still recognize the no-op.
  assert.equal(
    res.noop === true || (res.ok === false && res.benign === true),
    true,
    'reverified status must survive the no-op change'
  );
});
