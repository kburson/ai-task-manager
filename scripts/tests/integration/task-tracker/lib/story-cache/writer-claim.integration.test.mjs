// @story #2039 #2042
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRuntimeRootFixture } from '../../../../helpers/runtime-root-fixture.mjs';
import * as writer from '../../../../../task-tracker/lib/story-cache/writer-claim.mjs';
import { storyCachePath } from '../../../../../task-tracker/lib/story-cache/store.mjs';
import {
  withIssueLock,
  ISSUE_LOCK_HELD_ENV,
} from '../../../../../task-tracker/issue-mutator-lock.mjs';
const identity = {
  host: 'github.com',
  repository: 'owner/repo',
  issueNumber: 2042,
  issueNodeId: 'I_test',
  projectId: 'P_test',
  projectItemId: 'PI_test',
};
function fixture(t) {
  const worktree = fs.realpathSync(createRuntimeRootFixture('writer-claim-'));
  t.after(() => fs.rmSync(worktree, { recursive: true, force: true }));
  const registry = writer.openStoryWriterRegistry({ projectRoot: worktree });
  return {
    worktree,
    registry,
    cachePath: storyCachePath({ projectRoot: worktree, identity }),
    identity: { ...identity },
    human: 'tester',
    sessionId: 'author-A',
    assignment: ['tester'],
  };
}
const rejects = (promise, code = 'STORY_WRITER_UNAVAILABLE') => assert.rejects(promise, { code });
test('acquisition survives reopening with exactly one stable persistent claim', async (t) => {
  const f = fixture(t);
  const first = await writer.acquireStoryWriter(f);
  const reopened = writer.openStoryWriterRegistry({ projectRoot: f.worktree });
  const second = await writer.acquireStoryWriter({ ...f, registry: reopened });
  assert.deepEqual(first, second);
  assert.equal(first.status, 'owned');
  assert.equal(first.human, 'tester');
  assert.equal(first.worktree, f.worktree);
  assert.equal(fs.statSync(reopened.path).mode & 0o777, 0o700);
  const files = fs.readdirSync(reopened.path);
  assert.equal(files.length, 1);
  assert.equal(fs.statSync(path.join(reopened.path, files[0])).mode & 0o777, 0o600);
  const stored = fs.readFileSync(path.join(reopened.path, files[0]), 'utf8');
  assert.equal(stored.includes('working'), false);
  writer.assertStoryWriter(first, {
    sessionId: f.sessionId,
    worktree: f.worktree,
    registry: reopened,
    assignment: ['tester'],
  });
});
test('another same-login session cannot acquire or mutate the existing claim', async (t) => {
  const f = fixture(t);
  const first = await writer.acquireStoryWriter(f);
  const before = fs
    .readdirSync(f.registry.path)
    .map((p) => fs.readFileSync(path.join(f.registry.path, p), 'utf8'));
  await rejects(writer.acquireStoryWriter({ ...f, sessionId: 'author-B' }), 'STORY_WRITER_OWNED');
  assert.deepEqual(
    fs
      .readdirSync(f.registry.path)
      .map((p) => fs.readFileSync(path.join(f.registry.path, p), 'utf8')),
    before
  );
  assert.equal(first.sessionId, 'author-A');
});
for (const assignment of [[], ['other'], ['tester', 'other'], null])
  test(`acquisition refuses live assignment ${JSON.stringify(assignment)} before cache creation`, async (t) => {
    const f = fixture(t);
    await rejects(writer.acquireStoryWriter({ ...f, assignment }), 'STORY_WRITER_ASSIGNMENT');
    assert.equal(fs.existsSync(f.cachePath), false);
    assert.deepEqual(fs.readdirSync(f.registry.path), []);
  });
