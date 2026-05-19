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

  const { statePath, projectDir, role, drainQueueIfAny, safePostTiming, nowIso } = ctx;
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
