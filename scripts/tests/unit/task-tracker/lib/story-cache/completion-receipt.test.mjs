// @story #2039 #2048
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { canonicalRecordJson as json } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { renderTimingEventBatch } from '../../../../../task-tracker/gh-timing-comment.mjs';
import { ingestTimingEvents } from '../../../../../task-tracker/lib/story-cache/timing-stage.mjs';
import {
  test,
  fixture,
  context,
  transition,
  identity,
  hash,
  event,
  pair,
  actorId,
  changeGeneration,
} from '../../../../helpers/story-timing-candidate-fixture.mjs';
const api =
  await import('../../../../../task-tracker/lib/story-cache/completion-receipt.mjs').catch(
    (error) => {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      return {};
    }
  );
const validate = (...args) => {
  assert.equal(
    typeof api.validateCompletionReceipt,
    'function',
    'completion receipt validator missing'
  );
  return api.validateCompletionReceipt(...args);
};
const historical = (...args) => {
  assert.equal(
    typeof api.validateHistoricalCompletionReceipt,
    'function',
    'historical receipt validator missing'
  );
  return api.validateHistoricalCompletionReceipt(...args);
};
const rejected = (error) =>
  ['STORY_COMPLETION_INVALID', 'STORY_COMPLETION_UNCONFIRMED'].includes(error.code);
const field = {
  key: 'project-field:PI_test:STATUS',
  kind: 'project-field-update',
  target: {
    identity,
    projectId: identity.projectId,
    itemId: identity.projectItemId,
    fieldId: 'STATUS',
    type: 'SINGLE_SELECT',
  },
  beforeDigest: 'a'.repeat(64),
  intendedDigest: hash(
    json({
      itemId: identity.projectItemId,
      fieldId: 'STATUS',
      type: 'SINGLE_SELECT',
      value: { optionId: 'test', name: 'Test' },
    })
  ),
  candidate: {
    itemId: identity.projectItemId,
    fieldId: 'STATUS',
    type: 'SINGLE_SELECT',
    value: { optionId: 'test', name: 'Test' },
  },
  dependencies: [],
  attempted: true,
};
field.outcome = { state: 'confirmed', digest: field.intendedDigest };
async function completed(t, options = {}) {
  const f = await fixture(t, options);
  if (options.legacy)
    await changeGeneration(f, (g, payloads) => {
      const ref = g.baseSnapshot.resources['comment:C_timing'];
      const legacyMove = { ...transition, id: 'move:legacy', actorId };
      const body = renderTimingEventBatch({
        timingBody: String(payloads.get(ref.payloadPath)),
        events: pair(legacyMove, '2026-10-18T12:01:00.000Z'),
        exitEventId: 'z-exit',
      });
      ref.digest = hash(body);
      ref.payloadPath = `payloads/${ref.digest}.txt`;
      payloads.set(ref.payloadPath, body);
    });
  const original = await f.freeze();
  await f.persist(original);
  const observed = f.observation(original);
  if (options.absent) {
    observed.complete = true;
    observed.inventory = [{ id: 'C_timing', body: observed.body }];
  }
  await f.confirm(original, observed);
  const record = await f.store.readGeneration();
  const effect = record.generation.batch.effects[0];
  const receipt = {
    schema: 'aitm.story-transition-completion/v1',
    transition,
    timing: {
      key: 'comment:C_timing',
      resourceDigest: original.intendedDigest,
      eventIds: original.candidate.timing.eventIds,
      eventsDigest: original.candidate.timing.eventsDigest,
    },
    effects: [{ key: field.key, digest: field.intendedDigest }],
  };
  const confirmedEffects = [effect, structuredClone(field)];
  return { f, receipt, confirmedEffects, record };
}
test('the original pinned seed refuses absent confirmations without manufacturing legacy proof', () => {
  const move = {
    id: 'move:00000000-0000-4000-8000-000000000001',
    from: 'refine',
    to: 'ready-for-plan',
    actorId: 'author-A',
    visit: 1,
  };
  const receipt = {
    schema: 'aitm.story-transition-completion/v1',
    transition: move,
    timing: {
      key: 'comment:IC_timing',
      resourceDigest: 'a'.repeat(64),
      eventIds: ['event-enter-1', 'event-exit-1'],
      eventsDigest: 'c'.repeat(64),
    },
    effects: [{ key: 'project-field:PI_test:STATUS', digest: 'b'.repeat(64) }],
  };
  assert.throws(() => validate(receipt, { transition: move, confirmedEffects: [] }), {
    code: 'STORY_COMPLETION_UNCONFIRMED',
  });
});
for (const absent of [false, true])
  test(`validates a confirmed ${absent ? 'creation' : 'update'} without mutating original batch evidence`, async (t) => {
    const { receipt, confirmedEffects, record } = await completed(t, { absent });
    const before = structuredClone({ receipt, confirmedEffects });
    const accepted = validate(receipt, { transition, confirmedEffects });
    assert.deepEqual(accepted, receipt);
    assert.ok(Object.isFrozen(accepted) && Object.isFrozen(accepted.timing.eventIds));
    assert.deepEqual({ receipt, confirmedEffects }, before);
    assert.equal(
      historical(receipt, { transition, confirmedEffects, generation: record }).transition.id,
      transition.id
    );
    assert.equal(
      record.generation.timing.events.find((e) => e.eventId === 'z-exit').idleSeconds,
      null
    );
  });
