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
    // #1187 — a predecessor-less reengagement (the `start` row) can never be
    // repaired: repairMissingDeparture throws on it. Offering it as a candidate
    // only inflates the count into a spurious "ambiguous" refusal.
    if (!previous) continue;
    if (isDepartureEvent(previous.event)) continue;
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

// #1187 — resolve the timestamp the inserted departure is stamped with. Without
// an explicit `ts` the historical default stands (one second before the
// reengagement). A supplied `ts` must fall strictly between the preceding row
// and the reengagement; out-of-interval values are rejected, never clamped,
// because a clamped write looks like a repair and is not one.
function resolveDepartureMs({ ts, previousMs, reengagementMs, rowIndex }) {
  if (ts === undefined || ts === null) return reengagementMs - 1000;
  const departureMs = typeof ts === 'number' ? ts : timingTimestampToMs(ts);
  if (!Number.isFinite(departureMs)) {
    throw new Error(`departure timestamp is not readable: ${String(ts)}`);
  }
  if (!Number.isFinite(previousMs)) {
    throw new Error(
      `cannot place a departure at rowIndex ${rowIndex}: invalid preceding timestamp`
    );
  }
  if (departureMs <= previousMs || departureMs >= reengagementMs) {
    throw new Error(
      `departure timestamp ${new Date(departureMs).toISOString()} must fall strictly between ` +
        `${new Date(previousMs).toISOString()} and ${new Date(reengagementMs).toISOString()}`
    );
  }
  return departureMs;
}

export function repairMissingDeparture(
  body,
  { rowIndex, event = 'pause:other', description, ts } = {}
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

  const departureMs = resolveDepartureMs({
    ts,
    previousMs: timingTimestampToMs(previous.ts),
    reengagementMs,
    rowIndex: target.rowIndex,
  });

  const insertedRow = buildBackdatedDepartureRow({
    ts: departureMs,
    event,
    description: description ?? `repaired missing departure before ${target.event}`,
    wordMarker: previous.wordMarker,
    fullWordMarker: previous.fullWordMarker,
    offsetMin: timingTimestampOffsetMin(previous.ts) ?? undefined,
  });
  const lines = body.split('\n');
  lines.splice(target.lineIndex, 0, insertedRow);
  return lines.join('\n');
}
