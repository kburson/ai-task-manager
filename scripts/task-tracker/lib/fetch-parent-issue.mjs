// Shared helper: fetch the parent issue number for a given issue via GraphQL.
//
// Extracted from `scripts/task-tracker/verbs/promote.mjs` so that guard
// adapters (refine-exit-wip-budget-guard.mjs, etc.) can reuse the same
// default deps as the verb path without circular imports.
//
// Returns the parent issue number, or null when:
//   - the issue has no `parent` (top-level, not a sub-issue)
//   - the GraphQL query throws (network, auth, etc.) — fail open so guards
//     don't false-negative on transient gh failures.

import { splitRepo, gql } from '../../gh/lib/github-projects.mjs';

export async function fetchParentIssueStrict({ issueNumber, repo, deps = {} }) {
  const { owner, repoName } = splitRepo(repo);
  const runGraphql = deps.gql || gql;
  const data = await runGraphql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) { parent { number } }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  return data?.repository?.issue?.parent?.number ?? null;
}

export async function fetchParentIssue({ issueNumber, repo, deps = {} }) {
  try {
    return await fetchParentIssueStrict({ issueNumber, repo, deps });
  } catch {
    return null;
  }
}
