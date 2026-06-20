import { loadState, saveState } from '../state.mjs';
import { setTaskStatus } from '../fleet-registry.mjs';

export async function verbStop(ctx) {
  const { statePath, projectDir, rest, drainQueueIfAny, flushActiveToGH } = ctx;
  await drainQueueIfAny();
  const s = loadState(statePath);
  if (!s.active || s.active === 'discover') {
    console.log('nothing to stop');
    return;
  }
  const reason = rest.join(' ').trim() || undefined;
  const { deltaMin, deltaWallMin, deltaWords } = await flushActiveToGH(s, 'stop', reason);
  const wallNote = deltaWallMin !== deltaMin ? ` (wall ${deltaWallMin})` : '';
  saveState(
    {
      ...s,
      active: null,
      entryStartTs: null,
      wordsAtEntryStart: 0,
      lastActive: s.active,
      paused: undefined,
    },
    statePath
  );
  try {
    setTaskStatus(projectDir, s.active, 'stopped');
  } catch {}
  console.log(
    `Stopped ${s.active}: +${deltaMin} active min${wallNote}, +${deltaWords} words. Use "/task resume <N>" to return to it later.`
  );
}
