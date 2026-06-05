#!/usr/bin/env node
// Wiring: dispatcher runs preflightVerb before invoking close/approve/promote/etc.
// Verifies bind-mismatch refusal (#208) at the dispatcher chokepoint.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', 'task-tracker.mjs');

function makeSandbox(active) {
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-preflight-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
  );
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'),
    JSON.stringify(
      {
        active,
        lastActive: active,
        entryStartTs: new Date().toISOString(),
        wordsAtEntryStart: 0,
        totalActiveMinutes: 0,
        discoverBucket: null,
        state: 'develop',
      },
      null,
      2
    )
  );
  return sandbox;
}

const env = (sandbox) => ({
  ...process.env,
  AI_TASK_MANAGER_PROJECT_DIR: sandbox,
  TT_SKIP_NETWORK: '1',
});

async function expectExit(args, sandbox, expectedCode) {
  try {
    await pexec('node', [CLI, ...args], { env: env(sandbox) });
    throw new Error(`expected non-zero exit ${expectedCode}, got 0`);
  } catch (err) {
    if (err.code === expectedCode) return err;
    throw new Error(
      `expected exit ${expectedCode}, got ${err.code}\nstdout: ${err.stdout}\nstderr: ${err.stderr}`
    );
  }
}

// 1. close with mismatched target → exit 7
{
  const sb = makeSandbox('#100');
  const err = await expectExit(['close', '#208'], sb, 7);
  assert.match(err.stdout, /PROMPT_REQUIRED: bind-mismatch #100:#208/);
  assert.match(err.stderr, /Refusing \/task close/);
}

// 2. approve with mismatched target → exit 7
{
  const sb = makeSandbox('#100');
  const err = await expectExit(['approve', '#208'], sb, 7);
  assert.match(err.stdout, /PROMPT_REQUIRED: bind-mismatch #100:#208/);
}

// 3. promote with mismatched target → exit 7
{
  const sb = makeSandbox('#100');
  const err = await expectExit(['promote', '#208'], sb, 7);
  assert.match(err.stdout, /PROMPT_REQUIRED: bind-mismatch #100:#208/);
}

// 4. demote with mismatched target → exit 7
{
  const sb = makeSandbox('#100');
  const err = await expectExit(['demote', '#208'], sb, 7);
  assert.match(err.stdout, /PROMPT_REQUIRED: bind-mismatch #100:#208/);
}

// 5. refine with mismatched target → exit 7
{
  const sb = makeSandbox('#100');
  const err = await expectExit(['refine', '#208'], sb, 7);
  assert.match(err.stdout, /PROMPT_REQUIRED: bind-mismatch/);
}

// 6. plan-approve with mismatched target → exit 7
{
  const sb = makeSandbox('#100');
  const err = await expectExit(['plan-approve', '#208'], sb, 7);
  assert.match(err.stdout, /PROMPT_REQUIRED: bind-mismatch/);
}

// 7. review with mismatched target → exit 7
{
  const sb = makeSandbox('#100');
  const err = await expectExit(['review', '#208'], sb, 7);
  assert.match(err.stdout, /PROMPT_REQUIRED: bind-mismatch/);
}

// 8. reject with mismatched target → exit 7
{
  const sb = makeSandbox('#100');
  const err = await expectExit(['reject', '#208', '--reason', 'x'], sb, 7);
  assert.match(err.stdout, /PROMPT_REQUIRED: bind-mismatch/);
}

// 9. pause is active-only — no bind-mismatch even with stale active.
//    Should NOT exit 7. (It may still no-op on the active task.)
{
  const sb = makeSandbox('#100');
  try {
    await pexec('node', [CLI, 'pause'], { env: env(sb) });
    // ok — exited 0
  } catch (err) {
    assert.notEqual(err.code, 7, `pause should not refuse with exit 7; got ${err.code}`);
  }
}

// 10. close with matching target → no bind-mismatch refusal (TT_SKIP_NETWORK
//     short-circuits network paths inside close; we only assert exit ≠ 7).
{
  const sb = makeSandbox('#208');
  try {
    await pexec('node', [CLI, 'close', '#208'], { env: env(sb) });
  } catch (err) {
    assert.notEqual(
      err.code,
      7,
      `close with matching target should not exit 7; got ${err.code}\n${err.stderr}`
    );
  }
}

console.log('verb-preflight-wiring.test.mjs: ok');
