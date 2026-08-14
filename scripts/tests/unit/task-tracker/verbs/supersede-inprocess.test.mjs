// @story #764
// #764 — supersede's `defaultRunMoveState` must drive the `done --supersede`
// jump through the in-process `runMoveStateHost` seam instead of spawning
// `node scripts/gh/move-state.mjs … --supersede`. It mirrors demote's migrated
// helper: an injectable `host` receives the synthetic argv (preserving the
// `--supersede` flag so the host's parse/matrix path is identical to the old
// CLI invocation) and the `AITM_INTERNAL` / `AITM_VERB_CONTEXT=supersede` env,
// and returns the same numeric exit code runSupersede's exitCode branch reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defaultRunMoveState } from '../../../../task-tracker/verbs/supersede.mjs';

test('supersede.defaultRunMoveState calls the in-process host with the supersede argv/env (no spawn)', async () => {
  const calls = [];
  const host = async ({ argv, env }) => {
    calls.push({ argv, env });
    return 0;
  };
  const code = await defaultRunMoveState({ issueNumber: 230 }, { host });
  assert.equal(code, 0);
  assert.equal(calls.length, 1, 'host called exactly once');
  const { argv, env } = calls[0];
  assert.deepEqual(argv.slice(1), ['move-state.mjs', '230', 'done', '--supersede']);
  assert.equal(env.AITM_INTERNAL, '1');
  assert.equal(env.AITM_VERB_CONTEXT, 'supersede');
});

test('supersede.defaultRunMoveState relays the host exit code verbatim', async () => {
  const host = async () => 3;
  const code = await defaultRunMoveState({ issueNumber: 9 }, { host });
  assert.equal(
    code,
    3,
    'a non-zero host code must surface so runSupersede reports transition-failed'
  );
});

test('supersede.mjs no longer spawns a move-state child', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../../../../task-tracker/verbs/supersede.mjs', import.meta.url)),
    'utf8'
  );
  assert.ok(
    !/spawn\(process\.execPath/.test(src),
    'the move-state child spawn must be gone — the jump runs in-process'
  );
  assert.ok(
    /runMoveStateHost/.test(src),
    'supersede.mjs must import and default to the in-process runMoveStateHost seam'
  );
});
