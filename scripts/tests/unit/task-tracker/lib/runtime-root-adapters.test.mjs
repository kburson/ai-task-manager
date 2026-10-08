// @story #1857
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as storage from '../../../../task-tracker/lib/runtime-storage.mjs';

function adapters(root) {
  return {
    realpath: (value) => value,
    assertOutsideArtifacts: () => {},
    readIdentity: () => ({ projectRoot: root, mainRoot: root }),
  };
}
test('explicit adapter scopes isolate concurrent tests and restore production defaults', async () => {
  const roots = ['unit-one-not-created', 'unit-two-not-created'].map((name) =>
    path.join(process.cwd(), name)
  );
  const observed = await Promise.all(
    roots.map((root) =>
      storage.withRuntimeRootAdapters(adapters(root), async () => {
        await new Promise((resolve) => setImmediate(resolve));
        return storage.resolveRuntimeRoot({ cwd: root, env: {} }).projectRoot;
      })
    )
  );
  assert.deepEqual(observed, roots);
  for (const root of roots)
    assert.throws(() => storage.resolveRuntimeRoot({ cwd: root, env: {} }), {
      code: 'ROOT_IDENTITY_MISMATCH',
    });
});

// @story #1855
test('native adapter absence assertion rejects every defined scope without inspecting it', () => {
  assert.equal(storage.assertNativeRuntimeRootAdaptersAbsent(), undefined);
  let inspected = 0;
  const dangerous = new Proxy(
    {},
    {
      get() {
        inspected++;
        throw new Error('inspected');
      },
      ownKeys() {
        inspected++;
        throw new Error('inspected');
      },
    }
  );
  for (const value of [null, {}, false, dangerous]) {
    storage.withRuntimeRootAdapters(value, () => {
      assert.throws(() => storage.assertNativeRuntimeRootAdaptersAbsent(), {
        code: 'ROOT_ADAPTERS_ACTIVE',
      });
    });
  }
  assert.equal(inspected, 0);
  assert.equal(
    storage.withRuntimeRootAdapters(undefined, () =>
      storage.assertNativeRuntimeRootAdaptersAbsent()
    ),
    undefined
  );
  assert.equal(storage.assertNativeRuntimeRootAdaptersAbsent(), undefined);
});
