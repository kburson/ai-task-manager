import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEstimationReportModel,
  loadEstimationRecordsFromComments,
} from './estimation-records.mjs';

const RID = {
  forecast: '01J00000000000000000000030',
  outcome: '01J00000000000000000000031',
  rubric: '01J00000000000000000000032',
  childA: '01J00000000000000000000033',
  childB: '01J00000000000000000000034',
};

function parsed(recordType, recordId, issue, payload, createdAt = '2026-08-02T12:00:00.000Z') {
  return {
    commentNodeId: `IC_${recordId}`,
    updatedAt: createdAt,
    envelope: { recordType, recordId, issue, createdAt, payload },
  };
}

function forecast(
  issue,
  { human = 6, refine = 5, p50 = 3.8, p80 = 5.6, recordId = RID.forecast, supersedes = null } = {}
) {
  const record = parsed('estimation-forecast', recordId, issue, {
    issue,
    refine: { humanHours: refine },
    plan: { humanHours: human },
    ai: { p50EngagedHours: p50, p80EngagedHours: p80 },
    rubric: { version: 4, cohortSize: 12, confidence: 0.75 },
  });
  record.envelope.supersedes = supersedes;
  return record;
}

function outcome(
  issue,
  { actual = 4.2, human = 6, p50 = 3.8, p80 = 5.6, avoidable = 0.4, children = [] } = {}
) {
  return parsed('estimation-outcome', RID.outcome, issue, {
    issue,
    kind: 'story',
    forecastRecordId: RID.forecast,
    humanPlanHours: human,
    aiForecast: { p50EngagedHours: p50, p80EngagedHours: p80 },
    actual: { engagedHours: actual },
    variance: { vsAiP50Hours: actual - p50, vsAiP80Hours: actual - p80 },
    costClassification: {
      necessaryHours: actual - avoidable,
      avoidableProcessWasteHours: avoidable,
      unclassifiedHours: 0,
    },
    landscape: { childOutcomeRecordIds: children },
  });
}

test('loads validated preloaded issue comments without additional GitHub calls', () => {
  const calls = [];
  const comments = [{ id: 'IC_cached' }];
  const records = loadEstimationRecordsFromComments({
    issues: [{ number: 1091, comments }],
    repository: 'kburson/ai-task-manager',
    parseComments(input) {
      calls.push(input);
      return [forecast(1091), outcome(1091)];
    },
  });

  assert.equal(calls.length, 1);
  assert.strictEqual(calls[0].nodes, comments);
  assert.deepEqual(records.evidenceGaps, []);
  assert.equal(records.recordsByIssue.get(1091).length, 2);
});

test('malformed record evidence is reported as a gap, never converted to zero', () => {
  const records = loadEstimationRecordsFromComments({
    issues: [{ number: 1091, comments: [{ id: 'IC_bad' }] }],
    repository: 'kburson/ai-task-manager',
    parseComments() {
      throw new Error('bad envelope');
    },
  });

  assert.equal(records.recordsByIssue.has(1091), false);
  assert.deepEqual(records.evidenceGaps, [{ issue: 1091, reason: 'malformed-record-evidence' }]);
});

test('a truncated cached comment connection is an evidence gap, not a partial corpus', () => {
  let parsed = false;
  const records = loadEstimationRecordsFromComments({
    issues: [{ number: 1091, comments: [], commentsComplete: false }],
    repository: 'kburson/ai-task-manager',
    parseComments() {
      parsed = true;
      return [];
    },
  });

  assert.equal(parsed, false);
  assert.deepEqual(records.evidenceGaps, [{ issue: 1091, reason: 'truncated-comment-corpus' }]);
});

test('story metrics expose human Plan, AI P50/P80, actual, accuracy, variance, and waste', () => {
  const recordsByIssue = new Map([[1091, [forecast(1091), outcome(1091)]]]);
  const model = buildEstimationReportModel({ items: [{ number: 1091 }], recordsByIssue });
  const row = model.rowsByIssue.get(1091);

  assert.equal(row.humanPlanHours, 6);
  assert.equal(row.aiP50Hours, 3.8);
  assert.equal(row.aiP80Hours, 5.6);
  assert.equal(row.actualEngagedHours, 4.2);
  assert.ok(Math.abs(row.varianceVsAiP50Hours - 0.4) < 1e-12);
  assert.equal(row.refineAccuracy, 5 / 6);
  assert.ok(Math.abs(row.aiP50Accuracy - (1 - 0.4 / 4.2)) < 1e-12);
  assert.equal(row.avoidableWasteHours, 0.4);
  assert.ok(Math.abs(row.acceleration - 6 / 4.2) < 1e-12);
  assert.equal(row.accelerationLabel, '1.43×');
  assert.deepEqual(row.evidenceGaps, []);
});

test('below-one acceleration is labelled plainly and preserves the #1068 0.86x case', () => {
  const actual = 3 + 29 / 60 + 10 / 3600;
  const recordsByIssue = new Map([[1068, [forecast(1068, { human: 3 }), outcome(1068, { human: 3, actual })]]]);
  const row = buildEstimationReportModel({ items: [{ number: 1068 }], recordsByIssue }).rowsByIssue.get(1068);

  assert.equal(row.acceleration.toFixed(2), '0.86');
  assert.equal(row.accelerationLabel, '0.86× (slower than Plan)');
});

