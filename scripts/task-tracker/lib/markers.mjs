// Hidden-marker helpers — centralizes all `<!-- aitm-* -->` markers used to
// record verb completion in issue bodies.
//
// Markers are HTML comments so they do not render in the issue view. Each
// helper is pure and idempotent. Insertion preserves the canonical field-DB
// encoding via parseIssueFieldDb/formatIssueFieldDb, ensuring legacy fenced
// blocks are normalized as a side-effect of any marker write.

import { parseIssueFieldDb, stripIssueFieldDb, formatIssueFieldDb } from '../issue-field-db.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';
import { serializeMarker, unescapeValue, parseMarker } from './marker-grammar.mjs';

// Versioned verification evidence lives in its own contract module. Re-export
// the issue-body helpers here so all authoritative marker writes remain
// discoverable through the central marker registry.
export {
  parseVerificationReceipt,
  parseVerificationReceipts,
  upsertVerificationReceipt,
} from './verification-receipt.mjs';

// ---------------------------------------------------------------------------
// Phantom-marker hardening (#333)
//
// Marker detectors test their `<!-- aitm-X: VALUE -->` regex against the
// entire issue body. Without further protection, a literal marker occurrence
// inside a fenced code block (planner prose documenting the marker shape,
// example bodies, regex literals) is a false positive — the gate using the
// detector short-circuits as if a real stamp existed.
//
// `stripFencedCodeBlocks` removes ```/``` and ~~~/~~~ fenced regions before
// the detector runs. The three plan/review-gate detectors below
// (`hasPlanApprovedMarker`, `hasReviewApprovedMarker`,
// `hasDeepDiveCompleteMarker`) compose against the stripped body. Inline
// code spans (single backticks) are out of scope: a marker comment inside a
// single-backtick span is unusual and was not the observed failure mode.
//
// Fence scanner: opening fence of at least three backticks or tildes with up
// to three leading spaces, arbitrary content, then a closing fence of the same
// character whose length is at least the opener's. An unclosed fence consumes
// the rest of the body, matching CommonMark fenced-block behavior.
// ---------------------------------------------------------------------------

function sourceLines(body) {
  const src = String(body || '');
  const lines = [];
  let start = 0;
  while (start < src.length) {
    const newline = src.indexOf('\n', start);
    const end = newline === -1 ? src.length : newline + 1;
    let textEnd = newline === -1 ? end : newline;
    if (textEnd > start && src[textEnd - 1] === '\r') textEnd -= 1;
    lines.push({ start, end, text: src.slice(start, textEnd) });
    start = end;
  }
  return { src, lines };
}

function fencedCodeBlockRanges(body) {
  const { src, lines } = sourceLines(body);
  const ranges = [];
  for (let i = 0; i < lines.length; i += 1) {
    const opener = lines[i].text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!opener) continue;
    const fenceChar = opener[1][0];
    if (fenceChar === '`' && opener[2].includes('`')) continue;
    const openerLength = opener[1].length;
    let end = src.length;
    let closingLine = lines.length;
    for (let j = i + 1; j < lines.length; j += 1) {
      const closer = lines[j].text.match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (closer && closer[1][0] === fenceChar && closer[1].length >= openerLength) {
        end = lines[j].end;
        closingLine = j;
        break;
      }
    }
    ranges.push({ start: lines[i].start, end });
    i = closingLine;
  }
  return { src, ranges };
}

function transformFencedCodeBlocks(body, transform) {
  const { src, ranges } = fencedCodeBlockRanges(body);
  if (ranges.length === 0) return src;
  let cursor = 0;
  let result = '';
  for (const range of ranges) {
    result += src.slice(cursor, range.start);
    result += transform(src.slice(range.start, range.end));
    cursor = range.end;
  }
  return result + src.slice(cursor);
}

export function stripFencedCodeBlocks(body) {
  return transformFencedCodeBlocks(body, () => '');
}

export function maskFencedCodeBlocksPreservingOffsets(body) {
  return transformFencedCodeBlocks(body, (block) => block.replace(/[^\r\n]/g, ' '));
}

// ---------------------------------------------------------------------------
// plan-approved (plan → develop human gate)
// ---------------------------------------------------------------------------

// Reader widened (#375) to accept BOTH the legacy colon grammar
// (`aitm-plan-approved: <iso>`) and the consolidated property grammar
// (`aitm-plan-approved ts="<iso>"`). The legacy branch stays until #369's
// corpus sweep reports zero residual legacy markers.
export const PLAN_APPROVED_RE =
  /<!--\s*aitm-plan-approved(?::\s*[^>]*?|\s+ts="[^"]*"[^>]*?)\s*-->/i;

