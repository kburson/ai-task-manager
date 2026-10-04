// @story #1857
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, cpSync } from 'node:fs';
import path from 'node:path';
import {
  createRuntimeRootFixture,
  activateRuntimeRootFixture,
} from '../../../helpers/runtime-root-fixture.mjs';
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

test('durable layout separates linked local state from main shared state without creating stores', async () => {
  const { runtimeStoragePaths } = await import('../../../../task-tracker/lib/runtime-storage.mjs');
  const linked = path.join(root, 'linked');
  const layout = runtimeStoragePaths({ projectRoot: linked, mainRoot: root });
  assert.equal(layout.localRoot, path.join(linked, '.ai-task-manager', 'runtime', 'store'));
  assert.equal(layout.sharedRoot, path.join(root, '.ai-task-manager', 'runtime', 'store'));
  assert.equal(
    layout.controlPath,
    path.join(linked, '.ai-task-manager', 'runtime', 'control.json')
  );
  assert.equal(layout.migrationRoot, path.join(root, '.ai-task-manager', 'runtime', 'migrations'));
  const { existsSync } = await import('node:fs');
  assert.equal(existsSync(layout.localRoot), false);
  assert.equal(existsSync(layout.controlPath), false);
  assert.throws(() => runtimeStoragePaths({ projectRoot: linked, mainRoot: linked }), {
    code: 'ROOT_IDENTITY_MISMATCH',
  });
});

test('uninitialized durable storage refuses without importing volatile state', async () => {
  const { assertRuntimeReadable } =
    await import('../../../../task-tracker/lib/runtime-storage.mjs');
  const linked = path.join(root, 'linked');
  const legacy = path.join(linked, '.tmp', 'aitm', 'state');
  mkdirSync(legacy, { recursive: true });
  writeFileSync(
    path.join(legacy, 'task-tracker-state.json'),
    JSON.stringify({ active: '#1857', choreMode: { active: true } })
  );
  assert.throws(() => assertRuntimeReadable({ projectRoot: linked, mainRoot: root }), {
    code: 'RUNTIME_MIGRATION_REQUIRED',
  });
});

let activated;
test.after(() => {
  if (!activated) return;
  rmSync(activated.projectRoot, { recursive: true, force: true });
  rmSync(activated.mainRoot, { recursive: true, force: true });
});
async function activatedStorageFixture() {
  if (!activated) {
    const mainRoot = createRuntimeRootFixture('1861-storage-authority-');
    const projectRoot = mainRoot + '-linked';
    execFileSync('git', [
      '-C',
      mainRoot,
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '--allow-empty',
      '-qm',
      'fixture',
    ]);
    execFileSync('git', ['-C', mainRoot, 'worktree', 'add', '--detach', projectRoot], {
      stdio: 'pipe',
    });
    await activateRuntimeRootFixture(mainRoot, [projectRoot]);
    const snapshots = [mainRoot, projectRoot].map((owner, index) => {
      const runtime = path.join(owner, '.ai-task-manager/runtime');
      const backup = path.join(mainRoot, 'storage-fixture-original-' + index);
      cpSync(runtime, backup, { recursive: true });
      return { runtime, backup };
    });
    activated = { mainRoot, projectRoot, snapshots };
  }
  for (const { runtime, backup } of activated.snapshots) {
    rmSync(runtime, { recursive: true, force: true });
    cpSync(backup, runtime, { recursive: true });
  }
  return { projectRoot: activated.projectRoot, mainRoot: activated.mainRoot };
}

test('durable reads validate real queue generations and individual authority fields', async () => {
  const storage = await import('../../../../task-tracker/lib/runtime-storage.mjs');
  const roots = await activatedStorageFixture();
  const layout = storage.runtimeStoragePaths(roots);
  const queue = path.join(layout.localRoot, 'state', 'task-tracker-queue.json');
  writeFileSync(queue, JSON.stringify({ schema: 'aitm.timing-queue/v1', items: [] }));
  assert.equal(storage.assertRuntimeReadable(roots).schema, 'aitm.runtime-control/v1');
  const state = path.join(layout.localRoot, 'state', 'task-tracker-state.json');
  writeFileSync(state, JSON.stringify({ active: '#1857', entryStartTs: 'invalid' }));
  assert.throws(() => storage.assertRuntimeReadable(roots), { code: 'RUNTIME_STATE_CORRUPT' });
  await activatedStorageFixture();
  writeFileSync(
    path.join(layout.sharedRoot, 'fleet', 'occupancy.json'),
    JSON.stringify({ 1857: { issue: 1857 } })
  );
  assert.throws(() => storage.assertRuntimeReadable(roots), { code: 'RUNTIME_STATE_CORRUPT' });
});

