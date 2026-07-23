// @story #764
// #764 — reconcile's `revert-to-recorded` mover (`defaultRunMoveState`) must
// push the board back to the recorded state through the in-process
// `runMoveStateHost` seam instead of spawning `node scripts/gh/move-state.mjs`.
// It mirrors demote/supersede's migrated helper: an injectable `host` receives
// the synthetic argv (issue + target, no bypass flag) and the `AITM_INTERNAL` /
// `AITM_VERB_CONTEXT=reconcile` env, and returns the numeric exit code
// reconcile's exitCode branch reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defaultRunMoveState } from '../../../verbs/reconcile.mjs';

test('reconcile.defaultRunMoveState calls the in-process host with the revert argv/env (no spawn)', async () => {
  const calls = [];
  const host = async ({ argv, env }) => {
    calls.push({ argv, env });
    return 0;
  };
  const code = await defaultRunMoveState({ issueNumber: 512, target: 'develop' }, { host });
  assert.equal(code, 0);
  assert.equal(calls.length, 1, 'host called exactly once');
  const { argv, env } = calls[0];
  assert.deepEqual(argv.slice(1), ['move-state.mjs', '512', 'develop']);
  assert.equal(env.AITM_INTERNAL, '1');
  assert.equal(env.AITM_VERB_CONTEXT, 'reconcile');
});

test('reconcile.defaultRunMoveState relays the host exit code verbatim', async () => {
  const host = async () => 5;
  const code = await defaultRunMoveState({ issueNumber: 9, target: 'done' }, { host });
  assert.equal(
    code,
    5,
    'a non-zero host code must surface so revert-to-recorded reports the failure'
  );
});

test('reconcile.mjs no longer spawns a move-state child', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../../../verbs/reconcile.mjs', import.meta.url)),
    'utf8'
  );
  assert.ok(
    !/spawn\(process\.execPath/.test(src),
    'the move-state child spawn must be gone — the revert runs in-process'
  );
  assert.ok(
    /runMoveStateHost/.test(src),
    'reconcile.mjs must import and default to the in-process runMoveStateHost seam'
  );
});
