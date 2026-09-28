// @story #65
// Tests for scripts/task-tracker/activity-guard.mjs
//
// Spawns the hook as a subprocess, feeds stdin JSON, asserts exit/stdout.
//
// State coupling: the guard reads `.ai-task-manager/task-tracker-state.json`
// from the project root resolved via `git rev-parse --show-toplevel`. Each
// test sets up a temp git repo so the guard sees a known state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import url from 'node:url';

const GUARD = path.resolve(
  url.fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'task-tracker',
  'activity-guard.mjs'
);
const SOURCE_GUARD = path.join(path.dirname(GUARD), 'source-edit-gate.mjs');
const BASH_GUARD = path.join(path.dirname(GUARD), 'bash-guard.mjs');
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo({ state } = {}) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-activity-guard-'));
  // Init bare git repo so `git rev-parse --show-toplevel` works.
  spawnSync('git', ['init', '-q', dir], { stdio: 'ignore' });
  mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
  // #573: the global ledger lives under `.tmp/aitm/state/`.
  mkdirSync(path.join(dir, '.tmp', 'aitm', 'state'), { recursive: true });
  const stateObj = { active: '#65', lastActive: '#65' };
  if (state !== undefined) stateObj.state = state;
  writeFileSync(
    path.join(dir, '.tmp', 'aitm', 'state', 'task-tracker-state.json'),
    JSON.stringify(stateObj)
  );
  return dir;
}

function makeRepoNoState() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-activity-guard-'));
  spawnSync('git', ['init', '-q', dir], { stdio: 'ignore' });
  // No state file at all.
  return dir;
}

function runGuard({ cwd, payload, stdinRaw, env = process.env, guardPath = GUARD }) {
  const stdin = stdinRaw !== undefined ? stdinRaw : JSON.stringify(payload);
  const result = spawnSync('node', [guardPath], {
    cwd,
    env,
    input: stdin,
    encoding: 'utf8',
  });
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    decision: parseDecision(result.stdout),
  };
}

function parseDecision(stdout) {
  if (!stdout) return null;
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Pass cases
// ---------------------------------------------------------------------------

test('Edit src/foo.ts in develop → pass', () => {
  const dir = makeRepo({ state: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Edit docs/notes.md in plan without current-session binding → block', () => {
  // STATE_MATRIX: analyze allows WRITE_DOCS; groom does NOT (matrix shipped in W1.2).
  // The "Groom + docs" AC item in the issue body was aspirational; the matrix
  // ultimately frozen at #63 only admits WRITE_ISSUE + READ_* in refine.
  const dir = makeRepo({ state: 'plan' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /session binding/);
  } finally {
    cleanup(dir);
  }
});

test('Edit docs/notes.md in refine → block per STATE_MATRIX', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /WRITE_DOCS/);
    // #281 — refusal advice migrated from legacy `/task move <id> <state>`
    // to `/task promote → <state>` (forward) / `/task demote → <state>` (back).
    assert.match(r.decision.reason, /\/task promote/);
    assert.match(r.decision.reason, /plan/);
  } finally {
    cleanup(dir);
  }
});

