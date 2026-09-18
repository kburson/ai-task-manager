// @story #1658
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCandidateDecision,
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
  return {
    guardId: 'candidate-precondition',
    code: 'precondition-missing',
    args: { requirement: 'legacy-refusal' },
    noAutomaticRemediation: { reason: 'result-investigation-required' },
    diagnosticText: reason,
  };
}

function assertRoutineHasNoEvidence(value) {
  const bytes = JSON.stringify(renderCandidateExplanation({ decision: value }));
  assert.equal(bytes.includes('snapshot'), false);
  assert.equal(bytes.includes('observations'), false);
  assert.equal(bytes.includes('decisionDigest'), false);
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
    const value = decision('close', 'effective-policy-human-request');
    assert.equal(value.humanDecision.requests[0].subject.issue, value.issue);
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
    assert.deepEqual(legacyRefusal('first').code, legacyRefusal('second').code);
  },
  'causes.legacy-no-text-execution': () => {
    const value = legacyRefusal('run dangerous command');
    assert.equal(Object.hasOwn(value, 'command'), false);
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
    assert.throws(() => validateCandidateDecision(value), /human-request-coupling/);
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
    const first = decision('close', 'effective-policy-human-request');
    const target = decision('promote', 'effective-policy-human-request');
    assert.notEqual(first.issue, target.issue);
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

export function executeCandidateTraceability({ index, traceability }) {
  const clauseIds = new Set(index.clauses.map(({ id }) => id));
  const executedAssertions = [];
  const observedFixtures = [];
  const mappings = [];
  for (const mapping of traceability.mappings) {
    assert.equal(clauseIds.has(mapping.clauseId), true);
    assert.equal(mapping.fieldChecks.length, 1);
    const probe = probes[mapping.fieldChecks[0]];
    assert.equal(typeof probe, 'function', `missing runtime probe: ${mapping.fieldChecks[0]}`);
    probe();
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
  };
}
