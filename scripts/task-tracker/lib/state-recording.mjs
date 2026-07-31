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
import { mutateIssueBody } from './issue-body-mutate.mjs';
import { writeLastKnownState } from '../gh-timing-comment.mjs';
import { isGovernedAuthorityError } from './work-lease/governed-effect.mjs';

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

// Stamp the `<!-- aitm-last-known-state -->` marker on the issue body. As of
// #295 this is a thin shim over `mutateIssueBody` — the closure does its own
// read+stamp via `writeLastKnownState`, so a concurrent writer between the
// caller's pre-fetch and this stamp is preserved (the prior shape clobbered
// because callers passed a pre-baked `body`).
//
// Soft-deprecated params (kept so callers don't have to change at once):
//   - `body`, `bodyBefore`, `writeIssueBody` — ignored; the closure computes
//     the next body from the FRESH base every attempt.
//
// On exhaustion: emit a stderr warning AND post a `⚠ state-recording-failed`
// audit comment. Never throws — the board move is already committed.
//
// Returns one of:
//   { status: 'ok', attempts: <n> }       — write landed
//   { status: 'noop' }                    — mutate returned base unchanged
//   { status: 'failed', attempts, error, auditPosted }
export async function writeIssueBodyWithRetry({
  issueNumber,
  repo,
  // legacy snapshot body (commit-2 callers); ignored when `mutate` is supplied
  body,
  // legacy noop check
  bodyBefore,
  target,
  // legacy direct-write hook — preserved so unmigrated verbs/tests still work
  writeIssueBody,
  postComment,
  warn = (msg) => process.stderr.write(`${msg}\n`),
  // post-#295 injection seam: closure derives the next body from the fresh base
  mutate: mutateFn,
  deps = {},
} = {}) {
  if (!target) throw new Error('writeIssueBodyWithRetry: target is required');
  const post = postComment || defaultPostComment;

  // Legacy path — kept until every verb migrates to the closure shape (commit 2
  // of #295). When the caller supplies a pre-baked `body` + `writeIssueBody`,
  // honor the original retry-on-throw contract verbatim. This is the same
  // path #168 shipped and is structurally vulnerable to the snapshot-clobber
  // race that #295 fixes — verbs that take this branch should migrate.
  if (typeof writeIssueBody === 'function' && body !== undefined && !mutateFn) {
    if (bodyBefore !== undefined && body === bodyBefore) {
      return { status: 'noop' };
    }
    try {
      await writeIssueBody({ issueNumber, repo, body });
      return { status: 'ok', attempts: 1 };
    } catch (error) {
      if (isGovernedAuthorityError(error)) throw error;
      // first attempt failed; retry once
    }
    try {
      await writeIssueBody({ issueNumber, repo, body });
      warn(
        `[state-recording] issue #${issueNumber} marker write to "${target}" succeeded on retry`
      );
      return { status: 'ok', attempts: 2 };
    } catch (err) {
      if (isGovernedAuthorityError(err)) throw err;
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
      } catch (error) {
        if (isGovernedAuthorityError(error)) throw error;
      }
      return { status: 'failed', attempts: 2, error: err.message, auditPosted };
    }
  }

  const mutate = mutateFn || ((base) => writeLastKnownState(base, target));
  // NOTE: post-#295 the prior `noop` short-circuit (caller passing
  // `body === bodyBefore`) is gone. If the mutate closure is identity on the
  // fresh remote base, versionedWriteBody still pushes a version-bumped body
  // and returns `ok`. Callers that need a no-op fast-path should pre-check
  // before invoking this helper.
  //
  // #295 — verbs inject either `deps.mutateIssueBody` (whole-function override
  // — the test seam most verbs use) or `deps.fetchBody`+`deps.pushBody` (the
  // versionedWriteBody seam, for tests that exercise the retry loop).
  const mutateImpl = deps.mutateIssueBody || mutateIssueBody;

  // Two-attempt retry over thrown errors (preserves the #168 contract).
  // versionedWriteBody's own `maxRetries` handles the race-loss path, but a
  // thrown `fetchBody`/`pushBody` propagates immediately — wrap it.
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await mutateImpl({
        issueNumber,
        repo,
        mutate,
        maxRetries: 2,
        deps,
      });
      if (res?.status === 'no-op') return { status: 'noop' };
      if (attempt > 1) {
        warn(
          `[state-recording] issue #${issueNumber} marker write to "${target}" succeeded on attempt ${attempt}`
        );
      }
      return { status: 'ok', attempts: attempt };
    } catch (err) {
      if (isGovernedAuthorityError(err)) throw err;
      lastErr = err;
    }
  }

  warn(
    `[state-recording] issue #${issueNumber} marker write to "${target}" FAILED after 2 attempts: ${lastErr.message}`
  );
  let auditPosted = false;
  try {
    const auditBody = [
      '> ⚠ state-recording-failed',
      '',
      `Marker write to \`${target}\` failed after 2 attempts. Board state is committed; body marker may be stale until the next reconcile.`,
      '',
      `Error: \`${lastErr.message}\``,
      '',
      '<!-- aitm-state-recording-failed -->',
    ].join('\n');
    await post({ issueNumber, repo, body: auditBody });
    auditPosted = true;
  } catch (error) {
    if (isGovernedAuthorityError(error)) throw error;
  }
  return { status: 'failed', attempts: 2, error: lastErr.message, auditPosted };
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
