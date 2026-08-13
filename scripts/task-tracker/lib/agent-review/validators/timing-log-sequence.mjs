// Agent Review Gate — V3 timing-log-sequence validator (#812, rewritten for the
// timing model v2 grammar under #828).
//
// Verifies the ⏱ Timing Log is BOTH format-correct AND a legal walk over its
// event rows. Four concerns, each self-locating:
//   1. Retired vocabulary — a bare `idle` / `active-work` data row is illegal
//      under v2 (idle spans are bracketed by an explicit departure/return pair).
//   2. Marker reconciliation — every `<stage>:started|completed` row must have a
//      matching `aitm-entered-<stage>` body marker (`<stage>:failed` audit rows
//      are exempt, per #829).
//   3. Kanban stage-transition walk — each entered stage must be one forward rung
//      up the canonical ladder or a sanctioned history edge from lifecycle
//      policy. A multi-rung
//      forward jump is a skipped stage; any other backward jump is a corruption.
//   4. Departure/return bracketing — the skip/double-step machine that catches an
//      interruption opened but never closed, or a return with nothing open.
//
// Pure `validate`-family member: never mutates the body, returns
// `{ pass, failures }`. It consumes `context.comments` (locating the ⏱ Timing
// Log comment itself — there is no pre-parsed table in the context) and
// `context.markers.enteredStages` for the marker-reconciliation check.
//
// Event vocabulary, parameterized grammar, retirement, interruption class, and
// stage association come from timing-events. The ordered stage ladder and legal
// stage walk come from lifecycle policy, and timestamp parsing reuses
// timing-rows.mjs.

import { registry } from '../registry.mjs';
import { SUSPICIOUS_GAP_SEC } from '../../bind-event.mjs';
import {
  EVENT_CLASS,
  classifyTimingEvent,
  isKnownTimingEvent,
  isRetiredTimingEvent,
  stageOfTimingEvent,
} from '../../timing-events/index.mjs';
import { parseMarker } from '../../marker-grammar.mjs';
import { parseRowSecMarker, _tsToMs } from '../../timing-rows.mjs';
import { parseTimingRow } from '../../timing-row-reader.mjs';
import { stateIds, isTimingHistoryEdge, normalizeStateId } from '../../lifecycle-policy/index.mjs';

const TIMING_LOG_RE = /⏱\s*Timing Log/;
// The timing table's header row: `| Timestamp | Event | ... |`.
const HEADER_RE = /^\|\s*Timestamp\s*\|\s*Event\b/i;
// A markdown table separator row: `|---|---|...|` (dashes, colons, pipes only).
const SEPARATOR_RE = /^\|[\s|:-]+\|?$/;
// Lifecycle stages reconciled against `aitm-entered-<stage>` markers, and the
// ordered kanban ladder the stage-transition walk indexes into. Sourced from
// lifecycle policy so history validation cannot drift from canonical identity.
// Non-stage qualified slugs (`issue:wrap`, `switch-out:#N`, `pause:reason`) are
// ignored by both passes.
const STAGES = stateIds();
const LIFECYCLE_STAGES = new Set(STAGES);
const LADDER_INDEX = new Map(STAGES.map((s, i) => [s, i]));

const SENTINEL_REVERT_DETAIL_RE =
  /^revert-to-sentinel: board "([^"]+)", recorded "[^"]+" → sentinel "([^"]+)"$/;
// Extract the kanban stage a row drives the walk to, or null if the row is not a
// stage-transition event. `<stage>:failed` rows are gate-audit records of a
// rejected attempt (not a real entry) and must not move the walk; qualified slugs
// whose prefix is not a ladder stage (`demoted:develop`, `issue:wrap`,
// `switch-out:#N`) and bare non-stage events (`resumed`, `pause`) return null.
// Exported for unit testing (#843): a `gate-refused` audit row must return null
// here so it neither advances nor rewinds the kanban reconciliation walk.
export function stageOf(event) {
  return stageOfTimingEvent(event);
}

function baseSlug(event) {
  const colon = event.indexOf(':');
  return colon > 0 ? event.slice(0, colon) : event;
}

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
    const row = parseTimingRow(line);
    rows.push({
      index: rows.length + 1,
      ts: row?.ts ?? '',
      event: row?.event ?? '',
      raw: line,
    });
  }
  return rows;
}

// Reconcile's `revert-to-sentinel` repair intentionally leaves the historical
// Timing Log untouched: its canonical `aitm-reverted` audit marker is the proof
// that the board/recorded state was reset. Convert only that exact, parseable
// marker shape into timestamped stage-walk resets. Timing Log rows preserve
// whole seconds, so audit timestamps are compared at that same precision; a
// sub-second ordering claim cannot be recovered from the table. Other
// `aitm-reverted` audit kinds, malformed details, and non-lifecycle
// source/target values are ignored.
export function extractSentinelStageResets(issueBody) {
  const resets = [];
  for (const line of String(issueBody || '').split('\n')) {
    const marker = parseMarker(line);
    if (!marker || marker.name !== 'reverted') continue;
    const detail = marker.props.detail || '';
    const match = detail.match(SENTINEL_REVERT_DETAIL_RE);
    const ms = _tsToMs(marker.props.ts);
    if (!match || !Number.isFinite(ms)) continue;
    const from = normalizeStateId(match[1]);
    const to = normalizeStateId(match[2]);
    if (!LADDER_INDEX.has(from) || !LADDER_INDEX.has(to)) continue;
    resets.push({ ms: Math.floor(ms / 1000) * 1000, from, to });
  }
  return resets.sort((a, b) => a.ms - b.ms);
}

