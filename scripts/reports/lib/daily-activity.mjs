// Pure, I/O-free per-calendar-day aggregation of ⏱ Timing Log work windows,
// plus a print-safe dual-axis chart renderer. Isolated from the report so the
// proration math (the only fiddly part) is unit-testable.
//
// "Local day" = the report machine's calendar, read via JS Date local getters
// so DST is honored per-date (no fixed offset baked in). Row timestamps are
// absolute epochs, so bucketing is offset-independent at extraction time.
//
// Deliberate simplification — pauses: `active + idle` already excludes paused
// time. The payload is prorated by RAW wall-clock fraction of [start, end]; a
// pause sitting entirely on one side of a midnight slightly over-weights that
// day. Pause-accurate per-sub-interval subtraction is out of scope (#770).

import { parseTimingRows } from '../../task-tracker/timing-rollup.mjs';

// 'YYYY-MM-DD' for an epoch-ms in the machine's local calendar.
function localDayKey(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Epoch-ms of the local midnight that STARTS the day after `ms`.
function nextLocalMidnight(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
}

// Add one day to a 'YYYY-MM-DD' key via local-calendar arithmetic.
function nextDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const nd = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  const yy = nd.getFullYear();
  const mm = String(nd.getMonth() + 1).padStart(2, '0');
  const dd = String(nd.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// Allocate `payload` seconds across local days spanned by [start, end].
// Calls sink(dayKey, seconds) for each day touched. Degenerate end===start
// assigns the whole payload to start's day (no divide-by-zero).
function allocateWindow(start, end, payload, sink) {
  if (!(end > start)) {
    sink(localDayKey(start), payload);
    return;
  }
  const span = end - start;
  let cursor = start;
  while (cursor < end) {
    const boundary = Math.min(nextLocalMidnight(cursor), end);
    const seconds = (payload * (boundary - cursor)) / span;
    sink(localDayKey(cursor), seconds);
    cursor = boundary;
  }
}

export function bucketRowsByDay(issues, { fromMs = null, toMs = null } = {}) {
  // dayKey -> { durationSec, issues:Set<number> }
  const days = new Map();
  const touch = (key) => {
    let e = days.get(key);
    if (!e) {
      e = { durationSec: 0, issues: new Set() };
      days.set(key, e);
    }
    return e;
  };

  for (const issue of issues ?? []) {
    const rows = parseTimingRows(issue.body ?? '');
    let prev = null;
    for (const row of rows) {
      if (row.tsMs == null) {
        prev = row.tsMs == null ? prev : row;
        continue;
      }
      if (prev == null || prev.tsMs == null) {
        prev = row;
        continue;
      }
      const payload = (row.activeSec ?? 0) + (row.idleSec ?? 0);
      const start = prev.tsMs;
      const end = row.tsMs;
      // Per-issue local allocation for this window; fold into global map after
      // window clamp so issueCount only counts days with > 0 in-range duration.
      allocateWindow(start, end, payload, (key, seconds) => {
        const e = touch(key);
        e.durationSec += seconds;
        if (seconds > 0) e.issues.add(issue.number);
      });
      prev = row;
    }
  }

  // Window clamp: drop whole days outside [fromMs, toMs] by their local-midnight
  // start. A partially-in-range day is kept (report windows are coarse day
  // filters, and the timing rows already sit inside the closed issue's life).
  for (const key of [...days.keys()]) {
    const [y, m, d] = key.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    const dayEnd = new Date(y, m - 1, d + 1, 0, 0, 0, 0).getTime();
    if (fromMs != null && dayEnd <= fromMs) days.delete(key);
    else if (toMs != null && dayStart > toMs) days.delete(key);
  }

  if (days.size === 0) return [];

  // Contiguous fill between the min and max present day (or the clamp window,
  // when provided, so an empty leading/trailing range still renders zeros).
  const presentKeys = [...days.keys()].sort();
  let minKey = presentKeys[0];
  let maxKey = presentKeys[presentKeys.length - 1];
  if (fromMs != null) minKey = minKey < localDayKey(fromMs) ? minKey : localDayKey(fromMs);
  if (toMs != null) maxKey = maxKey > localDayKey(toMs) ? maxKey : localDayKey(toMs);

  const out = [];
  for (let key = minKey; ; key = nextDayKey(key)) {
    const e = days.get(key);
    out.push({
      date: key,
      durationSec: e ? Math.round(e.durationSec) : 0,
      issueCount: e ? e.issues.size : 0,
    });
    if (key === maxKey) break;
  }
  return out;
}
