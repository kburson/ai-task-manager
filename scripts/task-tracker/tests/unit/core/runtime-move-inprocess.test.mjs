// @story #764
// #764 — the generic runtime mover (`ctx.runMoveState`, used by close.mjs) must
// drive state moves through the in-process `runMoveStateHost` seam instead of
// spawning `node scripts/gh/move-state.mjs`. The exported `runMoveStateInProcess`
// helper is the migrated body: it calls an injectable `host`, tee-captures the
// host's stdout/stderr so the exit-5 self-loop benign classification keeps exact
// parity with the pre-migration subprocess, and returns the same structured
// `{ ok, status, benign, stdout, stderr }` result close.mjs consumes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runMoveStateInProcess } from '../../../runtime.mjs';
import {
  governedOperationForLifecycleVerb,
  resolveGovernedLifecycleOperation,
} from '../../../../gh/move-state.mjs';

// A spy host mirroring runMoveStateHost's contract: RETURNS a numeric code and
// writes any readout/refusal text to process.stderr (which the migrated helper
// tee-captures). Never spawns a child.
function makeHost({ code = 0, stderr = '', stdout = '' } = {}) {
  const calls = [];
  const host = async (options) => {
    calls.push(options);
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    return code;
  };
  return { host, calls };
}

test('runMoveStateInProcess drives the in-process host with the right argv/env (no spawn)', async () => {
  const { host, calls } = makeHost({ code: 0, stdout: '✓ moved\n' });
  const res = await runMoveStateInProcess(123, 'develop', { silent: true }, { host });
  assert.equal(calls.length, 1, 'host called exactly once');
  const { argv, env } = calls[0];
  assert.deepEqual(argv.slice(1), ['move-state.mjs', '123', 'develop']);
  assert.equal(env.AITM_INTERNAL, '1');
  assert.equal(env.AITM_VERB_CONTEXT, 'runtime');
  assert.equal(calls[0].governedOperation, 'lifecycle-mutation');
  // #882 added `noop` to the structured result: false on an ordinary move.
  assert.deepEqual(res, {
    ok: true,
    status: 0,
    benign: false,
    noop: false,
    stdout: '✓ moved\n',
    stderr: '',
  });
});

test('lifecycle host uses exact specialized operations instead of verb aliases', async () => {
  assert.equal(governedOperationForLifecycleVerb('approve'), 'approval-mutation');
  assert.equal(governedOperationForLifecycleVerb('plan-approve'), 'approval-mutation');
  assert.equal(governedOperationForLifecycleVerb('review'), 'review-mutation');
  assert.equal(governedOperationForLifecycleVerb('close'), 'close');
  assert.equal(governedOperationForLifecycleVerb('end'), 'close');
  assert.equal(governedOperationForLifecycleVerb('dispatch'), 'branch-worktree-orchestration');
  assert.equal(governedOperationForLifecycleVerb('out-of-band'), 'lifecycle-mutation');
  assert.equal(governedOperationForLifecycleVerb('promote'), 'lifecycle-mutation');

  for (const [verbContext, operation] of [
    ['approve', 'approval-mutation'],
    ['review', 'review-mutation'],
    ['close', 'close'],
  ]) {
    const { host, calls } = makeHost();
    const withGovernedEffect = async () => {};
    await runMoveStateInProcess(
      1049,
      'review',
      { silent: true, verbContext, withGovernedEffect },
      { host }
    );
    assert.equal(calls[0].env.AITM_VERB_CONTEXT, verbContext);
    assert.equal(calls[0].governedOperation, operation);
    assert.equal(calls[0].withGovernedEffect, withGovernedEffect);
  }
});

test('lifecycle host refuses an explicit operation that does not match the verb', () => {
  assert.throws(
    () => resolveGovernedLifecycleOperation('review', 'lifecycle-mutation'),
    /governed operation lifecycle-mutation does not match review/
  );
  assert.equal(resolveGovernedLifecycleOperation('close', 'close'), 'close');
});

test('runMoveStateInProcess folds extraArgs (--force) into the synthetic argv', async () => {
  const { host, calls } = makeHost({ code: 0 });
  await runMoveStateInProcess(7, 'done', { silent: true, extraArgs: ['--force'] }, { host });
  assert.deepEqual(calls[0].argv.slice(1), ['move-state.mjs', '7', 'done', '--force']);
});

test('runMoveStateInProcess strips a leading # from the issue', async () => {
  const { host, calls } = makeHost({ code: 0 });
  await runMoveStateInProcess('#42', 'test', { silent: true }, { host });
  assert.equal(calls[0].argv[2], '42');
});

test('exit-5 done→done self-loop is classified benign via tee-captured stderr', async () => {
  const { host } = makeHost({
    code: 5,
    stderr:
      '\n⛔ Refusing to move #9 to done:\n   BLOCKED: illegal transition: done → done. Allowed: none.\n',
  });
  const res = await runMoveStateInProcess(9, 'done', { silent: true }, { host });
  assert.equal(res.ok, false);
  assert.equal(res.status, 5);
  assert.equal(res.benign, true, 'done→done self-loop must be benign');
});

test('exit-5 test→test self-loop is classified benign', async () => {
  const { host } = makeHost({
    code: 5,
    stderr: '   BLOCKED: illegal transition: test → test. Allowed: develop.\n',
  });
  const res = await runMoveStateInProcess(9, 'test', { silent: true }, { host });
  assert.equal(res.benign, true);
});

test('exit-5 genuine illegal transition (backlog→done) is NOT benign', async () => {
  const { host } = makeHost({
    code: 5,
    stderr: '   BLOCKED: illegal transition: backlog → done. Allowed: on-deck.\n',
  });
  const res = await runMoveStateInProcess(9, 'done', { silent: true }, { host });
  assert.equal(res.ok, false);
  assert.equal(res.benign, false, 'a real illegal jump to done must surface, not swallow');
});

test('SKIP_NETWORK short-circuits without calling the host', async () => {
  const { host, calls } = makeHost({ code: 0 });
  const res = await runMoveStateInProcess(1, 'develop', { skipNetwork: true }, { host });
  assert.equal(calls.length, 0, 'host must not be called when skipping network');
  assert.equal(res.ok, true);
  assert.equal(res.skipped, true);
});

test('process.stdout/stderr are restored after the in-process call', async () => {
  const beforeOut = process.stdout.write;
  const beforeErr = process.stderr.write;
  const { host } = makeHost({ code: 0, stdout: 'x\n', stderr: 'y\n' });
  await runMoveStateInProcess(1, 'develop', { silent: true }, { host });
  assert.equal(process.stdout.write, beforeOut, 'stdout.write restored');
  assert.equal(process.stderr.write, beforeErr, 'stderr.write restored');
});
