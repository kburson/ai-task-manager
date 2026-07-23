#!/usr/bin/env node
// @story #541
// `/task test` sandbox env boundary — pure assertions against `buildSandboxEnv`.
//
// The sandbox runner must hand `npm ci` and every Verification Command an
// ambient env scrubbed of the session-scoped `AITM_ISSUE_LOCK_HELD` flag.
// `promote` spawns the develop→test delegate while holding `withIssueLock`,
// which sets that flag in `process.env`; left unscrubbed it leaks all the way
// down to the move-state subprocess the lock-contention tests spawn, making
// move-state skip lock acquisition and the contention assertions silently pass.
// These tests pin the boundary behavior without spawning any process.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildSandboxEnv, SANDBOX_STRIPPED_ENV_VARS } from '../../../verbs/test.mjs';

test('AC1: strips AITM_ISSUE_LOCK_HELD from the inherited env', () => {
  const base = { PATH: '/usr/bin', AITM_ISSUE_LOCK_HELD: '1' };
  const out = buildSandboxEnv(base);
  assert.equal(out.AITM_ISSUE_LOCK_HELD, undefined, 'lock flag must be removed');
  assert.equal(out.PATH, '/usr/bin', 'unrelated vars preserved');
});

test('AC1: every var in SANDBOX_STRIPPED_ENV_VARS is removed', () => {
  const base = Object.fromEntries(SANDBOX_STRIPPED_ENV_VARS.map((k) => [k, 'x']));
  base.KEEP = 'me';
  const out = buildSandboxEnv(base);
  for (const k of SANDBOX_STRIPPED_ENV_VARS) {
    assert.equal(out[k], undefined, `${k} must be stripped`);
  }
  assert.equal(out.KEEP, 'me');
});

test('AC1: overrides are applied after the scrub and win', () => {
  const base = { AITM_ISSUE_LOCK_HELD: '1', FOO: 'old' };
  const out = buildSandboxEnv(base, { AI_TASK_MANAGER_PROJECT_DIR: '/proj', FOO: 'new' });
  assert.equal(out.AITM_ISSUE_LOCK_HELD, undefined);
  assert.equal(out.AI_TASK_MANAGER_PROJECT_DIR, '/proj');
  assert.equal(out.FOO, 'new');
});

test('AC1: does not mutate the input env object', () => {
  const base = { AITM_ISSUE_LOCK_HELD: '1', PATH: '/bin' };
  buildSandboxEnv(base);
  assert.equal(base.AITM_ISSUE_LOCK_HELD, '1', 'input must be left untouched');
});
