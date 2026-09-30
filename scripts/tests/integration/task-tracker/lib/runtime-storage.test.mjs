// @story #1857
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getProjectDir } from '../../../../task-tracker/paths.mjs';
import {
  PROJECT_ROOT_ALIASES,
  resolveRuntimeRoot,
} from '../../../../task-tracker/lib/runtime-storage.mjs';
const fixtureParent = path.resolve('.ai-task-manager/runtime/test-fixtures');
mkdirSync(fixtureParent, { recursive: true });
const root = mkdtempSync(path.join(fixtureParent, 'root-1857-'));
execFileSync('git', ['init', '-q', root]);
test.after(() => rmSync(root, { recursive: true, force: true }));
const aliases = PROJECT_ROOT_ALIASES;
test('production root aliases refuse artifact-contained forged authority before state access', () => {
  for (const directory of ['docs', '.scratch', '.tmp']) {
    const forged = path.join(root, directory, 'nested');
    mkdirSync(forged, { recursive: true });
    execFileSync('git', ['init', '-q', forged]);
    mkdirSync(path.join(forged, '.ai-task-manager/runtime/store'), { recursive: true });
    writeFileSync(
      path.join(forged, '.ai-task-manager/runtime/control.json'),
      '{"status":"active"}'
    );
    for (const alias of aliases)
      assert.throws(
        () => getProjectDir({ [alias]: forged }, root),
        { code: 'ROOT_OVERRIDE_UNSAFE' },
        alias + ' ' + directory
      );
  }
});
test('production root aliases refuse physical artifact aliases', () => {
  const target = path.join(root, '.scratch/nested');
  const aliasPath = path.join(root, 'alias');
  symlinkSync(target, aliasPath);
  for (const alias of aliases)
    assert.throws(
      () => getProjectDir({ [alias]: aliasPath }, root),
      { code: 'ROOT_OVERRIDE_UNSAFE' },
      alias
    );
});
test('same physical worktree override resolves root from a subdirectory', () => {
  const child = path.join(root, 'subdir');
  mkdirSync(child);
  for (const alias of aliases) assert.equal(getProjectDir({ [alias]: root }, child), root);
  assert.equal(getProjectDir({}, child), root);
});

test('foreign overrides require exact registered admission and conflicting aliases refuse', () => {
  const foreign = path.join(root, 'foreign');
  mkdirSync(foreign);
  execFileSync('git', ['init', '-q', foreign]);
  for (const alias of aliases) {
    assert.throws(() => resolveRuntimeRoot({ cwd: root, env: { [alias]: foreign } }), {
      code: 'ROOT_IDENTITY_MISMATCH',
    });
    const result = resolveRuntimeRoot({
      cwd: root,
      env: { [alias]: foreign },
      foreignWorktreeAdmission: ({ invoking, candidate }) =>
        invoking.projectRoot === root && candidate.projectRoot === foreign,
    });
    assert.equal(result.projectRoot, foreign);
    assert.throws(
      () =>
        resolveRuntimeRoot({
          cwd: root,
          env: { [alias]: foreign },
          foreignWorktreeAdmission: () => 'yes',
        }),
      { code: 'ROOT_IDENTITY_MISMATCH' }
    );
  }
  assert.throws(
    () =>
      resolveRuntimeRoot({
        cwd: root,
        env: { [aliases[0]]: root, [aliases[1]]: foreign },
        foreignWorktreeAdmission: () => true,
      }),
    { code: 'ROOT_IDENTITY_MISMATCH' }
  );
});
test('shadowed unsafe aliases never escape validation', () => {
  for (const alias of aliases.slice(1)) {
    assert.throws(
      () =>
        getProjectDir(
          {
            [aliases[0]]: root,
            [alias]: path.join(root, '.scratch', 'nested'),
          },
          root
        ),
      { code: 'ROOT_OVERRIDE_UNSAFE' }
    );
  }
});

test('a marker directory with only HEAD is not a Git identity', () => {
  const fake = path.join(root, 'fake-root');
  mkdirSync(path.join(fake, '.git'), { recursive: true });
  writeFileSync(path.join(fake, '.git', 'HEAD'), 'ref: refs/heads/trunk\n');
  assert.throws(() => resolveRuntimeRoot({ cwd: fake, env: {} }), {
    code: 'ROOT_IDENTITY_MISMATCH',
  });
});

test('registered foreign admission is scoped and requires a fresh linked Git worktree', async () => {
  const storage = await import('../../../../task-tracker/lib/runtime-storage.mjs');
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--allow-empty',
    '-qm',
    'fixture',
  ]);
  const linked = path.join(root, 'linked');
  execFileSync('git', ['-C', root, 'worktree', 'add', '--detach', linked, 'HEAD'], {
    stdio: 'pipe',
  });
  const request = { cwd: root, env: { [aliases[0]]: linked } };
  assert.throws(() => resolveRuntimeRoot(request), { code: 'ROOT_IDENTITY_MISMATCH' });
  const result = storage.withRegisteredForeignWorktreeAdmission(
    { allowForeignWorktree: true },
    () => resolveRuntimeRoot(request)
  );
  assert.equal(result.projectRoot, linked);
  assert.equal(result.mainRoot, root);
  assert.throws(() => resolveRuntimeRoot(request), { code: 'ROOT_IDENTITY_MISMATCH' });
  assert.throws(
    () =>
      storage.withRegisteredForeignWorktreeAdmission({ allowForeignWorktree: true }, () =>
        resolveRuntimeRoot({ cwd: root, env: { [aliases[0]]: path.join(root, 'foreign') } })
      ),
    { code: 'ROOT_IDENTITY_MISMATCH' }
  );
});

test('an unavailable unrelated registered worktree does not poison a valid root', () => {
  const stale = path.join(root, 'stale');
  execFileSync('git', ['-C', root, 'worktree', 'add', '--detach', stale, 'HEAD'], {
    stdio: 'pipe',
  });
  rmSync(stale, { recursive: true, force: true });
  const observed = resolveRuntimeRoot({ cwd: root, env: {} });
  assert.equal(observed.projectRoot, root);
  assert.ok(observed.worktreeIdentity.unavailableRoots.includes(stale));
  assert.throws(() => resolveRuntimeRoot({ cwd: root, env: { [aliases[0]]: stale } }), {
    code: 'ROOT_IDENTITY_MISMATCH',
  });
});

test('a linked checkout cannot import a main root located under artifacts', () => {
  const artifactMain = path.join(root, 'docs', 'nested');
  execFileSync('git', [
    '-C',
    artifactMain,
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--allow-empty',
    '-qm',
    'fixture',
  ]);
  const externalLinked = path.join(root, 'external-linked');
  execFileSync('git', ['-C', artifactMain, 'worktree', 'add', '--detach', externalLinked, 'HEAD'], {
    stdio: 'pipe',
  });
  assert.throws(() => resolveRuntimeRoot({ cwd: externalLinked, env: {} }), {
    code: 'ROOT_OVERRIDE_UNSAFE',
  });
});
