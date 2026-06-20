import { loadState, saveState } from '../state.mjs';
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
    saveState(
      {
        ...s,
        active: s.lastActive,
        entryStartTs: ts,
        wordsAtEntryStart: wordsAtStart,
        paused: undefined,
      },
      statePath
    );
    try {
      setTaskStatus(projectDir, s.lastActive, 'active');
    } catch {}
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
      event: 'resumed',
      activeSec: 0,
      idleSec: 0,
      deltaWords: 0,
      wordMarker: wordsAtStart,
      description: role ?? 'task resumed',
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
  saveState(
    {
      ...s,
      active: normalizedTarget,
      lastActive: normalizedTarget,
      entryStartTs: ts,
      wordsAtEntryStart: wordsAtStart,
      paused: undefined,
    },
    statePath
  );
  try {
    setTaskStatus(projectDir, normalizedTarget, 'active');
  } catch {}
  try {
    registerTask(projectDir, normalizedTarget, projectDir, currentBranch(projectDir));
  } catch {}
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
  const { buildRow } = await import('../gh-timing-comment.mjs');
  const row = buildRow({
    ts,
    event: 'resumed',
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker: wordsAtStart,
    description: role ?? 'task resumed',
  });
  await safePostTiming(normalizedTarget, row);
  console.log(`Resumed ${normalizedTarget}.`);
}
