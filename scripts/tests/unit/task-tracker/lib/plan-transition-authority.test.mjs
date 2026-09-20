// @story #1720
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyCompletedPlanTransitionAuthority,
  parsePlanTransitionAuthorityComment,
  renderPlanTransitionAuthorityComment,
  resolvePlanTransitionAuthority,
  writePlanTransitionAuthority,
} from '../../../../task-tracker/lib/plan-transition-authority.mjs';
import { fingerprint } from '../../../../task-tracker/lib/resident-action-ledger-codec.mjs';
import {
  buildPlanApprovalAuditComment,
  isCanonicalPlanApprovalAuditComment,
} from '../../../../task-tracker/lib/plan-approval-audit.mjs';

const TRANSITION_ID = 'move:11111111-1111-4111-8111-111111111111';
const OTHER_TRANSITION_ID = 'move:22222222-2222-4222-8222-222222222222';
const RECORD_ID = '01M2Y000000000000000000001';
const SCOPE_IDENTITY = `sha256:${'a'.repeat(64)}`;
const RECORDED_AT = '2026-09-19T15:22:16.645Z';
const REPOSITORY = 'example/repo';

function waiverPolicy() {
  return {
    scopeIdentity: SCOPE_IDENTITY,
    decision(id) {
      assert.equal(id, 'approval.plan');
      return {
        id,
        outcome: 'waived',
        authority: {
          recordId: RECORD_ID,
          revision: 2,
          reference: 'https://github.com/example/repo/issues/61#issuecomment-1',
          verificationLevel: 'github-author',
        },
      };
    },
  };
}

function baseInput(overrides = {}) {
  return {
    repository: REPOSITORY,
    issue: 61,
    transitionId: TRANSITION_ID,
    body: 'planned body',
    workflowPolicy: waiverPolicy(),
    sessionPolicy: { gates: { analysisToDevelopment: true } },
    cfg: {},
    scopeIdentity: SCOPE_IDENTITY,
    recordedAt: RECORDED_AT,
    ...overrides,
  };
}

test('waived authority preserves the exact exception revision and evaluated scope', () => {
  const record = resolvePlanTransitionAuthority(baseInput());

  assert.equal(record.outcome, 'waived');
  assert.equal(record.scopeIdentity, SCOPE_IDENTITY);
  assert.deepEqual(record.evidence, {
    kind: 'workflow-exception',
    recordId: RECORD_ID,
    revision: 2,
    reference: 'https://github.com/example/repo/issues/61#issuecomment-1',
    verificationLevel: 'github-author',
  });
  assert.deepEqual(
    parsePlanTransitionAuthorityComment(renderPlanTransitionAuthorityComment(record)),
    record
  );
});

test('ordinary approval remains satisfied and fingerprints the exact approval marker', () => {
  const body = [
    'planned body',
    `<!-- aitm-plan-approved ts="${RECORDED_AT}" trunk-sha="${'b'.repeat(40)}" mode="human" -->`,
  ].join('\n');
  const record = resolvePlanTransitionAuthority(
    baseInput({ body, workflowPolicy: null, scopeIdentity: SCOPE_IDENTITY })
  );

  assert.equal(record.outcome, 'satisfied');
  assert.equal(record.evidence.kind, 'plan-approved-marker');
  assert.equal(record.evidence.mode, 'human');
  assert.equal(record.evidence.ts, RECORDED_AT);
  assert.match(record.evidence.markerFingerprint, /^sha256:[0-9a-f]{64}$/);
});

test('approval fingerprint uses the same fence-aware marker that passed parsing', () => {
  const fenced = `<!-- aitm-plan-approved ts="2026-01-01T00:00:00.000Z" mode="human" -->`;
  const real = `<!-- aitm-plan-approved ts="${RECORDED_AT}" trunk-sha="${'b'.repeat(40)}" mode="human" -->`;
  const body = ['```md', fenced, '```', real].join('\n');

  const record = resolvePlanTransitionAuthority(
    baseInput({ body, workflowPolicy: null, scopeIdentity: SCOPE_IDENTITY })
  );

  assert.equal(record.evidence.ts, RECORDED_AT);
  assert.equal(record.evidence.markerFingerprint, fingerprint(real));
  assert.notEqual(record.evidence.markerFingerprint, fingerprint(fenced));
});

test('recordedAt requires canonical millisecond UTC form', () => {
  assert.throws(
    () => resolvePlanTransitionAuthority(baseInput({ recordedAt: '2026-09-19T15:22:16Z' })),
    /recorded-at/
  );
});

test('disabled approval gate is not represented as satisfied approval', () => {
  const record = resolvePlanTransitionAuthority(
    baseInput({
      workflowPolicy: null,
      sessionPolicy: { gates: { analysisToDevelopment: false } },
    })
  );

  assert.equal(record.outcome, 'not-required');
  assert.deepEqual(record.evidence, {
    kind: 'gate-policy',
    gate: 'analysisToDevelopment',
    required: false,
  });
});

test('required approval without a marker or waiver fails closed', () => {
  assert.throws(
    () => resolvePlanTransitionAuthority(baseInput({ workflowPolicy: null })),
    /approval-missing/
  );
});

