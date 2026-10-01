import { isKnownTimingEvent, isEmittableTimingEvent } from '../timing-events/index.mjs';
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { deriveActorEngagement } from '../timing-engagement.mjs';
import {
  parseTimingRow,
  isTableTimingTimestamp,
  timingTimestampToMs,
} from '../timing-row-reader.mjs';

export const OUTCOME_RECORD_TYPE = 'estimation-outcome';
export const OUTCOME_SCHEMA = 'aitm.estimation-outcome/v1';

const RECORD_ID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
function fail(category) {
  throw new TypeError(`estimation-record:${category}`);
}
function exact(value, keys, category) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(category);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    fail(category);
}
function finite(value, category, { integer = false, minimum = 0 } = {}) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    (integer && !Number.isInteger(value))
  )
    fail(category);
}
function closeEnough(left, right) {
  return Math.abs(left - right) < 1e-9;
}

export function validateEstimationOutcome(payload, { expectedIssue } = {}) {
  const incomplete = payload?.schema === INCOMPLETE_OUTCOME_SCHEMA;
  if (!incomplete && payload?.schema !== OUTCOME_SCHEMA) fail('outcome-schema');
  exact(
    payload,
    [
      'actual',
      'aiForecast',
      'costClassification',
      'forecastRecordId',
      'humanPlanHours',
      'issue',
      'kind',
      'landscape',
      'schema',
      'variance',
      ...(incomplete ? ['telemetry'] : []),
    ],
    'outcome-keys'
  );
  if (!Number.isInteger(payload.issue) || payload.issue <= 0) fail('outcome-issue');
  if (expectedIssue !== undefined && payload.issue !== expectedIssue) fail('issue-correlation');
  if (!new Set(['story', 'epic-orchestration']).has(payload.kind)) fail('outcome-kind');
  if (payload.kind === 'story') {
    if (
      typeof payload.forecastRecordId !== 'string' ||
      !RECORD_ID_RE.test(payload.forecastRecordId)
    )
      fail('outcome-frozen-forecast');
    finite(payload.humanPlanHours, 'outcome-human-hours');
    exact(payload.aiForecast, ['p50EngagedHours', 'p80EngagedHours'], 'outcome-ai');
    finite(payload.aiForecast.p50EngagedHours, 'outcome-ai-hours');
    finite(payload.aiForecast.p80EngagedHours, 'outcome-ai-hours');
    if (payload.aiForecast.p80EngagedHours < payload.aiForecast.p50EngagedHours)
      fail('outcome-ai-order');
  } else if (
    payload.forecastRecordId !== null ||
    payload.humanPlanHours !== null ||
    payload.aiForecast !== null
  ) {
    fail('outcome-epic-implementation');
  }

  exact(
    payload.actual,
    ['commands', 'engagedHours', 'reviewFixCycles', 'stages'],
    'outcome-actual'
  );
  if (incomplete) {
    if (payload.actual.engagedHours !== null) fail('telemetry-total');
  } else finite(payload.actual.engagedHours, 'outcome-actual-hours');
  finite(payload.actual.reviewFixCycles, 'outcome-review-cycles', { integer: true });
  exact(payload.actual.stages, ['develop', 'plan', 'review', 'test'], 'outcome-stages');
  for (const value of Object.values(payload.actual.stages)) {
    if (incomplete) {
      if (value !== null) fail('telemetry-stage-total');
    } else finite(value, 'outcome-stage-hours');
  }
  if (
    !incomplete &&
    !closeEnough(
      Object.values(payload.actual.stages).reduce((sum, value) => sum + value, 0),
      payload.actual.engagedHours
    )
  )
    fail('outcome-stage-total');
  if (!Array.isArray(payload.actual.commands)) fail('outcome-commands');
  for (const command of payload.actual.commands) {
    exact(command, ['attempts', 'classification', 'durationMs', 'executions'], 'outcome-command');
    if (typeof command.classification !== 'string' || command.classification.trim() === '')
      fail('outcome-command-classification');
    finite(command.durationMs, 'outcome-command-duration', { integer: true });
    finite(command.attempts, 'outcome-command-attempts', { integer: true });
    if (!Array.isArray(command.executions)) fail('outcome-command-executions');
    let actualAttempts = 0;
    let actualDurationMs = 0;
    for (const execution of command.executions) {
      exact(
        execution,
        [
          'args',
          'command',
          'commitSha',
          'durationMs',
          'exitCode',
          'receiptId',
          'reusedFrom',
          'stage',
        ],
        'outcome-command-execution'
      );
      if (!RECORD_ID_RE.test(execution.receiptId)) fail('outcome-command-receipt');
      if (typeof execution.stage !== 'string' || execution.stage.trim() === '')
        fail('outcome-command-stage');
      if (!SHA_RE.test(execution.commitSha)) fail('outcome-command-sha');
      if (typeof execution.command !== 'string' || execution.command.trim() === '')
        fail('outcome-command-name');
      if (
        !Array.isArray(execution.args) ||
        execution.args.some((argument) => typeof argument !== 'string')
      )
        fail('outcome-command-args');
      finite(execution.exitCode, 'outcome-command-exit', { integer: true, minimum: -255 });
      finite(execution.durationMs, 'outcome-command-execution-duration', { integer: true });
      if (execution.reusedFrom !== null && !RECORD_ID_RE.test(execution.reusedFrom))
        fail('outcome-command-reuse');
      if (execution.reusedFrom === null) {
        actualAttempts += 1;
        actualDurationMs += execution.durationMs;
      }
    }
    if (command.attempts !== actualAttempts || command.durationMs !== actualDurationMs)
      fail('outcome-command-total');
  }

  exact(
    payload.landscape,
    ['childOutcomeRecordIds', 'dependencyBreadth', 'filesChanged', 'lanes', 'modules'],
    'outcome-landscape'
  );
  finite(payload.landscape.filesChanged, 'outcome-files', { integer: true });
  finite(payload.landscape.dependencyBreadth, 'outcome-dependencies', { integer: true });
  for (const key of ['modules', 'lanes'])
    if (
      !Array.isArray(payload.landscape[key]) ||
      payload.landscape[key].some((entry) => typeof entry !== 'string' || entry.trim() === '')
    )
      fail(`outcome-${key}`);
  if (
    !Array.isArray(payload.landscape.childOutcomeRecordIds) ||
    payload.landscape.childOutcomeRecordIds.some(
      (recordId) => typeof recordId !== 'string' || !RECORD_ID_RE.test(recordId)
    ) ||
    new Set(payload.landscape.childOutcomeRecordIds).size !==
      payload.landscape.childOutcomeRecordIds.length
  ) {
    fail('outcome-child-records');
  }
  if (incomplete) {
    if (payload.variance !== null) fail('telemetry-variance');
  } else if (payload.kind === 'story') {
    exact(payload.variance, ['vsAiP50Hours', 'vsAiP80Hours'], 'outcome-variance');
    for (const value of Object.values(payload.variance))
      if (typeof value !== 'number' || !Number.isFinite(value)) fail('outcome-variance-hours');
  } else if (payload.variance !== null) fail('outcome-epic-implementation');

  exact(
    payload.costClassification,
    ['avoidableProcessWasteHours', 'drivers', 'necessaryHours', 'unclassifiedHours'],
    'outcome-cost'
  );
  for (const key of ['necessaryHours', 'avoidableProcessWasteHours', 'unclassifiedHours']) {
    if (incomplete) {
      if (payload.costClassification[key] !== null) fail('telemetry-cost');
    } else finite(payload.costClassification[key], 'outcome-cost-hours');
  }
  if (
    !incomplete &&
    !closeEnough(
      payload.costClassification.necessaryHours +
        payload.costClassification.avoidableProcessWasteHours +
        payload.costClassification.unclassifiedHours,
      payload.actual.engagedHours
    )
  )
    fail('outcome-cost-total');
  if (!Array.isArray(payload.costClassification.drivers)) fail('outcome-cost-drivers');
  for (const driver of payload.costClassification.drivers) {
    exact(driver, ['hours', 'kind'], 'outcome-cost-driver');
    if (typeof driver.kind !== 'string' || driver.kind.trim() === '')
      fail('outcome-cost-driver-kind');
    finite(driver.hours, 'outcome-cost-driver-hours');
  }
  if (incomplete) {
    if (payload.costClassification.drivers.length) fail('telemetry-cost-drivers');
    validateIncompleteTelemetry(payload);
  }
  return payload;
}

