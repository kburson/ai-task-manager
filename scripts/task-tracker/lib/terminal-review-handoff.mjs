import { isTableTimingTimestamp, parseTimingRow } from './timing-row-reader.mjs';
import { closesTerminalReviewHandoff } from './timing-events/index.mjs';

export function isTerminalReviewHandoffOpen(body) {
  let open = false;
  for (const line of String(body ?? '').split('\n')) {
    const event = parseTimingRow(line)?.event;
    if (!event) continue;
    if (event === 'review:passed') {
      open = true;
    } else if (closesTerminalReviewHandoff(event)) {
      open = false;
    }
  }
  return open;
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
