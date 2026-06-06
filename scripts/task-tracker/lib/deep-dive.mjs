// #325 — `ensureDeepDive` is the single transactional resource for all
// three deep-dive signals: the `## Deep-Dive Analysis (yyyy-mm-dd)`
// heading + prose, `<!-- aitm-deep-dive-posted: ... -->`, and
// `<!-- aitm-deep-dive-complete: ... -->`. Callers pick which signals to
// flip via boolean flags; the helper guarantees coherence (e.g.
// `posted: true` with no existing section + no `prose` refuses with
// `DeepDiveSectionMissingError`).
//
// One `mutateIssueBody` transaction per call. Idempotent: re-invocation
// against a body already carrying the requested signals short-circuits to
// `{ status: 'no-op' }` (via `mutateIssueBody`'s `base === next` check).
//
// Placement: the authored block lands AFTER the `## Pickup Directive`
// heading + its trailing `---` separator (per
// `feedback_deep_dive_placement.md`). Falls back to before the
// `aitm-fields` JSON trailer when the directive heading is absent.
//
// `readDeepDiveSignals(body)` is the single source of truth for "what
// deep-dive signals does this body carry?" — consumed by `planDeepDiveGate`
// and `body-gates.mjs` instead of inline regex.
//
// History: this module replaced #294's `stampDeepDive` and #324's
// `stampDeepDivePostedOnly` shims, which were deleted under #325 once
// `ensureDeepDive` covered all 8 partial-state combinations.

import { mutateIssueBody } from './issue-body-mutate.mjs';
import { insertDeepDiveCompleteMarker } from './markers.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { DEEP_DIVE_SIZE_FLOORS } from './body-gates.mjs';

// Fallback floor when size is absent from the field-DB. Matches
// `body-gates.mjs::DEEP_DIVE_DEFAULT_FLOOR`.
const DEEP_DIVE_DEFAULT_FLOOR = 2000;

// Returns the size-bucketed character floor for the given body. Reads
// `size` from the `aitm-fields` field-DB; falls back to 2000 when size is
// absent or unrecognized. Exported for callers (e.g. `ensureDeepDive`'s
// append-when-below-floor branch).
export function pickDeepDiveFloor(body) {
  try {
    const parsed = parseIssueFieldDb(String(body || ''));
    const size = parsed?.values?.size;
    if (size && DEEP_DIVE_SIZE_FLOORS[size] != null) return DEEP_DIVE_SIZE_FLOORS[size];
  } catch {
    /* fall through */
  }
  return DEEP_DIVE_DEFAULT_FLOOR;
}

const POSTED_RE = /<!--\s*aitm-deep-dive-posted:\s*[^>]*?-->/i;
const COMPLETE_RE = /<!--\s*aitm-deep-dive-complete:\s*[^>]*?-->/i;
const PICKUP_HEADING_RE = /^##\s+Pickup Directive\b.*$/im;
const FIELDS_TRAILER_RE = /<!--\s*aitm-fields:/i;
// Writer regex — `ensureDeepDive` only authors `##`.
const DEEP_DIVE_HEADING_RE = /^##\s+Deep-Dive Analysis\b.*$/im;
// Detector regex — `readDeepDiveSignals` also accepts the legacy `###`
// encoding used by some pre-#294 issues.
const DEEP_DIVE_HEADING_DETECT_RE = /^#{2,3}\s+Deep-Dive Analysis\b.*$/im;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

export class DeepDiveSectionMissingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DeepDiveSectionMissingError';
  }
}

export function buildDeepDiveBlock({ ts, appendix, date } = {}) {
  if (!ts) throw new Error('buildDeepDiveBlock: ts is required');
  if (!appendix || typeof appendix !== 'string') {
    throw new TypeError('buildDeepDiveBlock: appendix must be a non-empty string');
  }
  const isoDate = date || String(ts).slice(0, 10);
  const marker = `<!-- aitm-deep-dive-posted: ${ts} -->`;
  const heading = `## Deep-Dive Analysis (${isoDate})`;
  const trimmed = appendix.replace(/^\s+|\s+$/g, '');
  return `\n\n${marker}\n\n${heading}\n\n${trimmed}\n`;
}

