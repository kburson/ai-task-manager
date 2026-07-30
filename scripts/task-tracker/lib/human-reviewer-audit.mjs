// #169 — Enforce the review→done audit from the authoritative close decision.
//
// `move-state.mjs` invokes `enforceFullAutoAudit` after the review→done
// transition. Decision precedence is:
//
//   1. a genuine non-Full-Auto approval marker → human-reviewer;
//   2. explicit `reviewAuthority` (`human-gate` or `gate-bypassed`);
//   3. legacy `TASK_TRACKER_HUMAN_REVIEWER` environment fallback when the
//      authority is null.
//
// A Full-Auto audit records whether that decision came from an explicit gate
// bypass or the legacy environment fallback. Human-reviewer paths stamp the
// durable `aitm-human-reviewer` body marker.
//
// Idempotency: both paths check for prior presence before writing. Re-running
// move-state.mjs against a `done` issue does not double-stamp or duplicate
// the audit comment.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { writeIssueBodyWithRetry } from './state-recording.mjs';
import { serializeMarker } from './marker-grammar.mjs';
import { derivePersistedReviewAuthority } from './review-authority.mjs';

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

// Review authority is an internal in-process value. It deliberately has no
// CLI or environment representation: close producers supply it directly and
// the move-state boundaries reject any unrecognized value before effects run.
export function resolveReviewAuthority(reviewAuthority = null) {
  if (
    reviewAuthority !== null &&
    reviewAuthority !== 'human-gate' &&
    reviewAuthority !== 'gate-bypassed'
  ) {
    throw new Error(`invalid reviewAuthority ${String(reviewAuthority)}`);
  }
  return reviewAuthority;
}

// #979 — `enforceFullAutoAudit` used to decide Full-Auto purely from `env`,
// so a genuinely human-approved review (the `/task approve` verb already
// stamped a non-full-auto `aitm-review-approved` marker on the body) still
// got a false "auto-approved under Full-Auto" audit comment at the
// review→done transition whenever `TASK_TRACKER_HUMAN_REVIEWER` happened to
// be unset in this later process. The body already carries the ground
// truth — check it before falling back to the env-only signal.
export function hasGenuineReviewApprovedMarker(body) {
  const authority = derivePersistedReviewAuthority(body);
  return authority.status === 'current' && authority.approval?.provenance === 'human';
}

export function buildHumanReviewerMarker(handle, ts) {
  return serializeMarker('human-reviewer', { handle, ts });
}

export function buildAuditCommentBody({ ts, reviewScope, reviewAuthority = null, reason } = {}) {
  const stamp = ts || new Date().toISOString();
  const scope = reviewScope || 'commits, tests, lint/format';
  const explicitBypass = reviewAuthority === 'gate-bypassed' && reason === 'explicit-gate-bypass';
  const persistedFullAuto = reason === 'persisted-full-auto-authority';
  const headline = persistedFullAuto
    ? '> ⚠ auto-approved under Full-Auto — persisted Full-Auto review authority'
    : explicitBypass
      ? '> ⚠ auto-approved under Full-Auto — review gate explicitly bypassed'
      : '> ⚠ auto-approved under Full-Auto — no human reviewer';
  const decision = persistedFullAuto
    ? `The review→done gate at ${stamp} used the issue's current persisted Full-Auto review authority. Environment reviewer metadata and call-site hints did not replace that durable provenance.`
    : explicitBypass
      ? `The review→done gate at ${stamp} was explicitly bypassed by close authority. This audit records that bypass; \`${HUMAN_REVIEWER_ENV}\` metadata did not determine the outcome.`
      : `The review→done gate at ${stamp} was passed without a \`${HUMAN_REVIEWER_ENV}\` signal. The assistant ticked "Passed final human review" itself.`;
  return [
    headline,
    '',
    decision,
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
  reviewAuthority = null,
  writeIssueBody,
  postComment,
  listComments,
  now = () => new Date().toISOString(),
  reviewScope,
  warn = (msg) => process.stderr.write(`${msg}\n`),
} = {}) {
  if (!issueNumber) throw new Error('enforceFullAutoAudit: issueNumber is required');
  if (!repo) throw new Error('enforceFullAutoAudit: repo is required');
  reviewAuthority = resolveReviewAuthority(reviewAuthority);
  const ts = now();
  const persistedAuthority = body != null ? derivePersistedReviewAuthority(body) : null;
  const persistedMode =
    persistedAuthority?.status === 'current'
      ? persistedAuthority.approval?.provenance === 'full-auto'
        ? 'full-auto'
        : 'human-reviewer'
      : null;
  const explicitMode =
    reviewAuthority === 'gate-bypassed'
      ? 'full-auto'
      : reviewAuthority === 'human-gate'
        ? 'human-reviewer'
        : null;
  const fullAuto =
    (persistedMode || explicitMode || (isFullAuto(env) ? 'full-auto' : 'human-reviewer')) ===
    'full-auto';
  const fullAutoReason =
    persistedMode === 'full-auto'
      ? 'persisted-full-auto-authority'
      : reviewAuthority === 'gate-bypassed'
        ? 'explicit-gate-bypass'
        : 'legacy-environment-fallback';
  const handle = getHumanReviewer(env) || (reviewAuthority === 'human-gate' ? 'review-gate' : null);
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
  const auditBody = buildAuditCommentBody({
    ts,
    reviewScope,
    reviewAuthority,
    reason: fullAutoReason,
  });
  try {
    await post({ repo, issueNumber, body: auditBody });
    return { mode: 'full-auto', auditPosted: true, alreadyPresent: false };
  } catch (err) {
    warn(`[human-reviewer-audit] issue #${issueNumber}: audit-comment post FAILED: ${err.message}`);
    return { mode: 'full-auto', auditPosted: false, alreadyPresent: false, error: err.message };
  }
}
