// @story #2054
// Pure path/input contracts; actual persistence and process probes live in integration.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  storyCachePath,
  openStoryStore,
} from '../../../../../task-tracker/lib/story-cache/store.mjs';
const identity = {
  host: 'github.com',
  repository: 'owner/repo',
  issueNumber: 2039,
  issueNodeId: 'I_test',
  projectId: 'P_test',
  projectItemId: 'PI_test',
};
const projectRoot = path.resolve('consumer');
const cache = (overrides = {}) =>
  storyCachePath({ projectRoot, identity: { ...identity, ...overrides } });
test('canonical path uses consumer root, host, repository digest and issue number', () => {
  const repositoryKey = createHash('sha256').update('owner/repo').digest('hex');
  assert.equal(cache(), path.join(projectRoot, '.tmp', 'gh', 'github.com', repositoryKey, '2039'));
});
test('host and repository casing cannot allocate duplicate cache namespaces', () =>
  assert.equal(cache({ host: 'GITHUB.COM', repository: 'OWNER/REPO' }), cache()));
test('distinct repository coordinates never collide through slash substitution', () =>
  assert.notEqual(cache({ repository: 'owner.a/repo' }), cache({ repository: 'owner/a.repo' })));
test('distinct host or issue number allocates a separate path', () => {
  assert.notEqual(cache({ host: 'enterprise.example' }), cache());
  assert.notEqual(cache({ issueNumber: 2040 }), cache());
});
test('consumer root is explicit and never defaults to the installed package', () => {
  const root = path.join(projectRoot, 'other');
  const result = storyCachePath({ projectRoot: root, identity });
  assert.ok(result.startsWith(path.join(root, '.tmp', 'gh') + path.sep));
  assert.throws(() => storyCachePath({ identity }));
});
for (const root of [undefined, null, 'relative', '.', path.join(projectRoot, '..') + path.sep, ''])
  test(`refuses invalid explicit root ${String(root)}`, () =>
    assert.throws(() => storyCachePath({ projectRoot: root, identity })));
for (const [name, value] of [
  ['host traversal', { host: '../escape' }],
  ['repository traversal', { repository: '../repo' }],
  ['repository absolute', { repository: '/repo' }],
  ['missing issue', { issueNumber: 0 }],
  ['text issue', { issueNumber: '2039' }],
  ['negative issue', { issueNumber: -1 }],
  ['missing node', { issueNodeId: '' }],
  ['missing project', { projectId: '' }],
  ['invalid item', { projectItemId: 'PI other' }],
])
  test(`refuses ${name}`, () => assert.throws(() => cache(value)));
test('redirected physical root refuses before native discovery or persistence', async () => {
  let calls = 0;
  await assert.rejects(
    openStoryStore({
      projectRoot,
      identity,
      fs: {
        realpath: async (requested) => {
          calls++;
          assert.equal(requested, projectRoot);
          return path.join(projectRoot, 'redirected');
        },
      },
    }),
    { code: 'STORY_STORE_UNAVAILABLE' }
  );
  assert.equal(calls, 1);
});
test('root I/O failure is a typed refusal without implicit hydration', async () => {
  await assert.rejects(
    openStoryStore({
      projectRoot,
      identity,
      fs: {
        realpath: async () => {
          throw new Error('unavailable');
        },
      },
    }),
    { code: 'STORY_STORE_UNAVAILABLE' }
  );
});
