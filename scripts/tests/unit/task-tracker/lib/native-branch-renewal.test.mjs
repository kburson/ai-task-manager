// @story #2093 #2105
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { getActiveTask, setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { claimOccupancy, readOccupancy } from '../../../../task-tracker/lib/occupancy.mjs';
import { occupancyPath } from '../../../../task-tracker/paths.mjs';
import {
  branchRenewalArgv,
  branchRenewalCommand,
  inspectNativeBranchRenewal,
} from '../../../../task-tracker/lib/native-branch-renewal.mjs';

function fixture(t) {
  const root = realpathSync(createRuntimeRootFixture('native-branch-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('config', 'user.name', 'fixture');
  git('config', 'user.email', 'fixture@example.test');
  git('checkout', '-q', '-b', 'native-old');
  writeFileSync(path.join(root, 'README.md'), 'same source\n');
  writeFileSync(path.join(root, '.gitignore'), '.tmp/\n');
  git('add', 'README.md', '.gitignore');
  git('commit', '-q', '-m', 'seed');
  const sid = 'native-branch-unit-fixture';
  const claim = claimOccupancy({
    projectDir: root,
    issue: '#2105',
    sid,
    provider: 'codex',
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
  const env = { ...process.env, CODEX_THREAD_ID: sid, CODEX_SESSION_ID: sid };
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
  const remote = {
    snapshot: { state: 'develop', assignees: ['fixture-owner'] },
    currentUser: 'fixture-owner',
    issue: {
      state: 'OPEN',
      body:
        '<!-- aitm-last-known-state state="develop" ts="2026-10-01T00:00:00Z" -->\n<!-- aitm-worktree-location worktree="' +
        root +
        '" branch="native-old" sid="' +
        sid +
        '" ts="2026-10-01T00:00:00Z" -->\n',
    },
  };
  git('switch', '-q', '-c', 'native-new');
  const options = {
    request: { issueNumber: 2105, role: 'orchestrator' },
    root,
    sessionId: sid,
    env,
    cfg: { repo: 'fixture/repo' },
    deps: { readRemote: async () => remote },
  };
  return { root, git, sid, record, remote, options };
}

test('only exact native Start transports request renewal', () => {
  assert.equal(
    branchRenewalArgv(['start', '2105\n', '--role', 'agent', '--confirm-relocation']),
    null
  );
  for (const prefix of ['npx aitm', 'node_modules/@kburson/ai-task-manager/bin/aitm.mjs'])
    assert.deepEqual(
      branchRenewalCommand(prefix + ' start 2105 --role orchestrator --confirm-relocation'),
      { issueNumber: 2105, role: 'orchestrator' }
    );
  for (const command of [
    'npx aitm start 2105',
    'npx aitm resume 2105 --role agent --confirm-relocation',
    'npx aitm start 2106 --role solo --confirm-relocation',
    'npx aitm start 02105 --role agent --confirm-relocation',
    'env npx aitm start 2105 --role agent --confirm-relocation',
    'npx aitm start 2105 --role agent --confirm-relocation\n',
    'npx aitm start 2105 --role agent --confirm-relocation && touch other',
    'npx aitm start 2105 --role agent --confirm-relocation --allow-foreign-worktree',
  ])
    assert.equal(branchRenewalCommand(command), null, command);
  assert.equal(
    branchRenewalArgv([
      'start',
      '2105',
      '--role',
      'agent',
      '--confirm-relocation',
      '--role',
      'orchestrator',
    ]),
    null
  );
});

test('clean real checkout admits only a read-only observation and preserves actor/generation', async (t) => {
  const f = fixture(t),
    before = readOccupancy(occupancyPath(f.root));
  const result = await inspectNativeBranchRenewal(f.options);
  assert.equal(result.head, f.git('rev-parse', 'HEAD'));
  assert.equal(result.oldBranch, 'native-old');
  assert.equal(result.newBranch, 'native-new');
  assert.deepEqual(getActiveTask(f.sid, f.root), f.record);
  assert.deepEqual(readOccupancy(occupancyPath(f.root)), before);
});

for (const [name, change] of [
  ['tracked bytes', (f) => writeFileSync(path.join(f.root, 'README.md'), 'changed\n')],
  ['untracked file', (f) => writeFileSync(path.join(f.root, 'untracked'), 'new\n')],
  [
    'index',
    (f) => {
      writeFileSync(path.join(f.root, 'README.md'), 'changed\n');
      f.git('add', 'README.md');
    },
  ],
  [
    'symlink source',
    (f) => {
      rmSync(path.join(f.root, 'README.md'));
      symlinkSync('/must-not-read', path.join(f.root, 'README.md'));
    },
  ],
  [
    'changed source commit',
    (f) => {
      f.git('commit', '--allow-empty', '-q', '-m', 'different');
    },
  ],
  [
    'both refs advanced after checkout',
    (f) => {
      f.git('commit', '--allow-empty', '-q', '-m', 'different');
      f.git('branch', '-f', 'native-old', 'HEAD');
    },
  ],
])
  test('renewal refuses changed ' + name, async (t) => {
    const f = fixture(t);
    change(f);
    await assert.rejects(inspectNativeBranchRenewal(f.options));
  });

for (const [name, change] of [
  [
    'foreign owner',
    (f) => {
      f.remote.currentUser = 'someone-else';
    },
  ],
  [
    'unassigned',
    (f) => {
      f.remote.snapshot.assignees = [];
    },
  ],
  [
    'multiple owners',
    (f) => {
      f.remote.snapshot.assignees = ['fixture-owner', 'other'];
    },
  ],
  [
    'live state',
    (f) => {
      f.remote.snapshot.state = 'review';
    },
  ],
  [
    'closed issue',
    (f) => {
      f.remote.issue.state = 'CLOSED';
    },
  ],
  [
    'body state',
    (f) => {
      f.remote.issue.body = f.remote.issue.body.replace('state="develop"', 'state="plan"');
    },
  ],
  [
    'durable SID',
    (f) => {
      f.remote.issue.body = f.remote.issue.body.replace('sid="' + f.sid + '"', 'sid="other"');
    },
  ],
  [
    'durable branch',
    (f) => {
      f.remote.issue.body = f.remote.issue.body.replace('branch="native-old"', 'branch="wrong"');
    },
  ],
  [
    'durable root',
    (f) => {
      f.remote.issue.body = f.remote.issue.body.replace(
        'worktree="' + f.root + '"',
        'worktree="/foreign"'
      );
    },
  ],
  [
    'ambiguous durable location',
    (f) => {
      f.remote.issue.body +=
        f.remote.issue.body.split('\n')[1].replace('branch="native-old"', 'branch="other"') + '\n';
    },
  ],
])
  test('renewal refuses ' + name + ' before any bind effect', async (t) => {
    const f = fixture(t);
    change(f);
    await assert.rejects(inspectNativeBranchRenewal(f.options));
    assert.deepEqual(getActiveTask(f.sid, f.root), f.record);
  });

for (const [name, change] of [
  [
    'identity override',
    (f) => {
      f.options.env.AI_TASK_MANAGER_SESSION_ID = f.sid;
    },
  ],
  [
    'root override',
    (f) => {
      f.options.env.TASK_TRACKER_PROJECT_DIR = f.root;
    },
  ],
  [
    'conflicting native SID',
    (f) => {
      f.options.env.CODEX_SESSION_ID = 'other';
    },
  ],
  [
    'Git selector',
    (f) => {
      f.options.env.GIT_INDEX_FILE = '/other';
    },
  ],
  [
    'system-config suppression',
    (f) => {
      f.options.env.GIT_CONFIG_NOSYSTEM = '1';
    },
  ],
  [
    'offline flag',
    (f) => {
      f.options.env.TT_SKIP_NETWORK = '1';
    },
  ],
  [
    'recorded context',
    (f) => {
      f.options.env.AITM_EVIDENCE_CONTEXT = '/other';
    },
  ],
  [
    'Node execution injection',
    (f) => {
      f.options.env.NODE_OPTIONS = '--import /other';
    },
  ],
  [
    'npm execution injection',
    (f) => {
      f.options.env.npm_config_script_shell = '/other';
    },
  ],
  [
    'other issue',
    (f) => {
      f.options.request.issueNumber = 2106;
    },
  ],
  [
    'provider override',
    (f) => {
      f.options.env.AI_TASK_MANAGER_APP_NAME = 'claude';
    },
  ],
  [
    'paused actor',
    (f) => {
      setActiveTask(f.sid, { ...f.record, entryStartTs: null }, f.root);
    },
  ],
  [
    'different binding generation',
    (f) => {
      setActiveTask(f.sid, { ...f.record, bindingGenerationId: 'other' }, f.root);
    },
  ],
  [
    'post-Test state',
    (f) => {
      setActiveTask(f.sid, { ...f.record, kanbanState: 'test' }, f.root);
    },
  ],
])
  test('renewal refuses ' + name, async (t) => {
    const f = fixture(t);
    change(f);
    await assert.rejects(inspectNativeBranchRenewal(f.options));
  });

test('ordinary npx metadata does not become a bootstrap request', async (t) => {
  const f = fixture(t);
  f.options.env.npm_config_user_agent = 'npm/12 node/v26';
  assert.equal((await inspectNativeBranchRenewal(f.options)).head, f.git('rev-parse', 'HEAD'));
});

test('remote unavailability grants no admission', async (t) => {
  const f = fixture(t);
  f.options.deps.readRemote = async () => {
    throw Error('unavailable');
  };
  await assert.rejects(inspectNativeBranchRenewal(f.options), /unavailable/);
  assert.deepEqual(getActiveTask(f.sid, f.root), f.record);
});

test('a source change during the remote read invalidates admission', async (t) => {
  const f = fixture(t);
  f.options.deps.readRemote = async () => {
    writeFileSync(path.join(f.root, 'README.md'), 'raced\n');
    return f.remote;
  };
  await assert.rejects(inspectNativeBranchRenewal(f.options), /dirty source/);
});

test('inspection does not execute configured clean filters', async (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.root, '.gitattributes'), 'README.md filter=witness\n');
  f.git('add', '.gitattributes');
  f.git('commit', '-q', '-m', 'attributes');
  f.git('branch', '-f', 'native-old', 'HEAD');
  f.git('config', 'filter.witness.clean', 'touch .tmp/filter-fired; cat');
  f.git('switch', '-q', 'native-old');
  f.git('switch', '-q', 'native-new');
  mkdirSync(path.join(f.root, '.tmp'), { recursive: true });
  rmSync(path.join(f.root, '.tmp/filter-fired'), { force: true });
  await inspectNativeBranchRenewal(f.options);
  assert.throws(() => readFileSync(path.join(f.root, '.tmp/filter-fired')), /ENOENT/);
});
