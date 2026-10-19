// @story #1988 — legacy verb-orchestration tests isolate the publication port.
// Real private-owner composition is exercised by the project-tether matrix.
import { runRefine } from '../../task-tracker/verbs/refine.mjs';
export function runRefineOrchestration(input) {
  const deps = input.deps ?? {},
    tether = deps.tetherIssueToProject;
  let fields = {};
  return runRefine({
    ...input,
    deps: {
      ...deps,
      tetherIssueToProject: async (next) => {
        fields = { ...fields, ...next };
        return tether(fields);
      },
      publishRefinementRevision: async (revision) => {
        await revision.beforeEffects();
        await revision.writeField({ field: 'estimate', value: revision.estimate });
        await revision.writeField({ field: 'size', value: revision.size });
        // This isolated port represents a changed publication, not the unchanged path.
        await revision.applyBody({ source: 'changed-publication-test-double' });
        return { status: 'recorded' };
      },
    },
  });
}
