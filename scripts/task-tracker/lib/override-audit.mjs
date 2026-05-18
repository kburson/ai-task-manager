// #162 — audit-comment helper for `TASK_TRACKER_FORCE_PROMOTE=1` overrides.
//
// Posts one `⚠ override used` comment on the child sub-issue and another on
// the parent epic so the heal-forward action is observable in both audit
// trails. Best-effort — failures are swallowed so an override never aborts
// the underlying move.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

const pexec = promisify(execFile);

async function defaultPostComment({ repo, issueNumber, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

export async function postOverrideAuditComment({
  cfg,
  childNumber,
  parentNumber,
  childTarget,
  parentState,
  reason,
  postComment = defaultPostComment,
} = {}) {
  if (!cfg?.repo) return { posted: false, error: 'missing-repo' };
  if (childNumber == null || parentNumber == null) {
    return { posted: false, error: 'missing-issue-numbers' };
  }
  const ts = new Date().toISOString();
  const childBody =
    `⚠ override used: child #${childNumber} promoted to **${childTarget}** while parent #${parentNumber} is in **${parentState}**` +
    ` (${reason}). \`TASK_TRACKER_FORCE_PROMOTE=1\` heal-forward at ${ts}.`;
  const parentBody =
    `⚠ override used: child #${childNumber} (now **${childTarget}**) was promoted ahead of this parent epic (parent state: **${parentState}**, ${reason}).` +
    ` Bring the epic up to at least **${childTarget}** to restore the invariant. \`TASK_TRACKER_FORCE_PROMOTE=1\` heal-forward at ${ts}.`;
  const results = await Promise.allSettled([
    postComment({ repo: cfg.repo, issueNumber: childNumber, body: childBody }),
    postComment({ repo: cfg.repo, issueNumber: parentNumber, body: parentBody }),
  ]);
  const failures = results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message);
  return { posted: failures.length === 0, failures };
}
