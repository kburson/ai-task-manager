// @story #1716
// Strict evidence reader for reconstructing a skipped Full-Auto Plan approval.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { listIssueCommentsSince } from './github-records/github-comment-store.mjs';
import { parseEntryMarkers } from './stage-entry-grammar.mjs';
import { hasEmptyPlannedAppendix, hasPlannedAppendix } from './refine-estimate-comment.mjs';
import { parseTimingRows } from './timing-ladder.mjs';
import { resolveWorkflowExceptionRecords } from './workflow-policy/exception-record.mjs';
import { computeScopeIdentity, scopeProjection } from './workflow-policy/scope-identity.mjs';
import {
  classifyCompletedPlanTransitionAuthority,
  parsePlanTransitionAuthorityComment,
} from './plan-transition-authority.mjs';

const pexec = promisify(execFile);

function hasEntry(body, state) {
  return parseEntryMarkers(body).some((entry) => entry.state === state);
}

async function defaultListEvidenceComments({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'comments'],
    { maxBuffer: 10 * 1024 * 1024 }
  );
  const parsed = JSON.parse(stdout || '{}');
  return Array.isArray(parsed.comments) ? parsed.comments : [];
}

async function defaultListWorkflowExceptionRecords({ issueNumber, repo }) {
  const graphql = async ({ query, variables }) => ({ data: await gql(query, variables) });
  return listIssueCommentsSince({
    repository: repo,
    issue: Number(issueNumber),
    since: '1970-01-01T00:00:00.000Z',
    graphql,
  });
}

async function defaultListIssueBodyHistory({ issueNumber, repo }) {
  const { owner, repoName } = splitRepo(repo);
  const bodies = [];
  let after = null;
  const seen = new Set();
  while (true) {
    const data = await gql(
      `
      query($owner: String!, $repo: String!, $issue: Int!, $after: String) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) {
            userContentEdits(first: 100, after: $after) {
              nodes { editedAt diff }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }`,
      { owner, repo: repoName, issue: Number(issueNumber), after }
    );
    const edits = data?.repository?.issue?.userContentEdits;
    if (!Array.isArray(edits?.nodes) || typeof edits.pageInfo?.hasNextPage !== 'boolean') {
      throw new Error('plan-approve: issue edit history is incomplete');
    }
    for (const edit of edits.nodes) {
      if (typeof edit?.diff !== 'string' || typeof edit?.editedAt !== 'string') {
        throw new Error('plan-approve: issue edit history has an invalid entry');
      }
      bodies.push(edit.diff);
    }
    if (!edits.pageInfo.hasNextPage) break;
    const next = edits.pageInfo.endCursor;
    if (typeof next !== 'string' || !next || seen.has(next)) {
      throw new Error('plan-approve: issue edit history pagination is invalid');
    }
    seen.add(next);
    after = next;
  }
  return bodies;
}

function hasSubstantiveFlatPlanMetadata(body) {
  const lines = String(body || '').split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+Plan Metadata\s*$/.test(line));
  if (start < 0) return false;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    if (/^#{1,6}\s+/.test(lines[index])) return false;
    if (/^\s*-\s+(?:\*\*)?[^:\n]+(?:\*\*)?:\s*\S/.test(lines[index])) return true;
  }
  return false;
}

function semanticPlanningScope({ repository, issue, body }) {
  const withoutWorkflowEvidence = String(body || '').replace(/<!--\s*aitm-[\s\S]*?-->/gi, '');
  return scopeProjection({ repository, issue, body: withoutWorkflowEvidence }).sections;
}

