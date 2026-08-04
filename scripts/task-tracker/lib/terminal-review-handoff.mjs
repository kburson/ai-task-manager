import { parseTimingRow } from './timing-row-reader.mjs';

const TERMINAL_REVIEW_CLOSERS = new Set([
  'review:started',
  'review:failed',
  'review:approved',
  'issue:wrap',
  'issue:closed',
  'demoted:develop',
]);

export function isTerminalReviewHandoffOpen(body) {
  let open = false;
  for (const line of String(body ?? '').split('\n')) {
    const event = parseTimingRow(line)?.event;
    if (!event) continue;
    if (event === 'review:passed') {
      open = true;
    } else if (TERMINAL_REVIEW_CLOSERS.has(event)) {
      open = false;
    }
  }
  return open;
}

export function shouldSuppressTerminalSessionEvent(body, event) {
  if (!isTerminalReviewHandoffOpen(body)) return false;
  const normalized = String(event ?? '')
    .trim()
    .toLowerCase();
  return normalized === 'stop' || normalized === 'resumed' || normalized.startsWith('resume:');
}
