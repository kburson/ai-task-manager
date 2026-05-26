#!/usr/bin/env node
// Claude Code `Stop` hook — records a pending-pause marker for the current
// session so the next `UserPromptSubmit` can compute the inter-turn idle
// gap and post one idle row to the bound issue's `⏱ Timing Log` comment.
//
// EPIC #207 / #213 — Seq 2. Replaces discipline-based `/task pause` with a
// mechanical, hook-driven pause/resume.
//
// Strict scope:
//   - Read $CLAUDE_SESSION_ID (or AI_TASK_MANAGER_SESSION_ID) for the sid.
//   - Look up the bound active task via session-state (Seq 1).
//   - If a task is bound, write a `pending-pause.json` marker under the
//     session dir with `{stoppedAt, issue, sessionId}`.
//   - Zero network I/O. The matching `on-user-prompt` hook does the post.
//
// Tolerates absence of `CLAUDE_SESSION_ID` (no-ops) and read errors on the
// active-task file (no-ops). Never throws — a misbehaving hook must not
// break the session.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getProjectDir, sessionDir } from '../paths.mjs';
import { getActiveTask } from '../session-state.mjs';

function currentSid(env = process.env) {
  return env.CLAUDE_SESSION_ID || env.AI_TASK_MANAGER_SESSION_ID || null;
}

export function pendingPausePath(sid, projDir = getProjectDir()) {
  return path.join(sessionDir(sid, projDir), 'pending-pause.json');
}

export function buildPayload(active, sid, nowIso = new Date().toISOString()) {
  return {
    stoppedAt: nowIso,
    issue: active?.issue ?? null,
    sessionId: sid,
  };
}

export function recordPendingPause({
  env = process.env,
  now = () => new Date().toISOString(),
} = {}) {
  const sid = currentSid(env);
  if (!sid) return { status: 'no-session' };
  const projDir = getProjectDir(env);
  let active = null;
  try {
    active = getActiveTask(sid, projDir);
  } catch {
    return { status: 'no-active' };
  }
  if (!active || !active.issue) return { status: 'no-active' };
  const payload = buildPayload(active, sid, now());
  const p = pendingPausePath(sid, projDir);
  try {
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  } catch {
    return { status: 'write-failed' };
  }
  return { status: 'ok', path: p, payload };
}

// CLI entry — invoked by Claude Code via the `Stop` hook. Always exits 0
// so a hook failure cannot break the user's session.
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/on-stop.mjs') ||
  process.argv[1]?.endsWith('\\on-stop.mjs');
if (invokedDirectly) {
  try {
    recordPendingPause();
  } catch {
    /* swallow */
  }
  process.exit(0);
}
