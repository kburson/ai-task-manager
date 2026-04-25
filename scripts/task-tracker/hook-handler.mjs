#!/usr/bin/env node
// Invoked by .claude/hooks/task-tracker.sh with hook JSON on stdin.
// Routes PreCompact / PostCompact / SessionStart to appropriate handlers.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { loadState, saveState } from './state.mjs';
import { postTimingEvent, buildRow } from './gh-timing-comment.mjs';
import {
  jsonlPath, markerPathFor, loadMarker, saveMarker, countWords, currentSessionId,
} from './word-counter.mjs';
import { collectEventTimestamps, computeActiveMinutes } from './active-time.mjs';
import { enqueue } from './queue.mjs';

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const cfg = loadConfig();
const statePath = path.join(projectDir, cfg.statePath);
const queuePath = path.join(projectDir, cfg.queuePath);

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

async function safePost(issue, row, cumWords) {
  try {
    await postTimingEvent({
      issueNumber: issue, repo: cfg.repo, row, cumMin: 0, cumWords,
      timeoutMs: cfg.hookNetworkTimeoutMs,
    });
  } catch (err) {
    enqueue({ kind: 'timing', issue, row, cumMin: 0, cumWords }, queuePath);
  }
}

async function onPreCompact(sid) {
  const s = loadState(statePath);
  if (!s.active || s.active === 'plan') return;
  const marker = loadMarker(markerPathFor(sid));
  const { count: newWords, totalLines } = countWords(jsonlPath(sid), marker.line);
  const ts = new Date().toISOString();
  const cumWords = s.wordsAtEntryStart + newWords;
  const startMs = new Date(s.entryStartTs).getTime();
  const endMs = Date.now();
  const events = collectEventTimestamps(jsonlPath(sid), startMs, endMs);
  const deltaMin = computeActiveMinutes({
    startMs, endMs, events,
    idleThresholdMs: cfg.idleThresholdMinutes * 60_000,
  });
  const row = buildRow({
    ts, event: 'pre-compact-flush', deltaMin, deltaWords: newWords,
    cumMin: deltaMin, cumWords,
  });
  await safePost(s.active, row, cumWords);
  saveMarker(markerPathFor(sid), totalLines, 0, s.active);
  saveState({ ...s, entryStartTs: ts, wordsAtEntryStart: cumWords }, statePath);
}

async function onPostCompact(sid) {
  const s = loadState(statePath);
  if (!s.active || s.active === 'plan') return;
  const { totalLines } = countWords(jsonlPath(sid), 0);
  saveMarker(markerPathFor(sid), totalLines, 0, s.active);
  const row = buildRow({
    ts: new Date().toISOString(), event: 'post-compact-resume',
    deltaMin: null, deltaWords: null, cumMin: 0, cumWords: s.wordsAtEntryStart,
  });
  await safePost(s.active, row, s.wordsAtEntryStart);
}

async function onSessionStart(sid) {
  const s = loadState(statePath);
  if (!s.active || s.active === 'plan') {
    if (sid) {
      const { totalLines } = countWords(jsonlPath(sid), 0);
      saveMarker(markerPathFor(sid), totalLines, 0, null);
    }
    return;
  }
  if (sid) {
    const { totalLines, count } = countWords(jsonlPath(sid), 0);
    saveMarker(markerPathFor(sid), totalLines, count, s.active);
    const row = buildRow({
      ts: new Date().toISOString(), event: 'session-start',
      deltaMin: null, deltaWords: null, cumMin: 0, cumWords: s.wordsAtEntryStart,
    });
    await safePost(s.active, row, s.wordsAtEntryStart);
  }
}

(async () => {
  let payload = {};
  try { payload = JSON.parse(readStdin() || '{}'); } catch {}
  const sid = payload.session_id || currentSessionId();
  const event = payload.hook_event_name || process.argv[2];
  try {
    if (event === 'PreCompact')       await onPreCompact(sid);
    else if (event === 'PostCompact') await onPostCompact(sid);
    else if (event === 'SessionStart')await onSessionStart(sid);
  } catch (err) {
    console.error(`[task-tracker-hook] ${event}: ${err.message}`);
  }
  process.exit(0);
})();
