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
  const seen = new Set();

  for (let page = 0; page < 1000; page += 1) {
    const data = await query(
      `query($owner: String!, $repo: String!, $issue: Int!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) {
            assignees(first: 100) { nodes { login } }
            projectItems(first: 50, after: $cursor) {
              nodes {
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
    if (!assignees) assignees = issue.assignees;
    const connection = issue.projectItems;
    if (!Array.isArray(connection?.nodes)) {
      throw new Error('assignment snapshot: project membership is unreadable');
    }
    projectItems.push(...connection.nodes);
    if (!connection.pageInfo?.hasNextPage) {
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
  }
  throw new Error('assignment snapshot: pagination exceeded the 1000-page safety limit');
}

export function exactSingleton(snapshot, expectedLogin) {
  const expected = canonicalLogin(expectedLogin);
  const owner = singletonOwner(snapshot?.assignees);
  return Boolean(expected && owner === expected);
}
