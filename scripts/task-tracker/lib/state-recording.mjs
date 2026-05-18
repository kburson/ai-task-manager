// #168 — Surface state-recording failures instead of swallowing them.
//
// Two paths in `promote.mjs` write the `<!-- aitm-last-known-state -->`
// body marker after a successful board move. When that write silently
// fails, the board sits at the new state but the marker still names the
// previous one — the next promote sees drift and fires
// `drift-reconcile`. This module wraps the marker-write in a retry +
// audit-comment so failures are observable in the issue's audit trail
// rather than masquerading as external mutation. Board moves cannot be
// rolled back, so the goal is surfacing — not preventing — the divergence.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

const pexec = promisify(execFile);

export class StateRecordingFailedError extends Error {
  constructor({ issueNumber, target, cause }) {
    super(
      `state-recording-failed: issue #${issueNumber} marker write to "${target}" failed: ${cause?.message ?? cause}`
    );
    this.name = 'StateRecordingFailedError';
    this.issueNumber = issueNumber;
    this.target = target;
    this.cause = cause;
  }
}

async function defaultPostComment({ repo, issueNumber, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

// Attempt to write the body marker. On failure, retry once. On a second
// failure, emit a stderr warning AND post a `⚠ state-recording-failed`
// audit comment on the issue. Never throws — board move is already
// committed.
//
// Returns one of:
//   { status: 'ok', attempts: 1 | 2 }
//   { status: 'failed', attempts: 2, error, auditPosted: boolean }
//   { status: 'noop' }  — when stamped === bodyBefore (no write needed)
export async function writeIssueBodyWithRetry({
  issueNumber,
  repo,
  body,
  bodyBefore,
  target,
  writeIssueBody,
  postComment,
  warn = (msg) => process.stderr.write(`${msg}\n`),
} = {}) {
  if (!writeIssueBody) throw new Error('writeIssueBodyWithRetry: writeIssueBody is required');
  if (bodyBefore !== undefined && body === bodyBefore) {
    return { status: 'noop' };
  }
  const post = postComment || defaultPostComment;
  try {
    await writeIssueBody({ issueNumber, repo, body });
    return { status: 'ok', attempts: 1 };
  } catch {
    // first attempt failed; retry once
  }
  try {
    await writeIssueBody({ issueNumber, repo, body });
    warn(`[state-recording] issue #${issueNumber} marker write to "${target}" succeeded on retry`);
    return { status: 'ok', attempts: 2 };
  } catch (err) {
    warn(
      `[state-recording] issue #${issueNumber} marker write to "${target}" FAILED after 2 attempts: ${err.message}`
    );
    let auditPosted = false;
    try {
      const auditBody = [
        '> ⚠ state-recording-failed',
        '',
        `Marker write to \`${target}\` failed after 2 attempts. Board state is committed; body marker may be stale until the next reconcile.`,
        '',
        `Error: \`${err.message}\``,
        '',
        '<!-- aitm-state-recording-failed -->',
      ].join('\n');
      await post({ issueNumber, repo, body: auditBody });
      auditPosted = true;
    } catch {
      // audit-only, not correctness-critical
    }
    return { status: 'failed', attempts: 2, error: err.message, auditPosted };
  }
}

// Detect a recent `state-recording-failed` audit comment so drift-reconcile
// can produce an honest reason. Caller supplies an array of comment objects
// (e.g. from `gh issue view --json comments`) and the last move row's ts.
// Returns the matching comment's target+ts when present, else null.
const AUDIT_MARKER_RE = /<!--\s*aitm-state-recording-failed\s*-->/i;
const AUDIT_TARGET_RE = /Marker write to `([a-z-]+)`/i;

export function findRecordingFailureFromComments(comments, sinceMs) {
  if (!Array.isArray(comments)) return null;
  let best = null;
  for (const c of comments) {
    const body = c?.body ?? '';
    if (!AUDIT_MARKER_RE.test(body)) continue;
    const createdAt = c?.createdAt || c?.created_at;
    if (!createdAt) continue;
    const t = Date.parse(createdAt);
    if (Number.isNaN(t)) continue;
    if (sinceMs && t < sinceMs) continue;
    if (!best || t > Date.parse(best.createdAt)) {
      const tm = body.match(AUDIT_TARGET_RE);
      best = { createdAt, target: tm?.[1] ?? null };
    }
  }
  return best;
}
