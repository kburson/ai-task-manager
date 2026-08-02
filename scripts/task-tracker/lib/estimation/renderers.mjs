import { createIssueComment } from '../github-records/github-comment-store.mjs';
import { renderAitmRecord } from '../github-records/record-envelope.mjs';
import { FORECAST_RECORD_TYPE, validateEstimationForecast } from './forecast-record.mjs';
import { OUTCOME_RECORD_TYPE, validateEstimationOutcome } from './outcome-record.mjs';
import { RUBRIC_RECORD_TYPE, validateEstimationRubric } from './rubric-record.mjs';

const hours = (value) => `${Number(value.toFixed(2))}h`;
const percent = (value) => `${Math.round(value * 100)}%`;

export function renderEstimationForecast(record) {
  validateEstimationForecast(record);
  const stages = Object.entries(record.ai.stages)
    .map(([stage, value]) => `${stage} ${hours(value)}`)
    .join(', ');
  const wbs = record.wbs
    .map((item) => `- ${item.id}: ${item.description} (${hours(item.humanHours)})`)
    .join('\n');
  const comparables =
    record.comparableIssues.length === 0
      ? 'Comparable outcomes: none validated.'
      : `Comparable outcomes: ${record.comparableIssues.map((item) => `#${item.issue} (${item.outcomeRecordId}, weight ${item.weight})`).join('; ')}.`;
  const testPlan = `Test plan: ${record.testPlan.impactedLanes.join(', ')} via ${record.testPlan.isolation}; expected ${record.testPlan.expectedMinutes} minutes.`;
  const risks =
    record.risks.length === 0 ? 'Risks: none recorded.' : `Risks: ${record.risks.join('; ')}.`;
  return `## Plan Estimation Forecast\n\nHuman Plan estimate: ${hours(record.plan.humanHours)} (${record.plan.size}); Refine delta: ${hours(record.plan.deltaHours)}.\n\nAI P50: ${hours(record.ai.p50EngagedHours)}; AI P80: ${hours(record.ai.p80EngagedHours)}. Stages: ${stages}.\n\nRubric: v${record.rubric.version}, cohort ${record.rubric.cohortSize}, confidence ${percent(record.rubric.confidence)}.\n\n${wbs}\n\n${comparables}\n\n${testPlan}\n\n${risks}\n\nRecommendation: ${record.recommendation.action} — ${record.recommendation.reason}\n`;
}

export function renderEstimationOutcome(record) {
  validateEstimationOutcome(record);
  if (record.kind === 'epic-orchestration')
    return `## Epic Orchestration Outcome\n\nActual orchestration engaged: ${hours(record.actual.engagedHours)}. Child outcomes: ${record.landscape.childOutcomeRecordIds.join(', ')}.\n\nNecessary: ${hours(record.costClassification.necessaryHours)}; avoidable process waste: ${hours(record.costClassification.avoidableProcessWasteHours)}; unclassified: ${hours(record.costClassification.unclassifiedHours)}.\n`;
  return `## Estimation Outcome\n\nActual engaged: ${hours(record.actual.engagedHours)}. AI P50 variance: ${hours(record.variance.vsAiP50Hours)}; AI P80 variance: ${hours(record.variance.vsAiP80Hours)}.\n\nNecessary: ${hours(record.costClassification.necessaryHours)}; avoidable process waste: ${hours(record.costClassification.avoidableProcessWasteHours)}; unclassified: ${hours(record.costClassification.unclassifiedHours)}.\n`;
}

export function renderEstimationRubric(record) {
  validateEstimationRubric(record);
  return `## Estimation Rubric v${record.version}\n\nCohort: ${record.cohort.length}; confidence: ${percent(record.ai.confidence)}; P80 coverage: ${percent(record.accuracy.aiP80Coverage)}.\n\nAvoidable process waste remains an AI workflow diagnostic: ${hours(record.workflowDiagnostics.avoidableProcessWasteHours)}.\n`;
}

function visibleMarkdown(envelope) {
  if (envelope.recordType === FORECAST_RECORD_TYPE)
    return renderEstimationForecast(envelope.payload);
  if (envelope.recordType === OUTCOME_RECORD_TYPE) return renderEstimationOutcome(envelope.payload);
  if (envelope.recordType === RUBRIC_RECORD_TYPE) return renderEstimationRubric(envelope.payload);
  throw new TypeError('estimation-record:unsupported-type');
}

export async function writeEstimationRecord({ envelope, repository, issue, rest, graphql } = {}) {
  const body = renderAitmRecord({ envelope, visibleMarkdown: visibleMarkdown(envelope) });
  return createIssueComment({ repository, issue, body, rest, graphql });
}
