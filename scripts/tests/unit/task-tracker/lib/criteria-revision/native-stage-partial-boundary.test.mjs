// @story #1924
import assert from 'node:assert/strict';
import test from 'node:test';
import * as store from '../../../../../task-tracker/lib/criteria-revision/store.mjs';
import * as core from '../../../../../task-tracker/lib/move-state/move-state-core.mjs';
const fresh = () => ({
  backend: {},
  capability: {},
  context: {
    repository: 'example/criteria',
    issue: 124,
    executor: { provider: 'claude', sessionId: 'partial-fixture', worktree: process.cwd() },
  },
  holder: {},
});
for (const key of ['backend', 'capability', 'context', 'holder'])
  test('partial report refuses unowned ' + key + ' getter before lookup', async () => {
    let gets = 0;
    const input = fresh();
    Object.defineProperty(input, key, {
      enumerable: true,
      get() {
        gets++;
        throw Error('unowned getter');
      },
    });
    await assert.rejects(
      async () => store.readMemoryNativeStagePartialFacts(input),
      /criteria-revision:native-stage-partial/
    );
    assert.equal(gets, 0);
  });
for (const shape of ['prototype', 'hidden', 'symbol', 'extra', 'missing'])
  test('partial report refuses ' + shape + ' input before borrowed custody', async () => {
    const input = fresh();
    if (shape === 'prototype') Object.setPrototypeOf(input, { authority: true });
    if (shape === 'hidden') Object.defineProperty(input, 'holder', { enumerable: false });
    if (shape === 'symbol') input[Symbol('holder')] = {};
    if (shape === 'extra') input.afterBytes = 'forged';
    if (shape === 'missing') delete input.holder;
    await assert.rejects(
      async () => store.readMemoryNativeStagePartialFacts(input),
      /criteria-revision:native-stage-partial/
    );
  });
test('partial report rejects nested identity getters without executing them', async () => {
  const input = fresh();
  let gets = 0;
  Object.defineProperty(input.context.executor, 'sessionId', {
    enumerable: true,
    get() {
      gets++;
      throw Error('nested getter');
    },
  });
  await assert.rejects(
    async () => store.readMemoryNativeStagePartialFacts(input),
    /criteria-revision:native-stage-partial/
  );
  assert.equal(gets, 0);
});
test('a public copied holder tuple cannot create private report membership', async () => {
  const input = fresh();
  await assert.rejects(
    async () => store.readMemoryNativeStagePartialFacts({ ...input }),
    (error) => error.preparationReason === 'original-partial-report-input'
  );
  assert.throws(
    () => core.assertNativeStagePartialHolder(input),
    (error) => error.preparationReason === 'original-partial-report-input'
  );
});
