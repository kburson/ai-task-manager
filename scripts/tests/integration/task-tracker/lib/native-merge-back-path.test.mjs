// @story #2039 #2067
// cspell:words NOSYSTEM
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { claimOccupancy, releaseOccupancy } from '../../../../task-tracker/lib/occupancy.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { serializeIssueWorktreeLocationMarker } from '../../../../task-tracker/lib/issue-worktree-location.mjs';
import { buildReviewApprovedMarker } from '../../../../task-tracker/lib/markers.mjs';
import { writeLastKnownState } from '../../../../task-tracker/gh-timing-comment.mjs';
import {
  mergeBackPathCommand,
  inspectNativeMergeBackPath,
} from '../../../../task-tracker/lib/native-merge-back-path.mjs';

const entry = 'node_modules/ai-task-manager/bin/aitm.mjs';
const source = fileURLToPath(new URL('../../../../..', import.meta.url));
const ts = '2026-10-30T21:00:00.000Z';
function fixture(t) {
  const main = realpathSync(createRuntimeRootFixture('merge-path-'));
  t.after(() => rmSync(main, { recursive: true, force: true }));
  const git = (root, ...args) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
  writeFileSync(path.join(main, '.gitignore'), 'node_modules/\n.tmp/\n');
  mkdirSync(path.join(main, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(main, '.ai-task-manager/task-tracker.json'),
    JSON.stringify({ repo: 'fixture/repository', projectId: 'PVT_fixture' })
  );
  git(main, 'add', '.gitignore', '.ai-task-manager/task-tracker.json');
  git(main, 'commit', '-qm', 'fixture ignore');
  const root = path.join(main, 'parent');
  const child = path.join(main, 'child');
  git(main, 'worktree', 'add', '-qb', 'parent', root);
  git(main, 'worktree', 'add', '-qb', 'child', child);
  mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  symlinkSync(source, path.join(root, 'node_modules/ai-task-manager'), 'dir');
  const sid = 'native-merge-path-fixture';
  const claim = claimOccupancy({
    issue: 107,
    provider: 'codex',
    sid,
    worktreePath: root,
    projectDir: root,
  });
  const active = {
    issue: '#107',
    worktreePath: root,
    worktreeBranch: 'parent',
    kanbanState: 'develop',
    entryStartTs: ts,
    bindingGenerationId: claim.row.bindingGenerationId,
  };
  setActiveTask(sid, active, root);
  const location = (worktreePath, worktreeBranch) =>
    serializeIssueWorktreeLocationMarker({
      worktreePath,
      worktreeBranch,
      sessionId: sid,
      ts,
    });
  const head = git(child, 'rev-parse', 'HEAD');
  const remote = {
    login: 'owner',
    parent: {
      number: 107,
      state: 'OPEN',
      boardState: 'develop',
      assignees: ['owner'],
      body: writeLastKnownState(location(root, 'parent'), 'develop'),
    },
    child: {
      number: 140,
      parent: 107,
      state: 'OPEN',
      boardState: 'review',
      assignees: ['owner'],
      body: writeLastKnownState(
        location(child, 'child') + '\n' + buildReviewApprovedMarker(ts, { approvedSha: head }),
        'review'
      ),
    },
  };
  const command = `${entry} merge-back 140 ${child} --preserve-worktree`;
  const options = {
    request: mergeBackPathCommand(command),
    root,
    sessionId: sid,
    cfg: { repo: 'fixture/repository', projectId: 'PVT_fixture' },
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      CODEX_THREAD_ID: sid,
      CODEX_SESSION_ID: sid,
      GIT_CONFIG_NOSYSTEM: '1',
    },
    deps: { readRemote: async () => structuredClone(remote) },
  };
  return { main, root, child, sid, git, active, remote, options, location, head };
}

test('only a closed public CLI command requests one external child path', () => {
  const suffix = ' merge-back 140 /owned/child --preserve-worktree';
  for (const prefix of [entry, 'node_modules/@kburson/ai-task-manager/bin/aitm.mjs'])
    assert.deepEqual(mergeBackPathCommand(prefix + suffix), {
      entry: prefix,
      child: 140,
      childPath: '/owned/child',
    });
  for (const command of [
    'npx aitm' + suffix,
    entry + suffix + '\n',
    entry + suffix + ' --force',
    entry + suffix + ' && touch /foreign',
    entry + suffix.replace('/owned/child', '../child'),
    entry + suffix.replace('140', '0140'),
    entry + suffix.replace(' --preserve-worktree', ''),
  ])
    assert.equal(mergeBackPathCommand(command), null, command);
});