// Locate insertion point. Prefer the line AFTER the `---` separator that
// follows the Pickup Directive heading. Fallback to before the
// `aitm-fields` JSON trailer. Last resort: end of body.
export function findInsertOffset(body) {
  const src = String(body || '');
  const pickup = PICKUP_HEADING_RE.exec(src);
  if (pickup) {
    // Find the first `---` line after the heading.
    const after = src.indexOf('\n', pickup.index + pickup[0].length);
    if (after !== -1) {
      const sepRe = /^---\s*$/m;
      sepRe.lastIndex = 0;
      const rest = src.slice(after);
      const sep = sepRe.exec(rest);
      if (sep) {
        return after + sep.index + sep[0].length;
      }
    }
    // No separator → insert at end of pickup line.
    return pickup.index + pickup[0].length;
  }
  const fields = FIELDS_TRAILER_RE.exec(src);
  if (fields) {
    // Walk back to the start of the line containing the fields marker.
    const lineStart = src.lastIndexOf('\n', fields.index) + 1;
    return lineStart;
  }
  return src.length;
}

export function insertDeepDiveBlock(body, block) {
  const src = String(body || '');
  const offset = findInsertOffset(src);
  return `${src.slice(0, offset)}${block}${src.slice(offset)}`;
}

// #325 — append prose to an existing `## Deep-Dive Analysis` section
// (between the heading and the next `##`/`###` heading or end of body).
// Trims trailing whitespace inside the section, then inserts a blank line
// + the trimmed prose + a trailing newline before the next heading. Used
// by `ensureDeepDive` to extend a below-floor section without duplicating
// the heading.
export function appendProseToDeepDiveSection(body, prose) {
  const src = String(body || '');
  const trimmed = String(prose || '').replace(/^\s+|\s+$/g, '');
  if (!trimmed) return src;
  const lines = src.split('\n');
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (DEEP_DIVE_HEADING_DETECT_RE.test(lines[i])) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) return src;
  let endIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^#{1,3}\s+/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  // Strip trailing blank lines inside the section.
  let lastContentIdx = endIdx - 1;
  while (lastContentIdx > headingIdx && lines[lastContentIdx].trim() === '') {
    lastContentIdx--;
  }
  const before = lines.slice(0, lastContentIdx + 1);
  const after = lines.slice(endIdx);
  return [...before, '', trimmed, '', ...after].join('\n');
}

// #325 — single source of truth for "what deep-dive signals does this body
// carry?" Replaces the inline regex usage in `planDeepDiveGate` and the
// `minNonEmptyLines` line-counting in `body-gates.mjs`.
//
// `sectionChars` is measured from the line AFTER the `## Deep-Dive
// Analysis` heading to the line BEFORE the next `## ` heading (or end of
// body). HTML comments are stripped before counting so a 16-line section
// with three large marker comments does not get scored on the marker bytes.
export function readDeepDiveSignals(body = '') {
  const src = String(body || '');
  const hasHeading = DEEP_DIVE_HEADING_DETECT_RE.test(src);
  const hasPosted = POSTED_RE.test(src);
  const hasComplete = COMPLETE_RE.test(src);
  let sectionChars = 0;
  if (hasHeading) {
    const lines = src.split('\n');
    let headingIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (DEEP_DIVE_HEADING_DETECT_RE.test(lines[i])) {
        headingIdx = i;
        break;
      }
    }
    if (headingIdx !== -1) {
      let endIdx = lines.length;
      for (let i = headingIdx + 1; i < lines.length; i++) {
        if (/^#{1,3}\s+/.test(lines[i])) {
          endIdx = i;
          break;
        }
      }
      const sectionText = lines.slice(headingIdx + 1, endIdx).join('\n');
      sectionChars = sectionText.replace(HTML_COMMENT_RE, '').trim().length;
    }
  }
  return { hasHeading, hasPosted, hasComplete, sectionChars };
}

// #325 — consolidated authoring primitive. One `mutateIssueBody` transaction
// per call. Flags:
//
//   - `prose` (string): if provided, authors `## Deep-Dive Analysis
//     (yyyy-mm-dd)` heading + prose when the section is absent. When the
//     section already exists, `prose` is ignored (callers wanting to extend
//     an existing section should fetch + Edit; this primitive never
//     duplicates the heading).
//   - `posted` (default: true if `prose` provided, else false):
//     stamps `<!-- aitm-deep-dive-posted: <ts> -->`. When `prose` is given
//     the marker is woven into the same block; otherwise the marker is
//     inserted immediately above the existing section heading. Refuses with
//     `DeepDiveSectionMissingError` if `posted: true` is requested without
//     `prose` AND the body has no `## Deep-Dive Analysis` heading.
//   - `complete` (default: false): stamps `<!-- aitm-deep-dive-complete:
//     <ts> -->` immediately before the field-DB block (delegated to
//     `markers.insertDeepDiveCompleteMarker`).
//
// Each requested signal is no-op if already present (idempotent). Returns
// the underlying `mutateIssueBody` result; `status: 'no-op'` when no signal
// needed to change.
// #325 — sync mirror of `insertDeepDiveCompleteMarker` for legacy-body
// healing in `heal-backlog.mjs`. Inserts `<!-- aitm-deep-dive-posted: ts -->`
// immediately above an existing `## Deep-Dive Analysis` heading.
// Idempotent: returns the body unchanged if the marker is already present
// or if no heading exists.
export function insertDeepDivePostedMarker(body, ts) {
  const src = String(body || '');
  if (!ts) throw new Error('insertDeepDivePostedMarker: ts is required');
  if (POSTED_RE.test(src)) return src;
  const match = DEEP_DIVE_HEADING_DETECT_RE.exec(src);
  if (!match) return src;
  const marker = `<!-- aitm-deep-dive-posted: ${ts} -->`;
  return `${src.slice(0, match.index)}${marker}\n\n${src.slice(match.index)}`;
}

