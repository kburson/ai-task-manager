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

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { mutateIssueBody } from './issue-body-mutate.mjs';
import { insertDeepDiveCompleteMarker } from './markers.mjs';
import { serializeMarker } from './marker-grammar.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { DEEP_DIVE_SIZE_FLOORS } from './body-gates.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

const pexec = promisify(execFile);

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

// Readers widened (#375) to accept BOTH the legacy colon grammar and the
// consolidated `ts="..."` property grammar. Legacy branch stays until #369.
const POSTED_RE = /<!--\s*aitm-deep-dive-posted(?::\s*[^>]*?|\s+ts="[^"]*")\s*-->/i;
const COMPLETE_RE = /<!--\s*aitm-deep-dive-complete(?::\s*[^>]*?|\s+ts="[^"]*")\s*-->/i;
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

// #331 — thrown by `mirrorDeepDiveFromComment` when the issue body already
// has a `## Deep-Dive Analysis` heading with hand-authored inline prose but
// no back-pointer to the comment we are about to mirror. Caller must
// reconcile manually (hand-merge or delete the inline prose) rather than
// risk silent overwrite.
export class DeepDiveAlreadyInlineError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DeepDiveAlreadyInlineError';
  }
}

// #301 — banned gate-bearing sub-section headings inside the deep-dive
// appendix. Mirrors `findDeepDiveEmbeddedCheckboxHeading` in `gh-edit-guard`
// but runs before any write so the operator gets the failure at the call
// site (TypeError with the heading name) rather than at the body chokepoint.
const APPENDIX_BANNED_HEADING_RE =
  /^#{2,4}\s+(Acceptance Criteria|Verification Commands|Definition of Done)\s*$/im;
const APPENDIX_FENCED_CODE_RE = /(^|\n)(?:```|~~~)[\s\S]*?(?:```|~~~)(?=\n|$)/g;

export function assertDeepDiveAppendixClean(appendix) {
  const stripped = String(appendix || '').replace(APPENDIX_FENCED_CODE_RE, '');
  const m = APPENDIX_BANNED_HEADING_RE.exec(stripped);
  if (m) {
    throw new TypeError(
      `deep-dive appendix may not contain "${m[1]}" — add the items to the root-level section instead`
    );
  }
}

export function buildDeepDiveBlock({ ts, appendix, date } = {}) {
  if (!ts) throw new Error('buildDeepDiveBlock: ts is required');
  if (!appendix || typeof appendix !== 'string') {
    throw new TypeError('buildDeepDiveBlock: appendix must be a non-empty string');
  }
  assertDeepDiveAppendixClean(appendix);
  const isoDate = date || String(ts).slice(0, 10);
  const marker = serializeMarker('deep-dive-posted', { ts });
  const heading = `## Deep-Dive Analysis (${isoDate})`;
  const trimmed = appendix.replace(/^\s+|\s+$/g, '');
  return `\n\n${marker}\n\n${heading}\n\n${trimmed}\n`;
}

