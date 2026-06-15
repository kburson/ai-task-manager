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
    else console.log('No active task. Use "/task #N" or "/task discover" to start.');
    return;
  }
  if (s.active === 'discover') {
    console.log(
      `Active: discovery bucket (started ${s.discoverBucket?.startedAt}). Use "/task new" to promote.`
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
  // #407 — bound-but-paused state: a non-terminal verb (test/review) leaves
  // the issue bound with no open timing session (`entryStartTs` null). Report
  // the binding without a bogus elapsed time rather than computing against
  // `new Date(null)` (epoch 0).
  if (!s.entryStartTs) {
    console.log(
      `Active: ${s.active} [${cfg.repo || 'repo not set'}] (paused — no open timing session).`
    );
    return;
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
