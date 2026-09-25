import { isDeepStrictEqual } from 'node:util';

import {
  getCorrelatedCommentNodesByIds,
  listCorrelatedCommentNodes,
  normalizeCorrelatedCommentNode,
  readCorrelatedCommentNode,
} from './comment-transport.mjs';
import { parseAitmRecord } from './record-envelope.mjs';

const UPDATE_ISSUE_COMMENT_MUTATION = `
  mutation AitmUpdateIssueComment($id: ID!, $body: String!) {
    updateIssueComment(input: { id: $id, body: $body }) {
      issueComment { id }
    }
  }
`;

export class GitHubCommentStoreError extends Error {
  constructor(category, options) {
    super(`github-comment-store:${category}`, options);
    this.name = 'GitHubCommentStoreError';
    this.category = category;
  }
}

function storeError(category, cause) {
  return new GitHubCommentStoreError(category, cause === undefined ? undefined : { cause });
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

export { normalizeGitHubInstant } from './comment-transport.mjs';

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
  try {
    const normalized = normalizeCorrelatedCommentNode(node, expectedId, repository, issue);
    return Object.freeze({
      authorLogin: normalized.authorLogin,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
    });
  } catch (error) {
    throw storeError(error.category ?? 'response-shape', error.cause);
  }
}

function claimsAitmRecord(body) {
  return typeof body === 'string' && /<!--\s*aitm-record/i.test(body);
}

function parseComment(node, expectedId, repository, issue) {
  const provenance = validateCommentNode(node, expectedId, repository, issue);
  try {
    return Object.freeze({
      ...parseAitmRecord({
        commentNodeId: node.id,
        body: node.body,
        expectedRepository: repository,
        expectedIssue: issue,
      }),
      body: node.body,
      ...provenance,
    });
  } catch {
    throw storeError('envelope');
  }
}

function parseTransportComment(node, repository, issue) {
  try {
    return Object.freeze({
      ...parseAitmRecord({
        commentNodeId: node.id,
        body: node.body,
        expectedRepository: repository,
        expectedIssue: issue,
      }),
      body: node.body,
      authorLogin: node.authorLogin,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    });
  } catch {
    throw storeError('envelope');
  }
}

function remapTransportError(error) {
  if (error?.name === 'GitHubCommentTransportError') {
    throw storeError(error.category, error.cause);
  }
  throw error;
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

export function parsePreloadedIssueComments({ nodes, repository, issue } = {}) {
  if (
    !Array.isArray(nodes) ||
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !Number.isInteger(issue) ||
    issue <= 0
  ) {
    throw storeError('input');
  }
  const seen = new Set();
  const records = [];
  for (const node of nodes) {
    validateCommentNode(node, node?.id, repository, issue);
    if (seen.has(node.id)) throw storeError('node-mismatch');
    seen.add(node.id);
    if (!claimsAitmRecord(node.body)) continue;
    records.push(parseComment(node, node.id, repository, issue));
  }
  return Object.freeze(records);
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
  let nodes;
  try {
    nodes = await getCorrelatedCommentNodesByIds({ ids, repository, issue, graphql });
  } catch (error) {
    remapTransportError(error);
  }
  return Object.freeze(nodes.map((node) => parseTransportComment(node, repository, issue)));
}

export async function readBackComment({ commentNodeId, ...context } = {}) {
  assertContext(context);
  if (!isOpaqueId(commentNodeId)) throw storeError('input');
  let node;
  try {
    node = await readCorrelatedCommentNode({ commentNodeId, ...context });
  } catch (error) {
    remapTransportError(error);
  }
  return parseTransportComment(node, context.repository, context.issue);
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
  } catch (error) {
    throw storeError('transport', error);
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
  } catch (error) {
    throw storeError('transport', error);
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
  let nodes;
  try {
    nodes = await listCorrelatedCommentNodes({ repository, issue, graphql });
  } catch (error) {
    remapTransportError(error);
  }
  const comments = [];
  for (const node of nodes) {
    if (!claimsAitmRecord(node.body)) continue;
    comments.push(parseTransportComment(node, repository, issue));
  }
  return Object.freeze(comments.filter((comment) => comment.updatedAt > since));
}