test('completion requires matching Develop entry and move-complete transition identities', () => {
  const record = resolvePlanTransitionAuthority(baseInput());
  const completedBody = [
    `<!-- aitm-entered-develop ts="${RECORDED_AT}" move="${TRANSITION_ID}" -->`,
    `<!-- aitm-move-complete state=develop ts=${RECORDED_AT} move=${TRANSITION_ID} -->`,
  ].join('\n');

  assert.equal(
    classifyCompletedPlanTransitionAuthority({ record, issueBody: completedBody }).status,
    'completed'
  );
  assert.equal(
    classifyCompletedPlanTransitionAuthority({
      record,
      issueBody: completedBody.replace(TRANSITION_ID, OTHER_TRANSITION_ID),
    }).status,
    'mismatch'
  );
  assert.equal(
    classifyCompletedPlanTransitionAuthority({ record, issueBody: 'still in Plan' }).status,
    'pending'
  );
});

test('writer creates and exactly reads back one immutable authority record', async () => {
  const created = [];
  const result = await writePlanTransitionAuthority({
    issueArg: '61',
    transitionId: TRANSITION_ID,
    cfg: { repo: REPOSITORY },
    planTransitionAuthorityInput: {
      body: 'planned body',
      workflowPolicy: waiverPolicy(),
      sessionPolicy: { gates: { analysisToDevelopment: true } },
      scopeIdentity: SCOPE_IDENTITY,
      recordedAt: RECORDED_AT,
    },
    deps: {
      createPlanTransitionAuthorityComment: async (body) => {
        created.push(body);
        return { id: 123 };
      },
      readPlanTransitionAuthorityComment: async () => ({ id: 123, body: created[0] }),
    },
  });

  assert.equal(result.verified, true);
  assert.equal(result.commentId, '123');
  assert.equal(result.record.outcome, 'waived');
  assert.equal(created.length, 1);
});

test('writer reconciles an ambiguous create transport from one exact listed record', async () => {
  let attemptedBody = '';
  const result = await writePlanTransitionAuthority({
    issueArg: '61',
    transitionId: TRANSITION_ID,
    cfg: { repo: REPOSITORY },
    planTransitionAuthorityInput: {
      body: 'planned body',
      workflowPolicy: waiverPolicy(),
      sessionPolicy: { gates: { analysisToDevelopment: true } },
      scopeIdentity: SCOPE_IDENTITY,
      recordedAt: RECORDED_AT,
    },
    deps: {
      createPlanTransitionAuthorityComment: async (body) => {
        attemptedBody = body;
        throw new Error('connection reset after POST');
      },
      readPlanTransitionAuthorityComment: async () => {
        throw new Error('unreachable');
      },
      listPlanTransitionAuthorityComments: async () => [{ id: 456, body: attemptedBody }],
    },
  });

  assert.equal(result.verified, true);
  assert.equal(result.reconciled, true);
  assert.equal(result.commentId, '456');
  assert.equal(result.record.transitionId, TRANSITION_ID);
});

test('writer fails closed when ambiguous transport finds no exact record', async () => {
  await assert.rejects(
    () =>
      writePlanTransitionAuthority({
        issueArg: '61',
        transitionId: TRANSITION_ID,
        cfg: { repo: REPOSITORY },
        planTransitionAuthorityInput: {
          body: 'planned body',
          workflowPolicy: waiverPolicy(),
          sessionPolicy: { gates: { analysisToDevelopment: true } },
          scopeIdentity: SCOPE_IDENTITY,
          recordedAt: RECORDED_AT,
        },
        deps: {
          createPlanTransitionAuthorityComment: async () => {
            throw new Error('connection reset after POST');
          },
          listPlanTransitionAuthorityComments: async () => [],
        },
      }),
    /reconciliation-missing/
  );
});

test('writer fails closed when ambiguous transport finds duplicate exact records', async () => {
  let attemptedBody = '';
  await assert.rejects(
    () =>
      writePlanTransitionAuthority({
        issueArg: '61',
        transitionId: TRANSITION_ID,
        cfg: { repo: REPOSITORY },
        planTransitionAuthorityInput: {
          body: 'planned body',
          workflowPolicy: waiverPolicy(),
          sessionPolicy: { gates: { analysisToDevelopment: true } },
          scopeIdentity: SCOPE_IDENTITY,
          recordedAt: RECORDED_AT,
        },
        deps: {
          createPlanTransitionAuthorityComment: async (body) => {
            attemptedBody = body;
            throw new Error('connection reset after POST');
          },
          listPlanTransitionAuthorityComments: async () => [
            { id: 456, body: attemptedBody },
            { id: 457, body: attemptedBody },
          ],
        },
      }),
    /reconciliation-ambiguous/
  );
});

test('modern approval audits require the authority codec transition ID grammar', () => {
  const repairEvidence = {
    source: 'plan-transition-authority',
    historicalOutcome: 'waived',
    transitionId: TRANSITION_ID,
    authorityRecordId: RECORD_ID,
    authorityRevision: 2,
    approvalPlanRecordId: RECORD_ID,
    revokedRecordId: '01M2Y000000000000000000002',
  };
  const audit = buildPlanApprovalAuditComment({ issueNumber: 61, ts: RECORDED_AT, repairEvidence });
  assert.equal(
    isCanonicalPlanApprovalAuditComment(audit.replace(TRANSITION_ID, `move:${'-'.repeat(36)}`), {
      issueNumber: 61,
      ts: RECORDED_AT,
    }),
    false
  );
  assert.throws(
    () =>
      buildPlanApprovalAuditComment({
        issueNumber: 61,
        ts: RECORDED_AT,
        repairEvidence: { ...repairEvidence, transitionId: `move:${'-'.repeat(36)}` },
      }),
    /transition authority repair evidence is invalid/
  );
});
