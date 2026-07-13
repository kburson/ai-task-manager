#!/usr/bin/env node
// INTERNAL — DO NOT INVOKE DIRECTLY, and not exposed through `aitm`.
// Plumbing: invoked only by the Claude Code hook runner, never by a human or
// the AI. See bin/aitm-registry.mjs (INTERNAL map) for the rationale.
//
// Invoked by .claude/hooks/task-tracker.sh with hook JSON on stdin.
// Routes PreCompact / PostCompact / SessionStart to appropriate handlers.

import { readFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { loadState, saveState, advanceWordMarker, clearActive } from './state.mjs';
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
import { enqueue, drain } from './queue.mjs';
import {
  findMainWorktreePath,
  currentBranch,
  fleetRegistryPath,
  readFleet,
} from './fleet-registry.mjs';
import { getProjectDir, sessionDir } from './paths.mjs';

const pexec = promisify(execFile);

const projectDir = getProjectDir();
const cfg = loadConfig();
const statePath = path.join(projectDir, cfg.statePath);
const queuePath = path.join(projectDir, cfg.queuePath);

// Decides whether a stale `lastActive` reflects a paused task or a closed/gone
// one. /task pause persists `status: "paused"` in the fleet registry; /task
// close deregisters the entry entirely. Exported for unit testing.
export function isPausedTask(fleet, lastActive) {
  if (!lastActive) return false;
  const entry = fleet && fleet[lastActive];
  return entry?.status === 'paused';
}

// #709 — pure predicate: is this GitHub issue state terminal (Done/closed)?
// True only for CLOSED (case-insensitive, whitespace-tolerant). Every other
// value — OPEN, MERGED, unknown, empty, null, undefined — returns false so the
// caller fails OPEN to today's rebind/recovery behavior. Exported for testing.
export function isTerminalIssueState(state) {
  return (
    String(state ?? '')
      .trim()
      .toUpperCase() === 'CLOSED'
  );
}

// #709 — read an issue's GitHub state ("OPEN"/"CLOSED") via `gh issue view`.
// Returns the trimmed state string, or `null` on ANY error/timeout, empty
// output, or a non-numeric `active` ref (e.g. `discover`). A null return means
// "unknown" and callers must fall open — we never drop a live timer over a
// network blip. `run` is injectable so unit tests avoid shelling out. Exported
// for testing.
export async function fetchIssueState(active, { repo, timeoutMs, run = pexec } = {}) {
  if (!/^\d+$/.test(String(active ?? ''))) return null;
  try {
    const args = ['issue', 'view', String(active), '--json', 'state', '--jq', '.state'];
    if (repo) args.push('--repo', repo);
    const { stdout } = await run('gh', args, { timeout: timeoutMs });
    const s = String(stdout ?? '').trim();
    return s || null;
  } catch {
    return null;
  }
}

// #709 — atomic once-per-session claim for the session-end-recovery post. Two
// SessionStart hook invocations racing on the same session id must not both
// stamp the recovery row. `openSync(lockPath, 'wx')` is O_EXCL: exactly one
// caller creates the file and returns true; a concurrent caller hits EEXIST and
// returns false. Any other error propagates. Exported for testing.
export function claimRecoveryOnce(lockPath) {
  try {
    closeSync(openSync(lockPath, 'wx'));
    return true;
  } catch (err) {
    if (err && err.code === 'EEXIST') return false;
    throw err;
  }
}

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
  // #407 — bound-but-paused state: a non-terminal verb (test/review) leaves
  // `active` set with no open timing session (`entryStartTs` null). There is
  // no wall-time window to flush on pre-compact, so skip rather than
  // dereference a null timestamp.
  if (!s.entryStartTs) return;
  const marker = loadMarker(markerPathFor(sid));
  const {
    count: newWords,
    totalLines,
    fullExpansion: newWordsFull,
  } = countWords(jsonlPath(sid), marker.line);
  const ts = new Date().toISOString();
  // #475 AC1 — advance + persist the durable monotonic marker on every flush.
  const wordMarker = advanceWordMarker(s.lastWordMarker, s.wordsAtEntryStart + newWords);
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
    deltaWordsFull: newWordsFull,
    wordMarker,
    description: 'context compacted',
  });
  await safePost(s.active, row);
  saveMarker(markerPathFor(sid), totalLines, 0, s.active);
  saveState(
    { ...s, entryStartTs: ts, wordsAtEntryStart: wordMarker, lastWordMarker: wordMarker },
    statePath
  );
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
    deltaWordsFull: 0,
    // #475 AC1 — carry the durable marker forward across compact
    wordMarker: advanceWordMarker(s.lastWordMarker, s.wordsAtEntryStart),
    description: 'resumed after compact',
  });
  await safePost(s.active, row);
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
  } catch {
    /* best-effort: GitHub/telemetry side effect; core flow proceeds */
  }
}

