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
import { runMergeBackCommand, runMergeBackMain } from '../../../task-tracker/merge-back.mjs';
import { loadGuidance } from '../../../../guidance/cache.mjs';

const schema = 'aitm.merge-back-recovery/v1';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
function fixture(
  t,
  { staged = false, second = false, twoConflicts = false, historicalTmp = false } = {}
) {
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
  if (historicalTmp) {
    writeFileSync(path.join(parent, '.TMP'), 'historical collision');
    commit(parent, 'temporary tracked ancestor');
    rmSync(path.join(parent, '.TMP'));
    commit(parent, 'remove collision');
    writeFileSync(path.join(parent, 'later'), 'normal replay');
    commit(parent, 'later safe tree');
  }
  mkdirSync(child, { recursive: true, mode: 0o700 });
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
  mkdirSync(path.join(child, '.scratch'), { recursive: true, mode: 0o700 });
  const args = (request) => {
    writeFileSync(path.join(child, file), JSON.stringify({ schema, ...request }));
    return ['2068', child, '--recover-parent', file];
  };
  const run = (request) => runMergeBackCommand(args(request), deps);
  const inspect = () => run({ action: 'inspect' });
  const unchanged = () => assert.deepEqual(getActiveTask(sid, child), record);
  return { main, parent, child, branch, nodes, deps, args, run, inspect, unchanged, file };
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

test('insufficient remaining Git budget refuses before writing any reviewed resolution', async (t) => {
  const f = fixture(t);
  const state = await f.inspect();
  const before = refusalState(f);
  const bytes = Buffer.from('must remain unapplied\n');
  let opened = false;
  f.deps.recoveryNow = () => {
    if (opened) return 10001;
    opened = true;
    return 0;
  };
  await assert.rejects(
    f.run({
      action: 'continue',
      expected: state.snapshot,
      reason: 'insufficient remaining budget',
      resolutions: [{ path: 'one', base64: bytes.toString('base64'), sha256: sha(bytes) }],
    }),
    /insufficient.*budget/
  );
  assert.deepEqual(refusalState(f), before);
  f.unchanged();
});

test('a signaled Git step reports interruption without expired readback and a valid stop can be retried', async (t) => {
  const f = fixture(t);
  const state = await f.inspect();
  const childHead = git(f.child, 'rev-parse', 'HEAD');
  const helper = path.join(f.main, '.tmp', 'signal-on-rebase');
  const marker = path.join(f.main, '.tmp', 'signal-delivered');
  writeFileSync(
    helper,
    '#!/bin/sh\nprintf signal > ' + JSON.stringify(marker) + '\nkill -TERM "$PPID"\nexit 1\n'
  );
  chmodSync(helper, 0o755);
  git(f.main, 'config', 'core.fsmonitor', helper);
  const request = {
    action: 'skip',
    expected: state.snapshot,
    resolutions: [{ path: 'one', stage: 2 }],
    reason: 'duplicate, signal control',
  };
  // Only a real Git helper can create this marker during the mutation. Expire
  // the modelled lock budget at that point to catch accidental readback.
  f.deps.recoveryNow = () => (existsSync(marker) ? 21000 : 0);
  const output = [];
  const code = await runMergeBackMain(f.args(request), f.deps, (text) => output.push(text));
  assert.equal(code, 1);
  const result = JSON.parse(output.join(''));
  assert.equal(result.status, 'interrupted');
  assert.equal(result.signal, 'SIGTERM');
  assert.match(result.cause, /rebase --skip/);
  assert.equal(result.rebaseMetadataPresent, true);
  assert.equal(readFileSync(marker, 'utf8'), 'signal');
  assert.equal(git(f.child, 'rev-parse', 'HEAD'), childHead);
  f.unchanged();
  git(f.main, 'config', '--unset', 'core.fsmonitor');
  delete f.deps.recoveryNow;
  const retry = await f.inspect();
  assert.equal(retry.status, 'paused');
  assert.equal((await f.run({ ...request, expected: retry.snapshot })).status, 'completed');
});

test('staging exhaustion reports partial working files and retains both conflict stages for retry', async (t) => {
  const f = fixture(t, { twoConflicts: true });
  const originals = publishCache(f);
  const state = await f.inspect();
  const before = git(f.parent, 'ls-files', '--stage');
  const childHead = git(f.child, 'rev-parse', 'HEAD');
  const first = Buffer.from('first reviewed file reached disk\n');
  const observed = path.join(f.parent, 'one');
  f.deps.recoveryNow = () => (readFileSync(observed).equals(first) ? 10500 : 0);
  const request = {
    action: 'continue',
    preserveGuidanceCache: true,
    expected: state.snapshot,
    reason: 'two explicit resolutions',
    resolutions: [
      { path: 'one', base64: first.toString('base64'), sha256: sha(first) },
      { path: 'two', stage: 3 },
    ],
  };
  const result = await f.run(request);
  assert.equal(result.status, 'interrupted');
  assert.equal(result.phase, 'staging');
  const archived = JSON.parse(readFileSync(path.join(f.child, result.cacheReceipt.path)));
  assert.deepEqual(Buffer.from(archived.files[0].base64, 'base64'), originals[cacheNames[0]]);
  assert.equal(result.postCache.status, 'unobserved');
  assert.equal(result.code, 'RECOVERY_BUDGET');
  assert.equal(result.rebaseMetadataPresent, true);
  assert.deepEqual(readFileSync(observed), first);
  assert.equal(git(f.parent, 'ls-files', '--stage'), before);
  assert.equal(git(f.child, 'rev-parse', 'HEAD'), childHead);
  f.unchanged();
  delete f.deps.recoveryNow;
  const retry = await f.inspect();
  assert.equal(retry.conflicts.length, 2);
  assert.equal((await f.run({ ...request, expected: retry.snapshot })).status, 'completed');
});

test('an unavailable registered parent is identified without dropping its registration', async (t) => {
  const f = fixture(t);
  const moved = f.parent + '-retained';
  renameSync(f.parent, moved);
  await assert.rejects(f.inspect(), /registered retained parent checkout unavailable/);
  assert.ok(git(f.main, 'worktree', 'list', '--porcelain').includes(f.parent));
  assert.ok(existsSync(path.join(moved, '.git')));
});

const cacheDir = '.tmp/aitm/guidance-cache';
const cacheNames = ['agent-index.v1.json', 'human-catalog.v1.json', 'manifest.v1.json'];
function publishCache(f) {
  assert.equal(loadGuidance({ projectRoot: f.parent, need: 'agent' }).valid, true);
  return Object.fromEntries(
    cacheNames.map((name) => [name, readFileSync(path.join(f.parent, cacheDir, name))])
  );
}
const skipCache = (state) => ({
  action: 'skip',
  expected: state.snapshot,
  preserveGuidanceCache: true,
  resolutions: [{ path: 'one', stage: 2 }],
  reason: 'reviewed duplicate with preserved cache',
});

test('explicit cache preservation archives exact original bytes before the parent step', async (t) => {
  const f = fixture(t);
  const original = publishCache(f);
  const state = await f.inspect();
  assert.equal(state.guidanceCache.status, 'verified');
  const withoutPermission = skipCache(state);
  delete withoutPermission.preserveGuidanceCache;
  await assert.rejects(f.run(withoutPermission), /preserve/);
  const result = await f.run(skipCache(state));
  assert.equal(result.status, 'completed');
  const saved = readFileSync(path.join(f.child, result.cacheReceipt.path));
  assert.equal(sha(saved), result.cacheReceipt.sha256);
  const receipt = JSON.parse(saved);
  assert.equal(receipt.snapshot, state.snapshot);
  for (const row of receipt.files) {
    assert.deepEqual(Buffer.from(row.base64, 'base64'), original[path.basename(row.path)]);
    assert.equal(row.sha256, sha(original[path.basename(row.path)]));
    assert.equal(row.size, original[path.basename(row.path)].length);
    assert.equal(row.mode, statSync(path.join(f.parent, row.path)).mode);
  }
  assert.equal(receipt.files.length, 3);
  f.unchanged();
});

test('a partial or mismatched cache stays ineligible even when preservation is requested', async (t) => {
  const f = fixture(t);
  publishCache(f);
  writeFileSync(path.join(f.parent, cacheDir, cacheNames[0]), 'changed bytes');
  const state = await f.inspect();
  assert.equal(state.guidanceCache.status, 'ineligible');
  const before = refusalState(f);
  await assert.rejects(f.run(skipCache(state)), /cache|ignored/);
  assert.deepEqual(refusalState(f), before);
});

for (const kind of ['partial', 'unknown ignored', 'untracked', 'symlink', 'hard link']) {
  test('cache preservation refuses ' + kind + ' evidence and leaves Git unchanged', async (t) => {
    const f = fixture(t);
    publishCache(f);
    const cacheFile = path.join(f.parent, cacheDir, cacheNames[0]);
    const foreign = path.join(f.main, '.tmp', 'foreign-cache-evidence');
    if (kind === 'partial') rmSync(cacheFile);
    if (kind === 'unknown ignored') writeFileSync(path.join(f.parent, '.tmp', 'other'), 'keep');
    if (kind === 'untracked') writeFileSync(path.join(f.parent, 'other-untracked'), 'keep');
    if (kind === 'symlink') {
      renameSync(cacheFile, foreign);
      symlinkSync(foreign, cacheFile);
    }
    if (kind === 'hard link') linkSync(cacheFile, foreign);
    const state = await f.inspect(),
      before = refusalState(f);
    assert.equal(state.guidanceCache.status, 'ineligible');
    await assert.rejects(f.run(skipCache(state)), /preserve|ignored/);
    assert.deepEqual(refusalState(f), before);
  });
}
for (const inputOnly of [false, true]) {
  test(
    'cache preservation detects a case-aliased tracked root in ' +
      (inputOnly ? 'a pick input parent' : 'an intermediate pick'),
    async (t) => {
      const f = fixture(t, { historicalTmp: true });
      publishCache(f);
      if (inputOnly) {
        const todo = git(
          f.parent,
          'rev-parse',
          '--path-format=absolute',
          '--git-path',
          'rebase-merge/git-rebase-todo'
        );
        const original = readFileSync(todo, 'utf8');
        const revised = original
          .split('\n')
          .filter((line) => !line.endsWith(' temporary tracked ancestor'))
          .join('\n');
        assert.notEqual(revised, original);
        writeFileSync(todo, revised);
      }
      const state = await f.inspect(),
        before = refusalState(f);
      assert.equal(state.guidanceCache.status, 'ineligible');
      assert.match(state.guidanceCache.reason, /collision in replay tree/);
      await assert.rejects(f.run(skipCache(state)), /preserve|ignored/);
      assert.deepEqual(refusalState(f), before);
    }
  );
}
for (const scenario of [
  'existing receipt',
  'symlinked directory',
  'drift after receipt',
  'budget after receipt',
]) {
  test('cache receipt protects parent before Git for ' + scenario, async (t) => {
    const f = fixture(t),
      original = publishCache(f),
      state = await f.inspect();
    const base = path.join(f.child, '.scratch', '2068-recovery'),
      directory = path.join(base, 'cache-evidence'),
      target = path.join(directory, state.snapshot + '.json');
    mkdirSync(base, { recursive: true, mode: 0o700 });
    if (scenario === 'existing receipt') {
      mkdirSync(directory, { mode: 0o700 });
      writeFileSync(target, 'preexisting operator data');
    }
    if (scenario === 'symlinked directory') symlinkSync(path.join(f.main, '.tmp'), directory);
    let changed = false;
    if (scenario === 'drift after receipt' || scenario === 'budget after receipt')
      f.deps.recoveryNow = () => {
        if (existsSync(target)) {
          if (scenario === 'budget after receipt') return 10500;
          if (!changed) {
            changed = true;
            writeFileSync(path.join(f.parent, cacheDir, cacheNames[1]), 'concurrent cache update');
          }
        }
        return 0;
      };
    const before = refusalState(f);
    await assert.rejects(f.run(skipCache(state)), /receipt|budget|observations changed/);
    assert.deepEqual(refusalState(f), before);
    if (scenario === 'existing receipt')
      assert.equal(readFileSync(target, 'utf8'), 'preexisting operator data');
    if (scenario === 'symlinked directory')
      assert.equal(existsSync(path.join(f.main, '.tmp', state.snapshot + '.json')), false);
    if (scenario === 'drift after receipt') {
      assert.equal(changed, true);
      assert.deepEqual(
        Buffer.from(JSON.parse(readFileSync(target)).files[1].base64, 'base64'),
        original[cacheNames[1]]
      );
    }
    if (scenario === 'budget after receipt') {
      const saved = statSync(target);
      delete f.deps.recoveryNow;
      assert.equal((await f.run(skipCache(state))).status, 'completed');
      assert.equal(statSync(target).ino, saved.ino);
    }
  });
}

test('a tracked .tmp index entry refuses preservation before any parent write', async (t) => {
  const f = fixture(t);
  publishCache(f);
  const file = '.tmp/other-indexed';
  writeFileSync(path.join(f.parent, file), 'tracked input');
  git(f.parent, 'add', '-f', file);
  const state = await f.inspect(),
    before = refusalState(f);
  assert.equal(state.guidanceCache.status, 'ineligible');
  assert.match(state.guidanceCache.reason, /collision in index/);
  await assert.rejects(f.run(skipCache(state)), /preserve|ignored/);
  assert.deepEqual(refusalState(f), before);
});

test('normal Git cache updates remain in the checkout and the receipt retains the prior bytes', async (t) => {
  const f = fixture(t),
    original = publishCache(f),
    state = await f.inspect();
  const target = path.join(f.parent, cacheDir, cacheNames[1]),
    hook = path.join(f.main, '.tmp', 'cache-updater');
  writeFileSync(hook, '#!/bin/sh\nprintf updated > ' + JSON.stringify(target) + '\nexit 1\n');
  chmodSync(hook, 0o755);
  git(f.main, 'config', 'core.fsmonitor', hook);
  const result = await f.run(skipCache(state));
  assert.equal(result.status, 'completed');
  assert.equal(readFileSync(target, 'utf8'), 'updated');
  assert.deepEqual(result.postCache.contentOrModeChanged, [
    path.posix.join(cacheDir, cacheNames[1]),
  ]);
  const receipt = JSON.parse(readFileSync(path.join(f.child, result.cacheReceipt.path)));
  assert.deepEqual(Buffer.from(receipt.files[1].base64, 'base64'), original[cacheNames[1]]);
  f.unchanged();
});

test('cache drift during occupancy lock wait refuses the old snapshot without replacing evidence', async (t) => {
  const f = fixture(t);
  publishCache(f);
  const state = await f.inspect(),
    before = refusalState(f);
  const file = path.join(f.parent, cacheDir, cacheNames[0]),
    lock = occupancyPath(f.main) + '.lock';
  mkdirSync(lock);
  const writer = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {writeFileSync,rmdirSync} from 'node:fs';setTimeout(()=>{writeFileSync(process.argv[1],'changed while waiting');rmdirSync(process.argv[2]);},150)",
      file,
      lock,
    ],
    { stdio: 'pipe' }
  );
  const done = new Promise((resolve, reject) => {
    writer.on('error', reject);
    writer.on('exit', (code) => (code ? reject(new Error('fixture writer ' + code)) : resolve()));
  });
  await assert.rejects(f.run(skipCache(state)), /stale/);
  await done;
  assert.deepEqual(refusalState(f), before);
  assert.equal(readFileSync(file, 'utf8'), 'changed while waiting');
  assert.equal(
    existsSync(
      path.join(f.child, '.scratch', '2068-recovery', 'cache-evidence', state.snapshot + '.json')
    ),
    false
  );
});

