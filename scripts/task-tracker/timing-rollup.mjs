// Pure-function rollups over a parsed ⏱ Timing Log table.
//
// Used by scripts/gh/log-issue-time.mjs to compute board-field totals
// (engagedTime, sessionTime, reviewTime, planTime) from the timing comment of
// record.

import { pauseSpansBetween } from './lib/timing-rows.mjs';
import { parseEntryMarkers, STAGES } from './lib/stage-entry-markers.mjs';

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

// Sum (delta_min) for each pause row whose next non-pause row arrives within
// `thresholdMin` (inclusive). Pauses with no following row, or whose follower
// arrives after the threshold, contribute zero.
export function computeReviewMin(rows, thresholdMin) {
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].event !== 'pause') continue;
    const pauseMs = rows[i].tsMs;
    if (pauseMs == null) continue;
    let next = null;
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].event === 'pause') continue;
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
// `move:plan` row and closes on the next state-transition row (any other
// `move:<state>` event — typically `move:develop` for forward progress or
// `move:refine` on rollback). Plan windows with no closing transition (issue
// still in Plan, or final row of the log) contribute zero.
//
// Aggregates across multiple plan visits when re-entries occur, so the field
// is forward-compatible with #181's visit-aware schema once that lands.
const MOVE_EVENT_RE = /^move:(.+)$/;

export function computePlanMin(rows) {
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    const m = MOVE_EVENT_RE.exec(rows[i].event || '');
    if (!m || m[1] !== 'plan') continue;
    const planMs = rows[i].tsMs;
    if (planMs == null) continue;
    let next = null;
    for (let j = i + 1; j < rows.length; j++) {
      const nm = MOVE_EVENT_RE.exec(rows[j].event || '');
      if (!nm) continue;
      next = rows[j];
      break;
    }
    if (!next || next.tsMs == null) continue;
    const deltaMin = Math.round((next.tsMs - planMs) / 60000);
    if (deltaMin > 0) total += deltaMin;
  }
  return total;
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

export function rollupTotals(rows, thresholdMin) {
  let totalActiveMin = 0;
  let totalActiveSec = 0;
  let lastWordMarker = null;
  for (const r of rows) {
    if (r.activeMin != null) totalActiveMin += r.activeMin;
    if (r.activeSec != null && Number.isFinite(r.activeSec)) totalActiveSec += r.activeSec;
    if (r.wordMarker != null) lastWordMarker = r.wordMarker;
  }
  const reviewMin = computeReviewMin(rows, thresholdMin);
  const reviewSec = reviewMin * 60;
  const engagedSec = totalActiveSec + reviewSec;
  const planMin = computePlanMin(rows);
  return {
    rowCount: rows.length,
    totalActiveMin,
    totalActiveSec,
    reviewMin,
    reviewSec,
    planMin,
    engagedMin: Math.round(engagedSec / 60),
    engagedSec,
    lastWordMarker,
  };
}
