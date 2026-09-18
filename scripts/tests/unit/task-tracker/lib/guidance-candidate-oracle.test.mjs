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
      assert.equal(decision.status, expectedStatuses[scenario]);
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
  assert.equal(approvalResult.blockers[0].args.issue, definition.issue + 100);
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

test('project override annotation occurs only after a valid successful first mutation', async () => {
  const { projectOverrideMutationEffect } = await oracle();
  assert.deepEqual(
    projectOverrideMutationEffect({
      valid: true,
      mutationSucceeded: true,
      alreadyAnnotated: false,
    }),
    { mutationAllowed: true, annotationWritten: true }
  );
  assert.deepEqual(
    projectOverrideMutationEffect({
      valid: false,
      mutationSucceeded: true,
      alreadyAnnotated: false,
    }),
    { mutationAllowed: false, annotationWritten: false }
  );
  assert.deepEqual(
    projectOverrideMutationEffect({ valid: true, mutationSucceeded: true, alreadyAnnotated: true }),
    { mutationAllowed: true, annotationWritten: false }
  );
});

test('all frozen clauses point to executed assertions and observed positive and adversarial fixtures', () => {
  const index = json('spec-clause-index.json');
  const traceability = json('oracle-traceability.json');
  const result = assertOracleTraceability({ index, traceability, requireAllExecuted: true });
  assert.equal(result.mappingCount, 70);
  assert.equal(result.executedCount, 70);
  assert.equal(result.pendingCount, 0);
  assert.equal(traceability.clauseIndexSha256, digestJson(index));
});
