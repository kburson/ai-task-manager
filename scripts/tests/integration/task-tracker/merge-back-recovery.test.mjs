// @story #2068
// cspell:words fsmonitor
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';
import { claimOccupancy } from '../../../task-tracker/lib/occupancy.mjs';
import { occupancyPath } from '../../../task-tracker/paths.mjs';
import { getActiveTask, setActiveTask } from '../../../task-tracker/session-state.mjs';
import { runMergeBackCommand } from '../../../task-tracker/merge-back.mjs';

const schema = 'aitm.merge-back-recovery/v1';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
function fixture(t, { staged = false, second = false, twoConflicts = false } = {}) {
  const main = mkdtempProjectIsolated('merge-back-recovery-');
  t.after(() => rmSync(main, { recursive: true, force: true }));
  const branch = 'codex/custom-2039',
    childBranch = 'codex/2068-draft';
  const commit = (root, message) => {
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', message);
  };
  git(main, 'config', 'user.name', 'fixture');
  git(main, 'config', 'user.email', 'fixture@example.invalid');
  writeFileSync(
    path.join(main, '.gitignore'),
    '.tmp/\n.scratch/\n.ai-task-manager/runtime/\nignored.txt\n'
  );
  for (const name of ['one', 'two']) writeFileSync(path.join(main, name), 'base\n');
  if (twoConflicts) writeFileSync(path.join(main, '.gitattributes'), 'two filter=fixture\n');
  mkdirSync(path.join(main, '.ai-task-manager'), { recursive: true });
  writeFileSync(path.join(main, '.ai-task-manager/task-tracker.json'), '{}');
  commit(main, 'base');
  const base = git(main, 'rev-parse', 'HEAD');
  const parent = path.join(main, '.tmp/aitm/integration/2039-fixture/checkout');
  const child = path.join(main, '.ai-task-manager/runtime/test-fixtures/recovery-child');
  git(main, 'worktree', 'add', '-b', branch, parent, base);
  writeFileSync(path.join(parent, 'one'), 'parent\n');
  if (twoConflicts) writeFileSync(path.join(parent, 'two'), 'parent two\n');
  if (staged) writeFileSync(path.join(parent, 'valuable'), 'keep this change\n');
  commit(parent, 'first replay');
  if (second) {
    writeFileSync(path.join(parent, 'two'), 'parent two\n');
    commit(parent, 'second replay');
  }
  git(main, 'worktree', 'add', '-b', childBranch, child, 'refs/heads/' + branch);
  writeFileSync(path.join(main, 'one'), 'trunk\n');
  writeFileSync(path.join(main, 'two'), 'trunk two\n');
  commit(main, 'new trunk');
  assert.throws(() => git(parent, 'rebase', 'trunk'));
  const sid = 'recovery-test-owner';
  const claim = claimOccupancy({
    projectDir: child,
    issue: 2068,
    sid,
    provider: 'codex',
    worktreePath: child,
  });
  const record = setActiveTask(
    sid,
    {
      issue: '#2068',
      kanbanState: 'develop',
      entryStartTs: new Date().toISOString(),
      worktreePath: child,
      worktreeBranch: childBranch,
      bindingGenerationId: claim.row.bindingGenerationId,
    },
    child
  );
  const nodes = {
    2068: {
      parent: 2039,
      children: [],
      authoritativeBranch: childBranch,
      authoritativeWorktree: child,
      parentAuthoritativeBranch: branch,
    },
    2039: { parent: null, children: [2068], authoritativeBranch: branch },
  };
  const deps = {
    loadConfig: () => ({ repo: 'fixture/project' }),
    loadGraph: async () => (n) => nodes[n],
    invokingDir: child,
    recoverySession: () => sid,
  };
  const file = '.scratch/recovery.json';
  mkdirSync(path.join(child, '.scratch'), { recursive: true });
  const run = (request) => {
    writeFileSync(path.join(child, file), JSON.stringify({ schema, ...request }));
    return runMergeBackCommand(['2068', child, '--recover-parent', file], deps);
  };
  const inspect = () => run({ action: 'inspect' });
  const unchanged = () => assert.deepEqual(getActiveTask(sid, child), record);
  return { main, parent, child, branch, nodes, deps, run, inspect, unchanged, file };
}

