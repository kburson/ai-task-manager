// EPIC #823 timing model v2 (C4) — historical timing-log heal.
//
// A pure, idempotent, re-runnable transform that upgrades a v1 ⏱ Timing Log to
// the v2 grammar. Three operations, in order:
//
//   1. STRIP every retired `idle` and `active-work` row.
//   2. RECOMPUTE each `<phase>:completed` row's active/idle from its phase span
//      minus the pause/switch-out→resume brackets inside it — via the SAME
//      `computePhaseCloseDelta` calculator the C2 writer uses. Idle is never a
//      stored row; it is exactly the bracket delta.
//   3. FOLD the stripped rows' `Δ Words` into the enclosing `:completed` row's
//      `Δ Words` (lossless), so no word-count signal is lost with the row.
//
// The transform is a pure STRING surgery on the raw markdown. It deliberately
// does NOT reconstruct rows through `buildRow`: that builder enforces a
// retroactive-timestamp guard (rows must be stamped within 60s of now), which a
// historical heal by definition violates. Completed rows are re-rendered by
// targeted cell replacement — only the Active, Idle, Δ Words cells and the
// trailing `<!-- row-sec -->` marker change; the timestamp, event, word-marker,
// and description cells are preserved byte-for-byte. Non-completed rows
// (`:started`, `pause`, `switch-out`, `resumed`) pass through verbatim.
//
// Idempotence: a healed log has no strip rows (fold is 0) and its completed
// rows already equal the recompute, so re-running is byte-identical. Healing a
// native v2 log is likewise a no-op.

import {
  computePhaseCloseDelta,
  formatDurationSeconds,
  formatRowSecMarker,
} from './timing-rows.mjs';
import { PHASE_EVENTS } from '../phase-events.mjs';

// Retired v1 slugs that C1 stopped emitting. `classifyTimingEvent` treats them
// as neutral PHASE (active), so removing them leaves every phase span's
// active/idle split invariant — the recompute in step 2 is unaffected by the
// strip in step 1, so the two operations are order-independent.
const RETIRED_SLUGS = new Set(['idle', 'active-work']);

// [#996] f3a09cc — reject.mjs used to post its self-audit row with the bare,
// unqualified slug 'develop', which timing-log-sequence's isKnownSlug()
// rejects (a colon-less slug must be a recognized phase/opener/closer). The
// code now emits 'rejected:develop' (mirrors demote.mjs's demoted:<state>
// convention). Historical rows written before that fix are requalified here
// in place — same transform as f3a09cc, applied retroactively. Scoped to the
// exact bare-'develop' + 'review rejected:' description shape so a real
// develop:started/:completed row is never touched.
const BARE_REJECT_DEVELOP_DESC_RE = /^\s*review rejected:/i;

// EPIC #823 timing model v2 (C6): the two pre-v2 review scaffolding rows the
// `review` verb used to emit — `review` ("starting review") and `review-ready`
// ("task is now in Review"). Neither is part of the canonical PHASE_EVENTS pair
// (`test:passed` + `review:started` come from move-state). C6 stops emitting
// them on the WRITE side; here on the READ/heal side they are stripped from
// historical logs and their `Δ Words` folded forward onto the enclosing
// completion row exactly like the retired slugs. Kept separate from
// RETIRED_SLUGS so the "retired vocabulary" intent (idle/active-work) stays
// distinct from the "cruft review rows" intent in the classifier docs.
const REVIEW_CRUFT_SLUGS = new Set(['review', 'review-ready']);

// Every slug pass-1 strips-and-folds: retired interruption rows plus the C6
// review cruft rows. Both fold their words forward onto the next `:completed`.
const STRIP_SLUGS = new Set([...RETIRED_SLUGS, ...REVIEW_CRUFT_SLUGS]);

