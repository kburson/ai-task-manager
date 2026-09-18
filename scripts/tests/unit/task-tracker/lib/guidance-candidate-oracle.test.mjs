// @story #1658
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertOracleTraceability, digestJson } from '../../../helpers/guidance-clause-index.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const fixtureRoot = path.join(projectRoot, 'scripts/tests/fixtures/1558/action-decision-fixtures');
const actions = ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close'];

function fixture(action) {
  return JSON.parse(readFileSync(path.join(fixtureRoot, `${action}.json`), 'utf8'));
}

function json(name) {
  return JSON.parse(readFileSync(path.join(path.dirname(fixtureRoot), name), 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

async function oracle() {
  return import('../../../helpers/guidance-characterization.mjs');
}

test('every lifecycle action declares the complete candidate scenario family', () => {
  for (const action of actions) {
    const value = fixture(action);
    assert.equal(value.schema, 'aitm.guidance-action-fixtures/v1');
    assert.equal(value.actionId, action);
    assert.deepEqual(value.scenarios, [
      'ready',
      'blocked',
      'indeterminate',
      'warning',
      'normalization',
      'effective-policy-human-request',
    ]);
  }
});

test('candidate decisions validate every action and scenario without dropping operational values', async () => {
  const { buildCandidateDecision, validateCandidateDecision } = await oracle();
  const expectedStatuses = {
    ready: 'ready',
    blocked: 'blocked',
    indeterminate: 'indeterminate',
    warning: 'ready',
    normalization: 'ready',
    'effective-policy-human-request': 'blocked',
  };

  for (const action of actions) {
    const definition = fixture(action);
    for (const scenario of definition.scenarios) {
      const decision = buildCandidateDecision({ fixture: definition, scenario });
      assert.equal(validateCandidateDecision(decision), decision);
      assert.equal(decision.issue, definition.issue);
      assert.equal(decision.actionId, action);
      const expectedStatus =
        scenario === 'effective-policy-human-request' &&
        definition.policyRequest === 'manual-investigation'
          ? 'indeterminate'
          : expectedStatuses[scenario];
      assert.equal(decision.status, expectedStatus);
      assert.equal(decision.snapshot.state, definition.state);
      assert.equal(decision.snapshot.head.length, 40);
      assert.match(decision.snapshot.digest, /^sha256:[0-9a-f]{64}$/);
    }
  }
});

test('routine presentation has exactly seven fields and evidence cardinality cannot change its bytes', async () => {
  const { buildCandidateDecision, renderCandidateExplanation, candidateConstants } = await oracle();
  const definition = fixture('deliver');
  const one = buildCandidateDecision({ fixture: definition, scenario: 'blocked' });
  const many = buildCandidateDecision({
    fixture: definition,
    scenario: 'blocked',
    evidenceCopies: 12,
  });
  const routineOne = renderCandidateExplanation({ decision: one });
  const routineMany = renderCandidateExplanation({ decision: many });

  assert.deepEqual(Object.keys(routineOne.result), [
    'issue',
    'actionId',
    'status',
    'blockers',
    'normalizations',
    'warnings',
    'humanDecision',
  ]);
  assert.deepEqual(routineMany.result, routineOne.result);
  assert.equal(JSON.stringify(routineOne).includes('snapshot'), false);
  assert.equal(JSON.stringify(routineOne).includes(candidateConstants.FULL_HEAD), false);

  const approval = buildCandidateDecision({
    fixture: definition,
    scenario: 'effective-policy-human-request',
  });
  const approvalResult = renderCandidateExplanation({ decision: approval }).result;
  assert.equal(approvalResult.blockers.length, 1);
  assert.equal(approvalResult.humanDecision.requests.length, 1);
  assert.equal(approvalResult.blockers[0].args.head, candidateConstants.FULL_HEAD);
  assert.equal(approvalResult.humanDecision.requests[0].args.head, candidateConstants.FULL_HEAD);
});

test('closed decision validation rejects missing values, unknown members and inconsistent semantics', async () => {
  const { buildCandidateDecision, validateCandidateDecision } = await oracle();
  const ready = buildCandidateDecision({ fixture: fixture('promote'), scenario: 'ready' });
  const blocked = buildCandidateDecision({ fixture: fixture('promote'), scenario: 'blocked' });

  for (const [mutate, expected] of [
    [(value) => delete value.warnings, /guidance-candidate:decision-shape/],
    [(value) => (value.extra = true), /guidance-candidate:decision-shape/],
    [(value) => (value.status = 'unknown'), /guidance-candidate:decision-status/],
    [
      (value) => value.blockers.push(clone(blocked.blockers[0])),
      /guidance-candidate:ready-blockers/,
    ],
    [(value) => (value.snapshot.observations = []), /guidance-candidate:snapshot-observations/],
  ]) {
    const candidate = clone(ready);
    mutate(candidate);
    assert.throws(() => validateCandidateDecision(candidate), expected);
  }

  for (const [mutate, expected] of [
    [(value) => delete value.blockers[0].args, /guidance-candidate:blocker-shape/],
    [
      (value) => (value.blockers[0].guardId = 'authority-collection'),
      /guidance-candidate:producer-code-pair/,
    ],
    [
      (value) => (value.blockers[0].remediation.args.issue = 0),
      /guidance-candidate:remediation-issue/,
    ],
    [
      (value) => (value.blockers[0].noAutomaticRemediation = { reason: 'invented' }),
      /guidance-candidate:blocker-shape/,
    ],
  ]) {
    const candidate = clone(blocked);
    mutate(candidate);
    assert.throws(() => validateCandidateDecision(candidate), expected);
  }

  const policy = buildCandidateDecision({
    fixture: fixture('promote'),
    scenario: 'effective-policy-human-request',
  });
  policy.humanDecision = null;
  assert.throws(
    () => validateCandidateDecision(policy),
    /guidance-candidate:human-request-coupling/
  );
});

test('warnings, normalizations and human requests preserve order, duplicates and full values', async () => {
  const { buildCandidateDecision, renderCandidateExplanation, candidateConstants } = await oracle();
  const warning = buildCandidateDecision({ fixture: fixture('review'), scenario: 'warning' });
  const result = renderCandidateExplanation({
    decision: warning,
    admissionWarnings: [
      {
        code: 'guidance-source-diverged',
        args: {
          source: '.ai-task-manager/aitm-guidance.yml',
          digest: candidateConstants.SOURCE_DIGEST,
        },
      },
    ],
  }).result;
  assert.deepEqual(
    result.warnings.map(({ code }) => code),
    [
      'guidance-source-diverged',
      'guidance-source-diverged',
      'legacy-guard-warning',
      'legacy-guard-warning',
    ]
  );

  const normalized = buildCandidateDecision({
    fixture: fixture('close'),
    scenario: 'normalization',
  });
  const presented = renderCandidateExplanation({ decision: normalized }).result.normalizations[0];
  assert.deepEqual(
    presented.decisions.map(({ key }) => key),
    ['acs', 'checkboxes']
  );
  assert.equal(Object.hasOwn(presented, 'inputDigest'), false);
  assert.equal(Object.hasOwn(presented, 'decisionDigest'), false);
});

test('guidance receipts suppress static text only and digest changes expand it again', async () => {
  const { buildCandidateDecision, renderCandidateExplanation, candidateConstants } = await oracle();
  const decision = buildCandidateDecision({ fixture: fixture('bind'), scenario: 'blocked' });
  const expanded = renderCandidateExplanation({ decision });
  const suppressed = renderCandidateExplanation({
    decision,
    knownGuidance: [{ id: 'action.bind', digest: candidateConstants.GUIDANCE_DIGEST }],
  });
  const changed = renderCandidateExplanation({
    decision,
    knownGuidance: [{ id: 'action.bind', digest: `sha256:${'0'.repeat(64)}` }],
  });

  assert.deepEqual(suppressed.result, expanded.result);
  assert.deepEqual(suppressed.guidance[0], {
    id: 'action.bind',
    digest: candidateConstants.GUIDANCE_DIGEST,
    status: 'not-modified',
  });
  assert.equal(changed.guidance[0].status, 'expanded');
  assert.equal(Object.hasOwn(changed.guidance[0], 'agent'), true);
});

test('diagnostic mode adds the same full decision and only explicitly untrusted messages', async () => {
  const { buildCandidateDecision, renderCandidateExplanation } = await oracle();
  const decision = buildCandidateDecision({ fixture: fixture('test'), scenario: 'indeterminate' });
  const routine = renderCandidateExplanation({ decision });
  const diagnostic = renderCandidateExplanation({
    decision,
    diagnostic: true,
    diagnosticMessages: [
      { guardId: 'authority-collection', text: 'network timeout', untrusted: true },
    ],
  });

  assert.deepEqual(diagnostic.result, routine.result);
  assert.deepEqual(diagnostic.fullDecision, decision);
  assert.deepEqual(diagnostic.diagnosticMessages, [
    { guardId: 'authority-collection', text: 'network timeout', untrusted: true },
  ]);
  assert.equal(Object.hasOwn(routine, 'fullDecision'), false);
  assert.equal(Object.hasOwn(routine, 'diagnosticMessages'), false);
});

test('routine consumer rejects malformed operational values independently of the serializer', async () => {
  const { buildCandidateDecision, renderCandidateExplanation, validateCandidateExplanation } =
    await oracle();
  const envelope = renderCandidateExplanation({
    decision: buildCandidateDecision({ fixture: fixture('close'), scenario: 'blocked' }),
  });
  for (const mutate of [
    (value) => (value.result.issue = -1),
    (value) => (value.result.status = 'invented'),
    (value) => (value.result.blockers = null),
  ]) {
    const candidate = clone(envelope);
    mutate(candidate);
    assert.throws(() => validateCandidateExplanation(candidate), /guidance-candidate:/);
  }

  const approvalEnvelope = renderCandidateExplanation({
    decision: buildCandidateDecision({
      fixture: fixture('deliver'),
      scenario: 'effective-policy-human-request',
    }),
  });
  for (const mutate of [
    (value) => (value.result.blockers[0].guardId = 'action-navigation'),
    (value) => (value.result.blockers[0].remediation.args = {}),
    (value) => (value.result.humanDecision.requests[0].args.head = 'f'.repeat(40)),
    (value) => (value.result.humanDecision.requests[0].subject.actionId = 'bind'),
    (value) => (value.result.humanDecision = null),
  ]) {
    const candidate = clone(approvalEnvelope);
    mutate(candidate);
    assert.throws(() => validateCandidateExplanation(candidate), /guidance-candidate:/);
  }
});

test('closed sources and snapshot digest bind normalization inputs', async () => {
  const { buildCandidateDecision, validateCandidateDecision } = await oracle();
  const source = buildCandidateDecision({ fixture: fixture('resume'), scenario: 'indeterminate' });
  source.blockers[0].args.source = 'free-text-source';
  assert.throws(() => validateCandidateDecision(source), /guidance-candidate:blocker-source/);

  const normalization = buildCandidateDecision({
    fixture: fixture('close'),
    scenario: 'normalization',
  });
  normalization.normalizations[0].inputDigest = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => validateCandidateDecision(normalization),
    /guidance-candidate:snapshot-digest/
  );
});

test('cross-issue request is typed and followed by a fresh target evaluation', async () => {
  const { buildCandidateDecision, buildCrossIssueCandidateDecision, validateCandidateDecision } =
    await oracle();
  const parent = buildCrossIssueCandidateDecision({
    fixture: fixture('close'),
    targetFixture: fixture('promote'),
  });
  const child = buildCandidateDecision({ fixture: fixture('promote'), scenario: 'ready' });
  assert.equal(parent.blockers[0].args.issue, child.issue);
  assert.equal(parent.humanDecision.requests[0].subject.actionId, child.actionId);
  assert.notEqual(parent.snapshot.digest, child.snapshot.digest);
  for (const mutate of [
    (value) => (value.blockers[0].args.repository = 'other/repository'),
    (value) => (value.humanDecision.requests[0].subject.issue += 1),
    (value) => (value.humanDecision.requests[0].subject.actionId = 'bind'),
  ]) {
    const candidate = clone(parent);
    mutate(candidate);
    assert.throws(() => validateCandidateDecision(candidate), /guidance-candidate:/);
  }
});

test('diagnostic equivalence includes composed admission warnings', async () => {
  const { buildCandidateDecision, renderCandidateExplanation, candidateConstants } = await oracle();
  const decision = buildCandidateDecision({ fixture: fixture('review'), scenario: 'warning' });
  const admissionWarnings = [
    {
      code: 'guidance-source-diverged',
      args: {
        source: '.ai-task-manager/aitm-guidance.yml',
        digest: candidateConstants.SOURCE_DIGEST,
      },
    },
  ];
  const routine = renderCandidateExplanation({ decision, admissionWarnings });
  const diagnostic = renderCandidateExplanation({ decision, admissionWarnings, diagnostic: true });
  assert.deepEqual(diagnostic.result, routine.result);
});

test('project override annotation occurs only after a valid successful first mutation', async () => {
  const { projectOverrideMutationEffect, projectOverrideProtocol, candidateConstants } =
    await oracle();
  assert.deepEqual(
    projectOverrideMutationEffect({
      valid: true,
      mutationSucceeded: true,
      alreadyAnnotated: false,
    }),
    { mutationAllowed: true, warningEmitted: true, annotationWritten: true }
  );
  assert.deepEqual(
    projectOverrideMutationEffect({
      valid: false,
      mutationSucceeded: true,
      alreadyAnnotated: false,
    }),
    { mutationAllowed: false, warningEmitted: false, annotationWritten: false }
  );
  assert.deepEqual(
    projectOverrideMutationEffect({ valid: true, mutationSucceeded: true, alreadyAnnotated: true }),
    { mutationAllowed: true, warningEmitted: true, annotationWritten: false }
  );
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
  const active = projectOverrideProtocol({ ...common, receiptDigest: null, contextReset: false });
  assert.equal(active.warningText, candidateConstants.PROJECT_OVERRIDE_WARNING);
  assert.equal(
    active.sourceReceipt,
    `aitm-guidance-source:project-owned-diverged:${candidateConstants.SOURCE_DIGEST}`
  );
  const suppressed = projectOverrideProtocol({
    ...common,
    receiptDigest: common.digest,
    contextReset: false,
  });
  assert.equal(suppressed.warningText, null);
  assert.equal(suppressed.sourceReceipt, active.sourceReceipt);
  const inactive = projectOverrideProtocol({
    ...common,
    diverged: false,
    receiptDigest: null,
    contextReset: false,
  });
  assert.equal(inactive.warningText, null);
  assert.equal(inactive.sourceReceipt, null);
  assert.equal(
    projectOverrideProtocol({
      ...common,
      receiptDigest: `sha256:${'0'.repeat(64)}`,
      contextReset: false,
    }).warningEmitted,
    true
  );
});

test('all frozen clauses point to executed assertions and observed positive and adversarial fixtures', async () => {
  const { executeCandidateTraceability } =
    await import('../../../helpers/guidance-characterization-harness.mjs');
  const index = json('spec-clause-index.json');
  const traceability = json('oracle-traceability.json');
  const runtime = executeCandidateTraceability({ index, traceability });
  assert.deepEqual(traceability.assertions.executed, runtime.executedAssertions);
  assert.deepEqual(traceability.fixtures.observed, runtime.observedFixtures);
  assert.deepEqual(
    traceability.mappings.map(({ clauseId, executionStatus }) => ({ clauseId, executionStatus })),
    runtime.mappings
  );
  const result = assertOracleTraceability({ index, traceability, requireAllExecuted: true });
  assert.equal(result.mappingCount, 70);
  assert.equal(result.executedCount, 70);
  assert.equal(result.pendingCount, 0);
  assert.equal(traceability.clauseIndexSha256, digestJson(index));

  const missingProbe = clone(traceability);
  missingProbe.mappings[0].fieldChecks = ['unregistered.runtime-probe'];
  assert.throws(
    () => executeCandidateTraceability({ index, traceability: missingProbe }),
    /missing runtime probe/
  );
});
