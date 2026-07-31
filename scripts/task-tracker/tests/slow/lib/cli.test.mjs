#!/usr/bin/env node
// @story #309
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { projectScratchDir, mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const pexec = promisify(execFile);

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const CLI = path.resolve(__dir, '..', '..', 'task-tracker.mjs');

// #442 — this sandbox binds #999/#108 via the CLI, which registers a fleet
// entry; git-isolate it so registerTask cannot escape into the live registry.
const sandbox = mkdtempProjectIsolated('tt-cli-');
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
assert.match(r5.stdout, /Started #107/);

// Test 6: /task status reflects active
r5 = await pexec('node', [CLI, 'status'], { env });
assert.match(r5.stdout, /Active: #107/);

// Test 7: /task pause flushes and sets lastActive
r5 = await pexec('node', [CLI, 'pause'], { env });
assert.match(r5.stdout, /Paused #107/);

r5 = await pexec('node', [CLI, 'status'], { env });
assert.match(r5.stdout, /Last active: #107/);

// Test 8: /task resume (no arg) resumes after pause
r5 = await pexec('node', [CLI, 'resume'], { env });
assert.match(r5.stdout, /Resumed #107/);

// Test 9: /task #108 auto-ends #107
r5 = await pexec('node', [CLI, '#108'], { env });
assert.match(r5.stdout, /Active: #108/);
assert.match(r5.stdout, /Previous: #107/);

// Test 10: /task discover starts discovery bucket
r5 = await pexec('node', [CLI, 'discover'], { env });
assert.match(r5.stdout, /discovery bucket/i);

r5 = await pexec('node', [CLI, 'status'], { env });
assert.match(r5.stdout, /discovery bucket/i);

// Test 10b: /task plan with no args prints usage and exits non-zero.
// Post-#299 plan/discover split: `plan` is a real state-transition verb
// that requires <issue#>; the deprecated `plan` → `discover` alias is
// retired (see #322).
let planNoArgsErr = null;
try {
  await pexec('node', [CLI, 'plan'], { env });
} catch (err) {
  planNoArgsErr = err;
}
assert.ok(planNoArgsErr, '/task plan (no args) must exit non-zero');
assert.notEqual(planNoArgsErr.code, 0);
assert.match(planNoArgsErr.stderr || '', /Usage: \/task plan/);

// Test 11: /task new from discover state requires a saved plan.
// Save a plan first, then /task new reads it and clears the bucket.
const envNew = { ...env, TT_FAKE_NEW_ISSUE: '#999' };
const planDraftPath = path.join(sandbox, 'draft-plan.md');
writeFileSync(planDraftPath, '# Fake Title\n\n## Scope\ntest scope\n', 'utf8');
await pexec('node', [CLI, 'save-plan', '--from-file', planDraftPath], { env: envNew });
r5 = await pexec('node', [CLI, 'new'], { env: envNew });
assert.match(r5.stdout, /Active: #999/);

// ---- Regression: /task start #N must switch (not resume lastActive) ----
// Bug: case 'start' previously called verbStart() directly, which ignores
// positional #N and always resumes lastActive. Routing through verbResume
// makes `start #N` switch like `resume #N`.
// #442 — this sandbox binds #200/#201/#202 via the CLI, which registers a fleet
// entry; git-isolate it so registerTask cannot escape into the live registry.
const startSwitchSandbox = mkdtempProjectIsolated('tt-start-switch-');
mkdirSync(path.join(startSwitchSandbox, '.ai-task-manager'), { recursive: true });
writeFileSync(
  path.join(startSwitchSandbox, '.ai-task-manager', 'task-tracker.json'),
  JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
);
// #568 — the bind path's first-row resolution (`start` vs `resumed`) keys off a
// READ of the issue's timing comment, discriminating a positively-absent log
// (fresh issue → downgrade to `start`) from an unreadable one (read error →
// fail closed to `resumed`, never a duplicate `start`). Under TT_SKIP_NETWORK
// alone the read shells to real `gh` against a fake repo and *errors*,
// conflating "skipped" with "absent". Give this block a real (issue-namespaced)
// fake-gh timing backend so #201/#202 read as genuinely absent — the same
// signal production sees for a never-bound issue — and the downgrade fires.
const switchBin = path.join(startSwitchSandbox, 'bin');
mkdirSync(switchBin, { recursive: true });
const fakeGhMjs = path.resolve(__dir, '..', 'fixtures', 'fake-gh.mjs');
const switchGhShim = path.join(switchBin, 'gh');
writeFileSync(switchGhShim, `#!/bin/sh\nexec "${process.execPath}" "${fakeGhMjs}" "$@"\n`);
chmodSync(switchGhShim, 0o755);
const switchStore = path.join(startSwitchSandbox, 'gh-store.json');
writeFileSync(switchStore, JSON.stringify({ comments: [], nextId: 1 }));
const switchEnv = {
  ...process.env,
  AI_TASK_MANAGER_PROJECT_DIR: startSwitchSandbox,
  TT_SKIP_NETWORK: '1',
  PATH: `${switchBin}:${process.env.PATH}`,
  FAKE_GH_STORE: switchStore,
};

// Bind #200, pause it so lastActive=#200 and active=null.
await pexec('node', [CLI, '#200'], { env: switchEnv });
await pexec('node', [CLI, 'pause'], { env: switchEnv });

// `/task start #201` must bind #201, not lastActive #200. It binds the target
// directly rather than delegating to switch. The first-ever bind of #201 (no
// timing history of its own — the pause was on #200). The stable CLI contract
// reports the requested issue as active.
let rs = await pexec('node', [CLI, 'start', '#201'], { env: switchEnv });
assert.match(rs.stdout, /Active: #201/, '/task start #N should bind the requested issue');
assert.doesNotMatch(rs.stdout, /Resumed #200/, '/task start #N must not resume lastActive');

// Regression guard: `/task resume #N` binds the target directly (no switch
// delegation) when there is no active task. #202 is likewise a fresh first
// bind and reports the requested issue as active.
await pexec('node', [CLI, 'pause'], { env: switchEnv });
rs = await pexec('node', [CLI, 'resume', '#202'], { env: switchEnv });
assert.match(rs.stdout, /Active: #202/, '/task resume #N should bind the requested issue');

// `/task resume` with no arg and after pause resumes lastActive.
await pexec('node', [CLI, 'pause'], { env: switchEnv });
rs = await pexec('node', [CLI, 'resume'], { env: switchEnv });
assert.match(
  rs.stdout,
  /Resumed #202/,
  '/task resume (no arg) after pause should resume lastActive'
);

rmSync(startSwitchSandbox, { recursive: true });

rmSync(sandbox, { recursive: true });

// ---- Uninitialized guard tests ----
// Dir has .ai-task-manager/ but no task-tracker.json — fail-closed `config-not-found`.
// fleet-sandbox-ok: deliberately uninitialized (no task-tracker.json) — every verb fails config-not-found before reaching registerTask, so no leak is possible.
const noRepoDirBase = mkdtempSync(path.join(projectScratchDir('test'), 'tt-norepo-'));
mkdirSync(path.join(noRepoDirBase, '.ai-task-manager'), { recursive: true });
const noRepoEnv = {
  ...process.env,
  AI_TASK_MANAGER_PROJECT_DIR: noRepoDirBase,
  TT_SKIP_NETWORK: '1',
};

for (const blockedVerb of [
  '#42',
  'close',
  'pause',
  'discover',
  'new',
  'update',
  'review',
  'check',
  'log',
]) {
  try {
    await pexec('node', [CLI, blockedVerb], { env: noRepoEnv });
    assert.fail(`Expected non-zero exit for verb: ${blockedVerb}`);
  } catch (err) {
    assert.match(
      err.stderr,
      /config-not-found|not initialized/i,
      `verb "${blockedVerb}" should fail-closed with config-not-found or not initialized`
    );
  }
}

// Exempt verbs succeed without repo
for (const exemptVerb of ['status', 'config', 'help', '?']) {
  const er = await pexec('node', [CLI, exemptVerb], { env: noRepoEnv });
  assert.ok(
    er.stdout.length > 0 || er.stderr.length === 0,
    `exempt verb "${exemptVerb}" should not error`
  );
}

rmSync(noRepoDirBase, { recursive: true });

// ---- Fail-closed bootstrap: --role agent with no .ai-task-manager/ ----
// Worktree pipeline regression guard. Must exit non-zero with "config-not-found at <path>"
// when an agent boots into a worktree that wasn't seeded with .ai-task-manager/.
// fleet-sandbox-ok: deliberately unseeded worktree — --role agent must fail config-not-found before reaching registerTask, so no leak is possible.
const bareWorktree = mkdtempSync(path.join(projectScratchDir('test'), 'tt-bare-wt-'));
const bareEnv = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: bareWorktree, TT_SKIP_NETWORK: '1' };
try {
  await pexec('node', [CLI, '#42', '--role', 'agent'], { env: bareEnv });
  assert.fail('Expected non-zero exit for --role agent in unseeded worktree');
} catch (err) {
  assert.match(
    err.stderr,
    /config-not-found at/,
    'agent bootstrap must report config-not-found path'
  );
  assert.match(
    err.stderr,
    /\.ai-task-manager[\\/]task-tracker\.json/,
    'error must name the missing config file'
  );
  // #575 — seeding retired; the remedy is now `npx aitm init`, not a seed helper.
  assert.match(err.stderr, /npx aitm init/, 'error must point to the init remedy');
}
rmSync(bareWorktree, { recursive: true });
console.log('cli.test.mjs: status/config/end passed');