for (const [name, alter] of [
  [
    'wrong actor',
    (r) => {
      r.transition.actorId = 'author-A';
    },
  ],
  [
    'wrong visit',
    (r) => {
      r.transition.visit = 2;
    },
  ],
  [
    'illegal state edge',
    (r) => {
      r.transition.to = 'done';
    },
  ],
  [
    'wrong native transition',
    (r) => {
      r.transition.id = 'move:other';
    },
  ],
  [
    'missing timing event',
    (r) => {
      r.timing.eventIds = ['z-exit'];
    },
  ],
  [
    'duplicate timing event',
    (r) => {
      r.timing.eventIds.push(r.timing.eventIds[0]);
    },
  ],
  [
    'wrong subset digest',
    (r) => {
      r.timing.eventsDigest = '0'.repeat(64);
    },
  ],
  [
    'wrong resource digest',
    (r) => {
      r.timing.resourceDigest = '0'.repeat(64);
    },
  ],
  [
    'wrong comment identity',
    (r) => {
      r.timing.key = 'comment:foreign';
    },
  ],
  [
    'missing prerequisite',
    (r) => {
      r.effects = [];
    },
  ],
  [
    'wrong effect digest',
    (r) => {
      r.effects[0].digest = '0'.repeat(64);
    },
  ],
  [
    'extra receipt properties',
    (r) => {
      r.latestSentinel = true;
    },
  ],
])
  test(`refuses ${name}`, async (t) => {
    const { receipt, confirmedEffects } = await completed(t);
    const changed = structuredClone(receipt);
    alter(changed);
    assert.throws(() => validate(changed, { transition, confirmedEffects }), rejected);
  });
for (const [name, alter] of [
  [
    'uncertain timing',
    (e) => {
      e[0].outcome.state = 'uncertain';
    },
  ],
  [
    'unattempted prerequisite',
    (e) => {
      e[1].attempted = false;
    },
  ],
  [
    'unconfirmed prerequisite',
    (e) => {
      e[1].outcome = null;
    },
  ],
  [
    'forged confirmation digest',
    (e) => {
      e[0].outcome.digest = '0'.repeat(64);
    },
  ],
  [
    'changed frozen timing body',
    (e) => {
      e[0].candidate.body += 'changed';
    },
  ],
  [
    'wrong provider identity',
    (e) => {
      e[0].outcome.providerId = 'foreign';
    },
  ],
  [
    'duplicate effect',
    (e) => {
      e.push(structuredClone(e[1]));
    },
  ],
  [
    'foreign target',
    (e) => {
      e[1].target.identity.issueNumber++;
    },
  ],
])
  test(`refuses ${name} in supplied confirmation evidence`, async (t) => {
    const { receipt, confirmedEffects } = await completed(t);
    const changed = structuredClone(confirmedEffects);
    alter(changed);
    assert.throws(() => validate(receipt, { transition, confirmedEffects: changed }), rejected);
  });
