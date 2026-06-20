#!/usr/bin/env node
// Claude Code `PreToolUse` / `PostToolUse` hooks scoped to the
// `AskUserQuestion` tool — brackets a mid-turn clarifying question with a
// paired `pause`/`resume` row on the bound issue's `⏱ Timing Log`.
//
// EPIC #238 / #240. The turn-boundary pause/resume system (EPIC #207 — the
// `Stop` + `UserPromptSubmit` hooks) only fires at turn end. A clarifying
// question raised mid-turn never trips the `Stop` hook, so the wall-clock the
// operator spends answering it is invisible to the timing log. These two
// hooks close that gap:
//
//   - `recordAskPause`  (PreToolUse)  appends a `pause` row immediately before
//     the question prompt is shown, and stamps a `pending-ask.json` marker
//     under the session dir capturing `{pausedAt, issue, sessionId}`.
//   - `finalizeAskResume` (PostToolUse) reads that marker, computes the wait
//     in seconds, appends a `resume` row whose idle cell carries the elapsed
//     time, and deletes the marker.
//
// Both entry points resolve the bound issue from the per-session active-task
// record and no-op cleanly when nothing is bound (AC3). Rows are emitted with
// seconds precision via `buildRow`'s `activeSec`/`idleSec` path, which renders
// the fixed-width `formatDurationSeconds` cells (AC5). Both are fail-open: any
// resolution, read, or network error is swallowed so a misbehaving hook can
// never break the user's session.
//
// Idempotency (AC4): if a manual `/task pause` row already landed on the issue
// within the last `ASK_PAUSE_DEDUP_WINDOW_MS`, the pre hook no-ops entirely —
// it writes no marker, so the post hook also no-ops and no auto resume fires
// against a manually-paused task.
//
// Marker isolation: this module owns `pending-ask.json`. The turn-boundary
// marker (EPIC #207) is a separate file owned by `on-stop.mjs` /
// `orphan-finalize.mjs`; the two never share a marker.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getProjectDir, sessionDir } from '../paths.mjs';
import { getActiveTask } from '../session-state.mjs';
import { durableWordMarker } from '../state.mjs';
import { loadConfig } from '../config.mjs';
import { postTimingEvent, buildRow } from '../gh-timing-comment.mjs';
import { enqueue } from '../queue.mjs';

// Window within which a freshly-landed manual `/task pause` row suppresses the
// auto pause (AC4: "within the last 2s").
export const ASK_PAUSE_DEDUP_WINDOW_MS = 2000;

// Table timestamp matcher — accepts both legacy minute-precision and current
// second-precision forms, mirroring `gh-timing-comment.mjs`.
const TS_PATTERN = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})? [+-]\d{2}:\d{2}/;

function currentSid(env = process.env) {
  return env.CLAUDE_SESSION_ID || env.AI_TASK_MANAGER_SESSION_ID || null;
}

export function pendingAskPath(sid, projDir = getProjectDir()) {
  return path.join(sessionDir(sid, projDir), 'pending-ask.json');
}

