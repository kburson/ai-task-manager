import { loadState, saveState } from '../state.mjs';
import { setTaskStatus } from '../fleet-registry.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  saveMarker,
  countWords,
} from '../word-counter.mjs';
import { loadConfig } from '../config.mjs';

export async function verbStart(ctx, reasonOverride) {
  const { statePath, rest, role: _role, projectDir, drainQueueIfAny, safePostTiming, nowIso } = ctx;
  await drainQueueIfAny();
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
  if (/^#\d+$/.test(s.lastActive)) {
    try {
      const cfg = loadConfig();
      const { fetchLiveKanbanState } = await import('../../gh/lib/live-state.mjs');
      const live = await fetchLiveKanbanState({
        repo: cfg.repo,
        projectId: cfg.projectId,
        issueNumber: s.lastActive.replace(/^#/, ''),
      });
      if (live) {
        const s2 = loadState(statePath);
        if (s2.active === s.lastActive) {
          s2.state = live;
          saveState(s2, statePath);
        }
      }
    } catch {
      /* best-effort */
    }
  }
  try {
    setTaskStatus(projectDir, s.lastActive, 'active');
  } catch {}
  const { buildRow } = await import('../gh-timing-comment.mjs');
  const row = buildRow({
    ts,
    event: 'resume',
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: wordsAtStart,
    description: reason ?? 'task resumed',
  });
  await safePostTiming(s.lastActive, row);
  console.log(`Resumed ${s.lastActive}.`);
}
