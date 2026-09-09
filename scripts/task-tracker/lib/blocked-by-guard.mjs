// Universal GitHub-native dependency readiness guard (#1557).

import {
  observeDependencyReadiness,
  reconcileDependencyDisposition,
} from './dependency-disposition.mjs';

export const GUARD_ID = 'blocked-by-not-done';

function formatRefusal(unfinished) {
  const parts = unfinished.map(({ ref, state }) => `#${ref} (${state ?? 'unknown'})`);
  return `cannot exit because blockers are open: ${parts.join(', ')}`;
}

export const blockedByGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (!ctx || typeof ctx !== 'object') {
      return { ok: false, reason: `${GUARD_ID}: missing ctx` };
    }
    const cfg = ctx.cfg || { repo: ctx.repo, projectId: ctx.projectId };
    const observe =
      ctx.observeDependencyReadiness ||
      ctx.deps?.observeDependencyReadiness ||
      observeDependencyReadiness;
    const observationDeps = { ...(ctx.deps?.dependencyReadiness || {}) };
    if (typeof ctx.readDependencies === 'function') {
      observationDeps.readNativeDependencies = async () => ctx.readDependencies(ctx.issueNumber);
    }
    if (typeof ctx.fetchBlockerState === 'function') {
      observationDeps.fetchAssignmentSnapshot = async ({ issueNumber }) => ({
        state: await ctx.fetchBlockerState(issueNumber),
        assignees: [],
      });
    }

    let observation;
    try {
      observation = await observe({
        issueNumber: ctx.issueNumber,
        cfg,
        deps: observationDeps,
      });
    } catch (error) {
      const reconcile =
        ctx.reconcileDisposition ||
        ctx.deps?.reconcileDependencyDisposition ||
        reconcileDependencyDisposition;
      try {
        await reconcile({
          issueNumber: ctx.issueNumber,
          cfg,
          observationError: error,
          deps: ctx.deps?.dependencyDisposition,
        });
      } catch (projectionError) {
        return {
          ok: false,
          reason: `dependency readiness unavailable: ${error.message}; ${projectionError.message}`,
        };
      }
      return { ok: false, reason: `dependency readiness unavailable: ${error.message}` };
    }

    const reconcile =
      ctx.reconcileDisposition ||
      ctx.deps?.reconcileDependencyDisposition ||
      reconcileDependencyDisposition;
    try {
      await reconcile({
        issueNumber: ctx.issueNumber,
        cfg,
        observation,
        deps: ctx.deps?.dependencyDisposition,
      });
    } catch (error) {
      return { ok: false, reason: `dependency projection unavailable: ${error.message}` };
    }

    if (observation.status === 'ready') return { ok: true };
    return { ok: false, reason: formatRefusal(observation.unfinished) };
  },
};
