// @story #755
// #755 shape (a): demote, like promote, no longer spawns
// `node scripts/gh/move-state.mjs --demote` as a child — it calls the exported
// runMoveStateHost in-process with the demote verb-context env and a synthetic
// argv that preserves the `--demote` flag, returning the host's numeric exit
// code verbatim so runDemote's exitCode branching is unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defaultRunMoveState } from '../../../../task-tracker/verbs/demote.mjs';

test('defaultRunMoveState (demote) delegates to host with --demote argv + demote env', async () => {
  const seen = {};
  const host = async (opts) => {
    seen.opts = opts;
    return 0;
  };
  const code = await defaultRunMoveState({ issueNumber: 88, target: 'develop' }, { host });

  assert.equal(code, 0);
  assert.equal(seen.opts.argv[1], 'move-state.mjs');
  assert.equal(seen.opts.argv[2], '88');
  assert.equal(seen.opts.argv[3], 'develop');
  assert.ok(seen.opts.argv.includes('--demote'), 'argv must carry the --demote flag');
  assert.equal(seen.opts.env.AITM_VERB_CONTEXT, 'demote');
  assert.equal(seen.opts.env.AITM_INTERNAL, '1');
});

test('defaultRunMoveState (demote) returns the host exit code verbatim', async () => {
  const host = async () => 6;
  const code = await defaultRunMoveState({ issueNumber: 3, target: 'plan' }, { host });
  assert.equal(code, 6);
});
