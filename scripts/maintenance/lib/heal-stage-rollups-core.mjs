// Pure heal logic for #694 — rebuild `aitm-stage-rollup` markers at schema:2
// from authoritative timing evidence. No gh/network access; the CLI shell
// (scripts/maintenance/heal-stage-rollups.mjs) handles enumeration and writes.
//
// Window sources, in priority order:
//   1. Visit-numbered `aitm-entered-<stage>[-N]` body markers via
//      computeStageDurations — ISO-ms timestamps, second precision.
//   2. ⏱ Timing Log ladder rows — PHASE_EVENTS boundary vocabulary
//      (`<stage>:started` / `<stage>:completed` … plus `demoted` and
//      `issue:closed`). Rows predating second-precision timestamps (HH:MM,
//      no seconds) yield visits flagged `precision:"minute"` with
//      `durationSec` derived as whole minutes × 60.

import { computeStageDurations } from '../../task-tracker/timing-rollup.mjs';
import { STAGES } from '../../task-tracker/lib/stage-entry-markers.mjs';
import { PHASE_EVENTS } from '../../task-tracker/phase-events.mjs';

const STAGE_ROLLUP_MARKER_RE = /<!--\s*aitm-stage-rollup:\s*(\{[\s\S]*?\})\s*-->/;

// Map every PHASE_EVENTS enter slug to its stage; all boundary slugs (enter or
// complete of any stage, plus `demoted`) close the currently-open window.
const ENTER_EVENT_TO_STAGE = new Map();
const BOUNDARY_EVENTS = new Set(['demoted']);
for (const [stage, kinds] of Object.entries(PHASE_EVENTS)) {
  if (kinds.enter) {
    ENTER_EVENT_TO_STAGE.set(kinds.enter.event, stage);
    BOUNDARY_EVENTS.add(kinds.enter.event);
  }
  if (kinds.complete) BOUNDARY_EVENTS.add(kinds.complete.event);
}

// Parse ⏱ Timing Log ladder rows preserving timestamp precision. Mirrors
// parseTimingRows' `|`-table walk but keeps `tsHasSeconds` (HH:MM:SS vs legacy
// HH:MM), which rebuildFromTimingLadder needs for the precision:"minute" flag
// and parseTimingRows discards.
const LADDER_TS_RE = /(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})(?::(\d{2}))? ([+-]\d{2}):(\d{2})/;

export function parseLadderRows(commentBody) {
  const rows = [];
  let tsCol = -1;
  let eventCol = -1;
  for (const line of String(commentBody || '').split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1);
    if (cells.some((c) => c.trim() === 'Timestamp')) {
      tsCol = cells.findIndex((c) => c.trim() === 'Timestamp');
      eventCol = cells.findIndex((c) => c.trim() === 'Event');
      continue;
    }
    if (cells.every((c) => /^[-: ]+$/.test(c.trim()))) continue;
    if (tsCol === -1 || eventCol === -1) continue;
    const m = LADDER_TS_RE.exec((cells[tsCol] ?? '').trim());
    let tsMs = null;
    let tsHasSeconds = false;
    if (m) {
      const [, date, hh, mm, ss, offH, offM] = m;
      tsMs = Date.parse(`${date}T${hh}:${mm}:${ss ?? '00'}${offH}:${offM}`);
      tsHasSeconds = ss != null;
    }
    rows.push({ tsMs, tsHasSeconds, event: (cells[eventCol] ?? '').trim().toLowerCase() });
  }
  return rows;
}