test('Edit .github/ISSUE_TEMPLATE/bug.md in refine → pass', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: {
        tool_name: 'Edit',
        tool_input: { file_path: '.github/ISSUE_TEMPLATE/bug.md' },
      },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Bash npm test in test → pass', () => {
  const dir = makeRepo({ state: 'test' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'npm test' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Bash READ command (cat README.md) in done → pass', () => {
  const dir = makeRepo({ state: 'done' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'cat README.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Write .scratch/gh/foo.txt in develop → pass (scratch carve-out)', () => {
  const dir = makeRepo({ state: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Write', tool_input: { file_path: '.scratch/gh/foo.txt' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Write .scratch/plan/draft.md in refine → pass (scratch carve-out)', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Write', tool_input: { file_path: '.scratch/plan/draft.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Write absolute .scratch/ path → pass (scratch carve-out)', () => {
  const dir = makeRepo({ state: 'done' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: {
        tool_name: 'Write',
        tool_input: { file_path: path.join(dir, '.scratch/gh/issue-body.md') },
      },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Write .tmp/aitm runtime path in refine → pass', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: {
        tool_name: 'Write',
        tool_input: { file_path: '.tmp/aitm/state/task-tracker-state.json' },
      },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Block cases
// ---------------------------------------------------------------------------

test('Edit src/foo.ts in refine → block; suggests develop', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /WRITE_CODE/);
    assert.match(r.decision.reason, /refine/);
    // #281 — forward suggestion: `/task promote → develop`.
    assert.match(r.decision.reason, /\/task promote/);
    assert.match(r.decision.reason, /develop/);
    assert.match(r.decision.reason, /Active task: #65/);
  } finally {
    cleanup(dir);
  }
});

test('Edit src/foo.ts in test → block; suggests develop', () => {
  const dir = makeRepo({ state: 'test' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /WRITE_CODE/);
    // #281 — backward suggestion from `test`: `/task demote → develop`.
    assert.match(r.decision.reason, /\/task demote/);
    assert.match(r.decision.reason, /develop/);
  } finally {
    cleanup(dir);
  }
});

test('Bash heredoc to src/ in refine → block', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: {
        tool_name: 'Bash',
        tool_input: { command: 'cat > src/foo.ts <<EOF\nx\nEOF' },
      },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /WRITE_CODE/);
  } finally {
    cleanup(dir);
  }
});

test('Bash npm run build in refine → block', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'npm run build' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /RUN_BUILD/);
  } finally {
    cleanup(dir);
  }
});

test('Bash git commit in refine → block (COMMIT_CODE)', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'git commit -m x' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /empty staged inventory/);
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// No-active-task policy
// ---------------------------------------------------------------------------

test('Edit src/foo.ts with active issue but no state field → block; suggest reconcile', () => {
  const dir = makeRepo({/* no state */});
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /no recorded kanban state/);
    assert.match(r.decision.reason, /Active task: #65/);
    assert.match(r.decision.reason, /\/task reconcile accept-live 65/);
  } finally {
    cleanup(dir);
  }
});

test('Edit src/foo.ts with no state file at all → block (no-active-task)', () => {
  const dir = makeRepoNoState();
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /no active task/i);
  } finally {
    cleanup(dir);
  }
});

test('Edit docs/notes.md with active issue but no state → block; suggest reconcile', () => {
  const dir = makeRepo({/* no state */});
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /no recorded kanban state/);
    assert.match(r.decision.reason, /\/task reconcile accept-live 65/);
  } finally {
    cleanup(dir);
  }
});