test('real linked checkouts admit only their recorded approved child operand', async (t) => {
  const f = fixture(t);
  assert.equal(await inspectNativeMergeBackPath(f.options), f.child);
  assert.equal(f.git(f.root, 'rev-parse', 'HEAD'), f.head);
  assert.equal(f.git(f.child, 'rev-parse', 'HEAD'), f.head);
});

const refusals = {
  'foreign native identity': (f) => {
    f.options.env.CODEX_THREAD_ID = 'another';
  },
  'offline environment': (f) => {
    f.options.env.TT_SKIP_NETWORK = '1';
  },
  'injected Node options': (f) => {
    f.options.env.NODE_OPTIONS = '--import /foreign';
  },
  'paused parent': (f) => {
    setActiveTask(f.sid, { ...f.active, pausedAtTs: ts }, f.root);
  },
  'missing binding generation': (f) => {
    setActiveTask(f.sid, { ...f.active, bindingGenerationId: null }, f.root);
  },
  'foreign occupancy': (f) => {
    releaseOccupancy({ issue: 107, sid: f.sid, projectDir: f.root });
    claimOccupancy({
      issue: 107,
      sid: 'another-owner',
      provider: 'codex',
      projectDir: f.root,
      worktreePath: f.root,
    });
  },
  'unqualified public entry': (f) => {
    rmSync(path.join(f.root, 'node_modules/ai-task-manager'));
    mkdirSync(path.join(f.root, 'node_modules/ai-task-manager/bin'), { recursive: true });
    writeFileSync(path.join(f.root, entry), '#!/usr/bin/env node\n');
  },
  'detached child': (f) => {
    f.git(f.child, 'checkout', '--detach', '-q');
  },
  'missing project identity': (f) => {
    f.options.cfg.projectId = null;
  },
  'wrong parent branch': (f) => {
    setActiveTask(f.sid, { ...f.active, worktreeBranch: 'other' }, f.root);
  },
  'foreign native edge': (f) => {
    f.remote.child.parent = 108;
  },
  'closed parent': (f) => {
    f.remote.parent.state = 'CLOSED';
  },
  'closed child': (f) => {
    f.remote.child.state = 'CLOSED';
  },
  'child outside Review': (f) => {
    f.remote.child.boardState = 'develop';
  },
  'parent board drift': (f) => {
    f.remote.parent.boardState = 'review';
  },
  'foreign owner': (f) => {
    f.remote.child.assignees = ['another'];
  },
  'multiple owners': (f) => {
    f.remote.parent.assignees.push('another');
  },
  'unreadable owner': (f) => {
    f.remote.login = '';
  },
  'missing location': (f) => {
    f.remote.child.body = writeLastKnownState('', 'review');
  },
  'wrong recorded child path': (f) => {
    f.remote.child.body = f.remote.child.body.replace(f.child, f.root);
  },
  'wrong recorded child branch': (f) => {
    f.remote.child.body = f.remote.child.body.replace('branch="child"', 'branch="other"');
  },
  'stale source approval': (f) => {
    f.remote.child.body = f.remote.child.body.replace(f.head, 'a'.repeat(40));
  },
  'legacy approval without exact source': (f) => {
    f.remote.child.body = writeLastKnownState(
      f.location(f.child, 'child') + '\n' + buildReviewApprovedMarker(ts),
      'review'
    );
  },
  'parent supplied as child': (f) => {
    f.options.request.childPath = f.root;
  },
  'aliased child path': (f) => {
    const alias = path.join(f.main, 'alias');
    symlinkSync(f.child, alias);
    f.options.request.childPath = alias;
  },
  'remote observation unavailable': (f) => {
    f.options.deps.readRemote = async () => {
      throw new Error('unavailable');
    };
  },
  'parent changes during observation': (f) => {
    f.options.deps.readRemote = async () => {
      f.git(f.root, 'commit', '--allow-empty', '-qm', 'race');
      return structuredClone(f.remote);
    };
  },
  'child changes during observation': (f) => {
    f.options.deps.readRemote = async () => {
      f.git(f.child, 'commit', '--allow-empty', '-qm', 'race');
      return structuredClone(f.remote);
    };
  },
  'parent binding changes during observation': (f) => {
    f.options.deps.readRemote = async () => {
      setActiveTask(f.sid, { ...f.active, entryStartTs: '2026-10-30T21:01:00.000Z' }, f.root);
      return structuredClone(f.remote);
    };
  },
};
for (const [name, arrange] of Object.entries(refusals))
  test('native path admission refuses ' + name, async (t) => {
    const f = fixture(t);
    arrange(f);
    await assert.rejects(() => inspectNativeMergeBackPath(f.options), /native-merge-back-path/);
  });

