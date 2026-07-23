// @story #764
// Capstone parity: every production caller that used to spawn
// `node scripts/gh/move-state.mjs` now drives the in-process `runMoveStateHost`
// seam instead. This test pins the shared contract across ALL of them at once —
// promote, demote, runtime(→close), supersede, reconcile, dispatch — so a future
// edit to any one seam that drifts from the canonical shape is caught here rather
// than only in that caller's own unit test.
//
// The contract each seam must honour:
//   1. argv is the synthetic placeholder pair + positional args:
//      [execPath, 'move-state.mjs', <issue>, <target>, ...flags]
//      (parseMoveStateArgs reads from index 2, so argv[0..1] are placeholders).
//   2. env carries AITM_INTERNAL='1' (non-TTY internal invocation) and the
//      caller-specific AITM_VERB_CONTEXT.
//   3. the numeric exit code the host returns is relayed verbatim — no caller
//      remaps or swallows it. This is the exit-code parity the old cross-process
//      boundary gave us for free.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defaultRunMoveState as promoteSeam } from '../../../verbs/promote.mjs';
import { defaultRunMoveState as demoteSeam } from '../../../verbs/demote.mjs';
import { defaultRunMoveState as supersedeSeam } from '../../../verbs/supersede.mjs';
import { defaultRunMoveState as reconcileSeam } from '../../../verbs/reconcile.mjs';
import { defaultRunMoveState as dispatchSeam } from '../../../../gh/dispatch-prep.mjs';
import { runMoveStateInProcess } from '../../../runtime.mjs';

// Canonical exit codes move-state can return (verified in #764 deep-dive):
// 0=ok, 1=usage/unknown-state, 2=out-of-band-missing-reason, 3=verb-gate-refuse,
// 5=illegal-transition, 7=IssueLockError.
const CANONICAL_CODES = [0, 1, 2, 3, 5, 7];

// A spy host records the single call it receives and returns a preset code.
function spyHost(code) {
  const calls = [];
  const host = async (opts) => {
    calls.push(opts);
    return code;
  };
  return { host, calls };
}

// Each entry: how to invoke the seam with issue #42 → target, and the argv tail
// (everything after the two placeholders) + verb-context it must produce.
const SEAMS = [
  {
    name: 'promote',
    invoke: (host) => promoteSeam({ issueNumber: 42, target: 'test' }, { host }),
    tail: ['42', 'test'],
    context: 'promote',
  },
  {
    name: 'demote',
    invoke: (host) => demoteSeam({ issueNumber: 42, target: 'plan' }, { host }),
    tail: ['42', 'plan', '--demote'],
    context: 'demote',
  },
  {
    name: 'supersede',
    invoke: (host) => supersedeSeam({ issueNumber: 42 }, { host }),
    tail: ['42', 'done', '--supersede'],
    context: 'supersede',
  },
  {
    name: 'reconcile',
    invoke: (host) => reconcileSeam({ issueNumber: 42, target: 'develop' }, { host }),
    tail: ['42', 'develop'],
    context: 'reconcile',
  },
  {
    name: 'dispatch',
    invoke: (host) => dispatchSeam({ issue: 42 }, { host }),
    tail: ['42', 'develop'],
    context: 'dispatch',
  },
];

test('every caller seam produces the canonical argv shape + verb context', async () => {
  for (const seam of SEAMS) {
    const { host, calls } = spyHost(0);
    await seam.invoke(host);
    assert.equal(calls.length, 1, `${seam.name}: host must be called exactly once`);
    const { argv, env } = calls[0];
    assert.equal(argv[0], process.execPath, `${seam.name}: argv[0] is the exec-path placeholder`);
    assert.equal(argv[1], 'move-state.mjs', `${seam.name}: argv[1] is the script-name placeholder`);
    assert.deepEqual(
      argv.slice(2),
      seam.tail,
      `${seam.name}: positional args + flags must match the canonical tail`
    );
    assert.equal(env.AITM_INTERNAL, '1', `${seam.name}: must mark the internal invocation`);
    assert.equal(
      env.AITM_VERB_CONTEXT,
      seam.context,
      `${seam.name}: must stamp its own verb context`
    );
  }
});

test('every caller seam relays the host exit code verbatim', async () => {
  for (const seam of SEAMS) {
    for (const code of CANONICAL_CODES) {
      const { host } = spyHost(code);
      const returned = await seam.invoke(host);
      assert.equal(
        returned,
        code,
        `${seam.name}: must relay host code ${code} unchanged, got ${returned}`
      );
    }
  }
});

// runtime's seam is shaped differently — it wraps the host to capture stdout /
// stderr and returns a RESULT OBJECT (used by close) rather than the bare code —
// but the same three invariants hold: canonical argv, runtime verb context, and
// the code surfaced verbatim as `result.status`.
test('runtime(→close) seam: canonical argv + runtime context + status parity', async () => {
  for (const code of CANONICAL_CODES) {
    const { host, calls } = spyHost(code);
    const result = await runMoveStateInProcess(42, 'test', { skipNetwork: false }, { host });
    assert.equal(calls.length, 1, 'runtime: host must be called exactly once');
    const { argv, env } = calls[0];
    assert.equal(argv[0], process.execPath);
    assert.equal(argv[1], 'move-state.mjs');
    assert.deepEqual(argv.slice(2), ['42', 'test'], 'runtime: canonical positional args');
    assert.equal(env.AITM_INTERNAL, '1');
    assert.equal(env.AITM_VERB_CONTEXT, 'runtime', 'runtime: must stamp the runtime verb context');
    assert.equal(result.status, code, `runtime: result.status must equal host code ${code}`);
    assert.equal(result.ok, code === 0, 'runtime: ok iff code 0');
  }
});
