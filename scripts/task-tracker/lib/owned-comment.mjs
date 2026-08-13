// @story #1210
// Generic, marker-owned issue comments. This remains separate from the AITM
// record-envelope store, whose narrower contract is intentional.

import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';

const PAGE_SIZE = 100;
const MAX_PAGES = 1000;
const KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,127}$/;

const LIST_QUERY = `
  query AitmOwnedComments($owner: String!, $name: String!, $issue: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      issue(number: $issue) {
        id
        number
        repository { nameWithOwner }
        comments(first: 100, after: $after) {
          nodes { id body issue { number repository { nameWithOwner } } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;
const NODE_QUERY = `
  query AitmOwnedComment($id: ID!) {
    node(id: $id) {
      ... on IssueComment {
        id body issue { number repository { nameWithOwner } }
      }
    }
  }
`;
const CREATE_MUTATION = `
  mutation AitmCreateOwnedComment($subjectId: ID!, $body: String!) {
    addComment(input: { subjectId: $subjectId, body: $body }) {
      commentEdge { node { id } }
    }
  }
`;
const UPDATE_MUTATION = `
  mutation AitmUpdateOwnedComment($id: ID!, $body: String!) {
    updateIssueComment(input: { id: $id, body: $body }) { issueComment { id } }
  }