async function bestEffortDrainQueue() {
  if (process.env.TT_SKIP_NETWORK === '1') return;
  try {
    await drain(async (evt) => {
      if (evt.kind === 'timing') {
        await postTimingEvent({
          issueNumber: evt.issue,
          repo: cfg.repo,
          row: evt.row,
          timeoutMs: cfg.hookNetworkTimeoutMs,
        });
      }
    }, queuePath);
  } catch {
    /* best-effort: failure must not abort the primary operation */
  }
}

async function onSessionStart(sid) {
  emitWorktreeBanner();
  // #575 — no template self-heal: `.ai-task-manager/templates/` is git-tracked
  // (#574), so a fresh `git worktree add` checkout already carries every
  // behavioral contract. Seeding is structurally unnecessary.
  await bestEffortDrainQueue();
  // (#89) Sweep orphaned session-override files older than the configured TTL.
  try {
    const { sweepOrphans } = await import('./lib/session-store.mjs');
    const { loadConfig } = await import('./config.mjs');
    const c = loadConfig();
    sweepOrphans({ maxAgeMs: c.deadSessionMaxAgeMs });
  } catch {
    /* best-effort: failure must not abort the primary operation */
  }
  // (#215) Sweep stale `.ai-task-manager/sessions/<sid>/` dirs older than
  // `sessionRetentionDays`. Any orphan pause marker in the dir is finalized
  // BEFORE removal (row goes to the issue named in the marker). Best-effort
  // — never blocks session startup. All marker I/O is centralized in
  // orphan-finalize.mjs (see AC8).
  try {
    const { sweepStaleSessionDirs } = await import('./orphan-finalize.mjs');
    await sweepStaleSessionDirs({ projDir: projectDir });
  } catch {
    /* best-effort: failure must not abort the primary operation */
  }
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

  // No active task — could be paused or closed. Disambiguate via fleet
  // registry: pause persists `status: "paused"`, close removes the entry.
  if (!s.active) {
    let fleet = {};
    try {
      // #441 — guard-time lazy auto-reap. This is the only readFleet on the
      // SessionEnd path, so opt into reap here: it stays a pure scan when the
      // registry is clean and only locks+rewrites when stale entries exist
      // (gone worktrees, aged-out actives, leaked active main binds). activeRef
      // is undefined in this no-active branch, so paused binds survive while
      // leaked active main binds get cleaned.
      const mainPath = findMainWorktreePath(projectDir);
      fleet = readFleet(fleetRegistryPath(mainPath), {
        reap: true,
        reapCtx: {
          nowMs: Date.now(),
          activeRef: s.active || undefined,
          mainWorktreePath: mainPath,
        },
      });
    } catch {
      // Fall through with empty fleet → treated as no-active.
    }
    if (isPausedTask(fleet, s.lastActive)) {
      console.log(`[task-tracker] ${s.lastActive} is paused. Use /task start to resume.`);
    } else {
      console.log('[task-tracker] No active task.');
    }
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

  // #709 — terminal-state guard. An issue can reach Done out-of-band (e.g. a
  // GitHub PR auto-close) while still named by `s.active`; nothing else clears
  // the binding. Without this check the branch below would re-arm the timer and
  // accrue idle `session-end-recovery` + `session-start` rows against a Done
  // issue on every subsequent session start. Read the board state first; if it
  // is terminal, drop the stale binding and return WITHOUT posting. A null
  // fetch (offline / gh error) is "unknown" → fall open to the existing
  // recovery/rebind behavior; never sacrifice real wall-time recovery to a blip.
  const activeState = await fetchIssueState(s.active, {
    repo: cfg.repo,
    timeoutMs: cfg.hookNetworkTimeoutMs,
  });
  if (isTerminalIssueState(activeState)) {
    clearActive(statePath);
    if (sid) {
      const { totalLines } = countWords(jsonlPath(sid), 0);
      saveMarker(markerPathFor(sid), totalLines, 0, null);
    }
    console.log(
      `[task-tracker] ${s.active} reached Done out-of-band — timer unbound, no recovery logged.`
    );
    return;
  }

  // Active task — session closed without /task pause; recover unlogged wall time
  const nowTs = new Date().toISOString();
  const wallMin = s.entryStartTs
    ? Math.round((Date.now() - new Date(s.entryStartTs).getTime()) / 60000)
    : 0;

  if (wallMin > 0) {
    // #709 — idempotent per session id. Two racing SessionStart invocations both
    // read the same pre-write `entryStartTs` and compute the same `wallMin`;
    // without a claim they double-stamp the recovery row ~1s apart. Claim an
    // atomic O_EXCL lock under the session dir — only the winner posts. No sid
    // (no session context) retains today's behavior. Claim-machinery failure
    // fails open to posting rather than dropping real recovered time.
    let mayPostRecovery = true;
    if (sid) {
      try {
        const dir = sessionDir(sid);
        mkdirSync(dir, { recursive: true });
        mayPostRecovery = claimRecoveryOnce(path.join(dir, 'recovery.lock'));
      } catch {
        mayPostRecovery = true;
      }
    }
    if (mayPostRecovery) {
      const recoveryRow = buildRow({
        ts: nowTs,
        event: 'session-end-recovery',
        activeMin: wallMin,
        idleMin: 0,
        deltaWords: 0,
        deltaWordsFull: 0,
        // #475 AC1 — carried-forward durable marker (recovery row, no live session)
        wordMarker: advanceWordMarker(s.lastWordMarker, s.wordsAtEntryStart),
        description: 'recovered — session closed without /task pause (wall time only)',
      });
      await safePost(s.active, recoveryRow);
    }
  }

  let newWordBaseline = s.wordsAtEntryStart;
  if (sid) {
    const { totalLines, count, fullExpansion } = countWords(jsonlPath(sid), 0);
    newWordBaseline = count;
    // #795 — persist the full-expansion baseline alongside the stay-abreast
    // count so the runtime flush path reads a meaningful `wordsFull` cursor.
    saveMarker(markerPathFor(sid), totalLines, count, s.active, fullExpansion);
    const startRow = buildRow({
      ts: nowTs,
      event: 'session-start',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      deltaWordsFull: 0,
      // #475 AC1 — monotonic carry-forward of the durable marker
      wordMarker: advanceWordMarker(s.lastWordMarker, newWordBaseline),
      description: 'session resumed',
    });
    await safePost(s.active, startRow);
  }

  saveState(
    {
      ...s,
      entryStartTs: nowTs,
      wordsAtEntryStart: newWordBaseline,
      // #475 AC1 — persist the durable monotonic marker across the recovery.
      lastWordMarker: advanceWordMarker(s.lastWordMarker, newWordBaseline),
    },
    statePath
  );

  const recoveryNote =
    wallMin > 0 ? ` — logged ~${wallMin} min from prior session (wall time only)` : '';
  console.log(
    `[task-tracker] ${s.active} is active${recoveryNote}. Use /task pause or /task end before closing Claude, running /clear, or switching sessions.`
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain)
  (async () => {
    let payload = {};
    try {
      payload = JSON.parse(readStdin() || '{}');
    } catch {
      /* best-effort: optional read; fall back to default on parse/IO error */
    }
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
