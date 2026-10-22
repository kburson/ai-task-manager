// @story #2039 #2061
import assert from 'node:assert/strict';
import { test as baseTest } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createUnitRootFixture } from '../../../../helpers/unit-runtime-root.mjs';
import { handoffGeneration, identity, hash } from '../../../../helpers/story-handoff-fixture.mjs';
import { withRuntimeRootAdapters } from '../../../../../task-tracker/lib/runtime-storage.mjs';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { timingActorKey } from '../../../../../task-tracker/lib/timing-actor.mjs';
import { parseTimingRow } from '../../../../../task-tracker/lib/timing-row-reader.mjs';
import { buildRow } from '../../../../../task-tracker/gh-timing-comment.mjs';
import { observeContent } from '../../../../../task-tracker/lib/story-cache/native-observation.mjs';
import {
  openStoryStore,
  storyCachePath,
} from '../../../../../task-tracker/lib/story-cache/store.mjs';
import {
  acquireStoryWriter,
  openStoryWriterRegistry,
} from '../../../../../task-tracker/lib/story-cache/writer-claim.mjs';
import { ingestTimingEvents } from '../../../../../task-tracker/lib/story-cache/timing-stage.mjs';
const adapter =
  await import('../../../../../task-tracker/lib/story-cache/timing-candidate.mjs').catch(
    (error) => {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      return {};
    }
  );
const actorId = timingActorKey({ provider: 'codex', sid: 'author-A' });
const transition = { id: 'move:one', from: 'develop', to: 'test', actorId, visit: 1 };
const historical =
  '⏱ Timing Log\n\n| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |\n|---|---|---|---|---|---|---|---|\n| 2026-10-01 01:00:00 +00:00 | start |  |  |  | 10 | historical actor | 20 | <!-- row-sec: a=0 i=0 -->\n';
