// @story #2039 #2061
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { timingActorKey } from '../../../../../task-tracker/lib/timing-actor.mjs';
import { parseTimingRow } from '../../../../../task-tracker/lib/timing-row-reader.mjs';
import {
  buildRow,
  renderTimingEventBatch,
} from '../../../../../task-tracker/gh-timing-comment.mjs';
import { observeContent } from '../../../../../task-tracker/lib/story-cache/native-observation.mjs';
import { openStoryStore } from '../../../../../task-tracker/lib/story-cache/store.mjs';
import { ingestTimingEvents } from '../../../../../task-tracker/lib/story-cache/timing-stage.mjs';
import {
  test,
  fixture,
  context,
  adapter,
  identity,
  hash,
  actorId,
  transition,
  historical,
  event,
  pair,
  rows,
  changeGeneration,
} from '../../../../helpers/story-timing-candidate-fixture.mjs';
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
      assert.ok(
        Buffer.byteLength(effect.candidate.body, 'utf8') <= 65536,
        'representative native-event candidate exceeds publication budget'
      );
      console.log(
        `publication-size events=${count + 2} bytes=${Buffer.byteLength(effect.candidate.body, 'utf8')}`
      );
      assert.equal(rows(effect.candidate.body).length, 2);
      assert.deepEqual(
        readEventRecord(effect.candidate.body).events,
        (await f.store.readGeneration()).generation.timing.events
      );
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
    ['develop:completed', 'test:started', 'test:passed', 'review:started']
  );
  assert.equal(second.candidate.timing.ingestedCursor, 'native-late-delivery');
  assert.equal(
    readEventRecord(second.candidate.body).events.find((e) => e.eventId === 'late-delivery')
      .activeSeconds,
    0.125
  );
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
function readEventRecord(body) {
  const match = body.match(
    /<!-- aitm-timing-events:v1 (encoding=gzip )?payload=([A-Za-z0-9_-]+) -->/
  );
  assert.ok(match, 'exact native event record missing');
  const bytes = Buffer.from(match[2], 'base64url');
  return JSON.parse((match[1] ? gunzipSync(bytes) : bytes).toString('utf8'));
}
test('R1 I1 same-instant ordinary events cannot split the native exit and entry pair', () => {
  for (const ordinaryActor of [
    actorId,
    timingActorKey({ provider: 'codex', sid: 'other-author' }),
  ]) {
    const events = [
      ...pair().map((e) => ({
        ...e,
        eventId: e.event === 'develop:completed' ? 'z-exit' : 'z-entry',
      })),
      event('a-ordinary', { actorId: ordinaryActor, timestamp: '2026-10-19T12:01:00.000Z' }),
    ];
    const rendered = rows(
      renderTimingEventBatch({ timingBody: historical, events, exitEventId: 'z-exit' })
    );
    const exit = rendered.findIndex((r) => r.event === 'develop:completed');
    assert.equal(rendered[exit + 1]?.event, 'test:started');
    assert.equal(rendered.filter((r) => r.event === 'paused').length, 1);
  }
});
async function nextTransition(f) {
  await changeGeneration(f, (g) => {
    g.batch = null;
  });
  const move = { ...transition, id: 'move:two', from: 'test', to: 'review', visit: 2 };
  await context(f.root, () =>
    ingestTimingEvents({
      store: f.store,
      claim: f.claim,
      events: [
        event('next-exit', {
          timestamp: '2026-10-20T12:00:00.000Z',
          transitionId: move.id,
          event: 'test:passed',
        }),
        event('next-entry', {
          timestamp: '2026-10-20T12:00:00.000Z',
          transitionId: move.id,
          event: 'review:started',
          activeSeconds: 0,
          idleSeconds: 0,
        }),
      ],
    })
  );
  return move;
}
async function replaceTimingBody(f, body) {
  return changeGeneration(f, (g, payloads) => {
    const payloadPath = 'working/changed-timing.md';
    payloads.set(payloadPath, body);
    g.baseSnapshot.resources['comment:C_timing'] = {
      ...g.baseSnapshot.resources['comment:C_timing'],
      payloadPath,
      digest: hash(body),
    };
    g.working['comment:C_timing'] = {
      payloadPath,
      digest: hash(body),
      kind: 'comment',
      capabilityRef: null,
    };
  });
}
test('R1 I2 changed, missing or duplicated historical table rows refuse despite retained metadata', async (t) => {
  const f = await fixture(t);
  const effect = await f.freeze();
  await f.persist(effect);
  await f.confirm(effect);
  const move = await nextTransition(f);
  const body = effect.candidate.body;
  const exit = body.split('\n').find((line) => line.includes('| develop:completed |'));
  const variants = [
    body.replace(exit + '\n', ''),
    body.replace(exit, exit + '\n' + exit),
    body.replace(exit, exit.replace('develop:completed', 'paused')),
    body.replace('historical actor', 'edited historical actor'),
  ];
  for (const candidate of variants) {
    const before = await replaceTimingBody(f, candidate);
    await assert.rejects(f.freeze(move));
    assert.deepEqual(await f.store.readGeneration(), before);
  }
});
test('R1 I3 creation cannot adopt a provider ID already present as read-only baseline context', async (t) => {
  const f = await fixture(t, { absent: true });
  await changeGeneration(f, (g, payloads) => {
    const body = 'human context';
    const { body: ignored, ...resource } = observeContent({
      identity,
      node: {
        id: 'C_foreign',
        lastEditedAt: null,
        includesCreatedEdit: false,
        userContentEdits: { totalCount: 0, nodes: [] },
      },
      body,
    });
    void ignored;
    payloads.set('base/foreign.md', body);
    g.baseSnapshot.resources['comment:C_foreign'] = { ...resource, payloadPath: 'base/foreign.md' };
    g.baseSnapshot.inventory = ['C_foreign'];
  });
  const effect = await f.freeze();
  const before = await f.persist(effect);
  const original = f.observation(effect);
  const observation = {
    ...original,
    node: { ...original.node, id: 'C_foreign' },
    complete: true,
    inventory: [{ id: 'C_foreign', body: original.body }],
  };
  await assert.rejects(f.confirm(effect, observation));
  assert.deepEqual(await f.store.readGeneration(), before);
});
test('R1 I4 oversized existing human history refuses without discarding local events', async (t) => {
  const f = await fixture(t);
  const before = await replaceTimingBody(f, historical + 'retained-context '.repeat(5000));
  await assert.rejects(
    f.freeze(),
    (e) => e.code === 'STORY_TIMING_CANDIDATE_INVALID' && e.reason === 'comment-size'
  );
  assert.deepEqual(await f.store.readGeneration(), before);
});
test('R1 M1 identical native inputs and recovery are independent of the process timezone', async (t) => {
  const f = await fixture(t);
  const before = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const effect = await f.freeze();
    await f.persist(effect);
    process.env.TZ = 'America/Chicago';
    const frozen = await f.store.readGeneration();
    // Reconstruct from the same pre-batch input in another zone without moving the store.
    const origin = structuredClone(frozen.generation);
    origin.batch = null;
    const payloads = new Map(frozen.payloads);
    const raw = canonicalRecordJson(origin);
    const payloadPath = 'generations/timezone-model.json';
    payloads.set(payloadPath, raw);
    const record = {
      manifest: { ...frozen.manifest, payloadPath, payloadDigest: hash(raw) },
      generation: origin,
      payloads,
    };
    assert.deepEqual(adapter.freezeTimingCandidate({ generation: record, transition }), effect);
    assert.equal((await f.confirm(effect)).status, 'confirmed');
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});
test('R1 I4 recovery validates and reuses the frozen compression bytes instead of recompressing', async (t) => {
  const f = await fixture(t);
  const effect = structuredClone(await f.freeze());
  const record = readEventRecord(effect.candidate.body);
  const alternate = gzipSync(Buffer.from(canonicalRecordJson(record)), { level: 1 }).toString(
    'base64url'
  );
  effect.candidate.body = effect.candidate.body.replace(
    /<!-- aitm-timing-events:v1 (?:encoding=gzip )?payload=[A-Za-z0-9_-]+ -->/,
    '<!-- aitm-timing-events:v1 encoding=gzip payload=' + alternate + ' -->'
  );
  effect.intendedDigest = hash(effect.candidate.body);
  await f.persist(effect);
  assert.equal((await f.confirm(effect)).status, 'confirmed');
});
test('R1 I2 a rewritten table digest still cannot hide a missing native pair row', async (t) => {
  const f = await fixture(t);
  const effect = await f.freeze();
  await f.persist(effect);
  await f.confirm(effect);
  const move = await nextTransition(f);
  const record = readEventRecord(effect.candidate.body);
  const original = effect.candidate.body.split('\n<!-- aitm-timing-events:')[0];
  const exit = original.split('\n').find((line) => line.includes('| develop:completed |'));
  const table = original.replace(exit + '\n', '');
  record.tableDigest = hash(table);
  const altered =
    table +
    '\n<!-- aitm-timing-events:v1 encoding=gzip payload=' +
    gzipSync(Buffer.from(canonicalRecordJson(record))).toString('base64url') +
    ' -->\n';
  const before = await replaceTimingBody(f, altered);
  await assert.rejects(f.freeze(move), (e) => e.reason === 'timing-table-correspondence');
  assert.deepEqual(await f.store.readGeneration(), before);
});
test('R1 I4 compressed metadata cannot expand beyond the bounded evidence budget', async (t) => {
  const f = await fixture(t);
  const compressed = gzipSync(Buffer.from('"' + 'x'.repeat(4 * 1024 * 1024) + '"')).toString(
    'base64url'
  );
  const before = await replaceTimingBody(
    f,
    historical + '\n<!-- aitm-timing-events:v1 encoding=gzip payload=' + compressed + ' -->\n'
  );
  await assert.rejects(
    f.freeze(),
    (e) => e.code === 'STORY_TIMING_CANDIDATE_INVALID' && e.cause?.code === 'ERR_BUFFER_TOO_LARGE'
  );
  assert.deepEqual(await f.store.readGeneration(), before);
});
