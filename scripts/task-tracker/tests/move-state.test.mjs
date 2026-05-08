#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dir, '../../gh/move-state.mjs');

async function run(args, env = {}) {
  return pexec('node', [SCRIPT, ...args], {
    env: { ...process.env, ...env },
  });
}

async function runExpectFail(args, env = {}) {
  try {
    await run(args, env);
    assert.fail('Expected non-zero exit but succeeded');
  } catch (e) {
    return e;
  }
}

// Test: missing args prints usage and exits non-zero
{
  const e = await runExpectFail([]);
  assert.match(e.stderr + e.stdout, /Usage/i, 'missing args should print usage');
}

// Test: non-numeric issue number prints usage and exits non-zero
{
  const e = await runExpectFail(['abc', 'in-progress'], { TT_SKIP_NETWORK: '1' });
  assert.match(e.stderr + e.stdout, /Usage/i, 'non-numeric issue should print usage');
}

// Test: invalid state exits non-zero
{
  const e = await runExpectFail(['123', 'flying'], { TT_SKIP_NETWORK: '1' });
  assert.match(e.stderr + e.stdout, /Unknown state/i, 'invalid state should print error');
}

// Test: valid state with TT_SKIP_NETWORK prints success without hitting GH
{
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-ms-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({
      repo: 'test-owner/test-repo',
      projectId: 'PVT_test123',
      kanbanFieldId: 'PVTF_test',
      kanbanOptionInProgress: 'PVTO_test',
    }, null, 2)
  );
  const r = await run(['123', 'in-progress'], {
    TT_SKIP_NETWORK: '1',
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
  });
  assert.match(r.stdout, /moved to: in-progress/, 'should print success message');
  rmSync(sandbox, { recursive: true });
}

// Test: alias forms resolve (in_progress, r4r, in-review)
for (const alias of ['in_progress', 'in-review', 'r4r']) {
  const e = await runExpectFail([alias, 'in-progress'], { TT_SKIP_NETWORK: '1' });
  // non-numeric first arg → usage (not "Unknown state")
  assert.match(e.stderr + e.stdout, /Usage/i);
}
// Proper alias: valid issue, alias state
{
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-ms-alias-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({
      repo: 'test-owner/test-repo',
      projectId: 'PVT_test123',
      kanbanFieldId: 'PVTF_test',
      kanbanOptionInProgress: 'PVTO_inprog',
      kanbanOptionInReview: 'PVTO_inrev',
      kanbanOptionR4R: 'PVTO_r4r',
    }, null, 2)
  );
  for (const [alias, label] of [['in_progress', 'in_progress'], ['in-review', 'in-review'], ['r4r', 'r4r']]) {
    const r = await run(['456', alias], {
      TT_SKIP_NETWORK: '1',
      AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    });
    assert.match(r.stdout, new RegExp(`moved to: ${alias}`), `alias ${alias} should work`);
  }
  rmSync(sandbox, { recursive: true });
}

console.log('move-state.test.mjs: all passed');
