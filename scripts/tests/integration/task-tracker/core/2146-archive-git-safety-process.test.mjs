// @story #2146
// cspell:words hookspath
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  requirePhysicalDirectory,
  sha,
} from '../../../../research/2146-native-recovery/archive.mjs';
import {
  allocateValidationRoot,
  assertGitEnvironment,
  assertSafeConfig,
  assertSafeGit,
  configRows,
} from '../../../../research/2146-native-recovery/reconstruct.mjs';

const carrier = process.cwd();
const canonical =
  '[filter "lfs"]\nclean = git-lfs clean -- %f\nsmudge = git-lfs smudge -- %f\nprocess = git-lfs filter-process\nrequired = true\n';
const configuration = ['config', '--null', '--list', '--show-scope', '--includes'];
const defaultGit = (args) =>
  execFileSync('git', ['--no-pager', '--no-optional-locks', ...args], {
    cwd: carrier,
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const snapshot = () => ({
  head: defaultGit(['rev-parse', 'HEAD']).trim(),
  index: sha(readFileSync(defaultGit(['rev-parse', '--git-path', 'index']).trim())),
  refs: sha(defaultGit(['show-ref'])),
  reflog: sha(readFileSync(defaultGit(['rev-parse', '--git-path', 'logs/HEAD']).trim())),
});

async function fixture(t, { seed = false } = {}) {
  const parentEnv = { ...process.env };
  const before = snapshot();
  const allocation = await allocateValidationRoot(carrier);
  const { ownedRoot, sourceRoot, templateRoot } = allocation;
  const system = path.join(ownedRoot, 'system-config');
  const bin = path.join(ownedRoot, 'marker-bin');
  const marker = path.join(bin, 'git-lfs.invoked');
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, 'git-lfs'),
    '#!/bin/sh\nprintf "owned-lfs-helper\\n" > "$0.invoked"\nexit 83\n',
    { flag: 'wx', mode: 0o700 }
  );
  writeFileSync(system, seed ? '' : canonical, { flag: 'wx' });
  const env = {
    ...parentEnv,
    GIT_CONFIG_SYSTEM: system,
    GIT_EXEC_PATH: bin,
    PATH: bin + path.delimiter + (parentEnv.PATH ?? ''),
  };
  assert.deepEqual(
    Object.keys(env)
      .filter((key) => env[key] !== parentEnv[key])
      .sort(),
    ['GIT_CONFIG_SYSTEM', 'GIT_EXEC_PATH', 'PATH']
  );
  assert.deepEqual(readdirSync(bin), ['git-lfs']);
  for (const name of ['GIT_CONFIG_SYSTEM', 'GIT_EXEC_PATH', 'GIT_ATTR_SOURCE'])
    assert.throws(() => assertGitEnvironment({ [name]: 'fixture-only' }), {
      message: 'reconstruct:git-environment:' + name,
    });
  const commands = [];
  const run = (cwd, args, input) => {
    const result = spawnSync('git', ['--no-pager', '--no-optional-locks', ...args], {
      cwd,
      env,
      input,
      timeout: 10000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    commands.push({ cwd, args, status: result.status });
    return result;
  };
  const reader = (cwd) => (args, input) => {
    const result = run(cwd, args, input);
    assert.equal(result.status, 0, 'owned Git fixture command failed: ' + args[0]);
    return result.stdout;
  };
  // Actual outer root proof before init; no nested-root inference.
  assertSafeGit(reader(carrier), carrier, { carrier: true });
  mkdirSync(sourceRoot);
  const git = reader(sourceRoot);
  git(['init', '--quiet', '--template=' + templateRoot]);
  const observed = configRows(String(git(configuration)));
  if (seed) {
    assert.equal(
      observed.some((row) => row.key.toLowerCase().startsWith('filter.')),
      false
    );
    assertSafeConfig(observed);
  } else {
    assert.equal(
      observed.filter((row) => row.scope === 'system' && row.key.startsWith('filter.lfs.')).length,
      4
    );
  }
  const write = (name, value) => writeFileSync(path.join(sourceRoot, name), value);
  const guard = (options, cwd = sourceRoot) => assertSafeGit(reader(cwd), cwd, options);
  const commit = () => {
    guard({ operation: 'stage' });
    git(['add', '--all']);
    guard({ operation: 'stage' });
    git([
      '-c',
      'user.name=Archive validation fixture',
      '-c',
      'user.email=archive-fixture@example.invalid',
      'commit',
      '--quiet',
      '--no-gpg-sign',
      '-m',
      'Owned LFS safety fixture',
    ]);
    return String(git(['rev-parse', 'HEAD'])).trim();
  };
  const clone = () => {
    guard();
    const destination = path.join(ownedRoot, 'destination');
    assert.equal(existsSync(destination), false);
    reader(ownedRoot)([
      'clone',
      '--shared',
      '--no-checkout',
      '--template=' + templateRoot,
      '--',
      sourceRoot,
      destination,
    ]);
    assert.equal(requirePhysicalDirectory(destination), destination);
    requirePhysicalDirectory(path.join(destination, '.git'));
    assert.deepEqual(readdirSync(destination), ['.git']);
    return destination;
  };
  const finish = (caseName, invoked = false) => {
    assert.deepEqual({ ...process.env }, parentEnv);
    const after = snapshot();
    assert.deepEqual(after, before);
    assert.equal(existsSync(marker), invoked);
    if (invoked) assert.equal(readFileSync(marker, 'utf8'), 'owned-lfs-helper\n');
    t.diagnostic(
      JSON.stringify({
        caseName,
        seam: 'child-only owned GIT_CONFIG_SYSTEM/GIT_EXEC_PATH/PATH; actual Git; no replacement Git',
        ownedRoot,
        gitVersion: String(git(['--version'])).trim(),
        markerInvoked: invoked,
        before,
        after,
        commands,
      })
    );
    rmSync(ownedRoot, { recursive: true });
  };
  t.diagnostic('Owned fixture retained unless every assertion passes: ' + ownedRoot);
  return {
    ownedRoot,
    sourceRoot,
    system,
    marker,
    git,
    run,
    reader,
    write,
    guard,
    commit,
    clone,
    finish,
    commands,
  };
}

test('actual Git admits dormant system LFS through guarded add, commit, touched status and no-checkout reconstruction', async (t) => {
  const f = await fixture(t);
  f.write('sample.txt', 'ordinary fixture bytes\n');
  const commit = f.commit();
  const file = path.join(f.sourceRoot, 'sample.txt');
  const stats = statSync(file);
  utimesSync(file, stats.atime, new Date(stats.mtimeMs - 60000));
  f.guard();
  assert.equal(String(f.git(['status', '--porcelain', '--untracked-files=all'])), '');
  const destination = f.clone();
  f.guard({ operation: 'checkout', tree: commit }, destination);
  const git = f.reader(destination);
  git(['update-ref', '--no-deref', 'HEAD', commit]);
  git(['read-tree', '--reset', '-u', commit]);
  f.guard({}, destination);
  assert.equal(String(git(['status', '--porcelain', '--untracked-files=all'])), '');
  assert.equal(
    readFileSync(path.join(destination, 'sample.txt'), 'utf8'),
    'ordinary fixture bytes\n'
  );
  f.finish('dormant positive');
});

for (const source of [
  'working',
  'cached',
  'info',
  'global-file',
  'macro',
  'tree',
  'new-untracked',
]) {
  test(`actual Git refuses effective ${source} filter before the next content command`, async (t) => {
    const f = await fixture(t, { seed: true });
    f.write('sample.txt', 'negative fixture bytes\n');
    if (['cached', 'tree'].includes(source)) f.write('.gitattributes', 'sample.txt filter=lfs\n');
    const commit = f.commit();
    const destination = source === 'tree' ? f.clone() : undefined;
    if (source === 'cached') rmSync(path.join(f.sourceRoot, '.gitattributes'));
    if (source === 'working') f.write('.gitattributes', 'sample.txt filter=lfs\n');
    if (source === 'info') {
      mkdirSync(path.join(f.sourceRoot, '.git/info'), { recursive: true });
      f.write('.git/info/attributes', 'sample.txt filter=lfs\n');
    }
    if (source === 'global-file') {
      const attributes = path.join(f.ownedRoot, 'global-attributes');
      writeFileSync(attributes, 'sample.txt filter=lfs\n');
      f.git(['config', 'core.attributesFile', attributes]);
    }
    if (source === 'macro') f.write('.gitattributes', '[attr]owned filter=lfs\nsample.txt owned\n');
    if (source === 'new-untracked') {
      f.write('.gitattributes', 'new.txt filter=lfs\n');
      f.write('new.txt', 'not in the index\n');
    }
    writeFileSync(f.system, canonical);
    const start = f.commands.length;
    const options =
      source === 'tree'
        ? { operation: 'checkout', tree: commit }
        : source === 'new-untracked'
          ? { operation: 'stage' }
          : {};
    assert.throws(
      () => {
        f.guard(options, destination ?? f.sourceRoot);
        f.reader(destination ?? f.sourceRoot)(
          source === 'tree'
            ? ['read-tree', '--reset', '-u', commit]
            : source === 'new-untracked'
              ? ['add', '--all']
              : ['status', '--porcelain']
        );
      },
      { message: 'reconstruct:git-attributes:active-filter' }
    );
    assert.equal(
      f.commands
        .slice(start)
        .some((entry) => ['status', 'add', 'read-tree'].includes(entry.args[0])),
      false
    );
    f.finish('active attribute: ' + source);
  });
}

const refusals = [
  [
    'noncanonical',
    canonical.replace('required = true', 'required = 1'),
    /unsafe-setting:system:filter:filter.lfs.required/,
  ],
  [
    'custom',
    canonical.replace('git-lfs clean -- %f', 'owned-custom-helper'),
    /unsafe-setting:system:filter:filter.lfs.clean/,
  ],
  [
    'unknown',
    canonical + '[filter "other"]\nclean = owned-helper\n',
    /unsafe-setting:system:filter:redacted/,
  ],
  ['partial', canonical.replace('required = true\n', ''), /git-configuration:lfs-shape/],
  ['duplicate', canonical + '[filter "lfs"]\nrequired = true\n', /git-configuration:lfs-shape/],
  ['local', '', /unsafe-setting:local:filter:filter.lfs.clean/],
  ['hook', canonical, /unsafe-setting:local:core:core.hookspath/],
  ['attr.tree', canonical, /git-attributes:source-override/],
];
for (const [kind, config, message] of refusals) {
  test(`actual Git refuses ${kind} configuration before attributes or content`, async (t) => {
    const f = await fixture(t, { seed: true });
    f.write('sample.txt', 'configuration negative\n');
    f.commit();
    writeFileSync(f.system, config);
    if (kind === 'local') {
      for (const [key, value] of [
        ['clean', 'git-lfs clean -- %f'],
        ['smudge', 'git-lfs smudge -- %f'],
        ['process', 'git-lfs filter-process'],
        ['required', 'true'],
      ])
        f.git(['config', 'filter.lfs.' + key, value]);
    }
    if (kind === 'hook') {
      const hooks = path.join(f.ownedRoot, 'hooks');
      mkdirSync(hooks);
      writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\n: > "$0.invoked"\nexit 83\n', {
        mode: 0o700,
      });
      f.git(['config', 'core.hooksPath', hooks]);
    }
    if (kind === 'attr.tree') {
      f.git(['config', 'attr.tree', 'HEAD']);
      assert.ok(
        configRows(String(f.git(configuration))).some(
          (row) => row.key === 'attr.tree' && row.value === 'HEAD'
        )
      );
    }
    const start = f.commands.length;
    assert.throws(() => {
      f.guard({ operation: 'stage' });
      f.git(['add', '--all']);
    }, message);
    assert.deepEqual(
      f.commands.slice(start).map((entry) => entry.args[0]),
      ['config']
    );
    if (kind === 'hook')
      assert.equal(existsSync(path.join(f.ownedRoot, 'hooks/pre-commit.invoked')), false);
    f.finish('configuration: ' + kind);
  });
}

test('owned helper sensitivity control detects deliberate filter invocation through actual Git', async (t) => {
  const f = await fixture(t, { seed: true });
  f.write('sample.txt', 'owned calibration bytes\n');
  f.write('.gitattributes', 'sample.txt filter=lfs\n');
  f.commit();
  writeFileSync(f.system, canonical);
  assert.equal(existsSync(f.marker), false);
  // Explicitly authorized detector-only bypass. No -w: no Git object is written.
  const result = f.run(f.sourceRoot, ['hash-object', '--path=sample.txt', 'sample.txt']);
  assert.notEqual(result.status, null);
  assert.notEqual(result.status, 0);
  f.finish('deliberate owned helper sensitivity; not inactivity', true);
});
