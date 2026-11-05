// @story #2146
import assert from 'node:assert/strict';
import childProcess, { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { test, mock } from 'node:test';
import {
  assertGitEnvironment,
  assertSafeConfig,
  allocateValidationRoot,
  reconstructHistoricalSource,
} from '../../../../research/2146-native-recovery/reconstruct.mjs';

const carrier = process.cwd();
const git = (args) =>
  execFileSync('git', ['--no-pager', ...args], { cwd: carrier, encoding: 'utf8', timeout: 10000 });
const identity = () => ({
  head: git(['rev-parse', 'HEAD']),
  index: readFileSync(git(['rev-parse', '--git-path', 'index']).trim()),
  refs: git(['show-ref']),
});
const ciIdentity = Object.freeze({
  GIT_AUTHOR_NAME: 'kendrick burson',
  GIT_AUTHOR_EMAIL: 'kpburson@pm.me',
  GIT_COMMITTER_NAME: 'kendrick burson',
  GIT_COMMITTER_EMAIL: 'kpburson@pm.me',
});

for (const [name, value] of Object.entries(ciIdentity)) {
  test(`admits unchanged inherited ${name} metadata`, () => {
    const env = Object.freeze({ [name]: value });
    assert.doesNotThrow(() => assertGitEnvironment(env));
    assert.deepEqual(env, { [name]: value });
  });
}
test('admits all four identity names without rewriting metadata values', () => {
  const env = Object.freeze({ ...ciIdentity, GIT_AUTHOR_NAME: 'name with spaces ; literal text' });
  const before = { ...env };
  assert.doesNotThrow(() => assertGitEnvironment(env));
  assert.deepEqual(env, before);
});

// These negatives catch environment/configuration redirection before Git can act.
for (const name of [
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_CONFIG_COUNT',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PAGER',
  'GIT_WORK_TREE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_PARAMETERS',
  'GIT_TEMPLATE_DIR',
  'GIT_SSH_COMMAND',
  'GIT_EXTERNAL_DIFF',
  'GIT_TRACE',
  'GIT_AUTHOR_DATE',
  'GIT_COMMITTER_DATE',
  'GIT_AUTHOR_NAME_EXTRA',
  'GIT_AUTHOR_name',
]) {
  test(`rejects inherited ${name} before any subprocess`, () => {
    for (const admitted of [{}, ciIdentity]) {
      assert.throws(() => assertGitEnvironment({ ...admitted, [name]: 'unexpected' }), {
        message: 'reconstruct:git-environment:' + name,
      });
    }
  });
}
test('allocator refuses a control variable after metadata before helpers, Git or allocation', async () => {
  const beforeEnv = { ...process.env };
  const fixtureParent = path.join(carrier, '.ai-task-manager/runtime/test-fixtures/2146-archive');
  const entries = () => (existsSync(fixtureParent) ? readdirSync(fixtureParent).sort() : []);
  const beforeEntries = entries();
  let helpers = 0,
    calls = 0;
  const childEnv = { ...beforeEnv };
  for (const [name, value] of Object.entries(ciIdentity)) {
    if (!Object.hasOwn(childEnv, name)) childEnv[name] = value;
  }
  // This test process alone receives the deliberate refusal input; no Git may run.
  childEnv.GIT_DIR = 'unexpected-test-control';
  const originalEnv = process.env;
  const mocked = mock.method(childProcess, 'execFileSync', () => {
    calls++;
  });
  syncBuiltinESMExports();
  try {
    process.env = childEnv;
    await assert.rejects(
      () =>
        allocateValidationRoot(carrier, {
          resolveRoot: () => {
            helpers++;
            return carrier;
          },
        }),
      { message: 'reconstruct:git-environment:GIT_DIR' }
    );
  } finally {
    process.env = originalEnv;
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(helpers, 0);
  assert.equal(calls, 0);
  assert.deepEqual(entries(), beforeEntries);
  assert.deepEqual({ ...process.env }, beforeEnv);
});
test('allows only the exact benign Git environment values', () => {
  assert.doesNotThrow(() =>
    assertGitEnvironment({ GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' })
  );
  assert.throws(
    () => assertGitEnvironment({ GIT_OPTIONAL_LOCKS: '1' }),
    /reconstruct:git-environment/
  );
});

for (const key of [
  'core.hooksPath',
  'filter.test.smudge',
  'core.fsMonitor',
  'url.test.insteadOf',
  'core.sshCommand',
  'remote.origin.uploadPack',
  'extensions.partialClone',
  'remote.origin.promisor',
  'includeIf.gitdir:test.path',
]) {
  test(`refuses active ${key} configuration`, () => {
    assert.throws(
      () => assertSafeConfig([{ scope: 'global', key, value: 'active' }]),
      /reconstruct:git-configuration/
    );
  });
}
test('allows disabled monitoring and existing carrier-local hooks only on the read-only carrier', () => {
  assert.doesNotThrow(() =>
    assertSafeConfig([{ scope: 'global', key: 'core.fsMonitor', value: 'false' }])
  );
  assert.doesNotThrow(() =>
    assertSafeConfig([{ scope: 'local', key: 'core.hooksPath', value: 'existing-hooks' }], {
      carrier: true,
    })
  );
  assert.throws(
    () => assertSafeConfig([{ scope: 'local', key: 'core.hooksPath', value: 'existing-hooks' }]),
    /reconstruct:git-configuration/
  );
});

test('never discloses URL-subsection credentials in a configuration refusal', () => {
  const sentinel = 'SENTINEL_PRIVATE_CONFIG';
  let observed;
  try {
    assertSafeConfig([
      {
        scope: 'global',
        key: 'url.https://user:' + sentinel + '@example.invalid/.insteadOf',
        value: 'another-private-value',
      },
    ]);
  } catch (error) {
    observed = error;
  }
  assert.ok(observed);
  assert.equal(String(observed).includes(sentinel.toLowerCase()), false);
  assert.equal(String(observed).includes('another-private-value'), false);
});

test('allocates a private empty validation root with no Git call or carrier mutation', async () => {
  const before = identity();
  const mocked = mock.method(childProcess, 'execFileSync', () => {
    throw new Error('allocator invoked Git');
  });
  syncBuiltinESMExports();
  let allocation;
  try {
    allocation = await allocateValidationRoot(carrier);
  } finally {
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
  assert.ok(
    allocation.ownedRoot?.startsWith(
      path.join(carrier, '.ai-task-manager/runtime/test-fixtures/2146-archive/')
    )
  );
  assert.equal(lstatSync(allocation.ownedRoot).mode & 0o777, 0o700);
  assert.deepEqual(readdirSync(allocation.templateRoot), []);
  assert.equal(existsSync(allocation.sourceRoot), false);
  assert.deepEqual(identity(), before);
  rmSync(allocation.ownedRoot, { recursive: true });
});

test('refuses mismatched scratch-helper resolution before allocating', async () => {
  await assert.rejects(
    () => allocateValidationRoot(carrier, { resolveRoot: () => path.join(carrier, 'docs') }),
    /reconstruct:scratch-root/
  );
});

test('rejects a symlink carrier root before helper or Git execution', async () => {
  const allocation = await allocateValidationRoot(carrier);
  const link = path.join(allocation.ownedRoot, 'linked-carrier');
  symlinkSync(carrier, link, 'dir');
  await assert.rejects(() => allocateValidationRoot(link), /symlink|physical/);
  rmSync(allocation.ownedRoot, { recursive: true });
});

test('retains owned-root and sanitized subprocess diagnostics after an intentional failure', async () => {
  const allocation = await allocateValidationRoot(carrier);
  let failure;
  const mocked = mock.method(childProcess, 'execFileSync', () => {
    throw Object.assign(new Error('PRIVATE_STDERR_SENTINEL'), { status: 23 });
  });
  syncBuiltinESMExports();
  try {
    reconstructHistoricalSource(carrier, allocation);
  } catch (error) {
    failure = error;
  } finally {
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
  assert.ok(failure);
  assert.equal(failure.diagnostics?.ownedRoot, allocation.ownedRoot);
  assert.equal(failure.diagnostics.commands[0].status, 23);
  assert.deepEqual(failure.diagnostics.commands[0].args, [
    '--no-pager',
    'config',
    '--null',
    '--list',
    '--show-scope',
    '--includes',
  ]);
  const saved = readFileSync(
    path.join(allocation.ownedRoot, 'reconstruction-diagnostics.json'),
    'utf8'
  );
  assert.equal(saved.includes('PRIVATE_STDERR_SENTINEL'), false);
  assert.deepEqual(JSON.parse(saved), failure.diagnostics);
  assert.ok(existsSync(allocation.ownedRoot));
  // Only after verifying retention may this intentional-negative fixture be cleaned.
  rmSync(allocation.ownedRoot, { recursive: true });
});
