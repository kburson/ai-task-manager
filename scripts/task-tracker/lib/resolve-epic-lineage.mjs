// #905 — resolve a branch's intended lineage from the GitHub sub-issue graph.
//
// Lineage is NEVER encoded in the branch name (see branch-name.mjs); it is derived
// live from who-parents-whom. This is the single resolver every epic-branch script
// and the fail-closed guard call, so "where should this branch be based" has exactly
// one answer.
//
//   resolveEpicLineage(issueOrBranch, { deps }) → { role, branch, epicBranch, parentBranch, parentIssue }
//
// role classification (branch-name role, from the graph):
//   has children            → 'epic'   (root epic or nested sub-epic)
//   else has a parent       → 'child'
//   else                    → 'story'
//
//   epicBranch   — the epic this branch belongs to: itself for an epic, its parent
//                  epic for a child, null for a standalone story.
//   parentBranch — the ref to cut from / rebase onto: the parent epic's branch for a
//                  child or a nested epic, else trunk.
//   parentIssue  — #1485: the graph node's numeric parent issue, or null. This is
//                  GRAPH identity, never branch-derived identity: an authoritative
//                  branch is an opaque ref that may not parse as `feature/<role>/<N>`,
//                  so callers needing the parent epic's issue number must read this
//                  field rather than parsing `epicBranch`/`parentBranch`.
//
// The one external fact — the sub-issue graph edge for an issue — is injected as
// `deps.graph(issue) → { parent, children, parentAuthoritativeBranch? }`, so this
// module needs neither `gh` nor git and each resolution reads exactly one graph
// node. A parent authority error is likewise carried on that node. `deps.trunk`
// overrides the trunk branch name.

import { composeBranchName, parseBranchName } from './branch-name.mjs';

function toIssue(issueOrBranch) {
  if (typeof issueOrBranch === 'number' && Number.isInteger(issueOrBranch) && issueOrBranch > 0) {
    return issueOrBranch;
  }
  if (typeof issueOrBranch === 'string') {
    const parsed = parseBranchName(issueOrBranch);
    if (parsed) return parsed.issue;
    if (/^[0-9]+$/.test(issueOrBranch) && Number(issueOrBranch) > 0) return Number(issueOrBranch);
  }
  throw new Error(
    `resolve-epic-lineage: cannot resolve an issue from ${JSON.stringify(issueOrBranch)}`
  );
}

export function resolveEpicLineage(issueOrBranch, { deps } = {}) {
  const issue = toIssue(issueOrBranch);
  if (!deps || typeof deps.graph !== 'function') {
    throw new Error('resolve-epic-lineage: deps.graph(issue) lookup is required');
  }
  const trunk = deps.trunk || 'trunk';

  const node = deps.graph(issue) || {};
  if (node.authorityError) {
    throw new Error(`resolve-epic-lineage: ${node.authorityError}`);
  }
  const { parent = null, children = [] } = node;
  const parentIssue = parent;
  const role = children.length > 0 ? 'epic' : parent != null ? 'child' : 'story';
  const canonicalBranch = composeBranchName({ role, issue });
  if (
    node.authoritativeBranch != null &&
    (typeof node.authoritativeBranch !== 'string' || !node.authoritativeBranch)
  ) {
    throw new Error('resolve-epic-lineage: authoritative branch must be a non-empty string');
  }
  const branch = node.authoritativeBranch || canonicalBranch;

  if (role === 'story') {
    return { role, branch, epicBranch: null, parentBranch: trunk, parentIssue };
  }

  let parentEpicBranch = null;
  if (parent != null) {
    if (node.parentAuthorityError) {
      throw new Error(`resolve-epic-lineage: ${node.parentAuthorityError}`);
    }
    if (node.parentAuthoritativeBranch != null) {
      if (typeof node.parentAuthoritativeBranch !== 'string' || !node.parentAuthoritativeBranch) {
        throw new Error(
          'resolve-epic-lineage: parent authoritative branch must be a non-empty string'
        );
      }
      parentEpicBranch = node.parentAuthoritativeBranch;
    } else {
      parentEpicBranch = composeBranchName({ role: 'epic', issue: parent });
    }
  }

  if (role === 'epic') {
    // A nested sub-epic bases on its parent epic; a root epic bases on trunk.
    return {
      role,
      branch,
      epicBranch: branch,
      parentBranch: parentEpicBranch || trunk,
      parentIssue,
    };
  }

  // role === 'child' — belongs to, and bases on, its parent epic.
  return {
    role,
    branch,
    epicBranch: parentEpicBranch,
    parentBranch: parentEpicBranch,
    parentIssue,
  };
}
