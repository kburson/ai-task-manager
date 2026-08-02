import { validateEstimationOutcome } from './outcome-record.mjs';
import { validateEstimationRubric } from './rubric-record.mjs';

export const BOOTSTRAP_RUBRIC_PRIORS = Object.freeze({
  human: Object.freeze({
    implementationHour: 1,
    moduleBreadthHour: 0.35,
    dependencyBreadthHour: 0.5,
    necessaryToPlanned: 1,
  }),
  ai: Object.freeze({
    engagedToHuman: 0.6,
    implementationHour: 0.52,
    moduleBreadthHour: 0.2,
    dependencyBreadthHour: 0.25,
  }),
  testLandscape: Object.freeze({
    laneMinutes: Object.freeze({ unit: 2, integration: 5, slow: 12 }),
    sandboxMinutes: 1,
  }),
  planning: Object.freeze({
    dependencyBreadthLimit: 8,
    refineFurtherVarianceRatio: 0.6,
    sizeEnvelopeHours: Object.freeze({ XS: 1, S: 3, M: 8, L: 20, XL: 60 }),
  }),
  review: Object.freeze({ reworkProbability: 0.2 }),
  uncertainty: Object.freeze({ confidence: 0.1, p80Widening: 1.45 }),
});

function clone(value) {
  return structuredClone(value);
}
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

export function createBootstrapRubric({ generatedAt = new Date().toISOString() } = {}) {
  const rubric = {
    schema: 'aitm.estimation-rubric/v1',
    version: 1,
    predecessorRecordId: null,
    generatedAt,
    cohort: [],
    human: {
      coefficients: clone(BOOTSTRAP_RUBRIC_PRIORS.human),
      sampleSize: 0,
      confidence: BOOTSTRAP_RUBRIC_PRIORS.uncertainty.confidence,
    },
    ai: {
      coefficients: clone(BOOTSTRAP_RUBRIC_PRIORS.ai),
      sampleSize: 0,
      confidence: BOOTSTRAP_RUBRIC_PRIORS.uncertainty.confidence,
    },
    workflowDiagnostics: { avoidableProcessWasteHours: 0 },
    testLandscape: clone(BOOTSTRAP_RUBRIC_PRIORS.testLandscape),
    planning: clone(BOOTSTRAP_RUBRIC_PRIORS.planning),
    review: clone(BOOTSTRAP_RUBRIC_PRIORS.review),
    accuracy: { refineToPlan: { maeHours: 0 }, aiP50: { maeHours: 0 }, aiP80Coverage: 0 },
  };
  validateEstimationRubric(rubric);
  return rubric;
}

function weightedRobustMean(values, fallback) {
  if (values.length === 0) return fallback;
  let weighted = 0;
  let weights = 0;
  values.forEach((value, index) => {
    const weight = (index + 1) / values.length;
    weighted += clamp(value, 0.5, 2) * weight;
    weights += weight;
  });
  return round(weighted / weights);
}

export function updateEstimationRubric({
  previous,
  outcomes,
  generatedAt = new Date().toISOString(),
  maxOutcomes = 50,
} = {}) {
  validateEstimationRubric(previous);
  if (!Array.isArray(outcomes)) throw new TypeError('estimation-rubric:outcomes');
  const ordered = [...outcomes]
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.recordId.localeCompare(right.recordId)
    )
    .slice(-maxOutcomes);
  const ids = new Set();
  for (const outcome of ordered) {
    if (typeof outcome?.recordId !== 'string' || ids.has(outcome.recordId))
      throw new TypeError('estimation-rubric:outcome-identity');
    ids.add(outcome.recordId);
    validateEstimationOutcome(outcome.payload);
  }
  if (ordered.length === 0) return previous;

  const humanRatios = ordered.map(({ payload }) =>
    payload.humanPlanHours === 0
      ? 1
      : payload.costClassification.necessaryHours / payload.humanPlanHours
  );
  const aiRatios = ordered.map(({ payload }) =>
    payload.humanPlanHours === 0 ? 1 : payload.actual.engagedHours / payload.humanPlanHours
  );
  const avoidable = ordered.reduce(
    (sum, { payload }) => sum + payload.costClassification.avoidableProcessWasteHours,
    0
  );
  const confidence = round(Math.min(0.9, 0.1 + (ordered.length / (ordered.length + 10)) * 0.8));
  const laneSamples = {};
  let sandboxMinutes = 0;
  for (const { payload } of ordered) {
    for (const command of payload.actual.commands) {
      const lane = command.classification.replace(/^test-/, '');
      laneSamples[lane] = (laneSamples[lane] ?? 0) + command.durationMs / 60_000;
    }
    if (payload.landscape.lanes.includes('sandbox'))
      sandboxMinutes += payload.actual.stages.test * 60;
  }
  const laneMinutes = { ...previous.testLandscape.laneMinutes };
  for (const [lane, total] of Object.entries(laneSamples))
    laneMinutes[lane] = round(total / ordered.length);
  const p50Mae =
    ordered.reduce((sum, { payload }) => sum + Math.abs(payload.variance.vsAiP50Hours), 0) /
    ordered.length;
  const p80Coverage =
    ordered.filter(
      ({ payload }) => payload.actual.engagedHours <= payload.aiForecast.p80EngagedHours
    ).length / ordered.length;
  const reworkProbability =
    ordered.filter(({ payload }) => payload.actual.reviewFixCycles > 0).length / ordered.length;

  const rubric = {
    schema: 'aitm.estimation-rubric/v1',
    version: previous.version + 1,
    predecessorRecordId: previous.predecessorRecordId,
    generatedAt,
    cohort: ordered.map(({ recordId, payload }) => ({
      issue: payload.issue,
      outcomeRecordId: recordId,
    })),
    human: {
      coefficients: {
        ...previous.human.coefficients,
        necessaryToPlanned: weightedRobustMean(
          humanRatios,
          previous.human.coefficients.necessaryToPlanned
        ),
      },
      sampleSize: ordered.length,
      confidence,
    },
    ai: {
      coefficients: {
        ...previous.ai.coefficients,
        engagedToHuman: weightedRobustMean(aiRatios, previous.ai.coefficients.engagedToHuman),
      },
      sampleSize: ordered.length,
      confidence,
    },
    workflowDiagnostics: { avoidableProcessWasteHours: round(avoidable) },
    testLandscape: { laneMinutes, sandboxMinutes: round(sandboxMinutes / ordered.length) },
    planning: clone(previous.planning ?? BOOTSTRAP_RUBRIC_PRIORS.planning),
    review: { reworkProbability: round(reworkProbability) },
    accuracy: {
      refineToPlan: { maeHours: previous.accuracy.refineToPlan.maeHours },
      aiP50: { maeHours: round(p50Mae) },
      aiP80Coverage: round(p80Coverage),
    },
  };
  validateEstimationRubric(rubric);
  return rubric;
}
