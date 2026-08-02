import { parsePreloadedIssueComments } from '../../task-tracker/lib/github-records/github-comment-store.mjs';
import { formatAcceleration } from './board-fields.mjs';

function activeForecast(records) {
  const forecasts = records.filter(
    (record) => record?.envelope?.recordType === 'estimation-forecast'
  );
  const superseded = new Set(
    forecasts.map((record) => record.envelope.supersedes).filter((recordId) => recordId != null)
  );
  const active = forecasts.filter((record) => !superseded.has(record.envelope.recordId));
  return active.length === 1 ? active[0] : null;
}

function matchingStoryOutcome(records, forecast) {
  if (forecast === null) return null;
  const matching = records.filter(
    (record) =>
      record?.envelope?.recordType === 'estimation-outcome' &&
      record.envelope.payload.kind !== 'epic-orchestration' &&
      record.envelope.payload.forecastRecordId === forecast.envelope.recordId
  );
  return matching.length === 1 ? matching[0] : null;
}

function latestEpicOutcome(records) {
  return (
    records
      .filter(
        (record) =>
          record?.envelope?.recordType === 'estimation-outcome' &&
          record.envelope.payload.kind === 'epic-orchestration'
      )
      .toSorted((left, right) =>
        right.envelope.createdAt.localeCompare(left.envelope.createdAt)
      )[0] ?? null
  );
}

function accuracy(expected, actual) {
  if (
    typeof expected !== 'number' ||
    typeof actual !== 'number' ||
    !Number.isFinite(expected) ||
    !Number.isFinite(actual) ||
    actual <= 0
  ) {
    return null;
  }
  return Math.max(0, 1 - Math.abs(expected - actual) / actual);
}

function sumPresent(rows, key) {
  if (rows.some((row) => row[key] == null)) return null;
  return rows.reduce((sum, row) => sum + row[key], 0);
}

export function loadEstimationRecordsFromComments({
  issues,
  repository,
  parseComments = parsePreloadedIssueComments,
} = {}) {
  if (!Array.isArray(issues) || typeof parseComments !== 'function') {
    throw new TypeError('estimation-report:input');
  }
  const recordsByIssue = new Map();
  const evidenceGaps = [];
  for (const issue of issues) {
    if (issue.commentsComplete === false) {
      evidenceGaps.push({ issue: issue.number, reason: 'truncated-comment-corpus' });
      continue;
    }
    try {
      const records = parseComments({
        nodes: issue.comments ?? [],
        repository,
        issue: issue.number,
      });
      recordsByIssue.set(issue.number, records);
    } catch {
      evidenceGaps.push({ issue: issue.number, reason: 'malformed-record-evidence' });
    }
  }
  return { recordsByIssue, evidenceGaps };
}

function storyRow(issue, records) {
  const forecast = activeForecast(records);
  const outcome = matchingStoryOutcome(records, forecast);
  const storyOutcomes = records.filter(
    (record) =>
      record?.envelope?.recordType === 'estimation-outcome' &&
      record.envelope.payload.kind !== 'epic-orchestration'
  );
  const gaps = [];
  if (forecast === null) {
    gaps.push(
      records.some((record) => record?.envelope?.recordType === 'estimation-forecast')
        ? 'ambiguous-active-forecast'
        : 'missing-forecast'
    );
  }
  if (outcome === null)
    gaps.push(storyOutcomes.length > 0 ? 'outcome-forecast-mismatch' : 'missing-outcome');
  const humanPlanHours = forecast?.envelope.payload.plan.humanHours ?? null;
  const refineHours = forecast?.envelope.payload.refine.humanHours ?? null;
  const aiP50Hours = forecast?.envelope.payload.ai.p50EngagedHours ?? null;
  const aiP80Hours = forecast?.envelope.payload.ai.p80EngagedHours ?? null;
  const actualEngagedHours = outcome?.envelope.payload.actual.engagedHours ?? null;
  const acceleration =
    humanPlanHours != null && actualEngagedHours != null && actualEngagedHours > 0
      ? humanPlanHours / actualEngagedHours
      : null;
  return {
    issue,
    forecastRecordId: forecast?.envelope.recordId ?? null,
    outcomeRecordId: outcome?.envelope.recordId ?? null,
    humanPlanHours,
    aiP50Hours,
    aiP80Hours,
    actualEngagedHours,
    varianceVsAiP50Hours: outcome?.envelope.payload.variance.vsAiP50Hours ?? null,
    varianceVsAiP80Hours: outcome?.envelope.payload.variance.vsAiP80Hours ?? null,
    refineAccuracy: accuracy(refineHours, humanPlanHours),
    aiP50Accuracy: accuracy(aiP50Hours, actualEngagedHours),
    avoidableWasteHours:
      outcome?.envelope.payload.costClassification.avoidableProcessWasteHours ?? null,
    acceleration,
    accelerationLabel: formatAcceleration(acceleration),
    parentOrchestrationHours: 0,
    evidenceGaps: gaps,
  };
}

