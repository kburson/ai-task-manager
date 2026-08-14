// @story #1166

import { strict as assert } from 'node:assert';
import { execFileSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  classifyBashWorktreeCommand,
  evaluateBashWorktreeBinding,
} from '../../../../task-tracker/lib/bash-worktree-guard.mjs';
import { evaluateGhEdit } from '../../../../task-tracker/lib/gh-edit-guard.mjs';
import { writeFleet } from '../../../../task-tracker/fleet-registry.mjs';
import { fleetPath } from '../../../../task-tracker/paths.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { mkdtempOutsideRepo } from '../../../../task-tracker/lib/scratch-dir.mjs';

const GUARD = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  '..',
  '..',
  'task-tracker',
  'bash-guard.mjs'
);

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'aitm-test',
      GIT_AUTHOR_EMAIL: 'aitm-test@example.com',
      GIT_COMMITTER_NAME: 'aitm-test',
      GIT_COMMITTER_EMAIL: 'aitm-test@example.com',
    },
  }).trim();
}

function makeRepo() {
  const root = mkdtempOutsideRepo('aitm-bash-binding-');
  git(root, 'init', '-q', '-b', 'trunk');
  git(root, 'config', 'user.name', 'aitm-test');
  git(root, 'config', 'user.email', 'aitm-test@example.com');
  execFileSync('touch', ['README.md'], { cwd: root });
  git(root, 'add', 'README.md');
  git(root, 'commit', '-q', '-m', 'seed');
  const child = path.join(root, '.worktrees', '1166');
  git(root, 'worktree', 'add', '-q', '-b', 'feature/child/1166', child, 'trunk');
  return { root, child };
}

async function runGuard({ cwd, command, sessionId }) {
  const payload = JSON.stringify({ tool_name: 'Bash', cwd, tool_input: { command } });
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [GUARD], {
      cwd,
      env: { ...process.env, AI_TASK_MANAGER_SESSION_ID: sessionId },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(payload);
  });
}

const bound = {
  issueNumber: 1166,
  worktreePath: '/repo/.worktrees/1166',
  worktreeBranch: 'feature/child/1166',
};
const invoking = { worktreePath: '/repo', worktreeBranch: 'trunk' };

test('classifies writes and verification across compound command segments', () => {
  for (const command of [
    'git commit -m fix',
    'git status && npm test',
    'pwd; node scripts/check.mjs',
    'npx aitm close 1166',
    'rg TODO . && touch changed.txt',
    'sed -i.bak s/a/b/ file.txt',
  ]) {
    assert.equal(classifyBashWorktreeCommand(command).guarded, true, command);
  }
});

test('allows navigation and read-only inspection classifications', () => {
  for (const command of [
    'cd /repo/.worktrees/1166',
    'pwd',
    'git status --short',
    'git log --oneline -3',
    'git diff --check',
    'rg worktree scripts',
    'sed -n 1,80p file.txt',
    'find scripts -type f',
  ]) {
    assert.equal(classifyBashWorktreeCommand(command).guarded, false, command);
  }
});

test('confirmed mismatch refuses with complete corrective diagnostics', () => {
  const result = evaluateBashWorktreeBinding({ command: 'npm test', bound, invoking });
  assert.equal(result.block, true);
  assert.match(result.reason, /#1166/);
  assert.match(result.reason, /\/repo\/\.worktrees\/1166/);
  assert.match(result.reason, /feature\/child\/1166/);
  assert.match(result.reason, /Invoking worktree: \/repo \(trunk\)/);
  assert.match(result.reason, /cd '\/repo\/\.worktrees\/1166'/);
  assert.match(result.reason, /--allow-foreign-worktree/);
});

test('absence, matching worktree, and explicit override pass unchanged', () => {
  assert.deepEqual(evaluateBashWorktreeBinding({ command: 'npm test', bound: null, invoking }), {
    block: false,
    status: 'unbound',
  });
  assert.equal(
    evaluateBashWorktreeBinding({ command: 'npm test', bound, invoking: bound }).block,
    false
  );
  assert.equal(
    evaluateBashWorktreeBinding({
      command: 'npm test -- --allow-foreign-worktree',
      bound,
      invoking,
    }).block,
    false
  );
});

test('real PreToolUse hook refuses a guarded command from a foreign worktree', async (t) => {
  const { root, child } = makeRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sessionId = 'bash-guard-binding-1166';
  setActiveTask(
    sessionId,
    {
      issue: '#1166',
      worktreePath: child,
      worktreeBranch: 'feature/child/1166',
      worktreeResolvedAt: new Date().toISOString(),
    },
    child
  );
  writeFleet(fleetPath(root), {
    '#1166': {
      worktreePath: child,
      branch: 'feature/child/1166',
      kind: 'worktree',
      status: 'active',
      startedAt: new Date().toISOString(),
    },
  });

  const refusal = await runGuard({ cwd: root, command: 'git status && npm test', sessionId });
  assert.equal(refusal.code, 0, refusal.stderr);
  const decision = JSON.parse(refusal.stdout);
  assert.equal(decision.decision, 'block');
  assert.match(decision.reason, /AITM worktree binding mismatch/);
  assert.match(decision.reason, new RegExp(child.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const inspection = await runGuard({ cwd: root, command: 'git status --short', sessionId });
  assert.equal(inspection.code, 0, inspection.stderr);
  assert.equal(inspection.stdout, '');

  const override = await runGuard({
    cwd: root,
    command: 'npm test -- --allow-foreign-worktree',
    sessionId,
  });
  assert.equal(override.code, 0, override.stderr);
  assert.equal(override.stdout, '');
});

test('existing gh-edit evaluator outcomes are unchanged', () => {
  assert.equal(evaluateGhEdit({ command: 'gh issue edit 1166 --body "x"' }).block, true);
  assert.deepEqual(evaluateGhEdit({ command: 'gh issue edit 1166 --add-label bug' }), {
    block: false,
  });
});
