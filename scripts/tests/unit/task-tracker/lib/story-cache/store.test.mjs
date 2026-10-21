// @story #2054
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdtempProjectIsolated } from '../../../../../task-tracker/lib/scratch-dir.mjs';
import { observeContent } from '../../../../../task-tracker/lib/story-cache/native-observation.mjs';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import {
  openStoryStore,
  storyCachePath,
} from '../../../../../task-tracker/lib/story-cache/store.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const identity = {
  host: 'github.com',
  repository: 'owner/repo',
  issueNumber: 2039,
  issueNodeId: 'I_test',
  projectId: 'P_test',
  projectItemId: 'PI_test',
};
function next(n = 1, body = 'base', working = 'pending') {
  const { body: _, ...observation } = observeContent({
    identity,
    node: {
      id: 'I_test',
      lastEditedAt: null,
      includesCreatedEdit: false,
      userContentEdits: { totalCount: 0, nodes: [] },
    },
    body,
  });
  return {
    claimId: 'claim-A',
    generation: {
      schema: 'aitm.story-cache-generation/v1',
      identity: { ...identity },
      generation: n,
      publicationGeneration: 0,
      baseSnapshot: {
        identity: { ...identity },
        title: 'Title',
        titleDigest: hash('Title'),
        resources: {
          'issue:I_test': { ...structuredClone(observation), payloadPath: 'base/body.md' },
        },
        inventory: [],
        assignees: ['alice'],
        fields: [],
        fieldsDigest: hash(
          canonicalRecordJson({ canonicalizationVersion: 'aitm.canonical-json/v1', fields: [] })
        ),
        complete: true,
        coverage: { dispatches: 1, bytes: 1, measurement: 'returned-utf8-json', atomic: false },
      },
      working: {
        'issue:I_test': {
          payloadPath: 'working/body.md',
          digest: hash(working),
          kind: 'issue',
          capabilityRef: null,
        },
      },
      dirtyKeys: ['issue:I_test'],
      timing: {
        events: [],
        ingestedCursor: null,
        publishedCursor: null,
        canonicalCommentKey: null,
      },
      batch: null,
      conflicts: [],
    },
    payloads: new Map([
      ['base/body.md', body],
      ['working/body.md', working],
    ]),
  };
}
async function fixture(t) {
  const projectRoot = await fs.realpath(mkdtempProjectIsolated('story-store-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  const cachePath = storyCachePath({ projectRoot, identity });
  const store = await openStoryStore({ projectRoot, identity });
  return { projectRoot, cachePath, store };
}
const refuses = (promise) =>
  assert.rejects(promise, (error) => error.code?.startsWith('STORY_STORE_') === true);
test('hydrates, restarts, and retains exact separate baseline and dirty payloads', async (t) => {
  const f = await fixture(t);
  assert.equal(await f.store.readGeneration(), null);
  const result = await f.store.commitGeneration(next(), { expectedGeneration: null });
  assert.equal(result.generation.generation, 1);
  assert.equal(result.generation.publicationGeneration, 0);
  const restarted = await openStoryStore({ projectRoot: f.projectRoot, identity });
  const read = await restarted.readGeneration();
  assert.equal(
    read.payloads
      .get(read.generation.baseSnapshot.resources['issue:I_test'].payloadPath)
      .toString(),
    'base'
  );
  assert.equal(
    read.payloads.get(read.generation.working['issue:I_test'].payloadPath).toString(),
    'pending'
  );
  assert.deepEqual(read.generation.dirtyKeys, ['issue:I_test']);
  assert.ok(Object.isFrozen(read.generation));
});
test('generation two retains every byte of prior immutable files and its manifest', async (t) => {
  const f = await fixture(t);
  const first = await f.store.commitGeneration(next(), { expectedGeneration: null });
  const before = await fs.readFile(path.join(f.cachePath, first.manifest.payloadPath));
  const second = await f.store.commitGeneration(next(2, 'new base', 'new pending'), {
    expectedGeneration: 1,
  });
  assert.equal(second.manifest.previousGeneration, 1);
  assert.deepEqual(await fs.readFile(path.join(f.cachePath, first.manifest.payloadPath)), before);
  assert.equal(
    await fs.readFile(
      path.join(f.cachePath, first.generation.baseSnapshot.resources['issue:I_test'].payloadPath),
      'utf8'
    ),
    'base'
  );
  const retained = await fs.readdir(path.join(f.cachePath, 'manifests'));
  assert.equal(retained.length, 2);
});
test('detaches input and returns payload copies without mutating a committed generation', async (t) => {
  const f = await fixture(t);
  const input = next();
  const result = await f.store.commitGeneration(input, { expectedGeneration: null });
  input.generation.dirtyKeys.length = 0;
  input.payloads.set('base/body.md', 'changed');
  result.payloads.clear();
  const read = await f.store.readGeneration();
  assert.equal(read.generation.dirtyKeys.length, 1);
  assert.ok(read.payloads.size > 0);
});
for (const [name, edit] of [
  ['missing payload', (v) => v.payloads.delete('base/body.md')],
  ['wrong payload bytes', (v) => v.payloads.set('base/body.md', 'bad')],
  ['escaping reference', (v) => (v.generation.working['issue:I_test'].payloadPath = '../outside')],
  ['invalid UTF8', (v) => v.payloads.set('base/body.md', Buffer.from([255]))],
  ['generation skip', (v) => (v.generation.generation = 3)],
  ['wrong subject', (v) => (v.generation.identity.issueNodeId = 'I_other')],
])
  test(`refuses ${name} without creating a pointer`, async (t) => {
    const f = await fixture(t);
    const value = next();
    edit(value);
    await refuses(f.store.commitGeneration(value, { expectedGeneration: null }));
    assert.equal(await f.store.readGeneration(), null);
  });
test('expected-generation race admits one writer and never loses its successor', async (t) => {
  const f = await fixture(t);
  await f.store.commitGeneration(next(), { expectedGeneration: null });
  const second = await openStoryStore({ projectRoot: f.projectRoot, identity });
  const results = await Promise.allSettled([
    f.store.commitGeneration(next(2, 'A'), { expectedGeneration: 1 }),
    second.commitGeneration(next(2, 'B'), { expectedGeneration: 1 }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await f.store.readGeneration()).generation.generation, 2);
  await refuses(second.commitGeneration(next(2), { expectedGeneration: 1 }));
});
test('full identity mismatch cannot read an existing issue-number path', async (t) => {
  const f = await fixture(t);
  await f.store.commitGeneration(next(), { expectedGeneration: null });
  await refuses(
    openStoryStore({
      projectRoot: f.projectRoot,
      identity: { ...identity, projectItemId: 'PI_other' },
    })
  );
});
test('corrupt manifest never becomes an empty cache', async (t) => {
  const f = await fixture(t);
  await f.store.commitGeneration(next(), { expectedGeneration: null });
  await fs.writeFile(path.join(f.cachePath, 'manifest.json'), '{broken');
  await refuses(f.store.readGeneration());
});
for (const operation of ['missing', 'changed', 'symlink', 'permissions'])
  test(`refuses ${operation} referenced payload`, async (t) => {
    const f = await fixture(t);
    const result = await f.store.commitGeneration(next(), { expectedGeneration: null });
    const target = path.join(
      f.cachePath,
      result.generation.baseSnapshot.resources['issue:I_test'].payloadPath
    );
    if (operation === 'missing') await fs.unlink(target);
    if (operation === 'changed') await fs.writeFile(target, 'bad');
    if (operation === 'symlink') {
      await fs.unlink(target);
      await fs.symlink(path.join(f.projectRoot, 'package.json'), target);
    }
    if (operation === 'permissions') await fs.chmod(target, 0o644);
    await refuses(f.store.readGeneration());
  });
test('private cache directories and files are not readable by other users', async (t) => {
  const f = await fixture(t);
  const result = await f.store.commitGeneration(next(), { expectedGeneration: null });
  for (const relative of ['', 'payloads', 'generations', 'manifests'])
    assert.equal((await fs.stat(path.join(f.cachePath, relative))).mode & 0o777, 0o700);
  for (const relative of ['manifest.json', result.manifest.payloadPath, ...result.payloads.keys()])
    assert.equal((await fs.stat(path.join(f.cachePath, relative))).mode & 0o777, 0o600);
});
test('lexical path rejects traversal and never resolves into package root', () => {
  assert.throws(() => storyCachePath({ projectRoot: 'relative', identity }));
  assert.throws(() =>
    storyCachePath({ projectRoot: process.cwd(), identity: { ...identity, host: '../escape' } })
  );
  const root = path.resolve('.tmp/consumer');
  const target = storyCachePath({ projectRoot: root, identity });
  assert.ok(target.startsWith(path.join(root, '.tmp/gh') + path.sep));
  assert.ok(!target.includes('node_modules'));
});
test('rejects redirected cache ancestor and unsafe consumer root', async (t) => {
  const f = await fixture(t);
  await fs.rm(path.join(f.projectRoot, '.tmp'), { recursive: true, force: true });
  const outside = path.join(f.projectRoot, 'outside');
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(f.projectRoot, '.tmp'));
  await refuses(openStoryStore({ projectRoot: f.projectRoot, identity }));
  await refuses(openStoryStore({ projectRoot: f.cachePath, identity }));
});
test('stale crash lock refuses writes while valid reads remain available', async (t) => {
  const f = await fixture(t);
  await f.store.commitGeneration(next(), { expectedGeneration: null });
  await fs.writeFile(path.join(f.cachePath, 'write.lock'), 'crashed', { mode: 0o600 });
  await refuses(f.store.commitGeneration(next(2), { expectedGeneration: 1 }));
  assert.equal((await f.store.readGeneration()).generation.generation, 1);
});
// Inject both before and after every mutating persistence boundary observed in a real commit.
function faultFs(events, failure = null) {
  let index = 0;
  const around = async (name, call) => {
    const current = index++;
    events.push(name);
    if (failure?.index === current && failure.when === 'before')
      throw new Error('injected before ' + name);
    const value = await call();
    if (failure?.index === current && failure.when === 'after') {
      if (value?.close) await value.close();
      throw new Error('injected after ' + name);
    }
    return value;
  };
  return new Proxy(fs, {
    get(target, key) {
      if (key === 'rename' || key === 'unlink')
        return (...args) => around(String(key), () => target[key](...args));
      if (key === 'open')
        return async (...args) => {
          const handle = await ((args[1] & constants.O_CREAT) !== 0
            ? around('open-create', () => target.open(...args))
            : target.open(...args));
          return new Proxy(handle, {
            get(h, k) {
              if (k === 'writeFile' || k === 'sync')
                return (...a) => around(String(k), () => h[k](...a));
              const v = h[k];
              return typeof v === 'function' ? v.bind(h) : v;
            },
          });
        };
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
test('before/after each persistence boundary yields a complete old or new generation', async (t) => {
  const f = await fixture(t);
  await f.store.commitGeneration(next(), { expectedGeneration: null });
  const events = [];
  const traced = await openStoryStore({
    projectRoot: f.projectRoot,
    identity,
    fs: faultFs(events),
  });
  await traced.commitGeneration(next(2, 'second base', 'second pending'), {
    expectedGeneration: 1,
  });
  assert.ok(events.includes('rename'));
  assert.ok(events.includes('sync'));
  assert.ok(events.includes('writeFile'));
  t.diagnostic(`Injected ${events.length * 2} before/after persistence failures`);
  const seed = path.join(f.projectRoot, 'seed-cache');
  await fs.cp(f.cachePath, seed, { recursive: true });
  for (let index = 0; index < events.length; index++)
    for (const when of ['before', 'after']) {
      await fs.rm(f.cachePath, { recursive: true, force: true });
      await fs.cp(seed, f.cachePath, { recursive: true });
      const faulty = await openStoryStore({
        projectRoot: f.projectRoot,
        identity,
        fs: faultFs([], { index, when }),
      });
      await refuses(
        faulty.commitGeneration(next(3, 'third base', 'third pending'), { expectedGeneration: 2 })
      );
      const restarted = await openStoryStore({ projectRoot: f.projectRoot, identity });
      const read = await restarted.readGeneration();
      assert.ok([2, 3].includes(read.generation.generation), `${index} ${when}`);
      const expected = read.generation.generation === 2 ? 'second base' : 'third base';
      assert.equal(
        read.payloads
          .get(read.generation.baseSnapshot.resources['issue:I_test'].payloadPath)
          .toString(),
        expected
      );
      assert.equal(
        await fs.readFile(path.join(f.cachePath, 'payloads', hash('base') + '.txt'), 'utf8'),
        'base'
      );
    }
});

test('new cache namespace durably flushes each newly created directory entry', async (t) => {
  const projectRoot = await fs.realpath(mkdtempProjectIsolated('story-store-directory-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  const created = [];
  const flushed = [];
  const io = new Proxy(fs, {
    get(target, key) {
      if (key === 'mkdir')
        return async (...args) => {
          await fs.mkdir(...args);
          created.push(args[0]);
        };
      if (key === 'open')
        return async (...args) => {
          const handle = await fs.open(...args);
          return new Proxy(handle, {
            get(h, k) {
              if (k === 'sync')
                return async () => {
                  flushed.push(args[0]);
                  return h.sync();
                };
              const value = h[k];
              return typeof value === 'function' ? value.bind(h) : value;
            },
          });
        };
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await openStoryStore({ projectRoot, identity, fs: io });
  assert.ok(created.length >= 5);
  for (const directory of created)
    assert.ok(flushed.includes(path.dirname(directory)), `missing parent flush: ${directory}`);
});

test('reused immutable bytes are synced again before a new pointer is committed', async (t) => {
  const f = await fixture(t);
  const first = await f.store.commitGeneration(next(), { expectedGeneration: null });
  const synced = [];
  const io = new Proxy(fs, {
    get(target, key) {
      if (key === 'open')
        return async (...args) => {
          const handle = await fs.open(...args);
          return new Proxy(handle, {
            get(h, k) {
              if (k === 'sync')
                return async () => {
                  synced.push(args[0]);
                  return h.sync();
                };
              const value = h[k];
              return typeof value === 'function' ? value.bind(h) : value;
            },
          });
        };
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const store = await openStoryStore({ projectRoot: f.projectRoot, identity, fs: io });
  await store.commitGeneration(next(2), { expectedGeneration: 1 });
  for (const entry of [
    first.generation.baseSnapshot.resources['issue:I_test'],
    first.generation.working['issue:I_test'],
  ])
    assert.ok(synced.includes(path.join(f.cachePath, entry.payloadPath)));
});

test('a deleted pointer with redirected recovery inventory never becomes empty hydration', async (t) => {
  const f = await fixture(t);
  await f.store.commitGeneration(next(), { expectedGeneration: null });
  await fs.unlink(path.join(f.cachePath, 'manifest.json'));
  await fs.rm(path.join(f.cachePath, 'manifests'), { recursive: true });
  const outside = path.join(f.projectRoot, 'empty');
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(f.cachePath, 'manifests'));
  await refuses(f.store.readGeneration());
});
test('a deleted pointer and missing recovery inventory returns a typed refusal', async (t) => {
  const f = await fixture(t);
  await f.store.commitGeneration(next(), { expectedGeneration: null });
  await fs.unlink(path.join(f.cachePath, 'manifest.json'));
  await fs.rm(path.join(f.cachePath, 'manifests'), { recursive: true });
  await refuses(f.store.readGeneration());
});

test('existing namespace entries are synced before pointer publication after interrupted initialization', async (t) => {
  const f = await fixture(t);
  const events = [];
  const io = new Proxy(fs, {
    get(target, key) {
      if (key === 'rename')
        return async (...args) => {
          events.push({ kind: 'rename', target: args[1] });
          return fs.rename(...args);
        };
      if (key === 'open')
        return async (...args) => {
          const handle = await fs.open(...args);
          return new Proxy(handle, {
            get(h, k) {
              if (k === 'sync')
                return async () => {
                  events.push({ kind: 'sync', target: args[0] });
                  return h.sync();
                };
              const value = h[k];
              return typeof value === 'function' ? value.bind(h) : value;
            },
          });
        };
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const store = await openStoryStore({ projectRoot: f.projectRoot, identity, fs: io });
  await store.commitGeneration(next(), { expectedGeneration: null });
  const before = events.slice(
    0,
    events.findIndex((e) => e.kind === 'rename')
  );
  for (
    let directory = f.cachePath;
    directory.startsWith(f.projectRoot);
    directory = path.dirname(directory)
  ) {
    assert.ok(
      before.some((e) => e.kind === 'sync' && e.target === directory),
      `missing namespace sync: ${directory}`
    );
    if (directory === f.projectRoot) break;
  }
});

test('baseline comments and locally changed comment blocks survive immutable restart', async (t) => {
  const f = await fixture(t);
  const input = next();
  const { body: _, ...comment } = observeContent({
    identity,
    node: {
      id: 'C_test',
      lastEditedAt: null,
      includesCreatedEdit: false,
      userContentEdits: { totalCount: 0, nodes: [] },
    },
    body: 'foreign comment',
  });
  input.generation.baseSnapshot.resources['comment:C_test'] = {
    ...structuredClone(comment),
    payloadPath: 'base/comments/C_test.md',
  };
  input.generation.baseSnapshot.inventory = ['C_test'];
  input.generation.working['comment:C_test'] = {
    kind: 'comment',
    payloadPath: 'working/comments/C_test.md',
    digest: hash('changed comment'),
    capabilityRef: 'comment-capability',
  };
  input.generation.dirtyKeys = ['comment:C_test', 'issue:I_test'];
  input.payloads.set('base/comments/C_test.md', 'foreign comment');
  input.payloads.set('working/comments/C_test.md', 'changed comment');
  await f.store.commitGeneration(input, { expectedGeneration: null });
  const restarted = await openStoryStore({ projectRoot: f.projectRoot, identity });
  const result = await restarted.readGeneration();
  assert.equal(
    result.payloads
      .get(result.generation.baseSnapshot.resources['comment:C_test'].payloadPath)
      .toString(),
    'foreign comment'
  );
  assert.equal(
    result.payloads.get(result.generation.working['comment:C_test'].payloadPath).toString(),
    'changed comment'
  );
  assert.deepEqual(result.generation.baseSnapshot.inventory, ['C_test']);
});
