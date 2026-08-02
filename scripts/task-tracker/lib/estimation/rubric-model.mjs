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
    implementationHour: 0.52,
    planningHour: 0.05,
    verificationHour: 0.1,
    reviewHour: 0.08,
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
    weighted += clamp(value, 0, 2) * weight;
    weights += weight;
  });
  return round(weighted / weights);
}

function repeatedVerificationWasteHours(payload) {
  const potentialMs = payload.actual.commands
    .filter((command) => command.classification.startsWith('test-') && command.attempts > 1)
    .reduce(
      (sum, command) => sum + (command.durationMs * (command.attempts - 1)) / command.attempts,
      0
    );
  return Math.min(potentialMs / 3_600_000, payload.costClassification.avoidableProcessWasteHours);
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

  const stageRatios = (stage, adjust = (value) => value) =>
    ordered.map(({ payload }) =>
      payload.humanPlanHours === 0
        ? 0
        : adjust(payload.actual.stages[stage], payload) / payload.humanPlanHours
    );
  const aiImplementationRatios = stageRatios('develop');
  const aiPlanningRatios = stageRatios('plan');
  const aiReviewRatios = stageRatios('review');
  const avoidable = ordered.reduce(
    (sum, { payload }) => sum + payload.costClassification.avoidableProcessWasteHours,
    0
  );
  const confidence = round(Math.min(0.9, 0.1 + (ordered.length / (ordered.length + 10)) * 0.8));
  const laneSamples = {};
  const sandboxSamples = [];
  const refineToPlanSamples = [];
  for (const { payload, forecastPayload } of ordered) {
    const testCommands = payload.actual.commands.filter((command) =>
      command.classification.startsWith('test-')
    );
    const repeatPotentials = testCommands.map((command) =>
      command.attempts > 1
        ? (command.durationMs * (command.attempts - 1)) / command.attempts / 60_000
        : 0
    );
    const totalRepeatPotential = repeatPotentials.reduce((sum, value) => sum + value, 0);
    const classifiedWasteMinutes = repeatedVerificationWasteHours(payload) * 60;
    let observedTestMinutes = 0;
    for (const [index, command] of testCommands.entries()) {
      if (!command.classification.startsWith('test-')) continue;
      const lane = command.classification.replace(/^test-/, '');
      const rawMinutes = command.durationMs / 60_000;
      observedTestMinutes += rawMinutes;
      const avoidableMinutes =
        totalRepeatPotential === 0
          ? 0
          : (classifiedWasteMinutes * repeatPotentials[index]) / totalRepeatPotential;
      const minutes = Math.max(0, rawMinutes - avoidableMinutes);
      const samples = laneSamples[lane] ?? [];
      samples.push(minutes);
      laneSamples[lane] = samples;
    }
    if (payload.landscape.lanes.includes('sandbox')) {
      sandboxSamples.push(Math.max(0, payload.actual.stages.test * 60 - observedTestMinutes));
    }
    if (forecastPayload !== undefined) {
      if (
        forecastPayload?.issue !== payload.issue ||
        forecastPayload?.plan?.humanHours !== payload.humanPlanHours ||
        typeof forecastPayload?.refine?.humanHours !== 'number' ||
        !Number.isFinite(forecastPayload.refine.humanHours)
      ) {
        throw new TypeError('estimation-rubric:forecast-correlation');
      }
      refineToPlanSamples.push(
        Math.abs(forecastPayload.plan.humanHours - forecastPayload.refine.humanHours)
      );
    }
  }
  const laneMinutes = { ...previous.testLandscape.laneMinutes };
  for (const [lane, samples] of Object.entries(laneSamples))
    laneMinutes[lane] = round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
  const sandboxMinutes =
    sandboxSamples.length === 0
      ? previous.testLandscape.sandboxMinutes
      : round(sandboxSamples.reduce((sum, value) => sum + value, 0) / sandboxSamples.length);
  const p50Mae =
    ordered.reduce((sum, { payload }) => sum + Math.abs(payload.variance.vsAiP50Hours), 0) /
    ordered.length;
  const p80Coverage =
    ordered.filter(
      ({ payload }) => payload.actual.engagedHours <= payload.aiForecast.p80EngagedHours
    ).length / ordered.length;
  const reworkProbability =
    ordered.filter(({ payload }) => payload.actual.reviewFixCycles > 0).length / ordered.length;
  const refineToPlanMae =
    refineToPlanSamples.length === 0
      ? previous.accuracy.refineToPlan.maeHours
      : round(
          refineToPlanSamples.reduce((sum, value) => sum + value, 0) / refineToPlanSamples.length
        );

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
      // Completion outcomes measure agent execution. They are valid evidence
      // for AI forecasts and workflow diagnostics, never for human-equivalent
      // effort. Preserve separately sourced human coefficients until AITM has
      // explicit human-estimation observations to update them.
      coefficients: clone(previous.human.coefficients),
      sampleSize: previous.human.sampleSize,
      confidence: previous.human.confidence,
    },
    ai: {
      coefficients: {
        ...Object.fromEntries(
          Object.entries(previous.ai.coefficients).filter(([key]) => key !== 'engagedToHuman')
        ),
        implementationHour: weightedRobustMean(
          aiImplementationRatios,
          previous.ai.coefficients.implementationHour ?? previous.ai.coefficients.engagedToHuman
        ),
        planningHour: weightedRobustMean(
          aiPlanningRatios,
          previous.ai.coefficients.planningHour ?? BOOTSTRAP_RUBRIC_PRIORS.ai.planningHour
        ),
        verificationHour: weightedRobustMean(
          stageRatios('test'),
          previous.ai.coefficients.verificationHour ?? BOOTSTRAP_RUBRIC_PRIORS.ai.verificationHour
        ),
        reviewHour: weightedRobustMean(
          aiReviewRatios,
          previous.ai.coefficients.reviewHour ?? BOOTSTRAP_RUBRIC_PRIORS.ai.reviewHour
        ),
      },
      sampleSize: ordered.length,
      confidence,
    },
    workflowDiagnostics: { avoidableProcessWasteHours: round(avoidable) },
    testLandscape: { laneMinutes, sandboxMinutes },
    planning: clone(previous.planning ?? BOOTSTRAP_RUBRIC_PRIORS.planning),
    review: { reworkProbability: round(reworkProbability) },
    accuracy: {
      refineToPlan: { maeHours: refineToPlanMae },
      aiP50: { maeHours: round(p50Mae) },
      aiP80Coverage: round(p80Coverage),
    },
  };
  validateEstimationRubric(rubric);
  return rubric;
}
