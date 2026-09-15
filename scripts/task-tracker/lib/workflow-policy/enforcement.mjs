// @story #1628
// Shared, read-only workflow-policy decision used at live enforcement boundaries.

import { evaluateWorkflowPolicy } from './evaluator.mjs';
import { resolveWorkflowExceptionRecords } from './exception-record.mjs';
import { computeScopeIdentity } from './scope-identity.mjs';
import { gql } from '../../../gh/lib/github-projects.mjs';
import { listIssueCommentsSince } from '../github-records/github-comment-store.mjs';

const GUARD_REQUIREMENTS = Object.freeze({
  'plan-exit-plan-approved': Object.freeze(['approval.plan']),
  'plan-exit-planned-estimate': Object.freeze(['planning.planned-estimate', 'planning.forecast']),
  'plan-exit-deep-dive': Object.freeze(['planning.deep-dive']),
  'plan-exit-plan-metadata': Object.freeze(['planning.metadata']),
  'body-gates-entry-test': Object.freeze(['planning.deep-dive']),
  'body-gates-entry-review': Object.freeze(['planning.deep-dive']),
  'body-gates-entry-done': Object.freeze(['planning.deep-dive']),
});

export function requirementIdsForGuardRefusals(refusals = []) {
  return Object.freeze([
    ...new Set(refusals.flatMap(({ id }) => GUARD_REQUIREMENTS[id] || Object.freeze([]))),
  ]);
}

function withAccessors(value) {
  const byId = new Map(value.decisions.map((item) => [item.id, item]));
  return Object.freeze({
    ...value,
    decision(id) {
      return byId.get(String(id)) ?? null;
    },
    isWaived(id) {
      return byId.get(String(id))?.outcome === 'waived';
    },
  });
}

function missingEvidence(requirementIds, evidence = {}) {
  return Object.fromEntries(requirementIds.map((id) => [id, evidence[id] ?? { state: 'missing' }]));
}

export function indeterminateWorkflowBoundary({
  repository,
  issue,
  requirementIds = [],
  error,
} = {}) {
  const detail = error?.message ?? String(error ?? 'workflow policy unavailable');
  return withAccessors({
    schema: 'aitm.workflow-boundary-policy/v1',
    status: 'indeterminate',
    repository,
    issue,
    scopeIdentity: null,
    exceptionStatus: 'indeterminate',
    decisions: Object.freeze(
      requirementIds.map((id) =>
        Object.freeze({
          id,
          outcome: 'missing',
          evaluation: 'evaluated',
          reasonCode: 'policy-authority-unavailable',
        })
      )
    ),
    prohibitions: Object.freeze([]),
    blockers: Object.freeze([Object.freeze({ code: 'policy-authority-unavailable', detail })]),
    conflicts: Object.freeze([Object.freeze({ code: 'policy-authority-unavailable', detail })]),
  });
}

export function evaluateWorkflowBoundary({
  repository,
  issue,
  body,
  records = [],
  requirementIds = [],
  evidence = {},
  activity,
  state,
  now = new Date().toISOString(),
} = {}) {
  const scopeIdentity = computeScopeIdentity({ repository, issue, body });
  const exception = resolveWorkflowExceptionRecords({
    records,
    repository,
    issue,
    currentScopeIdentity: scopeIdentity,
    now,
  });
  const evaluatorRecords =
    exception.status === 'none' || exception.status === 'invalid'
      ? []
      : [exception.active || exception.head].filter(Boolean);
  const evaluation = evaluateWorkflowPolicy({
    repository,
    issue,
    scopeIdentity,
    now,
    state,
    activity,
    baselineRequirementIds: requirementIds,
    evidence: missingEvidence(requirementIds, evidence),
    records: evaluatorRecords,
  });
  const exceptionConflicts =
    exception.status === 'invalid' ? exception.conflicts : Object.freeze([]);
  const blockers = Object.freeze([...evaluation.blockers, ...exceptionConflicts]);
  const conflicts = Object.freeze([...evaluation.conflicts, ...exceptionConflicts]);
  return withAccessors({
    schema: 'aitm.workflow-boundary-policy/v1',
    status: blockers.length === 0 ? 'policy-compatible' : 'blocked',
    repository,
    issue,
    scopeIdentity,
    exceptionStatus: exception.status,
    decisions: evaluation.decisions,
    prohibitions: evaluation.prohibitions,
    blockers,
    conflicts,
  });
}

export async function loadWorkflowBoundary(input = {}) {
  try {
    const records = await input.runtime.listRecords(input.issue);
    return evaluateWorkflowBoundary({ ...input, records });
  } catch (error) {
    return indeterminateWorkflowBoundary({ ...input, error });
  }
}

export function createGithubWorkflowBoundaryRuntime({ repository, graphql } = {}) {
  const runGraphql =
    graphql || (({ query, variables }) => gql(query, variables).then((data) => ({ data })));
  return Object.freeze({
    async listRecords(issue) {
      return listIssueCommentsSince({
        repository,
        issue,
        since: '1970-01-01T00:00:00.000Z',
        graphql: runGraphql,
      });
    },
  });
}
