// @story #1734

import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { hashRecordPayload } from '../../../../../task-tracker/lib/github-records/record-envelope.mjs';
import { COST_RECORD_TYPES } from '../../../../../task-tracker/lib/cost/schema.mjs';
import {
  parseCostRecord,
  renderCostRecord,
} from '../../../../../task-tracker/lib/cost/record-codec.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1719;
const createdAt = '2026-09-21T00:00:00.000Z';

function authority() {
  return {
    grantId: '01J00000000000000000000001',
    epoch: 1,
    actor: 'codex/session-1719',
  };
}

function envelope(recordType, payload, overrides = {}) {
  return {
    schema: 'aitm.record/v1',
    recordId: overrides.recordId ?? '01J00000000000000000000000',
    recordType,
    repository,
    issue,
    createdAt,
    authority: authority(),
    predecessor: null,
    supersedes: null,
    payloadHash: hashRecordPayload(payload),
    payload,
    ...overrides,
  };
}

function eventPayload(overrides = {}) {
  return {
    schema: 'aitm.agent-cost-event/v1',
    eventId: 'cost-event-001',
    policyId: 'cost-policy-001',
    operationId: 'operation-001',
    issue,
    timingEvent: 'develop:started',
    timingRecordedAt: createdAt,
    stage: 'develop',
    stageVisit: 1,
    eventRole: 'opening',
    sources: [],
    observations: [],
    spans: [],
    lines: [],
    diagnostics: [],
    ...overrides,
  };
}

function policyPayload(overrides = {}) {
  return {
    schema: 'aitm.agent-cost-policy/v1',
    policyId: 'cost-policy-001',
    effectiveEventId: 'cost-event-001',
    effectiveAt: createdAt,
    captureMode: 'disabled',
    sourceRules: [],
    capabilities: [],
    catalogHashes: [],
    runRules: {
      kinds: ['codex'],
      requireLaunchEvidence: false,
      requireCompletionEvidence: false,
    },
    ...overrides,
  };
}

function reconciliationPayload(overrides = {}) {
  return {
    schema: 'aitm.agent-cost-reconciliation/v1',
    revisionId: 'revision-001',
    reason: 'initial-correction',
    inputs: [],
    removedSpanIds: [],
    addedSpans: [],
    correctedEvidence: [],
    runFacts: [],
    residuals: [],
    projectionHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    ...overrides,
  };
}

function subscriptionPayload(overrides = {}) {
  return {
    schema: 'aitm.subscription-capacity/v1',
    periodId: 'period-2026-09',
    provider: 'openai',
    accountRef: 'account-local',
    planName: 'team',
    periodStart: createdAt,
    periodEnd: '2026-10-21T00:00:00.000Z',
    fixedSpend: { amount: '0', currency: 'USD' },
    capacity: [],
    rules: { includedCategories: [], overageRates: [] },
    usageRefs: [],
    residuals: [],
    evidenceRefs: [],
    reconciledAt: createdAt,
    ...overrides,
  };
}

const payloadByType = {
  'agent-cost-event': eventPayload,
  'agent-cost-policy': policyPayload,
  'agent-cost-reconciliation': reconciliationPayload,
  'subscription-capacity': subscriptionPayload,
};

test('cost codec renders and parses every approved cost record type with isolated marker bytes', () => {
  assert.deepEqual([...COST_RECORD_TYPES].sort(), Object.keys(payloadByType).sort());

  for (const [recordType, makePayload] of Object.entries(payloadByType)) {
    const payload = makePayload();
    const record = envelope(recordType, payload);
    const body = renderCostRecord({
      envelope: record,
      visibleMarkdown: `Cost record ${recordType} verified.\n`,
    });

    const json = canonicalRecordJson(record).replaceAll('--', '-\\u002d');
    assert.equal(
      body,
      `<!-- aitm-cost-record\n${json}\n-->\nCost record ${recordType} verified.\n`
    );
    assert.deepEqual(
      parseCostRecord({
        commentNodeId: 'IC_kwDOCostRecord',
        body,
        expectedRepository: repository,
        expectedIssue: issue,
      }),
      {
        commentNodeId: 'IC_kwDOCostRecord',
        envelope: record,
        visibleMarkdown: `Cost record ${recordType} verified.\n`,
      }
    );
  }
});

test('cost codec rejects governance markers, noncanonical markers, correlation drift, secrets, and duplicate markers', () => {
  const payload = eventPayload();
  const record = envelope('agent-cost-event', payload);
  const body = renderCostRecord({ envelope: record, visibleMarkdown: 'Visible cost prose.\n' });

  assert.throws(
    () => renderCostRecord({ envelope: record, visibleMarkdown: '<!-- aitm-record\n{}\n-->\n' }),
    /cost:generic-marker/
  );
  assert.throws(
    () =>
      parseCostRecord({
        commentNodeId: 'IC_kwDOCostRecord',
        body: body.toUpperCase(),
        expectedRepository: repository,
        expectedIssue: issue,
      }),
    /cost:missing/
  );
  assert.throws(
    () =>
      parseCostRecord({
        commentNodeId: 'IC_kwDOCostRecord',
        body: ` ${body}`,
        expectedRepository: repository,
        expectedIssue: issue,
      }),
    /cost:malformed/
  );
  assert.throws(
    () =>
      parseCostRecord({
        commentNodeId: 'IC_kwDOCostRecord',
        body: `${body}${body}`,
        expectedRepository: repository,
        expectedIssue: issue,
      }),
    /cost:duplicate/
  );
  assert.throws(
    () =>
      parseCostRecord({
        commentNodeId: 'IC_kwDOCostRecord',
        body,
        expectedRepository: repository,
        expectedIssue: 1720,
      }),
    /cost:issue-mismatch/
  );
  assert.throws(
    () =>
      renderCostRecord({
        envelope: envelope('verification-evidence', payload),
        visibleMarkdown: 'Nope.\n',
      }),
    /cost:record-type/
  );
  assert.throws(
    () =>
      renderCostRecord({
        envelope: record,
        visibleMarkdown: 'Authorization: Bearer abcdefghijklmnop\n',
      }),
    /record-envelope:secret/
  );
});

test('cost codec enforces escaped JSON and final body byte budgets', () => {
  const payload = eventPayload({ eventId: 'cost-event-with--hyphen' });
  const record = envelope('agent-cost-event', payload);
  const body = renderCostRecord({
    envelope: record,
    visibleMarkdown: 'Unicode remains counted after render: ✓\n',
  });

  assert.match(body, /cost-event-with-\\u002dhyphen/);
  assert.throws(() => renderCostRecord({ envelope: record, maxBodyBytes: 0 }), /cost:body-budget/);
  assert.throws(() => renderCostRecord({ envelope: record, maxBodyBytes: -1 }), /cost:body-budget/);
  assert.throws(
    () => renderCostRecord({ envelope: record, maxBodyBytes: 1.5 }),
    /cost:body-budget/
  );
  assert.throws(
    () => renderCostRecord({ envelope: record, maxBodyBytes: Number.MAX_SAFE_INTEGER + 1 }),
    /cost:body-budget/
  );
  assert.throws(
    () =>
      renderCostRecord({
        envelope: record,
        visibleMarkdown: 'x'.repeat(60_000),
        maxBodyBytes: 1024 * 1024,
      }),
    /cost:record-size/
  );
  assert.throws(
    () => renderCostRecord({ envelope: record, visibleMarkdown: 'too wide\n', maxBodyBytes: 20 }),
    /cost:record-size/
  );
});