export const PLAN_APPROVAL_MODES = Object.freeze({
  HUMAN: 'human',
  FULL_AUTO: 'full-auto',
  UNKNOWN: 'unknown',
});

export function buildPlanApprovedMarker(ts, { forecastRecordId = null, mode = null } = {}) {
  const properties = { ts };
  if (forecastRecordId !== null) properties['forecast-record-id'] = forecastRecordId;
  if (mode !== null) {
    if (mode !== PLAN_APPROVAL_MODES.HUMAN && mode !== PLAN_APPROVAL_MODES.FULL_AUTO) {
      throw new TypeError(
        `buildPlanApprovedMarker: unsupported approval mode ${JSON.stringify(mode)}`
      );
    }
    properties.mode = mode;
  }
  return serializeMarker('plan-approved', properties);
}

export function hasPlanApprovedMarker(body) {
  return PLAN_APPROVED_RE.test(stripFencedCodeBlocks(body));
}

// Decode a plan-approved marker without fabricating provenance for historical
// shapes. Legacy colon markers and property markers written before #1109 have
// no `mode`, so both remain valid approvals but report `unknown`.
export function parsePlanApprovedMarker(body) {
  const match = stripFencedCodeBlocks(body).match(PLAN_APPROVED_RE)?.[0];
  if (!match) return null;

  const legacy = match.match(/<!--\s*aitm-plan-approved:\s*([^>]*?)\s*-->/i);
  if (legacy) {
    return {
      ts: legacy[1].trim(),
      forecastRecordId: null,
      mode: PLAN_APPROVAL_MODES.UNKNOWN,
    };
  }

  const parsed = parseMarker(match);
  if (!parsed || parsed.name !== 'plan-approved') return null;
  const props = parsed.props || {};
  const mode =
    props.mode === PLAN_APPROVAL_MODES.HUMAN || props.mode === PLAN_APPROVAL_MODES.FULL_AUTO
      ? props.mode
      : PLAN_APPROVAL_MODES.UNKNOWN;
  const forecastRecordId = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(props['forecast-record-id'] || '')
    ? props['forecast-record-id']
    : null;
  return { ts: props.ts || '', forecastRecordId, mode };
}

export function readPlanApprovedMode(body) {
  return parsePlanApprovedMarker(body)?.mode ?? PLAN_APPROVAL_MODES.UNKNOWN;
}

export function readPlanApprovedForecastRecordId(body) {
  return parsePlanApprovedMarker(body)?.forecastRecordId ?? null;
}

// ---------------------------------------------------------------------------
// review-approved (review → done human gate)
// ---------------------------------------------------------------------------

// Reader widened (#375) to accept both legacy colon and new `ts="..."` forms.
// Widened again (#480) so the new property form tolerates trailing attributes
// (`full-auto="yes" signals="…"`) consolidated onto the same marker.
export const REVIEW_APPROVED_RE =
  /<!--\s*aitm-review-approved(?::\s*[^>]*?|\s+ts="[^"]*"[^>]*?)\s*-->/i;

// #480 — the consolidated review-approved marker now optionally carries the
// full-auto approval audit props. `full-auto="yes" signals="<env=…>"` collapse
// what used to be a separate `aitm-full-auto-approved` marker + visible footnote
// into a single marker. Pass `{ fullAuto: true, signals }` from the approve verb
// when no human reviewed the work.
export function buildReviewApprovedMarker(ts, { fullAuto = false, signals = '' } = {}) {
  const props = { ts };
  if (fullAuto) {
    props['full-auto'] = 'yes';
    props.signals = signals || '';
  }
  return serializeMarker('review-approved', props);
}

export function hasReviewApprovedMarker(body) {
  return REVIEW_APPROVED_RE.test(stripFencedCodeBlocks(body));
}

// Matches a consolidated review-approved marker that carries the full-auto prop.
const REVIEW_APPROVED_FULL_AUTO_RE =
  /<!--\s*aitm-review-approved\s+[^>]*\bfull-auto="(?:yes|true)"[^>]*-->/i;

