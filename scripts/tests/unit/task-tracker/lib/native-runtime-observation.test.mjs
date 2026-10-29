// @story #2088
// @story #2106
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  inspectRuntimePath,
  predictRuntimeEntrypoint,
  observeRuntimeProvenance,
} from '../../../../task-tracker/lib/native-runtime-observation.mjs';

const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const entry = 'scripts/task-tracker/activity-guard.mjs';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(projectScratchDir('test'), 'runtime-observation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relative, bytes = 'abc') => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return file;
  };
  return { root, write };
}

test('runtime file observation hashes actual contained bytes and notices changes', (t) => {
  const { root, write } = fixture(t),
    file = write('entry.mjs');
  const before = inspectRuntimePath({ projectRoot: root, candidate: 'entry.mjs' });
  assert.equal(before.status, 'present');
  assert.equal(before.kind, 'file');
  assert.equal(before.resolvedPath, file);
  assert.equal(before.sha256, abc);
  fs.writeFileSync(file, 'changed');
  assert.notEqual(inspectRuntimePath({ projectRoot: root, candidate: file }).sha256, abc);
});

test('contained package links expose their actual in-project target', (t) => {
  const { root, write } = fixture(t),
    actual = write('retained/package/entry.mjs');
  fs.symlinkSync('retained/package', path.join(root, 'selected'), 'dir');
  const observed = inspectRuntimePath({ projectRoot: root, candidate: 'selected/entry.mjs' });
  assert.equal(observed.status, 'present');
  assert.equal(observed.resolvedPath, actual);
  assert.equal(observed.sha256, abc);
  assert.deepEqual(observed.links, [
    { path: path.join(root, 'selected'), target: 'retained/package' },
  ]);
});

test('outside candidates and escaping links refuse before inspecting the target', (t) => {
  const { root } = fixture(t);
  const outside = '/aitm-nonexistent-outside-observation/never-read.mjs';
  assert.equal(
    inspectRuntimePath({ projectRoot: root, candidate: outside }).status,
    'outside-refused'
  );
  fs.symlinkSync('/aitm-nonexistent-outside-observation', path.join(root, 'escape'), 'dir');
  const observed = inspectRuntimePath({ projectRoot: root, candidate: 'escape/never-read.mjs' });
  assert.equal(observed.status, 'outside-refused');
  assert.equal(observed.sha256, null);
});

test('missing files and cyclic links stay unavailable rather than becoming evidence', (t) => {
  const { root } = fixture(t);
  assert.equal(
    inspectRuntimePath({ projectRoot: root, candidate: 'absent.mjs' }).status,
    'missing'
  );
  fs.symlinkSync('b', path.join(root, 'a'));
  fs.symlinkSync('a', path.join(root, 'b'));
  const observed = inspectRuntimePath({ projectRoot: root, candidate: 'a' });
  assert.equal(observed.status, 'unavailable');
  assert.equal(observed.reason, 'symlink-cycle');
});

test('entrypoint prediction preserves source fallback and scoped-first selection', (t) => {
  const { root, write } = fixture(t),
    fallback = write(entry);
  const source = predictRuntimeEntrypoint({ projectRoot: root, relativeEntrypoint: entry });
  assert.equal(source.selection, 'repository');
  assert.equal(source.selected.resolvedPath, fallback);
  const installed = write(`node_modules/@kburson/ai-task-manager/${entry}`);
  const scoped = predictRuntimeEntrypoint({ projectRoot: root, relativeEntrypoint: entry });
  assert.equal(scoped.selection, 'scoped-package');
  assert.equal(scoped.selected.resolvedPath, installed);
  assert.equal(scoped.evidence, 'configuration-prediction-not-execution');
});

test('a selected directory is not silently replaced by the fallback file', (t) => {
  const { root, write } = fixture(t);
  write(entry);
  fs.mkdirSync(path.join(root, 'node_modules/@kburson/ai-task-manager', entry), {
    recursive: true,
  });
  const result = predictRuntimeEntrypoint({ projectRoot: root, relativeEntrypoint: entry });
  assert.equal(result.selection, 'scoped-package');
  assert.equal(result.loadableFile, false);
  assert.equal(result.selected.kind, 'directory');
});