// Timing-log timestamp pattern — mirrors TS_LINE_RE in timing-rows.mjs.
const TS_LINE_RE = /\|\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s+[+-]\d{2}:\d{2})\s*\|/;
// Trailing `<!-- row-sec: a=N i=N -->` marker (with its leading whitespace).
const TRAILING_ROW_SEC_RE = /(\s*<!--\s*row-sec:\s*a=-?\d+\s+i=-?\d+\s*-->)\s*$/;

// Completion slug → kanban state, derived from the canonical PHASE_EVENTS table
// (e.g. `develop:completed` → `develop`, `review:approved` → `review`,
// `issue:closed` → `done`). `computePhaseCloseDelta` keys off the STATE name.
const COMPLETE_SLUG_TO_STATE = (() => {
  const m = new Map();
  for (const [state, entry] of Object.entries(PHASE_EVENTS)) {
    if (entry.complete?.event) m.set(entry.complete.event, state);
  }
  return m;
})();

// Local replica of gh-timing-comment.mjs#fmtNumBlankZero (not exported there):
// null → `—`, 0 → '' (blank cell), else en-US grouped number. Used to render
// the Δ Words cell exactly as buildRow would.
function fmtNumBlankZero(n) {
  if (n == null) return '—';
  return Number(n) === 0 ? '' : Number(n).toLocaleString('en-US');
}

// Parse a Δ Words cell string ("1,234" / "" / "—") back to a number; blank or
// unparseable → 0.
function parseWordsCell(cell) {
  const v = Number(
    String(cell ?? '')
      .replace(/,/g, '')
      .trim()
  );
  return Number.isFinite(v) ? v : 0;
}

// Split a timing row into { core, marker } where `core` is the pipe-delimited
// table portion (ending in `|`) and `marker` is the trailing row-sec comment
// (including its leading space), or '' when absent.
function splitRowMarker(line) {
  const m = line.match(TRAILING_ROW_SEC_RE);
  if (!m) return { core: line, marker: '' };
  return { core: line.slice(0, m.index), marker: m[1] };
}

// The lowercased, trimmed event slug of a timing row (cells[2]).
function eventOf(line) {
  const { core } = splitRowMarker(line);
  const cells = core.split('|');
  return (cells[2] ?? '').trim().toLowerCase();
}

// True when `line` is a pre-f3a09cc bare-'develop' reject self-audit row: the
// event cell is exactly 'develop' (not 'develop:started'/':completed', which
// have their own distinct slugs) and the description starts with "review
// rejected:" — the literal template reject.mjs has always used.
function isBareRejectDevelopRow(line) {
  if (eventOf(line) !== 'develop') return false;
  const { core } = splitRowMarker(line);
  const desc = core.split('|')[7] ?? '';
  return BARE_REJECT_DEVELOP_DESC_RE.test(desc);
}

// Rewrite ONLY the event cell (cells[2]) of a bare-reject-develop row to
// 'rejected:develop', preserving every other cell — including the trailing
// row-sec marker — byte-for-byte.
function requalifyRejectDevelopRow(line) {
  const { core, marker } = splitRowMarker(line);
  const parts = core.split('|');
  parts[2] = ' rejected:develop ';
  return parts.join('|') + marker;
}

// Re-render a `:completed` row with recomputed active/idle/Δwords, preserving
// every other cell byte-for-byte. `activeSec`/`idleSec` restamp the visible
// duration cells AND the canonical row-sec marker; `deltaWords` restamps the Δ
// Words cell. Empty cells collapse to the two-space form buildRow emits.
function renderCompletedRow(line, { activeSec, idleSec, deltaWords }) {
  const { core } = splitRowMarker(line);
  const parts = core.split('|');
  // parts: ['', ts, event, active, idle, dwords, marker, desc, (dfull,) '']
  const aSec = Math.max(0, Math.floor(Number(activeSec) || 0));
  const iSec = Math.max(0, Math.floor(Number(idleSec) || 0));
  parts[3] = ` ${aSec === 0 ? '' : formatDurationSeconds(aSec)} `;
  parts[4] = ` ${iSec === 0 ? '' : formatDurationSeconds(iSec)} `;
  parts[5] = ` ${fmtNumBlankZero(deltaWords)} `;
  return parts.join('|') + ' ' + formatRowSecMarker({ activeSec: aSec, idleSec: iSec });
}

