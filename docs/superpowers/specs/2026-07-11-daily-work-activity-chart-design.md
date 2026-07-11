# Daily Work Activity Chart — Design (#770)

Recalibrate the value report to the timing-log entry format and add a per-day
timeline chart of issue count and work duration.

## Problem & Goals

Issue #770 asks for two related changes to `scripts/reports/generate-value-report.mjs`:

1. **Recalibration to the timing-log entry format** — confirm the report's
   per-issue time seed is grounded in the timing-log ledger, not a stale or
   parallel source.
2. **New per-day timeline chart** — for the report's time period, show, per
   calendar day: the total time worked across issues and the number of distinct
   issues worked that day.

### Part 1 is already satisfied — validation, no code change

The board `Session Time` field **is** the aggregate of the timing-log table.
Evidence chain:

- `parseTimingRows(body)` (`scripts/task-tracker/timing-rollup.mjs`) reads each
  row's `activeSec` from the hidden `<!-- row-sec: a=NNN i=NNN -->` marker (legacy
  rows fall back to `activeMin × 60`).
- `rollupTotals(rows)` sums those into `totalActiveSec`.
- `scripts/gh/log-issue-time.mjs` (the sole board-write path) writes
  `sessionTime: totalActiveSec` to the board `Session Time` field.

So the report may keep sourcing the **per-issue** seed from the board
`Session Time` field (`sessionToMinutes()`), which already equals
Σ(row-sec active seconds). No per-issue re-plumbing is required.

**Caveat:** the board field is only as fresh as the last `log-issue-time` run —
current for Done/closed issues (close flushes it) but potentially stale for
in-flight issues. This does not affect the chart, which reads timing-log rows
directly (below).

The remaining, genuinely new work is Part 2: the per-day chart, which the board
field **cannot** supply because it is a single scalar per issue with no per-day
breakdown. The chart must read the timing-log rows directly and bucket them by
calendar day.

## Confirmed decisions (brainstorming Q&A)

- **Duration metric per day:** active **+** idle wall-clock (Q2 = option 2).
- **Day boundary timezone:** the **report machine's** local calendar (Q3). Row
  timestamps are absolute epochs; day membership and midnight boundaries use the
  generating machine's local time, honoring DST per-date via JS `Date` local
  getters.
- **Midnight-crossing rows:** prorate the row's payload across the calendar days
  its work-window spans, proportional to wall-clock time on each side of local
  midnight (Q3).
