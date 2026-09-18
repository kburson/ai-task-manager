// @story #1658
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCandidateDecision,
  buildCrossIssueCandidateDecision,
  buildTerminalCandidateDecision,
  candidateConstants,
  projectOverrideProtocol,
  renderCandidateExplanation,
  validateCandidateDecision,
  validateCandidateExplanation,
} from './guidance-characterization.mjs';

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/1558/action-decision-fixtures'
);
const actions = ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close'];
const fixtures = Object.fromEntries(
  actions.map((action) => [
    action,
    JSON.parse(readFileSync(path.join(fixtureRoot, `${action}.json`), 'utf8')),
  ])
);

function clone(value) {
  return structuredClone(value);
}

function decision(action, scenario = 'ready', evidenceCopies = 1) {
  return buildCandidateDecision({ fixture: fixtures[action], scenario, evidenceCopies });
}

function rejectsDecision(action, scenario, mutate, expected = /guidance-candidate:/) {
  const value = clone(decision(action, scenario));
  mutate(value);
  assert.throws(() => validateCandidateDecision(value), expected);
}

function rejectsPresentation(action, scenario, mutate) {
  const envelope = clone(renderCandidateExplanation({ decision: decision(action, scenario) }));
  mutate(envelope.result);
  assert.throws(() => validateCandidateExplanation(envelope), /guidance-candidate:/);
}

function warningRecord() {
  return {
    code: 'guidance-source-diverged',
    args: {
      source: '.ai-task-manager/aitm-guidance.yml',
      digest: candidateConstants.SOURCE_DIGEST,
    },
  };
}

function twoBlockerDecision() {
  const value = clone(decision('resume', 'indeterminate'));
  value.actionId = null;
  value.guidanceIds = ['navigation.unresolved'];
  value.humanDecision.requests[0].subject.actionId = null;
  value.blockers.push({
    guardId: 'action-navigation',
    code: 'state-unavailable',
    args: { reason: 'conflicting' },
    noAutomaticRemediation: { reason: 'state-investigation-required' },
  });
  value.humanDecision.requests.push({
    kind: 'manual-investigation',
    actor: 'human-operator',
    subject: { issue: value.issue, actionId: value.actionId },
    args: { guardId: 'action-navigation', code: 'state-unavailable' },
  });
  return validateCandidateDecision(value);
}

function navigationDecision() {
  const value = clone(decision('close', 'indeterminate'));
  value.actionId = null;
  value.blockers = [
    {
      guardId: 'action-navigation',
      code: 'state-unavailable',
      args: { reason: 'unknown' },
      noAutomaticRemediation: { reason: 'state-investigation-required' },
    },
  ];
  value.humanDecision = {
    requests: [
      {
        kind: 'manual-investigation',
        actor: 'human-operator',
        subject: { issue: value.issue, actionId: null },
        args: { guardId: 'action-navigation', code: 'state-unavailable' },
      },
    ],
  };
  value.guidanceIds = ['navigation.unresolved'];
  return value;
}

function outerRefusal() {
  const value = clone(decision('bind', 'indeterminate'));
  value.blockers = [
    {
      guardId: 'action-result-validation',
      code: 'guard-result-invalid',
      args: {},
      noAutomaticRemediation: { reason: 'result-investigation-required' },
    },
  ];
  value.humanDecision = null;
  return validateCandidateDecision(value);
}

function legacyRefusal(reason) {
  assert.equal(typeof reason, 'string');
  const value = decision('resume', 'blocked');
  assert.equal(JSON.stringify(value).includes(reason), false);
  return validateCandidateDecision(value);
}

function assertRoutineHasNoEvidence(value) {
  const bytes = JSON.stringify(renderCandidateExplanation({ decision: value }));
  assert.equal(bytes.includes('snapshot'), false);
  assert.equal(bytes.includes('observations'), false);
  assert.equal(bytes.includes('decisionDigest'), false);
}

function crossIssueDecision() {
  return buildCrossIssueCandidateDecision({
    fixture: fixtures.close,
    targetFixture: fixtures.promote,
  });
}

