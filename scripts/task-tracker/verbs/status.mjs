import { loadState } from '../state.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  loadMarker,
  countWords,
} from '../word-counter.mjs';
import { collectEventTimestamps, computeActiveAndIdleMinutes } from '../active-time.mjs';

export async function verbStatus(ctx) {
  const { cfg, statePath, worktreeLabel } = ctx;
  console.log(`worktree: ${worktreeLabel()}`);
  const s = loadState(statePath);
  if (!s.active) {
    if (s.lastActive)
      console.log(`No active task. Last active: ${s.lastActive}. Use "/task start" to resume.`);
    else console.log('No active task. Use "/task #N" or "/task plan" to start.');
    return;
  }
  if (s.active === 'plan') {
    console.log(
      `Active: planning bucket (started ${s.planBucket?.startedAt}). Use "/task new" to promote.`
    );
    return;
  }
  const sid = currentSessionId();
  let wordsNow = s.wordsAtEntryStart;
  if (sid) {
    const marker = loadMarker(markerPathFor(sid));
    const { count } = countWords(jsonlPath(sid), marker.line);
    wordsNow = s.wordsAtEntryStart + count;
  }
  const startMs = new Date(s.entryStartTs).getTime();
  const endMs = Date.now();
  const wallMin = Math.round((endMs - startMs) / 60000);
  let activeMin = wallMin;
  if (sid) {
    const events = collectEventTimestamps(jsonlPath(sid), startMs, endMs);
    ({ activeMin } = computeActiveAndIdleMinutes({
      startMs,
      endMs,
      events,
      idleThresholdMs: cfg.idleThresholdMinutes * 60_000,
    }));
  }
  const wallNote = wallMin !== activeMin ? ` (wall ${wallMin})` : '';
  console.log(
    `Active: ${s.active} [${cfg.repo || 'repo not set'}]. Elapsed: ${activeMin} active min${wallNote}, ${wordsNow - s.wordsAtEntryStart} words since last marker.`
  );
}
