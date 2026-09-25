// @story #1787 #1792
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DeliveryVerificationError,
  VERIFICATION_DIAGNOSTICS,
  deliveryRequirementId,
  verifyDeliveredPullRequest,
  verifyExternalDeliveredPullRequest,
} from '../../../../task-tracker/lib/delivery-verification.mjs';
import {
  requirementById,
  validateDeliveryWaiverIds,
  validateWaiverIds,
} from '../../../../task-tracker/lib/workflow-policy/catalog.mjs';
import {
  CONSUMER_DECLARATIONS,
  assertConsumerCoverage,
} from '../../../../task-tracker/lib/workflow-policy/consumer-coverage.mjs';

const eligible = [
  'accepted-head',
  'pr-merged',
  'pr-scope',
  'trunk-reachability',
  'merge-method',
  'intent-integrity',
  'commit-attribution',
  'branch-disposition',
];
const hard = [
  'input-contract',
  'merge-method-evidence',
  'attribution-waiver-authority',
  'waiver-authority',
];
const id = (suffix) => `delivery.verification.${suffix}`;
const scope = (requirementId) => ({
  exceptionKind: 'delivery.invariant-waiver',
  requirementId,
});

test('delivery verifier IDs are disclosure-only or hard per exact catalog row', () => {
  for (const suffix of eligible) {
    const requirement = requirementById(id(suffix));
    assert.deepEqual(requirement, {
      id: id(suffix),
      family: 'delivery-pr-verifier',
      waivable: false,
      waivableWithDisclosure: true,
    });
    assert.throws(() => validateWaiverIds([id(suffix)]), /non-waivable/);
    assert.deepEqual(validateDeliveryWaiverIds([id(suffix)], scope(id(suffix))), [id(suffix)]);
  }
  for (const suffix of hard) {
    const requirement = requirementById(id(suffix));
    assert.deepEqual(requirement, {
      id: id(suffix),
      family: 'delivery-waiver-guardrail',
      waivable: false,
      waivableWithDisclosure: false,
    });
    assert.throws(() => validateWaiverIds([id(suffix)]), /non-waivable/);
    assert.throws(() => validateDeliveryWaiverIds([id(suffix)], scope(id(suffix))));
  }
});

test('delivery validator requires one known matching disclosure ID and exact kind', () => {
  const selected = id('merge-method');
  for (const ids of [
    [],
    [selected, selected],
    [selected, id('pr-scope')],
    ['planning.deep-dive'],
    ['delivery.tests'],
    ['future.unknown'],
  ]) {
    assert.throws(() => validateDeliveryWaiverIds(ids, scope(selected)));
  }
  for (const badScope of [
    null,
    {},
    { ...scope(selected), requirementId: id('pr-scope') },
    { ...scope(selected), exceptionKind: 'workflow' },
  ]) {
    assert.throws(() => validateDeliveryWaiverIds([selected], badScope));
  }
  assert.throws(() => validateDeliveryWaiverIds(selected, scope(selected)));
  assert.equal(assertConsumerCoverage(CONSUMER_DECLARATIONS), true);
});

test('every literal verifier category has a frozen, strict requirement mapping', () => {
  const source = readFileSync(
    new URL('../../../../task-tracker/lib/delivery-verification.mjs', import.meta.url),
    'utf8'
  );
  const categories = [...source.matchAll(/verificationError\('([^']+)'/g)].map((match) => match[1]);
  assert.ok(categories.length > 20);
  assert.ok(Object.isFrozen(VERIFICATION_DIAGNOSTICS));
  assert.deepEqual(
    Object.keys(VERIFICATION_DIAGNOSTICS)
      .filter(
        (category) =>
          !category.startsWith('delivery-waiver-') &&
          category !== 'merge-method-source-disagreement'
      )
      .sort(),
    [...new Set(categories)].sort()
  );
  for (const category of categories) {
    const diagnostic = VERIFICATION_DIAGNOSTICS[category];
    assert.ok(Object.isFrozen(diagnostic), category);
    assert.equal(deliveryRequirementId(category), diagnostic.requirementId);
    assert.ok(requirementById(diagnostic.requirementId));
    const raised = new DeliveryVerificationError(category);
    assert.equal(raised.category, category);
    assert.equal(raised.requirementId, diagnostic.requirementId);
    assert.equal(raised.outcome, 'missing');
    assert.match(raised.message, new RegExp(`^delivery-verification:${category} predicate=`));
  }
  for (const category of [
    'merge-method-source-disagreement',
    'delivery-waiver-authority',
    'delivery-waiver-replay',
    'delivery-waiver-burn-mismatch',
    'delivery-waiver-ambiguity',
  ]) {
    assert.ok(deliveryRequirementId(category));
  }
  assert.throws(() => deliveryRequirementId('future-category'), /unknown/);
});

test('error exposes immutable mapped ID and outcome, rejecting caller override', () => {
  const error = new DeliveryVerificationError('merge-method', undefined, {
    requirementId: 'delivery.verification.waiver-authority',
    outcome: 'missing',
  });
  assert.equal(error.category, 'merge-method');
  assert.equal(error.requirementId, id('merge-method'));
  assert.equal(error.outcome, 'missing');
  assert.match(error.message, /^delivery-verification:merge-method predicate=/);
  assert.throws(() => {
    error.requirementId = id('pr-scope');
  }, TypeError);
  assert.throws(() => {
    error.outcome = 'waived';
  }, TypeError);
  assert.throws(() => new DeliveryVerificationError('future-category'), /unknown/);
  assert.throws(
    () => new DeliveryVerificationError('merge-method', undefined, { outcome: 'waived' }),
    /outcome/
  );
});

test('structural verifier inputs refuse under hard input-contract', async () => {
  const eligibleRequirement = id('intent-integrity');
  assert.deepEqual(validateDeliveryWaiverIds([eligibleRequirement], scope(eligibleRequirement)), [
    eligibleRequirement,
  ]);
  const functions = {
    fetchOriginTrunk: async () => {},
    isAncestor: async () => true,
    inspectMergeCommit: async () => ({}),
    attributingCommits: async () => [],
  };
  const base = {
    acceptedSha: 'a'.repeat(40),
    acceptedReviewSha: 'a'.repeat(40),
    attributingCommits: functions.attributingCommits,
    fetchOriginTrunk: functions.fetchOriginTrunk,
    inspectMergeCommit: functions.inspectMergeCommit,
    intent: { schema: 'aitm.delivery-intent/v1' },
    intentCreatedAt: '2026-08-22T14:00:00.000Z',
    isAncestor: functions.isAncestor,
    localHeadSha: 'a'.repeat(40),
    pullRequest: {},
    recovery: false,
    testReceiptSha: 'a'.repeat(40),
  };
  const assertInput = async (promise) =>
    assert.rejects(promise, (error) => {
      assert.equal(error.category === 'input' || error.category === 'input-keys', true);
      assert.equal(error.requirementId, id('input-contract'));
      return true;
    });
  await assertInput(verifyDeliveredPullRequest({ ...base, fetchOriginTrunk: null }));
  await assertInput(verifyDeliveredPullRequest({ ...base, pullRequest: null }));
  await assertInput(verifyDeliveredPullRequest({ ...base, intent: null }));
  await assertInput(verifyDeliveredPullRequest({ ...base, extra: true }));
  await assertInput(verifyDeliveredPullRequest({ ...base, recovery: 'false' }));
  const { intent, intentCreatedAt, recovery, ...external } = base;
  await assertInput(verifyExternalDeliveredPullRequest({ ...external, intentInput: {} }));
});