- **Issue set feeding the chart:** only issues that pass the existing report
  filters — closed + attribution (#782 three-signal) + kanban status +
  `closedAt`-in-window (Q4 = a2). Reuses `processItems()` output; no separate
  fetch of in-flight issues.
- **X-axis range:** `--from`/`--to` window if provided, else min→max row-date
  across contributing issues; empty days inside the range render as zero bars
  (Q4 = b1).
- **Per-day semantics (Q5, confirmed):**
  - _Duration_ = Σ(active+idle) of all in-scope rows bucketing to that local day,
    midnight-crossing rows prorated.
  - _Issue count_ = number of **distinct** in-scope issues with > 0 allocated
    duration that day (an issue worked across 3 days counts once on each day).
- **Visual encoding (Q5 = layout 1):** dual-axis combo — duration as bars (left
  axis, hours), issue-count as an overlaid line + dots (right axis, integer).

## Architecture

Approach **A** (chosen): a new pure module isolates the fiddly proration math so
it can be unit-tested; the report imports it and renders.

```
scripts/reports/lib/daily-activity.mjs   (new, pure — no I/O)
  bucketRowsByDay(issues, { fromMs, toMs }) -> DayBucket[]

scripts/reports/generate-value-report.mjs (edited)
  - widen comment fetch (first: 10 -> first: 100)
  - capture each issue's timing-log comment body as `timingBody`
  - call bucketRowsByDay(...) on the in-scope items
  - renderDailyChart(buckets) -> HTML, placed in Timeline Analysis
```

Rejected alternatives:

- **B — extend `timing-rollup.mjs`:** that module is per-issue totals and is a
  task-tracker lib; cross-issue calendar aggregation is a reports concern.
- **C — inline in the report:** the report is a side-effect-heavy monolith
  (live `gh` calls) and cannot be unit-tested; the proration logic must have
  tests.

## Module: `scripts/reports/lib/daily-activity.mjs`

Pure, no I/O. Reuses `parseTimingRows` from
`scripts/task-tracker/timing-rollup.mjs`.

### Interface

```js
// issues: Array<{ number: number, body: string }>
//   body carries the ⏱ Timing Log rows (the timing-log comment body).
// opts.fromMs / opts.toMs: epoch-ms window bounds or null.
// returns: DayBucket[] sorted ascending by date, contiguous (empty days = zeros).
//   DayBucket = { date: 'YYYY-MM-DD', durationSec: number, issueCount: number }
bucketRowsByDay(issues, { fromMs = null, toMs = null }) -> DayBucket[]
```

### Algorithm

1. **Extract rows.** Per issue, `parseTimingRows(body)` → rows
   `{ tsMs, activeSec, idleSec, ... }`. `tsMs` is an absolute epoch (parser
   resolved each row's own `±HH:MM` offset), so bucketing is offset-independent
   at extraction time.

2. **Reconstruct each row's work-window.** A `row-sec` marker's `a=/i=` counts
   the delta _since the previous row_, so its seconds belong to
   `[prevRow.tsMs, row.tsMs]`. Pair each row (index ≥ 1) with its predecessor;
   the first `start` row has no predecessor (its own `a=0 i=0`) and seeds no
   window. Per-window payload = `activeSec + idleSec`.

3. **Split at local midnight & prorate.** "Local" = the report machine's
   calendar, read via `Date` local getters so DST is honored per-date (no fixed
   offset baked in). For window `[start, end]`:
   - Walk local-midnight boundaries strictly inside `(start, end)`.
   - For each sub-interval `[a, b]` (within one local day):
     `alloc = payload × (b − a) / (end − start)`, added to that day's
     `durationSec`.
   - Degenerate `end === start` → whole payload to that one day (no
     divide-by-zero).
   - Multi-midnight windows (> 24 h gap) split at every crossed boundary.

4. **Distinct issue count.** An issue counts toward a day's `issueCount` iff it
   contributed **> 0** allocated duration to that day.

5. **Window clamp & fill.** If `fromMs`/`toMs` given, drop day-allocations
   outside the window; a straddling window keeps only its in-range days. Final
   range = `[fromMs..toMs]` if provided, else `[min..max]` of contributing
   day-dates, filled contiguously (missing days → zero buckets).

### Deliberate simplification — pauses

`active + idle` already _excludes_ paused time (a pause is removed, not counted
as idle). The payload is prorated by **raw wall-clock** fraction of
`[start, end]`. If a pause sits entirely on one side of a midnight, that day is
very slightly over-weighted. Pause-accurate per-sub-interval subtraction (via
`pauseSpansBetween`) is possible but adds complexity for a rare, second-order
case and is intentionally out of scope. This limitation is documented in the
module header.

## Report wiring: `generate-value-report.mjs`

- **Widen comment fetch.** `fetchProject()` GraphQL: `comments(first: 10)` →
  `comments(first: 100)`, keeping `{ nodes { body } }`. The timing log is a
  single in-place-edited comment created at first bind, so 100 covers real
  issues without pagination (round-trip count unchanged; response is larger). A
  code comment records this bound.
- **Capture timing-log body.** In `processItems`, capture the comment whose body
  includes `⏱ Timing Log` (same locator `parseStartInfo` uses) into a new item
  field `timingBody`. No new fetch.
- **Compute buckets.** After the existing in-scope `items` are built (the a2
  set), call
  `bucketRowsByDay(items.map(i => ({ number: i.number, body: i.timingBody })), { fromMs: cfg.fromDate?.getTime() ?? null, toMs: cfg.toDate?.getTime() ?? null })`.
- **Placement.** Render the chart inside the **Timeline Analysis** section,
  immediately after the "Backlog Engagement Timeline" table, under a new
  `<h3 class="tl-heading">Daily Work Activity</h3>` reusing `tl-*` styles.

## Rendering: `renderDailyChart(buckets)`

Returns an HTML string. Plot area `position:relative`, fixed height (~180px),
report slate palette, all inline styles/colors — print-safe, no external assets.

- **Duration series (bars, left axis — hours).** One flex column per day;
  bar `div` `height = durationSec / maxDurationSec × 100%`. Empty days →
  zero-height. Left Y-axis: 3–4 "nice" rounded hour ticks with faint gridline
  `div`s. Bars auto-thin via flex as day-count grows.
- **Issue-count series (line + dots, right axis — integer).** One inline
  `<svg>` absolutely positioned over the plot area (a real connecting polyline
  can't be done cleanly in CSS — the single place SVG earns its keep). Points
  computed at generation time: `x` = column center, `y` = `plotH − count/maxCount
× plotH`; a `<polyline>` through all days plus a `<circle>` per day. Right
  Y-axis: integer ticks `0..maxCount`.
- **X-axis (dates).** `MMM D` label under each column; when dense (> ~15 days)
  show every Nth label (`step = ceil(days / 15)`) so labels never collide; all
  bars still render.
- **Legend + tooltips.** Key line: duration swatch (left axis) + dot/line
  (right axis). Each column carries a `title` = `YYYY-MM-DD · Xh Ym · N issues`.
- **Degradation.** Empty `buckets` or `maxDurationSec === 0` → a
  `tl-note` "No timing-log activity in range" placeholder; no axes drawn.

## Testing

Unit tests for `bucketRowsByDay` (`scripts/reports/lib/daily-activity.test.mjs`),
each with a fixture timing-log body:

- Single-day window → whole payload on one day.
- Midnight-crossing window → prorated across two days in the correct ratio.
- Multi-midnight (> 24 h) window → split across every crossed boundary.
- Distinct issue count — an issue spanning N days counts once per day; two
  issues on the same day → count 2.
- Window clamp — `fromMs`/`toMs` drop out-of-range allocations; straddling
  window keeps only in-range days.
- Contiguous fill — an empty interior day appears as a zero bucket.
- Degenerate same-second rows → no divide-by-zero, whole payload placed.
- Legacy rows without a `row-sec` marker → `activeSec` from `activeMin × 60`,
  `idleSec = 0`.

`renderDailyChart` is covered indirectly (pure string assembly); a smoke test may
assert the empty-buckets placeholder path.

## Out of scope

- Pause-accurate midnight proration (documented simplification above).
- Sourcing the per-issue seed from anything other than the board `Session Time`
  field (Part 1 validation confirmed the field already equals the ledger sum).
- Comment pagination beyond `first: 100`.
- In-flight (never-closed) issues in the chart (excluded by the a2 decision).
