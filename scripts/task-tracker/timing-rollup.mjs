// Pure-function rollups over a parsed ⏱ Timing Log table.
//
// Used by scripts/gh/log-issue-time.mjs to compute board-field totals
// (engagedTime, sessionTime, reviewTime, planTime) from the timing comment of
// record.

import { pauseSpansBetween } from './lib/timing-rows.mjs';
import { parseEntryMarkers, STAGES } from './lib/stage-entry-markers.mjs';
import { PHASE_EVENTS } from './phase-events.mjs';

// Support both legacy minute-precision (HH:MM) and current second-precision
// (HH:MM:SS) timestamps.
const TS_PATTERN = /(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})(?::(\d{2}))? ([+-]\d{2}):(\d{2})/;
const ROW_SEC_RE = /<!--\s*row-sec:\s*a=(-?\d+)\s+i=(-?\d+)\s*-->/;

function parseTs(cell) {
  const m = TS_PATTERN.exec(cell.trim());
  if (!m) return null;
  const [, date, hh, mm, ss, offH, offM] = m;
  return Date.parse(`${date}T${hh}:${mm}:${ss ?? '00'}${offH}:${offM}`);
}

function parseNum(cell) {
  const s = cell.trim().replace(/,/g, '');
  if (s === '—' || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseTimingRows(body) {
  const lines = body.split('\n');
  const rows = [];
  let tsCol = -1;
  let eventCol = -1;
  let activeCol = -1;
  let wordMarkerCol = -1;

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1);
    if (cells.some((c) => c.trim() === 'Timestamp')) {
      tsCol = cells.findIndex((c) => c.trim() === 'Timestamp');
      eventCol = cells.findIndex((c) => c.trim() === 'Event');
      activeCol = cells.findIndex((c) => ['Active', 'Active Min'].includes(c.trim()));
      wordMarkerCol = cells.findIndex((c) => c.trim() === 'Word Marker');
      continue;
    }
    if (cells.every((c) => /^[-: ]+$/.test(c.trim()))) continue;
    if (tsCol === -1 || eventCol === -1) continue;
    const activeMin = parseNum(cells[activeCol] ?? '');
    // Trailing `<!-- row-sec: a=N i=N -->` carries second precision.
    // Legacy rows without the marker derive seconds from minutes.
    const secMatch = line.match(ROW_SEC_RE);
    const activeSec = secMatch ? Number(secMatch[1]) : activeMin != null ? activeMin * 60 : null;
    const idleSec = secMatch ? Number(secMatch[2]) : 0;
    rows.push({
      tsMs: parseTs(cells[tsCol] ?? ''),
      event: (cells[eventCol] ?? '').trim().toLowerCase(),
      activeMin,
      activeSec,
      idleSec,
      wordMarker: parseNum(cells[wordMarkerCol] ?? ''),
    });
  }
  return rows;
}

// #516 — the pause timing row was renamed `pause` → `paused` to match the
// uniform past-tense vocabulary. Accept BOTH spellings so pause-span detection
// stays correct for historical logs (`pause`) and new logs (`paused`). Events
// are lower-cased at parse time, so a literal compare is sufficient.
//
// #534 — non-switch pauses now carry a canonical reason slug (`pause:question`,
// `pause:break`, …). Treat any `pause:*` slug as a pause too so review-time
// pairing keeps working across the renamed vocabulary.
function isPauseEvent(event) {
  return event === 'pause' || event === 'paused' || event.startsWith('pause:');
}

// Sum (delta_min) for each pause row whose next non-pause row arrives within
// `thresholdMin` (inclusive). Pauses with no following row, or whose follower
// arrives after the threshold, contribute zero.
export function computeReviewMin(rows, thresholdMin) {
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    if (!isPauseEvent(rows[i].event)) continue;
    const pauseMs = rows[i].tsMs;
    if (pauseMs == null) continue;
    let next = null;
    for (let j = i + 1; j < rows.length; j++) {
      if (isPauseEvent(rows[j].event)) continue;
      next = rows[j];
      break;
    }
    if (!next || next.tsMs == null) continue;
    const deltaMin = Math.round((next.tsMs - pauseMs) / 60000);
    if (deltaMin <= thresholdMin && deltaMin >= 0) total += deltaMin;
  }
  return total;
}

