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

export function extractTimingBody(comments) {
  for (const c of comments ?? []) {
    if (c?.body?.includes('⏱ Timing Log')) return c.body;
  }
  return null;
}

function fmtDayLabel(key) {
  const [, m, d] = key.split('-').map(Number);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTHS[m - 1]} ${d}`;
}

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function renderDailyChart(buckets) {
  const hasData = Array.isArray(buckets) && buckets.some((b) => b.durationSec > 0);
  if (!hasData) {
    return `<p class="tl-note">No timing-log activity in range.</p>`;
  }
  const PLOT_H = 160;
  const maxDur = Math.max(...buckets.map((b) => b.durationSec), 1);
  const maxCount = Math.max(...buckets.map((b) => b.issueCount), 1);
  const n = buckets.length;
  const labelStep = Math.max(1, Math.ceil(n / 15));
  const bars = buckets
    .map((b, idx) => {
      const h = Math.round((b.durationSec / maxDur) * PLOT_H);
      const label = idx % labelStep === 0 ? fmtDayLabel(b.date) : '';
      const title = `${b.date} · ${fmtDuration(b.durationSec)} · ${b.issueCount} issue${b.issueCount === 1 ? '' : 's'}`;
      return (
        `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;min-width:0" title="${title}">` +
        `<div style="width:60%;height:${h}px;background:#64748b;border-radius:2px 2px 0 0"></div>` +
        `<div style="font-size:.55rem;color:#64748b;margin-top:.2rem;white-space:nowrap;overflow:hidden">${label}</div>` +
        `</div>`
      );
    })
    .join('');
  const pts = buckets.map((b, idx) => {
    const x = ((idx + 0.5) / n) * 100;
    const y = PLOT_H - (b.issueCount / maxCount) * PLOT_H;
    return { x, y };
  });
  const polyPoints = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const dots = pts
    .map((p) => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="2.5" fill="#0ea5e9" />`)
    .join('');
  const svg =
    `<svg viewBox="0 0 100 ${PLOT_H}" preserveAspectRatio="none" ` +
    `style="position:absolute;inset:0;width:100%;height:${PLOT_H}px;overflow:visible">` +
    `<polyline points="${polyPoints}" fill="none" stroke="#0ea5e9" stroke-width="1" vector-effect="non-scaling-stroke" />` +
    `${dots}</svg>`;
  return (
    `<hr class="tl-rule">` +
    `<h3 class="tl-heading">Daily Work Activity</h3>` +
    `<p class="tl-meta">Total time worked (bars, left) and distinct issues worked (line, right) per calendar day.</p>` +
    `<div style="position:relative;height:${PLOT_H + 18}px;margin:.5rem .25rem 0">` +
    `<div style="position:relative;display:flex;align-items:flex-end;gap:2px;height:${PLOT_H + 18}px">${bars}</div>` +
    `<div style="position:absolute;top:0;left:0;right:0;height:${PLOT_H}px;pointer-events:none">${svg}</div>` +
    `</div>` +
    `<p class="tl-footnote">Duration bars: total active + idle wall-clock, midnight-crossing work prorated. Line: count of distinct issues with recorded work that day.</p>`
  );
}
