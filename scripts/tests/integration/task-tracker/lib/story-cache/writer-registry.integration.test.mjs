// @story #2039 #2056
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRuntimeRootFixture } from '../../../../helpers/runtime-root-fixture.mjs';
import * as writer from '../../../../../task-tracker/lib/story-cache/writer-claim.mjs';
import * as registryApi from '../../../../../task-tracker/lib/story-cache/writer-registry.mjs';
import * as fleet from '../../../../../task-tracker/fleet-registry.mjs';
import { storyCachePath } from '../../../../../task-tracker/lib/story-cache/store.mjs';
const identity = {
  host: 'github.com',
  repository: 'owner/repo',
  issueNumber: 2056,
  issueNodeId: 'I_test',
  projectId: 'P_test',
  projectItemId: 'PI_test',
};
async function fixture(t) {
  const worktree = fs.realpathSync(createRuntimeRootFixture('writer-registry-'));
  t.after(() => fs.rmSync(worktree, { recursive: true, force: true }));
  const registry = writer.openStoryWriterRegistry({ projectRoot: worktree });
  const claim = await writer.acquireStoryWriter({
    identity,
    human: 'tester',
    sessionId: 'author-A',
    worktree,
    cachePath: storyCachePath({ projectRoot: worktree, identity }),
    assignment: ['tester'],
    registry,
  });
  return { worktree, registry, claim };
}
function resolve(f, subject = identity) {
  return registryApi.resolveStoryWriter({ identity: subject, registry: f.registry });
}
function register(f, claim = f.claim) {
  return registryApi.registerStoryWriter({ claim, registry: f.registry });
}
const refuses = (fn) => assert.throws(fn, { code: 'STORY_WRITER_UNAVAILABLE' });
test('register and resolve return one immutable acquired pointer without copying story bytes', async (t) => {
  const f = await fixture(t);
  fs.writeFileSync(
    path.join(f.claim.cachePath, 'unpublished.txt'),
    'private unpublished story bytes'
  );
  const file = path.join(f.registry.path, f.claim.registryKey + '.json');
  const before = fs.readFileSync(file);
  assert.deepEqual(register(f), f.claim);
  const result = resolve(f);
  assert.deepEqual(result, f.claim);
  assert.equal(Object.isFrozen(result), true);
  assert.throws(() => {
    result.sessionId = 'other';
  }, TypeError);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(before.includes(Buffer.from('private unpublished story bytes')), false);
  assert.deepEqual(fs.readdirSync(f.registry.path), [f.claim.registryKey + '.json']);
  assert.deepEqual(fleet.resolveStoryWriter({ identity, registry: f.registry }), f.claim);
  assert.deepEqual(fleet.registerStoryWriter({ claim: f.claim, registry: f.registry }), f.claim);
});
for (const override of [
  { sessionId: 'author-B' },
  { human: 'other' },
  { claimId: 'different' },
  { cachePath: '/elsewhere' },
  { identityKey: 'f'.repeat(64) },
])
  test(`registration cannot replace persistent owner ${JSON.stringify(override)}`, async (t) => {
    const f = await fixture(t);
    const before = fs.readFileSync(path.join(f.registry.path, f.claim.registryKey + '.json'));
    assert.throws(() => register(f, { ...f.claim, ...override }));
    assert.deepEqual(
      fs.readFileSync(path.join(f.registry.path, f.claim.registryKey + '.json')),
      before
    );
    assert.deepEqual(resolve(f), f.claim);
  });
for (const field of ['issueNodeId', 'projectId', 'projectItemId', 'repository', 'host'])
  test(`native identity mismatch refuses ${field}`, async (t) => {
    const f = await fixture(t);
    refuses(() =>
      resolve(f, {
        ...identity,
        [field]:
          field === 'host' ? 'elsewhere.com' : field === 'repository' ? 'other/repo' : 'changed',
      })
    );
  });
for (const target of [
  'claim',
  'presence',
  'namespace',
  'identity',
  'cache',
  'payloads',
  'generations',
  'manifests',
])
  test(`missing ${target} refuses without recreating evidence`, async (t) => {
    const f = await fixture(t);
    const locations = {
      claim: path.join(f.registry.path, f.claim.registryKey + '.json'),
      presence: path.join(
        path.dirname(f.registry.path),
        'story-writer-' + f.claim.registryKey + '.presence.json'
      ),
      namespace: f.registry.path,
      identity: f.registry.identityPath,
      cache: f.claim.cachePath,
      payloads: path.join(f.claim.cachePath, 'payloads'),
      generations: path.join(f.claim.cachePath, 'generations'),
      manifests: path.join(f.claim.cachePath, 'manifests'),
    };
    const location = locations[target];
    fs.rmSync(location, { recursive: true });
    refuses(() => resolve(f));
    refuses(() => register(f));
    assert.equal(fs.existsSync(location), false);
  });
