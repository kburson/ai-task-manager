// Agent Review Gate — V3 timing-log-sequence validator (#812).
//
// Verifies the ⏱ Timing Log is BOTH format-correct AND a legal state-machine
// walk over its event rows. This is the validator that directly targets the
// skip/double-step corruption we repeatedly hand-fix: a step that got skipped
// (an interruption opened but never closed) or doubled (two `pause`s with no
// intervening `resume`, an orphan `resumed` against nothing open).
//
// Pure `validate`-family member: never mutates the body, returns
// `{ pass, failures }` where each failure is self-locating (1-based row index +
// `timestamp | event`). It consumes `context.comments` (locating the ⏱ Timing
// Log comment itself — there is no pre-parsed table in the context) and
// `context.markers.enteredStages` for the marker-reconciliation check.
//
// The event vocabulary and open/close taxonomy are NOT re-derived here: bare
// openers/closers come from `bind-event.mjs::classifyEvent`, the departure /
// reengagement predicates and the canonical phase-slug set come from
// `timing-event-map.mjs`, and timestamp parsing reuses `timing-rows.mjs`.

import { registry } from '../registry.mjs';
import { classifyEvent } from '../../bind-event.mjs';
import {
  isDepartureEvent,
  isReengagementEvent,
  isCanonicalPhaseSlug,
} from '../../timing-event-map.mjs';
import { _tsToMs } from '../../timing-rows.mjs';

const TIMING_LOG_RE = /⏱\s*Timing Log/;
// The timing table's header row: `| Timestamp | Event | ... |`.
const HEADER_RE = /^\|\s*Timestamp\s*\|\s*Event\b/i;
// A markdown table separator row: `|---|---|...|` (dashes, colons, pipes only).
const SEPARATOR_RE = /^\|[\s|:-]+\|?$/;
// Lifecycle stages reconciled against `aitm-entered-<stage>` markers. Non-stage
// qualified slugs (`issue:wrap`, `switch-out:#N`, `pause:reason`) are ignored.
const LIFECYCLE_STAGES = new Set([
  'backlog',
  'on-deck',
  'refine',
  'plan',
  'develop',
  'test',
  'review',
  'done',
]);

// Locate the ⏱ Timing Log comment body. Returns the body string or null.
export function findTimingLogBody(comments) {
  const list = Array.isArray(comments) ? comments : [];
  for (const c of list) {
    const b = c && typeof c.body === 'string' ? c.body : '';
    if (TIMING_LOG_RE.test(b)) return b;
  }
  return null;
}

// Extract the timing table's data rows from a comment body. Bounds the scan to
// the region between the `| Timestamp | Event | ...` header and the first
// non-table line, skipping the `|---|` separator. Returns
// `[{ index, ts, event, raw }]` with a 1-based `index`.
export function extractDataRows(logBody) {
  const lines = String(logBody || '').split('\n');
  let i = 0;
  while (i < lines.length && !HEADER_RE.test(lines[i].trim())) i++;
  if (i >= lines.length) return [];
  i++; // step past the header
  const rows = [];
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) break; // table ended
    if (SEPARATOR_RE.test(line)) continue;
    const cells = line.split('|').map((s) => s.trim());
    // cells[0] is the empty pre-pipe cell; cells[1] = Timestamp, cells[2] = Event.
    rows.push({
      index: rows.length + 1,
      ts: cells[1] ?? '',
      event: (cells[2] ?? '').toLowerCase(),
      raw: line,
    });
  }
  return rows;
}

// A row's event slug is well-formed when it is a qualified event (`stage:phase`,
// `pause:reason`, `switch-out:#N`), a recognized bare opener/closer, a canonical
// phase slug, or the neutral `end`. Anything else (`bound`, `foobar`) is
// malformed.
function isKnownSlug(slug) {
  if (!slug) return false;
  if (slug.includes(':')) return true;
  if (classifyEvent(slug)) return true;
  if (isCanonicalPhaseSlug(slug)) return true;
  if (slug === 'end') return true;
  return false;
}

function loc(row) {
  return `row ${row.index} (${row.ts} | ${row.event || '∅'})`;
}

