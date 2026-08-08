import { FORECAST_SCHEMA, validateEstimationForecast } from './forecast-record.mjs';
import { ceilEstimateHours } from './estimate-granularity.mjs';
import { parsePlanEstimationInput } from './plan-input.mjs';
import { validateEstimationRubric } from './rubric-record.mjs';

const SIZE_ORDER = Object.freeze(['XS', 'S', 'M', 'L', 'XL']);
const DEFAULT_PLANNING = Object.freeze({
  dependencyBreadthLimit: 8,
  refineFurtherVarianceRatio: 0.6,
  sizeEnvelopeHours: Object.freeze({ XS: 1, S: 3, M: 8, L: 20, XL: 60 }),
});
const DEFAULT_AI_STAGE_COEFFICIENTS = Object.freeze({
  planningHour: 0.05,
  verificationHour: 0.1,
  reviewHour: 0.08,
});
function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}
function sizeFor(hours, envelopes) {
  return SIZE_ORDER.find((size) => hours <= envelopes[size]) ?? 'XL';
}
function set(values) {
  return new Set(values);
}
function jaccard(left, right) {
  const a = set(left);
  const b = set(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  return [...a].filter((entry) => b.has(entry)).length / union.size;
}
function similarity({ targetModules, targetLanes, dependencyBreadth, expectedFiles }, landscape) {
  const modules = jaccard(targetModules, landscape.modules ?? []);
  const lanes = jaccard(targetLanes, landscape.lanes ?? []);
  const dependencies =
    1 -
    Math.min(
      1,
      Math.abs(dependencyBreadth - (landscape.dependencyBreadth ?? 0)) /
        Math.max(1, dependencyBreadth, landscape.dependencyBreadth ?? 0)
    );
  const diff =
    1 -
    Math.min(
      1,
      Math.abs(expectedFiles - (landscape.filesChanged ?? 0)) /
        Math.max(1, expectedFiles, landscape.filesChanged ?? 0)
    );
  return round((modules + lanes + dependencies + diff) / 4);
}

export function buildEstimationForecast({
  issue,
  refine,
  planInput,
  rubric,
  comparableOutcomes = [],
} = {}) {
  if (!Number.isInteger(issue) || issue <= 0 || !refine || !rubric?.recordId)
    throw new TypeError('estimation-forecast:input');
  const input = parsePlanEstimationInput(planInput);
  validateEstimationRubric(rubric.payload);
  const humanCoefficients = rubric.payload.human.coefficients;
  const aiCoefficients = rubric.payload.ai.coefficients;
  const planning = rubric.payload.planning ?? DEFAULT_PLANNING;
  const learnedLaneMinutes = input.testImpact.lanes.reduce(
    (sum, lane) => sum + (rubric.payload.testLandscape.laneMinutes[lane] ?? 0),
    0
  );
  const learnedExecutionMinutes = learnedLaneMinutes + rubric.payload.testLandscape.sandboxMinutes;
  const repositoryHours = Math.max(input.testImpact.expectedMinutes, learnedExecutionMinutes) / 60;
  const assignedModules = new Set();
  const assignedDependencies = new Set();
  const rawWbs = input.wbs.map((item) => {
    const modules = item.signals.modules.filter((signal) => {
      if (assignedModules.has(signal)) return false;
      assignedModules.add(signal);
      return true;
    });
    const dependencies = item.signals.dependencies.filter((signal) => {
      if (assignedDependencies.has(signal)) return false;
      assignedDependencies.add(signal);
      return true;
    });
    return {
      id: item.id,
      description: item.description,
      humanHours:
        item.baseHumanHours *
          humanCoefficients.implementationHour *
          humanCoefficients.necessaryToPlanned +
        modules.length * humanCoefficients.moduleBreadthHour +
        dependencies.length * humanCoefficients.dependencyBreadthHour,
      signals: [...new Set([...item.signals.modules, ...item.signals.dependencies])],
    };
  });
  if (repositoryHours > 0)
    rawWbs.push({
      id: 'repository-execution',
      description: 'Run unavoidable isolated repository verification',
      humanHours: repositoryHours,
      signals: input.testImpact.lanes.map((lane) => `test:${lane}`),
    });
  const wbs = rawWbs.map((item) => ({
    ...item,
    humanHours: ceilEstimateHours(item.humanHours),
  }));
  const humanHours = wbs.reduce((sum, item) => sum + item.humanHours, 0);
  const refineHours = ceilEstimateHours(refine.humanHours);

  const targetModules = [...new Set(input.wbs.flatMap((item) => item.signals.modules))];
  const targetDependencies = [...new Set(input.wbs.flatMap((item) => item.signals.dependencies))];
  const baseHumanHours = input.wbs.reduce((sum, item) => sum + item.baseHumanHours, 0);
  const aiImplementationHours = input.wbs.reduce(
    (sum, item) => sum + item.baseHumanHours * aiCoefficients.implementationHour,
    0
  );

  const rawStagePlan =
    baseHumanHours * (aiCoefficients.planningHour ?? DEFAULT_AI_STAGE_COEFFICIENTS.planningHour);
  const rawStageDevelop =
    aiImplementationHours +
    targetModules.length * aiCoefficients.moduleBreadthHour +
    targetDependencies.length * aiCoefficients.dependencyBreadthHour;
  const rawStageTest = Math.max(
    repositoryHours,
    baseHumanHours *
      (aiCoefficients.verificationHour ?? DEFAULT_AI_STAGE_COEFFICIENTS.verificationHour)
  );
  const rawStageReview =
    baseHumanHours * (aiCoefficients.reviewHour ?? DEFAULT_AI_STAGE_COEFFICIENTS.reviewHour);
  const rawStages = {
    plan: rawStagePlan,
    develop: rawStageDevelop,
    test: rawStageTest,
    review: rawStageReview,
  };
  const stages = Object.fromEntries(
    Object.entries(rawStages).map(([stage, hours]) => [stage, ceilEstimateHours(hours)])
  );
  const p50 = Object.values(stages).reduce((sum, hours) => sum + hours, 0);
  const rawP50 = Object.values(rawStages).reduce((sum, hours) => sum + hours, 0);
  const widening =
    1 + (1 - rubric.payload.ai.confidence) * 0.5 + rubric.payload.review.reworkProbability * 0.25;
  const p80 = ceilEstimateHours(Math.max(p50, rawP50 * widening));

  const allowed = new Set(input.comparableIssueIds);
  const comparableIssues = comparableOutcomes
    .filter((entry) => allowed.size === 0 || allowed.has(entry.payload.issue))
    .map((entry) => ({
      issue: entry.payload.issue,
      outcomeRecordId: entry.recordId,
      weight: similarity(
        {
          targetModules,
          targetLanes: input.testImpact.lanes,
          dependencyBreadth: targetDependencies.length,
          expectedFiles: Math.max(1, targetModules.length * 5),
        },
        entry.payload.landscape
      ),
    }))
    .sort((left, right) => right.weight - left.weight || left.issue - right.issue);

  const splitReasons = [];
  if (input.wbs.some((item) => !item.independentlyReviewable))
    splitReasons.push('one or more WBS items are not independently reviewable');
  if (targetDependencies.length > planning.dependencyBreadthLimit)
    splitReasons.push(
      `dependency breadth ${targetDependencies.length} exceeds ${planning.dependencyBreadthLimit}`
    );
  const planSize = sizeFor(humanHours, planning.sizeEnvelopeHours);
  const sizeMaximum = planning.sizeEnvelopeHours[planSize];
  if (p80 > sizeMaximum)
    splitReasons.push(`AI P80 ${p80}h exceeds ${planSize} envelope ${sizeMaximum}h`);
  const varianceRatio = p50 === 0 ? 0 : round((p80 - p50) / p50);
  const recommendation = splitReasons.length
    ? { action: 'split', reason: splitReasons.join('; ') }
    : varianceRatio > planning.refineFurtherVarianceRatio
      ? {
          action: 'refine-further',
          reason: `P80 spread ratio ${varianceRatio} exceeds ${planning.refineFurtherVarianceRatio}.`,
        }
      : {
          action: 'proceed',
          reason:
            'WBS items are independently reviewable and remain within the dependency envelope.',
        };

  const forecast = {
    schema: FORECAST_SCHEMA,
    issue,
    lifecycleState: 'plan',
    refine: { size: refine.size, humanHours: refineHours },
    plan: {
      size: planSize,
      humanHours,
      deltaHours: humanHours - refineHours,
      rationale: 'Detailed WBS plus unavoidable repository execution cost.',
    },
    ai: {
      p50EngagedHours: p50,
      p80EngagedHours: p80,
      stages,
    },
    wbs,
    comparableIssues,
    rubric: {
      recordId: rubric.recordId,
      version: rubric.payload.version,
      cohortSize: rubric.payload.cohort.length,
      confidence: rubric.payload.ai.confidence,
    },
    testPlan: {
      impactedLanes: input.testImpact.lanes,
      isolation: input.testImpact.isolation,
      expectedMinutes: input.testImpact.expectedMinutes,
    },
    risks: input.risks,
    recommendation,
    supersedesForecastRecordId: null,
  };
  validateEstimationForecast(forecast, { expectedIssue: issue });
  return forecast;
}