test('reviewed duplicate skip finishes only the parent and leaves the fixture child binding intact', async (t) => {
  const f = fixture(t);
  const before = git(f.child, 'rev-parse', 'HEAD');
  const inspection = await f.inspect();
  assert.equal(inspection.status, 'paused');
  assert.equal(inspection.conflicts[0].path, 'one');
  const result = await f.run({
    action: 'skip',
    expected: inspection.snapshot,
    resolutions: [{ path: 'one', stage: 2 }],
    reason: 'duplicate already on trunk',
  });
  assert.equal(result.status, 'completed');
  assert.equal(git(f.parent, 'branch', '--show-current'), f.branch);
  assert.equal(git(f.child, 'rev-parse', 'HEAD'), before);
  f.unchanged();
});

test('custom conflict resolution continues to another conflict, then incoming stage finishes recovery', async (t) => {
  const f = fixture(t, { second: true });
  const first = await f.inspect();
  const bytes = Buffer.from('combined parent and trunk\n');
  const next = await f.run({
    action: 'continue',
    expected: first.snapshot,
    resolutions: [{ path: 'one', base64: bytes.toString('base64'), sha256: sha(bytes) }],
    reason: 'combine both sides',
  });
  assert.equal(next.status, 'paused');
  assert.notEqual(next.snapshot, first.snapshot);
  assert.deepEqual(
    next.conflicts.map((row) => row.path),
    ['two']
  );
  const final = await f.run({
    action: 'continue',
    expected: next.snapshot,
    resolutions: [{ path: 'two', stage: 3 }],
    reason: 'retain replayed change',
  });
  assert.equal(final.status, 'completed');
  assert.equal(readFileSync(path.join(f.parent, 'one'), 'utf8'), bytes.toString());
  assert.equal(readFileSync(path.join(f.parent, 'two'), 'utf8'), 'parent two\n');
  f.unchanged();
});

test('skip refuses a distinct cleanly staged change before touching conflict index or files', async (t) => {
  const f = fixture(t, { staged: true });
  const state = await f.inspect();
  const before = git(f.parent, 'ls-files', '--stage');
  const file = readFileSync(path.join(f.parent, 'one'));
  await assert.rejects(
    f.run({
      action: 'skip',
      expected: state.snapshot,
      resolutions: [{ path: 'one', stage: 2 }],
      reason: 'invalid duplicate claim',
    }),
    /empty|duplicate/
  );
  assert.equal(git(f.parent, 'ls-files', '--stage'), before);
  assert.deepEqual(readFileSync(path.join(f.parent, 'one')), file);
});

