// @story #1916
// Unowned compensation inputs cannot select callbacks, getters or resources.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../../../../task-tracker/lib/criteria-revision/store.mjs';
import * as core from '../../../../../task-tracker/lib/move-state/move-state-core.mjs';
import { rollbackRecordedState } from '../../../../../task-tracker/lib/move-state/github-mutation.mjs';
import { writeIssueBodyWithRetry } from '../../../../../task-tracker/lib/state-recording.mjs';
import { withMemoryStageEffectQuarantine } from '../../../../../task-tracker/lib/criteria-revision/transport-quarantine.mjs';

const roots = [
  store.acquireMemoryNativeStageCompensation,
  store.persistMemoryNativeStageCompensation,
  store.beginMemoryNativeStageCompensationAttempt,
  store.writeMemoryNativeStageCompensation,
  store.completeMemoryNativeStageCompensation,
  store.recordMemoryNativeStageCompensationFailure,
  store.writeMemoryNativeStageCompensationAudit,
  store.completeMemoryNativeStageCompensationResult,
];
const input = () => ({
  backend: {},
  capability: {},
  context: {
    repository: 'example/criteria',
    issue: 124,
    executor: { provider: 'claude', sessionId: 'fixture-compensation', worktree: process.cwd() },
  },
  token: {},
  invocation: {},
});
for (const root of roots) {
  test(`${root.name} refuses all authority getters and non-data shapes`, async () => {
    let gets = 0;
    for (const key of Object.keys(input())) {
      const value = input();
      Object.defineProperty(value, key, {
        enumerable: true,
        get() {
          gets++;
          throw new Error('unowned getter');
        },
      });
      await assert.rejects(root(value), /criteria-revision:native-stage-compensation-input/);
    }
    for (const shape of ['inherited', 'hidden', 'symbol', 'extra', 'missing']) {
      const value = input();
      if (shape === 'inherited') Object.setPrototypeOf(value, { granted: true });
      if (shape === 'hidden') Object.defineProperty(value, 'token', { enumerable: false });
      if (shape === 'symbol') value[Symbol('token')] = {};
      if (shape === 'extra') value.afterBody = 'forged';
      if (shape === 'missing') delete value.invocation;
      await assert.rejects(root(value), /criteria-revision:native-stage-compensation-input/);
    }
    assert.equal(gets, 0);
  });
  test(`${root.name} validates nested context before capability lookup`, async () => {
    let gets = 0;
    const value = input();
    Object.defineProperty(value.context.executor, 'sessionId', {
      enumerable: true,
      get() {
        gets++;
        throw new Error('nested getter');
      },
    });
    await assert.rejects(root(value), /criteria-revision:native-stage-compensation-context/);
    assert.equal(gets, 0);
  });
}
for (const [name, invoke] of [
  ['rollback', (value) => rollbackRecordedState(value, 'develop')],
  ['recording', (value) => writeIssueBodyWithRetry(value)],
  ['core comparison', (value) => core.assertNativeStageCompensationContext(value, 'develop')],
]) {
  test(`unowned ${name} refuses before original context or callback access`, async () => {
    let gets = 0;
    const value = {};
    for (const key of ['issueArg', 'cfg', 'pexec', 'target', 'writeIssueBody', 'body'])
      Object.defineProperty(value, key, {
        enumerable: true,
        get() {
          gets++;
          throw new Error('public getter');
        },
      });
    await assert.rejects(
      withMemoryStageEffectQuarantine(async () => invoke(value)),
      (error) =>
        error.code === 'revision-authority-unavailable' &&
        error.preparationReason ===
          (name === 'recording'
            ? 'original-compensation-invocation'
            : 'original-compensation-context')
    );
    assert.equal(gets, 0);
  });
}

for (const root of [
  store.assertMemoryNativeCompensationCurrent,
  store.releaseMemoryNativeStageCompensation,
]) {
  test(`${root.name} rejects resource authority getters before lookup or release`, () => {
    let gets = 0;
    const original = () => ({ backend: {}, token: {}, invocation: {} });
    for (const key of Object.keys(original())) {
      const value = original();
      Object.defineProperty(value, key, {
        enumerable: true,
        get() {
          gets++;
          throw new Error('unowned resource authority getter');
        },
      });
      assert.throws(() => root(value));
    }
    assert.equal(gets, 0, 'no caller code executed during comparison or release');
    for (const shape of ['inherited', 'hidden', 'symbol', 'extra', 'missing']) {
      const value = original();
      if (shape === 'inherited') Object.setPrototypeOf(value, { granted: true });
      if (shape === 'hidden') Object.defineProperty(value, 'token', { enumerable: false });
      if (shape === 'symbol') value[Symbol('token')] = {};
      if (shape === 'extra') value.afterBody = 'forged';
      if (shape === 'missing') delete value.invocation;
      assert.throws(() => root(value));
    }
  });
}
