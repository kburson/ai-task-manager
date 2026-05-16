#!/usr/bin/env node
// Invoked by .claude/hooks/task-tracker.sh with hook JSON on stdin.
// Routes PreCompact / PostCompact / SessionStart to appropriate handlers.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { loadState, saveState } from './state.mjs';
import { postTimingEvent, buildRow } from './gh-timing-comment.mjs';
import {
  jsonlPath,
  markerPathFor,
  loadMarker,
  saveMarker,
  countWords,
  currentSessionId,
  ensureSessionTracking,
} from './word-counter.mjs';
import { collectEventTimestamps, computeActiveAndIdleMinutes } from './active-time.mjs';
import { enqueue } from './queue.mjs';
import { seedMissingTemplates, findMainWorktree } from './seed-worktree.mjs';
import { findMainWorktreePath, currentBranch } from './fleet-registry.mjs';
import { getProjectDir } from './paths.mjs';

const projectDir = getProjectDir();
const cfg = loadConfig();
const statePath = path.join(projectDir, cfg.statePath);
const queuePath = path.join(projectDir, cfg.queuePath);

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function safePost(issue, row) {
  try {
    await postTimingEvent({
      issueNumber: issue,
      repo: cfg.repo,
      row,
      timeoutMs: cfg.hookNetworkTimeoutMs,
    });
  } catch {
    enqueue({ kind: 'timing', issue, row }, queuePath);
  }
}

async function onPreCompact(sid) {
  const s = loadState(statePath);
  if (!s.active || s.active === 'discover') return;
  const marker = loadMarker(markerPathFor(sid));
  const { count: newWords, totalLines } = countWords(jsonlPath(sid), marker.line);
  const ts = new Date().toISOString();
  const wordMarker = s.wordsAtEntryStart + newWords;
  const startMs = new Date(s.entryStartTs).getTime();
  const endMs = Date.now();
  const events = collectEventTimestamps(jsonlPath(sid), startMs, endMs);
  const { activeMin, idleMin } = computeActiveAndIdleMinutes({
    startMs,
    endMs,
    events,
    idleThresholdMs: cfg.idleThresholdMinutes * 60_000,
  });
  const row = buildRow({
    ts,
    event: 'pre-compact-flush',
    activeMin,
    idleMin,
    deltaWords: newWords,
    wordMarker,
    description: 'context compacted',
  });
  await safePost(s.active, row);
  saveMarker(markerPathFor(sid), totalLines, 0, s.active);
  saveState({ ...s, entryStartTs: ts, wordsAtEntryStart: wordMarker }, statePath);
}

async function onPostCompact(sid) {
  const s = loadState(statePath);
  if (!s.active || s.active === 'discover') return;
  const { totalLines } = countWords(jsonlPath(sid), 0);
  saveMarker(markerPathFor(sid), totalLines, 0, s.active);
  const row = buildRow({
    ts: new Date().toISOString(),
    event: 'post-compact-resume',
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: s.wordsAtEntryStart,
    description: 'resumed after compact',
  });
  await safePost(s.active, row);
}

// Self-heal a fresh worktree: Claude Code's `isolation: "worktree"` Agent mode
// runs `git worktree add`, which doesn't carry gitignored files. The pickup
// directive + definition-of-done templates live in .ai-task-manager/ (gitignored)
// and their absence breaks preflight-issue.mjs + templates.test.mjs.
function selfHealTemplates() {
  try {
    const main = findMainWorktree(projectDir);
    if (!main || path.resolve(main) === path.resolve(projectDir)) return;
    const r = seedMissingTemplates({ source: main, target: projectDir });
    if (r.copied && r.copied.length > 0) {
      console.log(
        `[task-tracker] Seeded missing templates from main worktree: ${r.copied.join(', ')}`
      );
    }
  } catch (err) {
    console.error(`[task-tracker] template self-heal failed: ${err.message}`);
  }
}