test('an escaping scoped candidate yields uncertainty instead of invented fallback', (t) => {
  const { root, write } = fixture(t);
  write(entry);
  fs.mkdirSync(path.join(root, 'node_modules/@kburson'), { recursive: true });
  fs.symlinkSync(
    '/aitm-nonexistent-outside-package',
    path.join(root, 'node_modules/@kburson/ai-task-manager'),
    'dir'
  );
  const result = predictRuntimeEntrypoint({ projectRoot: root, relativeEntrypoint: entry });
  assert.equal(result.selection, 'unavailable');
  assert.equal(result.selected, null);
});

test('provenance distinguishes the real helper from caller metadata and lexical argv', (t) => {
  const { root, write } = fixture(t),
    caller = write('claimed-caller.mjs');
  const result = observeRuntimeProvenance({
    projectRoot: root,
    callerModuleUrl: pathToFileURL(caller).href,
  });
  assert.ok(result.helperModule.url.endsWith('/native-runtime-observation.mjs'));
  assert.equal(result.helperModule.evidence, 'actual-helper-module-only');
  assert.equal(result.callerMetadata.url, pathToFileURL(caller).href);
  assert.equal(result.callerMetadata.evidence, 'caller-supplied-not-origin-proof');
  assert.equal(result.callerMetadata.file.sha256, abc);
  assert.equal(result.processFacts.execPath, process.execPath);
  assert.equal(result.processFacts.version, process.version);
  assert.equal(result.processFacts.executableBytes, 'unverified-trusted-toolchain');
  assert.equal(result.processFacts.argvEntrypoint, process.argv[1]);
  assert.equal(result.processFacts.argvEntrypointVerified, false);
});

test('explicit dependency candidates are file observations rather than Node resolution', (t) => {
  const { root, write } = fixture(t);
  write('node_modules/example/index.mjs');
  write('.codex/hooks.json');
  const result = observeRuntimeProvenance({
    projectRoot: root,
    dependencyCandidates: ['node_modules/example/index.mjs'],
    configPaths: ['.codex/hooks.json'],
  });
  assert.equal(result.dependencies[0].file.sha256, abc);
  assert.equal(result.dependencies[0].evidence, 'caller-listed-candidate-not-node-resolution');
  assert.equal(result.configuration[0].sha256, abc);
  assert.equal(fs.existsSync(path.join(root, '.tmp')), false);
});

test('oversized diagnostic inputs refuse without an unbounded file read', (t) => {
  const { root, write } = fixture(t),
    file = write('large.mjs', '');
  fs.truncateSync(file, 16 * 1024 * 1024 + 1);
  const result = inspectRuntimePath({ projectRoot: root, candidate: file });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'file-too-large');
  assert.equal(result.sha256, null);
});

test('non-file caller metadata stays unverified instead of becoming module evidence', (t) => {
  const { root } = fixture(t);
  const result = observeRuntimeProvenance({ projectRoot: root, callerModuleUrl: 'node:fs' });
  assert.equal(result.callerMetadata.evidence, 'caller-supplied-not-origin-proof');
  assert.equal(result.callerMetadata.file.status, 'unavailable');
  assert.equal(result.callerMetadata.file.sha256, null);
});

test('a hook process with no argv entrypoint reports explicit null metadata', (t) => {
  const { root } = fixture(t),
    original = process.argv;
  try {
    process.argv = [process.execPath];
    const result = observeRuntimeProvenance({ projectRoot: root });
    assert.equal(result.processFacts.argvEntrypoint, null);
    assert.equal(result.processFacts.argvEntrypointVerified, false);
  } finally {
    process.argv = original;
  }
});

