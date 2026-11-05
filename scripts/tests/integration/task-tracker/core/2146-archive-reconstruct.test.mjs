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

// These negatives catch environment/configuration redirection before Git can act.
for (const name of [
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_CONFIG_COUNT',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PAGER',
]) {
  test(`rejects inherited ${name} before any subprocess`, () => {
    assert.throws(
      () => assertGitEnvironment({ [name]: 'unexpected' }),
      /reconstruct:git-environment/
    );
  });
}
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