// Decode a consolidated review-approved marker to `{ ts, fullAuto, signals }`,
// or null when absent. Uses the generic marker parser so prop order is
// irrelevant.
export function parseReviewApprovedMarker(body) {
  const m = stripFencedCodeBlocks(body).match(REVIEW_APPROVED_RE);
  if (!m) return null;
  const parsed = parseMarker(m[0]);
  if (!parsed) {
    const legacyTs = m[0].match(/aitm-review-approved\s*:\s*([^>]*?)\s*-->/i)?.[1]?.trim();
    return { ts: legacyTs || '', fullAuto: false, signals: '' };
  }
  const props = parsed.props || {};
  return {
    ts: props.ts || '',
    fullAuto: props['full-auto'] === 'yes' || props['full-auto'] === 'true',
    signals: props.signals || '',
  };
}

export function insertReviewApprovedMarker(body, ts, opts = {}) {
  return insertMarkerBeforeFieldDb(
    body,
    buildReviewApprovedMarker(ts, opts),
    hasReviewApprovedMarker
  );
}

export function insertPlanApprovedMarker(body, ts, options) {
  return insertMarkerBeforeFieldDb(
    body,
    buildPlanApprovedMarker(ts, options),
    hasPlanApprovedMarker
  );
}

export function upsertPlanApprovedMarker(body, ts, options) {
  const source = String(body || '');
  const masked = maskFencedCodeBlocksPreservingOffsets(source);
  const match = PLAN_APPROVED_RE.exec(masked);
  if (!match) return insertPlanApprovedMarker(source, ts, options);
  const marker = buildPlanApprovedMarker(ts, options);
  return `${source.slice(0, match.index)}${marker}${source.slice(match.index + match[0].length)}`;
}

// ---------------------------------------------------------------------------
// full-auto-approved (#156 — Full-Auto audit marker on /task approve)
//
// In full-auto mode, no human reviewed the work — but `/task approve` still
// ticks "Passed final human review" so close-gates pass. The marker preserves
// the audit truth: this approval was machine-generated, not human-reviewed.
// `<signals>` records which detection inputs fired (env, tty, ci) so the trail
// explains its own confidence later.
// ---------------------------------------------------------------------------

// Dual-grammar readers (#380), mirroring the dod-verified pair. The legacy
// reader keeps the historical `<ts>:<signals>` colon payload; the new reader
// matches the consolidated property grammar `ts="<iso>" signals="<env=…>"`
// emitted by `serializeMarker` (key order ts→signals).
const FULL_AUTO_APPROVED_LEGACY_RE = /<!--\s*aitm-full-auto-approved:\s*([^>]*?)\s*-->/i;
const FULL_AUTO_APPROVED_NEW_RE =
  /<!--\s*aitm-full-auto-approved\s+ts="((?:[^"]|&quot;)*)"\s+signals="((?:[^"]|&quot;)*)"\s*-->/i;

// Combined detection/strip RE (#380). Matches BOTH legacy colon and new
// property grammar. Used presence-only by `hasFullAutoApprovedMarker`,
// `preflight-issue.mjs`, `close-gate.mjs`, and `heal-full-auto-footnote.mjs`,
// and as the strip target in `insertFullAutoApprovedMarker`. The legacy branch
// stays until #369's corpus sweep reports zero residual legacy markers.
export const FULL_AUTO_APPROVED_RE =
  /<!--\s*aitm-full-auto-approved(?::\s*[^>]*?|\s+ts="(?:[^"]|&quot;)*"\s+signals="(?:[^"]|&quot;)*")\s*-->/i;

export function buildFullAutoApprovedMarker(ts, signals) {
  return serializeMarker('full-auto-approved', { ts, signals });
}

export function hasFullAutoApprovedMarker(body) {
  return FULL_AUTO_APPROVED_RE.test(String(body || ''));
}

// Decode the marker payload back to `{ ts, signals }` from BOTH grammars
// (#380). The new property form is tried first; the legacy branch reproduces
// the historical `:env=` payload split (and the older first-colon fallback) so
// `heal-closed-issues` recovers the same shape regardless of marker vintage.
export function parseFullAutoApprovedMarker(body) {
  const s = String(body || '');
  const neu = s.match(FULL_AUTO_APPROVED_NEW_RE);
  if (neu) return { ts: unescapeValue(neu[1]), signals: unescapeValue(neu[2]) };
  const legacy = s.match(FULL_AUTO_APPROVED_LEGACY_RE);
  if (!legacy) return null;
  const payload = legacy[1].trim();
  // ISO-8601-aware split (#387): the legacy payload is `<iso>:<signals>`, and
  // an ISO timestamp is itself colon-rich, so a naive first-colon split lands
  // inside the time component whenever the signal list does not lead with
  // `env=` (e.g. heal-stamped `reviewer-unset=`-leading markers). Match the
  // full timestamp — date + `T` + time + a `Z` or numeric `±HH:MM` offset
  // terminator — and split on the first colon AFTER it. This runs ahead of the
  // `:env=` heuristic and produces the identical split for `env=`-leading
  // markers, so previously-correct parses are preserved.
  const iso = payload.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})):(.*)$/);
  if (iso) return { ts: iso[1], signals: iso[2] };
  const idx = payload.indexOf(':env=');
  if (idx < 0) {
    const firstColon = payload.indexOf(':');
    return firstColon > 0
      ? { ts: payload.slice(0, firstColon), signals: payload.slice(firstColon + 1) }
      : { ts: payload, signals: '' };
  }
  return { ts: payload.slice(0, idx), signals: payload.slice(idx + 1) };
}