export function validate(context = {}) {
  const comments = context.comments;
  const markers = context.markers || {};
  const enteredList = Array.isArray(markers.enteredStages) ? markers.enteredStages : [];
  const enteredSet = new Set(
    enteredList.map((e) => (e && e.stage ? String(e.stage).toLowerCase() : '')).filter(Boolean)
  );

  const failures = [];
  const logBody = findTimingLogBody(comments);
  if (logBody == null) {
    return { pass: false, failures: ['no ⏱ Timing Log comment found'] };
  }
  const rows = extractDataRows(logBody);
  if (rows.length === 0) {
    return { pass: false, failures: ['⏱ Timing Log has no data rows'] };
  }

  let prevMs = null;
  let prevRow = null;
  // State-machine slot: 'idle' (nothing active) or 'active'. Starts 'idle' — the
  // log opens when the agent first engages, so a leading reengagement/phase row
  // legally transitions idle→active.
  let state = 'idle';
  let openDeparture = null; // the departure row that opened the current idle span
  let lastActiveRow = null; // the row that last set 'active'

  for (const row of rows) {
    // --- Format schema -------------------------------------------------------
    const ms = _tsToMs(row.ts);
    if (!Number.isFinite(ms)) {
      failures.push(`${loc(row)}: malformed — unparseable timestamp`);
      continue; // cannot sequence-check a row with no clock
    }
    if (!row.event) {
      failures.push(`${loc(row)}: malformed — empty Event cell`);
      continue;
    }
    if (!isKnownSlug(row.event)) {
      failures.push(`${loc(row)}: malformed — unknown event slug "${row.event}"`);
      continue;
    }

    // --- Monotonicity --------------------------------------------------------
    if (prevMs != null && ms < prevMs) {
      failures.push(
        `${loc(row)}: out-of-order — timestamp precedes row ${prevRow.index} (${prevRow.ts})`
      );
    }
    prevMs = ms;
    prevRow = row;

    // --- Reconciliation vs aitm-entered markers ------------------------------
    const colon = row.event.indexOf(':');
    if (colon > 0) {
      const stage = row.event.slice(0, colon);
      if (LIFECYCLE_STAGES.has(stage) && !enteredSet.has(stage)) {
        failures.push(
          `${loc(row)}: timing row records stage "${stage}" but body has no aitm-entered-${stage} marker`
        );
      }
    }

    // --- State-machine walk (skip / double detection) ------------------------
    if (isDepartureEvent(row.event)) {
      if (state === 'idle') {
        if (openDeparture) {
          failures.push(
            `${loc(row)}: doubled step — departure opens a second interruption while ` +
              `row ${openDeparture.index} (${openDeparture.ts} | ${openDeparture.event}) is still open`
          );
        } else {
          failures.push(`${loc(row)}: skipped step — departure with no active work to interrupt`);
        }
      }
      state = 'idle';
      openDeparture = row;
    } else if (isReengagementEvent(row.event)) {
      if (state === 'active') {
        const activeAt = lastActiveRow
          ? `row ${lastActiveRow.index} (${lastActiveRow.ts} | ${lastActiveRow.event})`
          : 'session start';
        failures.push(
          `${loc(row)}: doubled step — reengagement with no open interruption (active since ${activeAt})`
        );
      }
      state = 'active';
      lastActiveRow = row;
      openDeparture = null;
    } else {
      // phase / neutral row: implies work is proceeding — closes any open idle
      // span and does not toggle-flag.
      state = 'active';
      lastActiveRow = row;
      openDeparture = null;
    }
  }

  // Trailing unclosed interruption: the log ends idle with an interruption that
  // was opened but never re-engaged — a skipped step.
  if (state === 'idle' && openDeparture) {
    failures.push(
      `row ${openDeparture.index} (${openDeparture.ts} | ${openDeparture.event}): ` +
        `skipped step — interruption opened but never closed (log ends idle)`
    );
  }

  return { pass: failures.length === 0, failures };
}

export const timingLogSequenceValidator = {
  id: 'timing-log-sequence',
  describe: () => 'V3: ⏱ Timing Log is format-correct and a legal state-machine walk',
  validate,
};

registry.register(timingLogSequenceValidator);

export default timingLogSequenceValidator;
