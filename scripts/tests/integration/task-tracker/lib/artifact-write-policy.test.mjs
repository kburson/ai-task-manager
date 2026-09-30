// @story #1857
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { decideSourceEdit, runHook } from '../../../../task-tracker/source-edit-gate.mjs';
import { evaluateBashWorktreeBinding } from '../../../../task-tracker/lib/bash-worktree-guard.mjs';

const root = mkdtempProjectIsolated('artifact-1857-');
const guard = path.resolve('scripts/task-tracker/activity-guard.mjs');
const states = [
  null,
  'backlog',
  'refine',
  'ready-for-plan',
  'plan',
  'develop',
  'test',
  'review',
  'done',
  'unknown',
];
const artifacts = [
  'docs/draft.md',
  'docs/data.json',
  'docs/image.png',
  '.scratch/script.mjs',
  '.tmp/script.sh',
];
for (const dir of ['docs', '.scratch', '.tmp/aitm/state', 'scripts'])
  mkdirSync(path.join(root, dir), { recursive: true });
symlinkSync(path.join(root, 'scripts'), path.join(root, 'docs', 'source-link'));
test.after(() => rmSync(root, { recursive: true, force: true }));

function activity(tool_input, tool_name = 'Write', state = null, chore = false) {
  writeFileSync(
    path.join(root, '.tmp/aitm/state/task-tracker-state.json'),
    JSON.stringify({ active: state ? '#1857' : null, state, choreMode: { active: chore } })
  );
  const result = spawnSync(process.execPath, [guard], {
    cwd: root,
    input: JSON.stringify({ tool_name, tool_input }),
    encoding: 'utf8',
    env: { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: root },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout).decision : 'allow';
}

test('ordinary docs and every scratch format allow without ownership in every state', () => {
  for (const issueState of states)
    for (const filePath of artifacts) {
      const result = decideSourceEdit({
        toolName: 'Write',
        filePath,
        projectDir: root,
        boundIssue: issueState ? '#1857' : null,
        issueState,
        assignees: ['foreign'],
        currentUser: 'operator',
        hasPostedMarker: false,
        hasCompleteMarker: false,
      });
      assert.equal(result.decision, 'allow', `${issueState}: ${filePath}`);
      assert.notEqual(
        activity({ file_path: filePath }, 'Write', issueState),
        'block',
        `${issueState}: ${filePath}`
      );
    }
});

test('docs script suffixes refuse even during Develop and chore mode', () => {
  for (const filePath of ['docs/run.mjs', 'docs/run.sh', 'docs/run.py', 'docs/run.PS1']) {
    for (const choreModeActive of [false, true]) {
      const result = decideSourceEdit({
        toolName: 'Write',
        filePath,
        projectDir: root,
        boundIssue: '#1857',
        issueState: 'develop',
        choreModeActive,
        assignees: ['operator'],
        currentUser: 'operator',
        hasPostedMarker: true,
        hasCompleteMarker: true,
      });
      assert.equal(result.decision, 'block', filePath);
      assert.equal(
        activity({ file_path: filePath }, 'Write', 'develop', choreModeActive),
        'block',
        filePath
      );
      assert.equal(
        activity({ command: "printf '%s' code > " + filePath }, 'Bash', 'develop', choreModeActive),
        'block',
        filePath
      );
    }
  }
});

test('direct tools and multi-target patches share physical artifact containment', async () => {
  for (const tool_name of ['Edit', 'Write', 'NotebookEdit']) {
    const result = await runHook(
      { cwd: root, tool_name, tool_input: { file_path: 'docs/a.md', notebook_path: 'docs/a.md' } },
      { projectDir: root, loadBoundIssue: () => null, isChoreModeActive: () => false }
    );
    assert.equal(result.decision, 'allow', tool_name);
  }
  const patch =
    '*** Begin Patch\n*** Add File: docs/a.md\n+hello\n*** Add File: .scratch/a.sh\n+hello\n*** End Patch';
  assert.equal(
    (
      await runHook(
        { cwd: root, tool_name: 'apply_patch', tool_input: { patch } },
        { projectDir: root, loadBoundIssue: () => null, isChoreModeActive: () => false }
      )
    ).decision,
    'allow'
  );
  const mixed = patch.replace('.scratch/a.sh', 'scripts/a.mjs');
  assert.equal(
    (
      await runHook(
        { cwd: root, tool_name: 'apply_patch', tool_input: { patch: mixed } },
        { projectDir: root, loadBoundIssue: () => null, isChoreModeActive: () => false }
      )
    ).decision,
    'block'
  );
  for (const file_path of [
    'docs/source-link/a.md',
    'docs/../scripts/a.md',
    'docs/node_modules/ai-task-manager/scripts/guard.mjs',
  ]) {
    assert.equal(
      (
        await runHook(
          { cwd: root, tool_name: 'Write', tool_input: { file_path } },
          { projectDir: root, loadBoundIssue: () => null, isChoreModeActive: () => false }
        )
      ).decision,
      'block',
      file_path
    );
    assert.equal(activity({ file_path }, 'Write', 'backlog'), 'block', file_path);
  }
});

const writers = [
  'touch ./.scratch/gh/scratch.txt ./.tmp/aitm/state/runtime.json',
  "printf '%s' hi > '././docs/leading dot.md'",
  "tee -a 'docs/my draft.md'",
  "printf '%s' 'literal $(text)' > '" + path.join(root, 'docs', 'absolute draft.md') + "'",
  "printf '%s\\n' 'hello' > 'docs/my draft.md'",
  "echo 'hello' >> '.scratch/my script.mjs'",
  "printf '%s' 'hello' | tee '.tmp/my script.sh'",
  "cat > 'docs/my draft.md' <<'EOF'\nhello $(never execute)\nEOF",
  "mkdir -p 'docs/my directory' '.scratch/my directory'",
  "touch 'docs/my draft.md' '.tmp/my script.sh'",
];
test('complete literal writers authorize artifacts without a matching binding', () => {
  for (const command of writers) {
    for (const state of states)
      assert.notEqual(activity({ command }, 'Bash', state), 'block', command);
    assert.equal(
      evaluateBashWorktreeBinding({
        command,
        invoking: { worktreePath: root, worktreeBranch: 'local' },
        bound: {
          issueNumber: 42,
          worktreePath: path.join(root, 'foreign'),
          worktreeBranch: 'foreign',
        },
      }).block,
      false,
      command
    );
  }
});

test('mixed writes, execution and escaped targets never gain artifact permission', () => {
  for (const command of [
    "printf '%s' hi > docs/run.mjs",
    'echo hi > docs/a.md; node .scratch/run.mjs',
    'touch docs/a.md scripts/a.mjs',
    'echo hi > docs/a.md && echo hi > scripts/a.mjs',
    'node .scratch/run.mjs',
    "printf '%s' hi > docs/source-link/a.md",
    'echo hi > .scratch/../scripts/a.mjs',
    'echo hi > ./.scratch/../scripts/a.mjs',
    'echo hi > ./docs/source-link/a.md',
    'echo hi > docs/node_modules/ai-task-manager/scripts/guard.mjs',
    'echo $(node .scratch/run.mjs) > docs/a.md',
  ]) {
    if (command !== 'node .scratch/run.mjs')
      assert.equal(activity({ command }, 'Bash', 'backlog'), 'block', command);
    assert.equal(
      evaluateBashWorktreeBinding({
        command,
        invoking: { worktreePath: root, worktreeBranch: 'local' },
        bound: {
          issueNumber: 42,
          worktreePath: path.join(root, 'foreign'),
          worktreeBranch: 'foreign',
        },
      }).block,
      true,
      command
    );
  }
});