export function insertFullAutoApprovedMarker(body, ts, signals) {
  return insertMarkerBeforeFieldDb(
    body,
    buildFullAutoApprovedMarker(ts, signals),
    hasFullAutoApprovedMarker
  );
}

// #480 — single source of truth for "this approval was machine-generated."
// Recognises BOTH the legacy standalone `aitm-full-auto-approved` marker AND
// the consolidated `aitm-review-approved … full-auto="yes"` form. close-gate
// and any auditor should read through this so old and new corpora both resolve.
export function hasFullAutoApproved(body) {
  const s = String(body || '');
  return FULL_AUTO_APPROVED_RE.test(s) || REVIEW_APPROVED_FULL_AUTO_RE.test(s);
}

// ---------------------------------------------------------------------------
// full-auto footnote — visible audit signal under DoD when no human reviewed
// (#161). The hidden `aitm-full-auto-approved` marker records the truth but is
// invisible in rendered GitHub; this footnote is a blockquote rendered just
// after the Lifecycle subsection so a reader sees "no human looked at this"
// at a glance.
// ---------------------------------------------------------------------------

export const FULL_AUTO_FOOTNOTE_START = '<!-- aitm-full-auto-footnote:start -->';
export const FULL_AUTO_FOOTNOTE_END = '<!-- aitm-full-auto-footnote:end -->';
// Match only when both delimiters sit alone on their own line (anchored at
// line-start, optionally followed by trailing whitespace). This excludes prose
// mentions inside code spans (backticks) and prose that wraps a delimiter into
// a sentence — including a deep-dive describing the block format, which is
// what corrupted #178's body before this tightening.
const FULL_AUTO_FOOTNOTE_BLOCK_RE = new RegExp(
  `^${escapeRegExp(FULL_AUTO_FOOTNOTE_START)}[ \\t]*$[\\s\\S]*?^${escapeRegExp(FULL_AUTO_FOOTNOTE_END)}[ \\t]*$\\n?`,
  'gm'
);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildFullAutoFootnoteBlock({ ts, signals }) {
  const tsStr = ts || '';
  const sigStr = signals || '';
  return [
    FULL_AUTO_FOOTNOTE_START,
    '> ⚙️ **Full-Auto mode enabled: human review skipped.**',
    `> Approval was stamped by an autonomous agent (\`${sigStr}\`) at ${tsStr}.`,
    '> Hidden marker: `aitm-review-approved full-auto="yes"`.',
    FULL_AUTO_FOOTNOTE_END,
  ].join('\n');
}

export function hasFullAutoFootnote(body) {
  if (typeof body !== 'string') return false;
  // Use the block regex (start…end with content) rather than `String.includes`
  // on the start delimiter alone — otherwise any prose that mentions the
  // marker (e.g., a deep-dive describing the format) trips the check, sending
  // `insertFullAutoFootnote` down the "replace existing" branch, which then
  // no-ops because the regex below can't match a single delimiter in prose.
  FULL_AUTO_FOOTNOTE_BLOCK_RE.lastIndex = 0;
  return FULL_AUTO_FOOTNOTE_BLOCK_RE.test(body);
}

/**
 * Insert (or replace) the visible Full-Auto footnote block in `body`. Anchor
 * preference (first match wins):
 *   1. After the last `- [ ]`/`- [x]` line under the `#### Lifecycle …` subsection.
 *   2. End of the `### Definition of Done` section (before the next heading or EOF).
 *   3. End of body.
 * Idempotent: an existing block between the delimiters is replaced verbatim.
 */
