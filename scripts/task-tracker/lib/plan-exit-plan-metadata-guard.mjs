// Plan-exit planning-output guard (#892).
//
// Plan Metadata may be empty at creation and throughout Refine. Before Plan
// advances to Develop it must contain at least one substantive flat metadata
// field. Comments and prose are not planning output.

import { PLAN_METADATA_HEADING } from './plan-metadata.mjs';
import { STORY_ORIGIN_PROVENANCE_KEYS } from './story-origin.mjs';
import {
  hasNestedMetadataHeading,
  isSubstantiveMetadataValue,
  parseMetadataField,
  sectionBounds,
} from './metadata-section.mjs';

export const GUARD_ID = 'plan-exit-plan-metadata';
const PROVENANCE_KEYS = new Set(STORY_ORIGIN_PROVENANCE_KEYS);

function hasPlanningField(body) {
  const lines = String(body).split('\n');
  const bounds = sectionBounds(lines, PLAN_METADATA_HEADING);
  if (!bounds) return false;
  for (let i = bounds.start; i < bounds.end; i += 1) {
    const field = parseMetadataField(lines[i]);
    if (
      field &&
      isSubstantiveMetadataValue(field.value) &&
      !PROVENANCE_KEYS.has(field.key.toLowerCase())
    ) {
      return true;
    }
  }
  return false;
}

export const planExitPlanMetadataGuard = {
  id: GUARD_ID,
  run(ctx) {
    if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };
    if (!ctx || typeof ctx.body !== 'string') return { ok: true };
    if (hasNestedMetadataHeading(ctx.body, PLAN_METADATA_HEADING)) {
      const blocker =
        'plan-develop-plan-metadata-not-flat: `## Plan Metadata` must contain no nested headings';
      return { ok: false, reason: blocker, blockers: [blocker] };
    }
    if (hasPlanningField(ctx.body)) return { ok: true };
    const blocker =
      'plan-develop-plan-metadata-empty: `## Plan Metadata` must contain at least one ' +
      'substantive flat `- **field**: value` entry before plan→develop';
    return { ok: false, reason: blocker, blockers: [blocker] };
  },
};
