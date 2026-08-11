// Parent-status reader for the parent-admission gate.
//
// `readParentStatus({ parentEpicNumber, repo, projectId })` returns the parent
// epic's live Status as a lowercase slug, or `null` if the parent has no item
// on the configured project board.
//
// Pure default implementation around a single GraphQL query. The gate in
// `scripts/task-tracker/lib/body-gates.mjs` accepts this as an injected
// dependency; tests stub it. Production verbs (`analyze`, `approve`) wire it
// in by default.

import { fetchConfiguredProjectIssue } from './github-projects.mjs';
import { normalizeStateId } from '../../task-tracker/lib/lifecycle-policy/index.mjs';

export async function readParentStatus({ parentEpicNumber, repo, projectId } = {}) {
  if (parentEpicNumber == null) return null;
  if (!repo) throw new Error('parent-status: repo is required');
  if (!projectId) throw new Error('parent-status: projectId is required');
  const snapshot = await fetchConfiguredProjectIssue({
    repo,
    projectId,
    issueNumber: parentEpicNumber,
  });
  const item = snapshot.projectItem;
  if (!item) return null;
  if (item.fieldValueByName?.name) return normalizeStateId(item.fieldValueByName.name);
  for (const fv of item.fieldValues?.nodes || []) {
    const fname = fv?.field?.name;
    if (fname && fname.toLowerCase() === 'status' && fv.name) {
      return normalizeStateId(fv.name);
    }
  }
  return null;
}