// A row's event slug is well-formed when it is a qualified event (`stage:phase`,
// `pause:reason`, `switch-out:#N`), a recognized bare opener/closer, a canonical
// phase slug, or the neutral `end`. Anything else (`bound`, `foobar`) is
// malformed.
function isKnownSlug(slug) {
  return isKnownTimingEvent(slug);
}

function isDepartureEvent(slug) {
  return classifyTimingEvent(slug) === EVENT_CLASS.DEPARTURE;
}

function isReengagementEvent(slug) {
  return classifyTimingEvent(slug) === EVENT_CLASS.REENGAGEMENT;
}

function loc(row) {
  return `row ${row.index} (${row.ts} | ${row.event || '∅'})`;
}

function formatShortDuration(sec) {
  const total = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function forensicRemediation() {
  return 'inspect session logs or other durable evidence, identify the true stop/pause/resume boundary, then heal the timing rows and derived timing fields before approval';
}

export function validate(context = {}) {
  const comments = context.comments;
  const markers = context.markers || {};
  const enteredList = Array.isArray(markers.enteredStages) ? markers.enteredStages : [];
  const enteredSet = new Set(
    enteredList.map((e) => (e && e.stage ? normalizeStateId(e.stage) : '')).filter(Boolean)
  );
  const sentinelResets = extractSentinelStageResets(context.body);

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
  // Kanban stage-transition walk: the current stage, seeded from the first stage
  // row seen (so a log that legitimately starts mid-ladder never trips a phantom
  // forward-skip against a backlog it never recorded).
  let currentStage = null;
  let sentinelResetIndex = 0;

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
    // Retired v2 vocabulary — reject before any other check so the message names
    // the real problem (AC1).
    if (isRetiredTimingEvent(row.event)) {
      failures.push(
        `${loc(row)}: retired vocabulary — "${baseSlug(row.event)}" rows are not permitted under ` +
          `timing model v2 (idle spans are bracketed by an explicit departure/return pair)`
      );
      continue; // not a legal row; do not sequence-check it
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
    if (
      prevMs != null &&
      ms - prevMs > SUSPICIOUS_GAP_SEC * 1000 &&
      prevRow &&
      !isDepartureEvent(prevRow.event)
    ) {
      failures.push(
        `row ${prevRow.index}→${row.index}: suspicious wall-clock gap (${formatShortDuration(
          (ms - prevMs) / 1000
        )}) without a departure boundary — ${forensicRemediation()}`
      );
    }
    prevMs = ms;
    prevRow = row;

    const rowSec = parseRowSecMarker(row.raw);
    if (rowSec && rowSec.activeSec > SUSPICIOUS_GAP_SEC) {
      failures.push(
        `${loc(row)}: suspicious active duration (${formatShortDuration(
          rowSec.activeSec
        )}) — ${forensicRemediation()}`
      );
    }

    // --- Reconciliation vs aitm-entered markers ------------------------------
    const lifecycleStage = stageOf(row.event);
    if (lifecycleStage && LIFECYCLE_STAGES.has(lifecycleStage) && !enteredSet.has(lifecycleStage)) {
      failures.push(
        `${loc(row)}: timing row records stage "${lifecycleStage}" but body has no aitm-entered-${lifecycleStage} marker`
      );
    }

    // --- Kanban stage-transition walk ----------------------------------------
    // Every stage the log claims to enter must be reachable from the previous
    // stage by a single forward rung or a sanctioned reverse history edge.
    // Non-stage rows (departures, returns, `demoted:*`, `issue:*`, `<stage>:failed`)
    // do not move the walk.
    while (
      sentinelResetIndex < sentinelResets.length &&
      sentinelResets[sentinelResetIndex].ms <= ms
    ) {
      const reset = sentinelResets[sentinelResetIndex];
      if (currentStage === reset.from) currentStage = reset.to;
      sentinelResetIndex++;
    }
    const stage = stageOf(row.event);
    if (stage) {
      if (currentStage === null) {
        currentStage = stage; // seed on the first stage row; no edge to check yet
      } else if (stage !== currentStage) {
        const from = LADDER_INDEX.get(currentStage);
        const to = LADDER_INDEX.get(stage);
        if (isTimingHistoryEdge(currentStage, stage)) {
          // legal named history edge
        } else if (to > from) {
          failures.push(
            `${loc(row)}: illegal stage transition — forward skip ${currentStage}→${stage} ` +
              `(must advance exactly one stage)`
          );
        } else {
          failures.push(
            `${loc(row)}: illegal stage transition — reverse ${currentStage}→${stage} ` +
              `is not a sanctioned lifecycle history edge`
          );
        }
        currentStage = stage;
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
  describe: () =>
    'V3: ⏱ Timing Log is v2-grammar-correct — no retired idle/active-work rows, a legal ' +
    'kanban stage walk, and a balanced departure/return bracket',
  validate,
};

registry.register(timingLogSequenceValidator);

export default timingLogSequenceValidator;
