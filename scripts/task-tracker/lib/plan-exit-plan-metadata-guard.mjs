// Plan-exit planning-output guard (#892).
//
// Plan Metadata may be empty at creation and throughout Refine. Before Plan
// advances to Develop it must contain at least one substantive flat metadata
// field. Comments and prose are not planning output.

import { hasPlanMetadataFields } from './plan-metadata.mjs';

export const GUARD_ID = 'plan-exit-plan-metadata';

export const planExitPlanMetadataGuard = {
  id: GUARD_ID,
  run(ctx) {
    if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };
    if (!ctx || typeof ctx.body !== 'string') return { ok: true };
    if (hasPlanMetadataFields(ctx.body)) return { ok: true };
    const blocker =
      'plan-develop-plan-metadata-empty: `## Plan Metadata` must contain at least one ' +
      'substantive flat `- **field**: value` entry before plan→develop';
    return { ok: false, reason: blocker, blockers: [blocker] };
  },
};
