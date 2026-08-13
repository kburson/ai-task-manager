// #1249 — pure, authority-preserving proposal for one retroactive AFK bracket.
// The transform never writes. It accepts only an interval that belongs to one
// unambiguous lifecycle visit and whose timing-v2 accounting changes by exactly
// that interval.

import { fmtTs } from '../gh-timing-comment.mjs';
import { recomputeCompletedRows } from './heal-timing-log.mjs';
import {
  isDepartureEvent,
  isReengagementEvent,
  describeTimingEvent,
} from './timing-events/index.mjs';
import {
  isTableTimingTimestamp,
  parseTimingRow,
  timingTimestampOffsetMin,
  timingTimestampToMs,
} from './timing-row-reader.mjs';
import { computeActiveByPhaseSpans, parseRowSecMarker } from './timing-rows.mjs';

export class TimingIntervalRepairError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimingIntervalRepairError';
    this.code = 'TIMING_INTERVAL_REPAIR_REFUSED';
  }
}

function refuse(message) {
  throw new TimingIntervalRepairError(message);
}

function readEndpoint(label, value) {
  const ms = timingTimestampToMs(value);
  if (!Number.isFinite(ms)) refuse(`${label} timestamp is not readable: ${String(value)}`);
  return ms;
}

function readRows(body) {
  if (typeof body !== 'string' || body.length === 0) refuse('no Timing Log body supplied');
  const rows = [];
  const lines = body.split('\n');
  for (const [lineIndex, line] of lines.entries()) {
    const parsed = parseTimingRow(line);
    if (!parsed) continue;
    if (parsed.ts === 'Timestamp' && parsed.event === 'event') continue;
    if (!isTableTimingTimestamp(parsed.ts)) {
      refuse(`malformed timing row at line ${lineIndex + 1}: unreadable timestamp`);
    }
    const ms = timingTimestampToMs(parsed.ts);
    if (!Number.isFinite(ms)) {
      refuse(`malformed timing row at line ${lineIndex + 1}: unreadable timestamp`);
    }
    if (!describeTimingEvent(parsed.event)) {
      refuse(`malformed timing row at line ${lineIndex + 1}: unknown event ${parsed.event}`);
    }
    const previous = rows.at(-1);
    if (previous && ms < previous.ms) {
      refuse(`Timing Log is not chronological at line ${lineIndex + 1}`);
    }
    rows.push({ ...parsed, lineIndex, rowIndex: rows.length, ms });
  }
  if (rows.length === 0) refuse('Timing Log contains no readable rows');
  return { lines, rows };
}

function isVisitBoundary(row) {
  const descriptor = describeTimingEvent(row.event);
  return (
    row.event === 'demoted' ||
    row.event.startsWith('demoted:') ||
    (descriptor?.kind === 'lifecycle' && ['enter', 'complete'].includes(descriptor.phase))
  );
}

function lifecycleVisits(rows) {
  const visits = [];
  for (let index = 0; index < rows.length; index++) {
    const descriptor = describeTimingEvent(rows[index].event);
    if (descriptor?.kind !== 'lifecycle' || descriptor.phase !== 'enter' || !descriptor.stage) {
      continue;
    }
    let boundary = null;
    for (let next = index + 1; next < rows.length; next++) {
      if (isVisitBoundary(rows[next])) {
        boundary = rows[next];
        break;
      }
    }
    visits.push({
      phaseEvent: rows[index].event,
      stage: descriptor.stage,
      start: rows[index],
      boundary,
    });
  }
  return visits;
}

function resolveVisit(rows, startMs, endMs) {
  const matches = lifecycleVisits(rows).filter(
    (visit) =>
      startMs > visit.start.ms &&
      endMs > visit.start.ms &&
      (visit.boundary == null || (startMs < visit.boundary.ms && endMs < visit.boundary.ms))
  );
  if (matches.length !== 1) {
    refuse('repair endpoints must fall strictly within the same lifecycle phase visit');
  }
  const [visit] = matches;
  const boundaryDescriptor = visit.boundary ? describeTimingEvent(visit.boundary.event) : null;
  if (boundaryDescriptor?.kind === 'lifecycle' && boundaryDescriptor.phase === 'complete') {
    const cache = parseRowSecMarker(visit.boundary.raw);
    if (!cache || cache.activeSec + cache.idleSec <= 0) {
      refuse('completed row has no authoritative duration cache to reconcile');
    }
  }
  return visit;
}

function exactPairState(rows, startMs, endMs) {
  const starts = rows.filter((row) => row.ms === startMs);
  const ends = rows.filter((row) => row.ms === endMs);
  const exactStart = starts.length === 1 && starts[0].event === 'pause:retroactive';
  const exactEnd = ends.length === 1 && ends[0].event === 'resumed';
  if (exactStart && exactEnd) return 'complete';
  if (starts.length > 0 || ends.length > 0) return 'partial';
  return 'absent';
}

function interruptionSpans(rows) {
  const spans = [];
  let open = null;
  for (const row of rows) {
    if (isDepartureEvent(row.event)) {
      if (open) refuse(`unpaired interruption before ${row.ts}`);
      open = row;
      continue;
    }
    if (!isReengagementEvent(row.event)) continue;
    if (!open) {
      if (row.event !== 'start') refuse(`unpaired reengagement at ${row.ts}`);
      continue;
    }
    spans.push({ startMs: open.ms, endMs: row.ms });
    open = null;
  }
  if (open) refuse(`unpaired interruption at ${open.ts}`);
  return spans;
}

