// @story #2093 #2105
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { claimOccupancy, readOccupancy } from '../../../../task-tracker/lib/occupancy.mjs';
import { occupancyPath } from '../../../../task-tracker/paths.mjs';
import { setActiveTask, getActiveTask } from '../../../../task-tracker/session-state.mjs';

for (const scenario of ['dirty', 'unsupported-flags', 'offline'])
  test('real CLI rejects ' + scenario + ' before location or actor effects', (t) => {
    const root = realpathSync(createRuntimeRootFixture('native-start-refusal-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const git = (...args) =>
      execFileSync('git', ['-C', root, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    git('config', 'user.name', 'fixture');
    git('config', 'user.email', 'fixture@example.test');
    git('checkout', '-q', '-b', 'native-old');
    mkdirSync(path.join(root, '.ai-task-manager'), { recursive: true });
    writeFileSync(path.join(root, '.gitignore'), '.tmp/\nnode_modules/\n');
    mkdirSync(path.join(root, 'node_modules/@kburson'), { recursive: true });
    symlinkSync(
      fileURLToPath(new URL('../../../../..', import.meta.url)),
      path.join(root, 'node_modules/@kburson/ai-task-manager'),
      'dir'
    );
    writeFileSync(path.join(root, 'README.md'), 'same source\n');
    writeFileSync(
      path.join(root, '.ai-task-manager/task-tracker.json'),
      JSON.stringify({ repo: 'fixture/repository', projectId: 'PVT_fixture' })
    );
    git('add', '.gitignore', 'README.md', '.ai-task-manager/task-tracker.json');
    git('commit', '-q', '-m', 'seed');
    const sid = 'native-cli-offline-fixture';
    const claim = claimOccupancy({
      projectDir: root,
      issue: '#2105',
      provider: 'codex',
      sid,
      worktreePath: root,
    });
    const record = setActiveTask(
      sid,
      {
        issue: '#2105',
        worktreePath: root,
        worktreeBranch: 'native-old',
        entryStartTs: new Date().toISOString(),
        kanbanState: 'develop',
        bindingGenerationId: claim.row.bindingGenerationId,
      },
      root
    );
    const occupancy = readOccupancy(occupancyPath(root));
    git('switch', '-q', '-c', 'native-new');
    if (scenario === 'dirty') writeFileSync(path.join(root, 'README.md'), 'dirty\n');
    const env = { ...process.env, CODEX_THREAD_ID: sid, CODEX_SESSION_ID: sid };
    delete env.npm_command;
    delete env.npm_lifecycle_event;
    for (const key of Object.keys(env))
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
    env.AITM_BRANCH_EXTERNAL_LOG = path.join(root, '.tmp/unexpected-external');
    env.TT_SKIP_FIELD_SELF_CHECK = '1';
    if (scenario === 'offline') env.TT_SKIP_NETWORK = '1';
    const args = [
      '--experimental-test-module-mocks',
      '--import',
      new URL('../../../helpers/2105-refuse-external-gh.mjs', import.meta.url).href,
      fileURLToPath(new URL('../../../../task-tracker/task-tracker.mjs', import.meta.url)),
      'start',
      '2105',
      '--role',
      'orchestrator',
      '--confirm-relocation',
    ];
    if (scenario === 'unsupported-flags') args.push('--allow-foreign-worktree');
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 20000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /native-branch-renewal:/);
    assert.equal(
      existsSync(env.AITM_BRANCH_EXTERNAL_LOG),
      false,
      'refusal precedes any external location read/write'
    );
    assert.deepEqual(getActiveTask(sid, root), record);
    assert.deepEqual(readOccupancy(occupancyPath(root)), occupancy);
  });
