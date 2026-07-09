// @story #764
// #764 — dispatch-prep.mjs is a fourth production caller of the move-state CLI
// (the deep-dive's "3 spawn sites" enumeration missed it). Its orchestrator
// board-flip (`node scripts/gh/move-state.mjs <issue> develop`) must run through
// the in-process `runMoveStateHost` seam so the standalone CLI entrypoint can be
// retired. It mirrors demote/promote's migrated helper: an injectable `host`
// receives the synthetic argv (issue + `develop`, no bypass flag) and the
// `AITM_INTERNAL` / `AITM_VERB_CONTEXT=dispatch` env, and returns the numeric
// exit code dispatch-prep now reads instead of catching an execFile rejection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defaultRunMoveState } from '../../../gh/dispatch-prep.mjs';

test('dispatch-prep.defaultRunMoveState calls the in-process host with the develop argv/env (no spawn)', async () => {
  const calls = [];
  const host = async ({ argv, env }) => {
    calls.push({ argv, env });
    return 0;
  };
  const code = await defaultRunMoveState({ issue: 42 }, { host });
  assert.equal(code, 0);
  assert.equal(calls.length, 1, 'host called exactly once');
  const { argv, env } = calls[0];
  assert.deepEqual(argv.slice(1), ['move-state.mjs', '42', 'develop']);
  assert.equal(env.AITM_INTERNAL, '1');
  assert.equal(env.AITM_VERB_CONTEXT, 'dispatch');
});

test('dispatch-prep.defaultRunMoveState relays the host exit code verbatim', async () => {
  const host = async () => 3;
  const code = await defaultRunMoveState({ issue: 9 }, { host });
  assert.equal(code, 3, 'a non-zero host code must surface so dispatch reports the flip failure');
});

test('dispatch-prep.mjs no longer spawns a move-state child', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../../../gh/dispatch-prep.mjs', import.meta.url)),
    'utf8'
  );
  assert.ok(
    !/pexec\(\s*'node'/.test(src) && !/pexec\(process\.execPath/.test(src),
    'the move-state child spawn must be gone — the board flip runs in-process'
  );
  assert.ok(
    /runMoveStateHost/.test(src),
    'dispatch-prep.mjs must import and default to the in-process runMoveStateHost seam'
  );
});
