// @story #1626 #1787 #1795 #1824
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { promisify } from 'node:util';

import { gql } from '../../gh/lib/github-projects.mjs';
import { createDefaultDeliverDeps } from './deliver.mjs';
import {
  parseDeliveryCommentForPullRequest,
  projectDeliveryRecords,
} from '../lib/delivery-records.mjs';
import { resolveCurrentIssueWorktreeBranch } from '../lib/issue-worktree-location.mjs';
import {
  canonicalVerificationCommandSet,
  parseValidatedVerificationReceipts,
  requiredTestReceiptClassifications,
  validateVerificationReceipt,
} from '../lib/verification-receipt.mjs';
import { parseReviewApprovedMarker } from '../lib/markers.mjs';
import { parseVerificationCommands } from '../lib/verification-commands.mjs';
import { isAgentReviewComplete } from '../lib/agent-review/review-gate.mjs';
import {
  createIssueComment,
  listIssueCommentsSince,
} from '../lib/github-records/github-comment-store.mjs';
import { createRecordId } from '../lib/github-records/record-envelope.mjs';
import { normalizeGitHubInstant } from '../lib/github-records/github-comment-store.mjs';
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
import { buildDeliveryScope } from '../lib/workflow-policy/delivery-scope.mjs';
import { resolveDeliveryExceptionChain } from '../lib/workflow-policy/exception-record.mjs';
import {
  parseDeliveryWaiverProposal,
  parseDeliveryWaiverRequest,
  prepareDeliveryWaiver,
} from '../lib/workflow-policy/delivery-request.mjs';
import { validateConstraints, validateWaiverIds } from '../lib/workflow-policy/catalog.mjs';
import { aiAppName, currentSessionId, jsonlPath } from '../word-counter.mjs';

const pexec = promisify(execFile);
const ACTIONS = new Set(['prepare', 'record', 'show', 'revise', 'revoke']);
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
  if (action === 'prepare' && issues.length !== 1) fail('usage');
  return Object.freeze({ action, issues: Object.freeze(issues), inputFile, json });
}

