import { loadState, saveState } from '../state.mjs';
import { currentSessionId, jsonlPath, markerPathFor, saveMarker, countWords } from '../word-counter.mjs';

export async function verbUpdate(ctx) {
  const { statePath, rest, drainQueueIfAny, flushActiveToGH } = ctx;
  await drainQueueIfAny();
  const s = loadState(statePath);
  if (!s.active || s.active === 'plan') {
    console.log('nothing to update');
    return;
  }
  const description = rest.join(' ').trim() || 'checkpoint';
  const { deltaMin, idleMin, deltaWallMin, deltaWords, wordMarker, ts } =
    await flushActiveToGH(s, 'update', description);
  const totalActiveMinutes = (s.totalActiveMinutes || 0) + deltaMin;
  const sid = currentSessionId();
  let wordsAtStart = wordMarker;
  if (sid) {
    const { totalLines, count } = countWords(jsonlPath(sid), 0);
    saveMarker(markerPathFor(sid), totalLines, count, s.active);
    wordsAtStart = count;
  }
  saveState({
    ...s,
    entryStartTs: ts,
    wordsAtEntryStart: wordsAtStart,
    totalActiveMinutes,
  }, statePath);
  const wallNote = deltaWallMin !== deltaMin ? ` (wall ${deltaWallMin})` : '';
  console.log(
    `Update ${s.active}: +${deltaMin} active min, +${idleMin} idle min${wallNote}, +${deltaWords} words. ` +
    `Total: ${totalActiveMinutes} active min, ${wordMarker.toLocaleString('en-US')} words.`
  );
}
