import { isDeepStrictEqual } from 'node:util';

import {
  loadState,
  saveState,
  advanceWordMarker,
  stateFullWordMarker,
  computeTranscriptTailBank,
} from '../state.mjs';
import { setTaskStatus, registerTask, currentBranch } from '../fleet-registry.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  loadMarker,
  saveMarker,
  countWords,
  aiAppName,
} from '../word-counter.mjs';
import { verbSwitch } from './switch.mjs';
import { getActiveTask } from '../session-state.mjs';
import { finalizeOrphanPause } from '../orphan-finalize.mjs';
import { seedSessionKanbanFromBody } from '../lib/seed-kanban-cache.mjs';
import {
  resolveBindEvent,
  timingCommentHasRows,
  assertPairedReengagement,
  detectUnmarkedDepartureGap,
  SUSPICIOUS_GAP_SEC,
  shouldSuppressActiveBindEvent,
} from '../lib/bind-event.mjs';
import { timingTimestampOffsetMin } from '../lib/timing-row-reader.mjs';
import { collectResumeActivityEvidence as defaultCollectResumeActivityEvidence } from '../lib/resume-activity-evidence.mjs';
import {
  isPickupDirectiveEligible,
  formatPickupDirectiveDeferredBanner,
} from '../lib/pickup-directive-gate.mjs';
import { runMoveInvariantAudit } from '../lib/verify-move-invariants.mjs';
import { resolveWorktreeBinding } from '../lib/worktree-binding.mjs';
import { claimBindingOccupancy, rollbackBindingOccupancy } from '../lib/occupancy-lifecycle.mjs';
import { isTerminalReviewHandoffOpen } from '../lib/terminal-review-handoff.mjs';

function claimForBind(ctx, issue) {
  const claim = ctx.claimBindingOccupancy ?? claimBindingOccupancy;
  return claim(
    { projectDir: ctx.projectDir, issue, now: ctx.nowIso },
    {
      coReviewAllowsWorktree: ctx.coReviewAllowsWorktree,
      claimOccupancy: ctx.claimOccupancy,
    }
  );
}

function rollbackClaim(ctx, claim) {
  return (ctx.rollbackBindingOccupancy ?? rollbackBindingOccupancy)(claim, {
    rollbackOccupancyClaim: ctx.rollbackOccupancyClaim,
  });
}

function rollbackFailedBind(ctx, { claim, priorState, savedState }, originalError) {
  const recoveryErrors = [];
  let rollbackResult;
  try {
    rollbackResult = rollbackClaim(ctx, claim);
  } catch (rollbackError) {
    recoveryErrors.push(rollbackError);
  }
  const localRestoreIsSafe =
    rollbackResult?.status === 'rolled-back' ||
    (claim?.status === 'unchanged' && rollbackResult?.status === 'not-applicable');
  if (savedState && localRestoreIsSafe) {
    try {
      const current = loadState(ctx.statePath);
      if (isDeepStrictEqual(current, savedState)) saveState(priorState, ctx.statePath);
    } catch (restoreError) {
      recoveryErrors.push(restoreError);
    }
  }
  if (recoveryErrors.length) {
    throw new AggregateError(
      [originalError, ...recoveryErrors],
      `resume failed and authority rollback was incomplete: ${originalError.message}`
    );
  }
  throw originalError;
}

// #475 AC2 — idle span of a pause window in whole seconds. Returns 0 when no
// `pausedAtTs` was recorded (e.g. resuming after a stop rather than a pause, or
// a legacy state file predating the field) or when the clock would yield a
// negative span.
export function computePauseIdleSec(pausedAtTs, resumeTs) {
  if (!pausedAtTs) return 0;
  const a = new Date(pausedAtTs).getTime();
  const b = new Date(resumeTs).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 1000));
}

// #666 — the current session's own bound issue (normalized to `#N`), or null when
// this session holds no per-session record. Source of truth for the switch-vs-
// fresh-bind decision; the global pointer is only a cross-session cache.
function ownBoundIssue(projectDir) {
  let sid;
  try {
    sid = currentSessionId();
  } catch {
    return null;
  }
  if (!sid) return null;
  const issue = getActiveTask(sid, projectDir)?.issue;
  if (typeof issue !== 'string' || !issue) return null;
  return /^#/.test(issue) ? issue : `#${issue}`;
}