// Pure transform. Returns the healed body string; input is never mutated.
// Non-string input is returned unchanged.
export function healTimingLog(body) {
  if (!body || typeof body !== 'string') return body;

  const lines = body.split('\n');

  // Pass 1 — walk in document order over the ORIGINAL lines, dropping strip
  // rows and accumulating their Δ Words into the next completion row (fold).
  // `pendingWords` carries stripped word counts forward to the enclosing
  // `:completed` row and resets at each fold point.
  const kept = [];
  const foldByLineIdx = new Map(); // index into `kept` → folded word count
  let pendingWords = 0;
  for (const line of lines) {
    if (!TS_LINE_RE.test(line)) {
      kept.push(line);
      continue;
    }
    const ev = eventOf(line);
    if (STRIP_SLUGS.has(ev)) {
      const { core } = splitRowMarker(line);
      pendingWords += parseWordsCell(core.split('|')[5]);
      continue; // strip the row
    }
    if (COMPLETE_SLUG_TO_STATE.has(ev)) {
      if (pendingWords > 0) foldByLineIdx.set(kept.length, pendingWords);
      pendingWords = 0;
    }
    if (isBareRejectDevelopRow(line)) {
      kept.push(requalifyRejectDevelopRow(line));
      continue;
    }
    kept.push(line);
  }

  // Intermediate body with strip rows removed — the substrate the recompute
  // reads. `computePhaseCloseDelta` only inspects timestamp, event slug, and
  // word-marker cells, none of which the completed-row re-render below alters,
  // so computing every delta against this one fixed string is correct
  // regardless of rewrite order.
  const strippedBody = kept.join('\n');

  // Pass 2 — recompute + fold each `:completed` row.
  const out = kept.map((line, idx) => {
    if (!TS_LINE_RE.test(line)) return line;
    const ev = eventOf(line);
    const state = COMPLETE_SLUG_TO_STATE.get(ev);
    if (!state) return line;
    const tsMatch = line.match(TS_LINE_RE);
    const close = computePhaseCloseDelta(strippedBody, state, tsMatch[1]);

    const { core } = splitRowMarker(line);
    const existingWords = parseWordsCell(core.split('|')[5]);
    const foldedWords = existingWords + (foldByLineIdx.get(idx) || 0);

    // Fall back to the row's existing active/idle when no enter row matched
    // (anomalous/legacy log) so the heal never regresses a real span to 0.
    if (!close.matched) {
      if (foldedWords === existingWords) return line; // nothing to change
      return renderExistingWithWords(line, foldedWords);
    }
    return renderCompletedRow(line, {
      activeSec: close.activeSec,
      idleSec: close.idleSec,
      deltaWords: foldedWords,
    });
  });

  return out.join('\n');
}

// Rewrite ONLY the Δ Words cell of a row, preserving active/idle/marker exactly.
// Used on the unmatched-span fallback path where we fold words but cannot
// safely recompute the span.
function renderExistingWithWords(line, deltaWords) {
  const { core, marker } = splitRowMarker(line);
  const parts = core.split('|');
  parts[5] = ` ${fmtNumBlankZero(deltaWords)} `;
  return parts.join('|') + marker;
}

// Count the retired `idle`/`active-work` rows in a body — used by the CLI/sweep
// to report what a heal did (or would do) without diffing full bodies.
export function countRetiredRows(body) {
  if (!body || typeof body !== 'string') return 0;
  let n = 0;
  for (const line of body.split('\n')) {
    if (TS_LINE_RE.test(line) && RETIRED_SLUGS.has(eventOf(line))) n++;
  }
  return n;
}
