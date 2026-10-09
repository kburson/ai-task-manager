// @story #1670
import assert from 'node:assert/strict';
import {
  createActivatedUnitRuntimeRoot,
  unitTest as test,
} from '../../../helpers/unit-runtime-root.mjs';
import { rmSync } from 'node:fs';

import { measureFixedActionAuthorityReads } from '../../../helpers/action-authority-cost.mjs';

test('fixed action authority measurement records physical read-port calls for every explain-ready collector', async () => {
  const root = createActivatedUnitRuntimeRoot('authority-cost-');
  const previousProjectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  let measured;
  try {
    process.env.AI_TASK_MANAGER_PROJECT_DIR = root;
    measured = await measureFixedActionAuthorityReads();
  } finally {
    if (previousProjectDir === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
    else process.env.AI_TASK_MANAGER_PROJECT_DIR = previousProjectDir;
    rmSync(root, { recursive: true, force: true });
  }
  assert.deepEqual(
    measured.actions.map(({ id }) => id),
    ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close']
  );
  for (const action of measured.actions) {
    assert.equal(action.status, 'ready', `${action.id} must measure a complete ready scenario`);
    assert.ok(action.requestCount > 0, action.id);
    assert.equal(action.requestCount, action.requests.length, action.id);
    assert.equal(action.requestCount, action.requestKeys.length, action.id);
    assert.equal(
      new Set(action.requests.map(({ key }) => key)).size,
      action.requestCount,
      action.id
    );
  }
});
