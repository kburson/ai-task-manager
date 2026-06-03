import { loadState, saveState } from '../state.mjs';
import { setTaskStatus } from '../fleet-registry.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  saveMarker,
  countWords,
} from '../word-counter.mjs';
import { finalizeOrphanPause } from '../orphan-finalize.mjs';
import { seedSessionKanbanFromBody } from '../lib/seed-kanban-cache.mjs';

export async function verbStart(ctx, reasonOverride) {
  const {
    cfg,
    statePath,
    rest,
    role: _role,
    projectDir,
    drainQueueIfAny,
    safePostTiming,
    nowIso,
  } = ctx;
  await drainQueueIfAny();
  // #215 — finalize any orphaned pending-pause from a prior turn BEFORE
  // binding/resuming. The row lands on whatever issue was bound at pause.
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
    /* never block start on a finalize failure */
  }
  const s = loadState(statePath);
  if (s.active) {
    console.log(`already active: ${s.active}`);
    return;
  }
  if (!s.lastActive) {
    console.log('no previous task. Use "/task #N" or "/task plan".');
    return;
  }
  const reason = (reasonOverride ?? rest.join(' ').trim()) || undefined;
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
    },
    statePath
  );
  // #218: state hydration removed — the issue body's `aitm-last-known-state`
  // marker is the source of truth; preflight reads it on demand.
  try {
    setTaskStatus(projectDir, s.lastActive, 'active');
  } catch {}
  // #218 follow-up — seed the per-session `kanbanState` derived cache so the
  // activity-guard hook can read state synchronously without a network call.
  // #273: surface tagged seeder errors to stderr instead of swallowing.
  // Failures still don't abort the resume (the cache can be repaired via
  // `/task reconcile accept-live <N>`), but the user sees the diagnostic.
  if (sid && cfg?.repo) {
    try {
      await seedSessionKanbanFromBody({
        sid,
        issue: s.lastActive,
        projDir: projectDir,
        repo: cfg.repo,
      });
    } catch (err) {
      process.stderr.write(
        `[start] #${s.lastActive}: kanbanState seed failed (${err.name || 'Error'}): ${err.message}\n`
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
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: wordsAtStart,
    description: reason ?? 'task resumed',
  });
  await safePostTiming(s.lastActive, row);
  console.log(`Resumed ${s.lastActive}.`);
}
