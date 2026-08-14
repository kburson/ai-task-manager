// @story #755
// #755 shape (a): the move-state host body is an exported `runMoveStateHost`
// that RETURNS a numeric exit code and never calls process.exit. Verbs call it
// in-process and read that code (the same number the old subprocess exit code
// gave them). This test pins the return-not-exit contract: importing the module
// must NOT run the host, and the two cheapest input-validation paths
// (missing-args usage, unknown state) must resolve a code rather than kill the
// process. Both paths run with TT_SKIP_NETWORK so no GraphQL is touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runMoveStateHost } from '../../../../gh/move-state.mjs';

const BASE_ENV = { ...process.env, AITM_INTERNAL: '1', TT_SKIP_NETWORK: '1' };

test('runMoveStateHost is an importable function (module load has no host side effect)', () => {
  assert.equal(typeof runMoveStateHost, 'function');
});

test('runMoveStateHost returns 1 on an unknown state without exiting the process', async () => {
  const code = await runMoveStateHost({
    argv: [process.execPath, 'move-state.mjs', '999', 'bogus-state'],
    env: BASE_ENV,
    isTty: false,
  });
  assert.equal(code, 1);
});

test('runMoveStateHost returns 1 on missing args (usage) without exiting the process', async () => {
  const code = await runMoveStateHost({
    argv: [process.execPath, 'move-state.mjs'],
    env: BASE_ENV,
    isTty: false,
  });
  assert.equal(code, 1);
});
