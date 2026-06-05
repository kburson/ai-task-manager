#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { projectScratchDir, mkdtempProjectIsolated } from '../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', 'task-tracker.mjs');

const sandbox = mkdtempProjectIsolated('tt-lifecycle-');
mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
writeFileSync(
  path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
  JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
);
const env = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: sandbox, TT_SKIP_NETWORK: '1' };

let r = await pexec('node', [CLI, '#321'], { env });
assert.match(r.stdout, /Active: #321/);

r = await pexec('node', [CLI, 'review', '#321'], { env });
assert.match(r.stdout, /Review #321/);
assert.match(r.stdout, /paused/i);

let state = JSON.parse(
  readFileSync(path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'), 'utf8')
);
assert.equal(state.active, null);
assert.equal(state.lastActive, '#321');

r = await pexec('node', [CLI, 'close', '#321'], { env });
assert.match(r.stdout, /Closed #321/);

r = await pexec('node', [CLI, 'help'], { env });
assert.match(r.stdout, /\/task review #N/);
assert.match(r.stdout, /\/task close \[#N\]/);

// #142: `close #N` with a different active task must REFUSE (exit 7,
// PROMPT_REQUIRED: bind-mismatch). The prior silent-cross-close behavior
// was the bug being fixed — see scripts/task-tracker/tests/close-cross-close.test.mjs.
{
  const sandbox2 = mkdtempProjectIsolated('tt-close-target-');
  mkdirSync(path.join(sandbox2, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox2, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
  );
  const env2 = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: sandbox2, TT_SKIP_NETWORK: '1' };

  await pexec('node', [CLI, '#385'], { env: env2 });
  let st = JSON.parse(
    readFileSync(path.join(sandbox2, '.ai-task-manager', 'task-tracker-state.json'), 'utf8')
  );
  assert.equal(st.active, '#385');

  let refusalErr = null;
  try {
    await pexec('node', [CLI, 'close', '#386'], { env: env2 });
  } catch (e) {
    refusalErr = e;
  }
  assert.ok(refusalErr, 'cross-close must refuse with non-zero exit');
  assert.equal(refusalErr.code, 7, 'cross-close refusal must exit 7');
  assert.match(refusalErr.stdout, /PROMPT_REQUIRED: bind-mismatch #385:#386/);

  st = JSON.parse(
    readFileSync(path.join(sandbox2, '.ai-task-manager', 'task-tracker-state.json'), 'utf8')
  );
  assert.equal(st.active, '#385', 'active session must remain #385 after refusal');

  rmSync(sandbox2, { recursive: true });
}

// Bug fix: `close #N` with no active task closes the named issue (existing behavior).
{
  const sandbox3 = mkdtempProjectIsolated('tt-close-noactive-');
  mkdirSync(path.join(sandbox3, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox3, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
  );
  const env3 = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: sandbox3, TT_SKIP_NETWORK: '1' };

  const closeResult = await pexec('node', [CLI, 'close', '#400'], { env: env3 });
  assert.match(closeResult.stdout, /Closed #400/);

  const st = JSON.parse(
    readFileSync(path.join(sandbox3, '.ai-task-manager', 'task-tracker-state.json'), 'utf8')
  );
  assert.equal(st.active, null, 'active should be cleared when closing the only/active issue');

  rmSync(sandbox3, { recursive: true });
}

rmSync(sandbox, { recursive: true });
console.log('lifecycle.test.mjs: all passed');
