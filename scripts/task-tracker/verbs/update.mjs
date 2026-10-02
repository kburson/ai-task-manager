import { loadState, saveState } from '../state.mjs';
import { timingPostWarningSuffix } from '../lib/timing-post-outcome.mjs';
import { heartbeatBindingOccupancy } from '../lib/occupancy-lifecycle.mjs';

export async function verbUpdate(ctx) {
  const { statePath, projectDir, rest, drainQueueIfAny, flushActiveToGH } = ctx;
  await drainQueueIfAny();
  const s = loadState(statePath);
  if (!s.active || s.active === 'discover') {
    console.log('nothing to update');
    return;
  }
  const description = rest.join(' ').trim() || 'checkpoint';
  const {
    deltaMin: activeEstimateMin,
    idleMin: idleEstimateMin,
    deltaWallMin,
    deltaWords,
    wordMarker,
    ts,
    post,
  } = await flushActiveToGH(s, 'update', description);
  const totalActiveEstimate =
    activeEstimateMin === null || s.totalActiveMinutes === null
      ? null
      : (s.totalActiveMinutes ?? 0) + activeEstimateMin;
  const totalActiveMinutes = totalActiveEstimate ?? 'Unknown';
  const deltaMin = activeEstimateMin ?? 'Unknown';
  const idleMin = idleEstimateMin ?? 'Unknown';
  const wordsAtStart = wordMarker;
  saveState(
    {
      ...s,
      entryStartTs: ts,
      wordsAtEntryStart: wordsAtStart,
      totalActiveMinutes: totalActiveEstimate,
    },
    statePath
  );
  (ctx.heartbeatBindingOccupancy ?? heartbeatBindingOccupancy)(
    { projectDir, issue: s.active, now: () => ts },
    { heartbeatOccupancy: ctx.heartbeatOccupancy }
  );
  const wallNote = deltaWallMin !== deltaMin ? ` (wall ${deltaWallMin})` : '';
  console.log(
    `Update ${s.active}: +${deltaMin} active min, +${idleMin} idle min${wallNote}, +${deltaWords} words${timingPostWarningSuffix(post)}. ` +
      `Total: ${totalActiveMinutes} active min, ${wordMarker.toLocaleString('en-US')} words.`
  );
}
