#!/usr/bin/env node
// Claude Code `Stop` hook — audits the bound issue's ⏱ Timing Log for the
// current session and warns (to stderr) when `pause` and `resume` rows do not
// balance.
//
// EPIC #238 / #241 — child (e). Child (d) (#240) brackets a mid-turn
// `AskUserQuestion` with a paired pause/resume row. But a clarifying question
// asked in plain chat never goes through `AskUserQuestion`, so its pause is
// never recorded — and any session that ends inside an open pause window
// likewise leaves the log lopsided. This hook is the safety net: at session
// end it counts the current session's pause vs resume rows and, when they
// disagree, surfaces a one-line warning naming the bound issue and the delta.
//
// Strict scope:
//   - Read $CLAUDE_SESSION_ID (or AI_TASK_MANAGER_SESSION_ID) for the sid.
//   - Resolve the bound active task via session-state. No-op when nothing is
//     bound (AC5).
//   - Fetch the ⏱ Timing Log body and count rows whose Description cell is
//     tagged `sess: <sid>` (the per-session slice — AC2).
//   - Warn-only: emit one stderr line on imbalance (AC3); never write the
//     issue body, never mutate over the network. Auto-correction is out of
//     scope.
//
// Fail-open: every resolution/read error is swallowed and the CLI always
// exits 0 — a misbehaving Stop hook must never break the user's session.

import { getProjectDir } from '../paths.mjs';
import { getActiveTask } from '../session-state.mjs';
import { loadConfig } from '../config.mjs';
import { readTimingCommentBody, bodyOf } from '../gh-timing-comment.mjs';
import { readFileSync } from 'node:fs';

function parseHookPayload(stdin = '') {
  if (!stdin) return {};
  try {
    return JSON.parse(stdin);
  } catch {
    return {};
  }
}

function readHookStdin() {
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function currentSid(env = process.env, payload = {}) {
  return (
    env.CLAUDE_SESSION_ID ||
    env.AI_TASK_MANAGER_SESSION_ID ||
    env.CODEX_SESSION_ID ||
    payload.session_id ||
    null
  );
}

// Pure parser. Counts `pause` vs `resume` rows in the slice of the timing
// table tagged for `sid` (Description cell contains `sess: <sid>`). Returns
// `delta = pauseCount - resumeCount` and `balanced` (delta === 0). The trivial
// empty-slice / empty-body case yields 0/0 → balanced (AC4).
export function auditPauseResume(body, sid) {
  let pauseCount = 0;
  let resumeCount = 0;
  if (body && typeof body === 'string' && sid) {
    const needle = `sess: ${sid}`;
    for (const line of body.split('\n')) {
      if (!line.startsWith('| ')) continue;
      if (line.startsWith('| Timestamp') || line.startsWith('|---')) continue;
      if (!line.includes(needle)) continue;
      const cells = line.split('|').map((s) => s.trim());
      const event = (cells[2] || '').toLowerCase();
      // #516 — pause row renamed `pause` → `paused`; count both spellings so the
      // pause/resume balance stays correct across historical and new logs.
      if (event === 'pause' || event === 'paused') pauseCount += 1;
      else if (event === 'resume') resumeCount += 1;
    }
  }
  const delta = pauseCount - resumeCount;
  return { pauseCount, resumeCount, delta, balanced: delta === 0 };
}

// Pure formatter. Produces the single stderr line naming the bound issue and
// the count delta. `delta > 0` means more pauses than resumes (an open pause
// window); `delta < 0` means a stray resume.
export function formatWarning(issue, audit) {
  const { pauseCount, resumeCount, delta } = audit;
  const n = Math.abs(delta);
  const kind = delta > 0 ? 'unresumed pause' : 'unpaired resume';
  const plural = n === 1 ? '' : 's';
  return (
    `[task] #${issue}: unbalanced pause/resume rows in this session's ⏱ Timing Log — ` +
    `${pauseCount} pause / ${resumeCount} resume (${n} ${kind}${plural}). ` +
    `A question may have been asked without /task pause, or the session ended inside an open pause window.`
  );
}

// Resolve the bound issue, fetch its timing log, audit the session slice, and
// warn on imbalance. Never throws.
export async function runStopAudit({ env = process.env, deps = {}, hookInput = {} } = {}) {
  const payload = typeof hookInput === 'string' ? parseHookPayload(hookInput) : hookInput;
  const sid = currentSid(env, payload);
  if (!sid) return { status: 'no-session' };

  const projDir = getProjectDir(env);
  const resolveActive = deps.getActiveTask || getActiveTask;
  let active = null;
  try {
    active = resolveActive(sid, projDir);
  } catch {
    return { status: 'no-active' };
  }
  if (!active || !active.issue) return { status: 'no-active' };

  const cfg = (deps.loadConfig || loadConfig)();
  const readBody = deps.readTimingCommentBody || readTimingCommentBody;
  let body = '';
  try {
    body = bodyOf(
      await readBody({
        issueNumber: active.issue,
        repo: cfg.repo,
        timeoutMs: cfg.hookNetworkTimeoutMs,
      })
    );
  } catch {
    return { status: 'read-failed', issue: active.issue };
  }

  const audit = auditPauseResume(body, sid);
  if (audit.balanced) return { status: 'balanced', issue: active.issue, audit };

  const warn = deps.warn || ((msg) => process.stderr.write(msg + '\n'));
  warn(formatWarning(active.issue, audit));
  return { status: 'warned', issue: active.issue, audit };
}

// CLI entry — invoked by Claude Code via the `Stop` hook. Always exits 0 so a
// hook failure cannot break the user's session.
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/stop-audit-pause-resume.mjs') ||
  process.argv[1]?.endsWith('\\stop-audit-pause-resume.mjs');
if (invokedDirectly) {
  runStopAudit({ hookInput: readHookStdin() })
    .catch(() => {})
    .finally(() => process.exit(0));
}
