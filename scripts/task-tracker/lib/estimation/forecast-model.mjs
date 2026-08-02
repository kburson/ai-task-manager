import { validateEstimationForecast } from './forecast-record.mjs';
import { parsePlanEstimationInput } from './plan-input.mjs';
import { validateEstimationRubric } from './rubric-record.mjs';

const SIZE_ORDER = Object.freeze(['XS', 'S', 'M', 'L', 'XL']);
const DEFAULT_PLANNING = Object.freeze({
  dependencyBreadthLimit: 8,
  refineFurtherVarianceRatio: 0.6,
  sizeEnvelopeHours: Object.freeze({ XS: 1, S: 3, M: 8, L: 20, XL: 60 }),
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
  const wbs = input.wbs.map((item) => ({
    id: item.id,
    description: item.description,
    humanHours: round(
      item.baseHumanHours * humanCoefficients.necessaryToPlanned +
        item.signals.modules.length * humanCoefficients.moduleBreadthHour +
        item.signals.dependencies.length * humanCoefficients.dependencyBreadthHour
    ),
    signals: [...new Set([...item.signals.modules, ...item.signals.dependencies])],
  }));
  if (repositoryHours > 0)
    wbs.push({
      id: 'repository-execution',
      description: 'Run unavoidable isolated repository verification',
      humanHours: round(repositoryHours),
      signals: input.testImpact.lanes.map((lane) => `test:${lane}`),
    });
  const humanHours = round(wbs.reduce((sum, item) => sum + item.humanHours, 0));

  const targetModules = [...new Set(input.wbs.flatMap((item) => item.signals.modules))];
  const targetDependencies = [...new Set(input.wbs.flatMap((item) => item.signals.dependencies))];
  const humanImplementationHours = round(humanHours - repositoryHours);

  const p50 = round(
    humanImplementationHours * aiCoefficients.engagedToHuman +
      targetModules.length * aiCoefficients.moduleBreadthHour +
      targetDependencies.length * aiCoefficients.dependencyBreadthHour +
      repositoryHours
  );
  const widening =
    1 + (1 - rubric.payload.ai.confidence) * 0.5 + rubric.payload.review.reworkProbability * 0.25;
  const p80 = round(Math.max(p50, p50 * widening));
  const stageTest = round(Math.min(p50, repositoryHours));
  const nonExecution = Math.max(0, p50 - stageTest);
  const stagePlan = round(nonExecution * 0.125);
  const stageDevelop = round(nonExecution * 0.6875);
  const stageReview = round(Math.max(0, p50 - stagePlan - stageDevelop - stageTest));

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
          expectedFiles: input.wbs.length * 5,
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
    schema: 'aitm.estimation-forecast/v1',
    issue,
    lifecycleState: 'plan',
    refine: { size: refine.size, humanHours: refine.humanHours },
    plan: {
      size: planSize,
      humanHours,
      deltaHours: round(humanHours - refine.humanHours),
      rationale: 'Detailed WBS plus unavoidable repository execution cost.',
    },
    ai: {
      p50EngagedHours: p50,
      p80EngagedHours: p80,
      stages: { plan: stagePlan, develop: stageDevelop, test: stageTest, review: stageReview },
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