for (const mutation of [
  'json',
  'duplicate-key',
  'unknown-content',
  'host',
  'identity',
  'path',
  'claim-presence',
  'hardlink',
  'symlink',
])
  test(`corrupt or ambiguous reference refuses ${mutation}`, async (t) => {
    const f = await fixture(t);
    const file = path.join(f.registry.path, f.claim.registryKey + '.json');
    const raw = fs.readFileSync(file, 'utf8');
    const record = JSON.parse(raw);
    if (mutation === 'json') fs.writeFileSync(file, '{bad');
    if (mutation === 'duplicate-key')
      fs.writeFileSync(file, raw.trim().replace(/}$/, ',"host":"' + record.host + '"}'));
    if (mutation === 'unknown-content') {
      record.body = 'private';
      fs.writeFileSync(file, JSON.stringify(record));
    }
    if (mutation === 'host') {
      record.host = 'other-host';
      fs.writeFileSync(file, JSON.stringify(record));
    }
    if (mutation === 'identity') {
      record.identity.projectItemId = 'other';
      fs.writeFileSync(file, JSON.stringify(record));
    }
    if (mutation === 'path') {
      record.claim.cachePath = path.join(f.worktree, '.tmp', 'gh', 'other');
      fs.writeFileSync(file, JSON.stringify(record));
    }
    if (mutation === 'claim-presence') {
      record.claim.claimId = 'other';
      fs.writeFileSync(file, JSON.stringify(record));
    }
    if (mutation === 'hardlink') fs.linkSync(file, file + '.copy');
    if (mutation === 'symlink') {
      fs.renameSync(file, file + '.saved');
      fs.symlinkSync(file + '.saved', file);
    }
    refuses(() => resolve(f));
    refuses(() => register(f));
  });
test('cache aliases refuse without following or replacing unpublished bytes', async (t) => {
  const f = await fixture(t);
  const saved = f.claim.cachePath + '.saved';
  fs.renameSync(f.claim.cachePath, saved);
  fs.symlinkSync(saved, f.claim.cachePath);
  refuses(() => resolve(f));
  refuses(() => register(f));
  assert.equal(fs.lstatSync(f.claim.cachePath).isSymbolicLink(), true);
});
test('observational fleet pruning cannot release or duplicate persistent authority', async (t) => {
  const f = await fixture(t);
  fleet.registerTask(f.worktree, '#2056', f.worktree, 'test', 'worktree');
  const fleetPath = fleet.fleetRegistryPath(f.worktree);
  fleet.pruneFleet(fleetPath, { nowMs: Date.now() + 2 * fleet.STALE_MS_DEFAULT });
  assert.deepEqual(fleet.readFleet(fleetPath), {});
  assert.deepEqual(resolve(f), f.claim);
  assert.throws(
    () => writer.assertStoryWriter(resolve(f), { sessionId: 'author-B', worktree: f.worktree }),
    { code: 'STORY_WRITER_OWNED' }
  );
});
test('another registered worktree can locate the pointer but cannot adopt its session', async (t) => {
  const f = await fixture(t);
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Tester',
      '-c',
      'user.email=tester@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'fixture',
    ],
    { cwd: f.worktree }
  );
  const other = path.join(f.worktree, 'reader');
  execFileSync('git', ['worktree', 'add', '--detach', other], { cwd: f.worktree, stdio: 'pipe' });
  const registry = writer.openStoryWriterRegistry({ projectRoot: other });
  assert.deepEqual(registryApi.resolveStoryWriter({ identity, registry }), f.claim);
  assert.deepEqual(registryApi.registerStoryWriter({ claim: f.claim, registry }), f.claim);
  assert.throws(
    () => writer.assertStoryWriter(f.claim, { sessionId: 'author-B', worktree: other }),
    { code: 'STORY_WRITER_OWNED' }
  );
  // Keep the directory and bytes but remove native worktree registration.
  execFileSync('git', ['worktree', 'remove', '--force', other], { cwd: f.worktree });
  refuses(() => registryApi.resolveStoryWriter({ identity, registry }));
});

test('registry identity with unknown authority fields refuses after opening', async (t) => {
  const f = await fixture(t);
  const anchor = JSON.parse(fs.readFileSync(f.registry.identityPath, 'utf8'));
  const entries = Object.entries({ ...anchor, body: 'duplicate authority' }).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  fs.writeFileSync(f.registry.identityPath, JSON.stringify(Object.fromEntries(entries)) + '\n');
  refuses(() => resolve(f));
  refuses(() => register(f));
});
