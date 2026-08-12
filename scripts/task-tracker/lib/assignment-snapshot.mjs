import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { normalizeStateId } from './lifecycle-policy/index.mjs';
import { canonicalLogin, canonicalLogins } from './ownership-policy.mjs';

export function singletonOwner(assignees) {
  const owners = canonicalLogins(assignees);
  return owners.length === 1 ? owners[0] : null;
}

export function sameOwnerSet(left, right) {
  const a = canonicalLogins(left).sort();
  const b = canonicalLogins(right).sort();
  return a.length === b.length && a.every((owner, index) => owner === b[index]);
}

export function assignmentSnapshotFromGraphql(data, cfg) {
  const issue = data?.repository?.issue;
  if (!issue) throw new Error('assignment snapshot: issue is missing');
  const items = issue.projectItems?.nodes;
  if (!Array.isArray(items))
    throw new Error('assignment snapshot: project membership is unreadable');
  const matches = items.filter((candidate) => candidate?.project?.id === cfg?.projectId);
  if (matches.length === 0) {
    throw new Error('assignment snapshot: configured project item is missing');
  }
  if (matches.length !== 1) {
    throw new Error('assignment snapshot: configured project membership is ambiguous');
  }
  const [item] = matches;
  const state = normalizeStateId(item.fieldValueByName?.name);
  if (!state) throw new Error('assignment snapshot: configured project Status is missing');
  const nodes = issue.assignees?.nodes;
  if (!Array.isArray(nodes)) throw new Error('assignment snapshot: assignees are unreadable');
  return { state, assignees: canonicalLogins(nodes) };
}

export async function fetchAssignmentSnapshot({ issueNumber, cfg, deps = {} } = {}) {
  if (!issueNumber) throw new Error('fetchAssignmentSnapshot: issueNumber is required');
  if (!cfg?.repo || !cfg?.projectId) {
    throw new Error('fetchAssignmentSnapshot: repo and projectId are required');
  }
  const query = deps.gql || gql;
  const { owner, repoName } = splitRepo(cfg.repo);
  const projectItems = [];
  let assignees = null;
  let cursor = null;
  let didPaginate = false;
  const seen = new Set();

  for (let page = 0; page < 1000; page += 1) {
    const data = await query(
      `query($owner: String!, $repo: String!, $issue: Int!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) {
            assignees(first: 100) { nodes { login } }
            projectItems(first: 50, after: $cursor) {
              nodes {
                id
                project { id }
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }`,
      { owner, repo: repoName, issue: Number(issueNumber), cursor }
    );
    const issue = data?.repository?.issue;
    if (!issue) throw new Error('assignment snapshot: issue is missing');
    if (!Array.isArray(issue.assignees?.nodes)) {
      throw new Error('assignment snapshot: assignees are unreadable');
    }
    if (!assignees) assignees = issue.assignees;
    else {
      const prior = canonicalLogins(assignees.nodes).sort();
      const current = canonicalLogins(issue.assignees.nodes).sort();
      if (
        prior.length !== current.length ||
        prior.some((owner, index) => owner !== current[index])
      ) {
        throw new Error('assignment snapshot: assignees changed during pagination');
      }
    }
    const connection = issue.projectItems;
    if (!Array.isArray(connection?.nodes)) {
      throw new Error('assignment snapshot: project membership is unreadable');
    }
    projectItems.push(...connection.nodes);
    if (!connection.pageInfo?.hasNextPage) {
      if (didPaginate) {
        const matches = projectItems.filter(
          (candidate) => candidate?.project?.id === cfg.projectId
        );
        if (matches.length !== 1) {
          throw new Error(
            matches.length === 0
              ? 'assignment snapshot: configured project item is missing'
              : 'assignment snapshot: configured project membership is ambiguous'
          );
        }
        const itemId = matches[0]?.id;
        if (!itemId) throw new Error('assignment snapshot: configured project item id is missing');
        const final = await query(
          `query($owner: String!, $repo: String!, $issue: Int!, $item: ID!) {
            repository(owner: $owner, name: $repo) {
              issue(number: $issue) { assignees(first: 100) { nodes { login } } }
            }
            node(id: $item) {
              ... on ProjectV2Item {
                project { id }
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
              }
            }
          }`,
          { owner, repo: repoName, issue: Number(issueNumber), item: itemId }
        );
        if (final?.node?.project?.id !== cfg.projectId) {
          throw new Error('assignment snapshot: final configured project item is missing');
        }
        const state = normalizeStateId(final.node.fieldValueByName?.name);
        const finalNodes = final?.repository?.issue?.assignees?.nodes;
        if (!state || !Array.isArray(finalNodes)) {
          throw new Error('assignment snapshot: final Status or assignees are unreadable');
        }
        return { state, assignees: canonicalLogins(finalNodes) };
      }
      return assignmentSnapshotFromGraphql(
        {
          repository: {
            issue: { assignees, projectItems: { nodes: projectItems } },
          },
        },
        cfg
      );
    }
    const next = connection.pageInfo.endCursor;
    if (!next) throw new Error('assignment snapshot: pagination has a missing cursor');
    if (seen.has(next)) throw new Error('assignment snapshot: pagination repeated a cursor');
    seen.add(next);
    cursor = next;
    didPaginate = true;
  }
  throw new Error('assignment snapshot: pagination exceeded the 1000-page safety limit');
}

export function exactSingleton(snapshot, expectedLogin) {
  const expected = canonicalLogin(expectedLogin);
  const owner = singletonOwner(snapshot?.assignees);
  return Boolean(expected && owner === expected);
}
