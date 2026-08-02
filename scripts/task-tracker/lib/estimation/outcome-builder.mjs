import { validateEstimationOutcome } from './outcome-record.mjs';

const STAGES = ['plan', 'develop', 'test', 'review'];
const RECORD_ID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
function fail(category) {
  throw new TypeError(`estimation-outcome:${category}`);
}
function round(value) {
  return Number(value.toFixed(4));
}

export function buildEstimationOutcome({
  issue,
  forecast,
  timing,
  verification = [],
  diff,
  review,
  cost = {},
  kind = 'story',
  childOutcomeRecordIds = [],
} = {}) {
  if (!Number.isInteger(issue) || issue <= 0) fail('input');
  if (kind === 'story' && forecast?.payload?.issue !== issue) fail('input');
  if (kind === 'epic-orchestration' && forecast !== null) fail('input');
  if (!new Set(['story', 'epic-orchestration']).has(kind)) fail('input');
  if (!timing?.stagesMs || !diff || !review) fail('evidence');
  const stages = {};
  for (const stage of STAGES) {
    const value = timing.stagesMs[stage];
    if (!Number.isInteger(value) || value < 0) fail('timing');
    stages[stage] = round(value / 3_600_000);
  }
  const engagedHours = round(Object.values(stages).reduce((sum, value) => sum + value, 0));
  if (engagedHours <= 0) fail('zero-time');
  if (!Array.isArray(verification)) fail('verification');
  const commands = verification.map((command) => ({
    classification: command.classification,
    durationMs: command.durationMs,
    attempts: command.attempts,
  }));
  const avoidableProcessWasteHours = cost.avoidableProcessWasteHours ?? 0;
  // Necessary work requires affirmative classification. Any engaged time not
  // explicitly identified as necessary or avoidable remains unknown, never
  // silently promoted into the learning cohort as necessary implementation.
  const unclassifiedHours =
    cost.unclassifiedHours ?? round(engagedHours - avoidableProcessWasteHours);
  const necessaryHours = round(engagedHours - avoidableProcessWasteHours - unclassifiedHours);
  if (necessaryHours < 0) fail('cost-total');
  if (
    !Array.isArray(childOutcomeRecordIds) ||
    childOutcomeRecordIds.some((id) => !RECORD_ID_RE.test(id))
  )
    fail('children');
  if (kind === 'story' && childOutcomeRecordIds.length > 0) fail('children');
  if (kind === 'epic-orchestration' && childOutcomeRecordIds.length === 0) fail('children');
  const payload = {
    schema: 'aitm.estimation-outcome/v1',
    issue,
    kind,
    forecastRecordId: kind === 'story' ? forecast.recordId : null,
    humanPlanHours: kind === 'story' ? forecast.payload.plan.humanHours : null,
    aiForecast:
      kind === 'story'
        ? {
            p50EngagedHours: forecast.payload.ai.p50EngagedHours,
            p80EngagedHours: forecast.payload.ai.p80EngagedHours,
          }
        : null,
    actual: { engagedHours, stages, reviewFixCycles: review.fixCycles, commands },
    landscape: {
      filesChanged: diff.filesChanged,
      modules: diff.modules,
      lanes: diff.lanes,
      dependencyBreadth: diff.dependencyBreadth,
      childOutcomeRecordIds: [...childOutcomeRecordIds],
    },
    variance:
      kind === 'story'
        ? {
            vsAiP50Hours: round(engagedHours - forecast.payload.ai.p50EngagedHours),
            vsAiP80Hours: round(engagedHours - forecast.payload.ai.p80EngagedHours),
          }
        : null,
    costClassification: {
      necessaryHours,
      avoidableProcessWasteHours,
      unclassifiedHours,
      drivers: cost.drivers ?? [],
    },
  };
  validateEstimationOutcome(payload, { expectedIssue: issue });
  return payload;
}
