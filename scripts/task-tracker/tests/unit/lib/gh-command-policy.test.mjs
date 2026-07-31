#!/usr/bin/env node
// @story #111
// Tests for the gh issue command policy enforced by bash-guard.mjs.
//
// Coverage:
//   1. Direct `gh issue create` → blocked
//   2. Direct `gh issue close` → blocked
//   3. Direct `gh issue reopen` → blocked
//   4. `gh issue view` / `gh issue list` → allowed (read-only)
//   5. `gh issue edit --add-label` (no body) → allowed
//   6. Direct move-state script invocation → blocked (existing rule, regression)

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const GUARD = path.resolve(__dir, '..', '..', 'bash-guard.mjs');

function runGuard(command) {
  const payload = JSON.stringify({ tool_input: { command } });
  // Run in a temp git repo so project-root resolution works.
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'tt-gh-policy-'));
  mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
  writeFileSync(path.join(dir, '.ai-task-manager', 'task-tracker.json'), JSON.stringify({}));
  spawnSync('git', ['init', '-q', dir], { stdio: 'ignore' });

  const r = spawnSync(process.execPath, [GUARD], {
    input: payload,
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, HOME: process.env.HOME },
    timeout: 10000,
  });
  let parsed = {};
  try {
    parsed = JSON.parse(r.stdout || '{}');
  } catch {
    /* pass-through if no JSON */
  }
  return { blocked: parsed.decision === 'block', reason: parsed.reason ?? '', raw: r };
}

// 1. Direct `gh issue create` is blocked
{
  const r = runGuard('gh issue create --title "New issue" --body "description"');
  assert.equal(r.blocked, true, 'gh issue create must be blocked');
  assert.match(r.reason, /create-issue\.mjs/, 'reason must point to create-issue.mjs');
}

// 2. Direct `gh issue close` is blocked
{
  const r = runGuard('gh issue close 42');
  assert.equal(r.blocked, true, 'gh issue close must be blocked');
  assert.match(r.reason, /\/task close/, 'reason must point to /task close');
}

// 3. `gh issue reopen` bypasses task-state reconciliation and is refused,
// including through shell wrappers handled by the shared Bash grammar.
for (const command of [
  'gh issue reopen 42',
  "sh -c 'gh issue reopen 42'",
  'env sh -lc "gh issue reopen 42"',
]) {
  const r = runGuard(command);
  assert.equal(r.blocked, true, `${command} must be refused`);
  assert.match(r.reason, /task reconcile/i);
}

// 4a. `gh issue view` is allowed (read-only)
{
  const r = runGuard('gh issue view 42 --json body');
  assert.equal(r.blocked, false, 'gh issue view must be allowed');
}

// 4b. `gh issue list` is allowed (read-only)
{
  const r = runGuard('gh issue list --state open');
  assert.equal(r.blocked, false, 'gh issue list must be allowed');
}

// 5. `gh issue edit` without body still requires active issue authority.
{
  const r = runGuard('gh issue edit 42 --add-label bug');
  assert.equal(r.blocked, true, 'gh issue edit with --add-label must not be authority-free');
  assert.match(r.reason, /no active issue is bound/i);
}

// 5b. grep containing "gh issue create" as a search pattern must NOT be blocked
{
  const r = runGuard('grep -n "gh issue create" skill/shared/SKILL.md');
  assert.equal(r.blocked, false, 'grep with gh issue create pattern must not be blocked');
}

// 5c. grep containing "gh issue close" as a search pattern must NOT be blocked
{
  const r = runGuard("grep 'gh issue close\\|gh issue create' docs/guides/workflow.md");
  assert.equal(r.blocked, false, 'grep with gh issue close/create pattern must not be blocked');
}

// 6. Direct move-state script invocation is still blocked (regression guard)
{
  const r = runGuard('node scripts/task-tracker/move-state.mjs 42 develop');
  assert.equal(r.blocked, true, 'direct move-state invocation must still be blocked');
  assert.match(r.reason, /promote|demote/, 'reason must mention promote/demote');
}

console.log('gh-command-policy.test.mjs: all passed');