function emitWorktreeBanner() {
  try {
    const main = findMainWorktreePath(projectDir);
    if (path.resolve(main) === path.resolve(projectDir)) {
      console.log(
        '[task-tracker] WORKSPACE: MAIN — Agent tool spawns will be BLOCKED. Create a worktree first.'
      );
    } else {
      console.log(`[task-tracker] WORKTREE: ✓ ${currentBranch(projectDir)} @ ${projectDir}`);
    }
  } catch {}
}

async function onSessionStart(sid) {
  emitWorktreeBanner();
  selfHealTemplates();
  // (#89) Sweep orphaned session-override files older than the configured TTL.
  try {
    const { sweepOrphans } = await import('./lib/session-store.mjs');
    const { loadConfig } = await import('./config.mjs');
    const c = loadConfig();
    sweepOrphans({ maxAgeMs: c.deadSessionMaxAgeMs });
  } catch {}
  if (sid) ensureSessionTracking(sid);
  const s = loadState(statePath);

  // Nothing active and nothing paused
  if (!s.active && !s.lastActive) {
    console.log('[task-tracker] No active task.');
    if (sid) {
      const { totalLines } = countWords(jsonlPath(sid), 0);
      saveMarker(markerPathFor(sid), totalLines, 0, null);
    }
    return;
  }

  // Was properly paused (active cleared, lastActive preserved)
  if (!s.active) {
    console.log(`[task-tracker] ${s.lastActive} is paused. Use /task start to resume.`);
    if (sid) {
      const { totalLines } = countWords(jsonlPath(sid), 0);
      saveMarker(markerPathFor(sid), totalLines, 0, null);
    }
    return;
  }

  // Discovery bucket active
  if (s.active === 'discover') {
    console.log('[task-tracker] Discovery bucket active. Use /task new to promote to an issue.');
    if (sid) {
      const { totalLines } = countWords(jsonlPath(sid), 0);
      saveMarker(markerPathFor(sid), totalLines, 0, 'discover');
    }
    return;
  }

  // Active task — session closed without /task pause; recover unlogged wall time
  const nowTs = new Date().toISOString();
  const wallMin = s.entryStartTs
    ? Math.round((Date.now() - new Date(s.entryStartTs).getTime()) / 60000)
    : 0;

  if (wallMin > 0) {
    const recoveryRow = buildRow({
      ts: nowTs,
      event: 'session-end-recovery',
      activeMin: wallMin,
      idleMin: 0,
      deltaWords: 0,
      wordMarker: s.wordsAtEntryStart,
      description: 'recovered — session closed without /task pause (wall time only)',
    });
    await safePost(s.active, recoveryRow);
  }

  let newWordBaseline = s.wordsAtEntryStart;
  if (sid) {
    const { totalLines, count } = countWords(jsonlPath(sid), 0);
    newWordBaseline = count;
    saveMarker(markerPathFor(sid), totalLines, count, s.active);
    const startRow = buildRow({
      ts: nowTs,
      event: 'session-start',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      wordMarker: newWordBaseline,
      description: 'session resumed',
    });
    await safePost(s.active, startRow);
  }

  saveState({ ...s, entryStartTs: nowTs, wordsAtEntryStart: newWordBaseline }, statePath);

  const recoveryNote =
    wallMin > 0 ? ` — logged ~${wallMin} min from prior session (wall time only)` : '';
  console.log(
    `[task-tracker] ${s.active} is active${recoveryNote}. Use /task pause or /task end before closing Claude, running /clear, or switching sessions.`
  );
}

(async () => {
  let payload = {};
  try {
    payload = JSON.parse(readStdin() || '{}');
  } catch {}
  const sid = payload.session_id || currentSessionId();
  const event = payload.hook_event_name || process.argv[2];
  try {
    if (event === 'PreCompact') await onPreCompact(sid);
    else if (event === 'PostCompact') await onPostCompact(sid);
    else if (event === 'SessionStart') await onSessionStart(sid);
  } catch (err) {
    console.error(`[task-tracker-hook] ${event}: ${err.message}`);
  }
  process.exit(0);
})();
