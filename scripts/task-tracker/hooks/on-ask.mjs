#!/usr/bin/env node
// #240 / #1857: question hooks close the invoking actor's current interval
// through the shared publication journal. The durable, versioned question
// marker preserves the exact reply row across an ambiguous publication retry.
// A genuine manual pause stays paused. Human response wait is not actor work;
// unavailable activity estimates remain Unknown. Public rows contain only
// opaque actor keys; the exact session identity stays in the local marker.
// Hook CLI failures report unresolved timing without preventing the question.
// Whole-operation writer leases and durable store activation are owned by the
// coupled runtime migration; these producers do not activate new storage.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { getProjectDir, sessionDir } from '../paths.mjs';
import { getActiveTask } from '../session-state.mjs';
import { loadState, saveState, pauseTimingKeepBinding } from '../state.mjs';
import { buildRow } from '../gh-timing-comment.mjs';
import { currentSessionId, aiAppName } from '../word-counter.mjs';
import { timingActorKey } from '../lib/timing-actor.mjs';
import { parseTimingRow, timingTimestampToMs } from '../lib/timing-row-reader.mjs';

// Window within which a freshly-landed manual `/task pause` row suppresses the
// auto pause (AC4: "within the last 2s").
export const ASK_PAUSE_DEDUP_WINDOW_MS = 2000;

// Table timestamp matcher — accepts both legacy minute-precision and current
// second-precision forms, mirroring `gh-timing-comment.mjs`.
const TS_PATTERN = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})? [+-]\d{2}:\d{2}/;

function currentSid(env = process.env) {
  return env.AI_TASK_MANAGER_SESSION_ID || env.CLAUDE_SESSION_ID || null;
}

export function pendingAskPath(sid, projDir = getProjectDir()) {
  return path.join(sessionDir(sid, projDir), 'pending-ask.json');
}

function readMarker(p) {
  if (!existsSync(p)) return null;
  try {
    const marker = JSON.parse(readFileSync(p, 'utf8'));
    if (
      !marker ||
      typeof marker !== 'object' ||
      Array.isArray(marker) ||
      typeof marker.issue !== 'string' ||
      typeof marker.pausedAt !== 'string' ||
      marker.schema !== 'aitm.pending-ask/v1' ||
      Object.keys(marker).sort().join(',') !==
        ['schema', 'actor', 'sessionId', 'issue', 'pausedAt', 'resumeRow'].sort().join(',') ||
      marker.actor !== timingActorKey({ provider: aiAppName(), sid: marker.sessionId }) ||
      !new RegExp('^#[1-9][0-9]*$').test(marker.issue) ||
      !Number.isFinite(Date.parse(marker.pausedAt)) ||
      (marker.resumeRow !== null &&
        (typeof marker.resumeRow !== 'string' ||
          parseTimingRow(marker.resumeRow)?.actorKey !== marker.actor))
    )
      throw new Error('invalid marker');
    if (marker.resumeRow !== null) {
      const row = parseTimingRow(marker.resumeRow);
      const interval = row.engagement;
      const timestamp = timingTimestampToMs(row.ts);
      if (
        row.event !== 'resume' ||
        !interval ||
        interval.startMs !== interval.endMs ||
        interval.startMs < Date.parse(marker.pausedAt) ||
        !Number.isFinite(timestamp) ||
        Math.floor(interval.endMs / 1000) !== Math.floor(timestamp / 1000) ||
        interval.activeEstimateSec !== null ||
        [interval.wordStart, interval.wordEnd, interval.fullWordStart, interval.fullWordEnd].some(
          (value) => value !== null
        ) ||
        row.cells[3] !== 'Unknown' ||
        row.cells[4] !== 'Unknown'
      )
        throw new Error('invalid resume');
    }
    return marker;
  } catch {
    throw new Error('ASK_MARKER_INVALID');
  }
}
function writeMarker(p, value) {
  mkdirSync(path.dirname(p), { recursive: true });
  const temporary = p + '.tmp.' + process.pid;
  writeFileSync(temporary, JSON.stringify(value) + '\n');
  renameSync(temporary, p);
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
  // #516 — accept both the new `paused` slug and the legacy `pause`.
  if (event !== 'pause' && event !== 'paused') return false;
  const m = ts && ts.match(TS_PATTERN);
  if (!m) return false;
  const tsMs = Date.parse(m[0]);
  if (!Number.isFinite(tsMs)) return false;
  return tsMs <= nowMs && nowMs - tsMs <= windowMs;
}

async function actorContext(deps) {
  return deps.context ?? (await import('../runtime.mjs')).buildContext(['status']);
}

