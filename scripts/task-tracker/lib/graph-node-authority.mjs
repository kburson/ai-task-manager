// @story #1486
// Policy-neutral normalization boundary for the graph nodes consumed by
// resolveEpicLineage. Callers retain relationship discovery and presentation.

import { resolveCurrentIssueWorktreeLocation } from './issue-worktree-location.mjs';

function positiveIssue(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`graph-node-authority: ${label} must be a positive integer`);
  }
  return number;
}

function defaultMapChild(child) {
  return positiveIssue(child?.number ?? child, 'child issue');
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function buildGraphNodeAuthority({
  parent = null,
  children = [],
  ownBody,
  parentBody,
  mapChild = defaultMapChild,
} = {}) {
  const normalizedParent = parent == null ? null : positiveIssue(parent, 'parent issue');
  if (!Array.isArray(children)) {
    throw new Error('graph-node-authority: children must be an array');
  }
  if (typeof mapChild !== 'function') {
    throw new Error('graph-node-authority: mapChild must be a function');
  }

  const node = { parent: normalizedParent, children: children.map(mapChild) };
  if (typeof ownBody === 'string') {
    try {
      const own = resolveCurrentIssueWorktreeLocation(ownBody);
      if (own) {
        node.authoritativeBranch = own.worktreeBranch;
        node.authoritativeWorktree = own.worktreePath;
      }
    } catch (error) {
      return { ...node, authorityError: errorMessage(error) };
    }
  }

  if (normalizedParent == null) return node;
  if (typeof parentBody !== 'string') {
    throw new Error(`graph-node-authority: parent #${normalizedParent} body unavailable`);
  }
  try {
    const parentLocation = resolveCurrentIssueWorktreeLocation(parentBody);
    return parentLocation
      ? { ...node, parentAuthoritativeBranch: parentLocation.worktreeBranch }
      : node;
  } catch (error) {
    return { ...node, parentAuthorityError: errorMessage(error) };
  }
}

export async function fetchParentIssueBody({ parentIssue, cfg, deps = {} } = {}) {
  if (parentIssue == null) return undefined;
  const parent = positiveIssue(parentIssue, 'parent issue');
  if (!cfg?.repo) throw new Error('graph-node-authority: cfg.repo is required');

  const github =
    typeof deps.gql === 'function' && typeof deps.splitRepo === 'function'
      ? deps
      : await import('../../gh/lib/github-projects.mjs');
  const { owner, repoName } = github.splitRepo(cfg.repo);
  const data = await github.gql(
    `query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) { issue(number: $issue) { body } }
    }`,
    { owner, repo: repoName, issue: parent }
  );
  const body = data?.repository?.issue?.body;
  if (typeof body !== 'string') {
    throw new Error(`graph-node-authority: parent #${parent} body unavailable`);
  }
  return body;
}
