import { loadState, saveState, advanceWordMarker } from '../state.mjs';
import { setTaskStatus, registerTask, currentBranch } from '../fleet-registry.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  saveMarker,
  countWords,
} from '../word-counter.mjs';
import { verbSwitch } from './switch.mjs';
import { finalizeOrphanPause } from '../orphan-finalize.mjs';
import { seedSessionKanbanFromBody } from '../lib/seed-kanban-cache.mjs';
import {
  resolveBindEvent,
  timingCommentHasRows,
  assertPairedReengagement,
} from '../lib/bind-event.mjs';

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

// `/task resume` — two paths:
//   no arg: only valid after `/task pause` (s.paused === true). Rebinds lastActive.
//   #N arg: unrestricted rebind to a specific issue (works after pause OR stop).
export async function verbResume(ctx) {
  const { cfg, statePath, projectDir, role, drainQueueIfAny, safePostTiming, nowIso } = ctx;
  const target = ctx.rest[0];

  if (!target || !/^#?\d+$/.test(String(target))) {
    // No-arg path: require s.paused === true
    await drainQueueIfAny();
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
    // Inline the lastActive-bind logic (previously in verbStart)
    try {
      const sidPre = currentSessionId();
      if (sidPre) {
        await finalizeOrphanPause({ sid: sidPre, reason: 'orphan-finalize', projDir: projectDir });
      }
    } catch {
      /* never block resume on finalize failure */
    }
    const ts = nowIso();
    const sid = currentSessionId();
    let wordsAtStart = 0;
    if (sid) {
      const { totalLines, count } = countWords(jsonlPath(sid), 0);
      saveMarker(markerPathFor(sid), totalLines, count, s.lastActive);
      wordsAtStart = count;
    }
    // #475 AC2 — idle span of the pause window = resume_ts − pausedAtTs.
    const idleSec = computePauseIdleSec(s.pausedAtTs, ts);
    // #475 AC1 — carry the durable marker forward across the pause.
    const carriedMarker = advanceWordMarker(s.lastWordMarker, wordsAtStart);
    // #534 — pair the resume to the pause's canonical reason. The no-arg path
    // is gated on `s.paused`, so a matching open `pause:<slug>` always exists;
    // emit `resume:<slug>` and echo the operator's free text in Description.
    const reasonSlug = s.pauseReasonSlug || 'other';
    const resumeEvent = `resume:${reasonSlug}`;
    const resumeDesc = s.pauseReasonText || role || 'task resumed';
    saveState(
      {
        ...s,
        active: s.lastActive,
        entryStartTs: ts,
        wordsAtEntryStart: wordsAtStart,
        paused: undefined,
        pausedAtTs: null,
        // #534 — interruption closed; clear the persisted pause reason.
        pauseReasonSlug: null,
        pauseReasonText: null,
        lastWordMarker: carriedMarker,
      },
      statePath
    );
    try {
      setTaskStatus(projectDir, s.lastActive, 'active');
    } catch {
      /* best-effort: failure must not abort the primary operation */
    }
    if (sid && cfg?.repo) {
      const seed = ctx.seedKanban ?? seedSessionKanbanFromBody;
      try {
        await seed({
          sid,
          issue: s.lastActive,
          projDir: projectDir,
          repo: cfg.repo,
        });
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
      event: resumeEvent,
      activeSec: 0,
      idleSec,
      deltaWords: 0,
      wordMarker: carriedMarker,
      description: resumeDesc,
    });
    await safePostTiming(s.lastActive, row);
    console.log(`Resumed ${s.lastActive}.`);
    return;
  }

  // #N path: unrestricted rebind to a specific issue (pause OR stop, or fresh bind)
  const normalizedTarget = /^#/.test(String(target)) ? String(target) : `#${target}`;
  const s = loadState(statePath);

  if (s.active && s.active !== normalizedTarget) {
    await verbSwitch(ctx, normalizedTarget);
    return;
  }
  if (s.active === normalizedTarget) {
    console.log(`already active: ${normalizedTarget}`);
    return;
  }

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
  const ts = nowIso();
  const sid = currentSessionId();
  let wordsAtStart = 0;
  if (sid) {
    const { totalLines, count } = countWords(jsonlPath(sid), 0);
    saveMarker(markerPathFor(sid), totalLines, count, normalizedTarget);
    wordsAtStart = count;
  }
  // #475 AC2 — idle span of the pause window (if this #N resume follows a pause).
  const idleSec = computePauseIdleSec(s.pausedAtTs, ts);
  // #475 AC1 — carry the durable marker forward across the rebind.
  const carriedMarker = advanceWordMarker(s.lastWordMarker, wordsAtStart);
  saveState(
    {
      ...s,
      active: normalizedTarget,
      lastActive: normalizedTarget,
      entryStartTs: ts,
      wordsAtEntryStart: wordsAtStart,
      paused: undefined,
      pausedAtTs: null,
      lastWordMarker: carriedMarker,
    },
    statePath
  );
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
      await seed({
        sid,
        issue: normalizedTarget,
        projDir: projectDir,
        repo: cfg.repo,
      });
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
  if (cfg?.repo) {
    const tcResult = await readTimingCommentBody({
      issueNumber: Number(String(normalizedTarget).replace(/^#/, '')),
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
  const row = buildRow({
    ts,
    event: bindEvent,
    activeSec: 0,
    idleSec,
    deltaWords: 0,
    wordMarker: carriedMarker,
    description: role ?? (isStart ? 'task started' : 'task resumed'),
  });
  await safePostTiming(normalizedTarget, row);
  console.log(`${isStart ? 'Started' : 'Resumed'} ${normalizedTarget}.`);
}
