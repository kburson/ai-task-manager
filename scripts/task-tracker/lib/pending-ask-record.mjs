// @story #1857
// Shared validation for live question recovery and byte-preserving migration.
import { timingActorKey } from './timing-actor.mjs';
import { parseTimingRow, timingTimestampToMs } from './timing-row-reader.mjs';

export function validatePendingAskMarker(marker, identity) {
  try {
    if (
      !marker ||
      typeof marker !== 'object' ||
      Array.isArray(marker) ||
      marker.sessionId !== identity.sid ||
      typeof marker.issue !== 'string' ||
      typeof marker.pausedAt !== 'string' ||
      marker.schema !== 'aitm.pending-ask/v1' ||
      Object.keys(marker).sort().join(',') !==
        ['schema', 'actor', 'sessionId', 'issue', 'pausedAt', 'resumeRow'].sort().join(',') ||
      marker.actor !== timingActorKey(identity) ||
      !new RegExp('^#[1-9][0-9]*$').test(marker.issue) ||
      !Number.isFinite(Date.parse(marker.pausedAt)) ||
      (marker.resumeRow !== null &&
        (typeof marker.resumeRow !== 'string' ||
          parseTimingRow(marker.resumeRow)?.actorKey !== marker.actor))
    )
      throw new Error('invalid marker');
    if (marker.resumeRow !== null) {
      const row = parseTimingRow(marker.resumeRow);
      const interval = row.engagement;
      const timestamp = timingTimestampToMs(row.ts);
      if (
        row.event !== 'resume' ||
        !interval ||
        interval.startMs !== interval.endMs ||
        interval.startMs < Date.parse(marker.pausedAt) ||
        !Number.isFinite(timestamp) ||
        Math.floor(interval.endMs / 1000) !== Math.floor(timestamp / 1000) ||
        interval.activeEstimateSec !== null ||
        [interval.wordStart, interval.wordEnd, interval.fullWordStart, interval.fullWordEnd].some(
          (value) => value !== null
        ) ||
        row.cells[3] !== 'Unknown' ||
        row.cells[4] !== 'Unknown'
      )
        throw new Error('invalid resume');
    }
    return marker;
  } catch {
    throw new Error('ASK_MARKER_INVALID');
  }
}
