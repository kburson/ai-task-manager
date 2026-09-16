# Daily Work Activity Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-calendar-day "Daily Work Activity" chart (total time worked + distinct issues worked) to the AI value report, sourced directly from each issue's ⏱ Timing Log, and record that the board `Session Time` field already equals the timing-log active-second sum (Part 1 validation, no code change).

**Architecture:** A new pure, I/O-free module `scripts/reports/lib/daily-activity.mjs` owns all the fiddly work — extracting the timing-log comment, bucketing rows into local-calendar days with midnight proration, and rendering a print-safe dual-axis combo chart. `scripts/reports/generate-value-report.mjs` imports three functions from it, widens its GraphQL comment fetch, captures each issue's timing-log body, and injects the chart into the Timeline Analysis section. All new logic is unit-tested; the report file is touched minimally.

**Tech Stack:** Node.js ES modules (`node --test`, `node:assert`), no new dependencies. Reuses `parseTimingRows` from `scripts/task-tracker/timing-rollup.mjs`.

## Global Constraints

- Node.js v18+, ES modules (`import`/`export`) — matches the existing repo.
- No new npm dependencies.
- The new module must be pure (no `gh`, no filesystem, no network) so it is unit-testable.
- Chart HTML must be print-safe: all styles/colors inline or via existing `tl-*` classes, no external assets (the report is rendered to PDF by puppeteer).
- Currency (none here) in backticks; no emojis in code.
- Every commit subject leads with `[#770]` (auto-injected by the commit gate; write the rest of the subject normally).
- Tests live under `scripts/reports/tests/` (repo convention), not colocated with source.
- Row shape from `parseTimingRows(body)` is `{ tsMs, event, activeMin, activeSec, idleSec, wordMarker }`; `tsMs` is an absolute epoch-ms (offset already resolved) or `null` for an unparseable timestamp; legacy rows without a `<!-- row-sec: a=N i=N -->` marker get `activeSec = activeMin*60`, `idleSec = 0`.

---

### Task 1: `bucketRowsByDay` — day bucketing with midnight proration

**Files:**

- Create: `scripts/reports/lib/daily-activity.mjs`
- Test: `scripts/reports/tests/daily-activity.test.mjs`

**Interfaces:**

- Consumes: `parseTimingRows` from `../../task-tracker/timing-rollup.mjs` (relative to the new file: `scripts/reports/lib/` → `scripts/task-tracker/timing-rollup.mjs` is `../../task-tracker/timing-rollup.mjs`).
- Produces:
  - `bucketRowsByDay(issues, { fromMs = null, toMs = null }) -> DayBucket[]`
    - `issues`: `Array<{ number: number, body: string }>` where `body` is the ⏱ Timing Log comment body.
    - returns `DayBucket[]` sorted ascending by `date`, contiguous (interior empty days present as zero buckets).
    - `DayBucket = { date: 'YYYY-MM-DD', durationSec: number, issueCount: number }`.

- [ ] **Step 1: Write the failing test file with the single-day case**

Create `scripts/reports/tests/daily-activity.test.mjs`:

```js
#!/usr/bin/env node
// @story #770
// Unit tests for bucketRowsByDay — per-local-calendar-day duration + distinct
// issue count with midnight proration.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { bucketRowsByDay } from '../lib/daily-activity.mjs';

// Build a ⏱ Timing Log comment body from row tuples. Each row renders as a
// table line the parser accepts, with a `row-sec` marker carrying a/i seconds.
// `ts` is a wall-clock string with explicit offset so tsMs is deterministic
// regardless of the machine running the test.
function log(rows) {
  const header = [
    '### ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Word Marker |',
    '| --- | --- | --- | --- |',
  ];
  const body = rows.map(
    (r) =>
      `| ${r.ts} | ${r.event ?? 'progress'} | ${r.activeMin ?? 0} | ${r.words ?? 0} | <!-- row-sec: a=${r.a ?? 0} i=${r.i ?? 0} -->`
  );
  return [...header, ...body].join('\n');
}

test('single-day window places the whole payload on one day', () => {
  // Two rows an hour apart, same local day. Window = [start, second row].
  // payload = a+i = 3000+600 = 3600s, all on 2026-03-10.
  const body = log([
    { ts: '2026-03-10 09:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-10 10:00:00 -07:00', event: 'progress', a: 3000, i: 600 },
  ]);
  const buckets = bucketRowsByDay([{ number: 1, body }], {});
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].date, '2026-03-10');
  assert.equal(buckets[0].durationSec, 3600);
  assert.equal(buckets[0].issueCount, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/reports/tests/daily-activity.test.mjs`
