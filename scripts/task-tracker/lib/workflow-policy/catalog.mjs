export const WORKFLOW_POLICY_CAPABILITY = 'aitm.workflow-policy/v1';

function item(id, family, waivable) {
  return Object.freeze({ id, family, waivable });
}

const CATALOG = Object.freeze([
  item('planning.deep-dive', 'planning-output', true),
  item('planning.metadata', 'planning-output', true),
  item('planning.planned-estimate', 'planning-output', true),
  item('planning.forecast', 'planning-output', true),
  item('approval.plan', 'plan-approval', true),
  item('review.design', 'semantic-review', true),
  item('review.implementation', 'semantic-review', true),
  item('review.peer', 'semantic-review', true),
  item('review.semantic-resident', 'semantic-review', true),
  item('approval.human-completion', 'completion-approval', true),
  item('delivery.tests', 'delivery-invariant', false),
  item('delivery.verification-evidence', 'delivery-invariant', false),
  item('delivery.ownership', 'delivery-invariant', false),
  item('delivery.dependencies', 'delivery-invariant', false),
  item('delivery.issue-binding', 'delivery-invariant', false),
  item('delivery.state-contiguity', 'delivery-invariant', false),
  item('delivery.commit-provenance', 'delivery-invariant', false),
  item('delivery.ci', 'delivery-invariant', false),
  item('delivery.safe-delivery', 'delivery-invariant', false),
  item('delivery.external-protection', 'delivery-invariant', false),
]);

const BY_ID = new Map(CATALOG.map((requirement) => [requirement.id, requirement]));

const BUNDLES = Object.freeze({
  'no-plan/v1': Object.freeze({
    bundle: 'no-plan/v1',
    requirementIds: Object.freeze([
      'planning.deep-dive',
      'planning.metadata',
      'planning.planned-estimate',
      'planning.forecast',
    ]),
    explicitCompanions: Object.freeze(['approval.plan']),
  }),
  'no-review/v1': Object.freeze({
    bundle: 'no-review/v1',
    requirementIds: Object.freeze([
      'review.design',
      'review.implementation',
      'review.peer',
      'review.semantic-resident',
    ]),
    explicitCompanions: Object.freeze(['approval.human-completion']),
  }),
});

export const SUPPORTED_CONSTRAINTS = Object.freeze({
  'provider.managed-execution': Object.freeze({ effects: Object.freeze(['deny']) }),
});

export function requirementCatalog() {
  return CATALOG;
}

export function requirementById(id) {
  const requirement = BY_ID.get(String(id));
  if (!requirement) throw new TypeError(`workflow-policy:unknown-requirement:${String(id)}`);
  return requirement;
}

export function expandBundle(name) {
  const bundle = BUNDLES[String(name)];
  if (!bundle) throw new TypeError(`workflow-policy:unsupported-bundle:${String(name)}`);
  return bundle;
}

export function validateWaiverIds(ids = []) {
  if (!Array.isArray(ids)) throw new TypeError('workflow-policy:requirement-ids');
  const seen = new Set();
  for (const id of ids) {
    const requirement = requirementById(id);
    if (!requirement.waivable) {
      throw new TypeError(`workflow-policy:non-waivable-requirement:${requirement.id}`);
    }
    if (seen.has(requirement.id)) {
      throw new TypeError(`workflow-policy:duplicate-requirement:${requirement.id}`);
    }
    seen.add(requirement.id);
  }
  return Object.freeze([...seen]);
}

export function validateConstraints(constraints = []) {
  if (!Array.isArray(constraints)) throw new TypeError('workflow-policy:constraints');
  return Object.freeze(
    constraints.map((constraint) => {
      const supported = SUPPORTED_CONSTRAINTS[constraint?.id];
      if (!supported) {
        throw new TypeError(`workflow-policy:unknown-constraint:${String(constraint?.id)}`);
      }
      if (!supported.effects.includes(constraint.effect)) {
        throw new TypeError(
          `workflow-policy:unsupported-constraint-effect:${constraint.id}:${String(constraint.effect)}`
        );
      }
      return Object.freeze({ id: constraint.id, effect: constraint.effect });
    })
  );
}
