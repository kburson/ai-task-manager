// Canonical visible audit for an explicitly authorized Full-Auto plan approval
// (#1021). The producer (`plan-approve`) and consumer (Agent Review's required-
// comments validator) share this heading contract so they cannot drift.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { parsePlanApprovedMarker } from './markers.mjs';

const pexec = promisify(execFile);

export const PLAN_APPROVAL_AUDIT_HEADING = 'Full-Auto Plan-Approval Audit';
export const PLAN_APPROVAL_AUDIT_RE = /^### Full-Auto Plan-Approval Audit — #(\d+)\s*$/m;

export function isExplicitFullAutoPlanApproval(env = process.env) {
  return env?.TT_FULL_AUTO === '1';
}

export function readPlanApprovedTimestamp(body) {
  return parsePlanApprovedMarker(body)?.ts || null;
}

export function buildPlanApprovalAuditComment({ issueNumber, ts, repairEvidence = null } = {}) {
  if (!issueNumber) {
    throw new Error('buildPlanApprovalAuditComment: issueNumber is required');
  }
  if (!ts) {
    throw new Error('buildPlanApprovalAuditComment: approval timestamp is required');
  }
  if (repairEvidence !== null) {
    const approvalPlanRecordId = repairEvidence?.approvalPlanRecordId;
    const revokedRecordId = repairEvidence?.revokedRecordId;
    if (
      !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(approvalPlanRecordId ?? '') ||
      !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(revokedRecordId ?? '')
    ) {
      throw new Error(
        'buildPlanApprovalAuditComment: repair evidence requires approval-plan and revoked record IDs'
      );
    }
    return [
      `### ${PLAN_APPROVAL_AUDIT_HEADING} — #${issueNumber}`,
      '',
      `Plan approval was reconstructed at \`${ts}\` under explicit \`TT_FULL_AUTO=1\` from durable evidence.`,
      '',
      '- Approval actor: AI agent operating in Full-Auto mode',
      '- Human reviewer: none — no human reviewer approved this plan',
      `- Waiver evidence: workflow-exception record \`${approvalPlanRecordId}\` covered \`approval.plan\``,
      `- Revocation evidence: workflow-exception chain head \`${revokedRecordId}\` is revoked`,
      '- Planning evidence: Plan entry and completion before Develop; Deep-Dive Analysis; Plan Metadata; Planned Estimate',
      `- Evidence: \`<!-- aitm-plan-approved ts="${ts}" mode="full-auto" -->\``,
      '',
      'This audit records evidence-derived automated Plan approval. It is neither a human approval nor a workflow waiver.',
    ].join('\n');
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

export function isCanonicalPlanApprovalAuditComment(
  body,
  { issueNumber, ts, repairEvidence = null } = {}
) {
  const src = typeof body === 'string' ? body.trim() : '';
  const heading = src.match(PLAN_APPROVAL_AUDIT_RE);
  if (!heading) return false;

  const recordedIssueNumber = Number(heading[1]);
  if (issueNumber != null && recordedIssueNumber !== Number(issueNumber)) return false;

  const standardTs = src.match(
    /Plan approval was recorded at `([^`]+)` under explicit `TT_FULL_AUTO=1`\./
  )?.[1];
  const repairTs = src.match(
    /Plan approval was reconstructed at `([^`]+)` under explicit `TT_FULL_AUTO=1` from durable evidence\./
  )?.[1];
  const recordedTs = standardTs ?? repairTs;
  if (!recordedTs || (ts != null && recordedTs !== ts)) return false;

  if (repairTs) {
    const approvalPlanRecordId = src.match(
      /Waiver evidence: workflow-exception record `([0-7][0-9A-HJKMNP-TV-Z]{25})` covered `approval\.plan`/
    )?.[1];
    const revokedRecordId = src.match(
      /Revocation evidence: workflow-exception chain head `([0-7][0-9A-HJKMNP-TV-Z]{25})` is revoked/
    )?.[1];
    if (!approvalPlanRecordId || !revokedRecordId) return false;
    if (
      repairEvidence?.approvalPlanRecordId &&
      approvalPlanRecordId !== repairEvidence.approvalPlanRecordId
    ) {
      return false;
    }
    if (repairEvidence?.revokedRecordId && revokedRecordId !== repairEvidence.revokedRecordId) {
      return false;
    }
    return (
      src ===
      buildPlanApprovalAuditComment({
        issueNumber: recordedIssueNumber,
        ts: recordedTs,
        repairEvidence: { approvalPlanRecordId, revokedRecordId },
      })
    );
  }
  if (repairEvidence !== null) return false;
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
  mode = null,
  env = process.env,
  repairEvidence = null,
  listComments = defaultListComments,
  postComment = defaultPostComment,
} = {}) {
  if (!issueNumber) throw new Error('ensureFullAutoPlanApprovalAudit: issueNumber is required');
  if (!repo) throw new Error('ensureFullAutoPlanApprovalAudit: repo is required');
  // Durable provenance wins over the current process environment. A known
  // human approval must never acquire a false Full-Auto attestation merely
  // because an idempotent repair is run from a Full-Auto session. A known
  // Full-Auto marker can repair its missing audit even when the current env is
  // interactive. Historical `unknown` markers retain the prior env-directed
  // repair behavior so they remain default-deny but recoverable.
  if (mode === 'human') {
    return { mode: 'human', auditPosted: false, alreadyPresent: false };
  }
  const fullAuto = mode === 'full-auto' || isExplicitFullAutoPlanApproval(env);
  if (!fullAuto) {
    return {
      mode: mode === 'unknown' ? 'unknown' : 'human',
      auditPosted: false,
      alreadyPresent: false,
    };
  }
  if (!ts) {
    throw new Error(
      'ensureFullAutoPlanApprovalAudit: recorded plan-approval timestamp is required'
    );
  }

  const comments = await listComments({ issueNumber, repo });
  const alreadyPresent = comments.some((comment) =>
    isCanonicalPlanApprovalAuditComment(comment?.body, { issueNumber, ts, repairEvidence })
  );
  if (alreadyPresent) {
    return { mode: 'full-auto', auditPosted: false, alreadyPresent: true };
  }

  const body = buildPlanApprovalAuditComment({ issueNumber, ts, repairEvidence });
  await postComment({ issueNumber, repo, body });
  return { mode: 'full-auto', auditPosted: true, alreadyPresent: false };
}