function assertClearInterval(rows, startMs, endMs) {
  for (const span of interruptionSpans(rows)) {
    if (startMs < span.endMs && endMs > span.startMs) {
      refuse('repair interval overlaps an existing interruption bracket');
    }
  }
  const inside = rows.find((row) => row.ms >= startMs && row.ms <= endMs);
  if (inside) refuse(`timing row ${inside.event} already exists inside the repair interval`);
}

function assertExactPairIsCanonical(rows, startMs, endMs) {
  const within = rows.filter((row) => row.ms >= startMs && row.ms <= endMs);
  if (
    within.length !== 2 ||
    within[0].ms !== startMs ||
    within[0].event !== 'pause:retroactive' ||
    within[1].ms !== endMs ||
    within[1].event !== 'resumed'
  ) {
    refuse('conflicting timing row exists inside the retroactive pair');
  }
  const exactSpans = interruptionSpans(rows).filter(
    (span) => span.startMs === startMs && span.endMs === endMs
  );
  if (exactSpans.length !== 1) refuse('conflicting interruption evidence for retroactive pair');
}

function markerCell(value) {
  const normalized = String(value ?? '').trim();
  return normalized || '—';
}

function repairRow({ ts, event, description, preceding }) {
  const offsetMin = timingTimestampOffsetMin(preceding.ts);
  return (
    `| ${fmtTs(ts, { offsetMin: offsetMin ?? undefined })} | ${event} |  |  |  | ` +
    `${markerCell(preceding.wordMarker)} | ${description} | ` +
    `${markerCell(preceding.fullWordMarker)} | <!-- row-sec: a=0 i=0 -->`
  );
}

function insertPair({ body, lines, rows, startMs, endMs }) {
  const preceding = [...rows].reverse().find((row) => row.ms < startMs);
  if (!preceding) refuse('repair interval has no preceding Timing Log row');
  const next = rows.find((row) => row.ms > endMs);
  const insertAt = next ? next.lineIndex : rows.at(-1).lineIndex + 1;
  const departureRow = repairRow({
    ts: startMs,
    event: 'pause:retroactive',
    description: 'retroactive AFK started',
    preceding,
  });
  const returnRow = repairRow({
    ts: endMs,
    event: 'resumed',
    description: 'retroactive AFK ended',
    preceding,
  });
  const nextLines = [...lines];
  nextLines.splice(insertAt, 0, departureRow, returnRow);
  const joined = nextLines.join('\n');
  return recomputeCompletedRows(
    body.endsWith('\n') && !joined.endsWith('\n') ? `${joined}\n` : joined
  );
}

function phaseTotals(totals, phaseEvent) {
  return (
    totals.perPhase.find((phase) => phase.event === phaseEvent) ?? {
      event: phaseEvent,
      activeSec: 0,
      idleSec: 0,
    }
  );
}

function assertAccounting({ before, after, phaseEvent, intervalSec }) {
  const beforePhase = phaseTotals(before, phaseEvent);
  const afterPhase = phaseTotals(after, phaseEvent);
  const totalBefore = before.totalActiveSec + before.totalIdleSec;
  const totalAfter = after.totalActiveSec + after.totalIdleSec;
  if (
    before.totalActiveSec - after.totalActiveSec !== intervalSec ||
    after.totalIdleSec - before.totalIdleSec !== intervalSec ||
    beforePhase.activeSec - afterPhase.activeSec !== intervalSec ||
    afterPhase.idleSec - beforePhase.idleSec !== intervalSec ||
    totalBefore !== totalAfter
  ) {
    refuse('proposed repair does not improve authoritative accounting by the exact interval');
  }
}

export function proposeTimingIntervalRepair(body, { start, end } = {}) {
  const startMs = readEndpoint('start', start);
  const endMs = readEndpoint('end', end);
  if (endMs <= startMs) refuse('end timestamp must be after start timestamp');
  const intervalSec = Math.floor((endMs - startMs) / 1000);
  if (intervalSec <= 0) refuse('repair interval must contain at least one whole second');

  const { lines, rows } = readRows(body);
  const visit = resolveVisit(rows, startMs, endMs);
  const accountingNowMs = Math.max(endMs, ...rows.map((row) => row.ms));
  const before = computeActiveByPhaseSpans(body, accountingNowMs);
  const pairState = exactPairState(rows, startMs, endMs);
  if (pairState === 'complete') {
    assertExactPairIsCanonical(rows, startMs, endMs);
    return {
      status: 'already-applied',
      body,
      phaseEvent: visit.phaseEvent,
      intervalSec,
      before,
      after: before,
    };
  }
  if (pairState === 'partial') refuse('partial or conflicting retroactive pair already exists');
  assertClearInterval(rows, startMs, endMs);

  const nextBody = insertPair({ body, lines, rows, startMs, endMs });
  const after = computeActiveByPhaseSpans(nextBody, accountingNowMs);
  assertAccounting({ before, after, phaseEvent: visit.phaseEvent, intervalSec });
  return {
    status: 'repair',
    body: nextBody,
    phaseEvent: visit.phaseEvent,
    intervalSec,
    before,
    after,
  };
}
