// @story #1658
const ACTIONS = new Set(['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close']);
const STATUSES = new Set(['ready', 'blocked', 'indeterminate']);
const BLOCKER_CODES = new Set([
  'authority-read-failed',
  'authority-read-skipped',
  'unclassified-refusal',
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
  'registered-legacy-guard',
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

function authoritySubject(value) {
  exact(value, ['issue'], 'blocker-subject');
  positiveInteger(value.issue, 'blocker-subject');
}

function blocker(value) {
  const disposition = Object.hasOwn(value ?? {}, 'remediation')
    ? 'remediation'
    : 'noAutomaticRemediation';
  exact(value, ['args', 'code', 'guardId', disposition], 'blocker-shape');
  if (!GUARDS.has(value.guardId) || !BLOCKER_CODES.has(value.code)) fail('blocker-code');
  args(value.args, 'blocker-args');
  if (value.code === 'authority-read-failed') {
    if (value.guardId !== 'authority-collection') fail('producer-code-pair');
    const keys = Object.hasOwn(value.args, 'subject')
      ? ['reason', 'source', 'subject']
      : ['reason', 'source'];
    exact(value.args, keys, 'blocker-args');
    if (!SOURCES.has(value.args.source)) fail('blocker-source');
    if (
      !new Set(['timeout', 'rate-limited', 'unavailable', 'incomplete', 'invalid']).has(
        value.args.reason
      )
    ) {
      fail('blocker-reason');
    }
    if (value.args.subject) authoritySubject(value.args.subject);
  } else if (value.code === 'authority-read-skipped') {
    if (value.guardId !== 'authority-collection') fail('producer-code-pair');
    const keys = Object.hasOwn(value.args, 'subject') ? ['source', 'subject'] : ['source'];
    exact(value.args, keys, 'blocker-args');
    if (!SOURCES.has(value.args.source)) fail('blocker-source');
    if (value.args.subject) authoritySubject(value.args.subject);
  } else if (value.code === 'unclassified-refusal') {
    if (value.guardId !== 'registered-legacy-guard') fail('producer-code-pair');
    exact(value.args, [], 'blocker-args');
  } else if (value.code === 'state-unavailable') {
    if (value.guardId !== 'action-navigation') fail('producer-code-pair');
    exact(value.args, ['reason'], 'blocker-args');
    if (!new Set(['unknown', 'conflicting']).has(value.args.reason)) fail('blocker-reason');
  } else if (value.code === 'guard-result-invalid' || value.code === 'plan-approval-missing') {
    const expectedGuard =
      value.code === 'guard-result-invalid' ? 'action-result-validation' : 'candidate-precondition';
    if (value.guardId !== expectedGuard) fail('producer-code-pair');
    exact(value.args, [], 'blocker-args');
  } else if (value.code === 'precondition-missing') {
    if (value.guardId !== 'candidate-precondition') fail('producer-code-pair');
    exact(value.args, ['requirement'], 'blocker-args');
  } else if (value.code === 'cross-issue-plan-approval-missing') {
    if (value.guardId !== 'candidate-cross-issue') fail('producer-code-pair');
    exact(value.args, ['actionId', 'issue', 'repository'], 'blocker-args');
    positiveInteger(value.args.issue, 'blocker-issue');
    action(value.args.actionId, 'blocker-action');
    if (value.args.repository !== 'kburson/ai-task-manager') fail('blocker-repository');
  } else if (value.code === 'review-approval-missing') {
    if (value.guardId !== 'candidate-precondition') fail('producer-code-pair');
    exact(value.args, ['head'], 'blocker-args');
    if (!/^[0-9a-f]{40}$/.test(value.args.head)) fail('blocker-head');
  }
  const hasRemediation = Object.hasOwn(value, 'remediation');
  const hasClosed = Object.hasOwn(value, 'noAutomaticRemediation');
  if (hasRemediation === hasClosed) fail('blocker-disposition');
  if (hasRemediation) {
    exact(value.remediation, ['args', 'id'], 'remediation-shape');
    args(value.remediation.args, 'remediation-args');
    if (value.remediation.id === 'satisfy-precondition') {
      exact(value.remediation.args, ['actionId', 'issue'], 'remediation-args');
      positiveInteger(value.remediation.args.issue, 'remediation-issue');
      action(value.remediation.args.actionId, 'remediation-action');
    } else if (value.remediation.id === 'record-plan-approval') {
      exact(value.remediation.args, ['issue'], 'remediation-args');
      positiveInteger(value.remediation.args.issue, 'remediation-issue');
    } else if (value.remediation.id === 'request-review-approval') {
      exact(value.remediation.args, ['head', 'issue'], 'remediation-args');
      positiveInteger(value.remediation.args.issue, 'remediation-issue');
      if (!/^[0-9a-f]{40}$/.test(value.remediation.args.head)) fail('remediation-head');
    } else {
      fail('remediation-id');
    }
  } else {
    exact(value.noAutomaticRemediation, ['reason'], 'no-remediation-shape');
    if (
      !new Set([
        'authority-investigation-required',
        'legacy-guard-requires-human-investigation',
        'state-investigation-required',
        'result-investigation-required',
      ]).has(value.noAutomaticRemediation.reason)
    ) {
      fail('no-remediation-reason');
    }
  }
}

function authoritySubjects(blockers) {
  const bySource = new Map();
  for (const value of blockers) {
    if (!new Set(['authority-read-failed', 'authority-read-skipped']).has(value.code)) continue;
    const group = bySource.get(value.args.source) ?? [];
    group.push(value);
    bySource.set(value.args.source, group);
  }
  for (const group of bySource.values()) {
    if (group.length < 2) continue;
    const subjects = new Set();
    for (const value of group) {
      if (!value.args.subject) fail('blocker-subject-required');
      const identity = JSON.stringify(value.args.subject);
      if (subjects.has(identity)) fail('blocker-subject-duplicate');
      subjects.add(identity);
    }
  }
}

function remediationCoupling(value, result) {
  const remediation = value.remediation;
  if (value.code === 'precondition-missing') {
    if (
      remediation?.id !== 'satisfy-precondition' ||
      remediation.args.issue !== result.issue ||
      remediation.args.actionId !== result.actionId
    ) {
      fail('remediation-coupling');
    }
  } else if (
    value.code === 'plan-approval-missing' ||
    value.code === 'cross-issue-plan-approval-missing'
  ) {
    const issue =
      value.code === 'cross-issue-plan-approval-missing' ? value.args.issue : result.issue;
    if (remediation?.id !== 'record-plan-approval' || remediation.args.issue !== issue) {
      fail('remediation-coupling');
    }
  } else if (value.code === 'review-approval-missing') {
    if (
      remediation?.id !== 'request-review-approval' ||
      remediation.args.issue !== result.issue ||
      remediation.args.head !== value.args.head
    ) {
      fail('remediation-coupling');
    }
  } else {
    const expectedReason = new Map([
      ['authority-read-failed', 'authority-investigation-required'],
      ['authority-read-skipped', 'authority-investigation-required'],
      ['unclassified-refusal', 'legacy-guard-requires-human-investigation'],
      ['state-unavailable', 'state-investigation-required'],
      ['guard-result-invalid', 'result-investigation-required'],
    ]).get(value.code);
    if (expectedReason && value.noAutomaticRemediation?.reason !== expectedReason) {
      fail('remediation-coupling');
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

function warningOrder(values) {
  let sawLegacy = false;
  for (const value of values) {
    if (value.code === 'legacy-guard-warning') sawLegacy = true;
    if (value.code === 'guidance-source-diverged' && sawLegacy) fail('warning-order');
  }
}

function humanDecision(value, result) {
  const required = [];
  for (const returnedBlocker of result.blockers) {
    if (returnedBlocker.code === 'cross-issue-plan-approval-missing') {
      required.push({
        kind: 'plan-approval',
        issue: returnedBlocker.args.issue,
        actionId: returnedBlocker.args.actionId,
        args: {},
      });
    } else if (returnedBlocker.code === 'plan-approval-missing') {
      required.push({ kind: 'plan-approval', issue: result.issue, actionId: 'promote', args: {} });
    } else if (returnedBlocker.code === 'review-approval-missing') {
      required.push({
        kind: 'review-approval',
        issue: result.issue,
        actionId: result.actionId,
        args: { head: returnedBlocker.args.head },
      });
    } else if (
      returnedBlocker.code === 'authority-read-failed' ||
      returnedBlocker.code === 'authority-read-skipped' ||
      returnedBlocker.code === 'unclassified-refusal' ||
      returnedBlocker.code === 'state-unavailable'
    ) {
      required.push({
        kind: 'manual-investigation',
        issue: result.issue,
        actionId: result.actionId,
        args: { guardId: returnedBlocker.guardId, code: returnedBlocker.code },
      });
    }
  }
  if (value === null) {
    if (required.length !== 0) fail('human-coupling');
    return;
  }
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
  if (value.requests.length !== required.length) fail('human-coupling');
  required.forEach((expected, index) => {
    const actual = value.requests[index];
    if (
      actual.kind !== expected.kind ||
      actual.subject.issue !== expected.issue ||
      actual.subject.actionId !== expected.actionId ||
      JSON.stringify(actual.args) !== JSON.stringify(expected.args)
    ) {
      fail('human-coupling');
    }
  });
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
  authoritySubjects(result.blockers);
  result.blockers.forEach((value) => remediationCoupling(value, result));
  if (result.status === 'ready' && result.blockers.length !== 0) fail('ready-blockers');
  if (result.status !== 'ready' && result.blockers.length === 0) fail('not-ready-blockers');
  if (!Array.isArray(result.normalizations)) fail('normalizations');
  result.normalizations.forEach(normalization);
  if (!Array.isArray(result.warnings)) fail('warnings');
  result.warnings.forEach(warning);
  warningOrder(result.warnings);
  humanDecision(result.humanDecision, result);
  return result;
}