function refusalState(f) {
  const file = (name) =>
    readFileSync(git(f.parent, 'rev-parse', '--path-format=absolute', '--git-path', name));
  return [
    git(f.child, 'rev-parse', 'HEAD'),
    git(f.parent, 'rev-parse', 'HEAD'),
    git(f.main, 'rev-parse', f.branch),
    file('index'),
    file('rebase-merge/git-rebase-todo'),
    file('rebase-merge/done'),
    readFileSync(path.join(f.parent, 'one')),
  ];
}
for (const situation of [
  'wrong repository',
  'wrong ref',
  'stopped sha',
  'changed file',
  'changed index',
  'child head',
  'parent holder',
  'ignored',
  'untracked',
  'todo exec',
  'other Git operation',
  'generation',
  'bad custom bytes',
  'unrelated path',
]) {
  test('refusal preserves parent and child for ' + situation, async (t) => {
    const f = fixture(t);
    let state = await f.inspect();
    const marker = (name) =>
      git(f.parent, 'rev-parse', '--path-format=absolute', '--git-path', name);
    let resolutions = [{ path: 'one', stage: 2 }];
    if (situation === 'wrong repository') f.deps.loadConfig = () => ({ repo: 'other/project' });
    if (situation === 'wrong ref') f.nodes[2039].authoritativeBranch = 'codex/wrong-branch';
    if (situation === 'stopped sha')
      writeFileSync(marker('rebase-merge/stopped-sha'), state.parentHead + '\n');
    if (situation === 'changed file')
      writeFileSync(path.join(f.parent, 'one'), 'concurrent manual resolution\n');
    if (situation === 'changed index') {
      writeFileSync(path.join(f.parent, 'new-file'), 'contribution\n');
      git(f.parent, 'add', 'new-file');
    }
    if (situation === 'child head') {
      writeFileSync(path.join(f.child, 'new-child-source'), 'child commit\n');
      git(f.child, 'add', 'new-child-source');
      git(f.child, 'commit', '-qm', 'concurrent child');
    }
    if (situation === 'parent holder')
      claimOccupancy({
        projectDir: f.main,
        issue: 2039,
        sid: 'another-owner',
        provider: 'codex',
        worktreePath: f.parent,
      });
    if (situation === 'todo exec')
      writeFileSync(marker('rebase-merge/git-rebase-todo'), 'exec touch must-never-run\n');
    if (situation === 'other Git operation')
      writeFileSync(marker('CHERRY_PICK_HEAD'), state.stopped + '\n');
    if (situation === 'generation')
      setActiveTask(
        'recovery-test-owner',
        {
          ...getActiveTask('recovery-test-owner', f.child),
          bindingGenerationId: '99999999-9999-4999-8999-999999999999',
        },
        f.child
      );
    if (situation === 'bad custom bytes')
      resolutions = [{ path: 'one', base64: 'YQ====', sha256: sha('a') }];
    if (situation === 'unrelated path') resolutions = [{ path: 'two', stage: 3 }];
    let evidence;
    if (['ignored', 'untracked'].includes(situation)) {
      evidence = path.join(f.parent, situation === 'ignored' ? 'ignored.txt' : 'untracked.txt');
      writeFileSync(evidence, 'operator evidence');
      state = await f.inspect();
      assert.ok(state[situation].length > 0);
    }
    const before = refusalState(f);
    await assert.rejects(
      f.run({ action: 'skip', expected: state.snapshot, resolutions, reason: 'negative control' }),
      /recovery/
    );
    assert.deepEqual(refusalState(f), before);
    if (evidence) assert.equal(readFileSync(evidence, 'utf8'), 'operator evidence');
  });
}

test('a request symlink or foreign checkout replacing the registered retained parent grants no recovery', async (t) => {
  const f = fixture(t);
  await f.inspect();
  const link = '.scratch/linked-request.json';
  symlinkSync(path.join(f.child, f.file), path.join(f.child, link));
  await assert.rejects(
    runMergeBackCommand(['2068', f.child, '--recover-parent', link], f.deps),
    /request file/
  );
  const backup = f.parent + '-original';
  renameSync(f.parent, backup);
  mkdirSync(f.parent);
  git(f.parent, 'init', '-q');
  await assert.rejects(f.inspect(), /foreign|unregistered/);
  assert.equal(readFileSync(path.join(backup, 'one')).includes(Buffer.from('<<<<<<<')), true);
});

test('fresh observations after waiting for the occupancy lock preserve concurrent conflict edits', async (t) => {
  const f = fixture(t);
  const state = await f.inspect();
  const lock = occupancyPath(f.main) + '.lock';
  mkdirSync(lock);
  const file = path.join(f.parent, 'one');
  const change = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {writeFileSync,rmdirSync} from 'node:fs';setTimeout(()=>{writeFileSync(process.argv[1],'new owner edit');rmdirSync(process.argv[2]);},150)",
      file,
      lock,
    ],
    { stdio: 'pipe' }
  );
  const done = new Promise((resolve, reject) => {
    change.on('error', reject);
    change.on('exit', (code) => (code ? reject(new Error('fixture writer ' + code)) : resolve()));
  });
  await assert.rejects(
    f.run({
      action: 'skip',
      expected: state.snapshot,
      resolutions: [{ path: 'one', stage: 2 }],
      reason: 'superseded choice',
    }),
    /stale/
  );
  await done;
  assert.equal(readFileSync(file, 'utf8'), 'new owner edit');
  assert.equal(git(f.parent, 'rev-parse', 'REBASE_HEAD'), state.stopped);
  f.unchanged();
});

