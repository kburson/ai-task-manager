// @story #1626
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { gql } from '../../gh/lib/github-projects.mjs';
import {
  createIssueComment,
  listIssueCommentsSince,
} from '../lib/github-records/github-comment-store.mjs';
import { createRecordId } from '../lib/github-records/record-envelope.mjs';
import {
  createCodexSessionSourceLoader,
  resolveWorkflowExceptionAuthority,
  validateAuthorizationSource,
} from '../lib/workflow-policy/authority-resolver.mjs';
import {
  executeWorkflowExceptionWrite,
  inspectWorkflowException,
} from '../lib/workflow-policy/exception-store.mjs';
import { computeScopeIdentity } from '../lib/workflow-policy/scope-identity.mjs';
import { validateConstraints, validateWaiverIds } from '../lib/workflow-policy/catalog.mjs';
import { aiAppName, currentSessionId, jsonlPath } from '../word-counter.mjs';

const pexec = promisify(execFile);
const ACTIONS = new Set(['record', 'show', 'revise', 'revoke']);
const REQUEST_KEYS = [
  'authorizationSource',
  'constraints',
  'exceptionId',
  'expiresAt',
  'reason',
  'requirementIds',
  'schema',
];
const REVOCATION_KEYS = ['authorizationSource', 'exceptionId', 'reason', 'schema'];

function fail(category) {
  throw new TypeError(`workflow-exception:${category}`);
}

function requestFail(category) {
  throw new TypeError(`workflow-exception-request:${category}`);
}

function exact(value, keys, category) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) requestFail(category);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    requestFail(category);
  }
}

function nonempty(value, category) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    requestFail(category);
  }
}

export function parseWorkflowExceptionArgs(argv = []) {
  const args = [...argv];
  const action = args.shift();
  if (!ACTIONS.has(action)) fail('usage');
  const issues = [];
  let inputFile = null;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      json = true;
      continue;
    }
    if (token === '--input-file') {
      if (inputFile !== null || typeof args[index + 1] !== 'string') fail('usage');
      inputFile = args[++index];
      continue;
    }
    const match = String(token).match(/^#?(\d+)$/);
    if (!match) fail('usage');
    issues.push(Number(match[1]));
  }
  if (issues.length === 0 || new Set(issues).size !== issues.length) fail('usage');
  if ((action === 'show') !== (inputFile === null)) fail('usage');
  return Object.freeze({ action, issues: Object.freeze(issues), inputFile, json });
}

export function parseWorkflowExceptionRequest(input, { action } = {}) {
  let value;
  try {
    value = typeof input === 'string' ? JSON.parse(input) : structuredClone(input);
  } catch {
    requestFail('json');
  }
  if (action === 'revoke') {
    exact(value, REVOCATION_KEYS, 'keys');
    if (value.schema !== 'aitm.workflow-exception-revocation/v1') requestFail('schema');
  } else if (action === 'record' || action === 'revise') {
    exact(value, REQUEST_KEYS, 'keys');
    if (value.schema !== 'aitm.workflow-exception-request/v1') requestFail('schema');
    try {
      validateWaiverIds(value.requirementIds);
      validateConstraints(value.constraints);
    } catch (error) {
      requestFail(error.message.replace(/^workflow-policy:/, 'policy-'));
    }
    if (value.requirementIds.length === 0 && value.constraints.length === 0) {
      requestFail('empty-policy');
    }
    if (
      value.expiresAt !== null &&
      (typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)))
    ) {
      requestFail('expires-at');
    }
  } else {
    requestFail('action');
  }
  nonempty(value.exceptionId, 'exception-id');
  nonempty(value.reason, 'reason');
  try {
    validateAuthorizationSource(value.authorizationSource);
  } catch {
    requestFail('authorization-source');
  }
  return Object.freeze(value);
}