export const INCOMPLETE_OUTCOME_SCHEMA = 'aitm.estimation-outcome/v2';

function validatedOutcomeTimingRow(line) {
  const row = parseTimingRow(line);
  const iso = new RegExp(
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]{1,3})?(?:Z|[+-][0-9]{2}:[0-9]{2})$'
  );
  if (
    !row ||
    !(isTableTimingTimestamp(row.ts) || iso.test(row.ts)) ||
    !Number.isFinite(timingTimestampToMs(row.ts)) ||
    !isKnownTimingEvent(row.event) ||
    row.cells.length < 8
  )
    fail('telemetry-invalid-row');
  return row;
}
// Every table data row contributes evidence or refuses. Headers/separators are
// syntax, never a reason to silently discard malformed work.
export function readOutcomeTimingRows(body) {
  const rows = [];
  for (const line of String(body).split('\n')) {
    const text = line.trim();
    if (!text.startsWith('|')) {
      if (text.includes('aitm-actor:') || text.includes('aitm-engagement:'))
        fail('telemetry-invalid-row');
      continue;
    }
    if (new RegExp('^[|][ :|-]+$').test(text)) continue;
    const row = parseTimingRow(text);
    if (row?.ts === 'Timestamp' && row.event === 'event' && !row.actorKey) continue;
    rows.push(validatedOutcomeTimingRow(text));
  }
  return rows;
}

