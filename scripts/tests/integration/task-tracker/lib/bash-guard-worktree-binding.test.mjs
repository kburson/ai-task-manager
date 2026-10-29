// @story #1166 #2020

import { strict as assert } from 'node:assert';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
import { claimOccupancy } from '../../../../task-tracker/lib/occupancy.mjs';

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

async function runGuard({ cwd, payloadCwd = cwd, command, sessionId, native = false }) {
  const payload = JSON.stringify({
    tool_name: 'Bash',
    cwd: payloadCwd,
    tool_input: { command },
    ...(native ? { session_id: sessionId } : {}),
  });
  const env = { ...process.env };
  if (native) {
    for (const key of Object.keys(env)) {
      if (
        key.startsWith('GIT_') ||
        key.startsWith('AITM_') ||
        [
          'AI_TASK_MANAGER_SESSION_ID',
          'AI_TASK_MANAGER_PROJECT_DIR',
          'TASK_TRACKER_PROJECT_DIR',
          'CLAUDE_PROJECT_DIR',
          'TT_SKIP_NETWORK',
        ].includes(key)
      )
        delete env[key];
    }
    env.CODEX_THREAD_ID = sessionId;
    env.CODEX_SESSION_ID = sessionId;
  } else {
    env.AI_TASK_MANAGER_PROJECT_DIR = payloadCwd;
    env.AI_TASK_MANAGER_SESSION_ID = sessionId;
  }
  return await new Promise((resolve, reject) => {
    const args = native
      ? [
          '--experimental-test-module-mocks',
          '--import',
          new URL('../../../helpers/2105-branch-hook-github.mjs', import.meta.url).href,
          GUARD,
        ]
      : [GUARD];
    const child = spawn(process.execPath, args, {
      cwd,
      env,
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

test('native same-commit branch Start reaches the renewal path', async (t) => {
  const fixture = makeRepo();
  const root = realpathSync(fixture.root),
    child = realpathSync(fixture.child);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sid = 'native-renewal-offline-fixture';
  mkdirSync(path.join(child, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(child, '.gitignore'),
    '.tmp/\n.ai-task-manager/runtime/\n.ai-task-manager/sessions/\n'
  );
  writeFileSync(
    path.join(child, '.ai-task-manager/task-tracker.json'),
    JSON.stringify({
      repo: 'kburson/ai-task-manager',
      projectId: 'PVT_native_branch_fixture',
    })
  );
  git(child, 'add', '.gitignore', '.ai-task-manager/task-tracker.json');
  git(child, 'commit', '-q', '-m', 'seed native fixture profile');
  const claim = claimOccupancy({
    projectDir: child,
    issue: '#2105',
    sid,
    provider: 'codex',
    worktreePath: child,
  });
  setActiveTask(
    sid,
    {
      issue: '#2105',
      worktreePath: child,
      worktreeBranch: 'feature/child/1166',
      worktreeResolvedAt: new Date().toISOString(),
      entryStartTs: new Date().toISOString(),
      kanbanState: 'develop',
      bindingGenerationId: claim.row.bindingGenerationId,
    },
    child
  );
  writeFleet(fleetPath(root), {
    '#2105': {
      worktreePath: child,
      branch: 'feature/child/1166',
      status: 'active',
      kind: 'worktree',
    },
  });
  git(child, 'switch', '-q', '-c', 'codex/native-renewal-fixture');
  const result = await runGuard({
    cwd: child,
    sessionId: sid,
    native: true,
    command: 'npx aitm start 2105 --role orchestrator --confirm-relocation',
  });
  assert.equal(result.code, 0, result.stderr + result.stdout);
  const decision = result.stdout.trim() ? JSON.parse(result.stdout) : {};
  assert.notEqual(decision.decision, 'block', decision.reason);
  for (const command of [
    'npm test',
    'touch unauthorized',
    'npx aitm start 2106 --role orchestrator --confirm-relocation',
    'npx aitm start 2105 --role solo --confirm-relocation',
    'npx aitm start 2105 --role orchestrator --confirm-relocation --allow-foreign-worktree',
    'npx aitm start 2105 --role orchestrator --confirm-relocation && touch unauthorized',
  ]) {
    const refusal = await runGuard({ cwd: child, sessionId: sid, native: true, command });
    assert.equal(JSON.parse(refusal.stdout).decision, 'block', command);
  }
});

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

test('wrapped nested commits require the bound worktree', () => {
  for (const command of [
    "env bash -c 'git commit -m x'",
    "command bash -c 'git commit -m x'",
    "LANG=C bash -c 'git commit -m x'",
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
    'git config --get remote.origin.url',
    'git config --local --get remote.origin.url',
    'git worktree list --porcelain',
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
  assert.match(result.reason, /fleet release-closed-binding #1166/);
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

test('hook process in main checkout honors linked payload directory and recorded branch', async (t) => {
  const { root, child } = makeRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sessionId = 'binding-payload-1830';
  setActiveTask(
    sessionId,
    {
      issue: '#1830',
      worktreePath: child,
      worktreeBranch: 'feature/child/1166',
      worktreeResolvedAt: new Date().toISOString(),
    },
    child
  );
  writeFleet(fleetPath(root), {
    '#1830': {
      worktreePath: child,
      branch: 'feature/child/1166',
      kind: 'worktree',
      status: 'active',
      startedAt: new Date().toISOString(),
    },
  });
  const matched = await runGuard({ cwd: root, payloadCwd: child, command: 'npm test', sessionId });
  assert.equal(matched.stdout, '', matched.stderr);
  setActiveTask(
    sessionId,
    {
      issue: '#1830',
      worktreePath: child,
      worktreeBranch: 'trunk',
      worktreeResolvedAt: new Date().toISOString(),
    },
    child
  );
  const stale = await runGuard({ cwd: root, payloadCwd: child, command: 'npm test', sessionId });
  assert.equal(JSON.parse(stale.stdout).decision, 'block');
  assert.match(JSON.parse(stale.stdout).reason, /binding mismatch/);
});

test('aliases and literal nested shells remain guarded worktree mutations', () => {
  const binary = 'g' + 'it';
  const verb = 'com' + 'mit';
  for (const command of [`${binary} ci -m fix`, `bash -c '${binary} ${verb} -m fix'`])
    assert.equal(classifyBashWorktreeCommand(command).guarded, true, command);
  assert.equal(classifyBashWorktreeCommand(`echo '${binary} ${verb} -m fix'`).guarded, false);
});
