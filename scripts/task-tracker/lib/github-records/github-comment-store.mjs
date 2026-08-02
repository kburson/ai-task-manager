import { isDeepStrictEqual } from 'node:util';

import { parseAitmRecord } from './record-envelope.mjs';

const COMMENTS_BY_NODE_IDS_QUERY = `
  query AitmCommentsByNodeIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on IssueComment {
        id
        body
        updatedAt
        issue {
          number
          repository { nameWithOwner }
        }
      }
    }
  }
`;
const ISSUE_COMMENTS_QUERY = `
  query AitmIssueComments($owner: String!, $name: String!, $issue: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      issue(number: $issue) {
        number
        repository { nameWithOwner }
        comments(first: 100, after: $after) {
          nodes {
            __typename
            ... on IssueComment {
              id
              body
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
const UPDATE_ISSUE_COMMENT_MUTATION = `
  mutation AitmUpdateIssueComment($id: ID!, $body: String!) {
    updateIssueComment(input: { id: $id, body: $body }) {
      issueComment { id }
    }
  }
`;
const MAX_ISSUE_COMMENT_PAGES = 1000;

export class GitHubCommentStoreError extends Error {
  constructor(category) {
    super(`github-comment-store:${category}`);
    this.name = 'GitHubCommentStoreError';
    this.category = category;
  }
}

function storeError(category) {
  return new GitHubCommentStoreError(category);
}

function assertNoGraphqlErrors(response) {
  if (
    Object.hasOwn(response ?? {}, 'errors') &&
    (!Array.isArray(response.errors) || response.errors.length > 0)
  ) {
    throw storeError('partial-response');
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

function isCanonicalInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function normalizeGitHubInstant(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (match === null) return null;
  const canonical = `${match[1]}.${(match[2] ?? '').padEnd(3, '0')}Z`;
  const timestamp = Date.parse(canonical);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === canonical
    ? canonical
    : null;
}

function assertContext({ repository, issue, graphql }) {
  if (
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !Number.isInteger(issue) ||
    issue <= 0 ||
    typeof graphql !== 'function'
  ) {
    throw storeError('input');
  }
}

function assertReadInput({ ids, ...context }) {
  assertContext(context);
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 100 ||
    ids.some((id) => !isOpaqueId(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw storeError('input');
  }
}

function validateCommentNode(node, expectedId, repository, issue) {
  if (node === null) throw storeError('missing-node');
  if (node?.__typename !== 'IssueComment') throw storeError('wrong-type');
  if (!isOpaqueId(node.id) || node.id !== expectedId) throw storeError('node-mismatch');
  if (node.issue?.number !== issue || node.issue?.repository?.nameWithOwner !== repository) {
    throw storeError('correlation');
  }
  if (typeof node.body !== 'string') throw storeError('response-shape');
  const updatedAt = normalizeGitHubInstant(node.updatedAt);
  if (updatedAt === null) throw storeError('response-shape');
  return updatedAt;
}

function claimsAitmRecord(body) {
  return typeof body === 'string' && /<!--\s*aitm-record/i.test(body);
}

function parseComment(node, expectedId, repository, issue) {
  const updatedAt = validateCommentNode(node, expectedId, repository, issue);
  try {
    return Object.freeze({
      ...parseAitmRecord({
        commentNodeId: node.id,
        body: node.body,
        expectedRepository: repository,
        expectedIssue: issue,
      }),
      body: node.body,
      updatedAt,
    });
  } catch {
    throw storeError('envelope');
  }
}

function parseExpectedBody(body, repository, issue) {
  try {
    return parseAitmRecord({
      commentNodeId: 'pending-write-readback',
      body,
      expectedRepository: repository,
      expectedIssue: issue,
    }).envelope;
  } catch {
    throw storeError('envelope');
  }
}

async function verifyWriteReadBack({
  commentNodeId,
  expectedBody,
  expectedEnvelope,
  repository,
  issue,
  graphql,
}) {
  const actual = await readBackComment({ commentNodeId, repository, issue, graphql });
  if (actual.body !== expectedBody || !isDeepStrictEqual(actual.envelope, expectedEnvelope)) {
    throw storeError('readback-mismatch');
  }
  return actual;
}

export async function getCommentsByNodeIds(input = {}) {
  assertReadInput(input);
  const { ids, repository, issue, graphql } = input;
  let response;
  try {
    response = await graphql({
      query: COMMENTS_BY_NODE_IDS_QUERY,
      variables: { ids: [...ids] },
    });
  } catch {
    throw storeError('transport');
  }
  assertNoGraphqlErrors(response);
  if (!Array.isArray(response?.data?.nodes)) throw storeError('partial-response');
  if (response.data.nodes.length !== ids.length) throw storeError('missing-node');
  return Object.freeze(
    response.data.nodes.map((node, index) => parseComment(node, ids[index], repository, issue))
  );
}

export async function readBackComment({ commentNodeId, ...context } = {}) {
  const [comment] = await getCommentsByNodeIds({ ids: [commentNodeId], ...context });
  return comment;
}

export async function createIssueComment(input = {}) {
  const { repository, issue, body, rest, graphql } = input;
  assertContext(input);
  if (
    typeof body !== 'string' ||
    body.length === 0 ||
    typeof rest?.createIssueComment !== 'function'
  ) {
    throw storeError('input');
  }
  const expectedEnvelope = parseExpectedBody(body, repository, issue);
  let response;
  try {
    response = await rest.createIssueComment({ repository, issue, body });
  } catch {
    throw storeError('transport');
  }
  if (!isOpaqueId(response?.node_id)) throw storeError('write-response');
  return verifyWriteReadBack({
    commentNodeId: response.node_id,
    expectedBody: body,
    expectedEnvelope,
    repository,
    issue,
    graphql,
  });
}

export async function updateIssueComment(input = {}) {
  const { commentNodeId, repository, issue, body, graphql } = input;
  assertContext(input);
  if (!isOpaqueId(commentNodeId) || typeof body !== 'string' || body.length === 0) {
    throw storeError('input');
  }
  const expectedEnvelope = parseExpectedBody(body, repository, issue);
  await readBackComment({ commentNodeId, repository, issue, graphql });
  let response;
  try {
    response = await graphql({
      query: UPDATE_ISSUE_COMMENT_MUTATION,
      variables: { id: commentNodeId, body },
    });
  } catch {
    throw storeError('transport');
  }
  assertNoGraphqlErrors(response);
  if (response?.data?.updateIssueComment?.issueComment?.id !== commentNodeId) {
    throw storeError('write-response');
  }
  return verifyWriteReadBack({
    commentNodeId,
    expectedBody: body,
    expectedEnvelope,
    repository,
    issue,
    graphql,
  });
}

export async function listIssueCommentsSince(input = {}) {
  const { since, repository, issue, graphql } = input;
  assertContext(input);
  if (!isCanonicalInstant(since)) throw storeError('input');
  const [owner, name] = repository.split('/');
  const comments = [];
  const seenIds = new Set();
  const seenCursors = new Set();
  let after = null;
  let pageCount = 0;
  while (true) {
    pageCount += 1;
    if (pageCount > MAX_ISSUE_COMMENT_PAGES) throw storeError('pagination');
    let response;
    try {
      response = await graphql({
        query: ISSUE_COMMENTS_QUERY,
        variables: { owner, name, issue, after },
      });
    } catch {
      throw storeError('transport');
    }
    assertNoGraphqlErrors(response);
    const responseIssue = response?.data?.repository?.issue;
    if (
      responseIssue?.number !== issue ||
      responseIssue?.repository?.nameWithOwner !== repository
    ) {
      throw storeError('correlation');
    }
    const connection = responseIssue.comments;
    if (!Array.isArray(connection?.nodes)) throw storeError('partial-response');
    if (typeof connection.pageInfo?.hasNextPage !== 'boolean') throw storeError('pagination');
    if (connection.pageInfo.hasNextPage && connection.nodes.length === 0) {
      throw storeError('pagination');
    }
    for (const comment of connection.nodes) {
      validateCommentNode(comment, comment?.id, repository, issue);
      if (seenIds.has(comment.id)) throw storeError('pagination');
      seenIds.add(comment.id);
      if (!claimsAitmRecord(comment.body)) continue;
      const parsed = parseComment(comment, comment?.id, repository, issue);
      comments.push(parsed);
    }
    if (!connection.pageInfo.hasNextPage) break;
    const nextCursor = connection.pageInfo.endCursor;
    if (!isOpaqueId(nextCursor) || seenCursors.has(nextCursor)) throw storeError('pagination');
    seenCursors.add(nextCursor);
    after = nextCursor;
  }
  return Object.freeze(comments.filter((comment) => comment.updatedAt > since));
}
