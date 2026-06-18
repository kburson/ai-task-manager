// @story #453
// Verifies that defaultExecInSandbox forwards AI_TASK_MANAGER_PROJECT_DIR into
// the spawned child process environment so projectScratchDir resolves against
// the real project root rather than the sandbox CWD.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { defaultExecInSandbox } from '../../verbs/test.mjs';

test('defaultExecInSandbox: forwards AI_TASK_MANAGER_PROJECT_DIR to child env', async () => {
  const projectDir = '/fake/project/root';
  const result = await defaultExecInSandbox({
    argv: [
      process.execPath,
      '-e',
      "process.stdout.write(process.env.AI_TASK_MANAGER_PROJECT_DIR || 'MISSING')",
    ],
    path: process.cwd(),
    projectDir,
  });
  assert.equal(result.exit, 0, `child exited non-zero: ${result.stderr}`);
  assert.equal(result.stdout.trim(), projectDir);
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
      projectDir: '/any/dir',
    });
    assert.equal(result.exit, 0);
    assert.equal(result.stdout.trim(), sentinelVal);
  } finally {
    if (orig === undefined) delete process.env[sentinelKey];
    else process.env[sentinelKey] = orig;
  }
});
