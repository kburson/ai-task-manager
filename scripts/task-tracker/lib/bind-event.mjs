// #482 — first-timing-row event resolution for a `/task start <N>` /
// `/task resume <N>` bind.
//
// The `#N` path of `verbResume` handles BOTH a fresh first-ever bind and a
// genuine resume (returning to an issue that already has timing history, or a
// no-arg resume after `/task pause`). Historically it unconditionally emitted
// `resumed`, so the first-ever row on a never-bound issue read `resumed` — a
// contradiction (you cannot resume without a prior start/pause), observed on
// #480.
//
// The canonical first-row slug is `start` — the same slug `verbSwitch` emits
// for a newcomer and the only slug `firstStartTimestamp` recognizes. A genuine
// resume keeps `resumed`. The discriminator is whether the issue already has
// timing-log history (or is mid-pause).

// A timing-log data row: a table line whose first cell is a parseable
// timestamp. Excludes the header row (`| Timestamp | … |`) and the
// `|---|` separator. Tolerant of both the space- and `T`-delimited ISO forms
// the log has used.
const ROW_TS_RE = /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;

export function timingCommentHasRows(body) {
  if (!body) return false;
  for (const line of String(body).split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((s) => s.trim());
    if (cells.length < 3) continue;
    if (ROW_TS_RE.test(cells[1])) return true;
  }
  return false;
}

// Resolve the Event-cell slug for a bind. Returns `'start'` only for a fresh
// first-ever bind (no timing history and not mid-pause); otherwise `'resumed'`.
export function resolveBindEvent({ hasTimingHistory = false, paused = false } = {}) {
  if (paused) return 'resumed';
  return hasTimingHistory ? 'resumed' : 'start';
}
