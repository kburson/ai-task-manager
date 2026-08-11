// @story #1079
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  appendLifecycleTransition,
  validateTransitionAuthority,
} from '../../../../lib/github-records/lifecycle-transition.mjs';
import {
  activeAuthority,
  branch,
  capsule,
  coordinator,
  grantId,
  id,
  issue,
  memoryLifecycleStore,
  projectionIntent,
  repository,
  sealedContract,
  transitionPayload,
} from '../../../helpers/github-record-lifecycle-fixtures.mjs';

function validate(overrides = {}) {
  return validateTransitionAuthority({
    repository,
    issue,
    payload: transitionPayload(),
    authority: activeAuthority(),
    coordinator,
    contract: sealedContract(),
    records: [],
    ...overrides,
  });
}

test('validates exact transition authority and keeps the capability non-serializable', () => {
  const capability = validate();

  assert.equal(Object.isFrozen(capability), true);
  assert.equal(JSON.stringify(capability), '{}');
  assert.throws(
    () =>
      appendLifecycleTransition({
        repository,
        issue,
        transitionAuthority: JSON.parse(JSON.stringify(capability)),
        recordId: id(1),
        deps: memoryLifecycleStore().deps,
      }),
    /lifecycle-transition:capability/
  );
});

test('strict payload validation rejects unknown fields, unstable identities, secrets, and projection conflicts', () => {
  const cases = [
    transitionPayload({ unknown: true }),
    transitionPayload({ operationId: ' lifecycle:1079 ' }),
    transitionPayload({ fromState: 'test', toState: 'test' }),
    transitionPayload({ grantId: id(2) }),
    transitionPayload({ grantEpoch: 2 }),
    transitionPayload({ contractEpoch: 2 }),
    transitionPayload({ projections: [] }),
    transitionPayload({
      projections: [
        {
          ...projectionIntent({ kind: 'timing', number: 1 }),
          expectedRevision: Number.MAX_SAFE_INTEGER + 1,
          nextRevision: Number.MAX_SAFE_INTEGER + 1,
        },
      ],
    }),
    transitionPayload({
      projections: [
        projectionIntent({ kind: 'timing', number: 1 }),
        projectionIntent({ kind: 'timing', number: 2 }),
      ],
    }),
    transitionPayload({
      projections: [
        projectionIntent({ kind: 'timing', number: 1 }),
        projectionIntent({ kind: 'coordination', number: 1 }),
      ],
    }),
    transitionPayload({
      projections: [
        {
          ...projectionIntent({ kind: 'timing', number: 1 }),
          nextBody: 'Authorization: Bearer forbidden',
        },
      ],
    }),
    transitionPayload({
      projections: [
        {
          ...projectionIntent({ kind: 'timing', number: 1 }),
          nextBodyHash: `sha256:${'0'.repeat(64)}`,
        },
      ],
    }),
  ];

  for (const payload of cases) {
    assert.throws(() => validate({ payload }), /lifecycle-transition:/);
  }
});

test('changed contract epoch and stale coordinator grant refuse before append', () => {
  assert.throws(
    () => validate({ contract: sealedContract({ contractEpoch: 2 }) }),
    /lifecycle-transition:contract/
  );
  assert.throws(
    () =>
      validate({
        authority: activeAuthority({ grant: { grantId: id(9100) } }),
      }),
    /lifecycle-transition:authority/
  );
});

test('stale chain head and a record fork refuse before append', async () => {
  const root = capsule({ recordId: id(10) });
  const left = capsule({ recordId: id(11), predecessor: id(10) });
  const right = capsule({ recordId: id(12), predecessor: id(10) });

  assert.throws(() => validate({ records: [root, left, right] }), /lifecycle-transition:fork/);

  const capability = validate({ records: [root] });
  const memory = memoryLifecycleStore({ records: [root, left] });
  await assert.rejects(
    appendLifecycleTransition({
      repository,
      issue,
      transitionAuthority: capability,
      recordId: id(13),
      deps: memory.deps,
    }),
    /capsule-chain:stale-head/
  );
  assert.equal(memory.state.capsuleWrites, 0);
});

test('an exact operation replay returns its durable capsule without a duplicate append', async () => {
  const memory = memoryLifecycleStore();
  const transitionAuthority = validate();
  const first = await appendLifecycleTransition({
    repository,
    issue,
    transitionAuthority,
    recordId: id(20),
    createdAt: '2026-08-05T11:00:00.000Z',
    deps: memory.deps,
  });
  const replay = await appendLifecycleTransition({
    repository,
    issue,
    transitionAuthority,
    recordId: id(21),
    createdAt: '2026-08-05T11:01:00.000Z',
    deps: memory.deps,
  });

  assert.equal(first.record.envelope.recordId, id(20));
  assert.equal(first.replayed, false);
  assert.equal(replay.record.envelope.recordId, id(20));
  assert.equal(replay.replayed, true);
  assert.equal(memory.state.capsuleWrites, 1);
  assert.equal(first.record.envelope.authority.grantId, grantId);
  assert.equal(first.record.envelope.authority.epoch, 1);
  assert.equal(first.record.envelope.payload.branch, branch);
});

test('historical On Deck transition capsules replay byte-for-byte but new writers reject the alias', async () => {
  const historicalPayload = transitionPayload({
    operationId: 'lifecycle:1079:on-deck:refine:1',
    fromState: 'on-deck',
    toState: 'refine',
  });

  assert.throws(
    () => validate({ payload: historicalPayload }),
    /lifecycle-transition:(?:legacy-state|payload)/
  );
  for (const rawAlias of ['On Deck', 'ON-DECK', ' on-deck ']) {
    assert.throws(
      () => validate({ payload: transitionPayload({ fromState: rawAlias, toState: 'refine' }) }),
      /lifecycle-transition:payload/
    );
  }

  const historical = capsule({
    recordId: id(30),
    recordType: 'lifecycle-transition',
    payload: historicalPayload,
  });
  const memory = memoryLifecycleStore({ records: [historical] });
  const transitionAuthority = validate({ payload: historicalPayload, records: [historical] });
  const replay = await appendLifecycleTransition({
    repository,
    issue,
    transitionAuthority,
    recordId: id(31),
    deps: memory.deps,
  });

  assert.equal(replay.replayed, true);
  assert.equal(memory.state.capsuleWrites, 0);
  assert.equal(replay.record.envelope.payload.fromState, 'on-deck');
  assert.equal(replay.record.envelope.payload.toState, 'refine');

  const vanished = memoryLifecycleStore();
  await assert.rejects(
    appendLifecycleTransition({
      repository,
      issue,
      transitionAuthority,
      recordId: id(32),
      deps: vanished.deps,
    }),
    /lifecycle-transition:stale-transition/
  );
  assert.equal(vanished.state.capsuleWrites, 0);
});