test('missing forecast or outcome stays an evidence gap rather than becoming zero', () => {
  const row = buildEstimationReportModel({
    items: [{ number: 1091 }],
    recordsByIssue: new Map(),
  }).rowsByIssue.get(1091);

  assert.equal(row.humanPlanHours, null);
  assert.equal(row.actualEngagedHours, null);
  assert.equal(row.acceleration, null);
  assert.deepEqual(row.evidenceGaps, ['missing-forecast', 'missing-outcome']);
});

test('story outcome must bind to the unique active forecast generation', () => {
  const priorId = '01J00000000000000000000035';
  const activeId = '01J00000000000000000000036';
  const prior = forecast(1091, { recordId: priorId, human: 5 });
  const active = forecast(1091, { recordId: activeId, supersedes: priorId, human: 8 });
  const staleOutcome = outcome(1091);
  staleOutcome.envelope.payload.forecastRecordId = priorId;
  const row = buildEstimationReportModel({
    items: [{ number: 1091 }],
    recordsByIssue: new Map([[1091, [prior, active, staleOutcome]]]),
  }).rowsByIssue.get(1091);

  assert.equal(row.forecastRecordId, activeId);
  assert.equal(row.outcomeRecordId, null);
  assert.equal(row.actualEngagedHours, null);
  assert.ok(row.evidenceGaps.includes('outcome-forecast-mismatch'));
});

test('epic rollup uses child Plan and engaged plus classified parent orchestration only', () => {
  const childAForecast = forecast(2001, { human: 5, p50: 2, p80: 3 });
  const childAOutcome = { ...outcome(2001, { human: 5, actual: 2 }), envelope: { ...outcome(2001, { human: 5, actual: 2 }).envelope, recordId: RID.childA } };
  const childBForecast = forecast(2002, { human: 7, p50: 3, p80: 4 });
  const childBOutcome = { ...outcome(2002, { human: 7, actual: 3 }), envelope: { ...outcome(2002, { human: 7, actual: 3 }).envelope, recordId: RID.childB } };
  const parentOutcome = outcome(2000, {
    human: 100,
    actual: 1,
    avoidable: 0.2,
    children: [RID.childA, RID.childB],
  });
  parentOutcome.envelope.payload.kind = 'epic-orchestration';
  parentOutcome.envelope.payload.forecastRecordId = null;
  const model = buildEstimationReportModel({
    items: [
      { number: 2000, parentNumber: null, estimate: 100 },
      { number: 2001, parentNumber: 2000 },
      { number: 2002, parentNumber: 2000 },
    ],
    recordsByIssue: new Map([
      [2000, [forecast(2000, { human: 100 }), parentOutcome]],
      [2001, [childAForecast, childAOutcome]],
      [2002, [childBForecast, childBOutcome]],
    ]),
  });
  const epic = model.rowsByIssue.get(2000);

  assert.equal(epic.humanPlanHours, 12);
  assert.equal(epic.actualEngagedHours, 6);
  assert.equal(epic.acceleration, 2);
  assert.equal(epic.parentOrchestrationHours, 1);
  assert.equal(epic.avoidableWasteHours, 1);
});

test('epic rollup is unavailable rather than numeric when child evidence or references are partial', () => {
  const childA = outcome(2001, { human: 5, actual: 2 });
  childA.envelope.recordId = RID.childA;
  const parentOutcome = outcome(2000, { actual: 1, children: [] });
  parentOutcome.envelope.payload.kind = 'epic-orchestration';
  parentOutcome.envelope.payload.forecastRecordId = null;
  const epic = buildEstimationReportModel({
    items: [
      { number: 2000 },
      { number: 2001, parentNumber: 2000 },
      { number: 2002, parentNumber: 2000 },
    ],
    recordsByIssue: new Map([
      [2000, [parentOutcome]],
      [2001, [forecast(2001, { human: 5 }), childA]],
      [2002, [forecast(2002, { human: 7 })]],
    ]),
  }).rowsByIssue.get(2000);

  assert.equal(epic.humanPlanHours, null);
  assert.equal(epic.actualEngagedHours, null);
  assert.equal(epic.acceleration, null);
  assert.ok(epic.evidenceGaps.includes('partial-epic-rollup'));
});

test('methodology publishes rubric version, cohort, confidence, and P80 coverage', () => {
  const rubric = parsed('estimation-rubric', RID.rubric, 1091, {
    version: 4,
    cohort: Array.from({ length: 12 }),
    ai: { confidence: 0.75 },
    accuracy: { aiP80Coverage: 0.83 },
  });
  const model = buildEstimationReportModel({
    items: [{ number: 1091 }],
    recordsByIssue: new Map([[1091, [forecast(1091), outcome(1091), rubric]]]),
  });

  assert.deepEqual(model.methodology, {
    rubricVersion: 4,
    cohortSize: 12,
    confidence: 0.75,
    p80Coverage: 0.83,
  });
});