test('assignment drift blocks repeated acquisition and local transition assertion', async (t) => {
  const f = fixture(t);
  const claim = await writer.acquireStoryWriter(f);
  await rejects(
    writer.acquireStoryWriter({ ...f, assignment: ['other'] }),
    'STORY_WRITER_ASSIGNMENT'
  );
  assert.throws(
    () =>
      writer.assertStoryWriter(claim, {
        sessionId: f.sessionId,
        worktree: f.worktree,
        registry: f.registry,
        assignment: [],
      }),
    { code: 'STORY_WRITER_ASSIGNMENT' }
  );
});
test('a missing shared registry capability is unavailable', async (t) => {
  const f = fixture(t);
  await rejects(writer.acquireStoryWriter({ ...f, registry: null }));
  await rejects(writer.acquireStoryWriter({ ...f, registry: { ...f.registry } }));
});
test('corrupt existing claim is preserved and never taken over', async (t) => {
  const f = fixture(t);
  await writer.acquireStoryWriter(f);
  const file = path.join(f.registry.path, fs.readdirSync(f.registry.path)[0]);
  fs.writeFileSync(file, '{bad', { mode: 0o600 });
  await rejects(writer.acquireStoryWriter(f));
  assert.equal(fs.readFileSync(file, 'utf8'), '{bad');
});
test('identity drift on the same native issue cannot create a second claim', async (t) => {
  const f = fixture(t);
  await writer.acquireStoryWriter(f);
  await rejects(
    writer.acquireStoryWriter({ ...f, identity: { ...identity, projectItemId: 'PI_changed' } })
  );
  assert.equal(fs.readdirSync(f.registry.path).length, 1);
});
test('missing owned cache refuses instead of reconstructing unpublished work', async (t) => {
  const f = fixture(t);
  await writer.acquireStoryWriter(f);
  fs.rmSync(f.cachePath, { recursive: true });
  await rejects(writer.acquireStoryWriter(f));
  assert.equal(fs.existsSync(f.cachePath), false);
});
test('an unclaimed existing cache cannot be silently adopted', async (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.cachePath, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(f.cachePath, 'pending'), 'unpublished');
  await rejects(writer.acquireStoryWriter(f));
  assert.equal(fs.readFileSync(path.join(f.cachePath, 'pending'), 'utf8'), 'unpublished');
});
test('a foreign cache path refuses without storage creation', async (t) => {
  const f = fixture(t);
  await rejects(writer.acquireStoryWriter({ ...f, cachePath: path.join(f.worktree, 'elsewhere') }));
  assert.equal(fs.existsSync(f.cachePath), false);
});
test('inherited environment lock text alone cannot grant acquisition ownership', async (t) => {
  const f = fixture(t);
  const before = process.env[ISSUE_LOCK_HELD_ENV];
  process.env[ISSUE_LOCK_HELD_ENV] = '2042';
  try {
    await rejects(writer.acquireStoryWriter(f));
  } finally {
    if (before === undefined) delete process.env[ISSUE_LOCK_HELD_ENV];
    else process.env[ISSUE_LOCK_HELD_ENV] = before;
  }
  assert.equal(fs.existsSync(f.cachePath), false);
});
test('genuine nested lock admits its own session but refuses a different nested session', async (t) => {
  const f = fixture(t);
  await withIssueLock({ issue: 2042, projDir: f.worktree, sessionId: f.sessionId }, async () => {
    await writer.acquireStoryWriter(f);
    await rejects(writer.acquireStoryWriter({ ...f, sessionId: 'author-B' }));
  });
});
test('sibling lock context cannot borrow the live holder', async (t) => {
  const f = fixture(t);
  let release;
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const held = withIssueLock(
    { issue: 2042, projDir: f.worktree, sessionId: f.sessionId },
    async () => {
      entered();
      await new Promise((resolve) => {
        release = resolve;
      });
    }
  );
  await ready;
  try {
    await rejects(writer.acquireStoryWriter(f), 'EISSUELOCKED');
  } finally {
    release();
    await held;
  }
});
test('linked worktrees share the registry and preserve the original owning worktree', async (t) => {
  const f = fixture(t);
  execFileSync('git', [
    '-C',
    f.worktree,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--allow-empty',
    '-qm',
    'fixture',
  ]);
  const other = f.worktree + '-linked';
  execFileSync('git', ['-C', f.worktree, 'worktree', 'add', '-q', '-b', 'linked', other]);
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  await writer.acquireStoryWriter(f);
  const registry = writer.openStoryWriterRegistry({ projectRoot: other });
  assert.equal(registry.path, f.registry.path);
  await rejects(
    writer.acquireStoryWriter({
      ...f,
      registry,
      worktree: other,
      cachePath: storyCachePath({ projectRoot: other, identity }),
    }),
    'STORY_WRITER_OWNED'
  );
});
test('local registry validation rejects a forged claim ID without a network read', async (t) => {
  const f = fixture(t);
  const claim = await writer.acquireStoryWriter(f);
  assert.throws(
    () =>
      writer.assertStoryWriter(
        { ...claim, claimId: 'forged' },
        { sessionId: f.sessionId, worktree: f.worktree, registry: f.registry }
      ),
    { code: 'STORY_WRITER_OWNED' }
  );
});
test('local registry validation refuses a disappeared persistent claim', async (t) => {
  const f = fixture(t);
  const claim = await writer.acquireStoryWriter(f);
  fs.unlinkSync(path.join(f.registry.path, fs.readdirSync(f.registry.path)[0]));
  assert.throws(
    () =>
      writer.assertStoryWriter(claim, {
        sessionId: f.sessionId,
        worktree: f.worktree,
        registry: f.registry,
      }),
    { code: 'STORY_WRITER_UNAVAILABLE' }
  );
});
test('host change never grants a writer automatic ownership', async (t) => {
  const f = fixture(t);
  await writer.acquireStoryWriter(f);
  const file = path.join(f.registry.path, fs.readdirSync(f.registry.path)[0]);
  const saved = JSON.parse(fs.readFileSync(file));
  saved.host = 'another-host';
  fs.writeFileSync(file, JSON.stringify(saved));
  await rejects(writer.acquireStoryWriter(f));
  assert.equal(JSON.parse(fs.readFileSync(file)).host, 'another-host');
});
test('stale process and lease metadata never permit takeover', async (t) => {
  const f = fixture(t);
  await writer.acquireStoryWriter(f);
  const file = path.join(f.registry.path, fs.readdirSync(f.registry.path)[0]);
  const saved = JSON.parse(fs.readFileSync(file));
  saved.claim.pid = -1;
  saved.claim.expiresAt = '2000-01-01';
  fs.writeFileSync(file, JSON.stringify(saved));
  await rejects(writer.acquireStoryWriter({ ...f, sessionId: 'author-B' }));
  assert.equal(JSON.parse(fs.readFileSync(file)).claim.sessionId, 'author-A');
});
test('final claim persistence failure cannot return an owning claim', async (t) => {
  const f = fixture(t);
  const broken = new Proxy(fs, {
    get(target, key) {
      if (key === 'writeFileSync')
        return (...args) => {
          if (JSON.parse(args[1]).schema === 'aitm.story-writer-registry/v1')
            throw new Error('disk unavailable');
          return target.writeFileSync(...args);
        };
      return target[key];
    },
  });
  const registry = writer.openStoryWriterRegistry({ projectRoot: f.worktree, fs: broken });
  await rejects(writer.acquireStoryWriter({ ...f, registry }));
  assert.deepEqual(fs.readdirSync(f.registry.path), []);
  assert.equal(fs.existsSync(f.cachePath), true);
  await rejects(writer.acquireStoryWriter(f));
  assert.deepEqual(fs.readdirSync(f.registry.path), []);
});
test('symbolic link registry records are refused without following or overwriting', async (t) => {
  const f = fixture(t);
  await writer.acquireStoryWriter(f);
  const file = path.join(f.registry.path, fs.readdirSync(f.registry.path)[0]);
  const target = file + '.kept';
  fs.renameSync(file, target);
  fs.symlinkSync(target, file);
  await rejects(writer.acquireStoryWriter(f));
  assert.equal(fs.lstatSync(file).isSymbolicLink(), true);
});
test('cache path symbolic link escape is refused', async (t) => {
  const f = fixture(t);
  const outside = path.join(f.worktree, 'outside');
  fs.mkdirSync(outside);
  fs.mkdirSync(path.dirname(f.cachePath), { recursive: true });
  fs.symlinkSync(outside, f.cachePath);
  await rejects(writer.acquireStoryWriter(f));
  assert.deepEqual(fs.readdirSync(outside), []);
});
test('loss of the registry namespace cannot be treated as first-time acquisition', async (t) => {
  const f = fixture(t);
  await writer.acquireStoryWriter(f);
  fs.rmSync(f.registry.path, { recursive: true });
  assert.throws(() => writer.openStoryWriterRegistry({ projectRoot: f.worktree }), {
    code: 'STORY_WRITER_UNAVAILABLE',
  });
  assert.equal(fs.existsSync(f.registry.path), false);
});
test('loss of shared registry identity refuses adoption of retained claims', async (t) => {
  const f = fixture(t);
  await writer.acquireStoryWriter(f);
  assert.equal(typeof f.registry.identityPath, 'string');
  fs.unlinkSync(f.registry.identityPath);
  assert.throws(() => writer.openStoryWriterRegistry({ projectRoot: f.worktree }), {
    code: 'STORY_WRITER_UNAVAILABLE',
  });
  assert.equal(fs.readdirSync(f.registry.path).length, 1);
});
test('an acquired claim rechecks persistent ownership even without an explicit registry argument', async (t) => {
  const f = fixture(t);
  const claim = await writer.acquireStoryWriter(f);
  fs.unlinkSync(path.join(f.registry.path, fs.readdirSync(f.registry.path)[0]));
  assert.throws(
    () => writer.assertStoryWriter(claim, { sessionId: f.sessionId, worktree: f.worktree }),
    { code: 'STORY_WRITER_UNAVAILABLE' }
  );
});
test('a fresh process reopens its exact claim and refuses another same-login session', async (t) => {
  const f = fixture(t);
  const claim = await writer.acquireStoryWriter(f);
  const moduleUrl = new URL(
    '../../../../../task-tracker/lib/story-cache/writer-claim.mjs',
    import.meta.url
  ).href;
  const program = `import * as writer from ${JSON.stringify(moduleUrl)};
const input = JSON.parse(process.argv[1]);
input.registry = writer.openStoryWriterRegistry({projectRoot: input.worktree});
try { console.log(JSON.stringify({claim: await writer.acquireStoryWriter(input)})); }
catch (error) { console.log(JSON.stringify({code:error.code})); }`;
  const input = {
    identity,
    human: f.human,
    sessionId: f.sessionId,
    worktree: f.worktree,
    cachePath: f.cachePath,
    assignment: f.assignment,
  };
  const invoke = (value) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ['--input-type=module', '-e', program, JSON.stringify(value)],
        { encoding: 'utf8' }
      )
    );
  assert.deepEqual(invoke(input).claim, claim);
  assert.deepEqual(invoke({ ...input, sessionId: 'author-B' }), { code: 'STORY_WRITER_OWNED' });
});
test('detached async descendants cannot borrow an expired native lock capability', async (t) => {
  const f = fixture(t);
  let release;
  let detached;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await withIssueLock({ issue: 2042, projDir: f.worktree, sessionId: f.sessionId }, async () => {
    detached = gate.then(() => writer.acquireStoryWriter(f));
  });
  await withIssueLock({ issue: 2042, projDir: f.worktree, sessionId: 'author-B' }, async () => {
    release();
    await rejects(detached, 'EISSUELOCKED');
  });
  assert.equal(fs.existsSync(f.cachePath), false);
});
test('acquired local assertion refuses a missing owned cache', async (t) => {
  const f = fixture(t);
  const claim = await writer.acquireStoryWriter(f);
  fs.rmSync(f.cachePath, { recursive: true });
  assert.throws(
    () =>
      writer.assertStoryWriter(claim, {
        sessionId: f.sessionId,
        worktree: f.worktree,
        assignment: ['tester'],
      }),
    { code: 'STORY_WRITER_UNAVAILABLE' }
  );
  assert.equal(fs.existsSync(f.cachePath), false);
});
test('loss of an individual claim cannot authorize takeover by another worktree', async (t) => {
  const f = fixture(t);
  await writer.acquireStoryWriter(f);
  fs.writeFileSync(path.join(f.cachePath, 'pending.fixture'), 'unpublished owner-A bytes', {
    mode: 0o600,
  });
  fs.unlinkSync(path.join(f.registry.path, fs.readdirSync(f.registry.path)[0]));
  execFileSync('git', [
    '-C',
    f.worktree,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--allow-empty',
    '-qm',
    'fixture',
  ]);
  const other = f.worktree + '-linked';
  execFileSync('git', ['-C', f.worktree, 'worktree', 'add', '-q', '-b', 'linked', other]);
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  const registry = writer.openStoryWriterRegistry({ projectRoot: other });
  const cachePath = storyCachePath({ projectRoot: other, identity });
  await rejects(
    writer.acquireStoryWriter({ ...f, sessionId: 'author-B', registry, worktree: other, cachePath })
  );
  assert.equal(fs.existsSync(cachePath), false);
  assert.equal(
    fs.readFileSync(path.join(f.cachePath, 'pending.fixture'), 'utf8'),
    'unpublished owner-A bytes'
  );
});
test('acquired local assertion refuses a cache symlink replacement', async (t) => {
  const f = fixture(t);
  const claim = await writer.acquireStoryWriter(f);
  const kept = f.cachePath + '-kept';
  fs.renameSync(f.cachePath, kept);
  const outside = path.join(f.worktree, 'outside');
  fs.mkdirSync(outside, { mode: 0o700 });
  fs.symlinkSync(outside, f.cachePath);
  assert.throws(
    () => writer.assertStoryWriter(claim, { sessionId: f.sessionId, worktree: f.worktree }),
    { code: 'STORY_WRITER_UNAVAILABLE' }
  );
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(fs.existsSync(kept), true);
});