Expected: FAIL — `Cannot find module '../lib/daily-activity.mjs'` (module not created yet).

- [ ] **Step 3: Write the minimal module to pass Step 1**

Create `scripts/reports/lib/daily-activity.mjs`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/reports/tests/daily-activity.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Add the remaining bucketing fixtures**

Append to `scripts/reports/tests/daily-activity.test.mjs`:

```js
test('midnight-crossing window prorates across two days in the right ratio', () => {
  // Window 23:00 -> 01:00 (-07:00), payload 3600s. 1h before local midnight,
  // 1h after → 1800s each on 03-10 and 03-11.
  const body = log([
    { ts: '2026-03-10 23:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-11 01:00:00 -07:00', event: 'progress', a: 3600, i: 0 },
  ]);
  const buckets = bucketRowsByDay([{ number: 7, body }], {});
  const byDate = Object.fromEntries(buckets.map((b) => [b.date, b]));
  assert.equal(byDate['2026-03-10'].durationSec, 1800);
  assert.equal(byDate['2026-03-11'].durationSec, 1800);
  assert.equal(byDate['2026-03-10'].issueCount, 1);
  assert.equal(byDate['2026-03-11'].issueCount, 1);
});

test('multi-midnight window splits across every crossed boundary', () => {
  // 48h window (2 midnights) → 3 days, middle full day gets the largest share.
  const body = log([
    { ts: '2026-03-10 12:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-12 12:00:00 -07:00', event: 'progress', a: 172800, i: 0 },
  ]);
  const buckets = bucketRowsByDay([{ number: 3, body }], {});
  const byDate = Object.fromEntries(buckets.map((b) => [b.date, b.durationSec]));
  // 12h + 24h + 12h of a 48h window carrying 172800s → 43200 / 86400 / 43200.
  assert.equal(byDate['2026-03-10'], 43200);
  assert.equal(byDate['2026-03-11'], 86400);
  assert.equal(byDate['2026-03-12'], 43200);
});

test('distinct issue count: same day two issues → 2; one issue over N days → 1 each', () => {
  const a = log([
    { ts: '2026-03-10 09:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-10 10:00:00 -07:00', event: 'progress', a: 3600, i: 0 },
  ]);
  const b = log([
    { ts: '2026-03-10 14:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-11 14:00:00 -07:00', event: 'progress', a: 86400, i: 0 },
  ]);
  const buckets = bucketRowsByDay(
    [
      { number: 1, body: a },
      { number: 2, body: b },
    ],
    {}
  );
  const byDate = Object.fromEntries(buckets.map((x) => [x.date, x]));
  assert.equal(byDate['2026-03-10'].issueCount, 2); // issues 1 and 2
  assert.equal(byDate['2026-03-11'].issueCount, 1); // issue 2 only
});

test('window clamp drops out-of-range days', () => {
  const body = log([
    { ts: '2026-03-10 09:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-10 10:00:00 -07:00', event: 'progress', a: 3600, i: 0 },
    { ts: '2026-03-20 09:00:00 -07:00', event: 'progress', a: 3600, i: 0 },
  ]);
  // Clamp to 03-15..03-31 → only the 03-20 window's day survives.
  const fromMs = new Date(2026, 2, 15, 0, 0, 0, 0).getTime();
  const toMs = new Date(2026, 2, 31, 23, 59, 59, 999).getTime();
  const buckets = bucketRowsByDay([{ number: 5, body }], { fromMs, toMs });
  const dates = buckets.map((b) => b.date);
  assert.ok(!dates.includes('2026-03-10'), 'pre-window day dropped');
  assert.ok(dates.includes('2026-03-20'), 'in-window day kept');
});

test('contiguous fill: an empty interior day is a zero bucket', () => {
  const body = log([
    { ts: '2026-03-10 09:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-10 10:00:00 -07:00', event: 'progress', a: 3600, i: 0 },
    { ts: '2026-03-12 09:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-12 10:00:00 -07:00', event: 'progress', a: 3600, i: 0 },
  ]);
  const buckets = bucketRowsByDay([{ number: 8, body }], {});
  const byDate = Object.fromEntries(buckets.map((b) => [b.date, b]));
  assert.equal(buckets.length, 3, '03-10, 03-11 (empty), 03-12');
  assert.equal(byDate['2026-03-11'].durationSec, 0);
  assert.equal(byDate['2026-03-11'].issueCount, 0);
});

test('degenerate same-second rows: no divide-by-zero, whole payload placed', () => {
  const body = log([
    { ts: '2026-03-10 09:00:00 -07:00', event: 'start', a: 0, i: 0 },
    { ts: '2026-03-10 09:00:00 -07:00', event: 'progress', a: 120, i: 0 },
  ]);
  const buckets = bucketRowsByDay([{ number: 9, body }], {});
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].date, '2026-03-10');
  assert.equal(buckets[0].durationSec, 120);
});

test('legacy rows without a row-sec marker derive seconds from Active minutes', () => {
  // No `<!-- row-sec -->` marker → activeSec = activeMin*60, idleSec = 0.
  const header = [
    '### ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Word Marker |',
    '| --- | --- | --- | --- |',
  ];
  const rows = [
    '| 2026-03-10 09:00:00 -07:00 | start | 0 | 0 |',
    '| 2026-03-10 10:00:00 -07:00 | progress | 60 | 0 |',
  ];
  const body = [...header, ...rows].join('\n');
  const buckets = bucketRowsByDay([{ number: 4, body }], {});
  assert.equal(buckets[0].durationSec, 3600, '60 Active min → 3600s');
});
```

