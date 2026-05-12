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

import { gql, splitRepo } from './github-projects.mjs';
import { normalizeStateSlug } from '../../task-tracker/state-machine.mjs';

export async function readParentStatus({ parentEpicNumber, repo, projectId } = {}) {
  if (parentEpicNumber == null) return null;
  if (!repo) throw new Error('parent-status: repo is required');
  if (!projectId) throw new Error('parent-status: projectId is required');
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          projectItems(first: 20) {
            nodes {
              project { id }
              fieldValues(first: 50) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(parentEpicNumber) }
  );
  const items = data?.repository?.issue?.projectItems?.nodes || [];
  const item = items.find((n) => n?.project?.id === projectId);
  if (!item) return null;
  for (const fv of item.fieldValues?.nodes || []) {
    const fname = fv?.field?.name;
    if (fname && fname.toLowerCase() === 'status' && fv.name) {
      return normalizeStateSlug(String(fv.name).toLowerCase());
    }
  }
  return null;
}
