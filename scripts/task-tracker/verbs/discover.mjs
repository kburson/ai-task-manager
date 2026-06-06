import { loadState, saveState, EMPTY_STATE } from '../state.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  saveMarker,
  countWords,
} from '../word-counter.mjs';

export async function verbDiscover(ctx) {
  const { cfg, statePath, drainQueueIfAny, flushActiveToGH, nowIso } = ctx;
  await drainQueueIfAny();
  const s = loadState(statePath);
  let previousNote = '';
  if (s.active && s.active !== 'discover' && cfg.autoEndOnSwitch) {
    const { deltaMin, deltaWords } = await flushActiveToGH(s, 'switch-end');
    previousNote = ` Previous: ${s.active} ended (+${deltaMin} min, +${deltaWords} words).`;
  }
  if (s.active === 'discover') {
    console.log('discarding previous discovery bucket');
  }
  const ts = nowIso();
  const sid = currentSessionId();
  let wordsAtStart = 0;
  if (sid) {
    const { totalLines, count } = countWords(jsonlPath(sid), 0);
    saveMarker(markerPathFor(sid), totalLines, count, 'discover');
    wordsAtStart = count;
  }
  saveState(
    {
      ...EMPTY_STATE,
      active: 'discover',
      lastActive: s.lastActive,
      discoverBucket: {
        startedAt: ts,
        wordsAtStart,
        entries: [{ ts, event: 'discover-start', deltaMin: null, deltaWords: null }],
      },
    },
    statePath
  );
  console.log(`Started discovery bucket.${previousNote} Use "/task new [title]" to promote.`);
}

// `verbPlan` was previously a deprecated alias here that delegated back to
// `verbDiscover` with a stderr warning. Removed in #299 Item 2 — `/task plan`
// is now a dedicated refine→plan promoter in `verbs/plan.mjs`. Discovery
// (backlog-item generation / pre-issue ideation) is exclusively `/task discover`.