const event = (id, extra = {}) => ({
  eventId: id,
  actorId,
  transitionId: null,
  timestamp: '2026-10-19T12:00:00.000Z',
  event: 'paused',
  activeSeconds: null,
  idleSeconds: null,
  sourceCursor: `native-${id}`,
  ...extra,
});
const pair = (move = transition, at = '2026-10-19T12:01:00.000Z') => [
  event('z-exit', {
    actorId: move.actorId,
    transitionId: move.id,
    timestamp: at,
    event: 'develop:completed',
    activeSeconds: 0.25,
    idleSeconds: null,
  }),
  event('a-entry', {
    actorId: move.actorId,
    transitionId: move.id,
    timestamp: at,
    event: 'test:started',
    activeSeconds: 0,
    idleSeconds: 0,
  }),
];
function test(name, operation) {
  return baseTest(name, async (t) => {
    const root = fs.realpathSync(createUnitRootFixture('timing-candidate-2061-'));
    const commonDir = path.join(root, 'fixture-common');
    fs.mkdirSync(commonDir);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    t.unitRoot = root;
    return withRuntimeRootAdapters(
      {
        realpath: (p) => fs.realpathSync(p),
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
async function context(root, operation, sid = 'author-A') {
  const beforeSid = process.env.AI_TASK_MANAGER_SESSION_ID;
  const cwd = process.cwd();
  process.env.AI_TASK_MANAGER_SESSION_ID = sid;
  process.chdir(root);
  try {
    return await operation();
  } finally {
    process.chdir(cwd);
    if (beforeSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
    else process.env.AI_TASK_MANAGER_SESSION_ID = beforeSid;
  }
}
async function fixture(t, { absent = false, events = pair() } = {}) {
  assert.equal(
    typeof adapter.freezeTimingCandidate,
    'function',
    'frozen timing candidate is missing'
  );
  assert.equal(
    typeof adapter.confirmTimingPublication,
    'function',
    'verified cursor confirmation is missing'
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
  initial.generation.timing = {
    events: [],
    ingestedCursor: null,
    publishedCursor: null,
    canonicalCommentKey: absent ? null : 'comment:C_timing',
  };
  if (!absent) {
    const { body: ignored, ...observed } = observeContent({
      identity,
      node: {
        id: 'C_timing',
        lastEditedAt: null,
        includesCreatedEdit: false,
        userContentEdits: { totalCount: 0, nodes: [] },
      },
      body: historical,
    });
    void ignored;
    initial.generation.baseSnapshot.resources['comment:C_timing'] = {
      ...observed,
      ownership: 'owned',
      payloadPath: 'base/timing.md',
    };
    initial.generation.baseSnapshot.inventory = ['C_timing'];
    initial.payloads.set('base/timing.md', historical);
  }
  await store.commitGeneration(initial, { expectedGeneration: null });
  await context(root, () => ingestTimingEvents({ store, claim, events }));
  const freeze = async (move = transition) =>
    adapter.freezeTimingCandidate({ generation: await store.readGeneration(), transition: move });
  const persist = async (effect, changes = {}) => {
    const current = await store.readGeneration();
    const generation = structuredClone(current.generation);
    generation.generation++;
    generation.publicationGeneration++;
    generation.batch = {
      schema: 'aitm.story-publication-batch/v1',
      batchId: 'batch-one',
      publicationGeneration: generation.publicationGeneration,
      transition,
      baseline: structuredClone(generation.baseSnapshot),
      approvedInputDigests: [],
      effects: [{ ...structuredClone(effect), attempted: true }],
      bodyTemplate: null,
      status: 'frozen',
      ...changes,
    };
    return store.commitGeneration(
      { generation, claimId: claim.claimId, payloads: current.payloads },
      { expectedGeneration: current.manifest.generation }
    );
  };
  const observation = (effect, changes = {}) => ({
    identity,
    node: {
      __typename: 'IssueComment',
      id: 'C_timing',
      body: effect.candidate.body,
      lastEditedAt: null,
      includesCreatedEdit: false,
      userContentEdits: { totalCount: 0, nodes: [] },
    },
    body: effect.candidate.body,
    ...changes,
  });
  const confirm = (effect, observed = observation(effect), extra = {}) =>
    context(root, () =>
      adapter.confirmTimingPublication({
        store,
        batchId: 'batch-one',
        observation: observed,
        ...extra,
      })
    );
  return { root, claim, store, freeze, persist, observation, confirm };
}
const rows = (body) =>
  body
    .split('\n')
    .map(parseTimingRow)
    .filter((row) => row?.actorKey);

test('freezes one canonical candidate from retained native events without sampling a clock', async (t) => {
  const f = await fixture(t);
  const before = await f.store.readGeneration();
  t.mock.method(Date, 'now', () => {
    throw new Error('new timing clock forbidden');
  });
  const effect = await f.freeze();
  assert.equal(effect.kind, 'comment-update');
  assert.equal(effect.key, 'comment:C_timing');
  assert.equal(effect.beforeDigest, hash(historical));
  assert.equal(effect.intendedDigest, hash(effect.candidate.body));
  assert.equal(effect.attempted, false);
  assert.equal(effect.outcome, null);
  assert.ok(effect.candidate.body.startsWith(historical));
  assert.deepEqual(
    rows(effect.candidate.body).map((row) => row.event),
    ['develop:completed', 'test:started']
  );
  assert.equal(rows(effect.candidate.body)[0].cells[4], 'Unknown');
  assert.deepEqual(effect.candidate.timing.events, before.generation.timing.events);
  assert.equal(
    effect.candidate.timing.events.find((e) => e.eventId === 'z-exit').activeSeconds,
    0.25
  );
  assert.equal(effect.candidate.timing.ingestedCursor, 'native-a-entry');
  assert.ok(Object.isFrozen(effect.candidate.timing.events[0]));
  assert.deepEqual(await f.store.readGeneration(), before);
  assert.deepEqual(await f.freeze(), effect);
});
test('keeps the existing live timing constructor retroactive refusal', async () => {
  assert.throws(
    () => buildRow({ ts: '2000-01-01T00:00:00.000Z', event: 'paused', activeSec: 1 }),
    /retroactive timing entries are forbidden/
  );
});
for (const count of [1, 1000])
  test(`${count} native events freeze one candidate with throwing remote transports`, async (t) => {
    const previousPath = process.env.PATH;
    const previousFetch = globalThis.fetch;
    const remoteMarker = path.join(t.unitRoot, 'remote-attempt');
    fs.writeFileSync(
      path.join(t.unitRoot, 'gh'),
      `#!/bin/sh\necho attempted > '${remoteMarker}'\nexit 91\n`,
      { mode: 0o700 }
    );
    process.env.PATH = t.unitRoot + path.delimiter + previousPath;
    let fetches = 0;
    globalThis.fetch = () => {
      fetches++;
      throw new Error('remote disabled');
    };
    try {
      const events = Array.from({ length: count }, (_, i) =>
        event(`interval-${i}`, {
          timestamp: new Date(Date.UTC(2026, 9, 18, 0, 0, i)).toISOString(),
          event: i % 2 ? 'resumed' : 'paused',
          activeSeconds: 0,
          idleSeconds: 0,
        })
      );
      const f = await fixture(t, { events: [...events, ...pair()] });
      const effect = await f.freeze();
      assert.equal(effect.candidate.timing.events.length, count + 2);
      assert.equal(rows(effect.candidate.body).length, count + 2);
      assert.equal((await f.store.readGeneration()).generation.timing.publishedCursor, null);
      assert.equal(effect.kind, 'comment-update');
      await f.persist(effect);
      await f.confirm(effect);
      assert.equal(
        (await f.store.readGeneration()).generation.timing.publishedCursor,
        'native-a-entry'
      );
      assert.equal(fs.existsSync(remoteMarker), false);
      assert.equal(fetches, 0);
    } finally {
      process.env.PATH = previousPath;
      globalThis.fetch = previousFetch;
    }
  });
test('absence yields a stable local creation intent without inventing a provider ID', async (t) => {
  const f = await fixture(t, { absent: true });
  const effect = await f.freeze();
  assert.equal(effect.kind, 'comment-create');
  assert.match(effect.key, /^comment:new:/);
  assert.equal(effect.beforeDigest, null);
  assert.equal(effect.target.commentNodeId, null);
  assert.deepEqual(await f.freeze(), effect);
});
test('refuses missing, mismatched or illegal transition pairs rather than generating rows', async (t) => {
  const f = await fixture(t);
  for (const move of [
    { ...transition, id: 'other' },
    { ...transition, to: 'review' },
    { ...transition, to: 'develop' },
    { ...transition, actorId: 'foreign' },
    { ...transition, visit: 0 },
  ])
    await assert.rejects(f.freeze(move), (e) => e.code === 'STORY_TIMING_CANDIDATE_INVALID');
});
test('refuses a read-only timing heading instead of adopting it as owned', async (t) => {
  const f = await fixture(t);
  const current = await f.store.readGeneration();
  const next = structuredClone(current.generation);
  next.generation++;
  next.baseSnapshot.resources['comment:C_timing'].ownership = 'read-only';
  await f.store.commitGeneration(
    { generation: next, claimId: f.claim.claimId, payloads: current.payloads },
    { expectedGeneration: current.manifest.generation }
  );
  await assert.rejects(f.freeze(), (e) => e.code === 'STORY_TIMING_CANDIDATE_INVALID');
});
test('confirms only exact native read-back and advances publication independently of batch completion', async (t) => {
  const f = await fixture(t);
  const effect = await f.freeze();
  const frozen = await f.persist(effect);
  const result = await f.confirm(effect);
  assert.equal(result.status, 'confirmed');
  const after = await f.store.readGeneration();
  assert.equal(after.generation.timing.publishedCursor, 'native-a-entry');
  assert.equal(after.generation.timing.ingestedCursor, 'native-a-entry');
  assert.deepEqual(after.generation.timing.events, frozen.generation.timing.events);
  assert.equal(after.generation.batch.status, 'frozen');
  assert.deepEqual(after.generation.batch.baseline, frozen.generation.batch.baseline);
  assert.equal(after.generation.batch.effects[0].outcome.state, 'confirmed');
  assert.equal(
    after.generation.baseSnapshot.resources['comment:C_timing'].digest,
    effect.intendedDigest
  );
  assert.equal(after.generation.dirtyKeys.includes('issue:I_test'), true);
  const reopened = await openStoryStore({ projectRoot: f.root, identity });
  assert.equal(
    (await f.confirm(effect, f.observation(effect), { store: reopened })).status,
    'no-op'
  );
  assert.deepEqual(await reopened.readGeneration(), after);
});
test('wrong body, resource, identity, native metadata or batch cannot acknowledge a cursor', async (t) => {
  const f = await fixture(t);
  const effect = await f.freeze();
  const frozen = await f.persist(effect);
  const original = f.observation(effect);
  const bad = [
    { ...original, body: original.body + ' ' },
    { ...original, node: { ...original.node, id: 'C_other' } },
    { ...original, identity: { ...identity, issueNumber: 999 } },
    { ...original, node: { ...original.node, userContentEdits: { totalCount: 1, nodes: [] } } },
    { status: 'uncertain' },
  ];
  for (const observation of bad) {
    await assert.rejects(f.confirm(effect, observation));
    assert.deepEqual(await f.store.readGeneration(), frozen);
  }
  await assert.rejects(f.confirm(effect, original, { batchId: 'wrong' }));
  assert.deepEqual(await f.store.readGeneration(), frozen);
});
test('unattempted effects and changed event boundaries cannot be confirmed', async (t) => {
  const f = await fixture(t);
  const effect = await f.freeze();
  const frozen = await f.persist(effect, { effects: [effect] });
  await assert.rejects(f.confirm(effect));
  assert.deepEqual(await f.store.readGeneration(), frozen);
});
test('persistence failure retains the frozen batch and unpublished cursor without retry', async (t) => {
  const f = await fixture(t);
  const effect = await f.freeze();
  const frozen = await f.persist(effect);
  let commits = 0;
  const failing = {
    cachePath: f.store.cachePath,
    readGeneration: f.store.readGeneration,
    commitGeneration: async () => {
      commits++;
      throw new Error('disk unavailable');
    },
  };
  await assert.rejects(
    f.confirm(effect, f.observation(effect), { store: failing }),
    /disk unavailable|publication unavailable/i
  );
  assert.equal(commits, 1);
  assert.deepEqual(await f.store.readGeneration(), frozen);
});
test('a different session cannot acknowledge the original writer cursor', async (t) => {
  const f = await fixture(t);
  const effect = await f.freeze();
  const frozen = await f.persist(effect);
  await assert.rejects(
    context(
      f.root,
      () =>
        adapter.confirmTimingPublication({
          store: f.store,
          batchId: 'batch-one',
          observation: f.observation(effect),
        }),
      'author-B'
    )
  );
  assert.deepEqual(await f.store.readGeneration(), frozen);
});
async function changeGeneration(f, operation) {
  const before = await f.store.readGeneration();
  const next = structuredClone(before.generation);
  next.generation++;
  const payloads = new Map(before.payloads);
  operation(next, payloads);
  return f.store.commitGeneration(
    { generation: next, claimId: f.claim.claimId, payloads },
    { expectedGeneration: before.manifest.generation }
  );
}
test('a later backdated delivery publishes once without slicing opaque cursors by timestamp', async (t) => {
  const f = await fixture(t);
  const first = await f.freeze();
  await f.persist(first);
  await f.confirm(first);
  await changeGeneration(f, (g) => {
    g.batch = null;
  });
  const move = { ...transition, id: 'move:two', from: 'test', to: 'review', visit: 2 };
  const older = event('late-delivery', {
    timestamp: '2026-10-18T12:00:00.000Z',
    actorId: timingActorKey({ provider: 'codex', sid: 'historic-author' }),
    activeSeconds: 0.125,
  });
  const nextPair = [
    event('second-exit', {
      timestamp: '2026-10-20T12:00:00.000Z',
      transitionId: move.id,
      event: 'test:passed',
      activeSeconds: null,
      idleSeconds: 0,
    }),
    event('second-entry', {
      timestamp: '2026-10-20T12:00:00.000Z',
      transitionId: move.id,
      event: 'review:started',
      activeSeconds: 0,
      idleSeconds: 0,
    }),
  ];
  // Deliberately acknowledge an OLD event last; cursor delivery order differs from timestamp order.
  await context(f.root, () =>
    ingestTimingEvents({ store: f.store, claim: f.claim, events: [...nextPair, older] })
  );
  const second = await f.freeze(move);
  const rendered = rows(second.candidate.body);
  assert.deepEqual(
    rendered.map((row) => row.event),
    ['paused', 'develop:completed', 'test:started', 'test:passed', 'review:started']
  );
  assert.equal(second.candidate.timing.ingestedCursor, 'native-late-delivery');
  assert.deepEqual(second.candidate.timing.eventIds, [
    'late-delivery',
    'second-entry',
    'second-exit',
  ]);
  assert.equal(
    second.candidate.timing.events.find((e) => e.eventId === 'late-delivery').activeSeconds,
    0.125
  );
  await f.persist(second, { transition: move, batchId: 'batch-two' });
  await f.confirm(second, f.observation(second), { batchId: 'batch-two' });
  const current = await f.store.readGeneration();
  assert.equal(current.generation.timing.publishedCursor, 'native-late-delivery');
  assert.equal(
    rows(second.candidate.body).filter((row) => row.event === 'develop:completed').length,
    1
  );
  assert.equal(second.candidate.body.split('aitm-timing-events:v1').length, 2);
});
test('missing or ambiguous creation read-back cannot consume an absent resource intent', async (t) => {
  const f = await fixture(t, { absent: true });
  const effect = await f.freeze();
  const before = await f.persist(effect);
  const observed = f.observation(effect);
  await assert.rejects(f.confirm(effect, observed));
  await assert.rejects(
    f.confirm(effect, {
      ...observed,
      complete: true,
      inventory: [
        { id: 'C_timing', body: observed.body },
        { id: 'C_duplicate', body: observed.body },
      ],
    })
  );
  assert.deepEqual(await f.store.readGeneration(), before);
  const proof = {
    ...observed,
    complete: true,
    inventory: [{ id: 'C_timing', body: observed.body }],
  };
  await f.confirm(effect, proof);
  const after = await f.store.readGeneration();
  assert.equal(after.generation.timing.canonicalCommentKey, 'comment:C_timing');
  assert.equal(after.generation.baseSnapshot.inventory.includes('C_timing'), true);
  assert.equal((await f.confirm(effect, proof)).status, 'no-op');
  assert.deepEqual(await f.store.readGeneration(), after);
});
test('duplicate canonical comments refuse even when one has the expected owned identity', async (t) => {
  const f = await fixture(t);
  await changeGeneration(f, (g) => {
    g.baseSnapshot.resources['comment:C_duplicate'] = {
      ...g.baseSnapshot.resources['comment:C_timing'],
      key: 'comment:C_duplicate',
      ownership: 'read-only',
    };
    g.baseSnapshot.inventory = ['C_duplicate', 'C_timing'];
  });
  await assert.rejects(f.freeze(), (e) => e.reason === 'canonical-comment-ambiguous');
});
test('frozen confirmation rejects changed events, hashes and duplicated timing effects', async (t) => {
  const f = await fixture(t);
  const effect = await f.freeze();
  await f.persist(effect);
  const variants = [
    (g) => {
      g.timing.events.find((e) => e.eventId === 'z-exit').activeSeconds = 0.5;
    },
    (g) => {
      g.batch.effects[0].intendedDigest = 'a'.repeat(64);
    },
    (g) => {
      g.batch.effects.push(structuredClone(g.batch.effects[0]));
    },
  ];
  const source = await f.store.readGeneration();
  for (const alter of variants) {
    const current = await f.store.readGeneration();
    const next = structuredClone(source.generation);
    next.generation = current.generation.generation + 1;
    alter(next);
    const before = await f.store.commitGeneration(
      { generation: next, claimId: f.claim.claimId, payloads: source.payloads },
      { expectedGeneration: current.manifest.generation }
    );
    await assert.rejects(f.confirm(effect));
    assert.deepEqual(await f.store.readGeneration(), before);
  }
});
test('a changed already-published native event fails closed in the next transition', async (t) => {
  const f = await fixture(t);
  const effect = await f.freeze();
  await f.persist(effect);
  await f.confirm(effect);
  await changeGeneration(f, (g) => {
    g.batch = null;
    g.timing.events.find((e) => e.eventId === 'z-exit').activeSeconds = 0.5;
  });
  const move = { ...transition, id: 'move:two', from: 'test', to: 'review', visit: 2 };
  await context(f.root, () =>
    ingestTimingEvents({
      store: f.store,
      claim: f.claim,
      events: [
        event('next-exit', {
          transitionId: move.id,
          event: 'test:passed',
          timestamp: '2026-10-20T12:00:00.000Z',
        }),
        event('next-entry', {
          transitionId: move.id,
          event: 'review:started',
          timestamp: '2026-10-20T12:00:00.000Z',
          activeSeconds: 0,
          idleSeconds: 0,
        }),
      ],
    })
  );
  await assert.rejects(f.freeze(move), (e) => e.reason === 'published-event-drift');
});
test('a lying local commit read-back never returns confirmed success', async (t) => {
  const f = await fixture(t);
  const effect = await f.freeze();
  const before = await f.persist(effect);
  const lying = {
    cachePath: f.store.cachePath,
    readGeneration: f.store.readGeneration,
    commitGeneration: async () => before,
  };
  await assert.rejects(
    f.confirm(effect, f.observation(effect), { store: lying }),
    (e) => e.reason === 'commit-readback'
  );
  assert.deepEqual(await f.store.readGeneration(), before);
});
test('live row admission snapshots a timestamp getter once before rendering', () => {
  let reads = 0;
  const row = buildRow({
    get ts() {
      return reads++ === 0 ? new Date().toISOString() : '2000-01-01T00:00:00.000Z';
    },
    event: 'paused',
    activeSec: 0,
    idleSec: 0,
  });
  assert.equal(reads, 1);
  assert.equal(parseTimingRow(row).ts.startsWith('2000-'), false);
});
