// @story #65
// Tests for scripts/task-tracker/activity-guard.mjs
//
// Spawns the hook as a subprocess, feeds stdin JSON, asserts exit/stdout.
//
// State coupling: the guard reads `.ai-task-manager/task-tracker-state.json`
// from the project root resolved via `git rev-parse --show-toplevel`. Each
// test sets up a temp git repo so the guard sees a known state.

import { test } from 'node:test';
import { makeRepo, makeRepoNoState } from '../../../helpers/activity-guard-fixture.mjs';
import '../../../fixtures/offline-gh-auto.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import path from 'node:path';
import url from 'node:url';

import {
  createRuntimeRootFixture,
  activateRuntimeRootFixture,
} from '../../../helpers/runtime-root-fixture.mjs';
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
import { statePath, activeTaskPath } from '../../../../task-tracker/paths.mjs';
initializeFixtureActor(import.meta.url);

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

test('Edit src/foo.ts in develop → pass', async () => {
  const dir = await makeRepo({ state: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

test('Edit docs/notes.md in plan without current-session binding → allow', async () => {
  const dir = await makeRepo({ state: 'plan' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '', r.stderr);
  } finally {
    cleanup(dir);
  }
});

test('Edit docs/notes.md in refine without an exact binding → allow', async () => {
  const dir = await makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '', r.stderr);
  } finally {
    cleanup(dir);
  }
});

test('Edit .github/ISSUE_TEMPLATE/bug.md in refine → pass', async () => {
  const dir = await makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: {
        tool_name: 'Edit',
        tool_input: { file_path: '.github/ISSUE_TEMPLATE/bug.md' },
      },
    });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

test('Bash npm test in test → pass', async () => {
  const dir = await makeRepo({ state: 'test' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'npm test' } },
    });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

test('Bash READ command (cat README.md) in done → pass', async () => {
  const dir = await makeRepo({ state: 'done' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'cat README.md' } },
    });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

test('Write .scratch/gh/foo.txt in develop → pass (scratch carve-out)', async () => {
  const dir = await makeRepo({ state: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Write', tool_input: { file_path: '.scratch/gh/foo.txt' } },
    });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

test('Write .scratch/plan/draft.md in refine → pass (scratch carve-out)', async () => {
  const dir = await makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Write', tool_input: { file_path: '.scratch/plan/draft.md' } },
    });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

test('Write absolute .scratch/ path → pass (scratch carve-out)', async () => {
  const dir = await makeRepo({ state: 'done' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: {
        tool_name: 'Write',
        tool_input: { file_path: path.join(dir, '.scratch/gh/issue-body.md') },
      },
    });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

test('Write .tmp/aitm runtime path in refine → pass', async () => {
  const dir = await makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: {
        tool_name: 'Write',
        tool_input: { file_path: '.tmp/aitm/state/task-tracker-state.json' },
      },
    });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Block cases
// ---------------------------------------------------------------------------

test('Edit src/foo.ts in refine → block; suggests develop', async () => {
  const dir = await makeRepo({ state: 'refine' });
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

test('Edit src/foo.ts in test → block; suggests develop', async () => {
  const dir = await makeRepo({ state: 'test' });
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

test('Bash heredoc to src/ in refine → block', async () => {
  const dir = await makeRepo({ state: 'refine' });
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

test('Bash npm run build in refine → block', async () => {
  const dir = await makeRepo({ state: 'refine' });
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

test('Bash git commit in refine → block (COMMIT_CODE)', async () => {
  const dir = await makeRepo({ state: 'refine' });
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

test('Edit src/foo.ts with active issue but no state field → block; suggest reconcile', async () => {
  const dir = await makeRepo({/* no state */});
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

test('Edit src/foo.ts with an empty admitted ledger → block (no-active-task)', async () => {
  const dir = await makeRepoNoState();
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

test('Edit docs/notes.md with active issue but no state → allow', async () => {
  const dir = await makeRepo({/* no state */});
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '', r.stderr);
  } finally {
    cleanup(dir);
  }
});

test('Read with no active task and an empty admitted ledger → pass', async () => {
  // Sanity check that READ_* still bypasses the no-state branch.
  const dir = await makeRepoNoState();
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'cat package.json' } },
    });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Protocol / malformed input
// ---------------------------------------------------------------------------

test("malformed stdin JSON → pass (don't deadlock)", async () => {
  const dir = await makeRepo({ state: 'refine' });
  try {
    const r = runGuard({ cwd: dir, stdinRaw: 'not-json{' });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

test('unknown tool_name → pass-through', async () => {
  const dir = await makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'WeirdTool', tool_input: { command: 'whatever' } },
    });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

test('Edit with missing file_path → pass (avoid false-positive)', async () => {
  const dir = await makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: {} },
    });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

test('Edit with absolute path inside project root → normalized + blocked in refine', async () => {
  const dir = await makeRepo({ state: 'refine' });
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

async function writeSessionCache(dir, sid, record) {
  await setActiveTask(sid, record, dir);
}

test('session kanbanState cache supplies state when global state field is absent', async () => {
  const dir = await makeRepo({/* no legacy state */});
  await writeSessionCache(dir, 'sess-a', { issue: '#65', kanbanState: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

test('session kanbanState overrides legacy global state when both present', async () => {
  // Legacy says develop (would allow), session cache says refine (would block).
  // Session cache wins (it mirrors the body-marker source of truth).
  const dir = await makeRepo({ state: 'develop' });
  await writeSessionCache(dir, 'sess-a', { issue: '#65', kanbanState: 'refine' });
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

test('session cache for a different issue is ignored', async () => {
  const dir = await makeRepo({/* no legacy state */});
  await writeSessionCache(dir, 'sess-a', { issue: '#999', kanbanState: 'develop' });
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

test('session cache with invalid kanbanState is ignored; falls back', async () => {
  const dir = await makeRepo({/* no legacy state */});
  await writeSessionCache(dir, 'sess-a', { issue: '#65', kanbanState: 'bogus' });
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

test('most-recently-modified session cache wins when multiple match', async () => {
  const dir = await makeRepo({/* no legacy state */});
  // Older cache says refine
  await writeSessionCache(dir, 'sess-old', { issue: '#65', kanbanState: 'refine' });
  // Force a measurable mtime gap, then write newer cache saying develop.
  spawnSync('sleep', ['0.05']);
  await writeSessionCache(dir, 'sess-new', { issue: '#65', kanbanState: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.deepEqual([r.code, r.stdout], [0, '']);
  } finally {
    cleanup(dir);
  }
});

test('invalid state value in state file with active issue → block; suggest reconcile', async () => {
  const dir = await makeRepo({ state: 'bogus-state' });
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

for (const draftingState of ['backlog', 'refine', 'ready-for-plan', 'plan']) {
  test(`linked ${draftingState} document commit uses payload worktree and exact owner`, async () => {
    const root = createRuntimeRootFixture('aitm-activity-linked-');
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
      await activateRuntimeRootFixture(root, [child]);
      mkdirSync(path.join(child, 'docs'));
      writeFileSync(path.join(child, 'docs', 'plan.md'), 'plan');
      run(child, 'add', 'docs/plan.md');
      mkdirSync(path.join(child, '.ai-task-manager'), { recursive: true });
      writeFileSync(
        path.join(child, '.ai-task-manager', 'task-tracker.json'),
        JSON.stringify({ repo: 'owner/repo', projectId: 'PVT_test' })
      );
      const sid = 'activity-plan-1830';
      await setActiveTask(
        sid,
        {
          issue: '#1830',
          kanbanState: draftingState,
          worktreePath: child,
          worktreeBranch: 'work/1830',
        },
        child
      );
      mkdirSync(shim);
      const fixture = {
        data: {
          repository: {
            issue: {
              assignees: { nodes: [{ login: 'tester' }] },
              projectItems: {
                nodes: [{ project: { id: 'PVT_test' }, fieldValueByName: { name: draftingState } }],
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
        session_id: sid,
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
        payload: {
          ...payload,
          tool_input: { command: `${binary} -C . ${verb} -m "[#1830] docs"` },
        },
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
        session_id: sid,
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
      const conflictingEnv = { ...env, AI_TASK_MANAGER_SESSION_ID: 'wrong-native-session' };
      assert.equal(runGuard({ cwd: root, payload, env: conflictingEnv }).stdout, '');
      assert.equal(
        runGuard({ cwd: root, payload, env: conflictingEnv, guardPath: BASH_GUARD }).stdout,
        ''
      );
      for (const guardPath of [GUARD, SOURCE_GUARD]) {
        assert.equal(
          runGuard({ cwd: root, payload: editPayload, env: conflictingEnv, guardPath }).stdout,
          ''
        );
        assert.equal(
          runGuard({
            cwd: root,
            payload: { ...editPayload, session_id: 'missing-session' },
            env,
            guardPath,
          }).stdout,
          ''
        );
      }
      // #1857: invoking-root artifact writes do not borrow the child's binding.
      for (const command of ['mkdir -p .scratch/local', "printf '%s' draft > docs/local.md"]) {
        const artifact = runGuard({
          cwd: root,
          payload: { ...payload, cwd: root, tool_input: { command } },
          env,
          guardPath: BASH_GUARD,
        });
        assert.equal(artifact.stdout, '', artifact.stderr);
      }
      const redirect = { ...payload, tool_input: { command: 'echo draft > docs/plan.md' } };
      assert.equal(runGuard({ cwd: root, payload: redirect, env }).stdout, '');
      for (const command of [
        "cat | bash <<'EOF'\necho source > src/file.mjs\nEOF",
        'echo draft > docs/plan.md; node --test test.mjs',
        'echo draft > docs/plan.md; npm run build',
        'echo draft > docs/plan.md; cp payload src/file.mjs',
        'git branch codex/foreign',
        'tee docs/plan.md scripts/source.mjs',
        "echo code > 'scripts/source.mjs' docs/plan.md",
        'echo code > docs/plan.md".mjs"',
        'env touch docs/plan.md scripts/source.mjs',
        'command tee docs/plan.md scripts/source.mjs',
        `python -c 'open("scripts/x.mjs","w").write("bad")' > docs/plan.md`,
        'touch docs/plan.md scripts/source.mjs',
        'rm docs/plan.md scripts/source.mjs',
        "echo draft > docs/plan.md; echo code > 'scripts/source.mjs'",
        'echo draft > docs/plan.md; echo code 2> scripts/source.mjs',
      ]) {
        if (draftingState === 'plan' && command.includes('node --test')) continue;
        const result = runGuard({
          cwd: root,
          payload: { ...payload, tool_input: { command } },
          env,
        });
        assert.equal(result.decision?.decision, 'block', command);
      }
      const outside = {
        ...payload,
        tool_input: { command: 'echo draft > /' + 'tmp/1848-escape.md' },
      };
      assert.equal(runGuard({ cwd: root, payload: outside, env }).decision?.decision, 'block');
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
      await setActiveTask(
        sid,
        { issue: '#1830', kanbanState: 'review', worktreePath: child, worktreeBranch: 'work/1830' },
        child
      );
      const review = runGuard({ cwd: root, payload, env });
      assert.equal(review.decision?.decision, 'block');
      assert.match(review.decision.reason, /state differs|COMMIT_DOCS/);
      const choreStatePath = statePath(child);
      mkdirSync(path.dirname(choreStatePath), { recursive: true });
      writeFileSync(choreStatePath, JSON.stringify({ choreMode: { active: true } }));
      await setActiveTask(sid, { issue: null }, child);
      const unboundChore = runGuard({ cwd: root, payload, env });
      assert.equal(unboundChore.decision?.decision, 'block');
    } finally {
      run(root, 'worktree', 'remove', '--force', child);
      cleanup(root);
    }
  });
}

// @story #1848
test('native hook session selects its own state instead of an environment session', async () => {
  const dir = await makeRepo({ state: 'develop' });
  try {
    await setActiveTask('payload-session', { issue: '#65', kanbanState: 'develop' }, dir);
    await setActiveTask('environment-session', { issue: '#65', kanbanState: 'backlog' }, dir);
    const env = { ...process.env, AI_TASK_MANAGER_SESSION_ID: 'environment-session' };
    const payload = {
      session_id: 'payload-session',
      tool_name: 'Edit',
      tool_input: { file_path: 'src/foo.ts' },
    };
    assert.equal(runGuard({ cwd: dir, payload, env }).decision, null);
    const bindingPath = activeTaskPath('payload-session', dir);
    const corrupt = JSON.parse(readFileSync(bindingPath, 'utf8'));
    corrupt.kanbanState = null;
    writeFileSync(bindingPath, JSON.stringify(corrupt));
    assert.equal(runGuard({ cwd: dir, payload, env }).decision?.decision, 'block');
  } finally {
    cleanup(dir);
  }
});

// @story #1848
test('scratch shell allowance validates physical targets and preserves early code restrictions', async () => {
  const dir = await makeRepo({ state: 'backlog' });
  try {
    mkdirSync(path.join(dir, '.scratch'));
    mkdirSync(path.join(dir, 'src'));
    symlinkSync(path.join(dir, 'src'), path.join(dir, '.scratch', 'alias'));
    const payload = (command) => ({ tool_name: 'Bash', tool_input: { command } });
    assert.equal(
      runGuard({ cwd: dir, payload: payload("cat > .scratch/scope.md <<'EOF'\ntext\nEOF") })
        .decision,
      null
    );
    assert.equal(runGuard({ cwd: dir, payload: payload('mkdir -p .scratch/plan') }).decision, null);
    assert.equal(
      runGuard({ cwd: dir, payload: payload('echo text > .scratch/alias/source.mjs') }).decision
        ?.decision,
      'block'
    );
    assert.equal(
      runGuard({
        cwd: dir,
        payload: payload('echo text > .scratch/scope.md; echo code > src/source.mjs'),
      }).decision?.decision,
      'block'
    );
    assert.equal(
      runGuard({ cwd: dir, payload: payload("python3 - <<'PY'\nprint('text')\nPY") }).decision
        ?.decision,
      'block'
    );
    for (const session_id of ['', null, '../escape'])
      assert.equal(
        runGuard({ cwd: dir, payload: { ...payload('echo text > src/source.mjs'), session_id } })
          .decision?.decision,
        'block'
      );
  } finally {
    cleanup(dir);
  }
});

// @story #1848
test('Bash scope guard does not execute quoted cat payload examples as issue commands', async () => {
  const dir = await makeRepo({ state: 'backlog' });
  try {
    const command = "cat > docs/draft.md <<'EOF'\ngh issue create --title example\nEOF";
    const payload = { tool_name: 'Bash', tool_input: { command } };
    assert.equal(runGuard({ cwd: dir, payload, guardPath: BASH_GUARD }).decision, null);
  } finally {
    cleanup(dir);
  }
});

// @story #1848
test('Plan runner does not bypass exact document binding', async () => {
  const dir = await makeRepo({ state: 'plan', activeIssue: '#65' });
  try {
    await setActiveTask('incomplete-plan', { issue: '#65', kanbanState: 'plan' }, dir);
    const result = runGuard({
      cwd: dir,
      payload: {
        session_id: 'incomplete-plan',
        tool_name: 'Bash',
        tool_input: { command: 'echo draft > docs/plan.md; node --test test.mjs' },
      },
    });
    assert.equal(result.decision?.decision, 'block');
    assert.match(result.decision.reason, /session binding/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
