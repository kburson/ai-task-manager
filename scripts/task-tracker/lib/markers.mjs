// Hidden-marker helpers — centralizes all `<!-- aitm-* -->` markers used to
// record verb completion in issue bodies.
//
// Markers are HTML comments so they do not render in the issue view. Each
// helper is pure and idempotent. Insertion preserves the canonical field-DB
// encoding via parseIssueFieldDb/formatIssueFieldDb, ensuring legacy fenced
// blocks are normalized as a side-effect of any marker write.

import { parseIssueFieldDb, stripIssueFieldDb, formatIssueFieldDb } from '../issue-field-db.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';

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
// Fence pattern: opening fence (```/~~~) at the start of a line (allowing
// leading whitespace per CommonMark), arbitrary content, closing fence of
// the SAME shape at the start of a line. Backreference `\\1` enforces the
// shape match so a ```-opened block doesn't terminate on a stray ~~~.
// ---------------------------------------------------------------------------

const FENCED_CODE_BLOCK_RE = /^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[ \t]*$/gm;

export function stripFencedCodeBlocks(body) {
  return String(body || '').replace(FENCED_CODE_BLOCK_RE, '');
}

// ---------------------------------------------------------------------------
// plan-approved (plan → develop human gate)
// ---------------------------------------------------------------------------

export const PLAN_APPROVED_RE = /<!--\s*aitm-plan-approved:\s*([^>]*?)\s*-->/i;

export function buildPlanApprovedMarker(ts) {
  return `<!-- aitm-plan-approved: ${ts} -->`;
}

export function hasPlanApprovedMarker(body) {
  return PLAN_APPROVED_RE.test(stripFencedCodeBlocks(body));
}

// ---------------------------------------------------------------------------
// review-approved (review → done human gate)
// ---------------------------------------------------------------------------

export const REVIEW_APPROVED_RE = /<!--\s*aitm-review-approved:\s*([^>]*?)\s*-->/i;

export function buildReviewApprovedMarker(ts) {
  return `<!-- aitm-review-approved: ${ts} -->`;
}

export function hasReviewApprovedMarker(body) {
  return REVIEW_APPROVED_RE.test(stripFencedCodeBlocks(body));
}

export function insertReviewApprovedMarker(body, ts) {
  return insertMarkerBeforeFieldDb(body, REVIEW_APPROVED_RE, buildReviewApprovedMarker(ts));
}

export function insertPlanApprovedMarker(body, ts) {
  return insertMarkerBeforeFieldDb(body, PLAN_APPROVED_RE, buildPlanApprovedMarker(ts));
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

export const FULL_AUTO_APPROVED_RE = /<!--\s*aitm-full-auto-approved:\s*([^>]*?)\s*-->/i;

export function buildFullAutoApprovedMarker(ts, signals) {
  return `<!-- aitm-full-auto-approved: ${ts}:${signals} -->`;
}

export function hasFullAutoApprovedMarker(body) {
  return FULL_AUTO_APPROVED_RE.test(String(body || ''));
}

export function insertFullAutoApprovedMarker(body, ts, signals) {
  return insertMarkerBeforeFieldDb(
    body,
    FULL_AUTO_APPROVED_RE,
    buildFullAutoApprovedMarker(ts, signals)
  );
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
    '> Hidden marker: `aitm-full-auto-approved`.',
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
  const lifeIdx = lines.findIndex((l) => /^####\s+Lifecycle\b/i.test(l));
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
  const dodIdx = lines.findIndex((l) => /^###\s+Definition of Done\b/i.test(l));
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
// dod-verified (sandboxed /task test stamped this on green — #137)
// ---------------------------------------------------------------------------

export const DOD_VERIFIED_RE = /<!--\s*aitm-dod-verified:\s*([0-9a-f]{7,40}):([^>\s]+)\s*-->/i;

export function buildDodVerifiedMarker(sha, ts) {
  return `<!-- aitm-dod-verified: ${sha}:${ts} -->`;
}

export function hasDodVerifiedMarker(body) {
  return DOD_VERIFIED_RE.test(String(body || ''));
}

export function parseDodVerifiedMarker(body) {
  const m = String(body || '').match(DOD_VERIFIED_RE);
  if (!m) return null;
  return { sha: m[1], ts: m[2] };
}

export function insertDodVerifiedMarker(body, sha, ts) {
  // Replace any existing marker so re-running /task test refreshes the SHA.
  // Without this, a stale marker survives forever and Test→Review re-runs
  // can't pick up a moved HEAD.
  const stripped = String(body || '')
    .replace(DOD_VERIFIED_RE, '')
    .replace(/\n{3,}/g, '\n\n');
  return insertMarkerBeforeFieldDb(stripped, DOD_VERIFIED_RE, buildDodVerifiedMarker(sha, ts));
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

export const TEST_STARTED_RE = /<!--\s*aitm-test-started:\s*([0-9a-f]{7,40}):([^>\s]+)\s*-->/i;

export function buildTestStartedMarker(sha, ts) {
  return `<!-- aitm-test-started: ${sha}:${ts} -->`;
}

export function hasTestStartedMarker(body) {
  return TEST_STARTED_RE.test(String(body || ''));
}

export function parseTestStartedMarker(body) {
  const m = String(body || '').match(TEST_STARTED_RE);
  if (!m) return null;
  return { sha: m[1], ts: m[2] };
}

export function insertTestStartedMarker(body, sha, ts) {
  // Replace any existing marker so re-running /task test refreshes the SHA.
  // Without this, a stale entry-SHA survives forever and a re-test against
  // a newer HEAD would always look "drifted" at Review preflight.
  const stripped = String(body || '')
    .replace(TEST_STARTED_RE, '')
    .replace(/\n{3,}/g, '\n\n');
  return insertMarkerBeforeFieldDb(stripped, TEST_STARTED_RE, buildTestStartedMarker(sha, ts));
}

// ---------------------------------------------------------------------------
// deep-dive-complete (structural prerequisite for plan → develop)
// ---------------------------------------------------------------------------

export const DEEP_DIVE_COMPLETE_RE = /<!--\s*aitm-deep-dive-complete:\s*([^>]*?)\s*-->/i;

export function buildDeepDiveCompleteMarker(ts) {
  return `<!-- aitm-deep-dive-complete: ${ts} -->`;
}

export function hasDeepDiveCompleteMarker(body) {
  return DEEP_DIVE_COMPLETE_RE.test(stripFencedCodeBlocks(body));
}

export function insertDeepDiveCompleteMarker(body, ts) {
  return insertMarkerBeforeFieldDb(body, DEEP_DIVE_COMPLETE_RE, buildDeepDiveCompleteMarker(ts));
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

function insertMarkerBeforeFieldDb(body, markerRe, marker) {
  const src = String(body || '');
  if (markerRe.test(src)) return src;
  const parsed = parseIssueFieldDb(src);
  if (parsed.ok) {
    const stripped = stripIssueFieldDb(src);
    return `${stripped}\n\n${marker}\n\n${formatIssueFieldDb(parsed.values)}\n`;
  }
  return `${src.replace(/\s+$/, '')}\n\n${marker}\n`;
}
