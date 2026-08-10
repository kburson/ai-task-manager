// @story #1191
// Append-only, issue-resident development-location history. Unlike the local
// active-task binding, this record survives sessions, worktrees, and machines.

import { parseMarker, serializeMarker } from './marker-grammar.mjs';

export const ISSUE_WORKTREE_LOCATION_RE = /<!--\s*aitm-worktree-location\s+worktree="/i;

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
