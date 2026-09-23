// @story #1755
// Two-pass, transcript-authorized delivery attribution exception CLI.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { gql } from '../../gh/lib/github-projects.mjs';
import { detectProvider, getProvider } from '../../providers/index.mjs';
import { aiAppName, currentSessionId, jsonlPath } from '../word-counter.mjs';
import { createRecordId } from '../lib/github-records/record-envelope.mjs';
import { parseBranchName } from '../lib/branch-name.mjs';
import { resolveCurrentIssueWorktreeBranch } from '../lib/issue-worktree-location.mjs';
import {
  buildDeliveryAttributionProposal,
  parseDeliveryAttributionExceptionComment,
  renderDeliveryAttributionExceptionComment,
  resolveActiveDeliveryAttributionException,
  upperBoundDeliveryAttributionCommentBytes,
} from '../lib/delivery-attribution-exception-record.mjs';
import {
  canonicalSourceInventory,
  evaluateDeliveryAttributionException,
  verifyLocalSourceInventory,
} from '../lib/delivery-attribution-exception.mjs';
import { parseDeliverySubjectTokens } from '../lib/delivery-attribution.mjs';
import {
  createCodexSessionSourceLoader,
  hashAuthorizationStatement,
  resolveWorkflowExceptionAuthority,
  validateAuthorizationSource,
} from '../lib/workflow-policy/authority-resolver.mjs';
import { classifySourceCommitSubjects, createDefaultDeliverDeps } from './deliver.mjs';

const pexec = promisify(execFile);
const ACTIONS = new Set(['prepare', 'record', 'show', 'revise', 'revoke']);
const REQUEST_SCHEMA = 'aitm.delivery-attribution-exception-request/v1';
const RECORD_SCHEMA = 'aitm.delivery-attribution-exception/v1';
const COMMENT_PREFIX = '### Delivery attribution exception\n\n';
const AUTH_REF = /^codex:\/\/sessions\/([-a-zA-Z0-9]+)\/messages\/([-_a-zA-Z0-9]+)$/;

function fail(code) {
  throw new TypeError(`delivery-attribution-exception:${code}`);
}

function exact(value, keys) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
  );
}

function hostOrFail(runtime) {
  const host = runtime?.host;
  if (
    host?.provider !== 'codex' ||
    typeof host?.transcriptPath !== 'string' ||
    host.transcriptPath.length === 0 ||
    typeof host?.sessionId !== 'string' ||
    host.sessionId.length === 0
  )
    fail('authorization-host-unsupported');
  return host;
}

