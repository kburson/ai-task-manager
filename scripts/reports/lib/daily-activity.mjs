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

// Round `v` up to a visually "nice" axis maximum (1/2/2.5/5/10 × 10^k).
function niceMax(v) {
  if (!(v > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
}

// Color tokens shared by lines / legend / axes so a restyle is one edit.
const DUR_COLOR = '#475569'; // slate-600 — minutes worked (left axis)
const CNT_COLOR = '#0ea5e9'; // sky-500   — distinct tasks (right axis)

// SPIKE #790 — dual-line, dual-Y-axis daily activity chart. Iteration 1:
// duration-in-minutes and distinct-task-count both plotted as lines, each on its
// own labelled Y-axis, with a dedicated bottom band for X labels so they no
// longer collide with the plot.
export function renderDailyChart(buckets) {
  const hasData = Array.isArray(buckets) && buckets.some((b) => b.durationSec > 0);
  if (!hasData) {
    return `<p class="tl-note">No timing-log activity in range.</p>`;
  }

  const n = buckets.length;
  const mins = buckets.map((b) => b.durationSec / 60);
  const durMax = niceMax(Math.max(...mins, 1));
  // Task count is integer — pick an integer step so every gridline is a whole task.
  const rawCount = Math.max(...buckets.map((b) => b.issueCount), 1);
  const cntStep = Math.max(1, Math.ceil(rawCount / 4));
  const cntMax = cntStep * 4;

  // SVG coordinate box (scaled responsively via width:100%; height:auto — text
  // stays crisp, geometry is never stretched).
  const W = 900;
  const H = 260;
  const M = { top: 22, right: 54, bottom: 40, left: 56 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const x = (idx) => (n === 1 ? M.left + plotW / 2 : M.left + (idx / (n - 1)) * plotW);
  const yDur = (min) => M.top + plotH - (min / durMax) * plotH;
  const yCnt = (c) => M.top + plotH - (c / cntMax) * plotH;

  const TICKS = 4;
  // Left axis (minutes) grid lines + labels.
  const durTicks = Array.from({ length: TICKS + 1 }, (_, i) => {
    const val = (durMax / TICKS) * i;
    const yy = yDur(val).toFixed(1);
    const grid =
      i === 0
        ? ''
        : `<line x1="${M.left}" y1="${yy}" x2="${M.left + plotW}" y2="${yy}" stroke="#e2e8f0" stroke-width="1" />`;
    const lbl = `<text x="${M.left - 8}" y="${yy}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="${DUR_COLOR}">${Math.round(val)}</text>`;
    return grid + lbl;
  }).join('');
  // Right axis (task count) labels — integer steps.
  const cntTicks = Array.from({ length: TICKS + 1 }, (_, i) => {
    const val = cntStep * i;
    const yy = yCnt(val).toFixed(1);
    return `<text x="${M.left + plotW + 8}" y="${yy}" text-anchor="start" dominant-baseline="middle" font-size="11" fill="${CNT_COLOR}">${val}</text>`;
  }).join('');

  // X-axis labels in their own bottom band (labelStep keeps them from crowding).
  const labelStep = Math.max(1, Math.ceil(n / 12));
  const xLabels = buckets
    .map((b, idx) => {
      if (idx % labelStep !== 0 && idx !== n - 1) return '';
      return `<text x="${x(idx).toFixed(1)}" y="${H - M.bottom + 18}" text-anchor="middle" font-size="11" fill="#64748b">${fmtDayLabel(b.date)}</text>`;
    })
    .join('');

  const line = (pts, color) =>
    `<polyline points="${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
  const dots = (pts, color) =>
    pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="${color}" />`).join('');

  const durPts = buckets.map((b, idx) => ({ x: x(idx), y: yDur(b.durationSec / 60) }));
  const cntPts = buckets.map((b, idx) => ({ x: x(idx), y: yCnt(b.issueCount) }));

  const axisFrame =
    `<line x1="${M.left}" y1="${M.top}" x2="${M.left}" y2="${M.top + plotH}" stroke="#94a3b8" stroke-width="1" />` +
    `<line x1="${M.left + plotW}" y1="${M.top}" x2="${M.left + plotW}" y2="${M.top + plotH}" stroke="#94a3b8" stroke-width="1" />` +
    `<line x1="${M.left}" y1="${M.top + plotH}" x2="${M.left + plotW}" y2="${M.top + plotH}" stroke="#94a3b8" stroke-width="1" />`;

  const axisTitles =
    `<text x="14" y="${M.top + plotH / 2}" text-anchor="middle" font-size="11" fill="${DUR_COLOR}" transform="rotate(-90 14 ${(M.top + plotH / 2).toFixed(1)})">minutes worked</text>` +
    `<text x="${W - 12}" y="${M.top + plotH / 2}" text-anchor="middle" font-size="11" fill="${CNT_COLOR}" transform="rotate(90 ${W - 12} ${(M.top + plotH / 2).toFixed(1)})">distinct tasks</text>`;

  const svg =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" ` +
    `style="width:100%;height:auto;display:block;font-family:inherit">` +
    durTicks +
    cntTicks +
    axisFrame +
    axisTitles +
    line(durPts, DUR_COLOR) +
    dots(durPts, DUR_COLOR) +
    line(cntPts, CNT_COLOR) +
    dots(cntPts, CNT_COLOR) +
    xLabels +
    `</svg>`;

  const legend =
    `<div style="display:flex;gap:1.25rem;justify-content:center;margin:.35rem 0 .1rem;font-size:.72rem;color:#475569">` +
    `<span><span style="display:inline-block;width:14px;height:2px;background:${DUR_COLOR};vertical-align:middle;margin-right:.35rem"></span>Minutes worked</span>` +
    `<span><span style="display:inline-block;width:14px;height:2px;background:${CNT_COLOR};vertical-align:middle;margin-right:.35rem"></span>Distinct tasks</span>` +
    `</div>`;

  return (
    `<hr class="tl-rule">` +
    `<h3 class="tl-heading">Daily Work Activity</h3>` +
    `<p class="tl-meta">Minutes worked (left axis) and distinct tasks worked (right axis) per calendar day.</p>` +
    legend +
    `<div style="margin:.25rem .25rem 0">${svg}</div>` +
    `<p class="tl-footnote">Both series are per calendar day: minutes = total active + idle wall-clock (midnight-crossing work prorated); distinct tasks = count of issues with recorded work that day.</p>`
  );
}