// Locate insertion point. Prefer the end of the contiguous Pickup Directive
// block — the heading line plus its following `>` blockquote lines and any
// blank lines — stopping before the next `##` heading or other content
// (#700: the directive now sits right after `## Plan Metadata`, so the
// deep-dive block lands directly beneath it instead of at the body's tail).
// Fallback to before the `aitm-fields` JSON trailer. Last resort: end of body.
export function findInsertOffset(body) {
  const src = String(body || '');
  const pickup = PICKUP_HEADING_RE.exec(src);
  if (pickup) {
    const start = pickup.index + pickup[0].length;
    const rest = src.slice(start);
    const lineRe = /\n([^\n]*)/g;
    let end = start;
    let match;
    while ((match = lineRe.exec(rest))) {
      const line = match[1];
      if (/^\s*>/.test(line) || line.trim() === '') {
        end = start + lineRe.lastIndex;
        continue;
      }
      break;
    }
    return end;
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

// #504/#724 — replace the ENTIRE prose body of an existing `## Deep-Dive
// Analysis` section in place, rather than appending. The section body runs
// from the line AFTER the heading up to (but not including) whichever comes
// first: an `aitm-*` marker line (e.g. `aitm-entered-*`,
// `aitm-deep-dive-complete`, `aitm-fields`, `aitm-body-version`), or a `## `
// (level-2) heading OTHER than `## Dependency Map` — or end of body when
// neither follows. `## Dependency Map` is the canonical appendix's own
// sibling sub-section and stays inside the replaceable scope so re-posting
// revised findings with a fresh dependency list replaces the stale one
// instead of leaving it stranded below a heading-based boundary. Bounding on
// marker lines alone (#724) let the scan walk past any number of OTHER
// unrelated `##` sections (Acceptance Criteria, What I want, etc.) to reach a
// distant marker far downstream, silently deleting everything in between —
// confirmed live on #718. Stopping at any `## ` heading except `##
// Dependency Map` fixes that without truncating the canonical appendix.
// Plan approval may also wrap this section in `<details>`; its closing tag is
// a structural trailer, not replaceable prose, so it is an equally strong
// boundary. The heading line itself, the `aitm-deep-dive-posted` marker above
// it, and every wrapper/marker/section below are all preserved; only the prose
// (and old Dependency Map, if present) between them is swapped. Replace is
// idempotent: re-running with identical prose reproduces the same bytes, so
// `mutateIssueBody` short-circuits to a no-op.
const DEEP_DIVE_SECTION_END_RE = /^(?:<\/details>\s*$|<!--\s*aitm-|##\s+(?!Dependency Map\b))/im;

export function replaceDeepDiveSection(body, prose) {
  const src = String(body || '');
  const trimmed = String(prose || '').replace(/^\s+|\s+$/g, '');
  if (!trimmed) return src;
  const headingMatch = DEEP_DIVE_HEADING_DETECT_RE.exec(src);
  if (!headingMatch) return src;
  const headingLineEnd = src.indexOf('\n', headingMatch.index);
  const bodyStart = headingLineEnd === -1 ? src.length : headingLineEnd + 1;
  const rest = src.slice(bodyStart);
  DEEP_DIVE_SECTION_END_RE.lastIndex = 0;
  const endMatch = DEEP_DIVE_SECTION_END_RE.exec(rest);
  const sectionEnd = endMatch ? bodyStart + endMatch.index : src.length;
  const before = src.slice(0, bodyStart);
  const after = src.slice(sectionEnd);
  return after ? `${before}\n${trimmed}\n\n${after}` : `${before}\n${trimmed}\n`;
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
  const marker = serializeMarker('deep-dive-posted', { ts });
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
    // #725 — declare this write's legitimate section-replace intent to the
    // unbounded-deletion guardrail in `mutateIssueBody`. `replaceDeepDiveSection`
    // swaps the deep-dive prose in place and may legitimately drop the nested
    // `## Dependency Map` sub-section and shrink the body when re-posting
    // revised (shorter) findings. Every OTHER `## ` heading stays outside this
    // allowlist, so the guard still fires if a boundary-scan regression
    // re-introduces the #718/#724 walk-past bug and eats an unrelated section.
    expectedRemovedHeadings: ['Dependency Map'],
    allowLargeShrink: true,
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
        // 1b. Prose + existing heading: REPLACE the section body in place
        //     (#504). The heading line (position), the posted marker above
        //     it, and any trailer markers below are preserved; only the
        //     prose between them is swapped. Idempotent — re-posting
        //     identical prose reproduces the same bytes → no-op.
        assertDeepDiveAppendixClean(prose);
        next = replaceDeepDiveSection(next, prose);
        // After replace, still honor the posted-marker request path below
        // if the marker is missing.
        if (wantPosted && !POSTED_RE.test(next)) {
          const match = DEEP_DIVE_HEADING_RE.exec(next);
          if (match) {
            const marker = serializeMarker('deep-dive-posted', { ts: stamp });
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
        const marker = serializeMarker('deep-dive-posted', { ts: stamp });
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

// #331 — parse a `fromComment` argument into a numeric comment id. Accepts:
//   - raw numeric id: `4640885208`
//   - hash-prefixed: `#issuecomment-4640885208`
//   - full URL: `https://github.com/<owner>/<repo>/issues/<n>#issuecomment-4640885208`
// Returns the numeric id as a string. Throws on unparseable input.
export function parseFromCommentArg(input) {
  if (input == null) {
    throw new Error('parseFromCommentArg: input is required');
  }
  const s = String(input).trim();
  if (!s) throw new Error('parseFromCommentArg: empty input');
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/issuecomment[-_]?(\d+)/i);
  if (m) return m[1];
  throw new Error(
    `parseFromCommentArg: cannot extract comment id from "${input}" — expected raw id, #issuecomment-<id>, or full URL`
  );
}

// #331 — strip a leading top-level heading from a comment body before it is
// mirrored into the issue body. Removes any of:
//   - `## Deep-Dive Analysis [(...)]`
//   - `## Plan Deep-Dive Analysis [(...)]`
//   - `## Deep Dive [(...)]`
// (case-insensitive, optional date/parenthetical suffix). Subordinate
// `###` headings inside the prose are preserved. Returns the trimmed body.
export function stripLeadingDeepDiveHeading(body) {
  const src = String(body || '');
  const re = /^\s*##\s+(?:plan\s+)?deep[-\s]dive(?:\s+analysis)?\b.*\n+/i;
  return src.replace(re, '').replace(/^\s+/, '');
}

// #331 — default comment fetcher. Reads `body` + `html_url` from the
// REST issue-comments endpoint. Injectable via `deps.fetchCommentBody` for
// tests.
async function defaultFetchCommentBody({ repo, commentId }) {
  const [owner, repoName] = String(repo).split('/');
  if (!owner || !repoName) {
    throw new Error(`fetchCommentBody: invalid repo "${repo}" — expected owner/name`);
  }
  const { stdout } = await pexec(
    'gh',
    ['api', `repos/${owner}/${repoName}/issues/comments/${commentId}`, '--jq', '{body,html_url}'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`fetchCommentBody: failed to parse gh api response: ${err.message}`);
  }
  return { body: parsed.body || '', url: parsed.html_url || '' };
}

// #331 — mirror a comment-authored deep-dive into the issue body.
//
// Sibling to `ensureDeepDive`: that one stamps signals when prose is already
// inline; this one fetches prose from a GitHub comment, mirrors it under the
// canonical `## Deep-Dive Analysis (<date>)` heading with a back-pointer to
// the source comment, and stamps both posted + complete markers — all in a
// single `mutateIssueBody` transaction.
//
// Idempotency: re-invocation against a body that already has both markers,
// the heading, AND the back-pointer URL short-circuits to
// `{ status: 'no-op' }`.
//
// Conflict refusal: if the body already has a `## Deep-Dive Analysis`
// heading but lacks the posted marker AND lacks the back-pointer URL, the
// helper throws `DeepDiveAlreadyInlineError` — a hand-authored inline deep
// dive exists and overwriting it silently would lose work.
export async function mirrorDeepDiveFromComment({
  issueNumber,
  repo,
  fromComment,
  ts,
  deps = {},
} = {}) {
  if (issueNumber == null) throw new Error('mirrorDeepDiveFromComment: issueNumber is required');
  if (!repo) throw new Error('mirrorDeepDiveFromComment: repo is required');
  if (fromComment == null) {
    throw new Error('mirrorDeepDiveFromComment: fromComment is required');
  }
  const commentId = parseFromCommentArg(fromComment);
  const stamp = ts || new Date().toISOString();
  const fetchFn = deps.fetchCommentBody || defaultFetchCommentBody;
  const mutateIssueBodyFn = deps.mutateIssueBody || mutateIssueBody;

  const { body: rawCommentBody, url: commentUrl } = await fetchFn({ repo, commentId });
  if (!rawCommentBody || !rawCommentBody.trim()) {
    return { status: 'refused', reason: 'empty-comment-body' };
  }
  const stripped = stripLeadingDeepDiveHeading(rawCommentBody).trim();
  if (!stripped) {
    return { status: 'refused', reason: 'empty-after-strip' };
  }

  const backpointer =
    `> Mirrored from comment #issuecomment-${commentId} (${commentUrl}). ` +
    `Comment is the diff-history canonical; this body copy is the gate-canonical source.`;
  const appendix = `${backpointer}\n\n${stripped}`;

  const result = await mutateIssueBodyFn({
    issueNumber,
    repo,
    deps,
    mutate: (base) => {
      const signals = readDeepDiveSignals(base);
      const hasBackpointer = base.includes(`#issuecomment-${commentId}`);

      // 1. Idempotent no-op: heading + posted marker + back-pointer all present.
      if (signals.hasHeading && signals.hasPosted && hasBackpointer) {
        let next = base;
        if (!signals.hasComplete) {
          const insertFn = deps.insertDeepDiveCompleteMarker || insertDeepDiveCompleteMarker;
          next = insertFn(next, stamp);
        }
        return next;
      }

      // 2. Conflict: heading present, no posted marker, no back-pointer.
      //    Hand-authored inline deep dive exists — refuse rather than overwrite.
      if (signals.hasHeading && !signals.hasPosted && !hasBackpointer) {
        throw new DeepDiveAlreadyInlineError(
          `mirrorDeepDiveFromComment: issue #${issueNumber} body has a hand-authored ` +
            `\`## Deep-Dive Analysis\` section but no back-pointer to comment ` +
            `#issuecomment-${commentId}. Reconcile manually (hand-merge or delete the ` +
            `inline prose) before re-running.`
        );
      }

      // 3. Heading present but back-pointer absent AND posted marker present:
      //    treat as already-mirrored from a DIFFERENT comment. No-op rather
      //    than appending a second mirror block.
      if (signals.hasHeading && signals.hasPosted && !hasBackpointer) {
        return base;
      }

      // 4. Author canonical block (heading + back-pointer + comment prose).
      let next = base;
      const block = buildDeepDiveBlock({ ts: stamp, appendix });
      next = insertDeepDiveBlock(next, block);

      // 5. Complete marker.
      if (!COMPLETE_RE.test(next)) {
        const insertFn = deps.insertDeepDiveCompleteMarker || insertDeepDiveCompleteMarker;
        next = insertFn(next, stamp);
      }
      return next;
    },
  });

  if (result.status === 'no-op') {
    return { status: 'no-op' };
  }
  return { status: 'mirrored', commentId, url: commentUrl };
}
