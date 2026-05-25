#!/usr/bin/env node
// Claude Code `UserPromptSubmit` hook — drains the pending-pause marker
// dropped by `on-stop.mjs` and, when the inter-turn gap exceeds
// `pauseThresholdSeconds`, posts ONE idle row to the bound issue's
// `⏱ Timing Log` comment marked `<!-- sess: <sid> reason: natural -->`.
//
// EPIC #207 / #213 — Seq 2.
//
// Flow:
//   1. Read $CLAUDE_SESSION_ID; bail when absent.
//   2. Read `.ai-task-manager/sessions/<sid>/pending-pause.json`. If missing,
//      no idle event to record — bail.
//   3. Confirm the bound issue is still the same as when we stopped — if
//      `/task #M` re-bound during the gap, drop the marker without posting
//      (the old binding's timer is no longer authoritative for this gap).
//   4. Compute `gap = now - stoppedAt`. When `gap >= pauseThresholdSeconds`,
//      append one idle row to the issue's timing comment. Otherwise drop
//      silently — sub-threshold gaps are noise.
//   5. Delete the marker file regardless of post outcome (queued posts go
//      through the offline queue).
//
// Errors during posting fall through to the offline queue used elsewhere
// in this codebase. The hook always exits 0.

import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.mjs';
import { getProjectDir } from '../paths.mjs';
import { getActiveTask } from '../session-state.mjs';
import { postTimingEvent, buildRow } from '../gh-timing-comment.mjs';
import { enqueue } from '../queue.mjs';
import { pendingPausePath } from './on-stop.mjs';

function currentSid(env = process.env) {
  return env.CLAUDE_SESSION_ID || env.AI_TASK_MANAGER_SESSION_ID || null;
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

export function computeGapSeconds(stoppedAt, nowMs = Date.now()) {
  const t = Date.parse(stoppedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

export async function processPendingPause({
  env = process.env,
  now = () => new Date(),
  deps = {},
} = {}) {
  const sid = currentSid(env);
  if (!sid) return { status: 'no-session' };
  const projDir = getProjectDir(env);
  const markerPath = pendingPausePath(sid, projDir);
  const marker = readMarker(markerPath);
  if (!marker) return { status: 'no-marker' };

  // Same-binding check: if the active task changed (e.g. `/task #M` during
  // the gap), the old timer is stale.
  let active = null;
  try {
    active = getActiveTask(sid, projDir);
  } catch {
    active = null;
  }
  const stillBound = active && active.issue && active.issue === marker.issue;
  if (!stillBound) {
    deleteMarker(markerPath);
    return { status: 'rebound', marker };
  }

  const cfg = loadConfig();
  const threshold = Number(cfg.pauseThresholdSeconds) || 0;
  const gapSec = computeGapSeconds(marker.stoppedAt, now().getTime());
  if (gapSec < threshold) {
    deleteMarker(markerPath);
    return { status: 'sub-threshold', gapSec };
  }

  const postFn = deps.postTimingEvent || postTimingEvent;
  const enqueueFn = deps.enqueue || enqueue;
  const nowIso = now().toISOString();
  const row = buildRow({
    ts: nowIso,
    event: 'idle',
    idleSec: gapSec,
    activeSec: 0,
    deltaWords: 0,
    wordMarker: null,
    description: `<!-- sess: ${sid} reason: natural -->`,
  });
  try {
    await postFn({
      issueNumber: marker.issue,
      repo: cfg.repo,
      row,
      timeoutMs: cfg.hookNetworkTimeoutMs,
    });
  } catch {
    try {
      enqueueFn({ kind: 'timing', issue: marker.issue, row }, path.join(projDir, cfg.queuePath));
    } catch {
      /* drop on the floor; never break a hook */
    }
  }
  deleteMarker(markerPath);
  return { status: 'posted', gapSec, row };
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/on-user-prompt.mjs') ||
  process.argv[1]?.endsWith('\\on-user-prompt.mjs');
if (invokedDirectly) {
  processPendingPause()
    .catch(() => {})
    .finally(() => process.exit(0));
}
