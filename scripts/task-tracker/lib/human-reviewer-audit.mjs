// #169 — Enforce audit comment when review→done closes without a human reviewer.
//
// `move-state.mjs` invokes `enforceFullAutoAudit` on the review→done
// transition. The function inspects `TASK_TRACKER_HUMAN_REVIEWER`:
//
//   • set    → stamp `<!-- aitm-human-reviewer: <handle> -->` into the issue
//              body (human-path; no audit comment)
//   • unset  → post a structured audit comment with stable HTML marker
//              `<!-- aitm-full-auto-approval -->` (Full-Auto path)
//
// Absence is the safe default — assistant under Full-Auto leaves the env var
// untouched and the audit comment fires automatically. A human running an
// interactive close sets the env (typically via a wrapper) and the marker is
// the durable on-issue record.
//
// Idempotency: both paths check for prior presence before writing. Re-running
// move-state.mjs against a `done` issue does not double-stamp or duplicate
// the audit comment.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { writeIssueBodyWithRetry } from './state-recording.mjs';
import { serializeMarker } from './marker-grammar.mjs';
import { hasReviewApprovedMarker, parseReviewApprovedMarker } from './markers.mjs';

const pexec = promisify(execFile);

export const HUMAN_REVIEWER_ENV = 'TASK_TRACKER_HUMAN_REVIEWER';
export const FULL_AUTO_AUDIT_RE = /<!--\s*aitm-full-auto-approval\s*-->/i;
// Reader widened (#380) to accept BOTH the legacy `<handle> @ <ts>` colon form
// and the new property grammar `handle="<handle>" ts="<iso>"`. Presence-only
// (`.test`) at both consumers; the legacy branch stays until #369's corpus
// sweep reports zero residual legacy markers.
export const HUMAN_REVIEWER_MARKER_RE =
  /<!--\s*aitm-human-reviewer(?::\s*[^>]*?|\s+handle="(?:[^"]|&quot;)*"\s+ts="(?:[^"]|&quot;)*")\s*-->/i;

export function getHumanReviewer(env = process.env) {
  const raw = env?.[HUMAN_REVIEWER_ENV];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// #177 — Single source of truth for Full-Auto detection. Anchored on the
// absence of `TASK_TRACKER_HUMAN_REVIEWER` because that's the only signal an
// operator sets explicitly. Used by both the audit-comment path
// (`enforceFullAutoAudit`) and the in-body footnote path (`detectFullAuto` in
// verbs/approve.mjs) so the two cannot drift.
export function isFullAuto(env = process.env) {
  return getHumanReviewer(env) === null;
}

// #979 — `enforceFullAutoAudit` used to decide Full-Auto purely from `env`,
// so a genuinely human-approved review (the `/task approve` verb already
// stamped a non-full-auto `aitm-review-approved` marker on the body) still
// got a false "auto-approved under Full-Auto" audit comment at the
// review→done transition whenever `TASK_TRACKER_HUMAN_REVIEWER` happened to
// be unset in this later process. The body already carries the ground
// truth — check it before falling back to the env-only signal.
export function hasGenuineReviewApprovedMarker(body) {
  if (!hasReviewApprovedMarker(body)) return false;
  const parsed = parseReviewApprovedMarker(body);
  return parsed !== null && parsed.fullAuto === false;
}

export function buildHumanReviewerMarker(handle, ts) {
  return serializeMarker('human-reviewer', { handle, ts });
}

export function buildAuditCommentBody({ ts, reviewScope } = {}) {
  const stamp = ts || new Date().toISOString();
  const scope = reviewScope || 'commits, tests, lint/format';
  return [
    '> ⚠ auto-approved under Full-Auto — no human reviewer',
    '',
    `The review→done gate at ${stamp} was passed without a \`${HUMAN_REVIEWER_ENV}\` signal. The assistant ticked "Passed final human review" itself.`,
    '',
    `Scope of self-review: ${scope}`,
    '',
    'Risk: any judgment a human reviewer would have caught (architectural fit, naming, missed edge cases) was not gate-checked.',
    '',
    '<!-- aitm-full-auto-approval -->',
  ].join('\n');
}

async function defaultPostComment({ repo, issueNumber, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

async function defaultListComments({ repo, issueNumber }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'comments'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const parsed = JSON.parse(stdout || '{}');
  return Array.isArray(parsed.comments) ? parsed.comments : [];
}

function hasAuditCommentAlready(comments) {
  if (!Array.isArray(comments)) return false;
  return comments.some((c) => FULL_AUTO_AUDIT_RE.test(String(c?.body ?? '')));
}

// Idempotent enforcement. Returns:
//   { mode: 'human-reviewer', handle, stamped: bool }
//   { mode: 'full-auto', auditPosted: bool, alreadyPresent: bool }
//   { mode: 'noop-no-body' } when body fetch is empty/failed and we cannot stamp
export async function enforceFullAutoAudit({
  issueNumber,
  repo,
  body,
  env = process.env,
  writeIssueBody,
  postComment,
  listComments,
  now = () => new Date().toISOString(),
  reviewScope,
  warn = (msg) => process.stderr.write(`${msg}\n`),
} = {}) {
  if (!issueNumber) throw new Error('enforceFullAutoAudit: issueNumber is required');
  if (!repo) throw new Error('enforceFullAutoAudit: repo is required');
  const ts = now();
  const handle = getHumanReviewer(env);
  const genuineReviewMarker = body != null && hasGenuineReviewApprovedMarker(body);
  const fullAuto = !genuineReviewMarker && isFullAuto(env);
  const list = listComments || defaultListComments;
  const post = postComment || defaultPostComment;

  if (!fullAuto) {
    if (body == null) return { mode: 'noop-no-body' };
    if (HUMAN_REVIEWER_MARKER_RE.test(body)) {
      return { mode: 'human-reviewer', handle, stamped: false };
    }
    const marker = buildHumanReviewerMarker(handle, ts);
    const nextBody = `${body.replace(/\s+$/, '')}\n\n${marker}\n`;
    if (!writeIssueBody) {
      warn(
        `[human-reviewer-audit] issue #${issueNumber}: cannot stamp marker — writeIssueBody not provided`
      );
      return { mode: 'human-reviewer', handle, stamped: false };
    }
    const res = await writeIssueBodyWithRetry({
      issueNumber,
      repo,
      body: nextBody,
      bodyBefore: body,
      target: 'human-reviewer-marker',
      writeIssueBody,
      postComment: post,
      warn,
    });
    return { mode: 'human-reviewer', handle, stamped: res.status === 'ok' };
  }

  // Full-Auto path: check for prior audit comment before posting.
  let alreadyPresent = false;
  try {
    const comments = await list({ repo, issueNumber });
    alreadyPresent = hasAuditCommentAlready(comments);
  } catch {
    // best-effort — if we cannot list, assume not present and post (duplicate
    // is preferable to silent omission)
  }
  if (alreadyPresent) {
    return { mode: 'full-auto', auditPosted: false, alreadyPresent: true };
  }
  const auditBody = buildAuditCommentBody({ ts, reviewScope });
  try {
    await post({ repo, issueNumber, body: auditBody });
    return { mode: 'full-auto', auditPosted: true, alreadyPresent: false };
  } catch (err) {
    warn(`[human-reviewer-audit] issue #${issueNumber}: audit-comment post FAILED: ${err.message}`);
    return { mode: 'full-auto', auditPosted: false, alreadyPresent: false, error: err.message };
  }
}
