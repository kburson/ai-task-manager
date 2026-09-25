// @story #1734

const COMMENTS_BY_NODE_IDS_QUERY = `
  query AitmCommentsByNodeIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on IssueComment {
        id
        body
        author { login }
        createdAt
        updatedAt
        issue {
          number
          repository { nameWithOwner }
        }
      }
    }
  }
`;
const ISSUE_COMMENT_PAGE_SIZE = 100;
const ISSUE_COMMENTS_QUERY = `
  query AitmIssueComments($owner: String!, $name: String!, $issue: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      issue(number: $issue) {
        number
        repository { nameWithOwner }
        comments(first: ${ISSUE_COMMENT_PAGE_SIZE}, after: $after) {
          nodes {
            __typename
            ... on IssueComment {
              id
              body
              author { login }
              createdAt
              updatedAt
              issue { number repository { nameWithOwner } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;
const MAX_ISSUE_COMMENT_PAGES = 1000;

export class GitHubCommentTransportError extends Error {
  constructor(category, options) {
    super(`github-comment-transport:${category}`, options);
    this.name = 'GitHubCommentTransportError';
    this.category = category;
  }
}

function transportError(category, cause) {
  return new GitHubCommentTransportError(category, cause === undefined ? undefined : { cause });
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assertNoGraphqlErrors(response) {
  if (
    Object.hasOwn(response ?? {}, 'errors') &&
    (!Array.isArray(response.errors) || response.errors.length > 0)
  ) {
    throw transportError('partial-response');
  }
}

function isOpaqueId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  );
}

function assertContext({ repository, issue, graphql }) {
  if (
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !Number.isInteger(issue) ||
    issue <= 0 ||
    typeof graphql !== 'function'
  ) {
    throw transportError('input');
  }
}

function assertReadInput({ commentNodeId, ...context }) {
  assertContext(context);
  if (!isOpaqueId(commentNodeId)) throw transportError('input');
}

function assertBatchReadInput({ ids, ...context }) {
  assertContext(context);
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 100 ||
    ids.some((id) => !isOpaqueId(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw transportError('input');
  }
}

export function normalizeGitHubInstant(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (match === null) return null;
  const canonical = `${match[1]}.${(match[2] ?? '').padEnd(3, '0')}Z`;
  const timestamp = Date.parse(canonical);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === canonical
    ? canonical
    : null;
}

export function normalizeCorrelatedCommentNode(node, expectedId, repository, issue) {
  if (node === null) throw transportError('missing-node');
  if (node?.__typename !== 'IssueComment') throw transportError('wrong-type');
  if (!isOpaqueId(node.id) || node.id !== expectedId) throw transportError('node-mismatch');
  if (node.issue?.number !== issue || node.issue?.repository?.nameWithOwner !== repository) {
    throw transportError('correlation');
  }
  if (typeof node.body !== 'string') throw transportError('response-shape');
  const createdAt = normalizeGitHubInstant(node.createdAt);
  const updatedAt = normalizeGitHubInstant(node.updatedAt);
  const authorLogin = isOpaqueId(node.author?.login) ? node.author.login : null;
  const hasAnyProviderProvenance = node.createdAt !== undefined || node.author !== undefined;
  if (
    updatedAt === null ||
    (hasAnyProviderProvenance && (createdAt === null || authorLogin === null))
  ) {
    throw transportError('response-shape');
  }
  if (createdAt !== null && updatedAt < createdAt) throw transportError('response-shape');
  return deepFreeze({
    commentNodeId: node.id,
    id: node.id,
    body: node.body,
    authorLogin,
    createdAt,
    updatedAt,
  });
}

export async function getCorrelatedCommentNodesByIds(input = {}) {
  assertBatchReadInput(input);
  const { ids, repository, issue, graphql } = input;
  let response;
  try {
    response = await graphql({
      query: COMMENTS_BY_NODE_IDS_QUERY,
      variables: { ids: [...ids] },
    });
  } catch (error) {
    throw transportError('transport', error);
  }
  assertNoGraphqlErrors(response);
  if (!Array.isArray(response?.data?.nodes)) throw transportError('partial-response');
  if (response.data.nodes.length !== ids.length) throw transportError('missing-node');
  return deepFreeze(
    response.data.nodes.map((node, index) =>
      normalizeCorrelatedCommentNode(node, ids[index], repository, issue)
    )
  );
}

export async function readCorrelatedCommentNode({ commentNodeId, ...context } = {}) {
  assertReadInput({ commentNodeId, ...context });
  const [node] = await getCorrelatedCommentNodesByIds({
    ids: [commentNodeId],
    ...context,
  });
  return node;
}

export async function listCorrelatedCommentNodes(input = {}) {
  const { repository, issue, graphql } = input;
  assertContext(input);
  const [owner, name] = repository.split('/');
  const comments = [];
  const seenIds = new Set();
  const seenCursors = new Set();
  let after = null;
  let pageCount = 0;
  while (true) {
    pageCount += 1;
    if (pageCount > MAX_ISSUE_COMMENT_PAGES) throw transportError('pagination');
    let response;
    try {
      response = await graphql({
        query: ISSUE_COMMENTS_QUERY,
        variables: { owner, name, issue, after },
      });
    } catch (error) {
      throw transportError('transport', error);
    }
    assertNoGraphqlErrors(response);
    const responseIssue = response?.data?.repository?.issue;
    if (
      responseIssue?.number !== issue ||
      responseIssue?.repository?.nameWithOwner !== repository
    ) {
      throw transportError('correlation');
    }
    const connection = responseIssue.comments;
    if (!Array.isArray(connection?.nodes)) throw transportError('partial-response');
    if (connection.nodes.length > ISSUE_COMMENT_PAGE_SIZE) throw transportError('pagination');
    if (typeof connection.pageInfo?.hasNextPage !== 'boolean') throw transportError('pagination');
    if (connection.pageInfo.hasNextPage && connection.nodes.length === 0) {
      throw transportError('pagination');
    }
    for (const comment of connection.nodes) {
      const normalized = normalizeCorrelatedCommentNode(comment, comment?.id, repository, issue);
      if (seenIds.has(normalized.id)) throw transportError('pagination');
      seenIds.add(normalized.id);
      comments.push(normalized);
    }
    if (!connection.pageInfo.hasNextPage) break;
    const nextCursor = connection.pageInfo.endCursor;
    if (!isOpaqueId(nextCursor) || seenCursors.has(nextCursor)) throw transportError('pagination');
    seenCursors.add(nextCursor);
    after = nextCursor;
  }
  return deepFreeze(comments);
}