export function parseDeliveryAttributionExceptionArgs(argv = []) {
  const [action, ...rest] = argv;
  if (!ACTIONS.has(action)) fail('usage');
  let issueNumber = null;
  let inputFile = null;
  let json = false;
  for (let i = 0; i < rest.length; i += 1) {
    const item = rest[i];
    if (item === '--json' && !json) {
      json = true;
      continue;
    }
    if (
      item === '--input-file' &&
      inputFile === null &&
      rest[i + 1] &&
      !rest[i + 1].startsWith('--')
    ) {
      inputFile = rest[++i];
      continue;
    }
    if (/^#?[1-9][0-9]*$/.test(item) && issueNumber === null) {
      issueNumber = Number(item.replace(/^#/, ''));
      continue;
    }
    fail('usage');
  }
  if (
    !Number.isSafeInteger(issueNumber) ||
    (action === 'show' && inputFile !== null) ||
    (['record', 'revise', 'revoke'].includes(action) && inputFile === null)
  )
    fail('usage');
  return Object.freeze({ action, issueNumber, inputFile, json });
}

function parseRequest(input) {
  let request;
  try {
    request = typeof input === 'string' ? JSON.parse(input) : structuredClone(input);
  } catch {
    fail('request-json');
  }
  if (
    !exact(request, ['schema', 'action', 'proposal', 'authorizationSource']) ||
    request.schema !== REQUEST_SCHEMA ||
    !['record', 'revise', 'revoke'].includes(request.action) ||
    !(request.authorizationSource === null || typeof request.authorizationSource === 'object')
  ) {
    fail('request-shape');
  }
  if (!request.proposal || typeof request.proposal !== 'object') fail('request-proposal');
  return request;
}

function proposalStatement(action, proposalDigest, proposal) {
  return `I authorize AITM to ${action} the delivery attribution exception for ${proposal.repository} issue #${proposal.issueNumber}, PR #${proposal.prNumber}, operation ${proposal.operationId}, using proposal digest ${proposalDigest}.`;
}

function scopeProposal(scope, ids, now) {
  const { commits, sourceDigest } = canonicalSourceInventory(scope.sourceCommits, scope.headSha);
  if (!Array.isArray(scope.attributableCommits) || !Array.isArray(scope.verifiedMergeShas))
    fail('classification');
  const candidateOids = new Set(scope.attributableCommits.map((commit) => commit.oid));
  const mappingCandidates = [];
  for (const commit of commits) {
    if (!candidateOids.has(commit.oid)) continue;
    try {
      parseDeliverySubjectTokens(commit.messageHeadline);
    } catch (error) {
      if (commit.messageHeadline.includes('[#')) throw error;
      mappingCandidates.push({ oid: commit.oid, messageHeadline: commit.messageHeadline });
    }
  }
  if (mappingCandidates.length === 0) fail('no-exception-needed');
  return {
    mappingCandidates,
    proposal: {
      exceptionId: ids.exceptionId,
      operationId: ids.operationId,
      repository: scope.repository,
      issueNumber: scope.issueNumber,
      prNumber: scope.prNumber,
      baseRef: scope.baseRef,
      headRef: scope.headRef,
      headSha: scope.headSha,
      sourceDigest,
      mappings: [],
      attributionTokens: [],
      expiresAt: new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString(),
    },
  };
}

function validateAgainstLive(request, scope, now) {
  const p = request.proposal;
  const live = scopeProposal(
    scope,
    { exceptionId: p.exceptionId, operationId: p.operationId },
    now
  );
  for (const key of [
    'repository',
    'issueNumber',
    'prNumber',
    'baseRef',
    'headRef',
    'headSha',
    'sourceDigest',
  ]) {
    if (p[key] !== live.proposal[key]) fail('scope-drift');
  }
  if (Date.parse(p.expiresAt) <= Date.parse(now)) fail('expired');
  const result = evaluateDeliveryAttributionException({
    issueNumber: p.issueNumber,
    prNumber: p.prNumber,
    expectedHeadSha: p.headSha,
    commits: scope.sourceCommits,
    attributableCommits: scope.attributableCommits,
    verifiedMergeShas: scope.verifiedMergeShas,
    mappings: p.mappings,
  });
  if (!Array.isArray(p.attributionTokens)) fail('tokens');
  if (
    p.attributionTokens.length > 0 &&
    p.attributionTokens.join('\0') !== result.attributionTokens.join('\0')
  )
    fail('tokens');
  p.attributionTokens = result.attributionTokens;
  const built = buildDeliveryAttributionProposal(p);
  upperBoundDeliveryAttributionCommentBytes(p);
  return {
    ...live,
    proposalDigest: built.proposalDigest,
    statement: proposalStatement(request.action, built.proposalDigest, p),
  };
}

function candidateRequest(scope, ids, now) {
  const { proposal, mappingCandidates } = scopeProposal(scope, ids, now);
  return {
    mappingCandidates,
    template: {
      schema: REQUEST_SCHEMA,
      action: 'record',
      proposal,
      authorizationSource: null,
    },
  };
}

function relevantComments(comments) {
  if (!Array.isArray(comments)) fail('comments-unavailable');
  return comments.filter(
    (item) =>
      typeof item?.body === 'string' &&
      (item.body.startsWith(COMMENT_PREFIX) ||
        item.body.includes('aitm-delivery-attribution-exception/'))
  );
}

function parseHistory(comments) {
  return relevantComments(comments).map((item) => ({
    ...item,
    record: parseDeliveryAttributionExceptionComment(item.body),
  }));
}

function activeHead(history, proposal, now) {
  const scope = Object.fromEntries(
    [
      'operationId',
      'repository',
      'issueNumber',
      'prNumber',
      'baseRef',
      'headRef',
      'headSha',
      'sourceDigest',
    ].map((key) => [key, proposal[key]])
  );
  return resolveActiveDeliveryAttributionException(history, scope, now);
}

function exactTerminalRevocation(history, proposal, now, recordId) {
  let inactive = false;
  try {
    activeHead(history, proposal, now);
  } catch (error) {
    if (error?.message !== 'delivery-attribution-exception-record:inactive') throw error;
    inactive = true;
  }
  if (
    !inactive ||
    history.at(-1)?.record?.kind !== 'revocation' ||
    history.at(-1).record.recordId !== recordId
  )
    fail('revoke-not-terminal');
  return history.at(-1).record;
}

function sourceFromAuthority(record) {
  const match = AUTH_REF.exec(record?.authority?.sourceReference || '');
  if (!match) fail('authorization-source-mismatch');
  return {
    schema: 'aitm.authorization-source/v1',
    adapter: 'codex-session/v1',
    sessionId: match[1],
    messageId: match[2],
    statementHash: hashAuthorizationStatement(record.authority.statement),
  };
}

export async function verifyDeliveryAttributionRecordAuthority(record, runtime) {
  const source = sourceFromAuthority(record);
  const transcriptPath =
    runtime?.resolveTranscriptPath?.(source.sessionId) ??
    (runtime?.host?.sessionId === source.sessionId ? runtime?.host?.transcriptPath : '');
  if (!transcriptPath) fail('authorization-source-unavailable');
  const result = await resolveWorkflowExceptionAuthority({
    source,
    recordingActor: record.authority.actor,
    loadSource: createCodexSessionSourceLoader({
      transcriptPath,
      expectedSessionId: source.sessionId,
    }),
  });
  if (
    result.status !== 'verified' ||
    result.authority.origin !== 'codex-session-transcript' ||
    result.authority.statement !== record.authority.statement ||
    result.authority.statement !==
      proposalStatement(
        record.kind === 'grant' ? 'record' : record.kind === 'revision' ? 'revise' : 'revoke',
        record.proposalDigest,
        record.proposal
      )
  )
    fail(result.code || 'authorization-source-mismatch');
  return result;
}

async function verifyRequestAuthority(request, expectedStatement, runtime) {
  const host = hostOrFail(runtime);
  let source;
  try {
    source = validateAuthorizationSource(request.authorizationSource);
  } catch {
    fail('authorization-source-invalid');
  }
  if (source.sessionId !== host.sessionId) fail('authorization-source-mismatch');
  const result = await resolveWorkflowExceptionAuthority({
    source,
    recordingActor: `codex/session:${host.sessionId}`,
    loadSource: createCodexSessionSourceLoader({
      transcriptPath: host.transcriptPath,
      expectedSessionId: host.sessionId,
    }),
  });
  if (
    result.status !== 'verified' ||
    result.authority.origin !== 'codex-session-transcript' ||
    result.authority.statement !== expectedStatement
  )
    fail(result.code || 'authorization-source-mismatch');
  return result.authority;
}

function matchingRecord(history, request, digest, sourceReference) {
  return history.find(
    ({ record }) =>
      record.proposalDigest === digest &&
      record.proposal.exceptionId === request.proposal.exceptionId &&
      record.proposal.operationId === request.proposal.operationId &&
      record.authority.sourceReference === sourceReference &&
      record.kind === { record: 'grant', revise: 'revision', revoke: 'revocation' }[request.action]
  );
}

export async function runDeliveryAttributionException({
  action,
  issueNumber,
  repository,
  request = null,
  runtime,
  ids = null,
  now = new Date().toISOString(),
} = {}) {
  if (
    !ACTIONS.has(action) ||
    !Number.isSafeInteger(issueNumber) ||
    issueNumber < 1 ||
    typeof repository !== 'string' ||
    !runtime
  )
    fail('input');
  if (action === 'show') {
    const history = parseHistory(await runtime.listComments());
    if (history.length === 0) return { status: 'missing', history: [] };
    const newest = history.at(-1).record;
    let status = 'active';
    try {
      activeHead(history, newest.proposal, now);
    } catch (error) {
      status =
        error?.message === 'delivery-attribution-exception-record:inactive' &&
        newest.kind === 'revocation'
          ? 'revoked'
          : 'blocked';
    }
    return { status, history: history.map(({ id, record }) => ({ id, record })) };
  }
  hostOrFail(runtime);
  if (action !== 'prepare' && request === null) fail('request-required');
  const scope = await runtime.fetchScope(issueNumber);
  if (scope?.repository !== repository || scope?.issueNumber !== issueNumber) fail('issue-scope');
  if (scope.boundBranch === null || scope.boundBranch === undefined) {
    if (parseBranchName(scope.headRef)?.issue !== issueNumber) fail('issue-branch');
  } else if (scope.boundBranch !== scope.headRef) {
    fail('issue-branch');
  }
  if (action === 'prepare' && request === null) {
    const candidate = candidateRequest(
      scope,
      ids ?? { exceptionId: createRecordId(), operationId: createRecordId() },
      now
    );
    return { status: 'template', ...candidate };
  }
  const parsed = parseRequest(request);
  if (action !== 'prepare' && parsed.action !== action) fail('action-mismatch');
  const prepared = validateAgainstLive(parsed, scope, now);
  if (action === 'prepare')
    return {
      status: 'prepared',
      proposalDigest: prepared.proposalDigest,
      statement: prepared.statement,
      mappingCandidates: prepared.mappingCandidates,
    };

  const authority = await verifyRequestAuthority(parsed, prepared.statement, runtime);
  const history = parseHistory(await runtime.listComments());
  const prior = matchingRecord(history, parsed, prepared.proposalDigest, authority.reference);
  if (prior) {
    if (action === 'revoke') {
      exactTerminalRevocation(history, parsed.proposal, now, prior.record.recordId);
    } else {
      const head = activeHead(history, parsed.proposal, now);
      if (head.recordId !== prior.record.recordId) fail('superseded-record');
    }
    await verifyDeliveryAttributionRecordAuthority(prior.record, runtime);
    return { status: 'already-recorded', recordId: prior.record.recordId };
  }
  if (
    history.some(
      ({ record }) =>
        record.proposal.exceptionId === parsed.proposal.exceptionId ||
        record.authority.sourceReference === authority.reference
    )
  )
    fail('duplicate-identity');
  let predecessorId = null;
  let predecessor = null;
  if (action === 'record') {
    if (history.length !== 0) fail('existing-chain');
  } else {
    if (history.length === 0) fail('missing-chain');
    const head = activeHead(history, parsed.proposal, now);
    await verifyDeliveryAttributionRecordAuthority(head, runtime);
    predecessor = head;
    predecessorId = head.recordId;
    if (head.proposal.operationId !== parsed.proposal.operationId) fail('operation-mismatch');
    if (
      action === 'revoke' &&
      (head.proposal.mappings.length !== parsed.proposal.mappings.length ||
        head.proposal.mappings.some((mapping, index) =>
          ['oid', 'messageHeadline', 'issueNumber'].some(
            (key) => mapping[key] !== parsed.proposal.mappings[index]?.[key]
          )
        ))
    )
      fail('revocation-mappings');
  }
  // The read immediately before the write catches a PR or issue change during authorization.
  const fresh = await runtime.fetchScope(issueNumber);
  validateAgainstLive(parsed, fresh, now);
  const record = {
    schema: RECORD_SCHEMA,
    kind: { record: 'grant', revise: 'revision', revoke: 'revocation' }[action],
    recordId: runtime.nextId?.() ?? createRecordId(),
    predecessorId,
    proposal: parsed.proposal,
    proposalDigest: prepared.proposalDigest,
    authority: {
      sourceReference: authority.reference,
      statement: authority.statement,
      actor: authority.recordingActor,
      level: authority.verificationLevel,
    },
    createdAt:
      predecessor && Date.parse(now) <= Date.parse(predecessor.createdAt)
        ? new Date(Date.parse(predecessor.createdAt) + 1).toISOString()
        : now,
  };
  const body = renderDeliveryAttributionExceptionComment(record);
  let stored;
  try {
    stored = await runtime.appendComment(body);
  } catch {
    /* Only an exact correlated readback can resolve transport ambiguity. */
  }
  const after = parseHistory(await runtime.listComments());
  const matches = after.filter(
    ({ id, body: observed }) => observed === body && (stored?.id === undefined || id === stored.id)
  );
  if (matches.length !== 1) fail('append-readback');
  if (action === 'revoke') {
    exactTerminalRevocation(after, parsed.proposal, now, record.recordId);
  } else {
    const head = activeHead(after, parsed.proposal, now);
    if (head.recordId !== record.recordId) fail('append-chain');
  }
  await verifyDeliveryAttributionRecordAuthority(record, runtime);
  return {
    status: { record: 'recorded', revise: 'revised', revoke: 'revoked' }[action],
    recordId: record.recordId,
    commentId: matches[0].id,
  };
}

export function createDeliveryAttributionExceptionRuntime(ctx, { run = pexec, issueNumber } = {}) {
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) fail('issue-target');
  const detected = detectProvider({ env: process.env });
  const selected = getProvider(aiAppName());
  const sessionId = currentSessionId();
  const transcriptPath = jsonlPath(sessionId);
  const host = {
    provider:
      selected.name === 'codex' &&
      detected.name === 'codex' &&
      selected.transcriptLocator &&
      existsSync(transcriptPath)
        ? 'codex'
        : 'unsupported',
    sessionId,
    transcriptPath,
  };
  const command = async (name, args) => {
    const { stdout } = await run(name, args, {
      cwd: ctx.projectDir,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  };
  const json = async (name, args) => JSON.parse(await command(name, args));
  const graphql = async ({ query, variables }) => ({ data: await gql(query, variables) });
  const deliver = createDefaultDeliverDeps(ctx);
  return {
    host,
    resolveTranscriptPath: (sid) => jsonlPath(sid),
    async fetchScope(targetIssue) {
      if (targetIssue !== issueNumber) fail('issue-target');
      const issue = await json('gh', [
        'issue',
        'view',
        String(issueNumber),
        '-R',
        ctx.cfg.repo,
        '--json',
        'number,state,body',
      ]);
      if (issue.number !== issueNumber || issue.state !== 'OPEN') fail('issue-unavailable');
      const branch = (await command('git', ['branch', '--show-current'])).trim();
      const recordedBranch = resolveCurrentIssueWorktreeBranch(issue.body);
      if (recordedBranch !== null && recordedBranch !== branch) fail('issue-branch');
      const prs = await json('gh', [
        'pr',
        'list',
        '-R',
        ctx.cfg.repo,
        '--head',
        branch,
        '--state',
        'open',
        '--json',
        'number',
      ]);
      if (!Array.isArray(prs) || prs.length !== 1) fail('pull-request-ambiguity');
      const pr = await deliver.fetchPullRequest({ prNumber: prs[0].number });
      if (
        pr.state !== 'OPEN' ||
        pr.headRefName !== branch ||
        pr.baseRefName !==
          String(ctx.cfg.trunkRef || '')
            .split('/')
            .at(-1)
      )
        fail('pull-request-scope');
      await verifyLocalSourceInventory({
        commits: pr.sourceCommits,
        headSha: pr.headRefOid,
        inspectLocalCommit: deliver.inspectLocalSourceCommit,
      });
      const classified = await classifySourceCommitSubjects(pr, deliver.inspectSourceCommit);
      if (!Array.isArray(classified.attributableCommits)) fail('classification');
      return {
        repository: ctx.cfg.repo,
        issueNumber,
        prNumber: pr.number,
        boundBranch: recordedBranch,
        baseRef: pr.baseRefName,
        headRef: pr.headRefName,
        headSha: pr.headRefOid,
        sourceCommits: pr.sourceCommits,
        attributableCommits: classified.attributableCommits,
        verifiedMergeShas: classified.verifiedMergeShas,
      };
    },
    async listComments() {
      const [owner, name] = ctx.cfg.repo.split('/');
      const comments = [];
      const seen = new Set();
      let cursor = null;
      for (;;) {
        const query = `query($owner:String!,$name:String!,$issue:Int!,$after:String){repository(owner:$owner,name:$name){issue(number:$issue){number comments(first:100,after:$after){nodes{id body createdAt updatedAt} pageInfo{hasNextPage endCursor}}}}}`;
        const response = await graphql({
          query,
          variables: { owner, name, issue: issueNumber, after: cursor },
        });
        const target = response?.data?.repository?.issue;
        if (
          target?.number !== issueNumber ||
          !Array.isArray(target.comments?.nodes) ||
          typeof target.comments.pageInfo?.hasNextPage !== 'boolean'
        )
          fail('comments-unavailable');
        for (const item of target.comments.nodes) {
          if (typeof item?.id !== 'string' || typeof item?.body !== 'string' || seen.has(item.id))
            fail('comments-unavailable');
          seen.add(item.id);
          comments.push(item);
        }
        if (!target.comments.pageInfo.hasNextPage) return comments;
        const next = target.comments.pageInfo.endCursor;
        if (!next || next === cursor || target.comments.nodes.length === 0)
          fail('comments-pagination');
        cursor = next;
      }
    },
    async appendComment(body) {
      const response = await json('gh', [
        'api',
        `repos/${ctx.cfg.repo}/issues/${issueNumber}/comments`,
        '--method',
        'POST',
        '-f',
        `body=${body}`,
      ]);
      if (typeof response?.node_id !== 'string') fail('append-response');
      return { id: response.node_id, body };
    },
  };
}

export async function verbDeliveryAttributionException(ctx) {
  let parsed;
  try {
    parsed = parseDeliveryAttributionExceptionArgs(ctx.rest);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  let request = null;
  if (parsed.inputFile) request = await readFile(parsed.inputFile, 'utf8');
  try {
    const result = await runDeliveryAttributionException({
      action: parsed.action,
      issueNumber: parsed.issueNumber,
      repository: ctx.cfg.repo,
      request,
      runtime: createDeliveryAttributionExceptionRuntime(ctx, { issueNumber: parsed.issueNumber }),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (['blocked', 'missing'].includes(result.status) && parsed.action !== 'show')
      process.exitCode = 6;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 6;
  }
}