// A question pauses only the genuine invoking actor; another actor's latest
// row cannot suppress this boundary. Publication uses the shared flush journal.
export async function recordAskPause({ env = process.env, deps = {} } = {}) {
  const sid = currentSid(env);
  if (!sid) return { status: 'no-session' };
  const projDir = getProjectDir(env);
  const active = getActiveTask(sid, projDir);
  if (!active || !active.issue) return { status: 'no-active' };
  if (sid !== currentSessionId()) throw new Error('ASK_ACTOR_MISMATCH');
  const markerPath = pendingAskPath(sid, projDir);
  const pending = readMarker(markerPath);
  if (pending) {
    if (pending.issue !== active.issue || pending.sessionId !== sid)
      throw new Error('ASK_BINDING_CHANGED');
    return { status: 'pending' };
  }
  const ctx = await actorContext(deps);
  if (path.resolve(ctx.projectDir) !== path.resolve(projDir)) throw new Error('ASK_ROOT_MISMATCH');
  const state = loadState(ctx.statePath);
  if (!state.entryStartTs) return { status: 'recent-pause' };
  const issue = active.issue;
  const result = await ctx.flushActiveToGH(state, 'paused', 'waiting for question response');
  const current = loadState(ctx.statePath);
  if (current.active !== issue) throw new Error('ASK_BINDING_CHANGED');
  saveState(pauseTimingKeepBinding(current, issue), ctx.statePath);
  writeMarker(markerPath, {
    schema: 'aitm.pending-ask/v1',
    actor: timingActorKey({ provider: aiAppName(), sid }),
    sessionId: sid,
    issue,
    pausedAt: result.ts,
    resumeRow: null,
  });
  return { status: 'ok', issue, row: result.row };
}

// Freeze the original reply row before publication. An ambiguous retry reuses
// those bytes; the human wait never becomes an actor engagement interval.
export async function finalizeAskResume({
  env = process.env,
  now = () => new Date(),
  deps = {},
} = {}) {
  const sid = currentSid(env);
  if (!sid) return { status: 'no-session' };
  if (sid !== currentSessionId()) throw new Error('ASK_ACTOR_MISMATCH');
  const projDir = getProjectDir(env);
  const markerPath = pendingAskPath(sid, projDir);
  const marker = readMarker(markerPath);
  if (!marker) return { status: 'no-marker' };
  if (marker.sessionId !== sid) throw new Error('ASK_ACTOR_MISMATCH');
  const ctx = await actorContext(deps);
  if (path.resolve(ctx.projectDir) !== path.resolve(projDir)) throw new Error('ASK_ROOT_MISMATCH');
  const state = loadState(ctx.statePath);
  if (state.active !== marker.issue) throw new Error('ASK_BINDING_CHANGED');
  if (state.entryStartTs) {
    if (!marker.resumeRow) throw new Error('ASK_STATE_CHANGED');
    rmSync(markerPath);
    return { status: 'already-resumed', issue: marker.issue };
  }
  const nowDate = now();
  const idleSec = computeGapSeconds(marker.pausedAt, nowDate.getTime());
  if (!marker.resumeRow) {
    marker.resumeRow = buildRow({
      ts: nowDate.toISOString(),
      actorKey: marker.actor,
      engagement: {
        startMs: nowDate.getTime(),
        endMs: nowDate.getTime(),
        activeEstimateSec: null,
        wordStart: null,
        wordEnd: null,
        fullWordStart: null,
        fullWordEnd: null,
      },
      event: 'resume',
      activeSec: null,
      idleSec: null,
      deltaWords: 0,
      wordMarker: state.lastWordMarker,
      fullWordMarker: state.lastFullWordMarker,
      description: 'question response received',
    });
    writeMarker(markerPath, marker);
  }
  const post = await ctx.safePostTiming(marker.issue, marker.resumeRow);
  if (post?.ok !== true && post?.queued !== true) throw new Error('ASK_PUBLICATION_UNRESOLVED');
  const fresh = loadState(ctx.statePath);
  if (fresh.active !== marker.issue || fresh.entryStartTs !== null)
    throw new Error('ASK_STATE_CHANGED');
  saveState(
    {
      ...fresh,
      entryStartTs: new Date().toISOString(),
      paused: false,
      wordsAtEntryStart: fresh.lastWordMarker,
      fullWordsAtEntryStart: fresh.lastFullWordMarker,
    },
    ctx.statePath
  );
  rmSync(markerPath);
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
    .catch((error) => {
      console.error('AITM question timing unresolved:', error.message);
    })
    .finally(() => process.exit(0));
}