const probes = {
  'evidence.bundle-complete': () =>
    rejectsDecision('promote', 'ready', (value) => (value.snapshot.observations = [])),
  'evidence.observation-window': () =>
    rejectsDecision('promote', 'ready', (value) => {
      value.snapshot.startedAt = '2026-09-17T18:00:02.000Z';
    }),
  'evidence.snapshot-digest': () =>
    rejectsDecision('promote', 'ready', (value) => {
      value.snapshot.digest = `sha256:${'0'.repeat(64)}`;
    }),
  'evidence.refresh-provenance': () => {
    const value = decision('promote', 'ready', 3);
    assert.equal(value.snapshot.observations.length, 3);
    assert.equal(new Set(value.snapshot.observations.map(({ identity }) => identity)).size, 3);
  },
  'evidence.missing-not-empty': () =>
    rejectsDecision('promote', 'ready', (value) => (value.snapshot.observations = [])),
  'normalization.identity': () =>
    rejectsDecision('close', 'normalization', (value) => {
      value.normalizations[0].normalizerId = 'unknown';
    }),
  'normalization.decision-fields': () =>
    rejectsDecision('close', 'normalization', (value) => {
      delete value.normalizations[0].decisions[0].tick;
    }),
  'normalization.digest-omissions': () => {
    const first = decision('close', 'normalization');
    const second = clone(first);
    second.snapshot.startedAt = '2026-09-17T18:00:00.100Z';
    assert.equal(first.normalizations[0].decisionDigest, second.normalizations[0].decisionDigest);
  },
  'evidence.digest-not-authority': () => {
    const first = renderCandidateExplanation({ decision: decision('bind', 'ready', 1) });
    const second = renderCandidateExplanation({ decision: decision('bind', 'ready', 4) });
    assert.deepEqual(first.result, second.result);
  },
  'evidence.head-body-refresh': () =>
    rejectsDecision('deliver', 'ready', (value) => {
      value.snapshot.head = 'f'.repeat(40);
    }),
  'presentation.issue': () => rejectsPresentation('close', 'blocked', (value) => (value.issue = 0)),
  'presentation.action-id': () =>
    rejectsPresentation('close', 'blocked', (value) => (value.actionId = 'workflow.close')),
  'presentation.status': () =>
    rejectsPresentation('close', 'blocked', (value) => (value.status = 'unknown')),
  'presentation.blockers': () =>
    rejectsPresentation('close', 'blocked', (value) => (value.blockers = [])),
  'presentation.normalizations': () =>
    rejectsPresentation('close', 'normalization', (value) => {
      value.normalizations[0].disposition = 'already-persisted';
    }),
  'presentation.warnings': () =>
    rejectsPresentation('review', 'warning', (value) => delete value.warnings[0].args),
  'presentation.human-decision': () =>
    rejectsPresentation('deliver', 'effective-policy-human-request', (value) => {
      value.humanDecision.requests = [];
    }),
  'presentation.explicit-empty': () => {
    const result = renderCandidateExplanation({ decision: decision('bind', 'ready') }).result;
    assert.deepEqual(result.blockers, []);
    assert.deepEqual(result.normalizations, []);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.humanDecision, null);
  },
  'presentation.closed-envelope': () =>
    rejectsPresentation('bind', 'ready', (value) => (value.extra = true)),
  'presentation.no-evidence-duplication': () =>
    assertRoutineHasNoEvidence(decision('close', 'normalization')),
  'presentation.operational-values-complete': () => {
    const result = renderCandidateExplanation({
      decision: decision('deliver', 'effective-policy-human-request'),
    }).result;
    assert.equal(result.humanDecision.requests[0].args.head, candidateConstants.FULL_HEAD);
  },
  'presentation.no-diagnostic-fallback': () => {
    const value = renderCandidateExplanation({ decision: decision('bind', 'indeterminate') });
    assert.equal(Object.hasOwn(value, 'fullDecision'), false);
  },
  'causes.blocked-nonempty': () =>
    rejectsDecision('resume', 'blocked', (value) => (value.blockers = [])),
  'causes.ready-empty': () =>
    rejectsDecision('resume', 'ready', (value) =>
      value.blockers.push(decision('resume', 'blocked').blockers[0])
    ),
  'causes.complete-known-refusals': () => assert.equal(twoBlockerDecision().blockers.length, 2),
  'causes.args-required': () =>
    rejectsDecision('resume', 'blocked', (value) => delete value.blockers[0].args),
  'causes.collection-codes': () =>
    rejectsDecision('resume', 'indeterminate', (value) => {
      value.blockers[0].code = 'read-failed';
    }),
  'causes.collection-reasons': () =>
    rejectsDecision('resume', 'indeterminate', (value) => {
      value.blockers[0].args.reason = 'retry';
    }),
  'causes.multi-subject': () => {
    const value = crossIssueDecision();
    assert.notEqual(value.humanDecision.requests[0].subject.issue, value.issue);
  },
  'causes.reserved-producers': () =>
    rejectsDecision('resume', 'indeterminate', (value) => {
      value.blockers[0].guardId = 'candidate-precondition';
    }),
  'causes.producer-code-pair': () =>
    rejectsDecision('resume', 'blocked', (value) => {
      value.blockers[0].guardId = 'authority-collection';
    }),
  'causes.navigation': () =>
    assert.equal(validateCandidateDecision(navigationDecision()).actionId, null),
  'causes.outer-validator': () =>
    assert.equal(outerRefusal().blockers[0].guardId, 'action-result-validation'),
  'causes.one-disposition': () =>
    rejectsDecision('resume', 'blocked', (value) => {
      value.blockers[0].noAutomaticRemediation = { reason: 'result-investigation-required' };
    }),
  'causes.legacy-stable': () => {
    assert.deepEqual(
      legacyRefusal('first').blockers[0].code,
      legacyRefusal('second').blockers[0].code
    );
  },
  'causes.legacy-no-text-execution': () => {
    const value = legacyRefusal('run dangerous command');
    assert.equal(JSON.stringify(value).includes('run dangerous command'), false);
  },
  'causes.invalid-no-fallback': () => {
    rejectsDecision(
      'resume',
      'indeterminate',
      (value) => {
        value.blockers[0].noAutomaticRemediation.reason = 'retry';
      },
      /no-remediation-reason/
    );
  },
  'warnings.closed-shape': () =>
    rejectsDecision('review', 'warning', (value) => (value.warnings[0].message = 'raw')),
  'warnings.source-diverged': () => {
    const value = decision('review', 'warning').warnings[0];
    assert.equal(value.args.digest, candidateConstants.SOURCE_DIGEST);
  },
  'warnings.legacy-origin': () => {
    const value = decision('review', 'warning').warnings[1];
    assert.equal(value.args.guardId, 'candidate-precondition');
  },
  'warnings.composition-order': () => {
    const result = renderCandidateExplanation({
      decision: decision('review', 'warning'),
      admissionWarnings: [warningRecord()],
    }).result;
    assert.equal(result.warnings[0].code, 'guidance-source-diverged');
  },
  'warnings.duplicates': () => {
    const result = renderCandidateExplanation({ decision: decision('review', 'warning') }).result;
    assert.equal(result.warnings.filter(({ code }) => code === 'legacy-guard-warning').length, 2);
  },
  'warnings.domain-separation': () => {
    const value = decision('review', 'warning');
    assert.equal(value.status, 'ready');
    assert.deepEqual(value.blockers, []);
  },
  'human.required-shape': () =>
    rejectsDecision('deliver', 'effective-policy-human-request', (value) => {
      value.humanDecision.requests = [];
    }),
  'human.request-shape': () =>
    rejectsDecision('deliver', 'effective-policy-human-request', (value) => {
      delete value.humanDecision.requests[0].args;
    }),
  'human.plan-approval': () => {
    const value = decision('promote', 'effective-policy-human-request');
    assert.equal(value.humanDecision.requests[0].kind, 'plan-approval');
  },
  'human.review-approval': () => {
    const value = decision('deliver', 'effective-policy-human-request');
    assert.equal(value.humanDecision.requests[0].args.head, value.snapshot.head);
  },
  'human.investigation': () => {
    const value = decision('bind', 'effective-policy-human-request');
    assert.equal(value.humanDecision.requests[0].kind, 'manual-investigation');
  },
  'human.complete-policy-requests': () =>
    rejectsDecision('promote', 'effective-policy-human-request', (value) => {
      value.humanDecision = null;
    }),
  'human.blocker-order': () => {
    const value = decision('deliver', 'effective-policy-human-request');
    value.humanDecision.requests.unshift(clone(value.humanDecision.requests[0]));
    assert.throws(
      () => validateCandidateDecision(value),
      /remediation-coupling|human-request-coupling/
    );
  },
  'navigation.cross-issue-mapping': () => {
    const value = clone(decision('close', 'effective-policy-human-request'));
    value.humanDecision.requests[0].subject.issue += 1;
    assert.throws(
      () => validateCandidateDecision(value),
      /human-cross-issue|human-request-coupling/
    );
  },
  'navigation.fresh-target-evaluation': () => {
    const first = crossIssueDecision();
    const target = decision('promote', 'effective-policy-human-request');
    assert.equal(first.blockers[0].args.issue, target.issue);
    assert.notEqual(first.snapshot.digest, target.snapshot.digest);
  },
  'navigation.investigation-null-action': () => {
    assert.equal(validateCandidateDecision(navigationDecision()).actionId, null);
  },
  'navigation.terminal-null-action': () => {
    const value = buildTerminalCandidateDecision({ fixture: fixtures.close });
    const result = renderCandidateExplanation({ decision: value }).result;
    assert.equal(value.snapshot.state, 'done');
    assert.equal(result.actionId, null);
  },
  'guidance.expansion-complete': () => {
    const entry = renderCandidateExplanation({ decision: decision('bind', 'ready') }).guidance[0];
    assert.equal(entry.status, 'expanded');
    assert.equal(entry.agent.instruction.length, 5);
  },
  'guidance.receipt-suppresses-text-only': () => {
    const value = decision('bind', 'blocked');
    const known = [{ id: 'action.bind', digest: candidateConstants.GUIDANCE_DIGEST }];
    const response = renderCandidateExplanation({ decision: value, knownGuidance: known });
    assert.equal(response.guidance[0].status, 'not-modified');
    assert.equal(response.result.status, 'blocked');
  },
  'guidance.changed-digest-expands': () => {
    const known = [{ id: 'action.bind', digest: `sha256:${'0'.repeat(64)}` }];
    assert.equal(
      renderCandidateExplanation({ decision: decision('bind'), knownGuidance: known }).guidance[0]
        .status,
      'expanded'
    );
  },
  'guidance.compaction-invalidates': () => {
    const response = renderCandidateExplanation({ decision: decision('bind'), knownGuidance: [] });
    assert.equal(response.guidance[0].status, 'expanded');
  },
  'guidance.no-ledger-restore': () => {
    const response = renderCandidateExplanation({
      decision: decision('resume'),
      knownGuidance: [],
    });
    assert.equal(response.guidance[0].status, 'expanded');
  },
  'guidance.receipt-not-authority': () => {
    const value = decision('bind', 'blocked');
    const known = [{ id: 'action.bind', digest: candidateConstants.GUIDANCE_DIGEST }];
    assert.equal(
      renderCandidateExplanation({ decision: value, knownGuidance: known }).result.status,
      'blocked'
    );
  },
  'guidance.stale-attestation-behavior': () => {
    const value = decision('bind', 'blocked');
    const known = [{ id: 'action.bind', digest: candidateConstants.GUIDANCE_DIGEST }];
    const response = renderCandidateExplanation({ decision: value, knownGuidance: known });
    assert.equal(response.guidance[0].status, 'not-modified');
    assert.equal(response.result.blockers.length, 1);
  },
  'diagnostics.mode-members': () => {
    const routine = renderCandidateExplanation({ decision: decision('test') });
    const diagnostic = renderCandidateExplanation({ decision: decision('test'), diagnostic: true });
    assert.equal(Object.hasOwn(routine, 'fullDecision'), false);
    assert.equal(Object.hasOwn(diagnostic, 'fullDecision'), true);
    assert.equal(Object.hasOwn(diagnostic, 'diagnosticMessages'), true);
  },
  'diagnostics.message-shape': () => {
    assert.throws(
      () =>
        renderCandidateExplanation({
          decision: decision('test'),
          diagnostic: true,
          diagnosticMessages: [
            { guardId: 'candidate-precondition', text: 'raw', untrusted: false },
          ],
        }),
      /diagnostic-trust/
    );
  },
  'diagnostics.same-evaluation': () => {
    const value = decision('test', 'normalization');
    const diagnostic = renderCandidateExplanation({ decision: value, diagnostic: true });
    assert.deepEqual(diagnostic.fullDecision, value);
  },
  'diagnostics.operational-equivalence': () => {
    const value = decision('test', 'warning');
    const routine = renderCandidateExplanation({ decision: value });
    const diagnostic = renderCandidateExplanation({ decision: value, diagnostic: true });
    assert.deepEqual(diagnostic.result, routine.result);
  },
  'diagnostics.no-archive': () => {
    const value = renderCandidateExplanation({ decision: decision('test'), diagnostic: true });
    assert.deepEqual(Object.keys(value).sort(), [
      'admissionWarningCount',
      'diagnosticMessages',
      'fullDecision',
      'guidance',
      'result',
      'schema',
    ]);
  },
  'override.chat-warning': () => {
    const effect = projectOverrideProtocol({
      diverged: true,
      valid: true,
      mutationSucceeded: false,
      alreadyAnnotated: false,
      digest: candidateConstants.SOURCE_DIGEST,
      receiptDigest: null,
      contextReset: false,
    });
    assert.equal(effect.warningEmitted, true);
  },
  'override.receipt-suppression': () => {
    const common = {
      diverged: true,
      valid: true,
      mutationSucceeded: false,
      alreadyAnnotated: false,
      digest: candidateConstants.SOURCE_DIGEST,
    };
    assert.equal(
      projectOverrideProtocol({ ...common, receiptDigest: common.digest, contextReset: false })
        .warningEmitted,
      false
    );
    assert.equal(
      projectOverrideProtocol({ ...common, receiptDigest: common.digest, contextReset: true })
        .warningEmitted,
      true
    );
  },
  'override.annotation-after-success': () => {
    const effect = projectOverrideProtocol({
      diverged: true,
      valid: true,
      mutationSucceeded: true,
      alreadyAnnotated: false,
      digest: candidateConstants.SOURCE_DIGEST,
      receiptDigest: null,
      contextReset: false,
    });
    assert.equal(effect.annotationWritten, true);
  },
  'override.invalid-no-annotation': () => {
    const effect = projectOverrideProtocol({
      diverged: true,
      valid: false,
      mutationSucceeded: true,
      alreadyAnnotated: false,
      digest: candidateConstants.SOURCE_DIGEST,
      receiptDigest: null,
      contextReset: false,
    });
    assert.equal(effect.annotationWritten, false);
    assert.equal(effect.mutationAllowed, false);
  },
};