export function insertFullAutoFootnote(body, { ts, signals } = {}) {
  const src = typeof body === 'string' ? body : '';
  const block = buildFullAutoFootnoteBlock({ ts, signals });
  if (hasFullAutoFootnote(src)) {
    return src.replace(FULL_AUTO_FOOTNOTE_BLOCK_RE, `${block}\n`).replace(/\n{3,}/g, '\n\n');
  }

  const lines = src.split('\n');

  // Anchor 1 — Lifecycle subsection. Find `#### Lifecycle` heading; insert
  // after the last checklist line under it.
  const lifeIdx = lines.findIndex((l) => /^#{3,4}\s+Lifecycle\b/i.test(l));
  if (lifeIdx !== -1) {
    let last = lifeIdx;
    for (let i = lifeIdx + 1; i < lines.length; i++) {
      if (/^#{1,4}\s/.test(lines[i])) break;
      if (/^\s*[-*]\s+\[[ xX]\]/.test(lines[i])) last = i;
    }
    lines.splice(last + 1, 0, '', block);
    return lines.join('\n');
  }

  // Anchor 2 — Definition of Done section.
  const dodIdx = lines.findIndex((l) => /^#{2,3}\s+Definition of Done\b/i.test(l));
  if (dodIdx !== -1) {
    let endIdx = lines.length;
    for (let i = dodIdx + 1; i < lines.length; i++) {
      if (/^#{1,4}\s/.test(lines[i])) {
        endIdx = i;
        break;
      }
    }
    lines.splice(endIdx, 0, block, '');
    return lines.join('\n');
  }

  // Anchor 3 — end of body.
  const sep = src.endsWith('\n') ? '' : '\n';
  return `${src}${sep}\n${block}\n`;
}

export function removeFullAutoFootnote(body) {
  if (!hasFullAutoFootnote(body)) return body;
  return String(body)
    .replace(FULL_AUTO_FOOTNOTE_BLOCK_RE, '')
    .replace(/\n{3,}/g, '\n\n');
}

// ---------------------------------------------------------------------------
// aitm-verified — consolidated PROOF marker (#368, parent epic #367)
//
// The single canonical execution-proof marker. The registry delegates to the
// dedicated `proof-marker.mjs` helper so there is exactly one serializer/parser
// for the `<!-- aitm-verified key="value" ... -->` grammar (plus the legacy
// dual-comment read path kept until #369 rewrites the corpus). Re-exported here
// so callers that resolve markers through the central registry get the proof
// marker too.
// ---------------------------------------------------------------------------

export {
  serializeProofMarker,
  parseProofMarker,
  hasExecutionProof,
  resolveVerifiedBy,
  stripProofMarkers,
} from './proof-marker.mjs';

// ---------------------------------------------------------------------------
// dod-verified (sandboxed /task test stamped this on green — #137)
// ---------------------------------------------------------------------------

// Dedicated capture readers (#377). The legacy reader keeps the historical
// `<sha>:<iso>` colon grammar; the new reader matches the consolidated
// property grammar `sha="<sha>" ts="<iso>"` emitted by `serializeMarker`
// (key order sha→ts). `parseDodVerifiedMarker` attempts legacy first, then
// new, so both shapes return the same `{sha, ts}` contract the SHA-drift gate
// and close-gates depend on.
const DOD_VERIFIED_LEGACY_RE = /<!--\s*aitm-dod-verified:\s*([0-9a-f]{7,40}):([^>\s]+)\s*-->/i;
const DOD_VERIFIED_NEW_RE =
  /<!--\s*aitm-dod-verified\s+sha="((?:[^"]|&quot;)*)"\s+ts="((?:[^"]|&quot;)*)"\s*-->/i;

// Combined detection/strip RE (#377). Matches BOTH legacy colon and new
// property grammar. Used presence-only by `hasDodVerifiedMarker`,
// `close-gates.mjs`, and the dod-verified guards, and as the strip target in
// `insertDodVerifiedMarker`. The legacy branch stays until #369's corpus
// sweep reports zero residual legacy markers.
export const DOD_VERIFIED_RE =
  /<!--\s*aitm-dod-verified(?::\s*[0-9a-f]{7,40}:[^>\s]+|\s+sha="(?:[^"]|&quot;)*"\s+ts="(?:[^"]|&quot;)*")\s*-->/i;

export function buildDodVerifiedMarker(sha, ts) {
  return serializeMarker('dod-verified', { sha, ts });
}

export function hasDodVerifiedMarker(body) {
  return DOD_VERIFIED_RE.test(String(body || ''));
}

export function parseDodVerifiedMarker(body) {
  const s = String(body || '');
  const legacy = s.match(DOD_VERIFIED_LEGACY_RE);
  if (legacy) return { sha: legacy[1], ts: legacy[2] };
  const neu = s.match(DOD_VERIFIED_NEW_RE);
  if (neu) return { sha: unescapeValue(neu[1]), ts: unescapeValue(neu[2]) };
  return null;
}

export function insertDodVerifiedMarker(body, sha, ts) {
  // Replace any existing marker so re-running /task test refreshes the SHA.
  // Without this, a stale marker survives forever and Test→Review re-runs
  // can't pick up a moved HEAD.
  const stripped = String(body || '')
    .replace(DOD_VERIFIED_RE, '')
    .replace(/\n{3,}/g, '\n\n');
  return insertMarkerBeforeFieldDb(stripped, buildDodVerifiedMarker(sha, ts), hasDodVerifiedMarker);
}

// ---------------------------------------------------------------------------
// test-started (#154 — Test→Review SHA drift gate)
//
// Stamped when verbTest moves an issue to the `test` state, BEFORE the
// sandbox verification runs. Records the outer-HEAD SHA at the moment Test
// began. verbReview's preflight compares it against current HEAD; if they
// differ, the gate refuses the move and forces a re-test.
//
// Mirrors the DOD_VERIFIED_RE shape: `<sha>:<iso-ts>` (sha is 7–40 hex).
// ---------------------------------------------------------------------------

// Dual-grammar readers (#377), mirroring the dod-verified pair above.
const TEST_STARTED_LEGACY_RE = /<!--\s*aitm-test-started:\s*([0-9a-f]{7,40}):([^>\s]+)\s*-->/i;
const TEST_STARTED_NEW_RE =
  /<!--\s*aitm-test-started\s+sha="((?:[^"]|&quot;)*)"\s+ts="((?:[^"]|&quot;)*)"\s*-->/i;

// Combined detection/strip RE (#377) — matches BOTH grammars. `parseTestStarted`
// feeds the review SHA-drift gate (`{sha}` → `startsWith`), so the `{sha, ts}`
// contract is preserved across both shapes.
export const TEST_STARTED_RE =
  /<!--\s*aitm-test-started(?::\s*[0-9a-f]{7,40}:[^>\s]+|\s+sha="(?:[^"]|&quot;)*"\s+ts="(?:[^"]|&quot;)*")\s*-->/i;

export function buildTestStartedMarker(sha, ts) {
  return serializeMarker('test-started', { sha, ts });
}

export function hasTestStartedMarker(body) {
  return TEST_STARTED_RE.test(String(body || ''));
}

export function parseTestStartedMarker(body) {
  const s = String(body || '');
  const legacy = s.match(TEST_STARTED_LEGACY_RE);
  if (legacy) return { sha: legacy[1], ts: legacy[2] };
  const neu = s.match(TEST_STARTED_NEW_RE);
  if (neu) return { sha: unescapeValue(neu[1]), ts: unescapeValue(neu[2]) };
  return null;
}

export function insertTestStartedMarker(body, sha, ts) {
  // Replace any existing marker so re-running /task test refreshes the SHA.
  // Without this, a stale entry-SHA survives forever and a re-test against
  // a newer HEAD would always look "drifted" at Review preflight.
  const stripped = String(body || '')
    .replace(TEST_STARTED_RE, '')
    .replace(/\n{3,}/g, '\n\n');
  return insertMarkerBeforeFieldDb(stripped, buildTestStartedMarker(sha, ts), hasTestStartedMarker);
}

// ---------------------------------------------------------------------------
// deep-dive-complete (structural prerequisite for plan → develop)
// ---------------------------------------------------------------------------

// Reader widened (#375) to accept both legacy colon and new `ts="..."` forms.
export const DEEP_DIVE_COMPLETE_RE =
  /<!--\s*aitm-deep-dive-complete(?::\s*[^>]*?|\s+ts="[^"]*")\s*-->/i;

export function buildDeepDiveCompleteMarker(ts) {
  return serializeMarker('deep-dive-complete', { ts });
}

export function hasDeepDiveCompleteMarker(body) {
  return DEEP_DIVE_COMPLETE_RE.test(stripFencedCodeBlocks(body));
}

export function insertDeepDiveCompleteMarker(body, ts) {
  return insertMarkerBeforeFieldDb(
    body,
    buildDeepDiveCompleteMarker(ts),
    hasDeepDiveCompleteMarker
  );
}

// Heading-fallback for legacy issues authored before the marker existed. A
// `## Deep-Dive Analysis` heading in the body is treated as equivalent
// evidence that the deep-dive was performed, so pickup logic and the
// plan→develop gate do not re-author the section.
export const DEEP_DIVE_HEADING_RE = /^##\s+Deep-Dive Analysis\b/im;

export function hasDeepDiveHeading(body) {
  return DEEP_DIVE_HEADING_RE.test(String(body || ''));
}

export function hasDeepDiveEvidence(body) {
  return hasDeepDiveCompleteMarker(body) || hasDeepDiveHeading(body);
}

export const DEEP_DIVE_DETAILS_SUMMARY =
  'Deep-Dive Analysis (collapsed on plan approval — expand if revisiting scope)';

// Wrap the `## Deep-Dive Analysis` section in a <details> block so it
// collapses in the GitHub UI after plan approval. Section extends from the
// heading through either the field-DB block, the next top-level (`## `)
// heading, or the end of the body — whichever comes first.
//
// Idempotent: returns the body unchanged if a <details> block already
// precedes the heading, or if no deep-dive section is present.
export function wrapDeepDiveInDetails(body) {
  const src = String(body || '');
  if (!hasDeepDiveHeading(src)) return src;

  const lines = src.split('\n');
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (DEEP_DIVE_HEADING_RE.test(lines[i])) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) return src;

  for (let i = headingIdx - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t === '') continue;
    if (t.startsWith('<details>')) return src;
    if (t.startsWith('<summary>')) continue;
    break;
  }

  let endIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line) && !DEEP_DIVE_HEADING_RE.test(line)) {
      endIdx = i;
      break;
    }
    if (/^<!--\s*aitm-fields:/.test(line)) {
      endIdx = i;
      break;
    }
  }

  while (endIdx > headingIdx + 1 && lines[endIdx - 1].trim() === '') endIdx--;

  const before = lines.slice(0, headingIdx);
  const section = lines.slice(headingIdx, endIdx);
  const after = lines.slice(endIdx);

  const wrapped = [
    '<details>',
    `<summary>${DEEP_DIVE_DETAILS_SUMMARY}</summary>`,
    '',
    ...section,
    '',
    '</details>',
  ];

  const out = [...before, ...wrapped];
  if (after.length > 0) {
    out.push('');
    out.push(...after);
  }
  return out.join('\n');
}

