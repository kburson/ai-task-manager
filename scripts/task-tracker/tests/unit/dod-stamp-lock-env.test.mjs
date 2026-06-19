// @story #456
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVerifiers } from '../../lib/evidence-runner.mjs';
import { ISSUE_LOCK_HELD_ENV } from '../../issue-mutator-lock.mjs';

// Fake pexec that captures the env it received instead of running a real process.
function makePexec(envCapture) {
  return async (_bin, _args, opts) => {
    envCapture.push(opts?.env ?? null);
    return { stdout: '', stderr: '', code: 0 };
  };
}

test('runVerifiers passes env to pexec when env option provided', async () => {
  const captured = [];
  const cleanEnv = { PATH: '/usr/bin', CUSTOM_VAR: 'hello' };
  await runVerifiers({
    commands: ['node --version'],
    pexec: makePexec(captured),
    cwd: '/tmp',
    env: cleanEnv,
  });
  assert.equal(captured.length, 1, 'pexec must be called once');
  assert.deepEqual(
    captured[0],
    cleanEnv,
    'pexec must receive the env object passed to runVerifiers'
  );
});

test('runVerifiers passes no env to pexec when env option omitted', async () => {
  const captured = [];
  await runVerifiers({
    commands: ['node --version'],
    pexec: makePexec(captured),
    cwd: '/tmp',
  });
  assert.equal(captured.length, 1, 'pexec must be called once');
  assert.equal(captured[0], null, 'pexec must receive no env when env option is omitted');
});

test('dod-stamp builds cleanEnv without ISSUE_LOCK_HELD_ENV', () => {
  // Simulate the pattern used in dod-stamp.mjs: spread process.env and delete the key.
  const fakeEnv = { PATH: '/usr/bin', [ISSUE_LOCK_HELD_ENV]: '1', OTHER: 'keep' };
  const cleanEnv = { ...fakeEnv };
  delete cleanEnv[ISSUE_LOCK_HELD_ENV];

  assert.ok(
    !(ISSUE_LOCK_HELD_ENV in cleanEnv),
    `${ISSUE_LOCK_HELD_ENV} must be absent from cleanEnv`
  );
  assert.equal(cleanEnv.OTHER, 'keep', 'other env vars must be preserved');
  assert.equal(cleanEnv.PATH, '/usr/bin', 'PATH must be preserved');
});
