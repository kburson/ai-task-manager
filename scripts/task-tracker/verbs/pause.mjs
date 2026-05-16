import { loadState, saveState } from '../state.mjs';
import { setTaskStatus } from '../fleet-registry.mjs';

export async function verbPause(ctx) {
  const { statePath, projectDir, rest, drainQueueIfAny, flushActiveToGH } = ctx;
  await drainQueueIfAny();
  const s = loadState(statePath);
  if (!s.active || s.active === 'discover') {
    console.log('nothing to pause');
    return;
  }
  const reason = rest.join(' ').trim() || undefined;
  const { deltaMin, deltaWallMin, deltaWords } = await flushActiveToGH(s, 'pause', reason);
  const wallNote = deltaWallMin !== deltaMin ? ` (wall ${deltaWallMin})` : '';
  saveState(
    {
      ...s,
      active: null,
      entryStartTs: null,
      wordsAtEntryStart: 0,
      lastActive: s.active,
    },
    statePath
  );
  try {
    setTaskStatus(projectDir, s.active, 'paused');
  } catch {}
  console.log(
    `Paused ${s.active}: +${deltaMin} active min${wallNote}, +${deltaWords} words. Use "/task start" to resume.`
  );
}