test('raw dot traversal never hashes a lexically simplified but different file', (t) => {
  const { root, write } = fixture(t);
  write('entry.mjs');
  write('a/entry.mjs');
  write('other/entry.mjs', 'different');
  fs.mkdirSync(path.join(root, 'other/deep'));
  fs.symlinkSync('../other/deep', path.join(root, 'a/alias'), 'dir');
  for (const candidate of ['missing/../entry.mjs', './entry.mjs', 'a/alias/../entry.mjs']) {
    const result = inspectRuntimePath({ projectRoot: root, candidate });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.sha256, null);
  }
});

test('raw link-target dot traversal stays unknown rather than inventing a hash', (t) => {
  const { root, write } = fixture(t);
  write('entry.mjs');
  fs.mkdirSync(path.join(root, 'a'));
  fs.symlinkSync('missing/../entry.mjs', path.join(root, 'a/linked.mjs'));
  const result = inspectRuntimePath({ projectRoot: root, candidate: 'a/linked.mjs' });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.sha256, null);
});

test('noncanonical project roots do not silently widen the observation root', (t) => {
  const { root, write } = fixture(t);
  write('entry.mjs');
  for (const projectRoot of [`${root}/missing/..`, `${root}/.`]) {
    const result = inspectRuntimePath({ projectRoot, candidate: 'entry.mjs' });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.sha256, null);
  }
});

test('trailing candidate separators do not turn an OS directory requirement into a file hash', (t) => {
  const { root, write } = fixture(t),
    file = write('entry.mjs');
  const result = inspectRuntimePath({ projectRoot: root, candidate: `${file}${path.sep}` });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.sha256, null);
});

test('trailing link-target separators remain unsupported rather than hashing a regular file', (t) => {
  const { root, write } = fixture(t);
  write('entry.mjs');
  fs.symlinkSync('entry.mjs/', path.join(root, 'linked.mjs'));
  const result = inspectRuntimePath({ projectRoot: root, candidate: 'linked.mjs' });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.sha256, null);
});

test('path boundary checks make no attempted outside filesystem calls', (t) => {
  const { root, write } = fixture(t);
  const declared = path.join(root, 'declared');
  fs.mkdirSync(declared);
  const sentinel = write('owned-sentinel.mjs', 'never inspected');
  fs.symlinkSync(path.join(root, 'dangling-outside'), path.join(declared, 'escape'), 'dir');
  const outsideAttempts = [],
    calls = [],
    descriptors = new Map();
  const observations = [];
  try {
    for (const name of [
      'lstatSync',
      'statSync',
      'readlinkSync',
      'realpathSync',
      'existsSync',
      'openSync',
      'readFileSync',
      'readSync',
    ]) {
      const original = fs[name];
      t.mock.method(fs, name, (...args) => {
        const candidate = typeof args[0] === 'number' ? descriptors.get(args[0]) : args[0];
        calls.push({ name, candidate });
        if (typeof candidate === 'string') {
          const absolute = path.resolve(candidate);
          const relative = path.relative(declared, absolute);
          if (
            relative === '..' ||
            relative.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relative)
          ) {
            outsideAttempts.push({ name, candidate });
            throw Object.assign(new Error('outside test boundary'), {
              code: 'OUTSIDE_TEST_BOUNDARY',
            });
          }
        }
        const result = original(...args);
        if (name === 'openSync') descriptors.set(result, candidate);
        return result;
      });
    }
    observations.push(inspectRuntimePath({ projectRoot: declared, candidate: sentinel }));
    observations.push(
      inspectRuntimePath({ projectRoot: declared, candidate: 'escape/never-read.mjs' })
    );
    calls.length = 0;
    observations.push(
      inspectRuntimePath({ projectRoot: declared, candidate: 'missing/../entry.mjs' })
    );
    assert.equal(calls.length, 0, 'noncanonical candidates must refuse before filesystem access');
  } finally {
    t.mock.restoreAll();
  }
  assert.deepEqual(outsideAttempts, []);
  assert.deepEqual(
    observations.map((result) => result.status),
    ['outside-refused', 'outside-refused', 'unavailable']
  );
});