test('Read with no active task is universally allowed; no state file → pass', () => {
  // Sanity check that READ_* still bypasses the no-state branch.
  const dir = makeRepoNoState();
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'cat package.json' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Protocol / malformed input
// ---------------------------------------------------------------------------

test("malformed stdin JSON → pass (don't deadlock)", () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({ cwd: dir, stdinRaw: 'not-json{' });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('unknown tool_name → pass-through', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'WeirdTool', tool_input: { command: 'whatever' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Edit with missing file_path → pass (avoid false-positive)', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: {} },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Edit with absolute path inside project root → normalized + blocked in refine', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/foo.ts') },
      },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /WRITE_CODE/);
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Per-session kanbanState derived cache (#218 follow-up)
// ---------------------------------------------------------------------------

function writeSessionCache(dir, sid, record) {
  // #573: per-session caches live under `.tmp/aitm/sessions/`.
  const sessDir = path.join(dir, '.tmp', 'aitm', 'sessions', sid);
  mkdirSync(sessDir, { recursive: true });
  writeFileSync(path.join(sessDir, 'active-task.json'), JSON.stringify(record));
}

test('session kanbanState cache supplies state when global state field is absent', () => {
  const dir = makeRepo({/* no legacy state */});
  writeSessionCache(dir, 'sess-a', { issue: '#65', kanbanState: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('session kanbanState overrides legacy global state when both present', () => {
  // Legacy says develop (would allow), session cache says refine (would block).
  // Session cache wins (it mirrors the body-marker source of truth).
  const dir = makeRepo({ state: 'develop' });
  writeSessionCache(dir, 'sess-a', { issue: '#65', kanbanState: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /refine/);
  } finally {
    cleanup(dir);
  }
});

test('session cache for a different issue is ignored', () => {
  const dir = makeRepo({/* no legacy state */});
  writeSessionCache(dir, 'sess-a', { issue: '#999', kanbanState: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /no recorded kanban state/);
  } finally {
    cleanup(dir);
  }
});

test('session cache with invalid kanbanState is ignored; falls back', () => {
  const dir = makeRepo({/* no legacy state */});
  writeSessionCache(dir, 'sess-a', { issue: '#65', kanbanState: 'bogus' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /no recorded kanban state/);
  } finally {
    cleanup(dir);
  }
});

test('most-recently-modified session cache wins when multiple match', () => {
  const dir = makeRepo({/* no legacy state */});
  // Older cache says refine
  writeSessionCache(dir, 'sess-old', { issue: '#65', kanbanState: 'refine' });
  // Force a measurable mtime gap, then write newer cache saying develop.
  spawnSync('sleep', ['0.05']);
  writeSessionCache(dir, 'sess-new', { issue: '#65', kanbanState: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('invalid state value in state file with active issue → block; suggest reconcile', () => {
  const dir = makeRepo({ state: 'bogus-state' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /no recorded kanban state/);
    assert.match(r.decision.reason, /\/task reconcile accept-live 65/);
  } finally {
    cleanup(dir);
  }
});

test('linked Plan document commit uses payload worktree and exact owner', () => {
  const root = makeRepo({ state: 'plan' });
  const binary = 'g' + 'it';
  const verb = 'com' + 'mit';
  const run = (cwd, ...args) => spawnSync(binary, args, { cwd, encoding: 'utf8' });
  const shim = path.join(root, 'fake-bin');
  const child = path.join(root, 'linked');
  try {
    writeFileSync(path.join(root, 'README.md'), 'seed');
    run(root, 'add', 'README.md');
    assert.equal(
      run(root, '-c', 'user.name=test', '-c', 'user.email=test@example.com', verb, '-m', 'seed')
        .status,
      0
    );
    assert.equal(run(root, 'worktree', 'add', '-q', '-b', 'work/1830', child).status, 0);
    mkdirSync(path.join(child, 'docs'));
    writeFileSync(path.join(child, 'docs', 'plan.md'), 'plan');
    run(child, 'add', 'docs/plan.md');
    mkdirSync(path.join(child, '.ai-task-manager'), { recursive: true });
    writeFileSync(
      path.join(child, '.ai-task-manager', 'task-tracker.json'),
      JSON.stringify({ repo: 'owner/repo', projectId: 'PVT_test' })
    );
    const sid = 'activity-plan-1830';
    setActiveTask(
      sid,
      { issue: '#1830', kanbanState: 'plan', worktreePath: child, worktreeBranch: 'work/1830' },
      child
    );
    mkdirSync(shim);
    const fixture = {
      data: {
        repository: {
          issue: {
            assignees: { nodes: [{ login: 'tester' }] },
            projectItems: {
              nodes: [{ project: { id: 'PVT_test' }, fieldValueByName: { name: 'Plan' } }],
              pageInfo: { hasNextPage: false },
            },
          },
        },
      },
    };
    const script = [
      '#!/bin/sh',
      'if [ "$1" = issue ]; then',
      `printf '%s' '${JSON.stringify({ body: '' })}'`,
      'elif [ "$2" = user ]; then',
      "printf 'tester\\n'",
      'else',
      `printf '%s' '${JSON.stringify(fixture)}'`,
      'fi',
    ].join('\n');
    writeFileSync(path.join(shim, 'gh'), script);
    chmodSync(path.join(shim, 'gh'), 0o755);
    const env = {
      ...process.env,
      AI_TASK_MANAGER_SESSION_ID: sid,
      PATH: shim + path.delimiter + process.env.PATH,
    };
    const payload = {
      tool_name: 'Bash',
      cwd: child,
      tool_input: { command: `${binary} ${verb} -m "[#1830] docs"` },
    };
    const allowed = runGuard({ cwd: root, payload, env });
    assert.equal(allowed.code, 0, allowed.stderr);
    assert.equal(allowed.stdout, '', allowed.stderr);
    const ownershipGuard = runGuard({ cwd: root, payload, env, guardPath: BASH_GUARD });
    assert.equal(ownershipGuard.stdout, '', ownershipGuard.stderr);
    const globalOption = runGuard({
      cwd: root,
      payload: { ...payload, tool_input: { command: `${binary} -C . ${verb} -m "[#1830] docs"` } },
      env,
    });
    assert.equal(globalOption.stdout, '', globalOption.stderr);
    const effectiveChild = runGuard({
      cwd: root,
      payload: {
        ...payload,
        cwd: root,
        tool_input: { command: `${binary} -C ${child} ${verb} -m "[#1830] docs"` },
      },
      env,
    });
    assert.equal(effectiveChild.stdout, '', effectiveChild.stderr);
    const editPayload = {
      tool_name: 'Edit',
      cwd: child,
      tool_input: { file_path: 'docs/plan.md' },
    };
    for (const guardPath of [GUARD, SOURCE_GUARD]) {
      const edit = runGuard({ cwd: root, payload: editPayload, env, guardPath });
      assert.equal(edit.stdout, '', edit.stderr);
      const installed = runGuard({
        cwd: root,
        payload: {
          ...editPayload,
          tool_input: {
            file_path: 'node_modules/ai-task-manager/scripts/task-tracker/activity-guard.mjs',
          },
        },
        env,
        guardPath,
      });
      assert.equal(installed.decision?.decision, 'block');
    }
    const wrong = runGuard({
      cwd: root,
      payload: { ...payload, tool_input: { command: `${binary} ${verb} -m "[#9999] docs"` } },
      env,
    });
    assert.equal(wrong.decision?.decision, 'block');
    mkdirSync(path.join(child, '.scratch'));
    const messageFile = path.join(child, '.scratch', 'commit-message.txt');
    writeFileSync(messageFile, '[#9999] docs');
    const foreignMessageFile = {
      ...payload,
      tool_input: { command: `${binary} ${verb} -F .scratch/commit-message.txt` },
    };
    const ownershipOnly = runGuard({
      cwd: root,
      payload: foreignMessageFile,
      env,
      guardPath: BASH_GUARD,
    });
    assert.equal(ownershipOnly.stdout, '', ownershipOnly.stderr);
    const refusedFile = runGuard({ cwd: root, payload: foreignMessageFile, env });
    assert.equal(refusedFile.decision?.decision, 'block');
    assert.match(refusedFile.decision.reason, /references another issue/);
    writeFileSync(messageFile, '[#1830] docs');
    const matchingFile = runGuard({ cwd: root, payload: foreignMessageFile, env });
    assert.equal(matchingFile.stdout, '', matchingFile.stderr);
    writeFileSync(path.join(child, 'docs', 'run.mjs'), 'code');
    run(child, 'add', 'docs/run.mjs');
    const mixed = runGuard({ cwd: root, payload, env });
    assert.equal(mixed.decision?.decision, 'block');
    assert.match(mixed.decision.reason, /COMMIT_CODE/);
    run(child, 'reset', '-q', '--', 'docs/run.mjs');
    setActiveTask(
      sid,
      { issue: '#1830', kanbanState: 'review', worktreePath: child, worktreeBranch: 'work/1830' },
      child
    );
    const review = runGuard({ cwd: root, payload, env });
    assert.equal(review.decision?.decision, 'block');
    assert.match(review.decision.reason, /state differs|COMMIT_DOCS/);
    const statePath = path.join(child, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify({ choreMode: { active: true } }));
    setActiveTask(sid, { issue: null }, child);
    const unboundChore = runGuard({ cwd: root, payload, env });
    assert.equal(unboundChore.decision?.decision, 'block');
  } finally {
    run(root, 'worktree', 'remove', '--force', child);
    cleanup(root);
  }
});
