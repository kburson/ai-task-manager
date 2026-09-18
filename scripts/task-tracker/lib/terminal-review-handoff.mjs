// @story #1629
import { isTableTimingTimestamp, parseTimingRow } from './timing-row-reader.mjs';
import { closesTerminalReviewHandoff } from './timing-events/index.mjs';

const WAIVER_DESCRIPTION_RE =
  /requirement ([a-z0-9._-]+); authority record ([A-Z0-9]+); result=waived/i;
const WAIVER_AUTHORITY_MARKER_RE =
  /<!--\s*aitm-review-waiver\s+requirement="([a-z0-9._-]+)"\s+record-id="([0-9A-HJKMNP-TV-Z]{26})"\s+revision="([1-9][0-9]*)"\s+accepted-sha="([0-9a-f]{40})"\s*-->/;

export function terminalReviewHandoffOutcome(body) {
  let outcome = null;
  for (const line of String(body ?? '').split('\n')) {
    const row = parseTimingRow(line);
    const event = row?.event;
    if (!event) continue;
    if (event === 'review:passed') {
      outcome = Object.freeze({ outcome: 'passed', evidence: null });
    } else if (event === 'review:waived') {
      const structured = WAIVER_AUTHORITY_MARKER_RE.exec(row.description);
      const legacy = structured ? null : WAIVER_DESCRIPTION_RE.exec(row.description);
      outcome = Object.freeze({
        outcome: 'waived',
        evidence: structured
          ? Object.freeze({
              requirementId: structured[1],
              authority: Object.freeze({
                recordId: structured[2],
                revision: Number(structured[3]),
              }),
              acceptedSha: structured[4],
            })
          : legacy
            ? Object.freeze({
                requirementId: legacy[1],
                authority: Object.freeze({ recordId: legacy[2] }),
              })
            : null,
      });
    } else if (closesTerminalReviewHandoff(event)) {
      outcome = null;
    }
  }
  return outcome;
}

export function isTerminalReviewHandoffOpen(body) {
  return terminalReviewHandoffOutcome(body) !== null;
}

export function hasTerminalTimingSeal(body) {
  return String(body ?? '')
    .split('\n')
    .some((line) => {
      const row = parseTimingRow(line);
      return row?.event === 'issue:closed' && isTableTimingTimestamp(row.ts);
    });
}

export function shouldSuppressTerminalSessionEvent(body, event) {
  if (!isTerminalReviewHandoffOpen(body)) return false;
  const normalized = String(event ?? '')
    .trim()
    .toLowerCase();
  return normalized === 'stop' || normalized === 'resumed' || normalized.startsWith('resume:');
}

export function shouldSuppressTimingAppend(body, event) {
  return hasTerminalTimingSeal(body) || shouldSuppressTerminalSessionEvent(body, event);
}
