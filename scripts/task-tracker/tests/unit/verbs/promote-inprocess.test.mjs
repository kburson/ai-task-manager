// @story #755
// #755 shape (a): promote no longer spawns `node scripts/gh/move-state.mjs` as a
// child process — it calls the exported `runMoveStateHost` in-process and reads
// the returned numeric exit code (the same number the subprocess exit code gave
// it, so runPromote's `transitionResult.exitCode !== 0` branching is unchanged).
// In-process is strictly more worktree-safe: the host resolves project context
// from the caller's cwd via getProjectDir, never the package install dir.
//
// These tests pin the seam: defaultRunMoveState must (1) delegate to the host
// with the promote verb-context env and the synthetic move-state argv, and
// (2) return the host's numeric code verbatim. A recording fake stands in for
// the host so no network or real board write occurs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defaultRunMoveState } from '../../../verbs/promote.mjs';

test('defaultRunMoveState delegates to runMoveStateHost with promote env + synthetic argv', async () => {
  const seen = {};
  const host = async (opts) => {
    seen.opts = opts;
    return 0;
  };
  const code = await defaultRunMoveState({ issueNumber: 512, target: 'test' }, { host });

  assert.equal(code, 0);
  // synthetic argv: [execPath, 'move-state.mjs', <issue>, <target>]
  assert.equal(seen.opts.argv[1], 'move-state.mjs');
  assert.equal(seen.opts.argv[2], '512');
  assert.equal(seen.opts.argv[3], 'test');
  // verb-context env so the host's verb-pipeline gate admits the call
  assert.equal(seen.opts.env.AITM_VERB_CONTEXT, 'promote');
  assert.equal(seen.opts.env.AITM_INTERNAL, '1');
});

test('defaultRunMoveState returns the host exit code verbatim (non-zero preserved)', async () => {
  const host = async () => 5;
  const code = await defaultRunMoveState({ issueNumber: 7, target: 'review' }, { host });
  assert.equal(code, 5);
});
