import { requirementCatalog, requirementById } from './catalog.mjs';

export const CONSUMER_DECLARATIONS = Object.freeze({
  'plan-exit': Object.freeze([
    'planning.deep-dive',
    'planning.metadata',
    'planning.planned-estimate',
    'planning.forecast',
    'approval.plan',
  ]),
  'review-activity': Object.freeze([
    'review.design',
    'review.implementation',
    'review.peer',
    'review.semantic-resident',
  ]),
  'delivery-review-authority': Object.freeze(['review.semantic-resident']),
  completion: Object.freeze(['approval.human-completion']),
  verification: Object.freeze(['delivery.tests', 'delivery.verification-evidence']),
  ownership: Object.freeze(['delivery.ownership']),
  dependencies: Object.freeze(['delivery.dependencies']),
  binding: Object.freeze(['delivery.issue-binding']),
  contiguity: Object.freeze(['delivery.state-contiguity']),
  'commit-provenance': Object.freeze(['delivery.commit-provenance']),
  ci: Object.freeze(['delivery.ci']),
  delivery: Object.freeze(['delivery.safe-delivery']),
  protection: Object.freeze(['delivery.external-protection']),
  'delivery-pr-verifier': Object.freeze([
    'delivery.verification.accepted-head',
    'delivery.verification.pr-merged',
    'delivery.verification.pr-scope',
    'delivery.verification.trunk-reachability',
    'delivery.verification.merge-method',
    'delivery.verification.intent-integrity',
    'delivery.verification.commit-attribution',
    'delivery.verification.branch-disposition',
    'delivery.verification.input-contract',
    'delivery.verification.merge-method-evidence',
  ]),
  'delivery-pinned-evidence': Object.freeze(['delivery.verification.attribution-waiver-authority']),
  'delivery-waiver-authority-resolver': Object.freeze(['delivery.verification.waiver-authority']),
});

export function assertConsumerCoverage(declarations = CONSUMER_DECLARATIONS) {
  if (!declarations || typeof declarations !== 'object' || Array.isArray(declarations)) {
    throw new TypeError('workflow-policy:consumer-declarations');
  }
  const covered = new Set();
  for (const [consumer, ids] of Object.entries(declarations)) {
    if (!consumer || !Array.isArray(ids)) {
      throw new TypeError(`workflow-policy:consumer-declaration:${consumer}`);
    }
    for (const id of ids) {
      requirementById(id);
      covered.add(id);
    }
  }
  const missing = requirementCatalog()
    .map(({ id }) => id)
    .filter((id) => !covered.has(id));
  if (missing.length > 0) {
    throw new TypeError(`workflow-policy:unmapped-requirements:${missing.join(',')}`);
  }
  return true;
}
