// @story #2088
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNativeSession,
  assertNativeHookSession,
  NATIVE_BOOTSTRAP_COMMAND,
} from '../../../../task-tracker/lib/native-worktree-bootstrap.mjs';
import {
  bindingProofNonce,
  validateBindingNonce,
  compareBindingObservations,
} from '../../../../task-tracker/lib/native-binding-proof.mjs';
import { parseDoctorArgs } from '../../../../package/doctor.mjs';

const sid = 'native-unit-worker';
const env = { CODEX_THREAD_ID: sid, CODEX_SESSION_ID: sid };
const nonce = 'a'.repeat(32);
const tuple = {
  sessionId: sid,
  root: '/worker',
  branch: 'codex/worker',
  sourceHead: 'a'.repeat(40),
  issue: '#2088',
  bindingGenerationId: 'native-generation',
  state: 'develop',
  entryStartTs: '2026-10-23T02:00:00.000Z',
};

test('native identity requires Codex and rejects resolver overrides or disagreement', () => {
  assert.doesNotThrow(() => assertNativeSession(sid, env));
  for (const candidate of [
    {},
    { CLAUDE_SESSION_ID: sid },
    { ...env, CODEX_SESSION_ID: 'foreign' },
    { ...env, AI_TASK_MANAGER_SESSION_ID: sid },
    { ...env, AI_TASK_MANAGER_PROJECT_DIR: '/foreign' },
  ])
    assert.throws(() => assertNativeSession(sid, candidate));
  assert.throws(() => assertNativeSession('../foreign', env));
});
test('closed binding diagnostic recognizes only literal canonical invocation forms', () => {
  const command = 'npx aitm doctor --json --binding-proof ' + nonce;
  assert.equal(bindingProofNonce(command), nonce);
  assert.equal(bindingProofNonce('env AITM_GRAPHQL_USAGE=1 TT_FULL_AUTO=1 ' + command), nonce);
  for (const candidate of [
    command + '; echo extra',
    command + ' > receipt',
    command + ' --json',
    'env ' + command,
    command.replace(nonce, '../escape'),
  ])
    assert.equal(bindingProofNonce(candidate), null);
  assert.equal(NATIVE_BOOTSTRAP_COMMAND, 'bash scripts/dev-env/setup-local-worktree.sh');
});
test('nonce and doctor argument contracts remain closed', () => {
  assert.equal(validateBindingNonce(nonce), true);
  assert.equal(validateBindingNonce('b'.repeat(64)), true);
  for (const value of ['a'.repeat(31), 'a'.repeat(65), 'A'.repeat(32), '../escape', null])
    assert.equal(validateBindingNonce(value), false);
  assert.deepEqual(parseDoctorArgs([]), { json: false });
  assert.deepEqual(parseDoctorArgs(['--json']), { json: true });
  assert.deepEqual(parseDoctorArgs(['--json', '--binding-proof', nonce]), {
    json: true,
    bindingProof: nonce,
  });
  for (const args of [
    ['--binding-proof', nonce],
    ['--json', '--binding-proof', nonce, '--json'],
    ['--json', '--binding-proof', '../escape'],
  ])
    assert.throws(() => parseDoctorArgs(args));
});
test('binding comparison matches every dimension exactly without changing either observation', () => {
  const cli = Object.freeze({ ...tuple });
  const hook = Object.freeze({ ...tuple });
  assert.deepEqual(compareBindingObservations(hook, cli), []);
  for (const key of Object.keys(tuple))
    assert.deepEqual(compareBindingObservations({ ...hook, [key]: 'foreign' }, cli), [key]);
  assert.deepEqual(cli, tuple);
  assert.deepEqual(hook, tuple);
});
test('binding comparison refuses malformed or extended observations', () => {
  for (const invalid of [null, [], {}, { ...tuple, extra: true }])
    assert.throws(() => compareBindingObservations(invalid, tuple));
  const { sessionId, ...partial } = tuple;
  assert.equal(sessionId, sid);
  assert.throws(() => compareBindingObservations(tuple, partial));
});

test('identity refusal exposes actual hook and hook-environment resolver observations', () => {
  assert.throws(
    () => assertNativeSession(sid, { CODEX_THREAD_ID: 'foreign-native' }),
    (error) =>
      error.message.includes('hook=' + sid) && error.message.includes('resolved=foreign-native')
  );
});

test('hook identity uses the actual payload without resolver fallback and corroborates optional native environment', () => {
  assert.doesNotThrow(() => assertNativeHookSession(sid, {}));
  assert.doesNotThrow(() => assertNativeHookSession(sid, env));
  assert.throws(() => assertNativeHookSession('default-session', {}));
  assert.throws(() => assertNativeHookSession(sid, { ...env, CODEX_THREAD_ID: 'foreign-native' }));
  assert.throws(() => assertNativeHookSession(sid, { AI_TASK_MANAGER_SESSION_ID: sid }));
});
