// @story #2068
// cspell:words fsmonitor
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  symlinkSync,
  existsSync,
  chmodSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { childRebaseFixture, git } from '../../helpers/child-rebase-fixture.mjs';
import { setActiveTask } from '../../../task-tracker/session-state.mjs';
import { claimOccupancy } from '../../../task-tracker/lib/occupancy.mjs';
import { appendIssueWorktreeLocation } from '../../../task-tracker/lib/issue-worktree-location.mjs';
import { proveChildProtectedTrees } from '../../../task-tracker/lib/child-rebase-recovery.mjs';
import { loadGuidance } from '../../../../guidance/cache.mjs';

// Catches conflating the historical child target with the current repair lease.
test('current repair lease resolves a prior child rebase and preserves dependencies, evidence and runtime', async (t) => {
  const f = childRebaseFixture(t, { staged: true });
  const repairHead = git(f.repair, 'rev-parse', 'HEAD');
  const inspected = await f.inspect();
  assert.equal(inspected.status, 'paused');
  assert.deepEqual(
    inspected.conflicts.map(({ path: file }) => file),
    ['conflict.txt']
  );
  const bytes = Buffer.from('combined accepted epic and child\n');
  const result = await f.run({
    action: 'continue',
    expected: inspected.snapshot,
    preserveWorkspaceData: true,
    reason: 'retain both accepted contributions',
    resolutions: [
      {
        path: 'conflict.txt',
        base64: bytes.toString('base64'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    ],
  });
  assert.equal(result.status, 'completed');
  assert.equal(git(f.target, 'branch', '--show-current'), f.branch);
  assert.equal(readFileSync(path.join(f.target, 'conflict.txt'), 'utf8'), bytes.toString());
  assert.equal(
    readFileSync(path.join(f.target, 'valuable.txt'), 'utf8'),
    'unique child contribution\n'
  );
  assert.equal(git(f.repair, 'rev-parse', 'HEAD'), repairHead);
  assert.equal(git(f.main, 'rev-parse', f.epicBranch), f.onto);
  f.retained();
});

test('reviewed empty child skip finishes its historical branch without integrating the repair branch', async (t) => {
  const f = childRebaseFixture(t);
  const inspected = await f.inspect();
  const result = await f.run({
    action: 'skip',
    expected: inspected.snapshot,
    preserveWorkspaceData: true,
    reason: 'epic already owns the reviewed result',
    resolutions: [{ path: 'conflict.txt', stage: 2 }],
  });
  assert.equal(result.status, 'completed');
  assert.equal(git(f.main, 'rev-parse', f.branch), f.onto);
  assert.equal(git(f.repair, 'branch', '--show-current'), f.repairBranch);
  f.retained();
});

for (const change of [
  'current generation',
  'epic tip',
  'untracked evidence',
  'stale conflict bytes',
]) {
  test('child recovery refuses ' + change + ' without modifying the paused target', async (t) => {
    const f = childRebaseFixture(t);
    const inspected = await f.inspect();
    if (change === 'current generation')
      setActiveTask(
        f.sid,
        { ...f.record, bindingGenerationId: 'newer-owner-generation' },
        f.repair
      );
    if (change === 'epic tip') git(f.main, 'branch', '-f', f.epicBranch, f.original);
    if (change === 'untracked evidence')
      writeFileSync(path.join(f.target, 'operator-notes.txt'), 'keep these notes\n');
    if (change === 'stale conflict bytes')
      writeFileSync(path.join(f.target, 'conflict.txt'), 'newer manual observation\n');
    const before = f.state();
    await assert.rejects(
      f.run({
        action: 'skip',
        expected: inspected.snapshot,
        preserveWorkspaceData: true,
        reason: 'stale decision must refuse',
        resolutions: [{ path: 'conflict.txt', stage: 2 }],
      })
    );
    assert.deepEqual(f.state(), before);
  });
}

test('child skip refuses unique cleanly staged work even when every conflict resolves to HEAD', async (t) => {
  const f = childRebaseFixture(t, { staged: true });
  const inspected = await f.inspect();
  const before = f.state();
  await assert.rejects(
    f.run({
      action: 'skip',
      expected: inspected.snapshot,
      preserveWorkspaceData: true,
      reason: 'not actually a duplicate',
      resolutions: [{ path: 'conflict.txt', stage: 2 }],
    }),
    /empty|duplicate/
  );
  assert.deepEqual(f.state(), before);
});

for (const situation of [
  'foreign history SID',
  'ambiguous history',
  'malformed history',
  'changed original',
  'changed stopped',
  'todo exec',
  'other operation',
  'target holder',
  'wrong repository',
  'protected root replacement',
  'aliased protected root',
  'missing preservation consent',
]) {
  test('child recovery preserves state on refusal: ' + situation, async (t) => {
    const f = childRebaseFixture(t);
    const inspected = await f.inspect();
    const metadata = (name) =>
      git(f.target, 'rev-parse', '--path-format=absolute', '--git-path', name);
    if (situation === 'foreign history SID')
      f.setBody(f.getBody().replace(f.sid, 'another-session'));
    if (situation === 'ambiguous history') {
      const first = f
        .getBody()
        .split('\n')
        .find((line) => line.includes('worktree-location'));
      f.setBody(
        f.getBody().replace(first, first + '\n' + first.replace(f.branch, 'codex/other-child'))
      );
    }
    if (situation === 'malformed history')
      f.setBody(f.getBody().replace('ts=', 'missingTimestamp='));
    if (situation === 'changed original')
      writeFileSync(metadata('rebase-merge/orig-head'), f.onto + '\n');
    if (situation === 'changed stopped')
      writeFileSync(metadata('rebase-merge/stopped-sha'), f.onto + '\n');
    if (situation === 'todo exec')
      writeFileSync(metadata('rebase-merge/git-rebase-todo'), 'exec touch must-not-run\n');
    if (situation === 'other operation') writeFileSync(metadata('MERGE_HEAD'), f.onto + '\n');
    if (situation === 'target holder')
      claimOccupancy({
        projectDir: f.main,
        issue: 777,
        sid: 'foreign-owner',
        provider: 'codex',
        worktreePath: f.target,
      });
    if (situation === 'wrong repository') f.deps.loadConfig = () => ({ repo: 'foreign/project' });
    if (['protected root replacement', 'aliased protected root'].includes(situation)) {
      renameSync(path.join(f.target, '.scratch'), path.join(f.target, '.tmp/saved-scratch'));
      if (situation === 'aliased protected root')
        symlinkSync(
          path.join(f.target, '.tmp/saved-scratch'),
          path.join(f.target, '.scratch'),
          'dir'
        );
      else mkdirSync(path.join(f.target, '.scratch'));
    }
    const before = f.state();
    await assert.rejects(
      f.run({
        action: 'skip',
        expected: inspected.snapshot,
        preserveWorkspaceData: situation !== 'missing preservation consent',
        reason: 'authority must be exact',
        resolutions: [{ path: 'conflict.txt', stage: 2 }],
      })
    );
    assert.deepEqual(f.state(), before);
    assert.equal(existsSync(path.join(f.target, 'must-not-run')), false);
  });
}

for (const parentOnly of [false, true])
  test(
    'protected-prefix case folding collision in ' +
      (parentOnly ? 'input parent' : 'intermediate pick') +
      ' refuses before writes',
    async (t) => {
      const f = childRebaseFixture(t, { historicalProtected: true });
      if (parentOnly) {
        const todo = git(
          f.target,
          'rev-parse',
          '--path-format=absolute',
          '--git-path',
          'rebase-merge/git-rebase-todo'
        );
        writeFileSync(
          todo,
          readFileSync(todo, 'utf8')
            .split('\n')
            .filter((line) => !line.includes('historical protected prefix'))
            .join('\n')
        );
      }
      const before = f.state();
      await assert.rejects(f.inspect(), /collision/);
      assert.deepEqual(f.state(), before);
    }
  );

test('child continuation reports another pause, preserving executor source and next conflict', async (t) => {
  const f = childRebaseFixture(t, { second: true });
  const first = await f.inspect();
  const next = await f.run({
    action: 'continue',
    expected: first.snapshot,
    preserveWorkspaceData: true,
    reason: 'retain child change',
    resolutions: [{ path: 'conflict.txt', stage: 3 }],
  });
  assert.equal(next.status, 'paused');
  assert.notEqual(next.stopped, first.stopped);
  assert.deepEqual(
    next.conflicts.map((entry) => entry.path),
    ['second.txt']
  );
  assert.equal(git(f.repair, 'rev-parse', 'HEAD'), f.onto);
  f.retained();
});

test('two historical same-session child rebases refuse ambiguous target selection', async (t) => {
  const f = childRebaseFixture(t);
  const other = path.join(f.main, '.ai-task-manager/runtime/test-fixtures/second-child');
  const branch = 'codex/2068-second-child';
  git(f.main, 'worktree', 'add', '-b', branch, other, f.original);
  assert.throws(() => git(other, 'rebase', '--onto', f.epicBranch, f.original + '^', branch));
  const latest = f
    .getBody()
    .split('\n')
    .filter((line) => line.includes('worktree-location'))
    .at(-1);
  const historical = appendIssueWorktreeLocation('', {
    worktreePath: other,
    worktreeBranch: branch,
    sessionId: f.sid,
    ts: '2026-10-31T11:00:00.000Z',
  });
  f.setBody(f.getBody().replace(latest, historical + '\n' + latest));
  const before = f.state();
  const otherIndex = git(other, 'ls-files', '--stage');
  await assert.rejects(f.inspect(), /exactly one/);
  assert.deepEqual(f.state(), before);
  assert.equal(git(other, 'ls-files', '--stage'), otherIndex);
});

test('child recovery reserves Git budget before any resolution write', async (t) => {
  const f = childRebaseFixture(t);
  const inspected = await f.inspect();
  const before = f.state();
  let opened = false;
  f.deps.recoveryNow = () => {
    if (opened) return 10001;
    opened = true;
    return 0;
  };
  await assert.rejects(
    f.run({
      action: 'continue',
      expected: inspected.snapshot,
      preserveWorkspaceData: true,
      reason: 'budget exhausted during inspection',
      resolutions: [{ path: 'conflict.txt', stage: 3 }],
    }),
    /insufficient.*budget/
  );
  assert.deepEqual(f.state(), before);
});

test('actual interrupted child Git step retains recovery metadata and permits a fresh supported retry', async (t) => {
  const f = childRebaseFixture(t);
  const inspected = await f.inspect();
  const helper = path.join(f.main, '.tmp', 'interrupt-child-rebase');
  const marker = path.join(f.main, '.tmp', 'signal-delivered');
  writeFileSync(
    helper,
    '#!/bin/sh\nprintf signal > ' + JSON.stringify(marker) + '\nkill -TERM "$PPID"\nexit 1\n'
  );
  chmodSync(helper, 0o755);
  git(f.main, 'config', 'core.fsmonitor', helper);
  const request = {
    action: 'skip',
    expected: inspected.snapshot,
    preserveWorkspaceData: true,
    reason: 'reviewed duplicate',
    resolutions: [{ path: 'conflict.txt', stage: 2 }],
  };
  f.deps.recoveryNow = () => (existsSync(marker) ? 21000 : 0);
  const result = await f.run(request);
  assert.equal(result.status, 'interrupted');
  assert.equal(result.signal, 'SIGTERM');
  assert.equal(result.rebaseMetadataPresent, true);
  assert.match(result.cause, /rebase --skip/);
  assert.equal(git(f.repair, 'rev-parse', 'HEAD'), f.onto);
  f.retained();
  git(f.main, 'config', '--unset', 'core.fsmonitor');
  delete f.deps.recoveryNow;
  const fresh = await f.inspect();
  assert.equal((await f.run({ ...request, expected: fresh.snapshot })).status, 'completed');
  f.retained();
});

test('real recovery fixture stays isolated under native project aliases and an artifact sandbox cwd', (t) => {
  const outer = childRebaseFixture(t);
  const cwd = path.join(outer.main, '.ai-task-manager/runtime/test-sandboxes/provider/.scratch');
  mkdirSync(cwd, { recursive: true });
  const helper = new URL('../../helpers/child-rebase-fixture.mjs', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { childRebaseFixture, git } from ${JSON.stringify(helper)};
    const cleanup = [];
    try {
      const f = childRebaseFixture({ after: (fn) => cleanup.push(fn) }, { nativeLayout: true });
      const state = await f.inspect();
      const result = await f.run({ action: 'skip', expected: state.snapshot,
        preserveWorkspaceData: true, reason: 'native fixture isolation',
        resolutions: [{ path: 'conflict.txt', stage: 2 }] });
      assert.equal(result.status, 'completed');
      assert.equal(git(f.repair, 'rev-parse', 'HEAD'), f.onto);
      f.retained();
    } finally { for (const close of cleanup.reverse()) close(); }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...process.env,
      AI_TASK_MANAGER_PROJECT_DIR: outer.main,
      CLAUDE_PROJECT_DIR: outer.main,
      TASK_TRACKER_PROJECT_DIR: outer.main,
    },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  outer.retained();
});

for (const action of ['continue', 'skip'])
  test(
    'native layout retains tracked scratch contract and observed runtime evidence during ' + action,
    async (t) => {
      const f = childRebaseFixture(t, { nativeLayout: true });
      const inspected = await f.inspect();
      const result = await f.run({
        action,
        expected: inspected.snapshot,
        preserveWorkspaceData: true,
        reason: 'preserve real repository layout',
        resolutions: [{ path: 'conflict.txt', stage: action === 'skip' ? 2 : 3 }],
      });
      assert.equal(result.status, 'completed');
      assert.equal(
        readFileSync(path.join(f.target, '.scratch/README.md'), 'utf8'),
        'tracked scratch contract\n'
      );
      assert.equal(git(f.target, 'merge-base', f.onto, 'HEAD'), f.onto);
      f.retained();
    }
  );

for (const protectedDelta of ['change', 'remove', 'add', 'mode'])
  test('protected tracked subtree refuses ' + protectedDelta + ' in replay input', async (t) => {
    const f = childRebaseFixture(t, { nativeLayout: true, protectedDelta });
    const before = f.state();
    await assert.rejects(f.inspect(), /protected|collision/);
    assert.deepEqual(f.state(), before);
  });

for (const alias of ['executor', 'named holder', 'epic'])
  test('historical target ref isolation refuses ' + alias + ' before writes', async (t) => {
    const f = childRebaseFixture(t);
    if (alias === 'executor') {
      git(f.repair, 'checkout', '--ignore-other-worktrees', f.branch);
      f.nodes[2068].authoritativeBranch = f.branch;
      setActiveTask(f.sid, { ...f.record, worktreeBranch: f.branch }, f.repair);
      f.setBody(f.getBody().replace(f.repairBranch, f.branch));
    } else if (alias === 'named holder') {
      const holder = path.join(f.main, '.ai-task-manager/runtime/test-fixtures/named-holder');
      git(f.main, 'worktree', 'add', '--force', holder, f.branch);
    } else {
      const headName = git(
        f.target,
        'rev-parse',
        '--path-format=absolute',
        '--git-path',
        'rebase-merge/head-name'
      );
      const original = git(
        f.target,
        'rev-parse',
        '--path-format=absolute',
        '--git-path',
        'rebase-merge/orig-head'
      );
      writeFileSync(headName, 'refs/heads/' + f.epicBranch + '\n');
      writeFileSync(original, f.onto + '\n');
      f.setBody(f.getBody().replace(f.branch, f.epicBranch));
    }
    const before = f.state();
    await assert.rejects(f.inspect(), /ref|holder|isolation|executor|epic/);
    assert.deepEqual(f.state(), before);
  });

test('fresh child inspection refuses detached HEAD that no longer descends from onto', async (t) => {
  const f = childRebaseFixture(t);
  git(f.target, 'update-ref', 'HEAD', git(f.main, 'rev-parse', f.onto + '^'));
  const before = f.state();
  await assert.rejects(f.inspect(), /ancestry|descend|onto/);
  assert.deepEqual(f.state(), before);
});

test('child recovery preserves coherent guidance originals before a normal hook regenerates cache', async (t) => {
  const f = childRebaseFixture(t);
  assert.equal(loadGuidance({ projectRoot: f.target, need: 'agent' }).valid, true);
  const names = ['agent-index.v1.json', 'human-catalog.v1.json', 'manifest.v1.json'];
  const originals = Object.fromEntries(
    names.map((name) => [name, readFileSync(path.join(f.target, '.tmp/aitm/guidance-cache', name))])
  );
  const hook = path.join(f.main, '.git/hooks/post-commit');
  writeFileSync(
    hook,
    '#!/bin/sh\nprintf regenerated > .tmp/aitm/guidance-cache/human-catalog.v1.json\n'
  );
  chmodSync(hook, 0o755);
  const inspected = await f.inspect();
  const result = await f.run({
    action: 'continue',
    expected: inspected.snapshot,
    preserveWorkspaceData: true,
    preserveGuidanceCache: true,
    reason: 'retain original coherent cache evidence',
    resolutions: [{ path: 'conflict.txt', stage: 3 }],
  });
  assert.equal(result.status, 'completed');
  assert.ok(result.cacheReceipt, 'coherent child cache needs an immutable receipt');
  const receipt = JSON.parse(readFileSync(path.join(f.repair, result.cacheReceipt.path)));
  for (const file of receipt.files)
    assert.deepEqual(Buffer.from(file.base64, 'base64'), originals[path.basename(file.path)]);
  assert.equal(
    readFileSync(path.join(f.target, '.tmp/aitm/guidance-cache/human-catalog.v1.json'), 'utf8'),
    'regenerated'
  );
  f.retained();
});

for (const situation of ['missing consent', 'partial', 'tampered', 'unknown cache file']) {
  test('child guidance preservation refuses ' + situation + ' before parent writes', async (t) => {
    const f = childRebaseFixture(t, { nativeLayout: true });
    assert.equal(loadGuidance({ projectRoot: f.target, need: 'agent' }).valid, true);
    const cache = path.join(f.target, '.tmp/aitm/guidance-cache');
    if (situation === 'partial')
      renameSync(
        path.join(cache, 'manifest.v1.json'),
        path.join(f.target, '.scratch/original-manifest.json')
      );
    if (situation === 'tampered') writeFileSync(path.join(cache, 'manifest.v1.json'), '{}');
    if (situation === 'unknown cache file')
      writeFileSync(path.join(cache, 'operator.txt'), 'retain');
    const inspected = await f.inspect();
    const before = f.state();
    await assert.rejects(
      f.run({
        action: 'skip',
        expected: inspected.snapshot,
        preserveWorkspaceData: true,
        preserveGuidanceCache: situation !== 'missing consent',
        reason: 'invalid cache must remain untouched',
        resolutions: [{ path: 'conflict.txt', stage: 2 }],
      }),
      /guidance|preserve/
    );
    assert.deepEqual(f.state(), before);
    f.retained();
  });
}

test('protected subtree proof refuses a case-folding ignored alias of its tracked contract', (t) => {
  const f = childRebaseFixture(t, { nativeLayout: true });
  const root = git(f.target, 'rev-parse', 'HEAD^{tree}');
  const readTrees = (names) =>
    [...new Set(names)].map((oid) => ({
      oid,
      bytes: execFileSync('git', ['cat-file', 'tree', oid], { cwd: f.target }),
    }));
  const entries = new Map(
    git(f.target, 'ls-tree', '-r', 'HEAD')
      .split('\n')
      .map((line) => {
        const [header, file] = line.split('\t'),
          [mode, , oid] = header.split(' ');
        return [file, { 0: { mode, oid } }];
      })
  );
  assert.throws(
    () =>
      proveChildProtectedTrees({
        trees: readTrees([root]),
        entries,
        extra: ['.scratch/readme.md'],
        readTrees,
        checkBudget: () => {},
      }),
    /collides/
  );
});
