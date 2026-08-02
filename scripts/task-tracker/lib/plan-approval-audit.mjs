// Canonical visible audit for an explicitly authorized Full-Auto plan approval
// (#1021). The producer (`plan-approve`) and consumer (Agent Review's required-
// comments validator) share this heading contract so they cannot drift.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { stripFencedCodeBlocks } from './markers.mjs';

const pexec = promisify(execFile);

export const PLAN_APPROVAL_AUDIT_HEADING = 'Full-Auto Plan-Approval Audit';
export const PLAN_APPROVAL_AUDIT_RE = /^### Full-Auto Plan-Approval Audit — #(\d+)\s*$/m;

export function isExplicitFullAutoPlanApproval(env = process.env) {
  return env?.TT_FULL_AUTO === '1';
}

export function readPlanApprovedTimestamp(body) {
  const src = stripFencedCodeBlocks(body);
  const property = src.match(
    /<!--\s*aitm-plan-approved\s+ts="([^"]+)"(?:\s+forecast-record-id="[0-7][0-9A-HJKMNP-TV-Z]{25}")?\s*-->/i
  );
  if (property) return property[1];
  const legacy = src.match(/<!--\s*aitm-plan-approved:\s*([^>]*?)\s*-->/i);
  return legacy ? legacy[1].trim() : null;
}

export function buildPlanApprovalAuditComment({ issueNumber, ts } = {}) {
  if (!issueNumber) {
    throw new Error('buildPlanApprovalAuditComment: issueNumber is required');
  }
  if (!ts) {
    throw new Error('buildPlanApprovalAuditComment: approval timestamp is required');
  }
  return [
    `### ${PLAN_APPROVAL_AUDIT_HEADING} — #${issueNumber}`,
    '',
    `Plan approval was recorded at \`${ts}\` under explicit \`TT_FULL_AUTO=1\`.`,
    '',
    '- Approval actor: AI agent operating in Full-Auto mode',
    '- Human reviewer: none — no human reviewer approved this plan',
    `- Evidence: \`<!-- aitm-plan-approved ts="${ts}" -->\``,
    '',
    'This audit records automated plan approval and must not be interpreted as human approval.',
  ].join('\n');
}

export function isCanonicalPlanApprovalAuditComment(body, { issueNumber, ts } = {}) {
  const src = typeof body === 'string' ? body.trim() : '';
  const heading = src.match(PLAN_APPROVAL_AUDIT_RE);
  if (!heading) return false;

  const recordedIssueNumber = Number(heading[1]);
  if (issueNumber != null && recordedIssueNumber !== Number(issueNumber)) return false;

  const recordedTs = src.match(
    /Plan approval was recorded at `([^`]+)` under explicit `TT_FULL_AUTO=1`\./
  )?.[1];
  if (!recordedTs || (ts != null && recordedTs !== ts)) return false;

  return (
    src === buildPlanApprovalAuditComment({ issueNumber: recordedIssueNumber, ts: recordedTs })
  );
}

async function defaultListComments({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'comments'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const parsed = JSON.parse(stdout || '{}');
  return Array.isArray(parsed.comments) ? parsed.comments : [];
}

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

export async function ensureFullAutoPlanApprovalAudit({
  issueNumber,
  repo,
  ts,
  env = process.env,
  listComments = defaultListComments,
  postComment = defaultPostComment,
} = {}) {
  if (!issueNumber) throw new Error('ensureFullAutoPlanApprovalAudit: issueNumber is required');
  if (!repo) throw new Error('ensureFullAutoPlanApprovalAudit: repo is required');
  if (!isExplicitFullAutoPlanApproval(env)) {
    return { mode: 'human', auditPosted: false, alreadyPresent: false };
  }
  if (!ts) {
    throw new Error(
      'ensureFullAutoPlanApprovalAudit: recorded plan-approval timestamp is required'
    );
  }

  const comments = await listComments({ issueNumber, repo });
  const alreadyPresent = comments.some((comment) =>
    isCanonicalPlanApprovalAuditComment(comment?.body, { issueNumber, ts })
  );
  if (alreadyPresent) {
    return { mode: 'full-auto', auditPosted: false, alreadyPresent: true };
  }

  const body = buildPlanApprovalAuditComment({ issueNumber, ts });
  await postComment({ issueNumber, repo, body });
  return { mode: 'full-auto', auditPosted: true, alreadyPresent: false };
}
