// @story #1079
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  appendLifecycleTransition,
  validateTransitionAuthority,
} from '../../../lib/github-records/lifecycle-transition.mjs';
import { repairIssueProjections } from '../../../lib/github-records/projection-repair.mjs';
import {
  activeAuthority,
  capsule,
  coordinator,
  id,
  issue,
  memoryLifecycleStore,
  repository,
  sealedContract,
  transitionPayload,
} from '../../helpers/github-record-lifecycle-fixtures.mjs';

function validationInput(memory, overrides = {}) {
  return {
    repository,
    issue,
    payload: transitionPayload(),
    authority: activeAuthority(),
    coordinator,
    contract: sealedContract(),
    records: memory.state.records,
    ...overrides,
  };
}

async function append(memory, overrides = {}) {
  const transitionAuthority = validateTransitionAuthority(validationInput(memory));
  return appendLifecycleTransition({
    repository,
    issue,
    transitionAuthority,
    recordId: id(200),
    createdAt: '2026-08-05T11:00:00.000Z',
    deps: memory.deps,
    ...overrides,
  });
}

function repairInput(memory, appended, overrides = {}) {
  return {
    repository,
    issue,
    transitionAuthority: appended.transitionAuthority,
    authority: activeAuthority(),
    coordinator,
    contract: sealedContract(),
    records: memory.state.records,
    deps: memory.deps,
    ...overrides,
  };
}

test('the transition capsule is appended and read back before ordered singleton projection writes', async () => {
  const memory = memoryLifecycleStore();
  const appended = await append(memory);
  const repaired = await repairIssueProjections(repairInput(memory, appended));

  const capsuleRead = memory.state.events.indexOf('capsule-readback');
  const evidenceWrite = memory.state.events.indexOf('projection-write:evidence-projection');
  const timingWrite = memory.state.events.indexOf('projection-write:timing');
  assert.ok(capsuleRead >= 0 && capsuleRead < evidenceWrite);
  assert.ok(evidenceWrite < timingWrite);
  assert.deepEqual(repaired.repairedKinds, ['evidence-projection', 'timing']);
  assert.equal(memory.state.capsuleWrites, 1);
  assert.equal(memory.state.projectionWrites, 2);
});

test('every append and projection mutation boundary replays to one authority and exact projections', async () => {
  const phases = [
    'before-capsule',
    'after-capsule',
    'after-capsule-readback',
    'before-projection:evidence-projection',
    'after-projection:evidence-projection',
    'after-projection-readback:evidence-projection',
    'before-projection:timing',
    'after-projection:timing',
    'after-projection-readback:timing',
  ];

  for (const phase of phases) {
    const memory = memoryLifecycleStore();
    let appended;
    const crashAt = ({ phase: observed }) => {
      if (observed === phase) throw new Error(`injected:${phase}`);
    };
    try {
      appended = await append(memory, { crashAt });
      await repairIssueProjections(repairInput(memory, appended, { crashAt }));
      assert.fail(`expected ${phase}`);
    } catch (error) {
      assert.match(error.message, new RegExp(`injected:${phase}`));
    }

    appended = await append(memory);
    const repaired = await repairIssueProjections(repairInput(memory, appended));
    const replay = await repairIssueProjections(repairInput(memory, appended));
    assert.equal(memory.state.capsuleWrites, 1, phase);
    assert.equal(memory.state.projectionWrites, 2, phase);
    assert.deepEqual(repaired.pendingKinds, [], phase);
    assert.deepEqual(replay.repairedKinds, [], phase);
    assert.deepEqual(replay.alreadyAppliedKinds, ['evidence-projection', 'timing'], phase);
  }
});

test('serialized proof, changed contract, stale grant, fork, and projection drift block repair writes', async () => {
  const cases = [
    (memory, appended) => ({
      ...repairInput(memory, appended),
      transitionAuthority: JSON.parse(JSON.stringify(appended.transitionAuthority)),
    }),
    (memory, appended) => ({
      ...repairInput(memory, appended),
      contract: sealedContract({ contractEpoch: 2 }),
    }),
    (memory, appended) => ({
      ...repairInput(memory, appended),
      authority: activeAuthority({ grant: { epoch: 2 } }),
    }),
    (memory, appended) => {
      const predecessor = memory.state.records[0].envelope.predecessor;
      memory.state.records.push(capsule({ recordId: id(299), predecessor }));
      return repairInput(memory, appended);
    },
    (memory, appended) => {
      const first = transitionPayload().projections[0];
      memory.state.projections.get(first.singletonCommentNodeId).bodyHash =
        `sha256:${'0'.repeat(64)}`;
      return repairInput(memory, appended);
    },
  ];

  for (const makeInput of cases) {
    const memory = memoryLifecycleStore();
    const appended = await append(memory);
    await assert.rejects(
      () => repairIssueProjections(makeInput(memory, appended)),
      /(?:lifecycle-transition|projection-repair):/
    );
    assert.equal(memory.state.projectionWrites, 0);
  }
});