const adversarialPrimary = new Set([
  'evidence.bundle-complete',
  'evidence.observation-window',
  'evidence.snapshot-digest',
  'evidence.missing-not-empty',
  'normalization.identity',
  'normalization.decision-fields',
  'evidence.head-body-refresh',
  'presentation.issue',
  'presentation.action-id',
  'presentation.status',
  'presentation.blockers',
  'presentation.normalizations',
  'presentation.warnings',
  'presentation.human-decision',
  'presentation.closed-envelope',
  'causes.blocked-nonempty',
  'causes.ready-empty',
  'causes.args-required',
  'causes.collection-codes',
  'causes.collection-reasons',
  'causes.reserved-producers',
  'causes.producer-code-pair',
  'causes.one-disposition',
  'causes.invalid-no-fallback',
  'warnings.closed-shape',
  'human.required-shape',
  'human.request-shape',
  'human.complete-policy-requests',
  'human.blocker-order',
  'navigation.cross-issue-mapping',
  'diagnostics.message-shape',
]);

const positiveCounters = {
  'evidence.bundle-complete': () => {
    const value = validateCandidateDecision(decision('promote'));
    assert.equal(value.snapshot.observations.length > 0, true);
  },
  'evidence.observation-window': () => {
    const value = validateCandidateDecision(decision('promote'));
    assert.equal(
      value.snapshot.observations.every(({ observedAt }) => observedAt),
      true
    );
  },
  'evidence.snapshot-digest': () => {
    const value = validateCandidateDecision(decision('promote'));
    assert.match(value.snapshot.digest, /^sha256:[0-9a-f]{64}$/);
  },
  'evidence.missing-not-empty': () => {
    const value = validateCandidateDecision(decision('promote'));
    assert.notDeepEqual(value.snapshot.observations, []);
  },
  'normalization.identity': () => {
    const value = validateCandidateDecision(decision('close', 'normalization'));
    assert.equal(value.normalizations[0].normalizerId, 'functional-dod-derived/v1');
  },
  'normalization.decision-fields': () => {
    const value = validateCandidateDecision(decision('close', 'normalization'));
    assert.deepEqual(Object.keys(value.normalizations[0].decisions[0]).sort(), [
      'derivationRule',
      'key',
      'stamp',
      'tick',
    ]);
  },
  'evidence.head-body-refresh': () => {
    const value = validateCandidateDecision(decision('deliver'));
    assert.equal(value.snapshot.head, candidateConstants.FULL_HEAD);
  },
  'presentation.issue': () => {
    const value = renderCandidateExplanation({ decision: decision('close', 'blocked') });
    assert.equal(validateCandidateExplanation(value).result.issue, fixtures.close.issue);
  },
  'presentation.action-id': () => {
    const value = renderCandidateExplanation({ decision: decision('close', 'blocked') });
    assert.equal(validateCandidateExplanation(value).result.actionId, 'close');
  },
  'presentation.status': () => {
    const value = renderCandidateExplanation({ decision: decision('close', 'blocked') });
    assert.equal(validateCandidateExplanation(value).result.status, 'blocked');
  },
  'presentation.blockers': () => {
    const value = renderCandidateExplanation({ decision: decision('close', 'blocked') });
    assert.equal(validateCandidateExplanation(value).result.blockers.length, 1);
  },
  'presentation.normalizations': () => {
    const value = renderCandidateExplanation({ decision: decision('close', 'normalization') });
    assert.equal(validateCandidateExplanation(value).result.normalizations.length, 1);
  },
  'presentation.warnings': () => {
    const value = renderCandidateExplanation({ decision: decision('review', 'warning') });
    assert.equal(validateCandidateExplanation(value).result.warnings.length, 3);
  },
  'presentation.human-decision': () => {
    const value = renderCandidateExplanation({
      decision: decision('deliver', 'effective-policy-human-request'),
    });
    assert.equal(validateCandidateExplanation(value).result.humanDecision.requests.length, 1);
  },
  'presentation.closed-envelope': () => {
    const value = renderCandidateExplanation({ decision: decision('bind') });
    assert.deepEqual(Object.keys(validateCandidateExplanation(value)).sort(), [
      'guidance',
      'result',
      'schema',
    ]);
  },
  'causes.blocked-nonempty': () => {
    const value = validateCandidateDecision(decision('resume', 'blocked'));
    assert.equal(value.blockers.length > 0, true);
  },
  'causes.ready-empty': () => {
    const value = validateCandidateDecision(decision('resume', 'ready'));
    assert.deepEqual(value.blockers, []);
  },
  'causes.args-required': () => {
    const value = validateCandidateDecision(decision('resume', 'blocked'));
    assert.equal(Object.hasOwn(value.blockers[0], 'args'), true);
  },
  'causes.collection-codes': () => {
    const value = validateCandidateDecision(decision('resume', 'indeterminate'));
    assert.equal(value.blockers[0].code, 'authority-read-failed');
  },
  'causes.collection-reasons': () => {
    const value = validateCandidateDecision(decision('resume', 'indeterminate'));
    assert.equal(value.blockers[0].args.reason, 'timeout');
  },
  'causes.reserved-producers': () => {
    const value = validateCandidateDecision(decision('resume', 'indeterminate'));
    assert.equal(value.blockers[0].guardId, 'authority-collection');
  },
  'causes.producer-code-pair': () => {
    const value = validateCandidateDecision(decision('resume', 'blocked'));
    assert.deepEqual(
      [value.blockers[0].guardId, value.blockers[0].code],
      ['candidate-precondition', 'precondition-missing']
    );
  },
  'causes.one-disposition': () => {
    const value = validateCandidateDecision(decision('resume', 'blocked'));
    assert.equal(Object.hasOwn(value.blockers[0], 'remediation'), true);
    assert.equal(Object.hasOwn(value.blockers[0], 'noAutomaticRemediation'), false);
  },
  'causes.invalid-no-fallback': () => {
    const value = validateCandidateDecision(decision('resume', 'indeterminate'));
    assert.equal(
      value.blockers[0].noAutomaticRemediation.reason,
      'authority-investigation-required'
    );
  },
  'warnings.closed-shape': () => {
    const value = validateCandidateDecision(decision('review', 'warning'));
    assert.deepEqual(Object.keys(value.warnings[0]).sort(), ['args', 'code']);
  },
  'human.required-shape': () => {
    const value = validateCandidateDecision(decision('deliver', 'effective-policy-human-request'));
    assert.equal(value.humanDecision.requests.length, 1);
  },
  'human.request-shape': () => {
    const value = validateCandidateDecision(decision('deliver', 'effective-policy-human-request'));
    assert.deepEqual(Object.keys(value.humanDecision.requests[0]).sort(), [
      'actor',
      'args',
      'kind',
      'subject',
    ]);
  },
  'human.complete-policy-requests': () => {
    const value = validateCandidateDecision(decision('promote', 'effective-policy-human-request'));
    assert.equal(value.humanDecision.requests[0].kind, 'plan-approval');
  },
  'human.blocker-order': () => {
    const value = validateCandidateDecision(decision('deliver', 'effective-policy-human-request'));
    assert.equal(value.humanDecision.requests[0].args.head, value.blockers[0].args.head);
  },
  'navigation.cross-issue-mapping': () => {
    const value = crossIssueDecision();
    assert.equal(value.humanDecision.requests[0].subject.issue, value.blockers[0].args.issue);
  },
  'diagnostics.message-shape': () => {
    const value = renderCandidateExplanation({
      decision: decision('test'),
      diagnostic: true,
      diagnosticMessages: [{ guardId: 'candidate-precondition', text: 'raw', untrusted: true }],
    });
    assert.equal(validateCandidateExplanation(value).diagnosticMessages[0].untrusted, true);
  },
};