test('a canonical physical checkout from another Git repository is refused', async (t) => {
  const f = fixture(t);
  const other = realpathSync(createRuntimeRootFixture('merge-other-'));
  t.after(() => rmSync(other, { recursive: true, force: true }));
  const otherChild = path.join(other, 'checkout');
  f.git(other, 'worktree', 'add', '-qb', 'child', otherChild);
  f.options.request.childPath = otherChild;
  f.remote.child.body = f.remote.child.body.replace(f.child, otherChild);
  await assert.rejects(() => inspectNativeMergeBackPath(f.options), /native-merge-back-path/);
});

test('real Bash hook grants only the verified operand and retains other path boundaries', (t) => {
  const f = fixture(t);
  const temporary = path.join(f.root, '.tmp');
  mkdirSync(temporary, { recursive: true });
  const snapshot = path.join(temporary, 'remote.json');
  writeFileSync(snapshot, JSON.stringify(f.remote));
  const preload = path.join(temporary, 'provider-fixture.mjs');
  const url = (relative) =>
    JSON.stringify(new URL('../../../../' + relative, import.meta.url).href);
  writeFileSync(
    preload,
    `
    import { mock } from 'node:test';
    import { readFileSync } from 'node:fs';
    import * as client from ${url('gh/lib/gh-client.mjs')};
    import * as assignment from ${url('task-tracker/lib/assignment-snapshot.mjs')};
    import * as parent from ${url('task-tracker/lib/fetch-parent-issue.mjs')};
    const read = () => JSON.parse(readFileSync(${JSON.stringify(snapshot)}, 'utf8'));
    const issue = number => number === 107 ? read().parent : read().child;
    mock.module(${url('gh/lib/gh-client.mjs')}, { namedExports: {
      ...client, pexec: async (command, args) => {
        if (command !== 'gh') throw new Error('unexpected fixture transport');
        if (args[0] === 'api' && args[1] === 'user') return { stdout: read().login };
        if (args[0] === 'issue' && args[1] === 'view') return { stdout: JSON.stringify(issue(Number(args[2]))) };
        throw new Error('unexpected fixture GitHub request');
      }
    }});
    mock.module(${url('task-tracker/lib/assignment-snapshot.mjs')}, { namedExports: {
      ...assignment, fetchAssignmentSnapshot: async ({ issueNumber }) => ({
        state: issue(issueNumber).boardState, assignees: issue(issueNumber).assignees
      })
    }});
    mock.module(${url('task-tracker/lib/fetch-parent-issue.mjs')}, { namedExports: {
      ...parent, fetchParentIssueStrict: async () => read().child.parent
    }});
  `
  );
  const run = (command) => {
    // Policy inputs only: the merge command is never executed by this fixture.
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-test-module-mocks',
        '--import',
        preload,
        path.join(source, 'scripts/task-tracker/bash-guard.mjs'),
      ],
      {
        cwd: f.root,
        env: f.options.env,
        input: JSON.stringify({
          cwd: f.root,
          session_id: f.sid,
          tool_name: 'Bash',
          tool_input: { command },
        }),
        encoding: 'utf8',
        timeout: 20000,
      }
    );
    assert.equal(result.error, undefined, result.stderr);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const command = `${entry} merge-back 140 ${f.child} --preserve-worktree`;
  assert.equal(run(command), '');
  for (const rejected of [
    `cat ${f.child}/tracked.txt`,
    command + ' /another/private',
    command + '; cat /another/private',
    command + ' > /another/private',
    command.replace(entry, 'npx aitm'),
  ])
    assert.equal(JSON.parse(run(rejected)).decision, 'block', rejected);
  f.remote.child.parent = 108;
  writeFileSync(snapshot, JSON.stringify(f.remote));
  assert.equal(JSON.parse(run(command)).decision, 'block');
});
