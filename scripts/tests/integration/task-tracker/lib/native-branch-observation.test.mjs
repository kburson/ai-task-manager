// @story #2093 #2105
// cspell:words NOSYSTEM userconfig globalconfig
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { getActiveTask, setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { claimOccupancy, readOccupancy } from '../../../../task-tracker/lib/occupancy.mjs';
import { occupancyPath } from '../../../../task-tracker/paths.mjs';
import { inspectNativeBranchRenewal } from '../../../../task-tracker/lib/native-branch-renewal.mjs';

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

test('real npm lifecycle metadata preserves read-only native renewal', (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.root, '.tmp'), { recursive: true });
  const moduleUrl = new URL(
    '../../../../task-tracker/lib/native-branch-renewal.mjs',
    import.meta.url
  ).href;
  writeFileSync(
    path.join(f.root, '.tmp/probe.mjs'),
    `import {inspectNativeBranchRenewal} from ${JSON.stringify(moduleUrl)}; const options=${JSON.stringify(f.options)}; options.env=process.env; options.deps={readRemote:async()=>(${JSON.stringify(f.remote)})}; await inspectNativeBranchRenewal(options);`
  );
  writeFileSync(
    path.join(f.root, 'package.json'),
    JSON.stringify({
      name: 'native-renewal-fixture',
      version: '1.0.0',
      scripts: { probe: JSON.stringify(process.execPath) + ' .tmp/probe.mjs' },
    })
  );
  f.git('add', 'package.json');
  f.git('commit', '-q', '-m', 'fixture lifecycle');
  f.git('branch', '-f', 'native-old', 'HEAD');
  f.git('switch', '-q', 'native-old');
  f.git('switch', '-q', 'native-new');
  const result = spawnSync('npm', ['run', 'probe'], {
    cwd: f.root,
    env: f.options.env,
    encoding: 'utf8',
    timeout: 20000,
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

test('renewal refuses a shadow npx before executing it', async (t) => {
  const f = fixture(t);
  const directory = path.join(f.root, '.tmp/tools');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'npx'), '#!/bin/sh\nexit 91\n', { mode: 0o755 });
  f.options.env.PATH = directory + path.delimiter + f.options.env.PATH;
  await assert.rejects(inspectNativeBranchRenewal(f.options), /untrusted executable/);
});

for (const key of ['userconfig', 'globalconfig', 'prefix', 'call', 'package'])
  test('renewal refuses npm selector ' + key, async (t) => {
    const f = fixture(t);
    f.options.env['npm_config_' + key] = '/foreign-selection';
    await assert.rejects(inspectNativeBranchRenewal(f.options), /npm execution configuration/);
  });

test('renewal refuses npm script-shell configuration before execution', async (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.root, '.npmrc'), 'script-shell=/must-not-execute\n');
  f.git('add', '.npmrc');
  f.git('commit', '-q', '-m', 'fixture npm configuration');
  f.git('branch', '-f', 'native-old', 'HEAD');
  f.git('switch', '-q', 'native-old');
  f.git('switch', '-q', 'native-new');
  await assert.rejects(inspectNativeBranchRenewal(f.options), /npm execution configuration/);
});

test('renewal refuses Git replacement objects that disguise changed source', async (t) => {
  const f = fixture(t);
  const head = f.git('rev-parse', 'HEAD');
  writeFileSync(path.join(f.root, 'README.md'), 'replacement source\n');
  f.git('add', 'README.md');
  const tree = f.git('write-tree');
  const replacement = f.git('commit-tree', tree, '-p', head, '-m', 'replacement');
  f.git('replace', head, replacement);
  await assert.rejects(inspectNativeBranchRenewal(f.options));
});

test('same-branch Start retains supported matching identity overrides', (t) => {
  const f = fixture(t);
  f.git('switch', '-q', 'native-old');
  const env = {
    ...f.options.env,
    AI_TASK_MANAGER_SESSION_ID: f.sid,
    AI_TASK_MANAGER_PROJECT_DIR: f.root,
  };
  const moduleUrl = new URL(
    '../../../../task-tracker/lib/native-branch-renewal.mjs',
    import.meta.url
  ).href;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { enforceNativeBranchRenewalEntry } from ${JSON.stringify(moduleUrl)}; const result = await enforceNativeBranchRenewalEntry({argv:['start','2105','--role','orchestrator','--confirm-relocation'],root:process.cwd()}); if(result!==null) throw Error('unexpected renewal');`,
    ],
    { cwd: f.root, env, encoding: 'utf8', timeout: 20000 }
  );
  assert.equal(result.status, 0, result.stderr);
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
