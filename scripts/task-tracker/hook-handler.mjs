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
import {
  loadState,
  saveState,
  advanceWordMarker,
  stateFullWordMarker,
  computeTranscriptTailBank,
  clearActive,
} from './state.mjs';
import { postTimingEvent, buildRow } from './gh-timing-comment.mjs';
import { SUSPICIOUS_GAP_SEC } from './lib/bind-event.mjs';
import {
  jsonlPath,
  markerPathFor,
  loadMarker,
  saveMarker,
  countWords,
  currentSessionId,
  ensureSessionTracking,
  aiAppName,
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
import { claimHookStamp } from './lib/hook-idempotency.mjs';

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
    status: transcriptStatus,
  } = countWords(jsonlPath(sid), marker.line, { provider: aiAppName(), sid });
  const transcriptWordsAvailable = transcriptStatus === 'ok';
  const bank = computeTranscriptTailBank(s, marker, {
    count: newWords,
    totalLines,
    fullExpansion: newWordsFull,
    status: transcriptStatus,
  });
  const ts = new Date().toISOString();
  const wordMarker = bank.marker;
  const fullWordMarker = bank.fullMarker;
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
    fullWordMarker: transcriptWordsAvailable ? fullWordMarker : null,
    description: 'context compacted',
  });
  await safePost(s.active, row);
  if (transcriptWordsAvailable) {
    saveMarker(markerPathFor(sid), bank.line, wordMarker, s.active, fullWordMarker);
  }
  saveState(
    {
      ...s,
      entryStartTs: ts,
      wordsAtEntryStart: wordMarker,
      lastWordMarker: wordMarker,
      lastFullWordMarker: fullWordMarker,
    },
    statePath
  );
}

async function onPostCompact(sid) {
  const s = loadState(statePath);
  if (!s.active || s.active === 'discover') return;
  const markerPath = markerPathFor(sid);
  const marker = loadMarker(markerPath);
  const counted = countWords(jsonlPath(sid), marker.line, { provider: aiAppName(), sid });
  const transcriptWordsAvailable = counted.status === 'ok';
  const bank = computeTranscriptTailBank(s, marker, counted);
  if (transcriptWordsAvailable) {
    saveMarker(markerPath, bank.line, bank.marker, s.active, bank.fullMarker);
    saveState(
      {
        ...s,
        wordsAtEntryStart: bank.marker,
        lastWordMarker: bank.marker,
        lastFullWordMarker: bank.fullMarker,
      },
      statePath
    );
  }
  const row = buildRow({
    ts: new Date().toISOString(),
    event: 'post-compact-resume',
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    // #475 AC1 — carry the durable marker forward across compact
    wordMarker: bank.marker,
    fullWordMarker: transcriptWordsAvailable ? bank.fullMarker : null,
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

// #983 — an orphaned session (background worker terminated without
// `/task pause`) recovers unlogged wall time on the next SessionStart. Below
// `SUSPICIOUS_GAP_SEC` (the same 8h threshold the Agent Review Gate's
// `timing-log-sequence` validator uses to flag corruption), crediting the
// whole gap as active is a reasonable approximation of real work. At or above
// it, claiming `activeMin: wallMin` produces the #899 shape (a false
// multi-hour Develop duration from a worker that died minutes in). Post an
// honest departure/return pair instead — the gap is credited as idle, not
// active — so the phase-span rollup (`computeActiveByPhaseSpans`) no longer
// misclassifies it, while the Review Gate's raw-gap forensic check still
// flags the historical gap for review. The caller supplies the already-banked
// marker pair (or an unavailable full-marker observation). Pure: returns
// `buildRow()` argument objects, does not post them. Exported for testing.
export function buildOrphanRecoveryRowSpecs({ wallMin, wordMarker, fullWordMarker }) {
  if (wallMin * 60 <= SUSPICIOUS_GAP_SEC) {
    return [
      {
        event: 'session-end-recovery',
        activeMin: wallMin,
        idleMin: 0,
        deltaWords: 0,
        fullWordMarker,
        wordMarker,
        description: 'recovered — session closed without /task pause (wall time only)',
      },
    ];
  }
  const gapHours = Math.round(SUSPICIOUS_GAP_SEC / 3600);
  return [
    {
      event: 'pause:orphan-recovery',
      activeMin: 0,
      idleMin: wallMin,
      deltaWords: 0,
      fullWordMarker,
      wordMarker,
      description: `recovered — session closed without /task pause; gap exceeds ${gapHours}h so it is logged as idle, not active (wall time only)`,
    },
    {
      event: 'resumed',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      fullWordMarker,
      wordMarker,
      description: 'orphan-recovery gap closed',
    },
  ];
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

  let newWordBaseline = advanceWordMarker(s.lastWordMarker, s.wordsAtEntryStart);
  let newFullWordBaseline = stateFullWordMarker(s);
  let transcriptWordsAvailable = false;
  if (sid) {
    const markerPath = markerPathFor(sid);
    const existingMarker = loadMarker(markerPath);
    const counted = countWords(jsonlPath(sid), existingMarker.line, {
      provider: aiAppName(),
      sid,
    });
    const bank = computeTranscriptTailBank(s, existingMarker, counted);
    transcriptWordsAvailable = bank.transcriptStatus === 'ok';
    newWordBaseline = bank.marker;
    newFullWordBaseline = bank.fullMarker;
    // Bank before authoring recovery boundaries so every row observes the same
    // durable pair. Unavailable reads preserve the old cursor and render `—`.
    if (transcriptWordsAvailable) {
      saveMarker(markerPath, bank.line, bank.marker, s.active, bank.fullMarker);
    }
  }

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
      const recoveryRows = buildOrphanRecoveryRowSpecs({
        wallMin,
        wordMarker: newWordBaseline,
        fullWordMarker: transcriptWordsAvailable ? newFullWordBaseline : null,
      }).map((spec) => buildRow({ ts: nowTs, ...spec }));
      for (const recoveryRow of recoveryRows) {
        await safePost(s.active, recoveryRow);
      }
    }
  }

  if (sid) {
    const startRow = buildRow({
      ts: nowTs,
      event: 'session-start',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      fullWordMarker: transcriptWordsAvailable ? newFullWordBaseline : null,
      // #475 AC1 — monotonic carry-forward of the durable marker
      wordMarker: newWordBaseline,
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
      lastWordMarker: newWordBaseline,
      lastFullWordMarker: newFullWordBaseline,
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
    if (['SessionStart', 'PreCompact', 'PostCompact'].includes(event)) {
      try {
        const stamp = claimHookStamp({
          projectDir,
          sid,
          hookEventName: event,
          promptId: payload.prompt_id ?? payload.promptId,
          eventTimestamp:
            payload.event_timestamp ?? payload.eventTimestamp ?? payload.timestamp,
        });
        if (!stamp.claimed) process.exit(0);
      } catch (error) {
        console.error(`[task-tracker-hook] ${event}: hook stamp claim failed: ${error.message}`);
        process.exit(1);
      }
    }
    try {
      if (event === 'PreCompact') await onPreCompact(sid);
      else if (event === 'PostCompact') await onPostCompact(sid);
      else if (event === 'SessionStart') await onSessionStart(sid);
    } catch (err) {
      console.error(`[task-tracker-hook] ${event}: ${err.message}`);
    }
    process.exit(0);
  })();
