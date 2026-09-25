// @story #1734

import { isDeepStrictEqual } from 'node:util';

import {
  listCorrelatedCommentNodes,
  readCorrelatedCommentNode,
} from '../github-records/comment-transport.mjs';
import { parseCostRecord, renderCostRecord } from './record-codec.mjs';

const COST_CLAIM_RE = /<!--\s*aitm-cost-record/i;

function storeError(category, cause) {
  return new TypeError(
    `cost-comment-store:${category}`,
    cause === undefined ? undefined : { cause }
  );
}

function diagnostic(code, commentNodeId = null) {
  return Object.freeze({ code, commentNodeId });
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

function isCostClaim(body) {
  return typeof body === 'string' && COST_CLAIM_RE.test(body);
}

export async function listCostRecords({ repository, issue, graphql } = {}) {
  assertContext({ repository, issue, graphql });
  let nodes;
  try {
    nodes = await listCorrelatedCommentNodes({ repository, issue, graphql });
  } catch {
    return Object.freeze({
      records: Object.freeze([]),
      diagnostics: Object.freeze([diagnostic('enumeration-unavailable')]),
      enumerationStatus: 'unavailable',
    });
  }

  const records = [];
  const diagnostics = [];
  for (const node of nodes) {
    if (!isCostClaim(node.body)) continue;
    try {
      records.push(
        Object.freeze({
          ...parseCostRecord({
            commentNodeId: node.id,
            body: node.body,
            expectedRepository: repository,
            expectedIssue: issue,
          }),
          body: node.body,
          authorLogin: node.authorLogin,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
        })
      );
    } catch {
      diagnostics.push(diagnostic('invalid-cost-record', node.id));
    }
  }

  return Object.freeze({
    records: Object.freeze(records),
    diagnostics: Object.freeze(diagnostics),
    enumerationStatus: 'available',
  });
}

export async function appendFrozenCostRecord({ frozen, authority, ports } = {}) {
  const envelope = frozen?.envelope ?? frozen;
  const visibleMarkdown = frozen?.visibleMarkdown ?? '';
  const repository = ports?.repository ?? envelope?.repository;
  const issue = ports?.issue ?? envelope?.issue;
  const graphql = ports?.graphql;
  const rest = ports?.rest;
  assertContext({ repository, issue, graphql });
  if (authority !== undefined && authority !== envelope?.authority) {
    if (!isDeepStrictEqual(authority, envelope?.authority)) throw storeError('authority');
  }
  if (typeof rest?.createIssueComment !== 'function') throw storeError('input');

  const body = renderCostRecord({ envelope, visibleMarkdown });
  let response;
  try {
    response = await rest.createIssueComment({ repository, issue, body });
  } catch (error) {
    throw storeError('transport', error);
  }
  if (typeof response?.node_id !== 'string' || response.node_id.trim() === '') {
    throw storeError('write-response');
  }
  let node;
  try {
    node = await readCorrelatedCommentNode({
      repository,
      issue,
      commentNodeId: response.node_id,
      graphql,
    });
  } catch (error) {
    throw storeError('readback', error);
  }
  const parsed = parseCostRecord({
    commentNodeId: node.id,
    body: node.body,
    expectedRepository: repository,
    expectedIssue: issue,
  });
  if (node.body !== body || !isDeepStrictEqual(parsed.envelope, envelope)) {
    throw storeError('readback-mismatch');
  }
  return Object.freeze({ body, recordId: envelope.recordId, commentNodeId: node.id });
}