export function parseWorkflowExceptionRequest(input, { action } = {}) {
  let value;
  try {
    value = typeof input === 'string' ? JSON.parse(input) : structuredClone(input);
  } catch {
    requestFail('json');
  }
  if (
    value?.schema === 'aitm.workflow-exception-request/v2' ||
    value?.schema === 'aitm.workflow-exception-revocation/v2'
  ) {
    return parseDeliveryWaiverRequest(value, { action });
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
  const deliver = deps.deliver ?? createDefaultDeliverDeps(ctx);
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
    resolveTranscriptPath(sourceSessionId) {
      return jsonlPath(sourceSessionId);
    },
    async fetchDeliveryFacts({ issue, action, input, now }) {
      if (aiAppName() !== 'codex' || !existsSync(transcriptPath)) {
        fail('unsupported-authorization-host');
      }
      const snapshot = await this.fetchIssue(issue);
      if (snapshot?.number !== issue || typeof snapshot.body !== 'string') fail('issue-read');
      const scopeIdentity = computeScopeIdentity({ repository, issue, body: snapshot.body });
      const existing = await this.listRecords(issue);
      let prior = null;
      if (action === 'revise' || action === 'revoke') {
        const matches = existing.filter(
          ({ envelope }) => envelope?.recordId === input.priorRecordId
        );
        if (matches.length !== 1) fail('delivery-prior');
        const envelope = matches[0].envelope;
        const payload = envelope.payload;
        if (payload.scopeKind !== 'delivery' || payload.revision !== input.priorRevision) {
          fail('delivery-prior');
        }
        const partitionKey = buildDeliveryScope(payload.deliveryScope).partitionKey;
        const chain = resolveDeliveryExceptionChain({
          records: existing,
          partitionKey,
          repository,
          issue,
          scopeIdentity: payload.scopeIdentity,
          now,
        });
        if (chain.head?.recordId !== envelope.recordId || chain.status === 'invalid') {
          fail('delivery-prior');
        }
        prior = {
          recordId: envelope.recordId,
          revision: payload.revision,
          exceptionId: payload.exceptionId,
          deliveryScope: payload.deliveryScope,
          waiverScopeDigest: payload.waiverScopeDigest,
          status: payload.status,
        };
      }
      if (
        input.schema === 'aitm.local-trunk-close-proposal/v1' ||
        prior?.deliveryScope?.exceptionKind === 'delivery.local-trunk-close-authorization'
      ) {
        const branch = resolveCurrentIssueWorktreeBranch(snapshot.body);
        if (!branch) fail('delivery-branch');
        if (action !== 'revoke') {
          const { stdout } = await run('gh', [
            'pr',
            'list',
            '-R',
            repository,
            '--head',
            branch,
            '--state',
            'all',
            '--limit',
            '1000',
            '--json',
            'number',
          ]);
          const prs = parseGhJson(stdout);
          if (!Array.isArray(prs) || prs.length !== 0) fail('local-trunk-pr-ambiguity');
        }
        const testSha =
          action === 'revoke'
            ? prior.deliveryScope.acceptedHeadSha
            : resolveLocalTrunkAcceptedSha({
                body: snapshot.body,
                issue,
                projectDir: ctx.projectDir,
              });
        const trunkRef = ctx.cfg.trunkRef;
        if (typeof trunkRef !== 'string' || !trunkRef) fail('local-trunk-ref');
        return {
          repository,
          issue,
          scopeIdentity,
          pullRequest: null,
          acceptedHeadSha: testSha,
          baseRef: trunkRef.split('/').at(-1),
          resolvedTrunkRef: trunkRef,
          originalIntentRecordId: null,
          existingDeliveryRecords: existing,
          prior,
          now,
        };
      }
      let prNumber;
      if (action === 'revoke') {
        prNumber = prior.deliveryScope.pullRequest;
      } else {
        const branch = resolveCurrentIssueWorktreeBranch(snapshot.body);
        if (!branch) fail('delivery-branch');
        const { stdout } = await run('gh', [
          'pr',
          'list',
          '-R',
          repository,
          '--head',
          branch,
          '--state',
          'all',
          '--json',
          'number',
        ]);
        const prs = parseGhJson(stdout);
        if (!Array.isArray(prs) || prs.length !== 1) fail('delivery-pr-ambiguity');
        prNumber = prs[0].number;
      }
      const pr = await deliver.fetchPullRequest({ prNumber });
      if (pr?.number !== prNumber || typeof pr.headRefOid !== 'string') fail('delivery-pr-read');
      const comments = await deliver.listIssueComments({ issueNumber: issue });
      const parsed = comments
        .map(({ id, body, createdAt }) =>
          parseDeliveryCommentForPullRequest(
            { id, body, createdAt: normalizeGitHubInstant(createdAt) },
            { repository, issueNumber: issue, prNumber }
          )
        )
        .filter(Boolean);
      const projected = projectDeliveryRecords(parsed);
      const originalIntent = projected.liveIntent?.record;
      if (
        !originalIntent ||
        originalIntent.prNumber !== prNumber ||
        (action !== 'revoke' && originalIntent.expectedHeadSha !== pr.headRefOid)
      ) {
        fail('delivery-original-intent');
      }
      return {
        repository,
        issue,
        scopeIdentity,
        pullRequest: prNumber,
        acceptedHeadSha: pr.headRefOid,
        baseRef: pr.baseRefName,
        resolvedTrunkRef: ctx.cfg.trunkRef,
        originalIntentRecordId: originalIntent.intentId,
        existingDeliveryRecords: existing,
        prior,
        now,
      };
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
  return {
    prepare: 'prepared',
    record: 'recorded',
    revise: 'revised',
    revoke: 'revoked',
    show: 'shown',
  }[action];
}

function proposalFromRequest(request) {
  return {
    schema:
      request.deliveryScope.exceptionKind === 'delivery.local-trunk-close-authorization'
        ? 'aitm.local-trunk-close-proposal/v1'
        : 'aitm.delivery-waiver-proposal/v1',
    action: request.action,
    exceptionId: request.exceptionId,
    priorRecordId: request.priorRecordId,
    priorRevision: request.priorRevision,
    requirementId: request.deliveryScope.requirementId,
    reason: request.reason,
    expiresAt: request.expiresAt,
    deliveryOperationId: request.deliveryScope.deliveryOperationId,
  };
}

async function deriveDeliveryPreparation({ runtime, repository, issue, input, now }) {
  const facts = await runtime.fetchDeliveryFacts({ issue, action: input.action, input, now });
  if (facts?.repository !== repository || facts.issue !== issue) fail('delivery-facts');
  return Object.freeze({ prepared: prepareDeliveryWaiver({ input, facts }), facts });
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
      if (action === 'prepare') {
        const { prepared } = await deriveDeliveryPreparation({
          runtime,
          repository,
          issue,
          input: request,
          now,
        });
        results.push(Object.freeze({ issue, status: 'prepared', ...prepared }));
        continue;
      }
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
      if (request?.scopeKind === 'delivery') {
        if (issues.length !== 1) fail('delivery-issue-count');
        const proposal = proposalFromRequest(request);
        const initial = await deriveDeliveryPreparation({
          runtime,
          repository,
          issue,
          input: proposal,
          now,
        });
        const { prepared } = initial;
        if (
          !isDeepStrictEqual(
            { ...prepared.request, authorizationSource: request.authorizationSource },
            request
          )
        ) {
          fail('delivery-preparation-drift');
        }
        const verified = await runtime.resolveAuthority({
          issue,
          source: request.authorizationSource,
        });
        if (
          verified?.status !== 'verified' ||
          verified.authority.statement !== prepared.statement
        ) {
          fail('delivery-approval-statement');
        }
        const refreshed = await deriveDeliveryPreparation({
          runtime,
          repository,
          issue,
          input: proposal,
          now,
        });
        if (
          !isDeepStrictEqual(refreshed.prepared.request, prepared.request) ||
          refreshed.facts.originalIntentRecordId !== initial.facts.originalIntentRecordId
        ) {
          fail('delivery-before-write-drift');
        }
        results.push(
          await executeWorkflowExceptionWrite({
            action,
            repository,
            issue,
            scopeIdentity: prepared.request.scopeIdentity,
            request,
            authority: verified.authority,
            now,
            runtime,
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
      const code = error?.message ?? 'workflow-exception:unknown';
      results.push(
        Object.freeze({
          issue,
          status: /^(?:workflow-exception|delivery-request|delivery-scope):/.test(code)
            ? 'blocked'
            : 'indeterminate',
          code,
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
        (item.code ? ` code=${item.code}` : '') +
        (item.statement ? `\n${item.statement}\n${JSON.stringify(item.request, null, 2)}` : '')
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
      'Usage: /task workflow-exception <prepare|record|show|revise|revoke> #N [#M ...] ' +
        '[--input-file <request.json>] [--json]\n'
    );
    process.exitCode = 2;
    return;
  }
  let request = null;
  if (parsed.inputFile !== null) {
    const input = await readFile(parsed.inputFile, 'utf8');
    request =
      parsed.action === 'prepare'
        ? parseDeliveryWaiverProposal(input)
        : parseWorkflowExceptionRequest(input, { action: parsed.action });
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

export function resolveLocalTrunkAcceptedSha({ body, issue, projectDir } = {}) {
  let receipts;
  let verificationCommands;
  try {
    receipts = parseValidatedVerificationReceipts(body, { expectedIssue: issue });
    verificationCommands = canonicalVerificationCommandSet(parseVerificationCommands(body), {
      projectDir,
    });
  } catch {
    fail('local-trunk-accepted-head');
  }
  const test = receipts.filter((receipt) => receipt.stage === 'test');
  const review = receipts.filter((receipt) => receipt.stage === 'review');
  const approval = parseReviewApprovedMarker(body);
  if (
    test.length !== 1 ||
    review.length > 1 ||
    !isAgentReviewComplete(body) ||
    !approval?.approvedSha ||
    approval.approvedSha !== test[0].commitSha ||
    (review.length === 1 && review[0].commitSha !== test[0].commitSha)
  )
    fail('local-trunk-accepted-head');
  const valid = (receipt, stage, required = []) =>
    validateVerificationReceipt({
      receipt,
      expectedIssue: issue,
      expectedStage: stage,
      fingerprint: {
        commitSha: test[0].commitSha,
        verificationCommands,
        environment: receipt.environment,
      },
      required,
    }).ok;
  if (
    !valid(test[0], 'test', requiredTestReceiptClassifications(test[0])) ||
    (review.length === 1 && !valid(review[0], 'review'))
  )
    fail('local-trunk-accepted-head');
  return test[0].commitSha;
}