function methodology(recordsByIssue) {
  const rubrics = [...recordsByIssue.values()]
    .flat()
    .filter((record) => record?.envelope?.recordType === 'estimation-rubric')
    .toSorted((left, right) => right.envelope.createdAt.localeCompare(left.envelope.createdAt));
  const payload = rubrics[0]?.envelope.payload;
  if (payload === undefined) {
    return { rubricVersion: null, cohortSize: null, confidence: null, p80Coverage: null };
  }
  return {
    rubricVersion: payload.version,
    cohortSize: payload.cohort.length,
    confidence: payload.ai.confidence,
    p80Coverage: payload.accuracy.aiP80Coverage,
  };
}

export function buildEstimationReportModel({ items, recordsByIssue } = {}) {
  if (!Array.isArray(items) || !(recordsByIssue instanceof Map)) {
    throw new TypeError('estimation-report:input');
  }
  const rowsByIssue = new Map(
    items.map((item) => [item.number, storyRow(item.number, recordsByIssue.get(item.number) ?? [])])
  );
  const children = new Map();
  for (const item of items) {
    if (item.parentNumber == null || !rowsByIssue.has(item.parentNumber)) continue;
    if (!children.has(item.parentNumber)) children.set(item.parentNumber, []);
    children.get(item.parentNumber).push(rowsByIssue.get(item.number));
  }
  for (const [parentNumber, childRows] of children) {
    const parent = rowsByIssue.get(parentNumber);
    const parentRecords = recordsByIssue.get(parentNumber) ?? [];
    const parentOutcome = latestEpicOutcome(parentRecords);
    const referencedChildren = parentOutcome?.envelope.payload.landscape.childOutcomeRecordIds ?? [];
    const actualChildIds = childRows.map((row) => row.outcomeRecordId).filter(Boolean);
    const referencesMatch =
      referencedChildren.length === actualChildIds.length &&
      referencedChildren.every((recordId) => actualChildIds.includes(recordId));
    const parentOrchestrationHours = parentOutcome?.envelope.payload.actual.engagedHours ?? null;
    const complete =
      parentOutcome !== null &&
      referencesMatch &&
      childRows.every((row) => row.evidenceGaps.length === 0);
    const humanPlanHours = complete ? sumPresent(childRows, 'humanPlanHours') : null;
    const childActual = complete ? sumPresent(childRows, 'actualEngagedHours') : null;
    const actualEngagedHours =
      complete && childActual != null && parentOrchestrationHours != null
        ? childActual + parentOrchestrationHours
        : null;
    const aiP50Hours = complete ? sumPresent(childRows, 'aiP50Hours') : null;
    const aiP80Hours = complete ? sumPresent(childRows, 'aiP80Hours') : null;
    const childWaste = complete ? sumPresent(childRows, 'avoidableWasteHours') : null;
    const parentWaste =
      parentOutcome?.envelope.payload.costClassification.avoidableProcessWasteHours ?? null;
    const acceleration =
      humanPlanHours != null && actualEngagedHours != null && actualEngagedHours > 0
        ? humanPlanHours / actualEngagedHours
        : null;
    rowsByIssue.set(parentNumber, {
      ...parent,
      humanPlanHours,
      aiP50Hours,
      aiP80Hours,
      actualEngagedHours,
      varianceVsAiP50Hours:
        actualEngagedHours != null && aiP50Hours != null ? actualEngagedHours - aiP50Hours : null,
      varianceVsAiP80Hours:
        actualEngagedHours != null && aiP80Hours != null ? actualEngagedHours - aiP80Hours : null,
      refineAccuracy: null,
      aiP50Accuracy: accuracy(aiP50Hours, actualEngagedHours),
      avoidableWasteHours:
        childWaste != null && parentWaste != null ? childWaste + parentWaste : null,
      acceleration,
      accelerationLabel: formatAcceleration(acceleration),
      parentOrchestrationHours,
      evidenceGaps: [
        ...childRows.flatMap((row) => row.evidenceGaps.map((gap) => `child-${gap}`)),
        ...(parentOutcome === null ? ['missing-parent-outcome'] : []),
        ...(parentOutcome !== null && !referencesMatch ? ['parent-child-outcome-mismatch'] : []),
        ...(!complete ? ['partial-epic-rollup'] : []),
      ],
    });
  }
  return { rowsByIssue, methodology: methodology(recordsByIssue) };
}
