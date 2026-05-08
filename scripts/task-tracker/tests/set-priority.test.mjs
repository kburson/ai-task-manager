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
const SCRIPT = path.resolve(__dir, '../../gh/set-priority.mjs');

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
  const e = await runExpectFail(['abc', 'p1'], { TT_SKIP_NETWORK: '1' });
  assert.match(e.stderr + e.stdout, /Usage/i, 'non-numeric issue should print usage');
}

// Test: unknown priority exits non-zero
{
  const e = await runExpectFail(['123', 'p9'], { TT_SKIP_NETWORK: '1' });
  assert.match(e.stderr + e.stdout, /Unknown priority/i, 'invalid priority should print error');
}

// Test: valid priority with TT_SKIP_NETWORK prints success without hitting GH
{
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-sp-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({
      repo: 'test-owner/test-repo',
      projectId: 'PVT_test123',
      priorityFieldId: 'PVTF_prio',
      priorityOptionP0: 'PVTO_p0',
      priorityOptionP1: 'PVTO_p1',
      priorityOptionP2: 'PVTO_p2',
    }, null, 2)
  );
  for (const priority of ['p0', 'p1', 'p2', 'P0', 'P1', 'P2']) {
    const r = await run(['123', priority], {
      TT_SKIP_NETWORK: '1',
      AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    });
    assert.match(r.stdout, /P[012]/, `priority ${priority} should print success`);
  }
  rmSync(sandbox, { recursive: true });
}

console.log('set-priority.test.mjs: all passed');
