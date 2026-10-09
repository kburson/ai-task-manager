// @story #1915
import assert from 'node:assert/strict';
import test from 'node:test';
import * as codec from '../../../../../task-tracker/lib/criteria-revision/stage-execution.mjs';
const fresh = () => ({
  journal: {},
  resources: {},
  body: { bytes: 'source', version: 0 },
  stage: 'develop',
  executor: {},
});
for (const key of ['journal', 'resources', 'body', 'stage', 'executor'])
  test(
    'known-prefix DATA rejects ' + key + ' getter before reading any selected value',
    async () => {
      let gets = 0;
      const input = fresh();
      Object.defineProperty(input, key, {
        enumerable: true,
        get() {
          gets++;
          throw Error('unowned DATA getter');
        },
      });
      await assert.rejects(
        async () => codec.deriveRecordedNativeStageKnownPrefix(input),
        /criteria-revision:native-stage-known-prefix/
      );
      assert.equal(gets, 0);
    }
  );
for (const shape of ['prototype', 'hidden', 'symbol', 'extra', 'missing'])
  test('known-prefix DATA refuses ' + shape + ' shape without recognition', async () => {
    const input = fresh();
    if (shape === 'prototype') Object.setPrototypeOf(input, { approved: true });
    if (shape === 'hidden') Object.defineProperty(input, 'journal', { enumerable: false });
    if (shape === 'symbol') input[Symbol('approved')] = true;
    if (shape === 'extra') input.capability = {};
    if (shape === 'missing') delete input.body;
    await assert.rejects(
      async () => codec.deriveRecordedNativeStageKnownPrefix(input),
      /criteria-revision:native-stage-known-prefix/
    );
  });
test('known-prefix DATA refuses null, scalar and incomplete roots', async () => {
  for (const value of [null, undefined, 3, true, 'known', [], fresh()])
    await assert.rejects(
      async () => codec.deriveRecordedNativeStageKnownPrefix(value),
      /criteria-revision:native-stage-known-prefix/
    );
});
