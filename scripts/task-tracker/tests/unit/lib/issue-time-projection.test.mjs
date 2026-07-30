// @story #1049
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  issueTimeProjectionMatches,
  reconcileIssueTimeProjection,
} from '../../../lib/work-lease/issue-time-projection.mjs';

const EXPECTED = Object.freeze({
  bodyFields: {
    engagedTime: 17,
    sessionTime: 12,
    reviewTime: 5,
    planTime: 3,
  },
  projectFields: {
    engagedTime: '00d 00h 17m 00s',
    sessionTime: '00d 00h 12m 00s',
    reviewTime: '00d 00h 05m 00s',
    planTime: '00d 00h 03m 00s',
  },
});

test('exact body and Projects V2 values prove issue-time reconciliation', () => {
  assert.equal(
    issueTimeProjectionMatches(
      {
        bodyFields: { ...EXPECTED.bodyFields, size: 'M' },
        projectFields: { ...EXPECTED.projectFields, priority: 'P1' },
      },
      EXPECTED
    ),
    true
  );
  assert.equal(
    issueTimeProjectionMatches(
      {
        bodyFields: EXPECTED.bodyFields,
        projectFields: { ...EXPECTED.projectFields, planTime: '00d 00h 02m 59s' },
      },
      EXPECTED
    ),
    false
  );
});

test('issue-time response loss reconciles from exact production-shaped readback', async () => {
  let remote = {
    bodyFields: { ...EXPECTED.bodyFields, engagedTime: null },
    projectFields: { ...EXPECTED.projectFields, engagedTime: '00d 00h 00m 00s' },
  };
  let mutations = 0;
  const proof = await reconcileIssueTimeProjection({
    expected: EXPECTED,
    readState: async () => structuredClone(remote),
    mutate: async () => {
      mutations += 1;
      remote = structuredClone(EXPECTED);
      throw new Error('transport response lost after GitHub accepted writes');
    },
  });

  assert.equal(mutations, 1);
  assert.equal(proof.reconciled, true);
  assert.equal(proof.recoveredAfterResponseLoss, true);
  assert.deepEqual(proof.state, EXPECTED);
});

test('a generic body marker cannot prove a missing Projects V2 field write', async () => {
  const partial = {
    bodyFields: EXPECTED.bodyFields,
    projectFields: { ...EXPECTED.projectFields, engagedTime: null },
    switchProjectionMarker: true,
  };
  await assert.rejects(
    () =>
      reconcileIssueTimeProjection({
        expected: EXPECTED,
        readState: async () => partial,
        mutate: async () => {},
      }),
    /issue-time exact remote read-back does not match/
  );
});
