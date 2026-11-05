// @story #2146
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  assertNodeRuntime,
  inspectCarrier,
} from '../../../../research/2146-native-recovery/carrier.mjs';
import {
  allocateValidationRoot,
  assertSafeConfig,
  configRows,
} from '../../../../research/2146-native-recovery/reconstruct.mjs';
import { sha } from '../../../../research/2146-native-recovery/archive.mjs';

// Controlled Git read boundary; actual CLI/CI tests separately require real HEAD blobs.
const root = fileURLToPath(new URL('../../../../../', import.meta.url)).replace(/\/$/, '');
const code = 'scripts/research/2146-native-recovery/';
const paths = [
  'archive.mjs',
  'pack.mjs',
  'reconstruct.mjs',
  'historical-context.mjs',
  'verify-historical.mjs',
  'carrier.mjs',
  'verify.mjs',
]
  .map((p) => code + p)
  .concat([
    'docs/archive/2146-native-recovery/index.json',
    'docs/archive/2146-native-recovery/objects.json.gz',
  ]);
const head = '1234567890123456789012345678901234567890';
const readWorkingFile = (file) => {
  const relative = path.relative(root, file);
  return readFileSync(paths.includes(relative) ? file : path.join(process.cwd(), relative));
};
const inspect = (readGit) => inspectCarrier(root, { readGit, readWorkingFile });
const fixtureGit = (fixture, args) =>
  execFileSync('git', ['--no-pager', '--no-optional-locks', ...args], {
    cwd: fixture,
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const commitFixture = (fixture, templateRoot) => {
  const git = (args) => fixtureGit(fixture, args);
  // Before init Git may discover the owning carrier. Only its local hooks are
  // allowed; inherited executable configuration must already refuse here.
  assertSafeConfig(configRows(git(['config', '--null', '--list', '--show-scope', '--includes'])), {
    carrier: true,
  });
  git(['init', '--quiet', '--template=' + templateRoot]);
  // The private repository may not execute hooks or filters during setup.
  assertSafeConfig(configRows(git(['config', '--null', '--list', '--show-scope', '--includes'])));
  git(['add', '--all']);
  git([
    '-c',
    'user.name=Archive validation fixture',
    '-c',
    'user.email=archive-fixture@example.invalid',
    'commit',
    '--quiet',
    '--no-gpg-sign',
    '-m',
    'Disposable carrier preservation fixture',
  ]);
};
const reader =
  (changes = {}) =>
  (args) => {
    const key = args.join(' ');
    if (Object.hasOwn(changes, key)) return changes[key];
    if (key === 'config --null --list --show-scope --includes') return '';
    if (key === 'rev-parse --show-toplevel') return root;
    if (key === 'rev-parse HEAD') return head;
    if (key === 'status --porcelain --untracked-files=all') return '';
    if (args[0] === 'show' && args[1].startsWith(head + ':'))
      return readWorkingFile(path.join(root, args[1].slice(head.length + 1)));
    throw new Error('Unexpected Git read');
  };

test('records the carrier HEAD and digest of every declared runtime/data file', () => {
  const result = inspect(reader());
  assert.equal(result.archiveCarrierCommit, head);
  assert.equal(result.archiveCarrierClean, true);
  assert.equal(
    result.digests['docs/archive/2146-native-recovery/index.json'],
    'c67a987feba8924e7ed54fa5615a739c14a99e3eb5696ee66f447b1220e4a2b5'
  );
  for (const file of paths) assert.ok(result.digests[file]);
  assert.equal(Object.keys(result.digests).length, 42);
});
test('refuses dirty carrier state before reading committed data', () => {
  assert.throws(
    () => inspect(reader({ 'status --porcelain --untracked-files=all': ' M tracked-file' })),
    /carrier:dirty/
  );
});
test('refuses archive data that disagrees with its actual carrier blob', () => {
  assert.throws(
    () =>
      inspect(
        reader({
          ['show ' + head + ':docs/archive/2146-native-recovery/objects.json.gz']:
            Buffer.from('changed'),
        })
      ),
    /carrier:tracked-byte-drift/
  );
});
test('refuses validation executable drift independently of Git status', () => {
  assert.throws(
    () =>
      inspect(
        reader({
          ['show ' + head + ':' + code + 'verify-historical.mjs']:
            Buffer.from('changed executable'),
        })
      ),
    /carrier:tracked-byte-drift/
  );
});
test('refuses drift in an indirectly imported carrier helper', () => {
  assert.throws(
    () =>
      inspect(
        reader({
          ['show ' + head + ':scripts/task-tracker/lib/story-cache/writer-registry.mjs']:
            Buffer.from('changed helper'),
        })
      ),
    /carrier:tracked-byte-drift/
  );
});
test('refuses a parent Git root mistaken for the carrier root', () => {
  assert.throws(
    () => inspect(reader({ 'rev-parse --show-toplevel': path.dirname(root) })),
    /carrier:root/
  );
});
test('rejects external Node preload/module-path configuration and interpreter arguments', () => {
  for (const env of [
    { NODE_OPTIONS: '--require=/foreign/preload' },
    { NODE_PATH: '/foreign/modules' },
  ])
    assert.throws(() => assertNodeRuntime(env, []), /carrier:node-runtime/);
  assert.throws(() => assertNodeRuntime({}, ['--import=/foreign/preload']), /carrier:node-runtime/);
  assert.doesNotThrow(() => assertNodeRuntime({}, []));
});

// A content-clean status read must not refresh the carrier's cached file stats.
// Removing the explicit no-optional-writes flag from the real runner breaks this.
test('real carrier inspection preserves raw index bytes after tracked-file stat drift', async (t) => {
  const allocation = await allocateValidationRoot(process.cwd());
  const fixture = allocation.sourceRoot;
  mkdirSync(fixture);
  // The controlled reader supplies only the input inventory for fixture setup;
  // the preservation assertion below exercises the default Git subprocess path.
  for (const relative of Object.keys(inspect(reader()).digests)) {
    const destination = path.join(fixture, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, readWorkingFile(path.join(root, relative)), { flag: 'wx' });
  }
  commitFixture(fixture, allocation.templateRoot);
  const tracked = path.join(fixture, 'docs/archive/2146-native-recovery/index.json');
  const contentBefore = readFileSync(tracked);
  const stats = statSync(tracked);
  utimesSync(tracked, stats.atime, new Date(stats.mtimeMs - 60000));
  assert.notEqual(statSync(tracked).mtimeMs, stats.mtimeMs);
  assert.deepEqual(readFileSync(tracked), contentBefore);
  const index = path.join(fixture, '.git/index');
  const before = readFileSync(index);
  // Absence is an explicitly supported input. Restore this test worker's
  // environment afterward; the inspected runner must preserve it unchanged.
  const optionalLocks = process.env.GIT_OPTIONAL_LOCKS;
  delete process.env.GIT_OPTIONAL_LOCKS;
  let result;
  try {
    result = inspectCarrier(fixture);
    assert.equal(process.env.GIT_OPTIONAL_LOCKS, undefined);
  } finally {
    if (optionalLocks === undefined) delete process.env.GIT_OPTIONAL_LOCKS;
    else process.env.GIT_OPTIONAL_LOCKS = optionalLocks;
  }
  const after = readFileSync(index);
  const evidence = {
    ownedRoot: allocation.ownedRoot,
    carrierCommit: result.archiveCarrierCommit,
    carrierClean: result.archiveCarrierClean,
    indexBeforeSha256: sha(before),
    indexAfterSha256: sha(after),
    contentSha256: sha(contentBefore),
    indexUnchanged: before.equals(after),
  };
  writeFileSync(
    path.join(allocation.ownedRoot, 'index-preservation.json'),
    JSON.stringify(evidence, null, 2) + '\n',
    { flag: 'wx' }
  );
  t.diagnostic(JSON.stringify(evidence));
  assert.equal(result.archiveCarrierClean, true);
  assert.deepEqual(after, before, 'carrier status refreshed the raw index');
  // Failed fixtures and their exact before/after digest evidence remain intact.
  rmSync(allocation.ownedRoot, { recursive: true });
});

test('carrier fixture setup refuses active hooks before staging or committing', async (t) => {
  const allocation = await allocateValidationRoot(process.cwd());
  const fixture = allocation.sourceRoot;
  mkdirSync(fixture);
  assertSafeConfig(
    configRows(fixtureGit(fixture, ['config', '--null', '--list', '--show-scope', '--includes'])),
    { carrier: true }
  );
  fixtureGit(fixture, ['init', '--quiet', '--template=' + allocation.templateRoot]);
  const hooks = path.join(allocation.ownedRoot, 'hooks');
  mkdirSync(hooks);
  const hook = path.join(hooks, 'pre-commit');
  writeFileSync(hook, '#!/bin/sh\n: > "$0.invoked"\n', { flag: 'wx', mode: 0o700 });
  fixtureGit(fixture, ['config', 'core.hooksPath', hooks]);
  writeFileSync(path.join(fixture, 'sample.txt'), 'fixture\n', { flag: 'wx' });
  t.diagnostic(JSON.stringify({ ownedRoot: allocation.ownedRoot, marker: hook + '.invoked' }));
  assert.throws(
    () => commitFixture(fixture, allocation.templateRoot),
    /reconstruct:git-configuration/
  );
  assert.equal(existsSync(hook + '.invoked'), false);
  assert.equal(fixtureGit(fixture, ['diff', '--cached', '--name-only']), '');
  rmSync(allocation.ownedRoot, { recursive: true });
});