for (const [component, mode] of [
  ['.', 0o775],
  ['.scratch', 0o777],
  ['.scratch/2068-recovery', 0o775],
  ['.scratch/2068-recovery/cache-evidence', 0o777],
  ['directory after publication', 0o775],
  ['file after publication', 0o640],
]) {
  test('unsafe receipt permissions refuse parent writes for ' + component, async (t) => {
    const f = fixture(t),
      originals = publishCache(f),
      state = await f.inspect();
    const evidence = path.join(f.child, '.scratch/2068-recovery/cache-evidence');
    const target = path.join(evidence, state.snapshot + '.json');
    const after = component.endsWith('after publication');
    const directory = after ? evidence : path.join(f.child, component);
    const file = component === 'file after publication';
    const unsafe = file ? target : directory;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const marker = path.join(directory, component === '.' ? 'ignored.txt' : '.operator-note');
    writeFileSync(marker, 'retain this data');
    if (after)
      f.deps.recoveryNow = () => {
        if (existsSync(target)) chmodSync(unsafe, mode);
        return 0;
      };
    else chmodSync(unsafe, mode);
    const before = refusalState(f);
    await assert.rejects(f.run(skipCache(state)), (error) =>
      error.message.includes('unsafe cache receipt ' + (file ? 'file' : 'directory'))
    );
    assert.deepEqual(refusalState(f), before);
    f.unchanged();
    assert.equal(statSync(unsafe).mode & 0o777, mode);
    assert.equal(readFileSync(marker, 'utf8'), 'retain this data');
    assert.equal(existsSync(target), after);
    for (const name of cacheNames)
      assert.deepEqual(readFileSync(path.join(f.parent, cacheDir, name)), originals[name]);
    if (after)
      assert.deepEqual(
        Buffer.from(JSON.parse(readFileSync(target)).files[0].base64, 'base64'),
        originals[cacheNames[0]]
      );
  });
}

test('a foreign uid refuses an otherwise private receipt file or directory', async () => {
  const { receiptPermissionsSafe } = await import('../../../task-tracker/lib/merge-back-cli.mjs');
  for (const [directory, mode] of [
    [true, 0o755],
    [false, 0o600],
  ]) {
    assert.equal(receiptPermissionsSafe({ uid: 41, mode }, directory, 41), true);
    assert.equal(receiptPermissionsSafe({ uid: 42, mode }, directory, 41), false);
  }
});