function assertGuidanceInvariant(mutator) {
  const expected = renderCandidateExplanation({ decision: decision('bind') });
  const actual = clone(expected);
  mutator(actual);
  assert.throws(() => validateCandidateExplanation(actual), /guidance-candidate:guidance-/);
}

const adversarialCounters = {
  'evidence.refresh-provenance': () =>
    assert.throws(
      () =>
        buildCandidateDecision({ fixture: fixtures.promote, scenario: 'ready', evidenceCopies: 0 }),
      /snapshot-observations/
    ),
  'normalization.digest-omissions': () =>
    rejectsDecision('close', 'normalization', (value) => {
      value.normalizations[0].decisionDigest = `sha256:${'0'.repeat(64)}`;
    }),
  'evidence.digest-not-authority': () =>
    rejectsDecision(
      'bind',
      'ready',
      (value) => {
        value.blockers.push(decision('bind', 'blocked').blockers[0]);
      },
      /ready-blockers/
    ),
  'presentation.explicit-empty': () =>
    rejectsPresentation('bind', 'ready', (value) => (value.blockers = null)),
  'presentation.no-evidence-duplication': () =>
    rejectsPresentation('bind', 'ready', (value) => (value.snapshot = {})),
  'presentation.operational-values-complete': () =>
    rejectsPresentation('deliver', 'effective-policy-human-request', (value) => {
      value.humanDecision.requests[0].args.head = value.humanDecision.requests[0].args.head.slice(
        0,
        7
      );
    }),
  'presentation.no-diagnostic-fallback': () => {
    const envelope = renderCandidateExplanation({ decision: decision('bind', 'indeterminate') });
    envelope.fullDecision = decision('bind', 'indeterminate');
    assert.throws(() => validateCandidateExplanation(envelope), /explanation-shape/);
  },
  'causes.complete-known-refusals': () => {
    const value = twoBlockerDecision();
    value.humanDecision.requests.pop();
    assert.throws(() => validateCandidateDecision(value), /human-request-coupling/);
  },
  'causes.multi-subject': () => {
    const value = crossIssueDecision();
    value.humanDecision.requests[0].subject.issue = value.issue;
    assert.throws(() => validateCandidateDecision(value), /human-request-coupling/);
  },
  'causes.navigation': () =>
    assert.throws(() => {
      const value = navigationDecision();
      value.blockers[0].args.reason = 'guessed';
      validateCandidateDecision(value);
    }, /state-reason/),
  'causes.outer-validator': () => {
    const value = outerRefusal();
    value.blockers[0].guardId = 'candidate-precondition';
    assert.throws(() => validateCandidateDecision(value), /producer-code-pair/);
  },
  'causes.legacy-stable': () =>
    rejectsDecision(
      'resume',
      'blocked',
      (value) => {
        value.blockers[0].code = 'raw legacy refusal';
      },
      /blocker-code/
    ),
  'causes.legacy-no-text-execution': () =>
    rejectsDecision(
      'resume',
      'blocked',
      (value) => {
        value.blockers[0].command = 'run dangerous command';
      },
      /blocker-shape/
    ),
  'warnings.source-diverged': () =>
    rejectsDecision(
      'review',
      'warning',
      (value) => {
        value.warnings[0].args.source = './untracked-guidance.yml';
      },
      /warning-source/
    ),
  'warnings.legacy-origin': () =>
    rejectsDecision(
      'review',
      'warning',
      (value) => {
        value.warnings[1].args.guardId = 'unregistered-guard';
      },
      /warning-guard/
    ),
  'warnings.composition-order': () =>
    rejectsDecision(
      'review',
      'warning',
      (value) => {
        value.warnings = [value.warnings[1], value.warnings[0], value.warnings[2]];
      },
      /warning-order/
    ),
  'warnings.duplicates': () => {
    const actual = renderCandidateExplanation({
      decision: decision('review', 'warning'),
      diagnostic: true,
    });
    actual.result.warnings.pop();
    assert.throws(() => validateCandidateExplanation(actual), /diagnostic-operational-equivalence/);
  },
  'warnings.domain-separation': () =>
    rejectsDecision(
      'review',
      'warning',
      (value) => {
        value.blockers.push(value.warnings[0]);
      },
      /blocker-shape/
    ),
  'human.plan-approval': () =>
    rejectsDecision(
      'promote',
      'effective-policy-human-request',
      (value) => {
        value.humanDecision.requests[0].actor = 'human-operator';
      },
      /human-actor/
    ),
  'human.review-approval': () =>
    rejectsDecision(
      'deliver',
      'effective-policy-human-request',
      (value) => {
        value.humanDecision.requests[0].args.head = 'f'.repeat(40);
      },
      /human-request-coupling/
    ),
  'human.investigation': () =>
    rejectsDecision(
      'bind',
      'effective-policy-human-request',
      (value) => {
        value.humanDecision.requests[0].actor = 'configured-approver';
      },
      /human-actor/
    ),
  'navigation.fresh-target-evaluation': () => {
    const value = crossIssueDecision();
    value.blockers[0].args.issue = decision('bind').issue;
    assert.throws(
      () => validateCandidateDecision(value),
      /remediation-coupling|human-request-coupling/
    );
  },
  'navigation.investigation-null-action': () => {
    const value = navigationDecision();
    value.actionId = 'close';
    value.humanDecision.requests[0].subject.actionId = 'close';
    assert.throws(() => validateCandidateDecision(value), /navigation-action/);
  },
  'navigation.terminal-null-action': () => {
    const value = buildTerminalCandidateDecision({ fixture: fixtures.close });
    value.actionId = 'close';
    assert.throws(() => validateCandidateDecision(value), /terminal-action/);
  },
  'guidance.expansion-complete': () =>
    assertGuidanceInvariant((value) => value.guidance[0].agent.instruction.pop()),
  'guidance.receipt-suppresses-text-only': () => {
    const actual = renderCandidateExplanation({
      decision: decision('bind', 'blocked'),
      knownGuidance: [{ id: 'action.bind', digest: candidateConstants.GUIDANCE_DIGEST }],
    });
    actual.result.status = 'ready';
    assert.throws(() => validateCandidateExplanation(actual), /ready-blockers/);
  },
  'guidance.changed-digest-expands': () =>
    assertGuidanceInvariant((value) => (value.guidance[0].status = 'not-modified')),
  'guidance.compaction-invalidates': () =>
    assertGuidanceInvariant((value) => delete value.guidance[0].agent),
  'guidance.no-ledger-restore': () =>
    assertGuidanceInvariant((value) => (value.guidance[0].digest = `sha256:${'0'.repeat(64)}`)),
  'guidance.receipt-not-authority': () =>
    rejectsDecision(
      'bind',
      'blocked',
      (value) => {
        value.status = 'ready';
      },
      /ready-blockers/
    ),
  'guidance.stale-attestation-behavior': () =>
    assertGuidanceInvariant((value) => (value.guidance[0].status = 'not-modified')),
  'diagnostics.mode-members': () => {
    const envelope = renderCandidateExplanation({ decision: decision('test'), diagnostic: true });
    delete envelope.fullDecision;
    assert.throws(() => validateCandidateExplanation(envelope), /explanation-shape/);
  },
  'diagnostics.same-evaluation': () => {
    const envelope = renderCandidateExplanation({ decision: decision('test'), diagnostic: true });
    envelope.fullDecision.issue += 1;
    assert.throws(
      () => validateCandidateExplanation(envelope),
      /diagnostic-operational-equivalence/
    );
  },
  'diagnostics.operational-equivalence': () => {
    const envelope = renderCandidateExplanation({ decision: decision('test'), diagnostic: true });
    envelope.result.issue += 1;
    assert.throws(
      () => validateCandidateExplanation(envelope),
      /diagnostic-operational-equivalence/
    );
  },
  'diagnostics.no-archive': () => {
    const envelope = renderCandidateExplanation({ decision: decision('test'), diagnostic: true });
    envelope.archive = [];
    assert.throws(() => validateCandidateExplanation(envelope), /explanation-shape/);
  },
  'override.chat-warning': () => {
    const effect = projectOverrideProtocol({
      diverged: false,
      valid: true,
      mutationSucceeded: false,
      alreadyAnnotated: false,
      digest: candidateConstants.SOURCE_DIGEST,
      receiptDigest: null,
      contextReset: false,
    });
    assert.equal(effect.warningEmitted, false);
  },
  'override.receipt-suppression': () => {
    const effect = projectOverrideProtocol({
      diverged: true,
      valid: true,
      mutationSucceeded: false,
      alreadyAnnotated: false,
      digest: candidateConstants.SOURCE_DIGEST,
      receiptDigest: candidateConstants.SOURCE_DIGEST,
      contextReset: true,
    });
    assert.equal(effect.warningEmitted, true);
  },
  'override.annotation-after-success': () => {
    const effect = projectOverrideProtocol({
      diverged: true,
      valid: true,
      mutationSucceeded: false,
      alreadyAnnotated: false,
      digest: candidateConstants.SOURCE_DIGEST,
      receiptDigest: null,
      contextReset: false,
    });
    assert.equal(effect.annotationWritten, false);
  },
  'override.invalid-no-annotation': () => {
    const effect = projectOverrideProtocol({
      diverged: true,
      valid: true,
      mutationSucceeded: true,
      alreadyAnnotated: false,
      digest: candidateConstants.SOURCE_DIGEST,
      receiptDigest: null,
      contextReset: false,
    });
    assert.equal(effect.mutationAllowed, true);
  },
};

