// @story #1191
// Append-only, issue-resident development-location history. Unlike the local
// active-task binding, this record survives sessions, worktrees, and machines.

import { parseMarker, serializeMarker } from './marker-grammar.mjs';
import { readDeliveredCloseTransactions, TERMINAL_CLOSE_STEPS } from './close-convergence.mjs';
import { parseReviewApprovedMarker } from './markers.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';

export const ISSUE_WORKTREE_LOCATION_RE = /<!--\s*aitm-worktree-location\s+worktree="/i;
const ISSUE_WORKTREE_LOCATION_MARKER_RE = /<!--\s*aitm-worktree-location\b/i;

function normalizeEntry({ worktreePath, worktreeBranch, sessionId = '', ts } = {}) {
  if (!worktreePath) {
    throw new Error('issue-worktree-location: worktreePath is required');
  }
  if (!worktreeBranch) {
    throw new Error('issue-worktree-location: worktreeBranch is required');
  }
  if (!ts) throw new Error('issue-worktree-location: ts is required');
  return {
    worktreePath: String(worktreePath),
    worktreeBranch: String(worktreeBranch),
    sessionId: String(sessionId || ''),
    ts: String(ts),
  };
}

export function serializeIssueWorktreeLocationMarker(entry = {}) {
  const normalized = normalizeEntry(entry);
  return serializeMarker('worktree-location', {
    worktree: normalized.worktreePath,
    branch: normalized.worktreeBranch,
    sid: normalized.sessionId,
    ts: normalized.ts,
  });
}

export function parseIssueWorktreeLocations(body) {
  const out = [];
  for (const line of String(body || '').split('\n')) {
    if (!ISSUE_WORKTREE_LOCATION_RE.test(line)) continue;
    const parsed = parseMarker(line.trim());
    if (!parsed || parsed.name !== 'worktree-location') continue;
    const { worktree, branch, sid = '', ts } = parsed.props;
    if (!worktree || !branch || !ts) continue;
    out.push({
      worktreePath: worktree,
      worktreeBranch: branch,
      sessionId: sid,
      ts,
    });
  }
  return out;
}

export function mostRecentIssueWorktreeLocation(body) {
  const entries = parseIssueWorktreeLocations(body);
  return entries.length ? entries[entries.length - 1] : null;
}

// Returns the current durable branch authority, or null for legacy issues with
// no location history. This reader is intentionally stricter than the legacy
// history reader: a marker-like record is authority, so a malformed one must
// not silently degrade to the synthesized canonical epic branch.
function strictIssueWorktreeLocations(body) {
  const records = [];
  for (const line of String(body || '').split('\n')) {
    if (!ISSUE_WORKTREE_LOCATION_MARKER_RE.test(line)) continue;
    const parsed = parseMarker(line.trim());
    if (!parsed || parsed.name !== 'worktree-location') {
      throw new Error('issue-worktree-location: malformed worktree authority record');
    }
    const { worktree, branch, sid = '', ts } = parsed.props;
    if (!worktree || !branch || !ts) {
      throw new Error('issue-worktree-location: malformed worktree authority record');
    }
    records.push({ worktreePath: worktree, worktreeBranch: branch, sessionId: sid, ts });
  }
  if (!records.length) return records;

  const current = records[records.length - 1];
  for (const record of records) {
    if (
      record.ts === current.ts &&
      (record.worktreePath !== current.worktreePath ||
        record.worktreeBranch !== current.worktreeBranch)
    ) {
      throw new Error('issue-worktree-location: ambiguous current worktree authority record');
    }
  }
  return records;
}

// A completed existing Close transaction is durable release evidence. A status
// label alone is not. A subsequent location or reopened lifecycle supersedes it.
export function resolveCurrentIssueWorktreeLocation(body) {
  const records = strictIssueWorktreeLocations(body);
  const current = records.at(-1) ?? null;
  const transactions = readDeliveredCloseTransactions(body);
  const state = readLastKnownState(body);
  const approved = parseReviewApprovedMarker(body);
  const terminal = transactions[0];
  if (
    current &&
    terminal &&
    state.state === 'done' &&
    terminal.completedSteps.length === TERMINAL_CLOSE_STEPS.length &&
    approved?.approvedSha === terminal.acceptedSha &&
    Number.isFinite(Date.parse(current.ts)) &&
    Number.isFinite(Date.parse(state.ts)) &&
    Date.parse(current.ts) <= Date.parse(state.ts)
  )
    return null;
  return current;
}

// Branch identity is durable independently of the last operator's directory or
// a replacement checkout's temporary detached HEAD. It grants no write lease.
export function resolveCurrentIssueWorktreeBranch(body) {
  const records = strictIssueWorktreeLocations(body);
  const selected = records.findLast((entry) => entry.worktreeBranch !== 'HEAD');
  if (
    selected &&
    records.some(
      (entry) =>
        entry.ts === selected.ts &&
        (entry.worktreePath !== selected.worktreePath ||
          entry.worktreeBranch !== selected.worktreeBranch)
    )
  )
    throw new Error('issue-worktree-location: ambiguous named branch authority record');
  return selected?.worktreeBranch ?? null;
}

export function sameIssueWorktreeLocation(left, right) {
  return Boolean(
    left &&
    right &&
    left.worktreePath === right.worktreePath &&
    left.worktreeBranch === right.worktreeBranch
  );
}

export function appendIssueWorktreeLocation(body, entry = {}) {
  const src = String(body || '');
  const marker = serializeIssueWorktreeLocationMarker(entry);
  const fields = /^[^\n]*<!--\s*aitm-fields:/m.exec(src);
  if (fields) {
    const lineStart = src.lastIndexOf('\n', fields.index) + 1;
    return `${src.slice(0, lineStart)}${marker}\n\n${src.slice(lineStart)}`;
  }
  const separator = src.endsWith('\n') ? '' : '\n';
  return `${src}${separator}${marker}\n`;
}

export function recordIssueWorktreeLocationOnChange(body, entry = {}) {
  const src = String(body || '');
  const normalized = normalizeEntry(entry);
  const recent = mostRecentIssueWorktreeLocation(src);
  if (sameIssueWorktreeLocation(recent, normalized)) {
    return { body: src, appended: false };
  }
  return {
    body: appendIssueWorktreeLocation(src, normalized),
    appended: true,
  };
}