function bankResumeTranscriptTail(state, sid, task) {
  if (!sid) {
    return {
      marker: state.lastWordMarker ?? 0,
      fullMarker: stateFullWordMarker(state),
      fullMarkerAvailable: false,
    };
  }
  const markerPath = markerPathFor(sid);
  const existingMarker = loadMarker(markerPath);
  const counted = countWords(jsonlPath(sid), existingMarker.line, {
    provider: aiAppName(),
    sid,
  });
  const bank = computeTranscriptTailBank(state, existingMarker, counted);
  if (bank.transcriptStatus === 'ok') {
    saveMarker(markerPath, bank.line, bank.marker, task, bank.fullMarker);
  }
  return bank;
}

// #1488 — the SINGLE decision point for waking Review resident work on a bind.
// `start` is exempt: it must leave the timing session it just opened running, or
// `deliver` (which requires Review state AND a running binding together) becomes
// unreachable. `verbStart` delegates here and must not re-issue the wake itself.
export async function wakeReviewResidents(ctx, target) {
  if (ctx.verb === 'start') return;
  await ctx.resumeReviewActionsAfterBind?.(target, ctx.rest[0] ? 'rebind' : 'resume');
}

// `/task resume` — two paths:
//   no arg: only valid after `/task pause` (s.paused === true). Rebinds lastActive.
//   #N arg: unrestricted rebind to a specific issue (works after pause OR stop).
export async function verbResume(ctx) {
  const { cfg, statePath, projectDir, role, drainQueueIfAny, safePostTiming, nowIso } = ctx;
  const target = ctx.rest[0];

  if (!target || !/^#?\d+$/.test(String(target))) {
    // No-arg path: require s.paused === true
    const s = loadState(statePath);
    if (!s.paused) {
      console.log(
        'nothing to resume. Use "/task start <N>" to bind a task, or "/task resume <N>" to return to a specific paused/stopped issue.'
      );
      return;
    }
    if (!s.lastActive) {
      console.log('no previous task on record.');
      return;
    }
    const occupancyClaim = claimForBind(ctx, s.lastActive);
    let ts;
    let sid;
    let resumeBank;
    let carriedMarker;
    let idleSec;
    let resumeDesc;
    let savedState = null;
    try {
      const resolveBinding = ctx.resolveWorktreeBinding ?? resolveWorktreeBinding;
      const binding = resolveBinding({ projectDir, now: nowIso });
      await drainQueueIfAny();
      // Inline the lastActive-bind logic (previously in verbStart)
      try {
        const sidPre = currentSessionId();
        if (sidPre) {
          await finalizeOrphanPause({
            sid: sidPre,
            reason: 'orphan-finalize',
            projDir: projectDir,
          });
        }
      } catch {
        /* never block resume on finalize failure */
      }
      ts = nowIso();
      sid = currentSessionId();
      resumeBank = bankResumeTranscriptTail(s, sid, s.lastActive);
      const wordsAtStart = resumeBank.marker;
      idleSec = computePauseIdleSec(s.pausedAtTs, ts);
      carriedMarker = advanceWordMarker(s.lastWordMarker, wordsAtStart);
      resumeDesc = s.pauseReasonText || role || 'task resumed';
      savedState = {
        ...s,
        active: s.lastActive,
        entryStartTs: ts,
        wordsAtEntryStart: wordsAtStart,
        paused: undefined,
        pausedAtTs: null,
        pauseReasonSlug: null,
        pauseReasonText: null,
        lastWordMarker: carriedMarker,
        lastFullWordMarker: resumeBank.fullMarker,
        ...binding,
      };
      saveState(savedState, statePath);
      savedState = loadState(statePath);
      const fullWordsAtStart = resumeBank.fullMarkerAvailable ? resumeBank.fullMarker : null;
      try {
        setTaskStatus(projectDir, s.lastActive, 'active');
      } catch {
        /* best-effort: failure must not abort the primary operation */
      }
      if (sid && cfg?.repo) {
        const seed = ctx.seedKanban ?? seedSessionKanbanFromBody;
        try {
          const seeded = await seed({
            sid,
            issue: s.lastActive,
            projDir: projectDir,
            repo: cfg.repo,
          });
          // #673 — Pickup Directive only applies once an issue has reached
          // Plan; route earlier-state issues back to the state walk instead.
          if (seeded?.kanbanState && !isPickupDirectiveEligible(seeded.kanbanState)) {
            console.log(formatPickupDirectiveDeferredBanner(s.lastActive, seeded.kanbanState));
          }
          // #935 — warn when binding to a review-state issue whose Agent Review
          // has not been run; names `/task review` as the in-place remediation.
          if (seeded?.reviewRemediationHint) console.log(seeded.reviewRemediationHint);
        } catch (err) {
          process.stderr.write(
            `[resume] ${s.lastActive}: kanbanState seed failed (${err.name || 'Error'}): ${err.message}\n`
          );
          process.stderr.write(
            `  Repair: node scripts/task-tracker/task-tracker.mjs reconcile accept-live ${String(s.lastActive).replace(/^#/, '')}\n`
          );
        }
      }
      const { buildRow } = await import('../gh-timing-comment.mjs');
      const row = buildRow({
        ts,
        event: 'resumed',
        activeSec: 0,
        idleSec,
        deltaWords: 0,
        wordMarker: carriedMarker,
        fullWordMarker: fullWordsAtStart,
        description: resumeDesc,
      });
      await safePostTiming(s.lastActive, row);
      // #758 — same out-of-band Status-drift audit on the no-arg resume path.
      await runMoveInvariantAudit({
        issueNumber: String(s.lastActive).replace(/^#/, ''),
        cfg,
      });
      console.log(`Resumed ${s.lastActive}.`);
      await wakeReviewResidents(ctx, s.lastActive);
      return;
    } catch (error) {
      rollbackFailedBind(ctx, { claim: occupancyClaim, priorState: s, savedState }, error);
    }
  }

  // #N path: unrestricted rebind to a specific issue (pause OR stop, or fresh bind)
  const normalizedTarget = /^#/.test(String(target)) ? String(target) : `#${target}`;
  const s = loadState(statePath);

  // #666 — decide switch-vs-fresh-bind on THIS session's own per-session record,
  // not the global-overlaid `s.active`. The global pointer is a single-slot cache
  // that can hold a prior session's ghost; routing on it makes a fresh session
  // fabricate a `switch-out` row on the ghost issue. Only a genuine in-session
  // switch (this session itself already holds a different binding) goes through
  // verbSwitch; a fresh session whose only "active" is the inherited ghost falls
  // through to the fresh-bind path below.
  const switchVerb = ctx.verbSwitch ?? verbSwitch;
  const ownIssue = ownBoundIssue(projectDir);
  const reopeningBoundTimer = ownIssue === normalizedTarget && !s.entryStartTs;
  if (ownIssue && ownIssue !== normalizedTarget) {
    await switchVerb(ctx, normalizedTarget);
    return;
  }
  if (ownIssue === normalizedTarget && !reopeningBoundTimer) {
    const occupancyClaim = claimForBind(ctx, normalizedTarget);
    try {
      const resolveBinding = ctx.resolveWorktreeBinding ?? resolveWorktreeBinding;
      const binding = resolveBinding({ projectDir, now: nowIso });
      saveState({ ...s, ...binding }, statePath);
    } catch (error) {
      rollbackClaim(ctx, occupancyClaim);
      throw error;
    }
    try {
      const register = ctx.registerTask ?? registerTask;
      const branch = (ctx.currentBranch ?? currentBranch)(projectDir);
      register(projectDir, normalizedTarget, projectDir, branch);
    } catch {
      /* best-effort: failure must not turn the timing-safe no-op into an error */
    }
    console.log(`already active: ${normalizedTarget}`);
    await wakeReviewResidents(ctx, normalizedTarget);
    return;
  }

  const occupancyClaim = claimForBind(ctx, normalizedTarget);
  let ts;
  let sid;
  let resumeBank;
  let carriedMarker;
  let idleSec;
  let savedState = null;
  try {
    const resolveBinding = ctx.resolveWorktreeBinding ?? resolveWorktreeBinding;
    const binding = resolveBinding({ projectDir, now: nowIso });
    await drainQueueIfAny();
    try {
      const sidPre = currentSessionId();
      if (sidPre) {
        await finalizeOrphanPause({
          sid: sidPre,
          reason: 'orphan-finalize',
          projDir: projectDir,
        });
      }
    } catch {
      /* never block resume on a finalize failure */
    }
    ts = nowIso();
    sid = currentSessionId();
    resumeBank = bankResumeTranscriptTail(s, sid, normalizedTarget);
    const wordsAtStart = resumeBank.marker;
    idleSec = computePauseIdleSec(s.pausedAtTs, ts);
    carriedMarker = advanceWordMarker(s.lastWordMarker, wordsAtStart);
    savedState = {
      ...s,
      active: normalizedTarget,
      lastActive: normalizedTarget,
      entryStartTs: ts,
      wordsAtEntryStart: wordsAtStart,
      paused: undefined,
      pausedAtTs: null,
      lastWordMarker: carriedMarker,
      lastFullWordMarker: resumeBank.fullMarker,
      ...binding,
    };
    saveState(savedState, statePath);
    savedState = loadState(statePath);
    const fullWordsAtStart = resumeBank.fullMarkerAvailable ? resumeBank.fullMarker : null;
    try {
      setTaskStatus(projectDir, normalizedTarget, 'active');
    } catch {
      /* best-effort: failure must not abort the primary operation */
    }
    try {
      registerTask(projectDir, normalizedTarget, projectDir, currentBranch(projectDir));
    } catch {
      /* best-effort: failure must not abort the primary operation */
    }
    if (sid && cfg?.repo) {
      const seed = ctx.seedKanban ?? seedSessionKanbanFromBody;
      try {
        const seeded = await seed({
          sid,
          issue: normalizedTarget,
          projDir: projectDir,
          repo: cfg.repo,
        });
        // #673 — Pickup Directive only applies once an issue has reached
        // Plan; route earlier-state issues back to the state walk instead.
        if (seeded?.kanbanState && !isPickupDirectiveEligible(seeded.kanbanState)) {
          console.log(formatPickupDirectiveDeferredBanner(normalizedTarget, seeded.kanbanState));
        }
        // #935 — warn when binding to a review-state issue whose Agent Review has
        // not been run; names `/task review` as the in-place remediation.
        if (seeded?.reviewRemediationHint) console.log(seeded.reviewRemediationHint);
      } catch (err) {
        process.stderr.write(
          `[resume] ${normalizedTarget}: kanbanState seed failed (${err.name || 'Error'}): ${err.message}\n`
        );
        process.stderr.write(
          `  Repair: node scripts/task-tracker/task-tracker.mjs reconcile accept-live ${String(normalizedTarget).replace(/^#/, '')}\n`
        );
      }
    }
    // #482 — the first-ever bind of an issue must record a `start` row, not
    // `resumed` (you cannot resume without a prior start/pause). Discriminate by
    // whether the issue already has timing-log history; a genuine resume (history
    // present, or this #N resume follows a pause) keeps `resumed`.
    const gh = await import('../gh-timing-comment.mjs');
    const { buildRow } = gh;
    const readTimingCommentBody = ctx.readTimingCommentBody ?? gh.readTimingCommentBody;
    let hasTimingHistory = false;
    let tcBody = '';
    let readStatus = null;
    let tcResult = null;
    if (cfg?.repo) {
      // #568 — findTimingComment does `issueNumber.replace('#','')`, so it needs a
      // STRING. Passing a Number made `.replace` throw, so every #N-path read
      // returned `status:'error'` → fail-closed to `resumed` → the fresh-bind
      // downgrade never fired (the orphan-`resumed` half of the #480 bug this fix
      // exists to kill). Pass the bare issue string.
      tcResult = await readTimingCommentBody({
        issueNumber: String(normalizedTarget).replace(/^#/, ''),
        repo: cfg.repo,
      });
      tcBody = gh.bodyOf(tcResult);
      readStatus = tcResult?.status ?? null;
      hasTimingHistory = timingCommentHasRows(tcBody);
    }
    // #534 — the #N path is the dominant cold-re-pickup orphan site. Resolve the
    // re-engagement against the issue's own open interruption so a return is never
    // emitted without a pair. #568 — `resumed` is the sole closer: an open
    // `pause:<r>`, `switch-out:#X`, or session-end `idle` all close to `resumed`.
    // Fresh issue → `start`; history-no-opener → benign `resumed`.
    let bindEvent = resolveBindEvent({
      hasTimingHistory,
      paused: !!s.pausedAtTs,
      timingBody: cfg?.repo ? tcBody : null,
      readStatus,
    });
    const terminalReviewHandoff = reopeningBoundTimer && isTerminalReviewHandoffOpen(tcBody);
    // #534 AC5/AC7 — orphan-pairing guard. Never post a re-engagement with no
    // open interruption AND no prior `start` to pair against.
    // #568 — downgrade to `start` ONLY on positive confirmation the log is empty
    // (a successful read of zero rows). On a read error, or whenever data rows
    // already exist, never manufacture a `start` — that is exactly the
    // duplicate-start the append guard now refuses (and would crash the bind).
    const guard = assertPairedReengagement(tcBody, bindEvent);
    if (!guard.ok && readStatus !== 'error' && !timingCommentHasRows(tcBody)) {
      process.stderr.write(`[resume] ${normalizedTarget}: ${guard.reason}; downgrading to start\n`);
      bindEvent = 'start';
    }
    const isStart = bindEvent === 'start';
    // #981 — a session that dies without running its exit path (timeout, closed
    // terminal, context end) leaves the prior row unclosed; writing `resumed`
    // straight over that gap makes `computePhaseCloseDelta` read the ENTIRE
    // elapsed span as active on the next `<phase>:completed` row (the #880/#879
    // defect class). Insert a synthetic departure row first so the gap
    // reclassifies as idle — `buildBackdatedDepartureRow` can only ever emit a
    // zero-delta marker row, never fabricate active time.
    if (cfg?.repo && !isStart && readStatus !== 'error' && !terminalReviewHandoff) {
      let gap = detectUnmarkedDepartureGap(tcBody, ts);
      if (gap) {
        const collectResumeActivityEvidence =
          ctx.collectResumeActivityEvidence ?? defaultCollectResumeActivityEvidence;
        let activityEvidence;
        try {
          activityEvidence = await collectResumeActivityEvidence({
            issueNumber: Number(String(normalizedTarget).replace(/^#/, '')),
            projectDir,
            comments: tcResult?.comments ?? [],
          });
        } catch {
          activityEvidence = { status: 'unknown', timestamps: [] };
        }

        if (activityEvidence?.status === 'found') {
          gap = detectUnmarkedDepartureGap(tcBody, ts, SUSPICIOUS_GAP_SEC, {
            activityTimestamps: activityEvidence.timestamps,
          });
        } else if (activityEvidence?.status !== 'none') {
          process.stderr.write(
            `[resume] ${normalizedTarget}: same-issue activity evidence unavailable; refusing to synthesize idle time\n`
          );
          gap = null;
        }
      }
      if (gap) {
        const departureRow = gh.buildBackdatedDepartureRow({
          ts: gap.syntheticTs,
          event: 'pause:auto-detected-gap',
          wordMarker: gap.wordMarker,
          fullWordMarker: gap.fullWordMarker,
          description: `resume after a ${Math.round(gap.gapSec / 3600)}h gap with no departure row — synthetic departure inserted per #981 so the gap reclassifies as idle`,
          // #1104 — `gap.syntheticTs` is a UTC-normalized instant, so it carries no
          // offset worth preserving. This row lands one second after `gap.lastRowTs`
          // and is read alongside it, so it renders at THAT row's offset; otherwise
          // a heal run from another machine inserts an apparent time jump that never
          // happened. No offset on the neighbor → null → local-zone fallback.
          offsetMin: timingTimestampOffsetMin(gap.lastRowTs),
        });
        await safePostTiming(normalizedTarget, departureRow);
      }
    }
    const suppressBindEvent =
      terminalReviewHandoff ||
      shouldSuppressActiveBindEvent({
        timingBody: tcBody,
        readStatus,
        paused: !!s.pausedAtTs,
        nowTs: ts,
      });
    if (!suppressBindEvent) {
      const row = buildRow({
        ts,
        event: bindEvent,
        activeSec: 0,
        idleSec,
        deltaWords: 0,
        wordMarker: carriedMarker,
        fullWordMarker: fullWordsAtStart,
        description: role ?? (isStart ? 'task started' : 'task resumed'),
      });
      await safePostTiming(normalizedTarget, row);
    }
    // #758 — audit the just-bound issue for out-of-band Status drift (a raw-API /
    // wrapper move that never wrote the move-complete sentinel). Best-effort: it
    // prints a warning + recommended reconcile on drift and never blocks the bind.
    await runMoveInvariantAudit({
      issueNumber: String(normalizedTarget).replace(/^#/, ''),
      cfg,
    });
    console.log(
      reopeningBoundTimer
        ? `Resumed ${normalizedTarget}.`
        : suppressBindEvent
          ? `Bound ${normalizedTarget} (live timing span already active; no duplicate reengagement row).`
          : `${isStart ? 'Started' : 'Resumed'} ${normalizedTarget}.`
    );
    await wakeReviewResidents(ctx, normalizedTarget);
  } catch (error) {
    rollbackFailedBind(ctx, { claim: occupancyClaim, priorState: s, savedState }, error);
  }
}
