import { loadState, saveState, EMPTY_STATE } from '../state.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  saveMarker,
  countWords,
} from '../word-counter.mjs';

export async function verbPlan(ctx) {
  const { cfg, statePath, drainQueueIfAny, flushActiveToGH, nowIso } = ctx;
  await drainQueueIfAny();
  const s = loadState(statePath);
  let previousNote = '';
  if (s.active && s.active !== 'plan' && cfg.autoEndOnSwitch) {
    const { deltaMin, deltaWords } = await flushActiveToGH(s, 'switch-end');
    previousNote = ` Previous: ${s.active} ended (+${deltaMin} min, +${deltaWords} words).`;
  }
  if (s.active === 'plan') {
    console.log('discarding previous plan bucket');
  }
  const ts = nowIso();
  const sid = currentSessionId();
  let wordsAtStart = 0;
  if (sid) {
    const { totalLines, count } = countWords(jsonlPath(sid), 0);
    saveMarker(markerPathFor(sid), totalLines, count, 'plan');
    wordsAtStart = count;
  }
  saveState(
    {
      ...EMPTY_STATE,
      active: 'plan',
      lastActive: s.lastActive,
      planBucket: {
        startedAt: ts,
        wordsAtStart,
        entries: [{ ts, event: 'plan-start', deltaMin: null, deltaWords: null }],
      },
    },
    statePath
  );
  console.log(`Started planning bucket.${previousNote} Use "/task new [title]" to promote.`);
}