function normalizeStored(record) {
  return Object.freeze({
    commentNodeId: record.commentNodeId,
    envelope: record.envelope,
    body: record.body,
    authorLogin: record.authorLogin,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function parseGhJson(stdout) {
  return JSON.parse(String(stdout).trim());
}

export function createWorkflowExceptionRuntime(ctx, deps = {}) {
  const run = deps.run ?? pexec;
  const repository = ctx.cfg.repo;
  const graphql = ({ query, variables }) => gql(query, variables).then((data) => ({ data }));
  const sessionId = currentSessionId();
  const transcriptPath = jsonlPath(sessionId);
  const loadSource = createCodexSessionSourceLoader({
    transcriptPath,
    expectedSessionId: sessionId,
  });
  return Object.freeze({
    async fetchIssue(issue) {
      const { stdout } = await run('gh', [
        'issue',
        'view',
        String(issue),
        '-R',
        repository,
        '--json',
        'number,body',
      ]);
      return parseGhJson(stdout);
    },
    async resolveAuthority({ source }) {
      return resolveWorkflowExceptionAuthority({
        source,
        recordingActor: `${aiAppName()}/session:${sessionId}`,
        loadSource,
      });
    },
    async listRecords(issue) {
      return (
        await listIssueCommentsSince({
          repository,
          issue,
          since: '1970-01-01T00:00:00.000Z',
          graphql,
        })
      ).map(normalizeStored);
    },
    async appendRecord({ issue, body }) {
      const stored = await createIssueComment({
        repository,
        issue,
        body,
        graphql,
        rest: {
          async createIssueComment({
            repository: targetRepo,
            issue: targetIssue,
            body: targetBody,
          }) {
            const { stdout } = await run('gh', [
              'api',
              `repos/${targetRepo}/issues/${targetIssue}/comments`,
              '--method',
              'POST',
              '-f',
              `body=${targetBody}`,
            ]);
            return { node_id: parseGhJson(stdout).node_id };
          },
        },
      });
      return normalizeStored(stored);
    },
    nextIds() {
      return { recordId: createRecordId(), grantId: createRecordId() };
    },
  });
}

function topStatus(action, results) {
  const failed = results.filter((result) =>
    ['blocked', 'indeterminate', 'invalid'].includes(result.status)
  ).length;
  if (failed === results.length) return 'blocked';
  if (failed > 0) return 'partial';
  return { record: 'recorded', revise: 'revised', revoke: 'revoked', show: 'shown' }[action];
}

export async function runWorkflowException({
  action,
  issues,
  request = null,
  repository,
  now = new Date().toISOString(),
  runtime,
} = {}) {
  if (!ACTIONS.has(action) || !Array.isArray(issues) || issues.length === 0 || !runtime) {
    fail('input');
  }
  const results = [];
  for (const issue of issues) {
    try {
      const snapshot = await runtime.fetchIssue(issue);
      if (snapshot?.number !== issue || typeof snapshot.body !== 'string') fail('issue-read');
      const scopeIdentity = computeScopeIdentity({ repository, issue, body: snapshot.body });
      if (action === 'show') {
        const inspected = await inspectWorkflowException({
          repository,
          issue,
          scopeIdentity,
          now,
          runtime,
        });
        results.push(
          Object.freeze({
            issue,
            status: inspected.status,
            recordId: inspected.head?.recordId ?? null,
            revision: inspected.head?.revision ?? null,
            history: inspected.history,
            conflicts: inspected.conflicts,
          })
        );
        continue;
      }
      const authority = await runtime.resolveAuthority({
        issue,
        source: request.authorizationSource,
      });
      if (authority?.status !== 'verified') {
        results.push(Object.freeze({ issue, ...authority }));
        continue;
      }
      results.push(
        await executeWorkflowExceptionWrite({
          action,
          repository,
          issue,
          scopeIdentity,
          request,
          authority: authority.authority,
          now,
          runtime,
        })
      );
    } catch (error) {
      results.push(
        Object.freeze({
          issue,
          status: 'indeterminate',
          code: error?.message ?? 'workflow-exception:unknown',
        })
      );
    }
  }
  return Object.freeze({
    schema: 'aitm.workflow-exception-result/v1',
    action,
    status: topStatus(action, results),
    results: Object.freeze(results),
  });
}

export function formatWorkflowExceptionResult(result, { json = false } = {}) {
  if (json) return JSON.stringify(result, null, 2);
  return [
    `workflow-exception: ${result.status}`,
    ...result.results.map(
      (item) =>
        `#${item.issue}: ${item.status}` +
        (item.revision === null || item.revision === undefined
          ? ''
          : ` revision=${item.revision}`) +
        (item.recordId ? ` record=${item.recordId}` : '') +
        (item.code ? ` code=${item.code}` : '')
    ),
  ].join('\n');
}

export async function verbWorkflowException(ctx) {
  let parsed;
  try {
    parsed = parseWorkflowExceptionArgs(ctx.rest);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(
      'Usage: /task workflow-exception <record|show|revise|revoke> #N [#M ...] ' +
        '[--input-file <request.json>] [--json]\n'
    );
    process.exitCode = 2;
    return;
  }
  let request = null;
  if (parsed.inputFile !== null) {
    request = parseWorkflowExceptionRequest(await readFile(parsed.inputFile, 'utf8'), {
      action: parsed.action,
    });
  }
  const runtime = createWorkflowExceptionRuntime(ctx);
  const result = await runWorkflowException({
    action: parsed.action,
    issues: parsed.issues,
    request,
    repository: ctx.cfg.repo,
    runtime,
  });
  process.stdout.write(`${formatWorkflowExceptionResult(result, { json: parsed.json })}\n`);
  if (['blocked', 'partial'].includes(result.status)) process.exitCode = 6;
}