// A pure snapshot projection, not publication authority. Runtime callers must
// establish the canonical comment and later verify the exact immutable prefix.
export function deriveIncompleteTelemetry({ source, verificationSha } = {}) {
  exact(source, ['repository', 'commentNodeId', 'snapshot'], 'telemetry-source');
  if (
    typeof source.repository !== 'string' ||
    !new RegExp('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$').test(source.repository) ||
    typeof source.commentNodeId !== 'string' ||
    !new RegExp('^IC_[A-Za-z0-9_-]+$').test(source.commentNodeId) ||
    typeof source.snapshot !== 'string' ||
    !source.snapshot.endsWith('\n') ||
    !SHA_RE.test(verificationSha)
  )
    fail('telemetry-source');
  const rows = readOutcomeTimingRows(source.snapshot);
  if (!rows.length) fail('telemetry-empty');
  const cutoff = rows.at(-1).ts;
  const engagement = deriveActorEngagement(rows, cutoff);
  if (engagement.failures.length) fail('telemetry-invalid-evidence');
  const representedMs = ['plan', 'develop', 'test', 'review'].reduce(
    (sum, stage) => sum + (engagement.byPhase[stage]?.engagedMs ?? 0),
    0
  );
  const outsideOutcomeStages = representedMs !== engagement.engagedMs;
  if (engagement.complete && !outsideOutcomeStages) fail('telemetry-not-incomplete');
  const reasons = [
    ...(engagement.unknownRows ? ['legacy-attribution-unknown'] : []),
    ...(outsideOutcomeStages ? ['engagement-outside-outcome-stages'] : []),
    ...(engagement.incompleteActors.length ? ['open-actor-interval'] : []),
  ];
  if (!reasons.length) fail('telemetry-reason');
  return {
    status: 'incomplete',
    reasons,
    verificationSha,
    knownEngagedMs: engagement.engagedMs,
    intervals: engagement.intervals,
    source: {
      ...source,
      cutoff,
      digest: createHash('sha256').update(source.snapshot).digest('hex'),
    },
  };
}
function validateIncompleteTelemetry(payload) {
  const telemetry = payload.telemetry;
  exact(
    telemetry,
    ['status', 'reasons', 'verificationSha', 'knownEngagedMs', 'intervals', 'source'],
    'telemetry-keys'
  );
  exact(
    telemetry.source,
    ['repository', 'commentNodeId', 'snapshot', 'cutoff', 'digest'],
    'telemetry-source'
  );
  const { repository, commentNodeId, snapshot } = telemetry.source;
  const expected = deriveIncompleteTelemetry({
    source: { repository, commentNodeId, snapshot },
    verificationSha: telemetry.verificationSha,
  });
  if (canonicalRecordJson(expected) !== canonicalRecordJson(telemetry))
    fail('telemetry-projection');
  if (
    !payload.actual.commands.some((command) =>
      command.executions.some(
        (execution) => execution.commitSha === telemetry.verificationSha && execution.exitCode === 0
      )
    )
  )
    fail('telemetry-verification');
}

export function validateOutcomeTimingSource(payload, context = {}) {
  validateEstimationOutcome(payload, { expectedIssue: context.issue });
  if (payload.schema !== INCOMPLETE_OUTCOME_SCHEMA) fail('telemetry-schema');
  const { source, verificationSha } = payload.telemetry;
  if (
    context.repository !== source.repository ||
    context.commentNodeId !== source.commentNodeId ||
    context.verificationSha !== verificationSha ||
    context.forecastRecordId !== payload.forecastRecordId ||
    typeof context.body !== 'string'
  )
    fail('telemetry-source-lineage');
  const snapshotLines = source.snapshot.split('\n');
  const snapshotRows = readOutcomeTimingRows(source.snapshot);
  const lastData = snapshotLines.findLastIndex((line) => line.trim() === snapshotRows.at(-1)?.raw);
  const prefix = snapshotLines.slice(0, lastData + 1).join('\n') + '\n';
  const suffix = snapshotLines.slice(lastData + 1).join('\n');
  if (
    !context.body.startsWith(prefix) ||
    !context.body.endsWith(suffix) ||
    context.body.length < prefix.length + suffix.length
  )
    fail('telemetry-source-lineage');
  const tail = context.body.slice(prefix.length, suffix.length ? -suffix.length : undefined);
  let prior = timingTimestampToMs(source.cutoff);
  for (const line of tail.split('\n')) {
    if (line === '') continue;
    const row = validatedOutcomeTimingRow(line);
    const ms = timingTimestampToMs(row.ts);
    if (ms < prior || !isEmittableTimingEvent(row.event)) fail('telemetry-source-successor');
    prior = ms;
  }
  const currentRows = readOutcomeTimingRows(context.body);
  const current = deriveActorEngagement(currentRows, currentRows.at(-1)?.ts);
  if (current.failures.length) fail('telemetry-source-successor');
  return { status: 'matched', sourceDigest: source.digest, successor: tail.length > 0 };
}
