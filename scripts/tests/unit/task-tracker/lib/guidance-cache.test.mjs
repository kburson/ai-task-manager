// @story #1674
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  classifyFileStat,
  observeCacheIdentity,
  observeFileIdentity,
  observeGitIndexIdentity,
} from '../../../../../guidance/cache-identity.mjs';
import { observeGuidanceSource } from '../../../../../guidance/source.mjs';
import { loadSelectedGuidance, resolveGuidanceSource } from '../../../../../guidance/source.mjs';
import { compileGuidance } from '../../../../../guidance/compile.mjs';
import { loadGuidance } from '../../../../../guidance/cache.mjs';

test('source replacement with preserved mtime changes the cache identity', () => {
  const root = mkdtempProjectIsolated('aitm-1674-identity-');
  try {
    const source = path.join(root, 'guidance.yml');
    const replacement = path.join(root, 'replacement.yml');
    writeFileSync(source, 'first\n');
    const before = observeFileIdentity(source);
    writeFileSync(replacement, 'other\n');
    const originalTime = statSync(source).mtime;
    utimesSync(replacement, originalTime, originalTime);
    renameSync(replacement, source);
    const after = observeFileIdentity(source);
    assert.equal(readFileSync(source, 'utf8'), 'other\n');
    assert.notDeepEqual(after, before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('missing inode metadata requires a content-hash fallback', () => {
  const result = classifyFileStat('/selected.yml', {
    isFile: () => true,
    dev: 1n,
    ino: undefined,
    size: 5n,
    mtimeNs: 10n,
    ctimeNs: 10n,
  });
  assert.equal(result.decision, 'hash-and-recheck-tracking');
});

test('source observation detects project override adoption without reading YAML', () => {
  const root = mkdtempProjectIsolated('aitm-1674-source-');
  try {
    execFileSync('git', ['init', '-q', root]);
    const before = observeGuidanceSource({ projectRoot: root });
    assert.equal(before.sourceType, 'package');
    assert.equal(Object.hasOwn(before, 'source'), false);
    const override = path.join(root, '.ai-task-manager', 'aitm-guidance.yml');
    mkdirSync(path.dirname(override), { recursive: true });
    writeFileSync(override, 'invalid: true\n');
    execFileSync('git', ['add', '-f', '.ai-task-manager/aitm-guidance.yml'], { cwd: root });
    const after = observeGuidanceSource({ projectRoot: root });
    assert.equal(after.sourceType, 'project');
    assert.equal(after.tracked, true);
    assert.equal(Object.hasOwn(after, 'source'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an explicitly selected Git index cannot reuse the default index identity', () => {
  const root = mkdtempProjectIsolated('aitm-1674-index-');
  try {
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(path.join(root, 'guidance.yml'), 'first\n');
    execFileSync('git', ['add', '-f', 'guidance.yml'], { cwd: root });
    const regular = observeGitIndexIdentity(root);
    const selectedIndex = path.join(root, 'selected.index');
    execFileSync('git', ['read-tree', '--empty'], {
      cwd: root,
      env: { ...process.env, GIT_INDEX_FILE: selectedIndex },
    });
    const alternate = observeGitIndexIdentity(root, { gitIndexFile: selectedIndex });
    assert.equal(regular.decision, 'stat');
    assert.equal(alternate.decision, 'stat');
    assert.notDeepEqual(alternate, regular);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a split-index shared file change invalidates the worktree index identity', () => {
  const root = mkdtempProjectIsolated('aitm-1674-split-index-');
  try {
    execFileSync('git', ['update-index', '--split-index'], { cwd: root });
    const gitDir = path.resolve(
      root,
      execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8' }).trim()
    );
    const shared = readdirSync(gitDir).find((name) => name.startsWith('sharedindex.'));
    assert.ok(shared, 'Git must create the split-index dependency');
    const before = observeGitIndexIdentity(root);
    const sharedPath = path.join(gitDir, shared);
    const changed = new Date(Date.now() + 5000);
    utimesSync(sharedPath, changed, changed);
    const after = observeGitIndexIdentity(root);
    assert.notDeepEqual(after, before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('candidate validation identity never equals active-project validation identity', () => {
  const root = mkdtempProjectIsolated('aitm-1674-profile-');
  try {
    execFileSync('git', ['init', '-q', root]);
    const selected = observeGuidanceSource({ projectRoot: root });
    const active = observeCacheIdentity({ selected, projectRoot: root, profile: 'active-project' });
    const candidatePath = path.join(root, 'candidate.yml');
    writeFileSync(candidatePath, 'invalid: true\n');
    const candidate = observeCacheIdentity({
      selected,
      projectRoot: root,
      profile: 'candidate',
      candidatePath,
    });
    assert.notEqual(active.decision, 'indeterminate');
    assert.notEqual(candidate.decision, 'indeterminate');
    assert.notDeepEqual(active, candidate);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runtime and published-digest changes invalidate an otherwise identical source', () => {
  const root = mkdtempProjectIsolated('aitm-1674-runtime-');
  try {
    const selected = observeGuidanceSource({ projectRoot: root });
    const options = { selected, projectRoot: root, profile: 'published' };
    const before = observeCacheIdentity(options);
    const changedVersion = observeCacheIdentity({
      ...options,
      selected: { ...selected, packageVersion: 'changed-version' },
    });
    const changedDigest = observeCacheIdentity({
      ...options,
      selected: { ...selected, publishedCatalogFileDigest: 'sha256:changed' },
    });
    assert.notEqual(before.decision, 'indeterminate');
    assert.notDeepEqual(changedVersion.identity, before.identity);
    assert.notDeepEqual(changedDigest.identity, before.identity);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('valid compilation makes a direct agent index without human prose', () => {
  const root = mkdtempProjectIsolated('aitm-1674-compile-');
  try {
    const validation = loadSelectedGuidance(resolveGuidanceSource({ projectRoot: root }));
    assert.equal(validation.valid, true);
    const compiled = compileGuidance(validation);
    assert.deepEqual(compiled, compileGuidance(validation));
    assert.ok(compiled.agentIndex.byId['action.bind']);
    assert.equal(Object.hasOwn(compiled.agentIndex.byId['action.bind'], 'human'), false);
    assert.equal(JSON.stringify(compiled.agentIndex).includes('explanation'), false);
    assert.equal(typeof compiled.humanCatalog.byId['action.bind'].explanation, 'string');
    assert.equal(compiled.diagnostics, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a candidate path cannot reuse active package validation', () => {
  const root = mkdtempProjectIsolated('aitm-1674-candidate-');
  try {
    const candidatePath = path.join(root, 'candidate.yml');
    writeFileSync(candidatePath, 'schema: invalid\n');
    const candidate = loadGuidance({
      projectRoot: root,
      profile: 'candidate',
      candidatePath,
      need: 'diagnostics',
    });
    assert.equal(candidate.valid, false);
    assert.ok(candidate.errors.length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
