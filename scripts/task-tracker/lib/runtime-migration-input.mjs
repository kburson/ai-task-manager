// @story #1857
// Untrusted artifact input is useful only after exact digest and fresh inventory checks.
import { lstatSync, readFileSync } from 'node:fs';
import { planRuntimeMigration, runtimeMigrationDigest } from './runtime-migration-plan.mjs';
import { runtimeStoragePaths, RuntimeRootError } from './runtime-storage.mjs';

const fail = (code, message) => {
  throw new RuntimeRootError(code, message);
};
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateRuntimePlanInput({ plan, approvedPlanDigest, projectRoot, mainRoot }) {
  const roots = runtimeStoragePaths({ projectRoot, mainRoot });
  if (!object(plan))
    fail('RUNTIME_MIGRATION_APPROVAL_REQUIRED', 'An exact observed plan is required');
  const { digest, ...contents } = plan;
  if (
    plan.schema !== 'aitm.runtime-migration-plan/v1' ||
    digest !== approvedPlanDigest ||
    runtimeMigrationDigest(contents) !== digest ||
    plan.projectRoot !== roots.projectRoot ||
    plan.mainRoot !== roots.mainRoot ||
    !Array.isArray(plan.files) ||
    !Array.isArray(plan.blockers) ||
    !Array.isArray(plan.roots) ||
    !Array.isArray(plan.rootIdentities)
  ) {
    fail(
      'RUNTIME_MIGRATION_APPROVAL_REQUIRED',
      'Observed plan bytes, roots, and approved digest must agree'
    );
  }
  return plan;
}

export function readRuntimePlanInput({ file, ...input }) {
  let plan;
  try {
    if (typeof file !== 'string' || !lstatSync(file).isFile())
      throw new Error('not a regular plan file');
    plan = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file)));
  } catch {
    fail('RUNTIME_MIGRATION_APPROVAL_REQUIRED', 'Unreadable exact plan artifact');
  }
  return validateRuntimePlanInput({ ...input, plan });
}

function sourceSnapshot(plan) {
  return {
    projectRoot: plan.projectRoot,
    mainRoot: plan.mainRoot,
    roots: plan.roots,
    rootIdentities: plan.rootIdentities,
    files: plan.files.map(({ trust: _trust, ...file }) => file),
    sourcePolicy: plan.sourcePolicy,
  };
}

export async function acknowledgeRuntimeLegacyPlan({
  observedPlan,
  approvedPlanDigest,
  projectRoot,
  mainRoot,
  adapters = {},
}) {
  const plan = validateRuntimePlanInput({
    plan: observedPlan,
    approvedPlanDigest,
    projectRoot,
    mainRoot,
  });
  if (
    plan.blockers.some((blocker) => !object(blocker) || blocker.code !== 'legacy-trust-required')
  ) {
    fail(
      'RUNTIME_MIGRATION_BLOCKED',
      'Legacy trust cannot acknowledge schema, root, census, conflict, or recovery blockers'
    );
  }
  const fresh = await planRuntimeMigration({
    projectRoot,
    mainRoot,
    adapters: {
      ...adapters,
      trustLegacy: ({ source, digest, root, family }) =>
        plan.files.some(
          (file) =>
            file.source === source &&
            file.digest === digest &&
            file.root === root &&
            file.family === family
        )
          ? 'explicit-operator-trust'
          : 'unresolved',
    },
  });
  if (
    fresh.blockers.length ||
    runtimeMigrationDigest(sourceSnapshot(fresh)) !== runtimeMigrationDigest(sourceSnapshot(plan))
  ) {
    fail(
      'RUNTIME_MIGRATION_PLAN_CHANGED',
      'Fresh source hashes, physical roots, or writer observations no longer admit the observed plan'
    );
  }
  // Return a new exact plan for review/apply; never rewrite the observed input or import bytes here.
  return fresh;
}
