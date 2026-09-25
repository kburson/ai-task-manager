// @story #1662
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EXPLANATION_SCHEMA,
  EXPLANATION_SCHEMA_V1,
  presentActionDecision,
  validateActionPresentation,
  validateExplanationEnvelope,
} from '../../../../task-tracker/lib/action-decision/presentation.mjs';
import {
  ACTION_DECISION_SCHEMA,
  ACTION_DECISION_SCHEMA_V1,
  validateHumanRequest,
} from '../../../../task-tracker/lib/action-decision/contract.mjs';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { actionDecisionSnapshot } from '../../../helpers/action-decision-fixtures.mjs';
import {
  buildCandidateDecision,
  renderCandidateExplanation,
} from '../../../helpers/guidance-characterization.mjs';
import {
  assertOracleTraceability,
  assertSpecClauseIndex,
} from '../../../helpers/guidance-clause-index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../../../..');
const fixtureDir = path.resolve(here, '../../../fixtures/1558/action-decision-fixtures');
const ISSUE = 1662;
const OTHER_ISSUE = 1663;
const SOURCE_DIGEST = `sha256:${'8'.repeat(64)}`;
const FULL_HEAD = '1234567890abcdef1234567890abcdef12345678';

function clone(value) {
  return structuredClone(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalRecordJson(value)).digest('hex')}`;
}

function decision({
  issue = ISSUE,
  actionId = 'promote',
  state = 'plan',
  status = 'ready',
  blockers = [],
  normalizations = [],
  warnings = [],
  humanDecision = null,
} = {}) {
  return {
    schema: ACTION_DECISION_SCHEMA,
    issue,
    actionId,
    status,
    snapshot: actionDecisionSnapshot(
      {
        state,
        head: FULL_HEAD,
        observations: [
          {
            source: 'issue-body',
            identity: `issue:${issue}`,
            observedAt: '2026-09-20T15:00:00.500Z',
            digest: `sha256:${'c'.repeat(64)}`,
          },
        ],
      },
      normalizations
    ),
    blockers,
    normalizations,
    warnings,
    humanDecision,
    guidanceIds: [
      actionId === null
        ? state === 'done'
          ? 'state.done'
          : 'navigation.unresolved'
        : `action.${actionId}`,
    ],
  };
}

function planApprovalBlocker(issue = ISSUE) {
  return {
    guardId: 'plan-exit-plan-approved',
    code: 'plan-approval-missing',
    args: {},
    remediation: { id: 'record-plan-approval', args: { issue } },
  };
}

function planApprovalRequest(issue = ISSUE) {
  return {
    kind: 'plan-approval',
    actor: 'configured-approver',
    subject: { issue, actionId: 'promote' },
    args: {},
  };
}

function reviewApprovalBlocker(issue = ISSUE, head = FULL_HEAD) {
  return {
    guardId: 'review-exit-review-approved',
    code: 'review-approval-missing',
    args: { head },
    remediation: { id: 'request-review-approval', args: { issue, head } },
  };
}

function reviewApprovalRequest(issue = ISSUE, actionId = 'deliver', head = FULL_HEAD) {
  return {
    kind: 'review-approval',
    actor: 'configured-approver',
    subject: { issue, actionId },
    args: { head },
  };
}

function authorityFailure({ source = 'issue-body', subject } = {}) {
  return {
    guardId: 'authority-collection',
    code: 'authority-read-failed',
    args: {
      source,
      reason: 'timeout',
      ...(subject === undefined ? {} : { subject }),
    },
    noAutomaticRemediation: { reason: 'authority-investigation-required' },
  };
}

function investigationRequest({ issue = ISSUE, actionId = 'promote', blocker } = {}) {
  return {
    kind: 'manual-investigation',
    actor: 'human-operator',
    subject: { issue, actionId },
    args: { guardId: blocker.guardId, code: blocker.code },
  };
}

function projectedNormalization() {
  const decisions = [
    { key: 'acs', derivationRule: 'derive-acs/v1', stamp: true, tick: true },
    {
      key: 'checkboxes',
      derivationRule: 'derive-checkboxes/v1',
      stamp: true,
      tick: false,
    },
  ];
  return {
    internal: {
      normalizerId: 'functional-dod-derived/v1',
      inputDigest: `sha256:${'a'.repeat(64)}`,
      decisions,
      decisionDigest: digest({ normalizerId: 'functional-dod-derived/v1', decisions }),
      disposition: 'persist-on-execute',
    },
    projected: {
      normalizerId: 'functional-dod-derived/v1',
      decisions,
      disposition: 'persist-on-execute',
    },
  };
}

function guidanceFor(result, { status = 'expanded' } = {}) {
  const id =
    result.actionId === null
      ? result.status === 'ready'
        ? 'state.done'
        : 'navigation.unresolved'
      : `action.${result.actionId}`;
  const base = { id, digest: `sha256:${'7'.repeat(64)}`, status };
  if (status === 'not-modified') return base;
  const instruction =
    result.actionId === null
      ? result.status === 'ready'
        ? [{ terminal_state: 'done' }, { recommendation: null }]
        : [
            { navigation: 'unresolved' },
            { recommendation: null },
            { if_blocked: 'use_returned_remediation_ids' },
          ]
      : [
          { query: result.actionId },
          { require_status: 'ready' },
          { if_blocked: 'use_returned_remediation_ids' },
          { execute: result.actionId },
          { execution_revalidates: true },
        ];
  return { ...base, agent: { instruction } };
}

test('projects a validated decision through the seven-field allowlist without operational loss', () => {
  const blocker = planApprovalBlocker();
  const normalization = projectedNormalization();
  const evaluatorWarning = {
    code: 'legacy-guard-warning',
    args: { guardId: 'plan-exit-plan-approved' },
  };
  const full = decision({
    status: 'blocked',
    blockers: [blocker],
    normalizations: [normalization.internal],
    warnings: [evaluatorWarning],
    humanDecision: { requests: [planApprovalRequest()] },
  });
  const admissionWarning = {
    code: 'guidance-source-diverged',
    args: { source: '.ai-task-manager/aitm-guidance.yml', digest: SOURCE_DIGEST },
  };

  const result = presentActionDecision({
    decision: full,
    admissionWarnings: [admissionWarning],
    suppressSourceWarning: false,
  });

  assert.deepEqual(result, {
    issue: ISSUE,
    actionId: 'promote',
    status: 'blocked',
    blockers: [blocker],
    normalizations: [normalization.projected],
    warnings: [admissionWarning, evaluatorWarning],
    humanDecision: { requests: [planApprovalRequest()] },
  });
  for (const forbidden of ['schema', 'snapshot', 'guidanceIds', 'inputDigest', 'decisionDigest']) {
    assert.equal(JSON.stringify(result).includes(forbidden), false);
  }
});

test('presentation validation rejects missing, unknown, undefined, and valid-looking empty substitutions', () => {
  const blocker = planApprovalBlocker();
  const result = presentActionDecision({
    decision: decision({
      status: 'blocked',
      blockers: [blocker],
      humanDecision: { requests: [planApprovalRequest()] },
    }),
  });

  const cases = [
    (() => {
      const value = clone(result);
      delete value.warnings;
      return value;
    })(),
    { ...result, extraEvidence: [] },
    { ...result, warnings: undefined },
    { ...result, blockers: [], humanDecision: null },
    { ...result, blockers: null },
    { ...result, actionId: 'workflow.promote' },
    { ...result, status: 'success' },
  ];
  for (const value of cases) assert.throws(() => validateActionPresentation(value));
  assert.throws(() => validateActionPresentation('{"issue":1662'));
});

test('presentation validation rejects unknown producers, codes, resources, dispositions, and subjects', () => {
  const blocker = authorityFailure();
  const base = presentActionDecision({
    decision: decision({
      status: 'indeterminate',
      blockers: [blocker],
      humanDecision: { requests: [investigationRequest({ blocker })] },
    }),
  });
  const mutations = [
    (value) => (value.blockers[0].guardId = 'invented-guard'),
    (value) => (value.blockers[0].code = 'invented-code'),
    (value) => (value.blockers[0].args.source = 'free-text-source'),
    (value) => delete value.blockers[0].args,
    (value) => (value.blockers[0].noAutomaticRemediation.reason = 'retry-it'),
    (value) =>
      (value.blockers[0].remediation = { id: 'record-plan-approval', args: { issue: ISSUE } }),
    (value) => (value.blockers[0].args.subject = false),
  ];
  for (const mutate of mutations) {
    const value = clone(base);
    mutate(value);
    assert.throws(() => validateActionPresentation(value));
  }
});

test('invalid internal decisions produce one fixed nonrecursive indeterminate refusal', () => {
  const malformed = decision();
  malformed.blockers = undefined;
  malformed.snapshot.stack = 'secret validator detail';

  const result = presentActionDecision({ decision: malformed });

  assert.deepEqual(result, {
    issue: ISSUE,
    actionId: 'promote',
    status: 'indeterminate',
    blockers: [
      {
        guardId: 'action-result-validation',
        code: 'guard-result-invalid',
        args: {},
        noAutomaticRemediation: { reason: 'result-investigation-required' },
      },
    ],
    normalizations: [],
    warnings: [],
    humanDecision: null,
  });
  assert.equal(JSON.stringify(result).includes('secret validator detail'), false);
  assert.throws(() => presentActionDecision({ decision: { issue: 0, actionId: 'promote' } }));
});

test('source receipt suppression removes only the matching admission warning', () => {
  const sourceWarning = {
    code: 'guidance-source-diverged',
    args: { source: '.ai-task-manager/aitm-guidance.yml', digest: SOURCE_DIGEST },
  };
  const evaluatorWarning = {
    code: 'legacy-guard-warning',
    args: { guardId: 'plan-exit-plan-approved' },
  };
  const full = decision({ warnings: [evaluatorWarning] });

  const unsuppressed = presentActionDecision({
    decision: full,
    admissionWarnings: [sourceWarning, sourceWarning],
  });
  const suppressed = presentActionDecision({
    decision: full,
    admissionWarnings: [sourceWarning, sourceWarning],
    suppressSourceWarning: true,
  });

  assert.deepEqual(unsuppressed.warnings, [sourceWarning, sourceWarning, evaluatorWarning]);
  assert.deepEqual(suppressed.warnings, [evaluatorWarning]);
});

test('cross-issue and simultaneous plan requests retain blocker order and typed targets', () => {
  const blockers = [planApprovalBlocker(OTHER_ISSUE), planApprovalBlocker(OTHER_ISSUE + 1)];
  const requests = [planApprovalRequest(OTHER_ISSUE), planApprovalRequest(OTHER_ISSUE + 1)];
  const result = presentActionDecision({
    decision: decision({
      actionId: 'close',
      state: 'review',
      status: 'blocked',
      blockers,
      humanDecision: { requests },
    }),
  });

  assert.equal(result.issue, ISSUE);
  assert.equal(result.actionId, 'close');
  assert.deepEqual(
    result.blockers.map((value) => value.remediation.args.issue),
    [OTHER_ISSUE, OTHER_ISSUE + 1]
  );
  assert.deepEqual(
    result.humanDecision.requests.map((value) => value.subject),
    [
      { issue: OTHER_ISSUE, actionId: 'promote' },
      { issue: OTHER_ISSUE + 1, actionId: 'promote' },
    ]
  );

  const wrongTarget = clone(result);
  wrongTarget.humanDecision.requests[0].subject.issue = ISSUE;
  assert.throws(() => validateActionPresentation(wrongTarget));
  const crossRepository = clone(result);
  crossRepository.blockers[0].args.repository = 'other/repository';
  assert.throws(() => validateActionPresentation(crossRepository));
});

test('multiple reads of one authority resource require unique typed subjects', () => {
  const first = authorityFailure({ source: 'issue-comment', subject: { issue: ISSUE } });
  const second = authorityFailure({ source: 'issue-comment', subject: { issue: OTHER_ISSUE } });
  const full = decision({
    status: 'indeterminate',
    blockers: [first, second],
    humanDecision: {
      requests: [
        investigationRequest({ issue: ISSUE, blocker: first }),
        investigationRequest({ issue: OTHER_ISSUE, blocker: second }),
      ],
    },
  });
  assert.equal(presentActionDecision({ decision: full }).blockers.length, 2);

  const missing = clone(full);
  delete missing.blockers[1].args.subject;
  assert.equal(
    presentActionDecision({ decision: missing }).blockers[0].guardId,
    'action-result-validation'
  );

  const duplicate = clone(full);
  duplicate.blockers[1].args.subject.issue = ISSUE;
  assert.equal(
    presentActionDecision({ decision: duplicate }).blockers[0].guardId,
    'action-result-validation'
  );
});

test('terminal Done and unresolved navigation preserve null-action semantics', () => {
  const terminal = presentActionDecision({
    decision: decision({ actionId: null, state: 'done', status: 'ready' }),
  });
  assert.equal(validateActionPresentation(terminal), terminal);

  const blocker = {
    guardId: 'action-navigation',
    code: 'state-unavailable',
    args: { reason: 'conflicting' },
    noAutomaticRemediation: { reason: 'state-investigation-required' },
  };
  const unresolved = presentActionDecision({
    decision: decision({
      actionId: null,
      state: 'unknown',
      status: 'indeterminate',
      blockers: [blocker],
      humanDecision: {
        requests: [investigationRequest({ actionId: null, blocker })],
      },
    }),
  });
  assert.equal(validateActionPresentation(unresolved), unresolved);

  const invented = clone(unresolved);
  invented.actionId = 'close';
  invented.humanDecision.requests[0].subject.actionId = 'close';
  assert.throws(() => validateActionPresentation(invented));
});

test('unknown vocabulary projects no executable recommendation', () => {
  const blocker = {
    guardId: 'action-navigation',
    code: 'unknown-vocabulary',
    args: {},
    noAutomaticRemediation: { reason: 'result-investigation-required' },
  };
  const fullDecision = decision({
    actionId: 'rebind',
    state: 'develop',
    status: 'indeterminate',
    blockers: [blocker],
  });
  fullDecision.guidanceIds = ['navigation.unknown'];

  const result = presentActionDecision({ decision: fullDecision });
  assert.equal(result.actionId, null);
  assert.equal(result.status, 'indeterminate');
  assert.deepEqual(result.blockers, [blocker]);
});

test('review approval requests require the configured approver and a full exact HEAD', () => {
  const request = {
    kind: 'review-approval',
    actor: 'configured-approver',
    subject: { issue: ISSUE, actionId: 'deliver' },
    args: { head: FULL_HEAD },
  };
  assert.deepEqual(validateHumanRequest(request), request);
  assert.throws(() => validateHumanRequest({ ...request, actor: 'human-operator' }));
  assert.throws(() => validateHumanRequest({ ...request, args: { head: FULL_HEAD.slice(0, 12) } }));
});

test('review approval blockers require one exact-HEAD human request', () => {
  const blocker = reviewApprovalBlocker();
  const fullDecision = decision({
    actionId: 'deliver',
    state: 'review',
    status: 'blocked',
    blockers: [blocker],
    humanDecision: { requests: [reviewApprovalRequest()] },
  });
  const result = presentActionDecision({ decision: fullDecision });
  assert.deepEqual(result.blockers, [blocker]);
  assert.deepEqual(result.humanDecision.requests, [reviewApprovalRequest()]);

  const missing = clone(fullDecision);
  missing.humanDecision = null;
  assert.equal(
    presentActionDecision({ decision: missing }).blockers[0].code,
    'guard-result-invalid'
  );

  const wrongHead = clone(fullDecision);
  wrongHead.humanDecision.requests[0].args.head = 'f'.repeat(40);
  assert.equal(
    presentActionDecision({ decision: wrongHead }).blockers[0].code,
    'guard-result-invalid'
  );

  const sixtyFourHead = 'a'.repeat(64);
  const longHeadDecision = clone(fullDecision);
  const { digest: _oldDigest, ...snapshot } = longHeadDecision.snapshot;
  longHeadDecision.snapshot = actionDecisionSnapshot(
    { ...snapshot, head: sixtyFourHead },
    longHeadDecision.normalizations
  );
  longHeadDecision.blockers[0] = reviewApprovalBlocker(ISSUE, sixtyFourHead);
  longHeadDecision.humanDecision.requests[0] = reviewApprovalRequest(
    ISSUE,
    'deliver',
    sixtyFourHead
  );
  assert.deepEqual(
    presentActionDecision({ decision: longHeadDecision }).blockers,
    longHeadDecision.blockers
  );
});

test('routine and diagnostic explanation envelopes enforce closed declared modes', () => {
  const fullDecision = decision({ actionId: 'close', state: 'review' });
  const result = presentActionDecision({ decision: fullDecision });
  const routine = {
    schema: EXPLANATION_SCHEMA,
    result,
    guidance: [guidanceFor(result)],
  };
  assert.equal(validateExplanationEnvelope(routine, { diagnostic: false }), routine);
  assert.equal(
    validateExplanationEnvelope(JSON.stringify(routine), { diagnostic: false }).schema,
    EXPLANATION_SCHEMA
  );

  const diagnostic = {
    ...clone(routine),
    fullDecision,
    diagnosticMessages: [
      { guardId: 'plan-exit-plan-approved', text: 'untrusted detail', untrusted: true },
    ],
  };
  assert.equal(validateExplanationEnvelope(diagnostic, { diagnostic: true }), diagnostic);
  assert.deepEqual(diagnostic.result, routine.result);

  assert.throws(() => validateExplanationEnvelope(diagnostic, { diagnostic: false }));
  const missingMessages = clone(diagnostic);
  delete missingMessages.diagnosticMessages;
  assert.throws(() => validateExplanationEnvelope(missingMessages, { diagnostic: true }));
  const missingDecision = clone(diagnostic);
  delete missingDecision.fullDecision;
  assert.throws(() => validateExplanationEnvelope(missingDecision, { diagnostic: true }));
  const trustedMessage = clone(diagnostic);
  trustedMessage.diagnosticMessages[0].untrusted = false;
  assert.throws(() => validateExplanationEnvelope(trustedMessage, { diagnostic: true }));
  assert.throws(() => validateExplanationEnvelope('{"schema":'));
});

test('a v3 delivery explanation preserves structured waived outcome without changing ordinary v2', () => {
  const ordinary = decision({ actionId: 'deliver', state: 'review' });
  const waived = {
    ...ordinary,
    schema: 'aitm.action-decision/v3',
    deliveryExceptions: [
      {
        category: 'merge-method',
        requirementId: 'delivery.verification.merge-method',
        outcome: 'waived',
      },
    ],
  };
  const result = presentActionDecision({ decision: waived });
  assert.deepEqual(result.deliveryExceptions, waived.deliveryExceptions);
  assert.equal(
    Object.hasOwn(presentActionDecision({ decision: ordinary }), 'deliveryExceptions'),
    false
  );
  const envelope = {
    schema: 'aitm.action-explanation/v3',
    result,
    guidance: [guidanceFor(result)],
    fullDecision: waived,
    diagnosticMessages: [],
  };
  assert.equal(validateExplanationEnvelope(envelope, { diagnostic: true }), envelope);
  assert.throws(() =>
    validateExplanationEnvelope({ ...envelope, schema: EXPLANATION_SCHEMA }, { diagnostic: true })
  );
});

test('routine guidance accepts catalog-owned sequences, but rejects unknown operations', () => {
  const result = presentActionDecision({ decision: decision() });
  const customGuidance = {
    id: 'project.promote-with-local-policy',
    digest: `sha256:${'9'.repeat(64)}`,
    status: 'expanded',
    agent: { instruction: [{ never: 'execute_free_text' }] },
  };
  const envelope = {
    schema: EXPLANATION_SCHEMA,
    result,
    guidance: [customGuidance],
  };
  assert.equal(validateExplanationEnvelope(envelope), envelope);
  const unknownOperation = clone(envelope);
  unknownOperation.guidance[0].agent.instruction = [{ execute_shell: 'rm -rf .' }];
  assert.throws(() => validateExplanationEnvelope(unknownOperation), /instruction/);
  const unknownValue = clone(envelope);
  unknownValue.guidance[0].agent.instruction = [{ never: 'ignore_authority' }];
  assert.throws(() => validateExplanationEnvelope(unknownValue), /instruction/);
});

test('diagnostic result must equal the projection of the same full decision', () => {
  const fullDecision = decision({ actionId: 'test', state: 'develop' });
  const result = presentActionDecision({ decision: fullDecision });
  const envelope = {
    schema: EXPLANATION_SCHEMA,
    result,
    guidance: [guidanceFor(result, { status: 'not-modified' })],
    fullDecision,
    diagnosticMessages: [],
  };
  assert.equal(validateExplanationEnvelope(envelope, { diagnostic: true }), envelope);

  const hiddenBlocker = clone(envelope);
  hiddenBlocker.fullDecision.status = 'indeterminate';
  hiddenBlocker.fullDecision.blockers = [authorityFailure()];
  hiddenBlocker.fullDecision.humanDecision = {
    requests: [investigationRequest({ blocker: hiddenBlocker.fullDecision.blockers[0] })],
  };
  assert.throws(() => validateExplanationEnvelope(hiddenBlocker, { diagnostic: true }));
});

test('evidence-only growth leaves routine bytes unchanged while operational growth is preserved', () => {
  const first = decision({ actionId: 'bind', state: 'develop' });
  const second = clone(first);
  second.snapshot.observations.push({
    source: 'issue-comment',
    identity: `evidence:${ISSUE}:1`,
    observedAt: '2026-09-20T15:00:00.750Z',
    digest: `sha256:${'d'.repeat(64)}`,
  });
  const { digest: _staleDigest, ...secondSnapshot } = second.snapshot;
  second.snapshot = actionDecisionSnapshot(
    {
      ...secondSnapshot,
      observations: secondSnapshot.observations,
    },
    second.normalizations
  );
  assert.equal(
    JSON.stringify(presentActionDecision({ decision: first })),
    JSON.stringify(presentActionDecision({ decision: second }))
  );

  const warning = clone(first);
  warning.warnings = [
    { code: 'legacy-guard-warning', args: { guardId: 'plan-exit-plan-approved' } },
  ];
  const warningResult = presentActionDecision({ decision: warning });
  assert.equal(warningResult.warnings.length, 1);
  assert.notEqual(
    JSON.stringify(warningResult),
    JSON.stringify(presentActionDecision({ decision: first }))
  );
});

test('all Task 1b scenario lanes preserve operational values or refuse candidate-only guards', () => {
  const index = JSON.parse(
    readFileSync(path.join(projectRoot, 'scripts/tests/fixtures/1558/spec-clause-index.json'))
  );
  const traceability = JSON.parse(
    readFileSync(path.join(projectRoot, 'scripts/tests/fixtures/1558/oracle-traceability.json'))
  );
  const indexed = assertSpecClauseIndex({
    index,
    specPath: index.source.path,
    specText: readFileSync(path.join(projectRoot, index.source.path), 'utf8'),
  });
  const traced = assertOracleTraceability({ index, traceability, requireAllExecuted: true });
  assert.equal(indexed.clauseCount, 70);
  assert.equal(traced.executedCount, indexed.clauseCount);

  let exercised = 0;
  for (const name of ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close']) {
    const fixture = JSON.parse(readFileSync(path.join(fixtureDir, `${name}.json`), 'utf8'));
    for (const scenario of fixture.scenarios) {
      exercised += 1;
      const fullDecision = buildCandidateDecision({ fixture, scenario });
      const expected = renderCandidateExplanation({ decision: fullDecision }).result;
      if (scenario === 'blocked') {
        // The oracle's synthetic producer and precondition remediation are not
        // registered live guards. Fail closed until a guard family is migrated.
        const refused = presentActionDecision({ decision: fullDecision });
        assert.equal(refused.status, 'indeterminate');
        assert.equal(refused.blockers[0].code, 'guard-result-invalid');
        assert.notDeepEqual(refused, expected);
        continue;
      }
      for (const normalization of fullDecision.normalizations) {
        normalization.decisionDigest = digest({
          normalizerId: normalization.normalizerId,
          decisions: normalization.decisions,
        });
      }
      if (scenario === 'warning') {
        for (const warning of fullDecision.warnings) {
          if (warning.code === 'legacy-guard-warning') {
            warning.args.guardId = 'plan-exit-plan-approved';
          }
        }
        for (const warning of expected.warnings) {
          if (warning.code === 'legacy-guard-warning') {
            warning.args.guardId = 'plan-exit-plan-approved';
          }
        }
      }
      if (scenario === 'effective-policy-human-request') {
        const blocker = fullDecision.blockers[0];
        if (blocker.code === 'plan-approval-missing') {
          blocker.guardId = 'plan-exit-plan-approved';
          expected.blockers[0].guardId = blocker.guardId;
        } else if (blocker.code === 'review-approval-missing') {
          blocker.guardId = 'review-exit-review-approved';
          expected.blockers[0].guardId = blocker.guardId;
        }
      }
      assert.deepEqual(presentActionDecision({ decision: fullDecision }), expected);
    }
  }
  assert.equal(exercised, 42);
});

test('v2 envelope preserves mixed-status blockers and v1 remains semantically closed', () => {
  const known = planApprovalBlocker();
  const unknown = authorityFailure({ source: 'workflow-policy' });
  const fullDecision = decision({
    status: 'indeterminate',
    blockers: [known, unknown],
    humanDecision: {
      requests: [planApprovalRequest(), investigationRequest({ blocker: unknown })],
    },
  });
  const result = presentActionDecision({ decision: fullDecision });
  assert.deepEqual(result.blockers, [known, unknown]);
  const envelope = {
    schema: EXPLANATION_SCHEMA,
    result,
    guidance: [guidanceFor(result)],
    fullDecision,
    diagnosticMessages: [],
  };
  assert.equal(validateExplanationEnvelope(envelope, { diagnostic: true }), envelope);
  assert.throws(() =>
    validateExplanationEnvelope(
      { ...envelope, schema: EXPLANATION_SCHEMA_V1 },
      { diagnostic: true }
    )
  );
  assert.throws(() =>
    validateExplanationEnvelope(
      {
        ...envelope,
        fullDecision: { ...fullDecision, schema: ACTION_DECISION_SCHEMA_V1 },
      },
      { diagnostic: true }
    )
  );
  assert.throws(() =>
    validateExplanationEnvelope(
      {
        ...envelope,
        result: { ...result, blockers: [known] },
      },
      { diagnostic: true }
    )
  );
});

test('v1 routine and diagnostic envelopes remain readable for v1-only decisions', () => {
  const fullDecision = decision({ schema: ACTION_DECISION_SCHEMA_V1 });
  fullDecision.schema = ACTION_DECISION_SCHEMA_V1;
  const result = presentActionDecision({ decision: fullDecision });
  const envelope = {
    schema: EXPLANATION_SCHEMA_V1,
    result,
    guidance: [guidanceFor(result)],
    fullDecision,
    diagnosticMessages: [],
  };
  assert.equal(validateExplanationEnvelope(envelope, { diagnostic: true }), envelope);
  assert.equal(
    validateExplanationEnvelope({
      schema: EXPLANATION_SCHEMA_V1,
      result,
      guidance: envelope.guidance,
    }).schema,
    EXPLANATION_SCHEMA_V1
  );
});

test('the current outer schema is closed: additive fields or semantic changes require another major', () => {
  const result = presentActionDecision({ decision: decision() });
  const envelope = {
    schema: EXPLANATION_SCHEMA,
    result,
    guidance: [guidanceFor(result)],
  };
  assert.throws(() => validateActionPresentation({ ...result, projectedDigest: SOURCE_DIGEST }));
  assert.throws(() => validateExplanationEnvelope({ ...envelope, experimental: true }));
  assert.throws(() =>
    validateExplanationEnvelope({ ...envelope, schema: 'aitm.action-explanation/v1.1' })
  );
});