async function append(f, move, names, at) {
  await changeGeneration(f, (g) => {
    g.batch = null;
  });
  const exits = { test: 'test:passed', review: 'review:approved', develop: 'develop:completed' };
  const entries = { review: 'review:started', develop: 'develop:started', test: 'test:started' };
  const events = [
    event(names[0], {
      transitionId: move.id,
      actorId: move.actorId,
      timestamp: at,
      event: exits[move.from],
      activeSeconds: 0.5,
      idleSeconds: null,
    }),
    event(names[1], {
      transitionId: move.id,
      actorId: move.actorId,
      timestamp: at,
      event: entries[move.to],
      activeSeconds: 0,
      idleSeconds: 0,
    }),
  ];
  await context(f.root, () => ingestTimingEvents({ store: f.store, claim: f.claim, events }));
  const effect = await f.freeze(move);
  await f.persist(effect, { transition: move, batchId: move.id });
  await f.confirm(effect, f.observation(effect), { batchId: move.id });
  return f.store.readGeneration();
}
test('earlier subset survives consecutive transitions, demotion/reentry and a provisional final body', async (t) => {
  const { f, receipt, confirmedEffects } = await completed(t);
  let current = await append(
    f,
    { ...transition, id: 'move:two', from: 'test', to: 'review', visit: 2 },
    ['two-exit', 'two-enter'],
    '2026-10-20T12:00:00.000Z'
  );
  assert.notEqual(
    current.generation.baseSnapshot.resources['comment:C_timing'].digest,
    receipt.timing.resourceDigest
  );
  assert.deepEqual(
    historical(receipt, { transition, confirmedEffects, generation: current }),
    receipt
  );
  current = await append(
    f,
    { ...transition, id: 'move:demotion', from: 'review', to: 'develop', visit: 2 },
    ['three-exit', 'three-enter'],
    '2026-10-21T12:00:00.000Z'
  );
  current = await append(
    f,
    { ...transition, id: 'move:reentry', visit: 2 },
    ['four-exit', 'four-enter'],
    '2026-10-22T12:00:00.000Z'
  );
  assert.deepEqual(
    historical(receipt, { transition, confirmedEffects, generation: current }),
    receipt
  );
  assert.equal(
    current.generation.batch.status,
    'frozen',
    'timing publication must not complete the final body'
  );
  assert.throws(
    () =>
      historical(null, {
        transition: current.generation.batch.transition,
        confirmedEffects,
        generation: current,
      }),
    rejected
  );
  assert.equal(
    current.generation.timing.events.find((e) => e.eventId === 'z-exit').activeSeconds,
    0.25
  );
  assert.equal(
    current.generation.timing.events.find((e) => e.eventId === 'z-exit').idleSeconds,
    null
  );
});
function replaceRecord(body, operation) {
  const match = /\n<!-- aitm-timing-events:v1 encoding=gzip payload=([A-Za-z0-9_-]+) -->\n$/.exec(
    body
  );
  const record = JSON.parse(gunzipSync(Buffer.from(match[1], 'base64url')));
  operation(record);
  return (
    body.slice(0, match.index) +
    '\n<!-- aitm-timing-events:v1 encoding=gzip payload=' +
    gzipSync(Buffer.from(json(record)), { level: 9, mtime: 0 }).toString('base64url') +
    ' -->\n'
  );
}
for (const [name, modify] of [
  [
    'altered old event',
    (body) =>
      replaceRecord(body, (r) => {
        r.events.find((e) => e.eventId === 'z-exit').activeSeconds = 1;
      }),
  ],
  [
    'missing old event',
    (body) =>
      replaceRecord(body, (r) => {
        r.events = r.events.filter((e) => e.eventId !== 'z-exit');
      }),
  ],
  [
    'altered rendered row with rehashed table',
    (body) => {
      const changed = body.replace('0.25', '99');
      // Native renderer uses 00:00:00.25; replace independently of retained JSON.
      const text = changed === body ? body.replace('develop:completed', 'test:passed') : changed;
      return replaceRecord(text, (r) => {
        r.tableDigest = hash(text.slice(0, text.indexOf('\n<!-- aitm-timing-events:')));
      });
    },
  ],
])
  test(`historical verification rejects ${name} despite valid storage checksums`, async (t) => {
    const { f, receipt, confirmedEffects } = await completed(t);
    const current = await changeGeneration(f, (g, payloads) => {
      const resource = g.baseSnapshot.resources['comment:C_timing'];
      const body = modify(String(payloads.get(resource.payloadPath)));
      const digest = hash(body);
      resource.digest = digest;
      resource.payloadPath = `payloads/${digest}.txt`;
      payloads.set(resource.payloadPath, body);
    });
    assert.throws(
      () => historical(receipt, { transition, confirmedEffects, generation: current }),
      rejected
    );
  });