- [ ] **Step 6: Run the full bucketing test file**

Run: `node --test scripts/reports/tests/daily-activity.test.mjs`
Expected: PASS (8 tests). If the multi-midnight ratio assertion fails, verify `allocateWindow` uses `nextLocalMidnight(cursor)` (start of the NEXT day) as the boundary, not the current day.

- [ ] **Step 7: Commit**

```bash
git add scripts/reports/lib/daily-activity.mjs scripts/reports/tests/daily-activity.test.mjs
git commit -m "feat(reports): bucketRowsByDay — per-day timing-log aggregation with midnight proration"
```

---

### Task 2: `extractTimingBody` + `renderDailyChart` — capture + render

**Files:**

- Modify: `scripts/reports/lib/daily-activity.mjs` (add two exports)
- Test: `scripts/reports/tests/generate-value-report-daily.test.mjs`

**Interfaces:**

- Consumes: `bucketRowsByDay` (Task 1), `DayBucket` shape.
- Produces:
  - `extractTimingBody(comments) -> string | null` — given a GraphQL `comments.nodes` array (`Array<{ body: string }>`), returns the body of the first comment containing `⏱ Timing Log`, else `null`.
  - `renderDailyChart(buckets) -> string` — an HTML fragment. Empty/all-zero `buckets` returns a `<p class="tl-note">` placeholder; otherwise a `<div>` with per-day bars and an inline `<svg>` issue-count polyline.

- [ ] **Step 1: Write the failing render/capture test**

Create `scripts/reports/tests/generate-value-report-daily.test.mjs`:

```js
#!/usr/bin/env node
// @story #770
// Tests for the report-facing pieces of the Daily Work Activity chart:
// timing-log comment capture, chart rendering, and the widened comment fetch.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { extractTimingBody, renderDailyChart } from '../lib/daily-activity.mjs';

test('extractTimingBody returns the timing-log comment body, else null', () => {
  const comments = [
    { body: 'just a normal comment' },
    { body: '### ⏱ Timing Log\n\n| Timestamp | Event |' },
  ];
  assert.match(extractTimingBody(comments), /⏱ Timing Log/);
  assert.equal(extractTimingBody([{ body: 'no log here' }]), null);
  assert.equal(extractTimingBody(undefined), null);
});

test('renderDailyChart on empty buckets returns the tl-note placeholder', () => {
  const html = renderDailyChart([]);
  assert.match(html, /tl-note/);
  assert.match(html, /No timing-log activity/i);
});

test('renderDailyChart on all-zero buckets returns the placeholder', () => {
  const html = renderDailyChart([{ date: '2026-03-10', durationSec: 0, issueCount: 0 }]);
  assert.match(html, /tl-note/);
});

test('renderDailyChart renders bars and an issue-count polyline for real data', () => {
  const html = renderDailyChart([
    { date: '2026-03-10', durationSec: 3600, issueCount: 1 },
    { date: '2026-03-11', durationSec: 7200, issueCount: 2 },
  ]);
  assert.match(html, /<svg/, 'has an inline svg for the count series');
  assert.match(html, /<polyline/, 'connects the count points');
  assert.match(html, /Daily Work Activity/, 'labels the chart');
  // Both day labels present.
  assert.match(html, /Mar 10/);
  assert.match(html, /Mar 11/);
});

test('report widens the timing-log comment fetch to first: 100', () => {
  const src = readFileSync(new URL('../generate-value-report.mjs', import.meta.url), 'utf8');
  assert.match(src, /comments\(first:\s*100\)/, 'GraphQL comment fetch widened to 100');
});

test('report imports and calls the daily-activity module', () => {
  const src = readFileSync(new URL('../generate-value-report.mjs', import.meta.url), 'utf8');
  assert.match(src, /from '\.\/lib\/daily-activity\.mjs'/, 'imports the module');
  assert.match(src, /bucketRowsByDay\(/, 'calls bucketRowsByDay');
  assert.match(src, /renderDailyChart\(/, 'calls renderDailyChart');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/reports/tests/generate-value-report-daily.test.mjs`
Expected: FAIL — `extractTimingBody`/`renderDailyChart` are not exported yet (and the source-scan tests fail until Task 3).

- [ ] **Step 3: Add `extractTimingBody` and `renderDailyChart` to the module**

Append to `scripts/reports/lib/daily-activity.mjs`:

```js
// Locate the ⏱ Timing Log comment among a GraphQL comments.nodes array. Same
// locator parseStartInfo uses in the report. Returns its body or null.
export function extractTimingBody(comments) {
  for (const c of comments ?? []) {
    if (c?.body?.includes('⏱ Timing Log')) return c.body;
  }
  return null;
}

function fmtDayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${MONTHS[m - 1]} ${d}`;
}

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// Print-safe dual-axis combo chart: duration as flex-height bars (left axis,
// hours), distinct-issue count as an inline-SVG polyline + dots (right axis,
// integer). All colors inline so puppeteer PDF export keeps them.
export function renderDailyChart(buckets) {
  const hasData = Array.isArray(buckets) && buckets.some((b) => b.durationSec > 0);
  if (!hasData) {
    return `<p class="tl-note">No timing-log activity in range.</p>`;
  }

  const PLOT_H = 160; // px
  const maxDur = Math.max(...buckets.map((b) => b.durationSec), 1);
  const maxCount = Math.max(...buckets.map((b) => b.issueCount), 1);
  const n = buckets.length;
  const labelStep = Math.max(1, Math.ceil(n / 15));

  // Bars: one flex column per day.
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

  // Count polyline: x = column center as a percentage, y in the PLOT_H box.
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
```

- [ ] **Step 4: Run the render tests (source-scan tests still fail)**

Run: `node --test scripts/reports/tests/generate-value-report-daily.test.mjs`
Expected: the three `renderDailyChart` tests and the `extractTimingBody` test PASS; the two source-scan tests (`first: 100`, imports/calls) still FAIL — they pass after Task 3. This is expected mid-task.

- [ ] **Step 5: Commit**

```bash
git add scripts/reports/lib/daily-activity.mjs scripts/reports/tests/generate-value-report-daily.test.mjs
git commit -m "feat(reports): extractTimingBody + renderDailyChart for the daily activity chart"
```

---

### Task 3: Wire the chart into `generate-value-report.mjs`

**Files:**

- Modify: `scripts/reports/generate-value-report.mjs`
  - Import block (top of file, with the other imports).
  - GraphQL query `comments(first: 10)` → `comments(first: 100)` (currently line ~159).
  - `processItems` map object (currently ~252-269): add `timingBody`.
  - `buildHtml` Backlog Engagement Timeline block (returned template ends ~1001): inject the chart after the last `tl-note`.
- Test: `scripts/reports/tests/generate-value-report-daily.test.mjs` (the two source-scan tests from Task 2).

**Interfaces:**

- Consumes: `bucketRowsByDay`, `renderDailyChart`, `extractTimingBody` from `./lib/daily-activity.mjs`.
- Produces: no new exports (the report is an executable script). Adds an item field `timingBody: string | null` used only within the file.

- [ ] **Step 1: Add the import**

Find the existing import group near the top of `scripts/reports/generate-value-report.mjs` (the file imports from `node:fs`, `node:path`, and `./lib/...`). Add:

```js
import { bucketRowsByDay, renderDailyChart, extractTimingBody } from './lib/daily-activity.mjs';
```

- [ ] **Step 2: Widen the comment fetch**

In `fetchProject`'s GraphQL string, change:

```js
                  comments(first: 10) {
                    nodes { body }
                  }
```

to:

```js
                  // #770 — widened from 10 to capture the full ⏱ Timing Log
                  // comment for per-day bucketing. The timing log is a single
                  // in-place-edited comment, so 100 covers real issues without
                  // pagination; round-trip count is unchanged.
                  comments(first: 100) {
                    nodes { body }
                  }
```

- [ ] **Step 3: Capture the timing-log body in `processItems`**

In the object returned by `processItems(...).map(...)`, immediately after the `...parseStartInfo(n.content.comments?.nodes),` line, add:

```js
        timingBody:   extractTimingBody(n.content.comments?.nodes),
```

- [ ] **Step 4: Inject the chart into the Timeline Analysis section**

In `buildHtml`, locate the Backlog Engagement Timeline IIFE. Its returned template string ends with a run of `<p class="tl-note">…</p>` blocks and a closing backtick (currently near line 1001, the block that ends ``…default to solo.\n      </p>\` ``). Insert the chart immediately before that closing backtick, computing buckets from the in-scope `items`:

```js
      </p>
      ${(() => {
        const buckets = bucketRowsByDay(
          items.map((i) => ({ number: i.number, body: i.timingBody ?? '' })),
          { fromMs: cfg.fromDate ? cfg.fromDate.getTime() : null,
            toMs:   cfg.toDate   ? cfg.toDate.getTime()   : null },
        );
        return renderDailyChart(buckets);
      })()}`;
```

(The `</p>` shown is the existing final tag of the last `tl-note`; keep it. Only the `${(() => { … })()}` interpolation and the surrounding backtick placement are new — the chart fragment lands inside the same returned string, before its closing backtick.)

- [ ] **Step 5: Run the source-scan tests to verify they now pass**

Run: `node --test scripts/reports/tests/generate-value-report-daily.test.mjs`
Expected: PASS (6 tests) — the `first: 100` and imports/calls source-scan tests now find their patterns.

- [ ] **Step 6: Smoke-check the report renders HTML without throwing**

Run: `node scripts/reports/generate-value-report.mjs --html-only --output ./.tmp/inspect/daily-smoke.html 2>&1 | tail -5`
Expected: prints `HTML → ./.tmp/inspect/daily-smoke.html` with no stack trace. (Requires `gh` auth + project access; if the environment lacks it, note that and rely on the unit tests. Do NOT commit the smoke output.)

- [ ] **Step 7: Verify the chart appears in the smoke output**

Run: `grep -c "Daily Work Activity" ./.tmp/inspect/daily-smoke.html`
Expected: `1` (or, if there is genuinely no timing data in range, the placeholder text `No timing-log activity in range` appears instead — `grep -c "No timing-log activity" ./.tmp/inspect/daily-smoke.html` returns `1`).

- [ ] **Step 8: Commit**

```bash
git add scripts/reports/generate-value-report.mjs
git commit -m "feat(reports): render Daily Work Activity chart in the value report"
```

---

### Task 4: Part 1 validation record + freshness caveat (AC1)

**Files:**

- Modify: `docs/superpowers/specs/2026-07-11-daily-work-activity-chart-design.md` (already committed with the deliverable; the validation record already lives in its "Part 1 is already satisfied" section — this task confirms it and adds the caveat to the report's own notes so a report reader sees it).
- Modify: `scripts/reports/generate-value-report.mjs` — add the freshness caveat to the Timeline Analysis notes so it is visible in the rendered report.

**Interfaces:** none (documentation/copy only).

- [ ] **Step 1: Confirm the validation chain is accurately recorded in the design doc**

Read `docs/superpowers/specs/2026-07-11-daily-work-activity-chart-design.md` → "Part 1 is already satisfied" section. Verify it names all three links: `parseTimingRows` → `rollupTotals.totalActiveSec` → `log-issue-time.mjs` writes `sessionTime: totalActiveSec`. No code change; this is the AC1 record. (AC1 is tagged `invalid — non-demonstrable` in #770 precisely because it is a validation/doc claim with no code artifact to unit-test.)

- [ ] **Step 2: Surface the freshness caveat in the report**

In `buildHtml`, add one `tl-footnote` (or extend the Daily Work Activity footnote from Task 2) near the chart:

```js
<p class="tl-footnote">
  Per-issue Session Time is sourced from the board field, which equals the timing-log active-second
  sum as of the last <code>log-issue-time</code> run — current for closed issues, potentially stale
  for in-flight ones. The Daily Work Activity chart reads timing-log rows directly and is
  unaffected.
</p>
```

Place it immediately after the `renderDailyChart(buckets)` interpolation added in Task 3 Step 4 (inside the same returned template string).

- [ ] **Step 3: Smoke-render and confirm the caveat is present**

Run: `node scripts/reports/generate-value-report.mjs --html-only --output ./.tmp/inspect/daily-smoke.html 2>&1 | tail -2 && grep -c "potentially stale" ./.tmp/inspect/daily-smoke.html`
Expected: `1`.

- [ ] **Step 4: Commit**

```bash
git add scripts/reports/generate-value-report.mjs
git commit -m "docs(reports): record Session Time = timing-log sum validation + freshness caveat"
```

---

### Task 5: Develop-phase verification + AC/VC bookkeeping

**Files:** none (verification only).

- [ ] **Step 1: Run the develop verifier**

Run: `node scripts/task-tracker/verify-develop.mjs`
Expected: lint + format clean; both changed `*.test.mjs` files run and PASS. If lint auto-fixes files, the commits already made are fine — re-stage and amend only if the verifier reports unfixable errors.

- [ ] **Step 2: Confirm the VC-cited commands both pass (they are what the Test stage will re-run)**

Run: `node --test scripts/reports/tests/daily-activity.test.mjs`
Run: `node --test scripts/reports/tests/generate-value-report-daily.test.mjs`
Expected: both PASS. These are the exact commands cited by `vc:1` and `vc:2` in the #770 body.

- [ ] **Step 3: Promote to Test**

Once all tasks are green, hand back to the `/task` state machine: `npx aitm promote 770` (Develop → Test). The Test stage runs the full suite in an isolated worktree and re-verifies the VC commands.

---

## Self-Review

**Spec coverage:**

- Part 1 validation + freshness caveat → Task 4 (AC1). ✓
- `bucketRowsByDay` pure module, `DayBucket[]` → Task 1 (AC2). ✓
- Proration / midnight split / multi-midnight / degenerate → Task 1 Steps 5-6 (AC3). ✓
- Distinct `issueCount` → Task 1 distinct-count test (AC4). ✓
- Widened `first: 100` fetch + `timingBody` capture → Task 3 Steps 2-3 (AC5). ✓
- `renderDailyChart` dual-axis + empty placeholder → Task 2 (AC6). ✓
- Unit tests for all eight fixtures → Task 1 Step 5 (AC7). ✓
- VC commands `vc:1` = `daily-activity.test.mjs`, `vc:2` = `generate-value-report-daily.test.mjs` → produced by Tasks 1-2, verified in Task 5. ✓

**Placeholder scan:** No TBD/TODO/"add error handling" — every code step carries full code. The only intentional deferral (pause-accurate proration) is documented in the module header and the design's Out-of-Scope, not left as a code placeholder. ✓

**Type consistency:** `DayBucket = { date, durationSec, issueCount }` used identically in Task 1 (produced), Task 2 (`renderDailyChart` consumes `b.durationSec` / `b.issueCount` / `b.date`), and Task 3 (buckets passed straight through). `bucketRowsByDay(issues, {fromMs,toMs})`, `renderDailyChart(buckets)`, `extractTimingBody(comments)` names match across the module, the report import, and the tests. ✓

**Out of scope (carried from the spec):** pause-accurate midnight proration; changing the per-issue seed source; comment pagination beyond 100; in-flight issues in the chart.
