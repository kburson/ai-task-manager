// @story #1855
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { existsSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import {
  observeFileIdentity,
  observeGitIndexIdentity,
} from '../../../../../guidance/cache-identity.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

test('native guidance index observation resolves both path facts in one Git process', () => {
  const root = mkdtempProjectIsolated('guidance-index-path-count-');
  const original = childProcess.execFileSync;
  const reads = [];
  try {
    childProcess.execFileSync = function (file, args, options) {
      if (file === 'git' && options?.cwd === root) reads.push([...args]);
      return Reflect.apply(original, this, arguments);
    };
    syncBuiltinESMExports();
    const actual = observeGitIndexIdentity(root);
    assert.equal(actual.decision, 'stat');
    assert.deepEqual(reads, [
      ['rev-parse', '--git-dir', '--git-path', 'index'],
      ['ls-files', '--stage', '-z'],
    ]);
  } finally {
    childProcess.execFileSync = original;
    syncBuiltinESMExports();
    rmSync(root, { recursive: true, force: true });
  }
});

// Independent original reader retained before the proposed process-boundary change.
const PROJECT_GUIDANCE_PATH = '.ai-task-manager/aitm-guidance.yml';
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
function gitPath(projectRoot, args, env) {
  const value = childProcess
    .execFileSync('git', ['rev-parse', ...args], {
      cwd: projectRoot,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    .trim();
  return path.resolve(projectRoot, value);
}

function originalIndexIdentity(projectRoot, { gitIndexFile = process.env.GIT_INDEX_FILE } = {}) {
  try {
    const env = gitIndexFile ? { ...process.env, GIT_INDEX_FILE: gitIndexFile } : process.env;
    const gitDir = gitPath(projectRoot, ['--git-dir'], env);
    const indexPath = gitPath(projectRoot, ['--git-path', 'index'], env);
    const index = observeFileIdentity(indexPath);
    if (index.decision !== 'stat')
      return { decision: 'hash-and-recheck-tracking', gitDir, indexPath };
    // Git may rewrite stat-cache bytes during `status` without changing any staged entry.
    // The staged-entry stream is the stable semantic identity of this effective index.
    const staged = childProcess.execFileSync('git', ['ls-files', '--stage', '-z'], {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
    const sharedIndexes = readdirSync(gitDir)
      .filter((name) => /^sharedindex\.[a-f0-9]+$/.test(name))
      .sort()
      .map((name) => observeFileIdentity(path.join(gitDir, name)));
    if (sharedIndexes.some((entry) => entry.decision !== 'stat')) {
      return { decision: 'hash-and-recheck-tracking', gitDir, indexPath };
    }
    return {
      decision: 'stat',
      gitDir,
      indexPath,
      stagedEntriesDigest: sha256(staged),
      trackedPath: PROJECT_GUIDANCE_PATH,
      sharedIndexes,
    };
  } catch {
    return { decision: 'hash-and-recheck-tracking' };
  }
}

function parity(root, options) {
  const expected = originalIndexIdentity(root, options);
  const actual = observeGitIndexIdentity(root, options);
  assert.deepEqual(actual, expected);
  return actual;
}

test('native index identity preserves original fresh main, selected, newline and missing index facts', () => {
  const root = mkdtempProjectIsolated('guidance-index-path-parity-');
  try {
    const before = parity(root);
    assert.equal(before.decision, 'stat');
    writeFileSync(path.join(root, 'new-guidance.yml'), 'changed\n');
    childProcess.execFileSync('git', ['add', '-f', 'new-guidance.yml'], { cwd: root });
    assert.notDeepEqual(parity(root), before);
    for (const name of ['selected.index', 'selected\n.index']) {
      const selected = path.join(root, name);
      childProcess.execFileSync('git', ['read-tree', '--empty'], {
        cwd: root,
        env: { ...process.env, GIT_INDEX_FILE: selected },
      });
      const actual = parity(root, { gitIndexFile: selected });
      assert.equal(actual.decision, 'stat');
      assert.equal(actual.indexPath, selected);
    }
    const missing = parity(root, { gitIndexFile: path.join(root, 'missing.index') });
    assert.equal(missing.decision, 'hash-and-recheck-tracking');
    const corrupt = path.join(root, 'corrupt.index');
    writeFileSync(corrupt, 'not a Git index');
    assert.deepEqual(parity(root, { gitIndexFile: corrupt }), {
      decision: 'hash-and-recheck-tracking',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('native index identity preserves independent linked and split-index next-call changes', () => {
  const root = mkdtempProjectIsolated('guidance-index-path-linked-');
  const linked = path.join(root, 'linked');
  try {
    childProcess.execFileSync('git', ['worktree', 'add', '-q', '--detach', linked, 'HEAD'], {
      cwd: root,
    });
    const primary = parity(root);
    const before = parity(linked);
    assert.equal(before.decision, 'stat');
    assert.notEqual(primary.indexPath, before.indexPath);
    writeFileSync(path.join(linked, 'new-guidance.yml'), 'linked change\n');
    childProcess.execFileSync('git', ['add', '-f', 'new-guidance.yml'], { cwd: linked });
    assert.notDeepEqual(parity(linked), before);
    childProcess.execFileSync('git', ['update-index', '--split-index'], { cwd: linked });
    // Native ls-files refreshes split-index times on each read. Compare stable
    // facts across readers and each result's times against its own actual FS.
    const originalSplit = originalIndexIdentity(linked);
    assert.deepEqual(
      originalSplit.sharedIndexes.map((entry) => observeFileIdentity(entry.realPath)),
      originalSplit.sharedIndexes
    );
    const split = observeGitIndexIdentity(linked);
    assert.deepEqual(
      split.sharedIndexes.map((entry) => observeFileIdentity(entry.realPath)),
      split.sharedIndexes
    );
    const stableFacts = (value) => ({
      ...value,
      sharedIndexes: value.sharedIndexes.map(({ mtimeNs, ctimeNs, ...stable }) => {
        assert.equal(typeof mtimeNs, 'string');
        assert.equal(typeof ctimeNs, 'string');
        return stable;
      }),
    });
    assert.deepEqual(stableFacts(split), stableFacts(originalSplit));
    const shared = readdirSync(split.gitDir).find((name) => name.startsWith('sharedindex.'));
    assert.ok(shared);
    const changed = new Date(Date.now() + 5000);
    utimesSync(path.join(split.gitDir, shared), changed, changed);
    assert.notDeepEqual(observeGitIndexIdentity(linked), split);
  } finally {
    if (existsSync(linked))
      childProcess.execFileSync('git', ['worktree', 'remove', '--force', linked], { cwd: root });
    rmSync(root, { recursive: true, force: true });
  }
});

test('native index identity preserves absent repository and directory index fallback facts', () => {
  const root = mkdtempProjectIsolated('guidance-index-path-fallback-');
  try {
    const directoryIndex = path.join(root, 'directory.index');
    mkdirSync(directoryIndex);
    const directoryResult = parity(root, { gitIndexFile: directoryIndex });
    assert.equal(directoryResult.decision, 'hash-and-recheck-tracking');
    assert.equal(directoryResult.indexPath, directoryIndex);
    rmSync(path.join(root, '.git'), { recursive: true, force: true });
    // A missing marker discovers the containing real repository; an invalid
    // marker stops native discovery without altering environment or Git results.
    parity(root);
    writeFileSync(path.join(root, '.git'), 'not a gitdir file\n');
    assert.deepEqual(parity(root), { decision: 'hash-and-recheck-tracking' });
    assert.deepEqual(parity(path.join(root, 'absent')), {
      decision: 'hash-and-recheck-tracking',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
