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
import { verbStart } from './start.mjs';
import { finalizeOrphanPause } from '../orphan-finalize.mjs';
import { seedSessionKanbanFromBody } from '../lib/seed-kanban-cache.mjs';

// `/task resume` writes a canonical `resumed` row on the incoming task,
// regardless of how it was last paused or switched. The `resumed` row is the
// only event emitted on the incoming bind path — there is no `switch-in`,
// no `<state>:enter`.
export async function verbResume(ctx) {
  const target = ctx.rest[0];
  if (!target || !/^#\d+$/.test(target)) {
    await verbStart(ctx);
    return;
  }

  const { cfg, statePath, projectDir, role, drainQueueIfAny, safePostTiming, nowIso } = ctx;
  const s = loadState(statePath);

  // If there is an active task different from the resume target, fall back to
  // switch-style behavior (outgoing flush + start row). This is not the
  // "returning to a previously-switched-out task" case.
  if (s.active && s.active !== target) {
    await verbSwitch(ctx, target);
    return;
  }
  if (s.active === target) {
    console.log(`already active: ${target}`);
    return;
  }

  await drainQueueIfAny();
  // #215 — finalize any orphaned pending-pause from a prior turn BEFORE
  // binding the resumed issue. The idle row lands on the issue named in
  // the marker (which may differ from `target`).
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
    saveMarker(markerPathFor(sid), totalLines, count, target);
    wordsAtStart = count;
  }
  saveState(
    {
      ...s,
      active: target,
      lastActive: target,
      entryStartTs: ts,
      wordsAtEntryStart: wordsAtStart,
    },
    statePath
  );
  try {
    setTaskStatus(projectDir, target, 'active');
  } catch {}
  try {
    registerTask(projectDir, target, projectDir, currentBranch(projectDir));
  } catch {}
  // #251 — seed the per-session `kanbanState` derived cache so the
  // activity-guard hook can read state synchronously without a network call.
  // Mirrors verbStart; the resume fresh-bind path previously skipped this,
  // dead-locking freshly bound sessions (post-compact orchestrators and every
  // parallel sub-agent) out of all WRITE activity. Best-effort: failures are
  // swallowed and never block the bind.
  if (sid && cfg?.repo) {
    // Seam is injectable for tests; production passes nothing and uses the real
    // body-marker seed.
    const seed = ctx.seedKanban ?? seedSessionKanbanFromBody;
    try {
      await seed({
        sid,
        issue: target,
        projDir: projectDir,
        repo: cfg.repo,
      });
    } catch (err) {
      // #273: surface tagged seeder errors instead of swallowing.
      process.stderr.write(
        `[resume] ${target}: kanbanState seed failed (${err.name || 'Error'}): ${err.message}\n`
      );
      process.stderr.write(
        `  Repair: node scripts/task-tracker/task-tracker.mjs reconcile accept-live ${String(target).replace(/^#/, '')}\n`
      );
    }
  }
  const { buildRow } = await import('../gh-timing-comment.mjs');
  const row = buildRow({
    ts,
    event: 'resumed',
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: wordsAtStart,
    description: role ?? 'task resumed',
  });
  await safePostTiming(target, row);
  console.log(`Resumed ${target}.`);
}
