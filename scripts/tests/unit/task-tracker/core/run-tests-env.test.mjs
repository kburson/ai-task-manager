// @story #1873
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestChildEnv } from '../../../../run-tests-report.mjs';
import { TEST_NO_RETRY_ENV } from '../../../../gh/lib/with-retry.mjs';
import { PROJECT_ROOT_ALIASES } from '../../../../task-tracker/lib/runtime-storage.mjs';

test('test children isolate inherited root authority while preserving session and credentials', () => {
  const parent = {
    PATH: '/fixture/bin',
    GH_TOKEN: 'fixture-credential',
    CODEX_THREAD_ID: 'actual-parent-session',
    [TEST_NO_RETRY_ENV]: '0',
    ...Object.fromEntries(PROJECT_ROOT_ALIASES.map((key) => [key, '/parent/root'])),
  };
  const before = { ...parent };
  const child = buildTestChildEnv(parent);
  for (const key of PROJECT_ROOT_ALIASES) assert.equal(Object.hasOwn(child, key), false, key);
  assert.deepEqual(parent, before);
  assert.equal(child.PATH, parent.PATH);
  assert.equal(child.GH_TOKEN, parent.GH_TOKEN);
  assert.equal(child.CODEX_THREAD_ID, parent.CODEX_THREAD_ID);
  assert.equal(child[TEST_NO_RETRY_ENV], '1');
  const fixtureChild = { ...child, AI_TASK_MANAGER_PROJECT_DIR: '/fixture/root' };
  assert.equal(fixtureChild.AI_TASK_MANAGER_PROJECT_DIR, '/fixture/root');
});