test('historical verification refuses missing/reduced/tampered records and foreign repositories', async (t) => {
  const { receipt, confirmedEffects, record } = await completed(t);
  for (const generation of [
    null,
    record.generation,
    { ...record, payloads: new Map() },
    {
      ...record,
      generation: { ...record.generation, identity: { ...identity, repository: 'foreign/repo' } },
    },
  ])
    assert.throws(
      () => historical(receipt, { transition, confirmedEffects, generation }),
      rejected
    );
});

test('preserves pre-record legacy actor rows without granting them new receipt proof', async (t) => {
  const { receipt, confirmedEffects, record } = await completed(t, { legacy: true });
  assert.deepEqual(validate(receipt, { transition, confirmedEffects }), receipt);
  assert.deepEqual(
    historical(receipt, { transition, confirmedEffects, generation: record }),
    receipt
  );
  const legacyReceipt = structuredClone(receipt);
  legacyReceipt.transition.id = 'move:legacy';
  assert.throws(
    () => validate(legacyReceipt, { transition: legacyReceipt.transition, confirmedEffects }),
    rejected
  );
});
test('binds all pending events including backdated ordinary intervals, preserving Unknown', async (t) => {
  const ordinary = event('ordinary', {
    timestamp: '2026-10-18T12:00:00.000Z',
    activeSeconds: 0.125,
  });
  const { receipt, confirmedEffects, record } = await completed(t, {
    events: [ordinary, ...pair()],
  });
  assert.deepEqual(receipt.timing.eventIds, ['a-entry', 'ordinary', 'z-exit']);
  assert.deepEqual(validate(receipt, { transition, confirmedEffects }), receipt);
  assert.deepEqual(
    historical(receipt, { transition, confirmedEffects, generation: record }),
    receipt
  );
  assert.equal(
    record.generation.timing.events.find((e) => e.eventId === 'ordinary').idleSeconds,
    null
  );
  const shortened = structuredClone(receipt);
  shortened.timing.eventIds = ['a-entry', 'z-exit'];
  assert.throws(() => validate(shortened, { transition, confirmedEffects }), rejected);
});

