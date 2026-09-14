// @story #1625
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORKFLOW_POLICY_CAPABILITY,
  requirementCatalog,
  expandBundle,
  requirementById,
} from '../../../../../task-tracker/lib/workflow-policy/catalog.mjs';
import {
  CONSUMER_DECLARATIONS,
  assertConsumerCoverage,
} from '../../../../../task-tracker/lib/workflow-policy/consumer-coverage.mjs';

test('catalog is finite, versioned, unique, and deeply immutable', () => {
  assert.equal(WORKFLOW_POLICY_CAPABILITY, 'aitm.workflow-policy/v1');
  const catalog = requirementCatalog();
  assert.ok(catalog.length >= 15);
  assert.equal(new Set(catalog.map(({ id }) => id)).size, catalog.length);
  assert.ok(Object.isFrozen(catalog));
  assert.ok(catalog.every((item) => Object.isFrozen(item)));
  assert.throws(() => catalog.push({ id: 'later' }), TypeError);
});

test('planning and review bundles are explicit and do not absorb approvals', () => {
  assert.deepEqual(expandBundle('no-plan/v1'), {
    bundle: 'no-plan/v1',
    requirementIds: [
      'planning.deep-dive',
      'planning.metadata',
      'planning.planned-estimate',
      'planning.forecast',
    ],
    explicitCompanions: ['approval.plan'],
  });
  assert.deepEqual(expandBundle('no-review/v1').requirementIds, [
    'review.design',
    'review.implementation',
    'review.peer',
    'review.semantic-resident',
  ]);
  assert.ok(!expandBundle('no-review/v1').requirementIds.includes('approval.human-completion'));
});

test('unknown bundles and requirements fail closed', () => {
  assert.throws(() => expandBundle('no-plan/v2'), /unsupported-bundle/);
  assert.throws(() => requirementById('planning.anything'), /unknown-requirement/);
});

test('delivery invariants are non-waivable', () => {
  for (const id of [
    'delivery.tests',
    'delivery.verification-evidence',
    'delivery.ownership',
    'delivery.dependencies',
    'delivery.issue-binding',
    'delivery.state-contiguity',
    'delivery.commit-provenance',
    'delivery.ci',
    'delivery.safe-delivery',
    'delivery.external-protection',
  ]) {
    assert.equal(requirementById(id).waivable, false, id);
  }
});

test('consumer coverage rejects missing and unknown mappings', () => {
  assert.equal(assertConsumerCoverage(CONSUMER_DECLARATIONS), true);
  assert.throws(
    () => assertConsumerCoverage({ ...CONSUMER_DECLARATIONS, verification: [] }),
    /unmapped-requirements/
  );
  assert.throws(
    () => assertConsumerCoverage({ ...CONSUMER_DECLARATIONS, invented: ['future.unknown'] }),
    /unknown-requirement/
  );
});
