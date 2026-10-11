// @story #1954
import { gql, splitRepo } from './github-projects.mjs';

function refuse(detail) {
  throw new Error(`project membership: ${detail}`);
}

export function membershipNextCursor(connection, seenCursors) {
  if (!Array.isArray(connection?.nodes) || typeof connection.pageInfo?.hasNextPage !== 'boolean') {
    refuse('connection is unreadable');
  }
  if (!connection.pageInfo.hasNextPage) return null;
  const next = connection.pageInfo.endCursor;
  if (typeof next !== 'string' || !next.trim()) refuse('pagination has a missing cursor');
  if (seenCursors.has(next)) refuse('pagination repeated a cursor');
  seenCursors.add(next);
  return next;
}

export async function fetchIssueProjectMembership({
  repo,
  projectId,
  issueNumber,
  runGql = gql,
  itemFields = '',
}) {
  if (!projectId || !Number.isInteger(Number(issueNumber)) || Number(issueNumber) <= 0) {
    refuse('projectId and positive issueNumber are required');
  }
  const { owner, repoName } = splitRepo(repo);
  let after = null;
  let initial = null;
  const items = [];
  const itemIds = new Set();
  const cursors = new Set();
  for (let page = 0; page < 1000; page += 1) {
    const data = await runGql(
      `query($owner: String!, $repo: String!, $issue: Int!, $after: String) {
        repository(owner: $owner, name: $repo) {
          id
          issue(number: $issue) {
            id number title url
            projectItems(first: 50, after: $after) {
              nodes {
                id
                project { id title url }
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name optionId }
                }
                ${itemFields}
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }`,
      { owner, repo: repoName, issue: Number(issueNumber), after }
    );
    const issue = data?.repository?.issue;
    if (typeof issue?.id !== 'string' || !issue.id.trim()) refuse('issue identity is unreadable');
    if (initial && initial.issue.id !== issue.id)
      refuse('issue identity changed during pagination');
    initial ??= { repositoryId: data.repository.id, issue };
    after = membershipNextCursor(issue.projectItems, cursors);
    for (const item of issue.projectItems.nodes) {
      if (
        typeof item?.id !== 'string' ||
        !item.id.trim() ||
        typeof item.project?.id !== 'string' ||
        !item.project.id.trim()
      ) {
        refuse('item identity is unreadable');
      }
      if (itemIds.has(item.id)) refuse('duplicate item identity');
      itemIds.add(item.id);
      items.push(item);
    }
    if (after === null) {
      const matches = items.filter((item) => item.project.id === projectId);
      if (matches.length > 1) refuse('configured project is ambiguous');
      return {
        ...initial,
        issue: {
          ...initial.issue,
          projectItems: { nodes: items, pageInfo: { hasNextPage: false, endCursor: null } },
        },
        item: matches[0] ?? null,
      };
    }
  }
  refuse('pagination exceeded the 1000-page safety limit');
}
