import { stateIndex } from './states.mjs';

const ENTRY_REVERSE_EDGES = new Set([
  '1>0',
  '2>0',
  '3>0',
  '3>2',
  '4>2',
  '4>3',
  '5>4',
  '6>4',
  '6>5',
]);

const TIMING_REVERSE_EDGES = new Set(['2>0', '3>2', '5>4', '6>4', '6>5', '7>5']);
// Historical Assigned/On Deck occupied index 1 before #1211. Readers project
// that evidence to R4P (index 2), so the old backlog→Assigned→Refine sequence
// appears as 0→2→1→3 after normalization and must remain readable.
const LEGACY_ASSIGNED_HISTORY_EDGES = new Set(['0>2', '2>1', '1>3']);

function indexes(from, to) {
  const fromIndex = stateIndex(from);
  const toIndex = stateIndex(to);
  if (fromIndex < 0 || toIndex < 0) return null;
  return { fromIndex, toIndex, key: `${fromIndex}>${toIndex}` };
}

export function isEntryHistoryEdge(from, to) {
  const pair = indexes(from, to);
  if (!pair || pair.fromIndex === pair.toIndex) return false;
  return (
    pair.toIndex === pair.fromIndex + 1 ||
    ENTRY_REVERSE_EDGES.has(pair.key) ||
    LEGACY_ASSIGNED_HISTORY_EDGES.has(pair.key)
  );
}

export function isTimingHistoryEdge(from, to) {
  const pair = indexes(from, to);
  if (!pair) return false;
  return (
    pair.fromIndex === pair.toIndex ||
    pair.toIndex === pair.fromIndex + 1 ||
    TIMING_REVERSE_EDGES.has(pair.key) ||
    LEGACY_ASSIGNED_HISTORY_EDGES.has(pair.key)
  );
}