export function evaluatePlanApprovalRepairEvidence({
  body,
  comments,
  records,
  issueBodyHistory,
  issueNumber,
  repo,
  now,
}) {
  const blockers = [];
  if (!hasEntry(body, 'plan')) blockers.push('plan-entry-missing');
  if (!hasEntry(body, 'develop')) blockers.push('develop-entry-missing');
  if (!/<!--\s*aitm-deep-dive-complete\b/i.test(body)) {
    blockers.push('deep-dive-marker-missing');
  }
  if (!/^##\s+Deep[- ]Dive Analysis\b/im.test(body)) blockers.push('deep-dive-section-missing');
  if (!hasSubstantiveFlatPlanMetadata(body)) blockers.push('plan-metadata-invalid');
  if (/<!--\s*aitm-plan-(?:cancelled|rejected)\b/i.test(body)) {
    blockers.push('plan-cancelled-or-rejected');
  }

  const commentBodies = (comments || []).map((comment) => String(comment?.body ?? ''));
  const timingRows = commentBodies.flatMap((comment) => parseTimingRows(comment));
  let planStarted = -1;
  for (let index = timingRows.length - 1; index >= 0; index -= 1) {
    if (timingRows[index].event === 'plan:started') {
      planStarted = index;
      break;
    }
  }
  const planCompleted = timingRows.findIndex(
    (row, index) => index > planStarted && row.event === 'plan:completed'
  );
  const developStarted = timingRows.findIndex(
    (row, index) => index > planCompleted && row.event === 'develop:started'
  );
  if (planStarted < 0 || planCompleted < 0 || developStarted < 0) {
    blockers.push('plan-completion-sequence-missing');
  }
  const hasConcretePlannedEstimate = commentBodies.some(
    (comment) =>
      /<!--\s*aitm-refined-estimate:\s*\d+\s*-->/i.test(comment) &&
      hasPlannedAppendix(comment) &&
      !hasEmptyPlannedAppendix(comment)
  );
  if (!hasConcretePlannedEstimate) blockers.push('planned-estimate-missing');
  if (
    commentBodies.some(
      (comment) =>
        /^###\s+(?:❌\s*)?Plan rejected\b/im.test(comment) ||
        (/^###\s+(?:❌\s*)?Review rejected\b/im.test(comment) &&
          /(?:plan|planning)\s+(?:was\s+)?(?:rejected|invalid|disapproved)/i.test(comment))
    )
  ) {
    blockers.push('plan-rejection-history');
  }

  let scopeIdentity;
  try {
    scopeIdentity = computeScopeIdentity({ repository: repo, issue: Number(issueNumber), body });
  } catch {
    blockers.push('scope-evidence-invalid');
  }
  if (!scopeIdentity) {
    return { blockers, approvalPlanRecordId: null, revokedRecordId: null };
  }

  let exception;
  try {
    exception = resolveWorkflowExceptionRecords({
      records,
      repository: repo,
      issue: Number(issueNumber),
      currentScopeIdentity: scopeIdentity,
      now,
    });
  } catch {
    exception = { status: 'invalid', head: null };
  }
  if (exception.status !== 'revoked') blockers.push(`workflow-exception-${exception.status}`);
  const resolvedRecordIds = new Set((exception.history || []).map((item) => item.recordId));
  const approvalPlanRecord = Array.isArray(records)
    ? (records
        .filter(
          (record) =>
            resolvedRecordIds.has(record?.envelope?.recordId) &&
            record.envelope.payload?.requirementIds?.includes('approval.plan')
        )
        .sort(
          (left, right) => right.envelope.payload.revision - left.envelope.payload.revision
        )[0] ?? null)
    : null;
  if (!approvalPlanRecord) blockers.push('approval-plan-waiver-history-missing');

  let historicalScopeBody = null;
  const approvalPlanScopeIdentity = approvalPlanRecord?.envelope?.payload?.scopeIdentity ?? null;
  if (approvalPlanScopeIdentity) {
    for (const candidate of [...(issueBodyHistory || []), body]) {
      const candidateBody = typeof candidate === 'string' ? candidate : candidate?.body;
      try {
        if (
          computeScopeIdentity({
            repository: repo,
            issue: Number(issueNumber),
            body: candidateBody,
          }) === approvalPlanScopeIdentity
        ) {
          historicalScopeBody = candidateBody;
          break;
        }
      } catch {
        // An invalid historical body is not authority; continue searching.
      }
    }
  }
  if (historicalScopeBody === null) {
    blockers.push('workflow-exception-scope-history-missing');
  } else {
    try {
      const historical = semanticPlanningScope({
        repository: repo,
        issue: Number(issueNumber),
        body: historicalScopeBody,
      });
      const current = semanticPlanningScope({
        repository: repo,
        issue: Number(issueNumber),
        body,
      });
      if (JSON.stringify(historical) !== JSON.stringify(current)) {
        blockers.push('workflow-exception-semantic-scope-drift');
      }
    } catch {
      blockers.push('workflow-exception-semantic-scope-invalid');
    }
  }
  return {
    blockers,
    approvalPlanRecordId: approvalPlanRecord?.envelope?.recordId ?? null,
    revokedRecordId: exception.status === 'revoked' ? (exception.head?.recordId ?? null) : null,
  };
}

export function evaluateModernPlanTransitionEvidence({
  body,
  authorityRecords = [],
  repository,
  issue,
} = {}) {
  const completed = authorityRecords
    .map((record) => classifyCompletedPlanTransitionAuthority({ record, issueBody: body }))
    .filter(({ status }) => status === 'completed');
  if (completed.length !== 1) {
    return Object.freeze({
      status: 'unavailable',
      blockers: Object.freeze(['plan-transition-authority-ambiguous']),
    });
  }
  const [{ record }] = completed;
  let currentScopeIdentity = null;
  try {
    currentScopeIdentity = computeScopeIdentity({
      repository,
      issue: Number(issue),
      body,
    });
  } catch {
    // The scope mismatch refusal below covers an invalid current scope.
  }
  if (
    record.repository.toLowerCase() !== String(repository || '').toLowerCase() ||
    record.issue !== Number(issue) ||
    record.scopeIdentity !== currentScopeIdentity
  ) {
    return Object.freeze({
      status: 'unavailable',
      blockers: Object.freeze(['plan-transition-authority-scope']),
    });
  }
  if (record.outcome !== 'waived') {
    return Object.freeze({
      status: 'unavailable',
      blockers: Object.freeze([`plan-transition-authority-outcome-${record.outcome}`]),
    });
  }
  return Object.freeze({
    status: 'available',
    source: 'plan-transition-authority',
    historicalOutcome: record.outcome,
    transitionId: record.transitionId,
    authorityRecordId: record.evidence.recordId,
    authorityRevision: record.evidence.revision,
    blockers: Object.freeze([]),
  });
}

export async function collectPlanApprovalRepairEvidence({ issueNumber, repo, deps = {} }) {
  const listEvidenceComments =
    deps.listEvidenceComments || deps.listComments || defaultListEvidenceComments;
  const listWorkflowRecords =
    deps.listWorkflowExceptionRecords || defaultListWorkflowExceptionRecords;
  const listBodyHistory = deps.listIssueBodyHistory || defaultListIssueBodyHistory;
  const [comments, records, issueBodyHistory] = await Promise.all([
    listEvidenceComments({ issueNumber, repo }),
    listWorkflowRecords({ issueNumber, repo }),
    listBodyHistory({ issueNumber, repo }),
  ]);
  const authorityRecords = [];
  for (const comment of comments || []) {
    try {
      authorityRecords.push(
        parsePlanTransitionAuthorityComment(
          typeof comment === 'string' ? comment : String(comment?.body ?? '')
        )
      );
    } catch {
      // Unrelated and malformed comments are not modern authority candidates.
    }
  }
  return {
    comments,
    records,
    issueBodyHistory,
    authorityRecords: Object.freeze(authorityRecords),
  };
}
