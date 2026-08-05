// #1107 — pure repair for a Timing Log whose reengagement row has no preceding
// departure. The transform inserts exactly one zero-duration departure through
// buildBackdatedDepartureRow and refuses whenever the target is ambiguous.

import { buildBackdatedDepartureRow } from '../gh-timing-comment.mjs';
import {
  isDepartureEvent,
  isEmittableTimingEvent,
  isReengagementEvent,
} from './timing-events/index.mjs';
import {
  parseTimingRow,
  timingTimestampOffsetMin,
  timingTimestampToMs,
} from './timing-row-reader.mjs';

function timingRows(body) {
  const rows = [];
  for (const [lineIndex, line] of String(body ?? '')
    .split('\n')
    .entries()) {
    const parsed = parseTimingRow(line);
    if (!parsed || !Number.isFinite(timingTimestampToMs(parsed.ts))) continue;
    rows.push({ ...parsed, lineIndex, rowIndex: rows.length });
  }
  return rows;
}

export function findUnpairedReengagements(body) {
  const rows = timingRows(body);
  const candidates = [];
  for (const row of rows) {
    if (!isReengagementEvent(row.event)) continue;
    const previous = rows[row.rowIndex - 1] ?? null;
    if (previous && isDepartureEvent(previous.event)) continue;
    candidates.push({
      rowIndex: row.rowIndex,
      lineIndex: row.lineIndex,
      event: row.event,
      ts: row.ts,
      precedingEvent: previous?.event ?? null,
    });
  }
  return candidates;
}

export function repairMissingDeparture(
  body,
  { rowIndex, event = 'pause:other', description } = {}
) {
  if (typeof body !== 'string' || body.length === 0) {
    throw new Error('no Timing Log body supplied');
  }
  if (!isEmittableTimingEvent(event) || !isDepartureEvent(event)) {
    throw new Error(`repair event must be an emittable departure: ${String(event)}`);
  }

  const rows = timingRows(body);
  const candidates = findUnpairedReengagements(body);
  let target;

  if (rowIndex === undefined || rowIndex === null) {
    if (candidates.length === 0) throw new Error('no unpaired reengagement found');
    if (candidates.length > 1) {
      throw new Error(
        `ambiguous Timing Log: ${candidates.length} unpaired reengagements; specify rowIndex`
      );
    }
    [target] = candidates;
  } else {
    if (!Number.isInteger(rowIndex) || rowIndex < 0) {
      throw new Error(`rowIndex must be a non-negative integer: ${String(rowIndex)}`);
    }
    const selected = rows[rowIndex];
    if (!selected) throw new Error(`rowIndex ${rowIndex} does not identify a Timing Log row`);
    if (!isReengagementEvent(selected.event)) {
      throw new Error(`rowIndex ${rowIndex} is not a reengagement row (${selected.event})`);
    }
    const previous = rows[rowIndex - 1] ?? null;
    if (previous && isDepartureEvent(previous.event)) {
      throw new Error(`departure already present before reengagement rowIndex ${rowIndex}`);
    }
    target = {
      rowIndex,
      lineIndex: selected.lineIndex,
      event: selected.event,
      ts: selected.ts,
      precedingEvent: previous?.event ?? null,
    };
  }

  const previous = rows[target.rowIndex - 1];
  if (!previous) {
    throw new Error(`cannot repair rowIndex ${target.rowIndex}: no preceding Timing Log row`);
  }
  const reengagementMs = timingTimestampToMs(rows[target.rowIndex].ts);
  if (!Number.isFinite(reengagementMs)) {
    throw new Error(`cannot repair rowIndex ${target.rowIndex}: invalid reengagement timestamp`);
  }

  const insertedRow = buildBackdatedDepartureRow({
    ts: reengagementMs - 1000,
    event,
    description: description ?? `repaired missing departure before ${target.event}`,
    wordMarker: previous.wordMarker,
    offsetMin: timingTimestampOffsetMin(previous.ts) ?? undefined,
  });
  const lines = body.split('\n');
  lines.splice(target.lineIndex, 0, insertedRow);
  return lines.join('\n');
}