test('detects altered historical subsets even when the current table and compressed record agree', async (t) => {
  const { f, receipt, confirmedEffects } = await completed(t);
  const current = await changeGeneration(f, (g, payloads) => {
    const ref = g.baseSnapshot.resources['comment:C_timing'];
    const body = String(payloads.get(ref.payloadPath));
    const marker =
      /\n<!-- aitm-timing-events:v1 encoding=gzip payload=([A-Za-z0-9_-]+) -->\n$/.exec(body);
    const record = JSON.parse(gunzipSync(Buffer.from(marker[1], 'base64url')));
    record.events.find((e) => e.eventId === 'z-exit').activeSeconds = 0.5;
    // Retain unrelated legacy lines, then render the changed pair consistently.
    const legacy = body.slice(0, body.indexOf('\n| 2026-10-19'));
    let table = renderTimingEventBatch({
      timingBody: legacy,
      events: record.events,
      exitEventId: 'z-exit',
    });
    if (!table.endsWith('\n')) table += '\n';
    record.tableDigest = hash(table);
    const changed =
      table +
      '\n<!-- aitm-timing-events:v1 encoding=gzip payload=' +
      gzipSync(Buffer.from(json(record)), { level: 9, mtime: 0 }).toString('base64url') +
      ' -->\n';
    ref.digest = hash(changed);
    ref.payloadPath = `payloads/${ref.digest}.txt`;
    payloads.set(ref.payloadPath, changed);
  });
  assert.throws(
    () => historical(receipt, { transition, confirmedEffects, generation: current }),
    (error) => error.code === 'STORY_COMPLETION_INVALID' && error.reason === 'historical-subset'
  );
});
test('unpublished working edits cannot change the published historical evidence', async (t) => {
  const { f, receipt, confirmedEffects } = await completed(t);
  const current = await changeGeneration(f, (g, payloads) => {
    const digest = hash('unpublished timing draft');
    const payloadPath = `payloads/${digest}.txt`;
    payloads.set(payloadPath, 'unpublished timing draft');
    g.working['comment:C_timing'] = { kind: 'comment', payloadPath, digest, capabilityRef: null };
    g.dirtyKeys = ['comment:C_timing'];
  });
  assert.deepEqual(
    historical(receipt, { transition, confirmedEffects, generation: current }),
    receipt
  );
});

function noteEvidence(receipt, confirmedEffects) {
  const body = 'Verified prerequisite note\n\n<!-- aitm-owned-comment key="note" -->';
  const note = {
    key: 'comment:C_note',
    kind: 'comment-update',
    target: { identity, commentNodeId: 'C_note', creationIntent: null },
    beforeDigest: 'b'.repeat(64),
    intendedDigest: hash(body),
    candidate: body,
    dependencies: [],
    attempted: true,
    outcome: { state: 'confirmed', digest: hash(body), providerId: 'C_note' },
  };
  receipt.effects.push({ key: note.key, digest: note.intendedDigest });
  confirmedEffects.push(note);
  return note;
}
test('binds required comment confirmation to its real target and provider identity', async (t) => {
  const initial = await completed(t);
  const { receipt, confirmedEffects } = structuredClone({
    receipt: initial.receipt,
    confirmedEffects: initial.confirmedEffects,
  });
  const note = noteEvidence(receipt, confirmedEffects);
  assert.deepEqual(validate(receipt, { transition, confirmedEffects }), receipt);
  note.target.commentNodeId = 'foreign';
  assert.throws(() => validate(receipt, { transition, confirmedEffects }), rejected);
});
test('a prerequisite comment cannot use an uncorrelated provider outcome', async (t) => {
  const initial = await completed(t);
  const { receipt, confirmedEffects } = structuredClone({
    receipt: initial.receipt,
    confirmedEffects: initial.confirmedEffects,
  });
  const note = noteEvidence(receipt, confirmedEffects);
  note.outcome.providerId = 'foreign';
  assert.throws(() => validate(receipt, { transition, confirmedEffects }), rejected);
});
for (const [name, change] of [
  [
    'unknown field type',
    (e) => {
      e.target.type = e.candidate.type = 'WIDGET';
    },
  ],
  [
    'typed numeric coercion',
    (e) => {
      e.target.type = e.candidate.type = 'NUMBER';
      e.candidate.value = '3';
    },
  ],
])
  test(`refuses ${name} even with matching hashes`, async (t) => {
    const initial = await completed(t);
    const { receipt, confirmedEffects } = structuredClone({
      receipt: initial.receipt,
      confirmedEffects: initial.confirmedEffects,
    });
    const effect = confirmedEffects[1];
    change(effect);
    effect.intendedDigest = effect.outcome.digest = hash(json(effect.candidate));
    receipt.effects[0].digest = effect.intendedDigest;
    assert.throws(() => validate(receipt, { transition, confirmedEffects }), rejected);
  });