`;

function fail(category, cause) {
  const error = new Error(`owned-comment:${category}`, cause === undefined ? undefined : { cause });
  error.name = 'OwnedCommentError';
  throw error;
}

function assertGraphql(response) {
  if (Array.isArray(response?.errors) && response.errors.length > 0) fail('graphql');
}

function defaultGraphql({ query, variables }) {
  return gql(query, variables).then((data) => ({ data }));
}

export function ownedCommentMarker(key) {
  const normalized = String(key || '');
  if (!KEY_RE.test(normalized)) fail('key');
  return `<!-- aitm-owned-comment key="${normalized}" -->`;
}

function validateComment(comment, { repository, issue, expectedId } = {}) {
  const id = comment?.id;
  const body = comment?.body;
  const actualIssue = comment?.issue?.number ?? comment?.issue;
  const actualRepository = comment?.issue?.repository?.nameWithOwner ?? comment?.repository;
  if (typeof id !== 'string' || id === '' || typeof body !== 'string') fail('response-shape');
  if (expectedId && id !== expectedId) fail('node-mismatch');
  if (Number(actualIssue) !== Number(issue) || actualRepository !== repository) fail('correlation');
  return { id, body, repository, issue: Number(issue) };
}

export async function listIssueComments({ repository, issue, graphql = defaultGraphql } = {}) {
  const { owner, repoName: name } = splitRepo(repository || '');
  const number = Number(issue);
  if (!Number.isInteger(number) || number <= 0) fail('issue');
  const comments = [];
  const ids = new Set();
  const cursors = new Set();
  let issueId = null;
  let after = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let response;
    try {
      response = await graphql({
        query: LIST_QUERY,
        variables: { owner, name, issue: number, after },
      });
    } catch (error) {
      fail('transport', error);
    }
    assertGraphql(response);
    const found = response?.data?.repository?.issue;
    if (
      !found ||
      found.number !== number ||
      found.repository?.nameWithOwner !== repository ||
      typeof found.id !== 'string' ||
      found.id === ''
    ) {
      fail('correlation');
    }
    if (issueId !== null && issueId !== found.id) fail('correlation');
    issueId = found.id;
    const connection = found.comments;
    if (
      !Array.isArray(connection?.nodes) ||
      connection.nodes.length > PAGE_SIZE ||
      typeof connection.pageInfo?.hasNextPage !== 'boolean' ||
      (connection.pageInfo.hasNextPage && connection.nodes.length === 0)
    ) {
      fail('pagination');
    }
    for (const node of connection.nodes) {
      const comment = validateComment(node, { repository, issue: number });
      if (ids.has(comment.id)) fail('pagination');
      ids.add(comment.id);
      comments.push(comment);
    }
    if (!connection.pageInfo.hasNextPage) return { issueId, comments: Object.freeze(comments) };
    const cursor = connection.pageInfo.endCursor;
    if (typeof cursor !== 'string' || cursor === '' || cursors.has(cursor)) fail('pagination');
    cursors.add(cursor);
    after = cursor;
  }
  fail('pagination');
}

export async function readIssueComment({ id, repository, issue, graphql = defaultGraphql } = {}) {
  let response;
  try {
    response = await graphql({ query: NODE_QUERY, variables: { id } });
  } catch (error) {
    fail('transport', error);
  }
  assertGraphql(response);
  return validateComment(response?.data?.node, { repository, issue, expectedId: id });
}

async function createIssueComment({ issueId, body, graphql = defaultGraphql }) {
  const response = await graphql({
    query: CREATE_MUTATION,
    variables: { subjectId: issueId, body },
  });
  assertGraphql(response);
  const id = response?.data?.addComment?.commentEdge?.node?.id;
  if (typeof id !== 'string' || id === '') fail('write-response');
  return { id };
}

async function updateIssueComment({ id, body, graphql = defaultGraphql }) {
  const response = await graphql({ query: UPDATE_MUTATION, variables: { id, body } });
  assertGraphql(response);
  if (response?.data?.updateIssueComment?.issueComment?.id !== id) fail('write-response');
  return { id };
}

function renderOwnedBody(body, key) {
  const source = String(body ?? '');
  if (source.trim() === '') fail('body');
  if (/<!--\s*aitm-owned-comment\b/i.test(source)) {
    fail('body must not contain an aitm-owned-comment marker');
  }
  return `${source.replace(/\n+$/, '')}\n\n${ownedCommentMarker(key)}`;
}

function matchingComments(comments, marker) {
  return comments.filter((comment) => comment.body.includes(marker));
}

async function verify({ id, expectedBody, repository, issue, readComment }) {
  const actual = await readComment({ id, repository, issue });
  const normalized = validateComment(actual, { repository, issue, expectedId: id });
  if (normalized.body !== expectedBody) fail('read-back mismatch');
  return normalized;
}

function validateListedComments(listed, { repository, issue }) {
  if (!listed || typeof listed.issueId !== 'string' || !Array.isArray(listed.comments)) {
    fail('list-response');
  }
  const ids = new Set();
  const comments = listed.comments.map((comment) => {
    const normalized = validateComment(comment, { repository, issue });
    if (ids.has(normalized.id)) fail('duplicate comment id');
    ids.add(normalized.id);
    return normalized;
  });
  return { issueId: listed.issueId, comments };
}

async function verifyUniqueOwnership({
  repository,
  issue,
  marker,
  id,
  expectedBody,
  listComments,
}) {
  const listed = validateListedComments(await listComments({ repository, issue }), {
    repository,
    issue,
  });
  const matches = matchingComments(listed.comments, marker);
  if (matches.length !== 1 || matches[0].id !== id || matches[0].body !== expectedBody) {
    fail('ownership read-back mismatch');
  }
}

export async function upsertOwnedComment({ repository, issue, key, body, deps = {} } = {}) {
  const marker = ownedCommentMarker(key);
  const expectedBody = renderOwnedBody(body, key);
  const graphql = deps.graphql || defaultGraphql;
  const listComments = deps.listComments || ((input) => listIssueComments({ ...input, graphql }));
  const readComment = deps.readComment || ((input) => readIssueComment({ ...input, graphql }));
  const createComment =
    deps.createComment || ((input) => createIssueComment({ ...input, graphql }));
  const updateComment =
    deps.updateComment || ((input) => updateIssueComment({ ...input, graphql }));

  const listed = validateListedComments(await listComments({ repository, issue }), {
    repository,
    issue,
  });
  const matches = matchingComments(listed.comments, marker);
  if (matches.length > 1) fail('duplicate ownership marker');
  if (matches.length === 1 && matches[0].body === expectedBody) {
    return { status: 'no-op', id: matches[0].id, body: expectedBody };
  }

  if (matches.length === 0) {
    let created;
    try {
      created = await createComment({
        issueId: listed.issueId,
        repository,
        issue,
        body: expectedBody,
      });
    } catch (error) {
      let recovery;
      try {
        recovery = await listComments({ repository, issue });
      } catch {
        fail('create outcome is unverified', error);
      }
      const recovered = matchingComments(recovery?.comments || [], marker);
      if (recovered.length !== 1 || recovered[0].body !== expectedBody) {
        fail('create outcome is unverified', error);
      }
      const verified = await verify({
        id: recovered[0].id,
        expectedBody,
        repository,
        issue,
        readComment,
      });
      await verifyUniqueOwnership({
        repository,
        issue,
        marker,
        id: verified.id,
        expectedBody,
        listComments,
      });
      return { status: 'created-recovered', ...verified };
    }
    const verified = await verify({
      id: created?.id,
      expectedBody,
      repository,
      issue,
      readComment,
    });
    await verifyUniqueOwnership({
      repository,
      issue,
      marker,
      id: verified.id,
      expectedBody,
      listComments,
    });
    return { status: 'created', ...verified };
  }

  const existing = validateComment(matches[0], { repository, issue });
  try {
    await updateComment({ id: existing.id, repository, issue, body: expectedBody });
  } catch (error) {
    try {
      const recovered = await verify({
        id: existing.id,
        expectedBody,
        repository,
        issue,
        readComment,
      });
      await verifyUniqueOwnership({
        repository,
        issue,
        marker,
        id: recovered.id,
        expectedBody,
        listComments,
      });
      return { status: 'updated-recovered', ...recovered };
    } catch {
      fail('update outcome is unverified', error);
    }
  }
  const verified = await verify({
    id: existing.id,
    expectedBody,
    repository,
    issue,
    readComment,
  });
  await verifyUniqueOwnership({
    repository,
    issue,
    marker,
    id: verified.id,
    expectedBody,
    listComments,
  });
  return { status: 'updated', ...verified };
}
