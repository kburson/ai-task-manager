// @story #1913
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../../../../task-tracker/lib/criteria-revision/store.mjs';
import * as core from '../../../../../task-tracker/lib/move-state/move-state-core.mjs';
import * as cache from '../../../../../task-tracker/lib/move-state/cache-unpark.mjs';
import * as session from '../../../../../task-tracker/session-state.mjs';
import { withMemoryStageEffectQuarantine } from '../../../../../task-tracker/lib/criteria-revision/transport-quarantine.mjs';
for (const root of [
  store.acquireMemoryNativeStageCache,
  store.readMemoryNativeStageCache,
  store.persistMemoryNativeStageCache,
  store.writeMemoryNativeStageCache,
  store.completeMemoryNativeStageCache,
]) {
  test(root.name + ' refuses every authority getter and non-DATA shape before lookup', async () => {
    const input = () => ({
      backend: {},
      capability: {},
      context: {
        repository: 'example/criteria',
        issue: 124,
        executor: { provider: 'claude', sessionId: 'fixture-cache', worktree: process.cwd() },
      },
      token: {},
      invocation: {},
      ...(root === store.persistMemoryNativeStageCache ? { step: {} } : {}),
    });
    let gets = 0;
    for (const key of Object.keys(input())) {
      const value = input();
      Object.defineProperty(value, key, {
        enumerable: true,
        get() {
          gets++;
          throw Error('unowned cache getter');
        },
      });
      await assert.rejects(root(value));
    }
    for (const shape of ['inherited', 'hidden', 'symbol', 'extra', 'missing']) {
      const value = input();
      if (shape === 'inherited') Object.setPrototypeOf(value, { granted: true });
      if (shape === 'hidden') Object.defineProperty(value, 'token', { enumerable: false });
      if (shape === 'symbol') value[Symbol('token')] = {};
      if (shape === 'extra') value.afterBytes = 'forged';
      if (shape === 'missing') delete value.invocation;
      await assert.rejects(root(value));
    }
    const nested = input();
    Object.defineProperty(nested.context.executor, 'sessionId', {
      enumerable: true,
      get() {
        gets++;
        throw Error('nested getter');
      },
    });
    await assert.rejects(root(nested));
    assert.equal(gets, 0);
  });
}
test('cache release rejects resource getters before selecting a lock', () => {
  let gets = 0;
  for (const key of ['backend', 'token', 'invocation']) {
    const value = { backend: {}, token: {}, invocation: {} };
    Object.defineProperty(value, key, {
      enumerable: true,
      get() {
        gets++;
        throw Error('release getter');
      },
    });
    assert.throws(() => store.releaseMemoryNativeStageCache(value));
  }
  assert.equal(gets, 0);
});
for (const [name, invoke] of [
  ['public refresh', (value) => cache.refreshKanbanStateCache(value, {})],
  ['cache sequence', (value) => core.beginNativeStageTailCache({}, value)],
  ['operation driver', (value) => core.executeNativeStageCacheOperation({}, value, {})],
  ['original read', (value) => session.getNativeStageCachedTask({}, value)],
  ['original set', (value) => session.setNativeStageKanbanState({}, value)],
])
  test(name + ' rejects unowned getter inputs before callback or field access', async () => {
    let gets = 0;
    const value = {};
    for (const key of ['issueArg', 'stateArg', 'cfg', 'deps', 'kind', 'sid', 'projectDir'])
      Object.defineProperty(value, key, {
        enumerable: true,
        get() {
          gets++;
          throw Error('public cache getter');
        },
      });
    await assert.rejects(withMemoryStageEffectQuarantine(async () => invoke(value)));
    assert.equal(gets, 0);
  });
