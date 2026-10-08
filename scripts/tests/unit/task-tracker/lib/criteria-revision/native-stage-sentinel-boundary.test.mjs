// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../../../../task-tracker/lib/criteria-revision/store.mjs';
import * as core from '../../../../../task-tracker/lib/move-state/move-state-core.mjs';
import { withMemoryStageEffectQuarantine } from '../../../../../task-tracker/lib/criteria-revision/transport-quarantine.mjs';

const roots = [
  ['persist', store.persistMemoryNativeStageSentinel, true],
  ['intent comparison', store.assertMemoryNativeStageSentinelIntent, false],
  ['write', store.writeMemoryNativeStageSentinel, false],
  ['readback', store.completeMemoryNativeStageSentinel, false],
];
const authority = (extended) => ({
  backend: {},
  capability: {},
  context: {
    repository: 'example/criteria',
    issue: 124,
    executor: { provider: 'codex', sessionId: 'fixture', worktree: process.cwd() },
  },
  token: {},
  invocation: {},
  ...(extended ? { step: {} } : {}),
});
const category = (value) => (error) =>
  error instanceof TypeError && error.message === 'criteria-revision:' + value;
for (const [name, invoke, extended] of roots) {
  test(`sentinel ${name} refuses every authority accessor before reading it`, async () => {
    const calls = [];
    for (const key of Object.keys(authority(extended))) {
      const input = authority(extended);
      Object.defineProperty(input, key, {
        enumerable: true,
        configurable: true,
        get() {
          calls.push(key);
          throw new Error('must not read supplied accessor');
        },
      });
      await assert.rejects(async () => invoke(input), category('native-stage-sentinel-input'));
    }
    assert.deepEqual(calls, []);
  });
  test(`sentinel ${name} rejects inherited hidden symbolic and extra authority keys`, async () => {
    for (const shape of ['inherited', 'null-prototype', 'hidden', 'symbol', 'extra', 'missing']) {
      const input = authority(extended);
      if (shape === 'inherited') Object.setPrototypeOf(input, { authority: true });
      if (shape === 'null-prototype') Object.setPrototypeOf(input, null);
      if (shape === 'hidden') Object.defineProperty(input, 'token', { enumerable: false });
      if (shape === 'symbol') input[Symbol('authority')] = true;
      if (shape === 'extra') input.ready = true;
      if (shape === 'missing') delete input.token;
      await assert.rejects(
        async () => invoke(input),
        category('native-stage-sentinel-input'),
        shape
      );
    }
  });
  test(`sentinel ${name} validates nested context before capability property access`, async () => {
    const calls = [];
    for (const field of ['issue', 'executor', 'nested-session']) {
      const input = authority(extended);
      const target = field === 'nested-session' ? input.context.executor : input.context;
      const key = field === 'nested-session' ? 'sessionId' : field;
      Object.defineProperty(target, key, {
        enumerable: true,
        configurable: true,
        get() {
          calls.push(field);
          throw new Error('must not read nested accessor');
        },
      });
      await assert.rejects(async () => invoke(input), category('native-stage-sentinel-context'));
    }
    assert.deepEqual(calls, []);
  });
}

test('loaded sentinel code never selects an unowned context or body wrapper', async () => {
  const calls = [],
    input = {
      get issueArg() {
        calls.push('issue');
        return 124;
      },
      get mutate() {
        calls.push('mutate');
        return () => '';
      },
    };
  await assert.rejects(
    withMemoryStageEffectQuarantine(() => core.defaultWriteSentinel(input)),
    (error) =>
      error.code === 'revision-authority-unavailable' &&
      error.preparationReason === 'original-sentinel-context'
  );
  assert.throws(
    () => core.assertNativeStageBodyDelta(input, '', ''),
    (error) =>
      error.code === 'revision-authority-unavailable' &&
      error.preparationReason === 'original-body-wrapper'
  );
  assert.deepEqual(calls, []);
});