test('an interrupted working-file resolution preserves conflict stages for a fresh retry', async (t) => {
  const f = fixture(t, { twoConflicts: true });
  const first = await f.inspect();
  const entries = git(f.parent, 'ls-files', '--stage');
  const content = Buffer.from('reviewed combined bytes\n');
  const resolutions = [
    { path: 'one', base64: content.toString('base64'), sha256: sha(content) },
    { path: 'two', stage: 3 },
  ];
  git(f.main, 'config', 'filter.fixture.smudge', 'false');
  git(f.main, 'config', 'filter.fixture.clean', 'cat');
  git(f.main, 'config', 'filter.fixture.required', 'true');
  const request = {
    action: 'continue',
    expected: first.snapshot,
    resolutions,
    reason: 'combine both edits',
  };
  await assert.rejects(f.run(request));
  assert.deepEqual(readFileSync(path.join(f.parent, 'one')), content);
  assert.equal(git(f.parent, 'ls-files', '--stage'), entries);
  assert.equal(git(f.parent, 'rev-parse', 'REBASE_HEAD'), first.stopped);
  git(f.main, 'config', '--remove-section', 'filter.fixture');
  const next = await f.inspect();
  assert.equal(next.conflicts.length, 2);
  assert.notEqual(next.snapshot, first.snapshot);
  assert.equal((await f.run({ ...request, expected: next.snapshot })).status, 'completed');
  f.unchanged();
});

test('custom bytes replace only the conflict pathname after an external hard link is created', async (t) => {
  const f = fixture(t);
  const state = await f.inspect();
  const conflict = path.join(f.parent, 'one');
  const evidence = path.join(f.main, '.tmp', 'operator-evidence');
  linkSync(conflict, evidence);
  const original = readFileSync(evidence);
  const mode = statSync(evidence).mode;
  const bytes = Buffer.from('reviewed custom result\n');
  const result = await f.run({
    action: 'continue',
    expected: state.snapshot,
    resolutions: [{ path: 'one', base64: bytes.toString('base64'), sha256: sha(bytes) }],
    reason: 'update the conflict only',
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(readFileSync(conflict), bytes);
  assert.deepEqual(readFileSync(evidence), original);
  assert.equal(statSync(evidence).mode, mode);
  f.unchanged();
});

for (const helper of ['fsmonitor', 'clean']) {
  test('inspection cannot run a configured ' + helper + ' helper', async (t) => {
    const f = fixture(t, { twoConflicts: true });
    const marker = path.join(f.main, '.tmp', helper + '-invoked');
    const program = path.join(f.main, '.tmp', helper + '-helper');
    writeFileSync(
      program,
      '#!/bin/sh\nprintf invoked > ' +
        JSON.stringify(marker) +
        '\n' +
        (helper === 'clean' ? 'cat\n' : 'exit 1\n')
    );
    chmodSync(program, 0o755);
    git(f.main, 'config', helper === 'clean' ? 'filter.fixture.clean' : 'core.fsmonitor', program);
    if (helper === 'clean') {
      const file = path.join(f.child, 'two');
      const changed = Buffer.from(readFileSync(file));
      changed[0] ^= 1;
      writeFileSync(file, changed);
      await assert.rejects(f.inspect(), /dirty/);
    } else {
      assert.equal((await f.inspect()).status, 'paused');
    }
    assert.equal(existsSync(marker), false, 'inspection executed ' + helper);
    f.unchanged();
  });
}
