// @story #1279
import { visibleMetadataFieldValue } from './decomposition-policy.mjs';

const SECTION = 'Plan Metadata';

export function parseWbsChildClaim(child = {}) {
  return {
    number: Number(child.number),
    title: String(child.title || '').trim(),
    sourcePlan: visibleMetadataFieldValue(child.body || '', SECTION, 'Source-plan'),
    sourcePlanCommit: visibleMetadataFieldValue(
      child.body || '',
      SECTION,
      'Source-plan-commit'
    ),
    sourcePlanSection: visibleMetadataFieldValue(
      child.body || '',
      SECTION,
      'Source-plan-section'
    ),
  };
}

function childRef(claim) {
  return `#${Number.isInteger(claim.number) && claim.number > 0 ? claim.number : 'unknown'}`;
}

function unique(values) {
  return [...new Set(values)];
}

export async function reconcileWbsCoverage({
  tasks = [],
  acceptedPlanPath,
  acceptedPlanText,
  children = [],
  readPlanAtCommit,
} = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('wbs-coverage: tasks are required');
  }
  if (!String(acceptedPlanPath || '').trim()) {
    throw new Error('wbs-coverage: acceptedPlanPath is required');
  }
  if (typeof acceptedPlanText !== 'string') {
    throw new Error('wbs-coverage: acceptedPlanText is required');
  }
  if (!Array.isArray(children)) throw new Error('wbs-coverage: children must be an array');
  if (typeof readPlanAtCommit !== 'function') {
    throw new Error('wbs-coverage: readPlanAtCommit is required');
  }

  const expectedBySection = new Map(tasks.map((task) => [task.heading, task]));
  const expectedTitles = new Set(tasks.map((task) => task.title));
  const claims = children.map(parseWbsChildClaim);
  const relevant = claims.filter(
    (claim) =>
      claim.sourcePlan === acceptedPlanPath ||
      expectedBySection.has(claim.sourcePlanSection) ||
      expectedTitles.has(claim.title)
  );
  const missingTasks = [];
  const duplicateClaims = [];
  const provenanceMismatches = [];
  const unknownSections = [];
  const matched = [];
  const planReads = new Map();

  async function pinnedPlan(claim) {
    const key = `${claim.sourcePlanCommit}\u0000${claim.sourcePlan}`;
    if (!planReads.has(key)) {
      planReads.set(
        key,
        Promise.resolve(
          readPlanAtCommit({
            planCommit: claim.sourcePlanCommit,
            planPath: claim.sourcePlan,
          })
        )
      );
    }
    return planReads.get(key);
  }

  for (const claim of relevant) {
    if (claim.sourcePlan === acceptedPlanPath && !expectedBySection.has(claim.sourcePlanSection)) {
      unknownSections.push(
        `${childRef(claim)} claims unknown Source-plan-section ${JSON.stringify(
          claim.sourcePlanSection
        )}`
      );
    }
  }

  for (const task of tasks) {
    const candidates = relevant.filter((claim) => claim.sourcePlanSection === task.heading);
    if (candidates.length === 0) {
      missingTasks.push(task.heading);
      continue;
    }
    if (candidates.length > 1) {
      duplicateClaims.push(
        `${task.heading} is claimed by ${candidates.map(childRef).join(', ')}`
      );
      continue;
    }
    const claim = candidates[0];
    const errors = [];
    if (claim.sourcePlan !== acceptedPlanPath) {
      errors.push(
        `${childRef(claim)} Source-plan ${JSON.stringify(claim.sourcePlan)} does not match ${JSON.stringify(
          acceptedPlanPath
        )}`
      );
    }
    if (claim.title !== task.title) {
      errors.push(
        `${childRef(claim)} title ${JSON.stringify(claim.title)} does not match ${JSON.stringify(
          task.title
        )}`
      );
    }
    if (!claim.sourcePlanCommit) {
      errors.push(`${childRef(claim)} Source-plan-commit is missing`);
    }
    if (errors.length === 0) {
      try {
        if ((await pinnedPlan(claim)) !== acceptedPlanText) {
          errors.push(`${childRef(claim)} pinned plan content differs from the accepted plan`);
        }
      } catch (error) {
        errors.push(`${childRef(claim)} pinned plan is unreadable: ${error.message}`);
      }
    }
    if (errors.length > 0) provenanceMismatches.push(...errors);
    else matched.push({ task, child: claim });
  }

  const blockers = unique([
    ...missingTasks.map((heading) => `wbs-missing-task: ${heading}`),
    ...duplicateClaims.map((detail) => `wbs-duplicate-claim: ${detail}`),
    ...provenanceMismatches.map((detail) => `wbs-provenance-mismatch: ${detail}`),
    ...unknownSections.map((detail) => `wbs-unknown-section: ${detail}`),
  ]);
  return {
    ok: blockers.length === 0 && matched.length === tasks.length,
    expectedCount: tasks.length,
    coveredCount: matched.length,
    matched,
    missingTasks,
    duplicateClaims,
    provenanceMismatches,
    unknownSections,
    blockers,
  };
}
