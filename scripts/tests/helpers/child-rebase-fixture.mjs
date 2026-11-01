// @story #2068
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempProjectIsolated } from '../../task-tracker/lib/scratch-dir.mjs';
import { claimOccupancy, readOccupancy } from '../../task-tracker/lib/occupancy.mjs';
import { occupancyPath } from '../../task-tracker/paths.mjs';
import { getActiveTask, setActiveTask } from '../../task-tracker/session-state.mjs';
import { appendIssueWorktreeLocation } from '../../task-tracker/lib/issue-worktree-location.mjs';
import { runMergeBackCommand } from '../../task-tracker/merge-back.mjs';

export const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

// Real independent repositories keep fixture mutations away from live issue state.
export function childRebaseFixture(
  t,
  {
    bindTarget = false,
    staged = false,
    historicalProtected = false,
    second = false,
    nativeLayout = false,
    protectedDelta,
  } = {}
) {
  const main = mkdtempProjectIsolated('child-rebase-');
  t.after(() => rmSync(main, { recursive: true, force: true }));
  const target = path.join(main, '.ai-task-manager/runtime/test-fixtures/previous-child');
  const repair = path.join(main, '.ai-task-manager/runtime/test-fixtures/current-repair');
  const branch = 'codex/2068-original-child';
  const repairBranch = 'codex/2068-native-child-recovery';
  const epicBranch = 'codex/custom-2039-delivery';
  const sid = 'native-child-recovery-fixture';
  const commit = (root, message) => {
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', message);
  };
  git(main, 'config', 'user.name', 'fixture');
  git(main, 'config', 'user.email', 'fixture@example.invalid');
  writeFileSync(
    path.join(main, '.gitignore'),
    '.tmp/\n' +
      (nativeLayout ? '.scratch/*\n!.scratch/README.md\n' : '.scratch/\n') +
      'node_modules/\n.ai-task-manager/runtime/\n.superpowers/\n'
  );
  if (nativeLayout) {
    mkdirSync(path.join(main, '.scratch'));
    writeFileSync(path.join(main, '.scratch/README.md'), 'tracked scratch contract\n');
  }
  mkdirSync(path.join(main, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(main, '.ai-task-manager/task-tracker.json'),
    JSON.stringify({ repo: 'fixture/project' })
  );
  writeFileSync(path.join(main, 'conflict.txt'), 'base\n');
  writeFileSync(path.join(main, 'second.txt'), 'base second\n');
  commit(main, 'base');
  const base = git(main, 'rev-parse', 'HEAD');
  git(main, 'worktree', 'add', '-b', branch, target, base);
  writeFileSync(path.join(target, 'conflict.txt'), 'accepted child\n');
  if (protectedDelta === 'change')
    writeFileSync(path.join(target, '.scratch/README.md'), 'changed contract\n');
  if (protectedDelta === 'remove') rmSync(path.join(target, '.scratch/README.md'));
  if (protectedDelta === 'mode') chmodSync(path.join(target, '.scratch/README.md'), 0o755);
  if (protectedDelta === 'add') {
    writeFileSync(path.join(target, '.scratch/new-tracked.md'), 'new tracked contract\n');
    git(target, 'add', '-f', '.scratch/new-tracked.md');
  }
  if (staged) writeFileSync(path.join(target, 'valuable.txt'), 'unique child contribution\n');
  commit(target, 'child change');
  if (second) {
    writeFileSync(path.join(target, 'second.txt'), 'child second\n');
    commit(target, 'second child change');
  }
  if (historicalProtected) {
    writeFileSync(path.join(target, '.ScRaTcH'), 'historical prefix collision\n');
    git(target, 'add', '--force', '.ScRaTcH');
    git(target, 'commit', '-qm', 'historical protected prefix');
    rmSync(path.join(target, '.ScRaTcH'));
    commit(target, 'remove historical prefix');
  }
  const original = git(target, 'rev-parse', 'HEAD');
  writeFileSync(path.join(main, 'conflict.txt'), 'accepted epic\n');
  if (second) writeFileSync(path.join(main, 'second.txt'), 'epic second\n');
  commit(main, 'new epic');
  git(main, 'branch', epicBranch, 'HEAD');
  const onto = git(main, 'rev-parse', epicBranch);
  git(main, 'worktree', 'add', '-b', repairBranch, repair, onto);
  assert.throws(() => git(target, 'rebase', '--onto', epicBranch, base, branch));
  assert.equal(git(target, 'branch', '--show-current'), '');
  const sentinels = new Map([
    ['node_modules/retained-package/data.txt', 'dependency bytes\n'],
    ['.scratch/prior-review/report.md', 'original review evidence\n'],
    ['.tmp/aitm/retained-state.json', '{"historical":"Unknown"}\n'],
  ]);
  if (nativeLayout) {
    sentinels.set('.ai-task-manager/runtime/retained-fixture.json', '{"evidence":"keep"}\n');
    sentinels.set('.superpowers/retained-notes.md', 'retain design evidence\n');
  }
  for (const [file, bytes] of sentinels) {
    mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    writeFileSync(path.join(target, file), bytes);
  }
  const executor = bindTarget ? target : repair;
  const executorBranch = bindTarget ? branch : repairBranch;
  const claim = claimOccupancy({
    projectDir: executor,
    issue: 2068,
    sid,
    provider: 'codex',
    worktreePath: executor,
  });
  const record = setActiveTask(
    sid,
    {
      issue: '#2068',
      kanbanState: 'develop',
      entryStartTs: new Date().toISOString(),
      worktreePath: executor,
      worktreeBranch: executorBranch,
      bindingGenerationId: claim.row.bindingGenerationId,
    },
    executor
  );
  let body = appendIssueWorktreeLocation('', {
    worktreePath: target,
    worktreeBranch: branch,
    sessionId: sid,
    ts: '2026-10-31T10:00:00.000Z',
  });
  if (!bindTarget)
    body = appendIssueWorktreeLocation(body, {
      worktreePath: repair,
      worktreeBranch: repairBranch,
      sessionId: sid,
      ts: '2026-11-01T10:00:00.000Z',
    });
  const nodes = {
    2068: {
      parent: 2039,
      children: [],
      authoritativeBranch: executorBranch,
      authoritativeWorktree: executor,
      parentAuthoritativeBranch: epicBranch,
    },
    2039: { parent: null, children: [2068], authoritativeBranch: epicBranch },
  };
  const deps = {
    invokingDir: executor,
    recoverySession: () => sid,
    loadConfig: () => ({ repo: 'fixture/project' }),
    loadGraph: async () => (issue) => nodes[issue],
    // Only remote issue transport is injected; history parsing/admission stays real.
    loadIssueBody: async ({ issue }) => {
      assert.equal(issue, 2068);
      return body;
    },
  };
  mkdirSync(path.join(executor, '.scratch'), { recursive: true, mode: 0o700 });
  const run = (request) => {
    writeFileSync(
      path.join(executor, '.scratch/child-recovery.json'),
      JSON.stringify({ schema: 'aitm.merge-back-child-recovery/v1', ...request })
    );
    return runMergeBackCommand(
      ['2068', executor, '--recover-child', '.scratch/child-recovery.json'],
      deps
    );
  };
  const inspect = () => run({ action: 'inspect' });
  const state = () => [
    git(target, 'rev-parse', 'HEAD'),
    git(main, 'rev-parse', branch),
    git(repair, 'rev-parse', 'HEAD'),
    git(main, 'rev-parse', epicBranch),
    readFileSync(git(target, 'rev-parse', '--path-format=absolute', '--git-path', 'index')),
    readFileSync(
      git(
        target,
        'rev-parse',
        '--path-format=absolute',
        '--git-path',
        'rebase-merge/git-rebase-todo'
      )
    ),
    readFileSync(path.join(target, 'conflict.txt')),
    getActiveTask(sid, executor),
    readOccupancy(occupancyPath(main)),
  ];
  const retained = () => {
    for (const [file, bytes] of sentinels)
      assert.equal(readFileSync(path.join(target, file), 'utf8'), bytes);
    assert.deepEqual(getActiveTask(sid, executor), record);
  };
  const sourceRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const installFixtureCarrier = () => {
    mkdirSync(path.join(executor, 'node_modules/@kburson'), { recursive: true });
    symlinkSync(sourceRoot, path.join(executor, 'node_modules/@kburson/ai-task-manager'), 'dir');
  };
  return {
    main,
    target,
    repair,
    executor,
    branch,
    repairBranch,
    epicBranch,
    original,
    onto,
    sid,
    record,
    nodes,
    deps,
    run,
    inspect,
    state,
    retained,
    installFixtureCarrier,
    sourceRoot,
    setBody: (value) => {
      body = value;
    },
    getBody: () => body,
  };
}