function readMarker(p) {
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function deleteMarker(p) {
  try {
    rmSync(p);
  } catch {
    /* tolerate */
  }
}

export function computeGapSeconds(pausedAt, nowMs = Date.now()) {
  const t = Date.parse(pausedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

// True when the LAST data row of the timing comment is a `pause` row whose
// timestamp is within `windowMs` of `nowMs`. Used to suppress a duplicate
// auto pause when a manual `/task pause` just landed (AC4).
export function lastRowIsRecentPause(body, nowMs, windowMs = ASK_PAUSE_DEDUP_WINDOW_MS) {
  if (!body || typeof body !== 'string') return false;
  let last = null;
  for (const line of body.split('\n')) {
    if (!line.startsWith('| ')) continue;
    if (line.startsWith('| Timestamp') || line.startsWith('|---')) continue;
    last = line;
  }
  if (!last) return false;
  const cells = last.split('|').map((s) => s.trim());
  // cells: ['', ts, event, active, idle, words, marker, description, ...]
  const ts = cells[1];
  const event = (cells[2] || '').toLowerCase();
  if (event !== 'pause') return false;
  const m = ts && ts.match(TS_PATTERN);
  if (!m) return false;
  const tsMs = Date.parse(m[0]);
  if (!Number.isFinite(tsMs)) return false;
  return tsMs <= nowMs && nowMs - tsMs <= windowMs;
}

async function fetchTimingBody({ cfg, issue, deps }) {
  if (deps.fetchTimingBody) return deps.fetchTimingBody({ cfg, issue });
  // Lazy import keeps the dependency optional for unit tests that inject
  // `deps.fetchTimingBody`.
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const pexec = promisify(execFile);
  try {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', String(issue), '-R', cfg.repo, '--json', 'comments'],
      { timeout: cfg.hookNetworkTimeoutMs || 2000 }
    );
    const { comments } = JSON.parse(stdout);
    const hit = (comments || []).find((c) => c.body && c.body.includes('⏱ Timing Log'));
    return hit ? hit.body : '';
  } catch {
    return '';
  }
}

async function postOrEnqueue({ cfg, projDir, issue, row, deps }) {
  const postFn = deps.postTimingEvent || postTimingEvent;
  const enqueueFn = deps.enqueue || enqueue;
  try {
    await postFn({
      issueNumber: issue,
      repo: cfg.repo,
      row,
      timeoutMs: cfg.hookNetworkTimeoutMs,
    });
  } catch {
    try {
      enqueueFn({ kind: 'timing', issue, row }, path.join(projDir, cfg.queuePath));
    } catch {
      /* drop on the floor; never break a hook */
    }
  }
}

// PreToolUse(AskUserQuestion) — append a `pause` row and stamp the marker.
// Returns a coarse status object for tests. Never throws.
export async function recordAskPause({
  env = process.env,
  now = () => new Date(),
  deps = {},
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

  const cfg = loadConfig();
  const nowDate = now();
  const nowMs = nowDate.getTime();
  const nowIso = nowDate.toISOString();
  const issue = active.issue;

  // AC4 — suppress the auto pause when a manual `/task pause` just landed.
  const body = await fetchTimingBody({ cfg, issue, deps });
  if (lastRowIsRecentPause(body, nowMs)) {
    return { status: 'recent-pause' };
  }

  const row = buildRow({
    ts: nowIso,
    event: 'pause',
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    // #475 AC1 — carried-forward durable marker, never null (auto ask-pause, no live session)
    wordMarker: durableWordMarker(projDir),
    description: `<!-- sess: ${sid} reason: ask-pause -->`,
  });
  await postOrEnqueue({ cfg, projDir, issue, row, deps });

  const markerPath = pendingAskPath(sid, projDir);
  try {
    mkdirSync(path.dirname(markerPath), { recursive: true });
    writeFileSync(
      markerPath,
      JSON.stringify({ pausedAt: nowIso, issue, sessionId: sid }, null, 2) + '\n',
      'utf8'
    );
  } catch {
    return { status: 'marker-write-failed', issue };
  }
  return { status: 'ok', issue, row };
}

// PostToolUse(AskUserQuestion) — read the marker, append a `resume` row whose
// idle cell carries the elapsed wait, and delete the marker. Never throws.
export async function finalizeAskResume({
  env = process.env,
  now = () => new Date(),
  deps = {},
} = {}) {
  const sid = currentSid(env);
  if (!sid) return { status: 'no-session' };
  const projDir = getProjectDir(env);
  const markerPath = pendingAskPath(sid, projDir);
  const marker = readMarker(markerPath);
  if (!marker) return { status: 'no-marker' };

  if (marker.sessionId && marker.sessionId !== sid) {
    process.stderr.write(
      `[task] refusing to consume pending-ask.json from foreign session ${marker.sessionId}\n`
    );
    return { status: 'foreign-session' };
  }
  if (!marker.issue) {
    deleteMarker(markerPath);
    return { status: 'no-issue' };
  }

  const cfg = loadConfig();
  const nowDate = now();
  const idleSec = computeGapSeconds(marker.pausedAt, nowDate.getTime());
  const row = buildRow({
    ts: nowDate.toISOString(),
    event: 'resume',
    activeSec: 0,
    idleSec,
    deltaWords: 0,
    // #475 AC1 — carried-forward durable marker, never null (auto ask-resume, no live session)
    wordMarker: durableWordMarker(projDir),
    description: `<!-- sess: ${sid} reason: ask-resume -->`,
  });
  await postOrEnqueue({ cfg, projDir, issue: marker.issue, row, deps });
  deleteMarker(markerPath);
  return { status: 'ok', issue: marker.issue, idleSec };
}

// CLI entry — invoked by Claude Code. `argv[2]` selects the phase:
//   on-ask.mjs pause   -> PreToolUse
//   on-ask.mjs resume  -> PostToolUse
// Always exits 0 so a hook failure cannot break the session.
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/on-ask.mjs') ||
  process.argv[1]?.endsWith('\\on-ask.mjs');
if (invokedDirectly) {
  const phase = process.argv[2];
  const run = phase === 'resume' ? finalizeAskResume : recordAskPause;
  run()
    .catch(() => {})
    .finally(() => process.exit(0));
}
