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
const CLI = path.resolve(__dir, '..', 'task-tracker.mjs');

const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-cli-'));
mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
writeFileSync(
  path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
  JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
);
const env = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: sandbox, TT_SKIP_NETWORK: '1' };

// Test 1: status with no active → "no active task"
let r = await pexec('node', [CLI, 'status'], { env });
assert.match(r.stdout, /no active task/i);

// Test 2: config lists defaults
r = await pexec('node', [CLI, 'config'], { env });
assert.match(r.stdout, /wpm/);
assert.match(r.stdout, /180/);

// Test 3: config set then read
await pexec('node', [CLI, 'config', 'wpm', '175'], { env });
r = await pexec('node', [CLI, 'config'], { env });
assert.match(r.stdout, /wpm.*175/);

// Test 4: end with nothing active is a no-op
r = await pexec('node', [CLI, 'end'], { env });
assert.match(r.stdout, /no active task/i);

// Test 5: /task #107 starts a task (network skipped)
let r5 = await pexec('node', [CLI, '#107'], { env });
assert.match(r5.stdout, /Active: #107/);

// Test 6: /task status reflects active
r5 = await pexec('node', [CLI, 'status'], { env });
assert.match(r5.stdout, /Active: #107/);

// Test 7: /task pause flushes and sets lastActive
r5 = await pexec('node', [CLI, 'pause'], { env });
assert.match(r5.stdout, /Paused #107/);

r5 = await pexec('node', [CLI, 'status'], { env });
assert.match(r5.stdout, /Last active: #107/);

// Test 8: /task start resumes
r5 = await pexec('node', [CLI, 'start'], { env });
assert.match(r5.stdout, /Resumed #107/);

// Test 9: /task #108 auto-ends #107
r5 = await pexec('node', [CLI, '#108'], { env });
assert.match(r5.stdout, /Active: #108/);
assert.match(r5.stdout, /Previous: #107/);

// Test 10: /task plan starts planning bucket
r5 = await pexec('node', [CLI, 'plan'], { env });
assert.match(r5.stdout, /planning bucket/i);

r5 = await pexec('node', [CLI, 'status'], { env });
assert.match(r5.stdout, /planning bucket/i);

// Test 11: /task new "Title" with network skip just clears bucket
const envNew = { ...env, TT_FAKE_NEW_ISSUE: '#999' };
r5 = await pexec('node', [CLI, 'new', 'Fake Title'], { env: envNew });
assert.match(r5.stdout, /Active: #999/);

// ---- Regression: /task start #N must switch (not resume lastActive) ----
// Bug: case 'start' previously called verbStart() directly, which ignores
// positional #N and always resumes lastActive. Routing through verbResume
// makes `start #N` switch like `resume #N`.
const startSwitchSandbox = mkdtempSync(path.join(tmpdir(), 'tt-start-switch-'));
mkdirSync(path.join(startSwitchSandbox, '.ai-task-manager'), { recursive: true });
writeFileSync(
  path.join(startSwitchSandbox, '.ai-task-manager', 'task-tracker.json'),
  JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
);
const switchEnv = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: startSwitchSandbox, TT_SKIP_NETWORK: '1' };

// Bind #200, pause it so lastActive=#200 and active=null.
await pexec('node', [CLI, '#200'], { env: switchEnv });
await pexec('node', [CLI, 'pause'], { env: switchEnv });

// `/task start #201` must start #201, not resume #200.
let rs = await pexec('node', [CLI, 'start', '#201'], { env: switchEnv });
assert.match(rs.stdout, /Active: #201/, '/task start #N should switch to #N');
assert.doesNotMatch(rs.stdout, /Resumed #200/, '/task start #N must not resume lastActive');

// Regression guard: `/task resume #N` continues to switch.
await pexec('node', [CLI, 'pause'], { env: switchEnv });
rs = await pexec('node', [CLI, 'resume', '#202'], { env: switchEnv });
assert.match(rs.stdout, /Active: #202/, '/task resume #N should switch to #N');

// `/task start` with no arg and no active still resumes lastActive.
await pexec('node', [CLI, 'pause'], { env: switchEnv });
rs = await pexec('node', [CLI, 'start'], { env: switchEnv });
assert.match(rs.stdout, /Resumed #202/, '/task start (no arg) should resume lastActive');

rmSync(startSwitchSandbox, { recursive: true });

rmSync(sandbox, { recursive: true });

// ---- Uninitialized guard tests ----
// Dir has .ai-task-manager/ but no task-tracker.json — fail-closed `config-not-found`.
const noRepoDirBase = mkdtempSync(path.join(tmpdir(), 'tt-norepo-'));
mkdirSync(path.join(noRepoDirBase, '.ai-task-manager'), { recursive: true });
const noRepoEnv = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: noRepoDirBase, TT_SKIP_NETWORK: '1' };

for (const blockedVerb of ['#42', 'close', 'pause', 'plan', 'new', 'update', 'review', 'check', 'log']) {
  try {
    await pexec('node', [CLI, blockedVerb], { env: noRepoEnv });
    assert.fail(`Expected non-zero exit for verb: ${blockedVerb}`);
  } catch (err) {
    assert.match(err.stderr, /config-not-found|not initialized/i,
      `verb "${blockedVerb}" should fail-closed with config-not-found or not initialized`);
  }
}

// Exempt verbs succeed without repo
for (const exemptVerb of ['status', 'config', 'help', '?']) {
  const er = await pexec('node', [CLI, exemptVerb], { env: noRepoEnv });
  assert.ok(er.stdout.length > 0 || er.stderr.length === 0, `exempt verb "${exemptVerb}" should not error`);
}

rmSync(noRepoDirBase, { recursive: true });

// ---- Fail-closed bootstrap: --role agent with no .ai-task-manager/ ----
// Worktree pipeline regression guard. Must exit non-zero with "config-not-found at <path>"
// when an agent boots into a worktree that wasn't seeded with .ai-task-manager/.
const bareWorktree = mkdtempSync(path.join(tmpdir(), 'tt-bare-wt-'));
const bareEnv = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: bareWorktree, TT_SKIP_NETWORK: '1' };
try {
  await pexec('node', [CLI, '#42', '--role', 'agent'], { env: bareEnv });
  assert.fail('Expected non-zero exit for --role agent in unseeded worktree');
} catch (err) {
  assert.match(err.stderr, /config-not-found at/, 'agent bootstrap must report config-not-found path');
  assert.match(err.stderr, /\.ai-task-manager[\\/]task-tracker\.json/, 'error must name the missing config file');
  assert.match(err.stderr, /seed-worktree\.mjs/, 'error must point to the seeding helper');
}
rmSync(bareWorktree, { recursive: true });
console.log('cli.test.mjs: status/config/end passed');