function probeValidator(id) {
  if (id.startsWith('override.')) return 'override-oracle';
  if (
    id.startsWith('presentation.') ||
    id.startsWith('guidance.') ||
    id.startsWith('diagnostics.') ||
    id === 'warnings.duplicates'
  ) {
    return 'explanation-oracle';
  }
  return 'decision-oracle';
}

export function executeCandidateTraceability({ index, traceability }) {
  const clauseIds = new Set(index.clauses.map(({ id }) => id));
  const executedAssertions = [];
  const observedFixtures = [];
  const mappings = [];
  const probeReceipts = [];
  for (const mapping of traceability.mappings) {
    assert.equal(clauseIds.has(mapping.clauseId), true);
    assert.equal(mapping.fieldChecks.length, 1);
    const id = mapping.fieldChecks[0];
    const primary = probes[id];
    assert.equal(typeof primary, 'function', `missing runtime probe: ${id}`);
    const positive = adversarialPrimary.has(id) ? positiveCounters[id] : primary;
    const adversarial = adversarialPrimary.has(id) ? primary : adversarialCounters[id];
    assert.equal(typeof positive, 'function', `missing positive runtime probe: ${id}`);
    assert.equal(typeof adversarial, 'function', `missing adversarial runtime probe: ${id}`);
    assert.equal(traceability.assertions.registered.includes(mapping.assertionId), true);
    assert.equal(traceability.fixtures.registered.includes(mapping.positiveFixtureId), true);
    assert.equal(traceability.fixtures.registered.includes(mapping.adversarialFixtureId), true);
    positive();
    probeReceipts.push({
      clauseId: mapping.clauseId,
      phase: 'positive',
      probeId: `${id}:positive`,
      assertionId: mapping.assertionId,
      fixtureId: mapping.positiveFixtureId,
      source: 'runtime-probe',
      validator: probeValidator(id),
    });
    adversarial();
    probeReceipts.push({
      clauseId: mapping.clauseId,
      phase: 'adversarial',
      probeId: `${id}:adversarial`,
      assertionId: mapping.assertionId,
      fixtureId: mapping.adversarialFixtureId,
      source: 'runtime-probe',
      validator: probeValidator(id),
    });
    if (!executedAssertions.includes(mapping.assertionId))
      executedAssertions.push(mapping.assertionId);
    for (const id of [mapping.positiveFixtureId, mapping.adversarialFixtureId]) {
      if (!observedFixtures.includes(id)) observedFixtures.push(id);
    }
    mappings.push({ clauseId: mapping.clauseId, executionStatus: 'executed' });
  }
  return {
    executedAssertions: traceability.assertions.registered.filter((id) =>
      executedAssertions.includes(id)
    ),
    observedFixtures: traceability.fixtures.registered.filter((id) =>
      observedFixtures.includes(id)
    ),
    mappings,
    probeReceipts,
  };
}
