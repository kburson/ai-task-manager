// @story #2039 #2060
import assert from 'node:assert/strict';
import { test as baseTest } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createUnitRootFixture } from '../../../../helpers/unit-runtime-root.mjs';
import { withRuntimeRootAdapters } from '../../../../../task-tracker/lib/runtime-storage.mjs';
import { handoffGeneration, identity } from '../../../../helpers/story-handoff-fixture.mjs';
import {
  openStoryStore,
  storyCachePath,
} from '../../../../../task-tracker/lib/story-cache/store.mjs';
import {
  acquireStoryWriter,
  openStoryWriterRegistry,
} from '../../../../../task-tracker/lib/story-cache/writer-claim.mjs';
const adapter = await import('../../../../../task-tracker/lib/story-cache/timing-stage.mjs').catch(
  (error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  }
);
// Real durable files and locks; only Git root discovery is the explicit unit model.
function test(name, operation) {
  return baseTest(name, async (t) => {
    const root = fs.realpathSync(createUnitRootFixture('timing-stage-2060-'));
    const commonDir = path.join(root, 'fixture-common');
    fs.mkdirSync(commonDir);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    t.unitRoot = root;
    return withRuntimeRootAdapters(
      {
        realpath: (value) => fs.realpathSync(value),
        assertOutsideArtifacts: () => {},
        readIdentity: () => ({
          projectRoot: root,
          mainRoot: root,
          worktreeIdentity: { commonDir, registeredRoots: [root], unavailableRoots: [] },
        }),
      },
      () => operation(t)
    );
  });
}
async function context(sid, root, operation) {
  const previousSid = process.env.AI_TASK_MANAGER_SESSION_ID;
  const previousCwd = process.cwd();
  process.env.AI_TASK_MANAGER_SESSION_ID = sid;
  process.chdir(root);
  try {
    return await operation();
  } finally {
    process.chdir(previousCwd);
    if (previousSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
    else process.env.AI_TASK_MANAGER_SESSION_ID = previousSid;
  }
}
const event = (id = 'one', extra = {}) => ({
  eventId: id,
  actorId: 'author-A',
  transitionId: null,
  timestamp: '2026-10-19T12:00:00.000Z',
  event: 'paused',
  activeSeconds: null,
  idleSeconds: null,
  sourceCursor: `native-${id}`,
  ...extra,
});
async function fixture(t) {
  assert.equal(
    typeof adapter.ingestTimingEvents,
    'function',
    'durable timing ingestion is missing'
  );
  const root = t.unitRoot;
  const registry = openStoryWriterRegistry({ projectRoot: root });
  const claim = await acquireStoryWriter({
    identity,
    human: 'tester',
    sessionId: 'author-A',
    worktree: root,
    cachePath: storyCachePath({ projectRoot: root, identity }),
    assignment: ['tester'],
    registry,
  });
  const store = await openStoryStore({ projectRoot: root, identity });
  const initial = await handoffGeneration(claim.claimId);
  initial.generation.timing.ingestedCursor = null;
  const before = await store.commitGeneration(initial, { expectedGeneration: null });
  const ingest = (events, extra = {}) =>
    context('author-A', root, () => adapter.ingestTimingEvents({ store, claim, events, ...extra }));
  return { root, registry, claim, store, before, ingest };
}
test('durably checkpoints events and ingestion acknowledgement without publishing', async (t) => {
  const f = await fixture(t);
  const result = await f.ingest([event()]);
  assert.equal(result.status, 'ingested');
  assert.equal(result.ingestedCursor, 'native-one');
  assert.equal(result.publishedCursor, null);
  assert.equal(result.publication, 'unpublished');
  const reopened = await openStoryStore({ projectRoot: f.root, identity });
  const current = await reopened.readGeneration();
  assert.deepEqual(current.generation.timing.events, [event()]);
  assert.equal(current.generation.timing.ingestedCursor, 'native-one');
  assert.equal(current.generation.timing.events[0].activeSeconds, null);
  assert.equal(current.generation.generation, 2);
  for (const key of ['publicationGeneration', 'batch', 'baseSnapshot', 'working', 'dirtyKeys'])
    assert.deepEqual(current.generation[key], f.before.generation[key]);
  assert.equal(current.generation.timing.canonicalCommentKey, 'retained-comment-key');
});
test('restart replay is a deterministic no-op and never regresses a native cursor', async (t) => {
  const f = await fixture(t);
  const first = event();
  const second = event('two', {
    timestamp: '2026-10-19T12:01:00.000Z',
    event: 'resumed',
    activeSeconds: 12,
    idleSeconds: 3,
  });
  await f.ingest([first, second]);
  const before = await f.store.readGeneration();
  const reopened = await openStoryStore({ projectRoot: f.root, identity });
  const result = await f.ingest([second, first, second], { store: reopened });
  assert.equal(result.status, 'no-op');
  assert.equal(result.ingestedCursor, 'native-two');
  assert.deepEqual(await f.store.readGeneration(), before);
});
test('backdated delivery retains event identity and acknowledges delivery rather than timestamp order', async (t) => {
  const f = await fixture(t);
  const latest = event('latest');
  const older = event('older', {
    timestamp: '2026-10-18T12:00:00.000Z',
    actorId: 'historic-actor',
  });
  await f.ingest([latest]);
  await f.ingest([older, latest]);
  const current = await f.store.readGeneration();
  assert.deepEqual(current.generation.timing.events, [older, latest]);
  assert.equal(current.generation.timing.ingestedCursor, 'native-older');
});
test('a duplicate later in one delivery does not replace its last new cursor', async (t) => {
  const f = await fixture(t);
  const second = event('two', { timestamp: '2026-10-19T12:01:00.000Z' });
  await f.ingest([event(), second, event()]);
  assert.equal((await f.store.readGeneration()).generation.timing.ingestedCursor, 'native-two');
});
test('empty input leaves the persisted generation unchanged', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.ingest([])).status, 'no-op');
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
test('preserves an independent already-published cursor and historical actors', async (t) => {
  const f = await fixture(t);
  const old = event('old', {
    actorId: 'historic-actor',
    timestamp: '2026-10-18T00:00:00.000Z',
    activeSeconds: 0,
  });
  const next = structuredClone(f.before.generation);
  next.generation++;
  next.timing.events = [old];
  next.timing.ingestedCursor = 'native-old';
  next.timing.publishedCursor = 'native-old';
  await f.store.commitGeneration(
    { generation: next, claimId: f.claim.claimId, payloads: f.before.payloads },
    { expectedGeneration: 1 }
  );
  await f.ingest([event()]);
  const timing = (await f.store.readGeneration()).generation.timing;
  assert.deepEqual(timing.events, [old, event()]);
  assert.equal(timing.publishedCursor, 'native-old');
  assert.equal(timing.ingestedCursor, 'native-one');
});
test('failed durable commit never acknowledges or consumes the native event', async (t) => {
  const f = await fixture(t);
  const failure = Object.assign(new Error('durable persistence failed'), {
    code: 'STORY_STORE_UNAVAILABLE',
  });
  await assert.rejects(
    f.ingest([event()], {
      store: {
        ...f.store,
        commitGeneration: async () => {
          throw failure;
        },
      },
    }),
    { code: 'STORY_STORE_UNAVAILABLE' }
  );
  assert.deepEqual(await f.store.readGeneration(), f.before);
  await f.ingest([event()]);
  assert.equal((await f.store.readGeneration()).generation.timing.ingestedCursor, 'native-one');
});
test('landed commit followed by failed acknowledgement replays without another generation', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.ingest([event()], {
      store: {
        ...f.store,
        commitGeneration: async (...args) => {
          await f.store.commitGeneration(...args);
          throw new Error('crash after persistence');
        },
      },
    }),
    { code: 'STORY_TIMING_INGEST_UNAVAILABLE' }
  );
  const landed = await f.store.readGeneration();
  assert.equal(landed.generation.timing.ingestedCursor, 'native-one');
  assert.equal((await f.ingest([event()])).status, 'no-op');
  assert.deepEqual(await f.store.readGeneration(), landed);
});
test('refuses a commit readback with lost events despite the claimed generation', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.ingest([event()], { store: { ...f.store, commitGeneration: async () => f.before } }),
    { code: 'STORY_TIMING_INGEST_UNAVAILABLE' }
  );
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
test('refuses malformed and conflicting events before persistence', async (t) => {
  const f = await fixture(t);
  for (const events of [
    [event('bad', { activeSeconds: -1 })],
    [event(), event('one', { activeSeconds: 0 })],
  ])
    await assert.rejects(f.ingest(events), (error) => error.code.startsWith('STORY_TIMING_EVENT_'));
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
test('requires the persistent current session claim and exact store identity', async (t) => {
  const f = await fixture(t);
  const { registryKey: ignored, ...pureClaim } = f.claim;
  void ignored;
  await assert.rejects(f.ingest([event()], { claim: pureClaim }), {
    code: 'STORY_TIMING_INGEST_UNAVAILABLE',
    reason: 'persistent-claim',
  });
  await assert.rejects(
    context('author-B', f.root, () =>
      adapter.ingestTimingEvents({ store: f.store, claim: f.claim, events: [event()] })
    ),
    { code: 'STORY_WRITER_OWNED' }
  );
  await assert.rejects(f.ingest([event()], { store: { ...f.store, cachePath: f.root } }), {
    code: 'STORY_TIMING_INGEST_UNAVAILABLE',
    reason: 'store-identity',
  });
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
test('generation fence refuses an intervening durable writer without consuming events', async (t) => {
  const f = await fixture(t);
  const store = {
    ...f.store,
    commitGeneration: async (next, options) => {
      const other = structuredClone(f.before.generation);
      other.generation++;
      await f.store.commitGeneration(
        { generation: other, claimId: f.claim.claimId, payloads: f.before.payloads },
        { expectedGeneration: 1 }
      );
      return f.store.commitGeneration(next, options);
    },
  };
  await assert.rejects(f.ingest([event()], { store }), { code: 'STORY_STORE_UNAVAILABLE' });
  const current = await f.store.readGeneration();
  assert.deepEqual(current.generation.timing.events, []);
  assert.equal(current.generation.timing.ingestedCursor, null);
});
for (const field of ['batch', 'conflicts'])
  test(`refuses ${field} without changing frozen or publication state`, async (t) => {
    const f = await fixture(t);
    const next = structuredClone(f.before.generation);
    next.generation++;
    if (field === 'batch') {
      next.publicationGeneration = 1;
      next.batch = {
        schema: 'aitm.story-publication-batch/v1',
        publicationGeneration: 1,
        batchId: 'frozen-A',
      };
    } else next.conflicts = [{ reason: 'retained-conflict' }];
    const before = await f.store.commitGeneration(
      { generation: next, claimId: f.claim.claimId, payloads: f.before.payloads },
      { expectedGeneration: 1 }
    );
    await assert.rejects(f.ingest([event()]), {
      code: 'STORY_TIMING_INGEST_UNAVAILABLE',
      reason: 'publication-pending',
    });
    assert.deepEqual(await f.store.readGeneration(), before);
  });
for (const count of [1, 1000])
  test(`${count} events ingest locally with throwing remote transports`, async (t) => {
    const f = await fixture(t);
    const previousPath = process.env.PATH;
    const previousFetch = globalThis.fetch;
    const remoteMarker = path.join(f.root, 'remote-attempt');
    fs.writeFileSync(
      path.join(f.root, 'gh'),
      `#!/bin/sh\necho attempted > '${remoteMarker}'\nexit 91\n`,
      { mode: 0o700 }
    );
    process.env.PATH = f.root + path.delimiter + previousPath;
    globalThis.fetch = () => {
      throw new Error('remote disabled');
    };
    try {
      const events = Array.from({ length: count }, (_, i) =>
        event(`batch-${i}`, { timestamp: new Date(Date.UTC(2026, 9, 19, 0, 0, i)).toISOString() })
      );
      await f.ingest(events);
      const current = await f.store.readGeneration();
      assert.equal(current.generation.timing.events.length, count);
      assert.equal(current.generation.timing.ingestedCursor, `native-batch-${count - 1}`);
      assert.equal(current.generation.timing.publishedCursor, null);
      assert.equal(fs.existsSync(remoteMarker), false);
    } finally {
      process.env.PATH = previousPath;
      globalThis.fetch = previousFetch;
    }
  });