// Backfill the marker on a legacy issue: if the heading is present and the
// marker is absent, insert the marker at `ts`. Returns the (possibly
// unchanged) body. Idempotent.
export function backfillDeepDiveCompleteMarker(body, ts) {
  const src = String(body || '');
  if (hasDeepDiveCompleteMarker(src)) return src;
  if (!hasDeepDiveHeading(src)) return src;
  return insertDeepDiveCompleteMarker(src, ts);
}

// Stamp the deep-dive-complete marker on a live issue body via `gh`.
// Idempotent: returns `{ changed: false }` if the marker is already present.
// Tests inject `deps.mutateBody` to avoid GitHub I/O.
export async function markDeepDiveComplete({ issueNumber, cfg, now, deps = {} } = {}) {
  if (!issueNumber) throw new Error('markDeepDiveComplete: issueNumber is required');
  if (!cfg?.repo) throw new Error('markDeepDiveComplete: cfg.repo is required');

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const pexec = promisify(execFile);

  // #295 — the idempotency check (was the marker already present?) and the
  // insertion both run inside the mutate closure against the freshly-fetched
  // remote base, so a concurrent writer between an external read and this
  // write doesn't get clobbered. `changed` is observed by closing over
  // `inserted` from inside the closure.
  const ts = (typeof now === 'function' ? now() : new Date().toISOString()).replace(/\.\d+Z$/, 'Z');
  let inserted = false;
  const mutate = (base) => {
    if (hasDeepDiveCompleteMarker(base)) return base;
    inserted = true;
    return insertDeepDiveCompleteMarker(base, ts);
  };
  const mutateBody =
    deps.mutateBody ||
    (async (fn) => {
      await mutateIssueBody({
        issueNumber,
        repo: cfg.repo,
        mutate: fn,
        deps: { pexec },
      });
    });

  await mutateBody(mutate);
  return inserted ? { changed: true, ts } : { changed: false, ts: null };
}

