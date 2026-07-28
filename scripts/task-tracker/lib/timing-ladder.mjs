// #683 — the active/idle ladder: the spec that computes per-row and per-state
// Active/Idle from a sequence of timing-log rows, keyed off the event
// vocabulary in `lib/timing-events/`.
//
// THE RULE
//   A span is IDLE iff it was opened by a Departure event; every other event
//   opens an ACTIVE span. A row's span length is the wall-clock delta to the
//   NEXT row; the final (terminal) row has no successor and contributes 0/0.
//
// MULTI-EGRESS FRAGMENTATION (the #590 defect, AC6)
//   A single kanban state is entered ONCE (`<state>:started`) but its span can
//   be fragmented by interruptions before it completes:
//       refine:started → switch-out → resumed → pause → resumed → refine:completed
//   The ladder walks the ROW sequence, not the state, so a state's Active/Idle
//   is the SUM over all its sub-spans. `currentState` only advances on a
//   canonical `<state>:started` (enter) row, so Departure/Re-engagement rows in
//   the middle stay attributed to the state they interrupted.
//
// This module is pure: it reads rows and returns numbers. It does NOT write to
// the log. The emitters (`resume.mjs`, `deriveStateMoveDelta`, `close.mjs`) are
// the follow-on repair surface that will be re-pointed at this ladder.

import {
  classifyTimingEventForAccounting as classifyTimingEvent,
  EVENT_CLASS,
} from './timing-events/index.mjs';
import { PHASE_EVENTS } from '../phase-events.mjs';

// slug (`refine:started`) → state (`refine`) for canonical ENTER events only.
// Built from the frozen table so it can never drift from the emitters.
const ENTER_SLUG_TO_STATE = Object.freeze(
  Object.fromEntries(
    Object.entries(PHASE_EVENTS)
      .filter(([, kinds]) => kinds.enter)
      .map(([state, kinds]) => [kinds.enter.event, state])
  )
);

const ROW_RE = /^\|/;
const ROW_TS_RE = /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;

// Normalize a timing-log timestamp (`2026-06-30 08:42:27 -05:00`) to an epoch
// millisecond value. Accepts both the space-and-offset log form and plain ISO.
// Returns NaN on an unparseable cell.
export function parseRowTs(ts) {
  if (ts == null) return NaN;
  let s = String(ts).trim();
  // `YYYY-MM-DD HH:MM:SS -05:00` → `YYYY-MM-DDTHH:MM:SS-05:00`
  s = s.replace(/^(\d{4}-\d{2}-\d{2})[ T]/, '$1T').replace(/\s+([+-]\d{2}:?\d{2}|Z)$/, '$1');
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : NaN;
}

// Extract `{ ts, event }` rows from a raw ⏱ Timing Log comment body. Skips the
// header and separator rows; keeps only rows whose first cell is a timestamp.
export function parseTimingRows(body) {
  const out = [];
  for (const line of String(body || '').split('\n')) {
    if (!ROW_RE.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim());
    // cells[0] is '' (leading pipe); cells[1] timestamp; cells[2] event.
    if (!ROW_TS_RE.test(cells[1] || '')) continue;
    out.push({ ts: cells[1], event: (cells[2] || '').toLowerCase() });
  }
  return out;
}

// Core ladder. `rows` is an ordered array of `{ ts, event }`. Returns:
//   {
//     rows:   [{ ts, event, class, activeSec, idleSec, state }],  // per-row
//     states: { <state>: { activeSec, idleSec } },                // aggregated
//     prelude:{ activeSec, idleSec },                             // pre-first-enter
//     totals: { activeSec, idleSec },
//   }
// `deltaFloor` controls sub-second rounding (default: round to nearest second).
export function deriveLadder(rows, { round = Math.round } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const outRows = [];
  const states = {};
  const prelude = { activeSec: 0, idleSec: 0 };
  const totals = { activeSec: 0, idleSec: 0 };
  let currentState = null;

  for (let i = 0; i < list.length; i++) {
    const { ts, event } = list[i];
    // An ENTER row advances the current state BEFORE it is attributed, so the
    // `<state>:started` row itself belongs to the state it opens.
    if (Object.prototype.hasOwnProperty.call(ENTER_SLUG_TO_STATE, event)) {
      currentState = ENTER_SLUG_TO_STATE[event];
    }

    const cls = classifyTimingEvent(event);
    const nextTs = i + 1 < list.length ? parseRowTs(list[i + 1].ts) : null;
    const thisTs = parseRowTs(ts);
    let spanSec = 0;
    if (nextTs != null && Number.isFinite(nextTs) && Number.isFinite(thisTs)) {
      spanSec = Math.max(0, round((nextTs - thisTs) / 1000));
    }
    const isIdle = cls === EVENT_CLASS.DEPARTURE;
    const activeSec = isIdle ? 0 : spanSec;
    const idleSec = isIdle ? spanSec : 0;

    const bucket =
      currentState == null
        ? prelude
        : (states[currentState] ||= {
            activeSec: 0,
            idleSec: 0,
          });
    bucket.activeSec += activeSec;
    bucket.idleSec += idleSec;
    totals.activeSec += activeSec;
    totals.idleSec += idleSec;

    outRows.push({ ts, event, class: cls, activeSec, idleSec, state: currentState });
  }

  return { rows: outRows, states, prelude, totals };
}