// Subtract pause-marker spans from each row's window [prevRow.ts, row.ts].
// Returns a shallow-copied rows array with `activeSec` reduced and `idleSec`
// increased accordingly. The first row of each contiguous-ts sequence has
// no prior reference point and is left unchanged. Rows lacking a parseable
// timestamp are passed through.
export function applyPauseSpansToRows(rows, body) {
  if (!Array.isArray(rows) || rows.length === 0) return rows ?? [];
  if (!body || typeof body !== 'string') return rows;
  const out = [];
  let prevTsMs = null;
  for (const r of rows) {
    const copy = { ...r };
    if (r.tsMs != null && prevTsMs != null && r.tsMs > prevTsMs) {
      const pauseSecs = pauseSpansBetween(body, prevTsMs, r.tsMs);
      const pauseSec = pauseSecs.reduce((a, b) => a + b, 0);
      if (pauseSec > 0 && copy.activeSec != null) {
        const reduce = Math.min(pauseSec, copy.activeSec);
        copy.activeSec = copy.activeSec - reduce;
        copy.idleSec = (copy.idleSec || 0) + reduce;
        if (copy.activeMin != null) {
          copy.activeMin = Math.max(0, Math.round(copy.activeSec / 60));
        }
      }
    }
    if (r.tsMs != null) prevTsMs = r.tsMs;
    out.push(copy);
  }
  return out;
}

// Sum minutes spent in the Plan kanban column. A "plan window" opens on a
// `plan:started` row and closes on the next phase-boundary row (any lifecycle
// enter/complete event or a `demoted` marker — typically `plan:completed` for
// forward progress to Develop, or `demoted` on rollback to Refine). Plan
// windows with no closing boundary (issue still in Plan, or final row of the
// log) contribute zero.
//
// #692 — the previous implementation keyed on the retired `move:plan`
// vocabulary that #516 renamed away, so `planMin` was 0 for every post-#516
// log and the board "Plan Time" field never populated. It now reads the
// uniform `<state>:<event>` vocabulary from PHASE_EVENTS. Pause/resume and
// ad-hoc rows are NOT boundaries, so a mid-plan pause never truncates a window.
//
// Aggregates across multiple plan visits when re-entries occur, so the field
// is forward-compatible with #181's visit-aware schema once that lands.
const PLAN_OPEN_EVENT = PHASE_EVENTS.plan.enter.event; // 'plan:started'
const PHASE_BOUNDARY_EVENTS = new Set(
  Object.values(PHASE_EVENTS)
    .flatMap((stage) => Object.values(stage).map((kind) => kind.event))
    .concat('demoted')
);

export function computePlanMin(rows) {
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i].event || '') !== PLAN_OPEN_EVENT) continue;
    const planMs = rows[i].tsMs;
    if (planMs == null) continue;
    let next = null;
    for (let j = i + 1; j < rows.length; j++) {
      if (!PHASE_BOUNDARY_EVENTS.has(rows[j].event || '')) continue;
      next = rows[j];
      break;
    }
    if (!next || next.tsMs == null) continue;
    const deltaMin = Math.round((next.tsMs - planMs) / 60000);
    if (deltaMin > 0) total += deltaMin;
  }
  return total;
}

// #692 — idempotency state for the review→done close pair. A retried `close`
// (whose first attempt emitted `review:approved` + `issue:wrap` but aborted
// before the terminal `issue:closed` board move — e.g. `assertFieldsPersisted`
// threw) must not re-emit either half. Scan the current, not-yet-terminated
// close window (the rows AFTER the last `issue:closed`, i.e. the in-flight
// attempt) and report which halves are already present so the caller can skip
// them. A cleanly-closed-then-reopened issue starts a fresh window past its
// `issue:closed`, so a legitimate future close is unaffected.
export function pendingClosePairState(body) {
  const rows = parseTimingRows(String(body || ''));
  const closedEvent = PHASE_EVENTS.done.complete.event; // issue:closed
  const approvedEvent = PHASE_EVENTS.review.complete.event; // review:approved
  const wrapEvent = PHASE_EVENTS.done.enter.event; // issue:wrap
  let lastClosedIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].event === closedEvent) lastClosedIdx = i;
  }
  const windowRows = rows.slice(lastClosedIdx + 1);
  return {
    reviewApproved: windowRows.some((r) => r.event === approvedEvent),
    issueWrap: windowRows.some((r) => r.event === wrapEvent),
  };
}