export async function ensureDeepDive({
  issueNumber,
  repo,
  prose,
  posted,
  complete = false,
  ts,
  deps = {},
} = {}) {
  if (issueNumber == null) throw new Error('ensureDeepDive: issueNumber is required');
  if (!repo) throw new Error('ensureDeepDive: repo is required');
  if (prose !== undefined && (typeof prose !== 'string' || prose.length === 0)) {
    throw new TypeError('ensureDeepDive: prose must be a non-empty string when provided');
  }
  const wantPosted = posted === undefined ? prose !== undefined : Boolean(posted);
  const wantComplete = Boolean(complete);
  const stamp = ts || new Date().toISOString();
  const mutateIssueBodyFn = deps.mutateIssueBody || mutateIssueBody;

  return mutateIssueBodyFn({
    issueNumber,
    repo,
    deps,
    mutate: (base) => {
      const signals = readDeepDiveSignals(base);
      let next = base;

      // 1. Prose + heading: when prose is provided AND the section is
      //    absent, author the full block (heading + posted marker + prose)
      //    via `buildDeepDiveBlock` to preserve the canonical byte-shape.
      if (prose !== undefined && !signals.hasHeading) {
        const block = buildDeepDiveBlock({ ts: stamp, appendix: prose });
        next = insertDeepDiveBlock(next, block);
      } else if (prose !== undefined && signals.hasHeading) {
        // 1b. Prose + existing heading: when the section is below the
        //     size-bucketed floor, append the prose to the end of the
        //     section (line before the next `##`/`###` heading or end of
        //     body) WITHOUT duplicating the heading. When the section is
        //     already at/above the floor, prose is ignored.
        const floor = pickDeepDiveFloor(next);
        // Skip append when the prose body is already substring-present —
        // preserves idempotence under re-run with the same `prose` argument.
        const proseAlreadyPresent = next.includes(String(prose).trim());
        if (signals.sectionChars < floor && !proseAlreadyPresent) {
          next = appendProseToDeepDiveSection(next, prose);
        }
        // After append (or no-op), still honor the posted-marker request
        // path below if marker is missing.
        if (wantPosted && !POSTED_RE.test(next)) {
          const match = DEEP_DIVE_HEADING_RE.exec(next);
          if (match) {
            const marker = `<!-- aitm-deep-dive-posted: ${stamp} -->`;
            next = `${next.slice(0, match.index)}${marker}\n\n${next.slice(match.index)}`;
          }
        }
      } else if (wantPosted && !signals.hasPosted) {
        // 2. Posted marker only path: section exists, marker missing.
        //    Inject the marker immediately above the existing heading.
        const match = DEEP_DIVE_HEADING_RE.exec(next);
        if (!match) {
          throw new DeepDiveSectionMissingError(
            `ensureDeepDive: issue #${issueNumber} body has no \`## Deep-Dive Analysis\` heading — pass \`prose\` to author the section or call \`ensureDeepDive\` after the section is in place`
          );
        }
        const marker = `<!-- aitm-deep-dive-posted: ${stamp} -->`;
        next = `${next.slice(0, match.index)}${marker}\n\n${next.slice(match.index)}`;
      }

      // 3. Complete marker. Delegate to `markers.insertDeepDiveCompleteMarker`
      //    which places the marker immediately before the field-DB block.
      if (wantComplete && !COMPLETE_RE.test(next)) {
        const insertFn = deps.insertDeepDiveCompleteMarker || insertDeepDiveCompleteMarker;
        next = insertFn(next, stamp);
      }

      return next;
    },
  });
}