// Parse the existing marker payload, or null when absent/unparseable.
export function parseRollupMarker(body) {
  const m = STAGE_ROLLUP_MARKER_RE.exec(String(body || ''));
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

// Second-precision rebuild from entry markers. computeStageDurations is
// already schema-2 (#693); entry-marker timestamps carry milliseconds, so no
// precision flag is needed.
export function rebuildFromEntryMarkers(body) {
  const rollup = computeStageDurations(body);
  return rollup.visits.length ? rollup : null;
}

// Fallback rebuild from parsed timing-log rows (parseTimingRows shape:
// `{tsMs, event, tsHasSeconds}`). Walks rows in order; a PHASE_EVENTS enter
// slug opens a (stage, visit) window, the next boundary slug closes it.
// A window whose either endpoint lacks second resolution is minute-precision:
// durationSec is derived whole-minutes*60 and the visit carries
// precision:"minute".
export function rebuildFromTimingLadder(rows) {
  const visits = [];
  const perStageSec = Object.fromEntries(STAGES.map((s) => [s, 0]));
  const visitCounts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  let open = null; // { stage, visit, startMs, startHasSec }

  const closeWindow = (endMs, endHasSec) => {
    if (!open) return;
    const { stage, visit, startMs, startHasSec } = open;
    open = null;
    if (endMs == null || !Number.isFinite(endMs) || endMs < startMs) {
      visits.push({ stage, visit, startMs, endMs: null, durationSec: 0 });
      return;
    }
    // Minute-precision windows still round to whole minutes internally so the
    // derived seconds honestly reflect the source resolution (min * 60).
    const minutePrecision = !startHasSec || !endHasSec;
    const durationSec = minutePrecision
      ? Math.round((endMs - startMs) / 60000) * 60
      : Math.round((endMs - startMs) / 1000);
    const v = { stage, visit, startMs, endMs, durationSec };
    if (minutePrecision) v.precision = 'minute';
    visits.push(v);
    if (stage in perStageSec) perStageSec[stage] += durationSec;
  };

  for (const row of rows) {
    const event = String(row.event || '').toLowerCase();
    if (!BOUNDARY_EVENTS.has(event)) continue;
    if (row.tsMs == null || !Number.isFinite(row.tsMs)) continue;
    const hasSec = row.tsHasSeconds === true;
    closeWindow(row.tsMs, hasSec);
    const stage = ENTER_EVENT_TO_STAGE.get(event);
    if (stage) {
      visitCounts[stage] += 1;
      open = { stage, visit: visitCounts[stage], startMs: row.tsMs, startHasSec: hasSec };
    }
  }
  if (open) closeWindow(null, false);

  if (!visits.length) return null;
  const totalSec = Object.values(perStageSec).reduce((a, b) => a + b, 0);
  return { visits, perStageSec, totalSec };
}

// Schema:2 marker line with optional per-visit `precision` passthrough —
// same seconds-only payload shape as buildStageRollupMarker (#695) plus the
// honesty flag.
export function buildHealedMarker(rollup) {
  const payload = {
    schema: 2,
    perStageSec: rollup.perStageSec,
    totalSec: rollup.totalSec,
    visits: rollup.visits.map(({ stage, visit, durationSec, precision }) => {
      const v = { stage, visit, durationSec };
      if (precision) v.precision = precision;
      return v;
    }),
  };
  return `<!-- aitm-stage-rollup: ${JSON.stringify(payload)} -->`;
}

// Heal one issue body. `ladderRows` (parseTimingRows output) is consulted only
// when entry markers yield nothing. Returns `{next, changed, summary}`;
// `changed:false` means the recomputed marker already matches byte-for-byte
// (idempotent re-run) or there is nothing to heal.
export function healBody(body, ladderRows = []) {
  const src = String(body || '');
  const existing = parseRollupMarker(src);
  const rollup = rebuildFromEntryMarkers(src) ?? rebuildFromTimingLadder(ladderRows);
  if (!rollup) {
    return { next: src, changed: false, summary: existing ? 'unrebuildable' : 'no-evidence' };
  }
  const line = buildHealedMarker(rollup);
  let next;
  if (STAGE_ROLLUP_MARKER_RE.test(src)) {
    next = src.replace(STAGE_ROLLUP_MARKER_RE, line);
  } else {
    const fieldsRe = /<!--\s*aitm-fields:[\s\S]*?-->/;
    next = fieldsRe.test(src)
      ? src.replace(fieldsRe, (m) => `${m}\n${line}`)
      : src.endsWith('\n')
        ? `${src}${line}\n`
        : `${src}\n${line}\n`;
  }
  if (next === src) {
    return { next: src, changed: false, summary: 'already-healed' };
  }
  const fromSchema = existing?.schema ?? 'none';
  return {
    next,
    changed: true,
    summary: `schema:${fromSchema} -> schema:2 (${rollup.visits.length} visits, totalSec=${rollup.totalSec})`,
  };
}

// Parse the heal-stage-rollups CLI argv (#698). Pure so the contract is unit
// testable without executing the script's top-level side effects. Returns one
// of:
//   { help: true }                       — a help token is present
//   { error: 'unknown flag: <a>' }       — first unrecognized token
//   { mode, issue }                      — mode: 'verify'|'dry-run'|'write'
// Write mode requires an explicit `--apply` (alias `--write`); the zero-arg
// default is dry-run. `--verify` (scan only) wins over `--apply`.
export function parseHealArgs(argv = []) {
  if (argv.some((a) => ['help', '?', '--help', '-h'].includes(String(a)))) {
    return { help: true };
  }
  let apply = false;
  let verify = false;
  let issue = null;
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (a === '--apply' || a === '--write') apply = true;
    else if (a === '--dry-run') apply = false;
    else if (a === '--verify') verify = true;
    else if (a === '--issue') {
      const v = argv[i + 1];
      if (v == null || String(v).startsWith('--')) return { error: '--issue requires a number' };
      issue = String(v).replace('#', '');
      i++;
    } else return { error: `unknown flag: ${a}` };
  }
  return { mode: verify ? 'verify' : apply ? 'write' : 'dry-run', issue };
}