test('durable reads refuse corrupt control, unsupported schema and partial publication', async () => {
  const storage = await import('../../../../task-tracker/lib/runtime-storage.mjs');
  const roots = await activatedStorageFixture();
  const layout = storage.runtimeStoragePaths(roots);
  for (const [bytes, code] of [
    ['{', 'RUNTIME_CONTROL_INVALID'],
    [JSON.stringify({ schema: 'unknown' }), 'RUNTIME_CONTROL_INVALID'],
    [
      JSON.stringify({ schema: 'aitm.runtime-control/v1', status: 'publishing' }),
      'RUNTIME_TRANSACTION_INCOMPLETE',
    ],
  ]) {
    writeFileSync(layout.controlPath, bytes);
    assert.throws(() => storage.assertRuntimeReadable(roots), { code });
  }
});

test('activated stores require valid records and never recover authority from volatile bytes', async () => {
  const storage = await import('../../../../task-tracker/lib/runtime-storage.mjs');
  const roots = await activatedStorageFixture();
  const layout = storage.runtimeStoragePaths(roots);
  assert.equal(storage.assertRuntimeReadable(roots).schema, 'aitm.runtime-control/v1');
  const stateFile = path.join(layout.localRoot, 'state', 'task-tracker-state.json');
  for (const bytes of ['{', '[]', JSON.stringify({ schema: 'unknown' })]) {
    writeFileSync(stateFile, bytes);
    assert.throws(() => storage.assertRuntimeReadable(roots), { code: 'RUNTIME_STATE_CORRUPT' });
  }
  rmSync(stateFile);
  assert.throws(() => storage.assertRuntimeReadable(roots), { code: 'RUNTIME_STATE_CORRUPT' });
  await activatedStorageFixture();
  for (const volatile of ['.tmp', '.scratch']) {
    rmSync(path.join(roots.projectRoot, volatile), { recursive: true, force: true });
    mkdirSync(path.join(roots.projectRoot, volatile), { recursive: true });
    writeFileSync(
      path.join(roots.projectRoot, volatile, 'forged-state.json'),
      JSON.stringify({ active: '#999', choreMode: { active: true } })
    );
    assert.equal(storage.assertRuntimeReadable(roots).schema, 'aitm.runtime-control/v1');
  }
});

test('runtime overrides reject volatile, foreign and physical alias destinations', async () => {
  const storage = await import('../../../../task-tracker/lib/runtime-storage.mjs');
  const roots = await activatedStorageFixture();
  const layout = storage.runtimeStoragePaths(roots);
  const allowed = path.join(layout.localRoot, 'state', 'custom.json');
  assert.equal(storage.assertRuntimeOverrideSafe({ ...roots, path: allowed }), allowed);
  for (const target of [
    path.join(roots.projectRoot, '.tmp', 'state.json'),
    path.join(root, '.ai-task-manager', 'runtime', 'store', 'state', 'other.json'),
  ]) {
    assert.throws(() => storage.assertRuntimeOverrideSafe({ ...roots, path: target }), {
      code: 'RUNTIME_OVERRIDE_UNSAFE',
    });
  }
  const alias = path.join(layout.localRoot, 'alias');
  symlinkSync(path.join(roots.projectRoot, '.tmp'), alias);
  assert.throws(
    () => storage.assertRuntimeOverrideSafe({ ...roots, path: path.join(alias, 'state.json') }),
    { code: 'RUNTIME_OVERRIDE_UNSAFE' }
  );
});

test('runtime override ancestry checks repeated directory components', async () => {
  const storage = await import('../../../../task-tracker/lib/runtime-storage.mjs');
  const roots = await activatedStorageFixture();
  const layout = storage.runtimeStoragePaths(roots);
  const repeated = path.join(layout.localRoot, 'repeat');
  mkdirSync(repeated);
  symlinkSync(path.join(roots.projectRoot, '.tmp'), path.join(repeated, 'repeat'));
  assert.throws(
    () =>
      storage.assertRuntimeOverrideSafe({
        ...roots,
        path: path.join(repeated, 'repeat', 'missing.json'),
      }),
    { code: 'RUNTIME_OVERRIDE_UNSAFE' }
  );
});

test('a dangling control alias refuses before uninitialized-store classification', async () => {
  const storage = await import('../../../../task-tracker/lib/runtime-storage.mjs');
  const isolated = path.join(root, 'dangling-control-root');
  execFileSync('git', ['init', '-q', isolated]);
  const runtime = path.join(isolated, '.ai-task-manager', 'runtime');
  mkdirSync(runtime, { recursive: true });
  symlinkSync(
    path.join(isolated, '.tmp', 'missing-control.json'),
    path.join(runtime, 'control.json')
  );
  assert.throws(
    () => storage.assertRuntimeReadable({ projectRoot: isolated, mainRoot: isolated }),
    { code: 'RUNTIME_CONTROL_INVALID' }
  );
});

test('a final runtime record alias refuses even when its target exists', async () => {
  const storage = await import('../../../../task-tracker/lib/runtime-storage.mjs');
  const roots = await activatedStorageFixture();
  const layout = storage.runtimeStoragePaths(roots);
  const file = path.join(layout.localRoot, 'state', 'task-tracker-state.json');
  rmSync(file);
  symlinkSync(path.join(roots.projectRoot, '.tmp', 'forged-state.json'), file);
  assert.throws(() => storage.assertRuntimeReadable(roots), { code: 'RUNTIME_STATE_CORRUPT' });
});