// ---------------------------------------------------------------------------
// Shared insertion logic.
//
// Places `marker` on its own line immediately before the field-DB block (in
// canonical encoding), or at the end of the body if no field-DB is present.
// Legacy fenced field-DB blocks are normalized as a side-effect.
//
// Idempotent: if the marker is already present, returns the body unchanged.
// ---------------------------------------------------------------------------

// #480 AC5 — the bottom progress-marker cluster lives under a dedicated
// `## AITM Progress Markers` heading so the lifecycle stamps (`aitm-entered-*`,
// `aitm-deep-dive-complete`, `aitm-plan-approved`, `aitm-test-started`,
// `aitm-dod-verified`, `aitm-review-approved`, `aitm-entered-done`,
// `aitm-story-closed`) form one visually-grouped section instead of trailing
// loose comments. The top markers (`aitm-body-version`, `aitm-last-known-state`,
// prepended by other writers) and the inline evidence markers (`aitm-verified`,
// `ac-evidence`, `aitm-dod-evidence`) are deliberately NOT relocated here.
export const PROGRESS_MARKERS_HEADING = '## AITM Progress Markers';

// Place `marker` under the progress-markers heading at the tail of `main` (a
// body fragment with the field-DB already stripped). When the heading is absent
// it is created; when present the marker is appended to the existing cluster
// (which always sits at the tail, since every progress marker is inserted here).
function placeProgressMarker(main, marker) {
  const trimmed = String(main || '').replace(/\s+$/, '');
  if (trimmed.includes(PROGRESS_MARKERS_HEADING)) {
    return `${trimmed}\n${marker}`;
  }
  return `${trimmed}\n\n${PROGRESS_MARKERS_HEADING}\n\n${marker}`;
}

