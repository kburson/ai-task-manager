// @story #1658
const ACTIONS = new Set(['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close']);
const STATUSES = new Set(['ready', 'blocked', 'indeterminate']);
const BLOCKER_CODES = new Set([
  'authority-read-failed',
  'state-unavailable',
  'guard-result-invalid',
  'precondition-missing',
  'cross-issue-plan-approval-missing',
  'plan-approval-missing',
  'review-approval-missing',
]);
const GUARDS = new Set([
  'candidate-precondition',
  'candidate-cross-issue',
  'authority-collection',
  'action-navigation',
  'action-result-validation',
]);
const SOURCES = new Set(['issue-body', 'issue-comment', 'project-board', 'delivery', 'timing-log']);

function fail(reason) {
  throw new TypeError(`guidance-candidate:presentation-${reason}`);
}

function exact(value, keys, reason) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(reason);
  }
}

function positiveInteger(value, reason) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(reason);
}

function action(value, reason, nullable = false) {
  if (nullable && value === null) return;
  if (!ACTIONS.has(value)) fail(reason);
}

function args(value, reason) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
}

function blocker(value) {
  const disposition = Object.hasOwn(value ?? {}, 'remediation')
    ? 'remediation'
    : 'noAutomaticRemediation';
  exact(value, ['args', 'code', 'guardId', disposition], 'blocker-shape');
  if (!GUARDS.has(value.guardId) || !BLOCKER_CODES.has(value.code)) fail('blocker-code');
  args(value.args, 'blocker-args');
  if (value.code === 'authority-read-failed') {
    exact(value.args, ['reason', 'source'], 'blocker-args');
    if (!SOURCES.has(value.args.source)) fail('blocker-source');
    if (
      !new Set(['timeout', 'rate-limited', 'unavailable', 'incomplete', 'invalid']).has(
        value.args.reason
      )
    ) {
      fail('blocker-reason');
    }
  } else if (value.code === 'state-unavailable') {
    exact(value.args, ['reason'], 'blocker-args');
    if (!new Set(['unknown', 'conflicting']).has(value.args.reason)) fail('blocker-reason');
  } else if (value.code === 'guard-result-invalid' || value.code === 'plan-approval-missing') {
    exact(value.args, [], 'blocker-args');
  } else if (value.code === 'precondition-missing') {
    exact(value.args, ['requirement'], 'blocker-args');
  } else if (value.code === 'review-approval-missing') {
    exact(value.args, ['head'], 'blocker-args');
    if (!/^[0-9a-f]{40}$/.test(value.args.head)) fail('blocker-head');
  }
  const hasRemediation = Object.hasOwn(value, 'remediation');
  const hasClosed = Object.hasOwn(value, 'noAutomaticRemediation');
  if (hasRemediation === hasClosed) fail('blocker-disposition');
  if (hasRemediation) {
    exact(value.remediation, ['args', 'id'], 'remediation-shape');
    args(value.remediation.args, 'remediation-args');
    if (
      !new Set(['satisfy-precondition', 'record-plan-approval', 'request-review-approval']).has(
        value.remediation.id
      )
    ) {
      fail('remediation-id');
    }
  } else {
    exact(value.noAutomaticRemediation, ['reason'], 'no-remediation-shape');
    if (
      !new Set([
        'authority-investigation-required',
        'state-investigation-required',
        'result-investigation-required',
      ]).has(value.noAutomaticRemediation.reason)
    ) {
      fail('no-remediation-reason');
    }
  }
}

function normalization(value) {
  exact(value, ['decisions', 'disposition', 'normalizerId'], 'normalization-shape');
  if (value.normalizerId !== 'functional-dod-derived/v1') fail('normalizer-id');
  if (value.disposition !== 'persist-on-execute') fail('normalization-disposition');
  if (!Array.isArray(value.decisions) || value.decisions.length === 0) {
    fail('normalization-decisions');
  }
  let previous = -1;
  for (const decision of value.decisions) {
    exact(decision, ['derivationRule', 'key', 'stamp', 'tick'], 'normalization-decision');
    const position = ['acs', 'checkboxes'].indexOf(decision.key);
    if (position < 0 || position <= previous) fail('normalization-order');
    previous = position;
    if (decision.derivationRule !== `derive-${decision.key}/v1`) fail('normalization-rule');
    if (typeof decision.stamp !== 'boolean' || typeof decision.tick !== 'boolean') {
      fail('normalization-booleans');
    }
  }
}

function warning(value) {
  exact(value, ['args', 'code'], 'warning-shape');
  args(value.args, 'warning-args');
  if (value.code === 'guidance-source-diverged') {
    exact(value.args, ['digest', 'source'], 'warning-args');
    if (
      value.args.source !== '.ai-task-manager/aitm-guidance.yml' ||
      !/^sha256:[0-9a-f]{64}$/.test(value.args.digest)
    ) {
      fail('warning-source');
    }
  } else if (value.code === 'legacy-guard-warning') {
    exact(value.args, ['guardId'], 'warning-args');
    if (!GUARDS.has(value.args.guardId)) fail('warning-guard');
  } else {
    fail('warning-code');
  }
}

function humanDecision(value, result) {
  if (value === null) return;
  exact(value, ['requests'], 'human-decision-shape');
  if (!Array.isArray(value.requests) || value.requests.length === 0) fail('human-requests');
  for (const request of value.requests) {
    exact(request, ['actor', 'args', 'kind', 'subject'], 'human-request-shape');
    exact(request.subject, ['actionId', 'issue'], 'human-subject');
    positiveInteger(request.subject.issue, 'human-issue');
    args(request.args, 'human-args');
    if (request.kind === 'plan-approval') {
      if (request.actor !== 'configured-approver') fail('human-actor');
      action(request.subject.actionId, 'human-action');
      exact(request.args, [], 'human-args');
    } else if (request.kind === 'review-approval') {
      if (request.actor !== 'configured-approver') fail('human-actor');
      action(request.subject.actionId, 'human-action');
      exact(request.args, ['head'], 'human-args');
      if (!/^[0-9a-f]{40}$/.test(request.args.head)) fail('human-head');
    } else if (request.kind === 'manual-investigation') {
      if (request.actor !== 'human-operator') fail('human-actor');
      action(request.subject.actionId, 'human-action', true);
      exact(request.args, ['code', 'guardId'], 'human-args');
    } else {
      fail('human-kind');
    }
  }
  if (result.status === 'ready') fail('ready-human');
}

export function validateCandidatePresentation(result) {
  exact(
    result,
    ['actionId', 'blockers', 'humanDecision', 'issue', 'normalizations', 'status', 'warnings'],
    'shape'
  );
  positiveInteger(result.issue, 'issue');
  action(result.actionId, 'action', true);
  if (!STATUSES.has(result.status)) fail('status');
  if (!Array.isArray(result.blockers)) fail('blockers');
  result.blockers.forEach(blocker);
  if (result.status === 'ready' && result.blockers.length !== 0) fail('ready-blockers');
  if (result.status !== 'ready' && result.blockers.length === 0) fail('not-ready-blockers');
  if (!Array.isArray(result.normalizations)) fail('normalizations');
  result.normalizations.forEach(normalization);
  if (!Array.isArray(result.warnings)) fail('warnings');
  result.warnings.forEach(warning);
  humanDecision(result.humanDecision, result);
  return result;
}
