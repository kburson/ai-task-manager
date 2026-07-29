// @story #925
// Normalize one authoritative GraphQL read of an issue's child inventory and
// each child's state on this project's board. Incomplete reads fail closed so
// callers cannot mistake "unknown" for an epic with no children.

import { normalizeStateId } from './lifecycle-policy/index.mjs';

export function normalizeSubIssueBoardSnapshot(data, projectId) {
  const issue = data?.repository?.issue;
  if (!issue) return { status: 'unknown', error: 'issue unavailable' };

  const children = issue.subIssues?.nodes;
  if (!Array.isArray(children)) {
    return { status: 'unknown', error: 'children unavailable' };
  }

  const normalized = [];
  for (const child of children) {
    const items = child?.projectItems?.nodes || [];
    const item = items.find((node) => node?.project?.id === projectId);
    const boardState = normalizeStateId(item?.fieldValueByName?.name);
    if (!child?.number || !boardState) {
      return {
        status: 'unknown',
        error: `child #${child?.number || '?'} board unknown`,
      };
    }
    normalized.push({ number: child.number, boardState });
  }

  return { status: 'ok', children: normalized };
}