function insertMarkerBeforeFieldDb(body, marker, hasMarker) {
  const src = String(body || '');
  if (hasMarker(src)) return src;
  const parsed = parseIssueFieldDb(src);
  if (parsed.ok) {
    const stripped = stripIssueFieldDb(src);
    const placed = placeProgressMarker(stripped, marker);
    return `${placed}\n\n${formatIssueFieldDb(parsed.values)}\n`;
  }
  return `${placeProgressMarker(src, marker)}\n`;
}

export function upsertProgressMarker(body, { kind, props = {} } = {}) {
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new Error(
      `upsertProgressMarker: 'kind' must be a non-empty string — got ${JSON.stringify(kind)}`
    );
  }
  const marker = serializeMarker(kind, props);
  const src = String(body || '');
  const escapedKind = kind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<!--\\s*aitm-${escapedKind}\\b[^>]*-->`, 'i');
  const match = re.exec(maskFencedCodeBlocksPreservingOffsets(src));
  if (match) {
    return `${src.slice(0, match.index)}${marker}${src.slice(match.index + match[0].length)}`;
  }
  return insertMarkerBeforeFieldDb(src, marker, () => false);
}

// #516 — Append-only audit markers for low-value lifecycle events demoted out
// of the ⏱ Timing Log: drift reconcile (`reconciled`), drift revert
// (`reverted`), and review-gate bypass (`gate-bypassed`). Their elapsed time is
// already counted inside the surrounding state, so a dedicated timing row was
// noise. Unlike the idempotent verb-completion markers above, these are
// APPEND-only — each occurrence records a distinct timestamped event under the
// progress-markers heading (a single issue may reconcile or bypass more than
// once). `kind` is the bare marker name; `detail` is free-text context.
export function appendAuditMarker(body, { kind, ts, detail } = {}) {
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new Error(
      `appendAuditMarker: 'kind' must be a non-empty string — got ${JSON.stringify(kind)}`
    );
  }
  const props = {};
  if (ts) props.ts = ts;
  if (detail) props.detail = detail;
  const marker = serializeMarker(kind, props);
  const src = String(body || '');
  const parsed = parseIssueFieldDb(src);
  if (parsed.ok) {
    const stripped = stripIssueFieldDb(src);
    const placed = placeProgressMarker(stripped, marker);
    return `${placed}\n\n${formatIssueFieldDb(parsed.values)}\n`;
  }
  return `${placeProgressMarker(src, marker)}\n`;
}