// Compute per-stage durations from visit-numbered entry markers in the issue
// body. Each `aitm-entered-<stage>[-N]` marker opens a (stage, visit) window;
// the next marker in document order closes it. The trailing open window — the
// stage the issue is currently in — contributes zero (no closing marker yet).
//
// Returns:
//   {
//     visits: [{ stage, visit, startMs, endMs, durationMin }, ...],
//     perStageMin: { backlog: N, refine: N, plan: N, ... },
//     totalMin: N,
//   }
//
// Legacy single-visit issues (no `-N` suffix on markers) parse as visit=1 and
// produce the same shape as multi-visit issues.
export function computeStageDurations(body) {
  const tuples = parseEntryMarkers(body);
  const visits = [];
  const perStageMin = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (let i = 0; i < tuples.length; i++) {
    const { stage, visit, ts } = tuples[i];
    const startMs = Date.parse(ts);
    if (!Number.isFinite(startMs)) continue;
    const next = tuples[i + 1];
    const endMs = next ? Date.parse(next.ts) : null;
    if (endMs == null || !Number.isFinite(endMs) || endMs < startMs) {
      visits.push({ stage, visit, startMs, endMs: null, durationMin: 0 });
      continue;
    }
    const durationMin = Math.round((endMs - startMs) / 60000);
    visits.push({ stage, visit, startMs, endMs, durationMin });
    if (stage in perStageMin) perStageMin[stage] += durationMin;
  }
  const totalMin = Object.values(perStageMin).reduce((a, b) => a + b, 0);
  return { visits, perStageMin, totalMin };
}

const STAGE_ROLLUP_MARKER_RE = /<!--\s*aitm-stage-rollup:\s*(\{[\s\S]*?\})\s*-->/;

// Build the audit marker line that persists per-visit detail in the issue body.
// `schema: 1` lets future readers detect format upgrades without parsing every
// historical issue.
export function buildStageRollupMarker(rollup) {
  const payload = {
    schema: 1,
    perStage: rollup.perStageMin,
    totalMin: rollup.totalMin,
    visits: rollup.visits.map(({ stage, visit, durationMin }) => ({
      stage,
      visit,
      durationMin,
    })),
  };
  return `<!-- aitm-stage-rollup: ${JSON.stringify(payload)} -->`;
}

// Idempotent: replaces an existing marker in place, otherwise appends after the
// `aitm-fields` marker (or at end if absent).
export function upsertStageRollupMarker(body, rollup) {
  const src = String(body || '');
  const line = buildStageRollupMarker(rollup);
  if (STAGE_ROLLUP_MARKER_RE.test(src)) {
    return src.replace(STAGE_ROLLUP_MARKER_RE, line);
  }
  const fieldsRe = /<!--\s*aitm-fields:[\s\S]*?-->/;
  if (fieldsRe.test(src)) {
    return src.replace(fieldsRe, (m) => `${m}\n${line}`);
  }
  return src.endsWith('\n') ? `${src}${line}\n` : `${src}\n${line}\n`;
}

// Canonical seconds path (#243): `totalActiveSec`/`reviewSec`/`engagedSec` are
// the second-precision totals downstream consumers read. `totalActiveSec` sums
// each row's `activeSec`, which comes from the `row-sec` marker (true seconds);
// only legacy rows lacking that marker fall back to minutes×60 (see
// parseTimingRows). `reviewSec`/`planMin` are timestamp-delta derived at minute
// granularity — there is no finer source — and never use float hours.
export function rollupTotals(rows, thresholdMin) {
  let totalActiveMin = 0;
  let totalActiveSec = 0;
  // #475 AC2 — idle is now aggregated alongside active time. Each row carries
  // `idleSec` (from the `row-sec` marker or pause-span subtraction); the rollup
  // sums them so total idle surfaces in the summary instead of being dropped.
  let totalIdleSec = 0;
  // #475 AC1 — the cumulative Word Marker is monotonic non-decreasing. Take the
  // running max rather than the last value so a stray `0` audit row (legacy
  // logs predating the durable carry-forward) can never collapse the total.
  let lastWordMarker = null;
  for (const r of rows) {
    if (r.activeMin != null) totalActiveMin += r.activeMin;
    if (r.activeSec != null && Number.isFinite(r.activeSec)) totalActiveSec += r.activeSec;
    if (r.idleSec != null && Number.isFinite(r.idleSec)) totalIdleSec += r.idleSec;
    if (r.wordMarker != null) {
      lastWordMarker =
        lastWordMarker == null ? r.wordMarker : Math.max(lastWordMarker, r.wordMarker);
    }
  }
  const reviewMin = computeReviewMin(rows, thresholdMin);
  const reviewSec = reviewMin * 60;
  const engagedSec = totalActiveSec + reviewSec;
  const planMin = computePlanMin(rows);
  return {
    rowCount: rows.length,
    totalActiveMin,
    totalActiveSec,
    totalIdleSec,
    totalIdleMin: Math.round(totalIdleSec / 60),
    reviewMin,
    reviewSec,
    planMin,
    engagedMin: Math.round(engagedSec / 60),
    engagedSec,
    lastWordMarker,
  };
}
