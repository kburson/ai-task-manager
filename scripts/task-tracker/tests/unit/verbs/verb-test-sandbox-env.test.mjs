// @story #453
// Verifies that defaultExecInSandbox binds AI_TASK_MANAGER_PROJECT_DIR to the
// detached verification worktree so project authority matches the child CWD.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { defaultExecInSandbox } from '../../../verbs/test.mjs';

test('defaultExecInSandbox: binds AI_TASK_MANAGER_PROJECT_DIR to the sandbox path', async () => {
  const sandboxPath = process.cwd();
  const result = await defaultExecInSandbox({
    argv: [
      process.execPath,
      '-e',
      "process.stdout.write(process.env.AI_TASK_MANAGER_PROJECT_DIR || 'MISSING')",
    ],
    path: sandboxPath,
  });
  assert.equal(result.exit, 0, `child exited non-zero: ${result.stderr}`);
  assert.equal(result.stdout.trim(), sandboxPath);
});

test('defaultExecInSandbox: child inherits parent env alongside AI_TASK_MANAGER_PROJECT_DIR', async () => {
  const sentinelKey = 'AITM_TEST_SENTINEL_453';
  const sentinelVal = 'sentinel-value-ok';
  const orig = process.env[sentinelKey];
  process.env[sentinelKey] = sentinelVal;
  try {
    const result = await defaultExecInSandbox({
      argv: [
        process.execPath,
        '-e',
        `process.stdout.write(process.env.${sentinelKey} || 'MISSING')`,
      ],
      path: process.cwd(),
    });
    assert.equal(result.exit, 0);
    assert.equal(result.stdout.trim(), sentinelVal);
  } finally {
    if (orig === undefined) delete process.env[sentinelKey];
    else process.env[sentinelKey] = orig;
  }
});
