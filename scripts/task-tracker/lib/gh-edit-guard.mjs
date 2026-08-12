// cspell:ignore optout
// Diff-based protection for `gh issue edit/create ... --body-file <path>` and
// `gh issue edit/create ... --body "<text>"` commands.
//
// Refuses writes that would:
//   * Introduce a deprecated visible-checkbox line (replaced by hidden marker).
//   * Drop a hidden marker that is present in the current issue body (edit only).
//
// Pure logic — caller injects body sources so this is fully unit-testable.

import { formatStageBoundRefusal, hasStageBoundGrandfather } from './stage-bound-reason.mjs';
import { appendDefectHint } from './defect-hint.mjs';

const ISSUE_EDIT_RE = /\bgh\s+issue\s+edit\s+(?:#)?(\d+)\b/;
const ISSUE_URL_NUMBER_RE = /github\.com\/[\w.-]+\/[\w.-]+\/issues\/(\d+)\b/i;
const ISSUE_API_ENDPOINT_RE = /\brepos\/[\w.-]+\/[\w.-]+\/issues\/(\d+)\b/i;
const ISSUE_API_PATCH_METHOD_RE = /(?:-X\s*|--method(?:=|\s+))PATCH\b/i;
const API_ASSIGNEE_FIELD_RE = /(?:^|\s)(?:-f|--field|-F|--raw-field)\s+['"]?assignees(?:\[\])?=/i;
const API_INPUT_RE = /(?:^|\s)--input(?:=|\s+)/;
const GRAPHQL_ASSIGNEE_MUTATION_RE =
  /\b(?:addAssigneesToAssignable|removeAssigneesFromAssignable)\b|\bassigneeIds\b/i;
const ISSUE_CREATE_RE = /\bgh\s+issue\s+create\b/;
const BODY_FILE_RE = /--body-file\s+(\S+)/;
const BODY_INLINE_RE = /--body\s+(['"])((?:\\.|(?!\1).)*?)\1/;

// #659 AC1 — `gh api` issue-creation interception. `gh issue create` is already
// refused above, but the equivalent low-level `gh api` calls slip past:
//   * REST:    gh api repos/<owner>/<repo>/issues -f title=... -F body=@file
//   * GraphQL: gh api graphql -f query='mutation { createIssue(... ) { ... } }'
// Both create an issue with zero tether/template enforcement. These regexes run
// against the RAW command (not the quote-stripped form) so the GraphQL mutation
// body and field flags inside quotes are visible.
const GH_API_RE = /\bgh\s+api\b/;
const GH_API_GRAPHQL_RE = /\bgraphql\b/;
const GH_API_CREATE_MUTATION_RE = /createIssue\s*\(/i;
// The REST create endpoint is `repos/<owner>/<repo>/issues` EXACTLY. The
// negative lookahead `(?![\w/])` excludes `.../issues/<n>` (single-issue
// GET/PATCH) and any longer word such as `.../issues-archive`, while allowing a
// trailing `?query`, quote, or whitespace.
const GH_API_ISSUES_ENDPOINT_RE = /\brepos\/[^\s/'"]+\/[^\s/'"]+\/issues(?![\w/])/;
// Explicit method flag: `-X POST`, `-XPOST`, `--method POST`, `--method=POST`.
const GH_API_METHOD_RE = /(?:--method[=\s]+|-X\s*)([A-Za-z]+)/;
// Any field flag implies a POST when no explicit method is given (mirrors gh's
// own rule). `--input` reads a JSON body file; all imply a write.
const GH_API_FIELD_FLAG_RE = /(?:^|\s)(?:-f|--field|-F|--raw-field|--input)\b/;

const LEGACY_PATTERNS = [
  {
    name: 'Plan approved by human checkbox',
    re: /^[ \t]*- \[[ x]\] Plan approved by human\s*$/im,
    advice:
      'Replaced by hidden <!-- aitm-plan-approved: ... --> marker. Let the /task approve verb manage it.',
  },
  {
    name: 'Deep dive complete checkbox',
    re: /^[ \t]*- \[[ x]\] Deep dive complete\s*$/im,
    advice:
      'Replaced by hidden <!-- aitm-deep-dive-complete: ... --> marker. Let the /task ensureChecked verb manage it.',
  },
];

const MARKER_PATTERNS = [
  // Widened (#378) to detect both the legacy colon marker and the new single
  // property marker `aitm-last-known-state state="..." ts="..."`. The `-ts:`
  // legacy companion is deliberately NOT matched here (the `:` branch requires
  // a `:` immediately after `state`, and `state=` requires a space then
  // `state="`), so the drop-detector keys only on the state marker.
  { name: 'aitm-last-known-state', re: /<!--\s*aitm-last-known-state(?:\s*:|\s+state=")/i },
  // Widened (#375) to detect both legacy colon and new `ts="..."` grammars.
  { name: 'aitm-plan-approved', re: /<!--\s*aitm-plan-approved(?:\s*:|\s+ts=")/i },
  { name: 'aitm-deep-dive-complete', re: /<!--\s*aitm-deep-dive-complete(?:\s*:|\s+ts=")/i },
  // #887 — mirrors the `INVARIANT_MARKER_PATTERNS` entry. Without this line an
  // external `gh issue edit --body` would strip the reconciliation marker past
  // the Bash-level guard, silently un-reconciling an epic.
  { name: 'aitm-epic-ac-reconciled', re: /<!--\s*aitm-epic-ac-reconciled(?:\s*:|\s+ts=")/i },
  {
    name: 'aitm-unauthorized-close',
    re: /<!--\s*aitm-unauthorized-close(?:\s*:|\s+(?:tx|ts)=")/i,
  },
  // #888 — mirrors the `INVARIANT_MARKER_PATTERNS` entry. This registry is
  // presence-based, so it catches the removal of the LAST strike rather than
  // each individual one; the count-kind invariant inside `mutateIssueBody` is
  // what catches a partial drop. Presence here is still load-bearing: without
  // it, an external `gh issue edit --body` could erase the whole record of
  // dropped scope past the Bash-level guard.
  { name: 'aitm-ac-struck', re: /<!--\s*aitm-ac-struck\b/i },
  { name: 'aitm-review-approved', re: /<!--\s*aitm-review-approved(?:\s*:|\s+ts=")/i },
  // Widened (#380) to protect both legacy colon and new `ts="..."` grammars.
  { name: 'aitm-full-auto-approved', re: /<!--\s*aitm-full-auto-approved(?:\s*:|\s+ts=")/i },
  { name: 'aitm-full-auto-footnote:start', re: /<!--\s*aitm-full-auto-footnote:start\s*-->/i },
  { name: 'aitm-full-auto-footnote:end', re: /<!--\s*aitm-full-auto-footnote:end\s*-->/i },
  { name: 'aitm-fields', re: /<!--\s*aitm-fields:/i },
  { name: 'aitm-body-version', re: /<!--\s*aitm-body-version(?:\s*:|\s+version=")/i },
  { name: 'aitm-stage-rollup', re: /<!--\s*aitm-stage-rollup:/i },
  { name: 'aitm-refinement-rationale', re: /<!--\s*aitm-refinement-rationale:/i },
  { name: 'aitm-lifecycle-optout', re: /<!--\s*aitm-lifecycle-optout:/i },
  // Widened (#381) to protect both legacy colon CSV and new `refs="..."` grammars.
  { name: 'aitm-blocked-by', re: /<!--\s*aitm-blocked-by(?:\s*:|\s+refs=")/i },
  // #476 — append-only session-reference chain; presence backstop against an
  // external `gh issue edit` dropping the family.
  { name: 'aitm-session-ref', re: /<!--\s*aitm-session-ref\s+sid="/i },
  // #1191 — presence backstop for append-only issue-resident worktree history.
  { name: 'aitm-worktree-location', re: /<!--\s*aitm-worktree-location\s+worktree="/i },
];

const DEEP_DIVE_HEADING_RE = /^##\s+Deep-Dive Analysis\b/im;
const DEEP_DIVE_MARKER_RE = /<!--\s*aitm-deep-dive-complete(?:\s*:|\s+ts=")/i;

// #301 — banned sub-section headings inside Deep-Dive `<details>` blocks.
// These three headings each bear a gate; mirroring them inside the appendix
// lets the author tick boxes the gate cannot see, and creates a wrong-target
// hazard for `String.replace` body mutations (the #294 bug).
const DETAILS_BLOCK_RE = /<details\b[^>]*>([\s\S]*?)<\/details>/gi;
const FENCED_CODE_RE = /(^|\n)(?:```|~~~)[\s\S]*?(?:```|~~~)(?=\n|$)/g;
const BANNED_HEADING_RE =
  /^#{2,4}\s+(Acceptance Criteria|Verification Commands|Definition of Done)\s*$/im;

// Locate a banned heading inside any `<details>...</details>` block of `body`.
// Strips fenced code blocks inside the details content before scanning so a
// heading-shaped string inside a code fence is not flagged. Returns
// `{ heading, line }` (1-indexed line in the FULL body) of the first hit,
// or `null` if none.
export function findDeepDiveEmbeddedCheckboxHeading(body) {
  const src = String(body || '');
  DETAILS_BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = DETAILS_BLOCK_RE.exec(src)) !== null) {
    const inner = m[1] || '';
    const blockStart = m.index + m[0].indexOf(inner);
    // Mask fenced-code-block ranges with spaces (preserve offsets so the
    // line number we report still aligns with the original body).
    const masked = inner.replace(FENCED_CODE_RE, (s) => s.replace(/[^\n]/g, ' '));
    const lines = masked.split('\n');
    let offset = blockStart;
    for (let i = 0; i < lines.length; i++) {
      const lineMatch = BANNED_HEADING_RE.exec(lines[i]);
      if (lineMatch) {
        const headingText = lineMatch[1];
        // Line number in the full body: count newlines from start up to offset.
        const lineNumber = src.slice(0, offset).split('\n').length;
        return { heading: headingText, line: lineNumber };
      }
      offset += lines[i].length + 1; // +1 for newline
    }
  }
  return null;
}

function deepDiveEmbeddedCheckboxRefusal({ issueNumber, hit, action }) {
  const where = issueNumber ? ` on #${issueNumber}` : '';
  return (
    `${action}${where} introduces a banned "${hit.heading}" heading at line ${hit.line} inside a \`<details>\` block (deep-dive-embedded-checkbox-section).\n` +
    `  Deep-Dive Analysis appendices may contain only narrative material. Acceptance Criteria, Verification Commands, and Definition of Done belong in their root-level sections (the gates only see the root). Move the items to the root section and reference them in appendix prose.`
  );
}

// State-marker drop/staleness protection (#258). The state mutators write
// `aitm-last-known-state`, `aitm-last-known-state-ts`, and one
// `aitm-entered-<stage>` per stage visited, atomically into the LIVE body. A
// stale frozen scratch re-pushed by the manual agent flow reverts those — the
// exact clobber observed twice in #257. These helpers let `checkBodyChange`
// refuse such a push at the only choke point that sees the manual flow.
// Captures the stage name from both the legacy `aitm-entered-<stage>[-N]:`
// form and the new `aitm-entered-<stage>[-N] ts="..."` property form (#374).
const ENTERED_STAGE_RE = /<!--\s*aitm-entered-([a-z]+(?:-[a-z]+)*)(?:-\d+)?(?:\s*:|\s+ts=")/gi;
// Stale-snapshot ts reader widened (#378) to extract the timestamp from BOTH
// the legacy `aitm-last-known-state-ts:` marker and the new single property
// marker `aitm-last-known-state state="..." ts="..."`.
const LAST_KNOWN_STATE_TS_RE = /<!--\s*aitm-last-known-state-ts:\s*([^>]+?)\s*-->/i;
const LAST_KNOWN_STATE_NEW_TS_RE =
  /<!--\s*aitm-last-known-state\s+state="[^"]*"\s+ts="([^"]*)"\s*-->/i;

function enteredStages(body) {
  const set = new Set();
  for (const m of String(body || '').matchAll(ENTERED_STAGE_RE)) {
    // Preserve raw historical stage identity. These audit markers are
    // append-only; a canonical alias may be added but cannot replace one.
    set.add(m[1].toLowerCase());
  }
  return set;
}

function lastKnownStateTs(body) {
  const s = String(body || '');
  // New single-marker grammar takes precedence over the legacy pair.
  const neu = s.match(LAST_KNOWN_STATE_NEW_TS_RE);
  if (neu) return neu[1].trim();
  const m = s.match(LAST_KNOWN_STATE_TS_RE);
  return m ? m[1].trim() : null;
}

// #849 — split a Bash command string into individual command segments so a flag
// on one command is never attributed to another. Cuts at any UNQUOTED `;`, `&&`,
// `||`, `|`, `&`, newline, or `$(`; inside a single- or double-quoted region
// those bytes are ordinary text (`--body-file "a;b.md"` stays one segment).
//
// `bash-guard.mjs` already segments this way for the move-state invocation guard
// (#675) and the commit assignee-lock (#769), but both split the quote-STRIPPED
// command. The entry points here are called with the RAW command — `evaluateGhCreate`
// must read body text that lives inside quotes — so the segmenter is quote-aware
// itself rather than relying on pre-stripping.
export function splitCommandSegments(command) {
  const s = String(command || '');
  const segments = [];
  let current = '';
  let quote = null;
  let i = 0;

  const flush = () => {
    segments.push(current);
    current = '';
  };

  while (i < s.length) {
    const c = s[i];

    if (quote) {
      current += c;
      // A backslash escape only suppresses the closing quote in double quotes;
      // inside single quotes bash treats it literally.
      if (c === '\\' && quote === '"' && i + 1 < s.length) {
        current += s[i + 1];
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }

    if (c === "'" || c === '"') {
      quote = c;
      current += c;
      i += 1;
      continue;
    }

    // `$(` opens a nested command — evaluate its contents as their own segment.
    if (c === '$' && s[i + 1] === '(') {
      flush();
      i += 2;
      continue;
    }

    if (c === '&' && s[i + 1] === '&') {
      flush();
      i += 2;
      continue;
    }
    if (c === '|' && s[i + 1] === '|') {
      flush();
      i += 2;
      continue;
    }
    if (c === ';' || c === '|' || c === '&' || c === '\n') {
      flush();
      i += 1;
      continue;
    }

    current += c;
    i += 1;
  }
  flush();

  return segments;
}

function shellWords(segment) {
  const words = [];
  let word = '';
  let quote = '';
  let escaped = false;
  for (const char of String(segment || '')) {
    if (escaped) {
      word += char;
      escaped = false;
    } else if (char === '\\' && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (char === quote) quote = '';
      else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (/\s/.test(char)) {
      if (word) words.push(word);
      word = '';
    } else {
      word += char;
    }
  }
  if (word) words.push(word);
  return words;
}

function ghArgs(segment) {
  const words = shellWords(segment);
  const index = words.findIndex((word) => /(?:^|\/)gh$/.test(word));
  return index < 0 ? null : words.slice(index + 1);
}

// #849 — locate the body-write flag WITHIN a single segment. Callers must pass
// one segment, never a whole chain.
function parseBodySource(segment) {
  const fileMatch = segment.match(BODY_FILE_RE);
  if (fileMatch) return { source: 'file', path: fileMatch[1] };
  const inlineMatch = segment.match(BODY_INLINE_RE);
  if (inlineMatch) return { source: 'inline', body: inlineMatch[2] };
  return { source: 'none' };
}

// Returns the parse of the FIRST `gh issue edit` segment that carries a body
// flag, falling back to the first `gh issue edit` segment at all. Pre-#849 this
// scanned the whole command string for `--body*`, so a neighboring command's
// flag produced a refusal that was false of the edit it named.
export function parseGhIssueEdit(command) {
  let fallback = null;
  for (const segment of splitCommandSegments(command)) {
    const m = segment.match(ISSUE_EDIT_RE);
    if (!m) continue;
    const issueNumber = Number(m[1]);
    const body = parseBodySource(segment);
    if (body.source !== 'none') return { issueNumber, ...body };
    if (!fallback) fallback = { issueNumber, source: 'none' };
  }
  return fallback;
}

export function parseGhIssueCreate(command) {
  let fallback = null;
  for (const segment of splitCommandSegments(command)) {
    if (!ISSUE_CREATE_RE.test(segment)) continue;
    const body = parseBodySource(segment);
    if (body.source !== 'none') return body;
    if (!fallback) fallback = { source: 'none' };
  }
  return fallback;
}

// #659 AC1 — classify a `gh api` command as an issue-creation attempt.
// Returns 'rest' for a POST to `repos/<owner>/<repo>/issues`, 'graphql' for a
// `gh api graphql` command whose query contains a `createIssue(` selection, or
// null for everything else (GETs, `.../issues/<n>` edits, unrelated POSTs,
// non-issue endpoints, non-`gh api` commands). Pure and side-effect-free.
// #849 — classified per command segment, so a `-f`/`--body-file` flag on a
// neighboring command in the same chain cannot promote an innocent `gh api`
// GET into a "create".
export function classifyGhApiIssueCreate(command) {
  for (const cmd of splitCommandSegments(command)) {
    if (!GH_API_RE.test(cmd)) continue;
    // GraphQL createIssue mutation.
    if (GH_API_GRAPHQL_RE.test(cmd) && GH_API_CREATE_MUTATION_RE.test(cmd)) return 'graphql';
    // REST POST to the issues collection endpoint.
    if (GH_API_ISSUES_ENDPOINT_RE.test(cmd)) {
      const methodMatch = cmd.match(GH_API_METHOD_RE);
      const method = methodMatch ? methodMatch[1].toUpperCase() : null;
      const isPost = method ? method === 'POST' : GH_API_FIELD_FLAG_RE.test(cmd);
      if (isPost) return 'rest';
    }
  }
  return null;
}

// #659 AC1 — block verdict for `gh api` issue creation. Returns the SAME
// routing refusal as the `gh issue create` guard (pointing at
// scripts/gh/create-issue.mjs) so both paths are closed identically.
export function evaluateGhApiCreate({ command }) {
  const kind = classifyGhApiIssueCreate(command);
  if (!kind) return { block: false };
  const via =
    kind === 'graphql'
      ? 'a GraphQL `createIssue` mutation'
      : 'a REST POST to `repos/<owner>/<repo>/issues`';
  const reason =
    `Direct issue creation via \`gh api\` (${via}) is forbidden.\n` +
    `  This bypasses the create-issue.mjs wrapper (project tether, assignee/priority gates, template enforcement) exactly as a raw \`gh issue create\` would.\n` +
    `  Use \`scripts/gh/create-issue.mjs --shape <stub|epic|sub-issue|solo|defect>\` instead.`;
  return {
    block: true,
    reason: appendDefectHint(
      reason,
      'gh api issue create',
      'direct gh api issue creation refused; route through create-issue.mjs'
    ),
  };
}

export function checkNewBody({ newBody }) {
  const src = String(newBody || '');
  for (const { name, re, advice } of LEGACY_PATTERNS) {
    if (re.test(src)) {
      return {
        block: true,
        reason:
          `gh issue create would introduce deprecated "${name}".\n` +
          `  ${advice}\n` +
          `  Strip the line from your draft before creating.`,
      };
    }
  }
  if (DEEP_DIVE_HEADING_RE.test(src) && !DEEP_DIVE_MARKER_RE.test(src)) {
    return {
      block: true,
      reason:
        `gh issue create includes a "## Deep-Dive Analysis" section without the <!-- aitm-deep-dive-complete: ts --> marker.\n` +
        `  Include the marker (presence-only, carries a timestamp) so re-open does not regenerate the deep dive.`,
    };
  }
  const embedded = findDeepDiveEmbeddedCheckboxHeading(src);
  if (embedded) {
    return {
      block: true,
      reason: deepDiveEmbeddedCheckboxRefusal({ hit: embedded, action: 'gh issue create' }),
    };
  }
  return { block: false };
}

export function checkBodyChange({ newBody, currentBody, issueNumber, currentState }) {
  const src = String(newBody || '');
  const cur = String(currentBody || '');

  // #281 — Refine-state stage-bound gate: refuse edits that introduce
  // Plan-stage artifacts (Deep-Dive heading or aitm-deep-dive-complete marker)
  // while the issue is still in `refine`. Grandfather: an
  // `aitm-stage-bound-grandfather` marker on the live body bypasses the gate.
  if (currentState === 'refine' && !hasStageBoundGrandfather(cur)) {
    const addsHeading = DEEP_DIVE_HEADING_RE.test(src) && !DEEP_DIVE_HEADING_RE.test(cur);
    const addsMarker = DEEP_DIVE_MARKER_RE.test(src) && !DEEP_DIVE_MARKER_RE.test(cur);
    if (addsHeading || addsMarker) {
      return {
        block: true,
        reason: formatStageBoundRefusal({
          state: 'refine',
          action: addsHeading
            ? 'introducing a `## Deep-Dive Analysis` section'
            : 'introducing an `aitm-deep-dive-complete` marker',
          nextVerb: '/task promote',
          nextState: 'plan',
          issueNumber,
        }),
      };
    }
  }

  for (const { name, re, advice } of LEGACY_PATTERNS) {
    if (re.test(src) && !re.test(cur)) {
      return {
        block: true,
        reason:
          `gh issue edit on #${issueNumber} would introduce deprecated "${name}".\n` +
          `  ${advice}\n` +
          `  Strip the line from your draft before writing.`,
      };
    }
  }

  for (const { name, re } of MARKER_PATTERNS) {
    if (re.test(cur) && !re.test(src)) {
      return {
        block: true,
        reason:
          `gh issue edit on #${issueNumber} would drop hidden marker <${name}> that is present in the current body.\n` +
          `  This marker tracks verb completion. Re-fetch the current body, edit it in place, and re-write — do not replace wholesale.`,
      };
    }
  }

  // #258 — drop of any `aitm-entered-<stage>` marker present in the live body.
  // Stage is variable, so this is a set-diff rather than a single regex in
  // MARKER_PATTERNS. A stale scratch frozen before a stage transition will be
  // missing the stages stamped in the interim.
  const curEntered = enteredStages(cur);
  const srcEntered = enteredStages(src);
  for (const stage of curEntered) {
    if (!srcEntered.has(stage)) {
      return {
        block: true,
        reason:
          `gh issue edit on #${issueNumber} would drop hidden marker <aitm-entered-${stage}> that is present in the current body.\n` +
          `  This marker records a stage transition written by the state machine. Re-fetch the current body, edit it in place, and re-write — do not re-push a stale scratch.`,
      };
    }
  }

  // #258 — stale-snapshot staleness check. The state mutators only ever advance
  // `aitm-last-known-state-ts`. A push whose ts is strictly older than the live
  // body's ts is therefore based on a stale snapshot — it would revert state
  // values and drop entered markers stamped after the scratch was frozen (the
  // #257 clobber). This single check is vector-agnostic: it catches value
  // reverts, entered-marker drops, and any stale re-push without needing
  // state-machine knowledge.
  const curTs = lastKnownStateTs(cur);
  const srcTs = lastKnownStateTs(src);
  if (curTs && srcTs) {
    const curMs = Date.parse(curTs);
    const srcMs = Date.parse(srcTs);
    if (!Number.isNaN(curMs) && !Number.isNaN(srcMs) && srcMs < curMs) {
      return {
        block: true,
        reason:
          `gh issue edit on #${issueNumber} is based on a stale snapshot: the body's aitm-last-known-state-ts (${srcTs}) is older than the live body's (${curTs}).\n` +
          `  A state mutator advanced the live body after this scratch was frozen. Re-fetch the current body, re-apply your edit, and re-write — do not re-push the stale scratch (this is the #257 clobber).`,
      };
    }
  }

  // #301 — refuse bodies whose Deep-Dive `<details>` appendix embeds a
  // gate-bearing sub-section heading (Acceptance Criteria / Verification
  // Commands / Definition of Done). Only flag NEW embeddings — grandfather
  // any heading already present in the live body so legacy issues remain
  // editable. The operator strips the embedded section and reattempts.
  {
    const embeddedNew = findDeepDiveEmbeddedCheckboxHeading(src);
    if (embeddedNew) {
      const embeddedCur = findDeepDiveEmbeddedCheckboxHeading(cur);
      const introduced =
        !embeddedCur ||
        embeddedCur.heading !== embeddedNew.heading ||
        embeddedCur.line !== embeddedNew.line;
      if (introduced) {
        return {
          block: true,
          reason: deepDiveEmbeddedCheckboxRefusal({
            issueNumber,
            hit: embeddedNew,
            action: 'gh issue edit',
          }),
        };
      }
    }
  }

  // Adding a `## Deep-Dive Analysis` section without the corresponding hidden
  // marker leaves a re-open vulnerability: the next pickup would not detect
  // marker presence and would regenerate the deep dive.
  if (
    DEEP_DIVE_HEADING_RE.test(src) &&
    !DEEP_DIVE_HEADING_RE.test(cur) &&
    !DEEP_DIVE_MARKER_RE.test(src)
  ) {
    return {
      block: true,
      reason:
        `gh issue edit on #${issueNumber} adds a "## Deep-Dive Analysis" section without the <!-- aitm-deep-dive-complete: ts --> marker.\n` +
        `  Run \`/task ensureChecked "Deep dive complete"\` to write the marker, or include it directly in the body. Heading-without-marker leaves the issue vulnerable to deep-dive regeneration on re-open.`,
    };
  }

  return { block: false };
}

// Edit guard. `gh issue edit` resolves via exactly two live exits: a
// `source === 'none'` pass-through (label/title/assignee edits carry no body)
// and the #361 hard refusal of `--body` / `--body-file`. Every legitimate
// body write goes through `mutateIssueBody`, which fetches the live body in
// the same transaction and runs the marker-loss invariant — so a direct
// `gh issue edit --body*` from Bash is always refused here, regardless of
// content. (#566 removed the former post-refusal diff block: it was
// unreachable behind the hard refusal and harboured a `currentBody = ''`
// fail-open. The diff logic survives, exercised via `mutateIssueBody`, in the
// exported `checkBodyChange`.)
export function evaluateGhEdit({ command }) {
  // #1212 — direct assignee mutation is an ownership-state bypass. It skips
  // the issue lock, lifecycle-aware preconditions, exact-singleton read-back,
  // transfer provenance, and audit comment enforced by the governed verbs.
  // Internal adapters use execFile and do not traverse this Bash hook.
  for (const segment of splitCommandSegments(command)) {
    const args = ghArgs(segment);
    if (!args) continue;
    const issueIndex = args.indexOf('issue');
    if (
      issueIndex < 0 ||
      args[issueIndex + 1] !== 'edit' ||
      !args.some((arg) => /^--(?:add|remove)-assignee(?:=|$)/.test(arg))
    )
      continue;
    const match =
      segment.match(ISSUE_EDIT_RE) ||
      segment.match(ISSUE_URL_NUMBER_RE) ||
      segment.match(/\b(\d+)\b/);
    const issueNumber = match ? Number(match[1]) : null;
    return {
      block: true,
      reason:
        `Direct assignee mutation${issueNumber ? ` on #${issueNumber}` : ''} is forbidden.\n` +
        `  Use the governed ownership verbs (\`npx aitm assign${issueNumber ? ` ${issueNumber}` : ''} --to <login|@me>\`, ` +
        `\`npx aitm transfer${issueNumber ? ` ${issueNumber}` : ''} --to <login|@me>\`, or ` +
        `\`npx aitm unassign${issueNumber ? ` ${issueNumber}` : ''}\`) so exclusive ownership is locked, audited, and verified.`,
    };
  }

  for (const segment of splitCommandSegments(command)) {
    const args = ghArgs(segment);
    if (!args || !args.includes('api')) continue;
    const match = segment.match(ISSUE_API_ENDPOINT_RE);
    const writeMethod = args.some(
      (arg, index) =>
        /^(?:-X|--method=?)PATCH$/i.test(arg) ||
        (['-X', '--method'].includes(arg) && /^PATCH$/i.test(args[index + 1] || ''))
    );
    const assigneeField = args.some((arg) =>
      /^(?:-f|--field|-F|--raw-field)=?assignees(?:\[\])?=/i.test(arg)
    );
    if (
      !match ||
      (!writeMethod && !ISSUE_API_PATCH_METHOD_RE.test(segment)) ||
      (!assigneeField && !API_ASSIGNEE_FIELD_RE.test(segment) && !API_INPUT_RE.test(segment))
    )
      continue;
    return {
      block: true,
      reason:
        `Direct REST ownership mutation on #${Number(match[1])} is forbidden.\n` +
        `  Use the governed ownership verbs (\`npx aitm assign\`, \`transfer\`, or \`unassign\`) so the issue lock, lifecycle policy, audit, and exact read-back all run.`,
    };
  }

  for (const segment of splitCommandSegments(command)) {
    const args = ghArgs(segment);
    if (!args || !args.includes('api') || !args.includes('graphql')) continue;
    const hasOpaqueInput = args.some((arg) => arg === '--input' || arg.startsWith('--input='));
    if (!hasOpaqueInput && !GRAPHQL_ASSIGNEE_MUTATION_RE.test(segment)) continue;
    return {
      block: true,
      reason:
        'Direct GraphQL ownership mutation is forbidden.\n' +
        '  Use the governed ownership verbs (`npx aitm assign`, `transfer`, or `unassign`) so the issue lock, lifecycle policy, audit, and exact read-back all run.',
    };
  }

  const parsed = parseGhIssueEdit(command);
  if (!parsed || parsed.source === 'none') return { block: false };

  // #361 — hard refusal of `gh issue edit --body` / `--body-file` regardless
  // of diff content. The diff guard catches MOST clobbers, but a wholesale
  // body rewrite that happens to preserve every guarded marker still slips
  // through (e.g. a stale-but-marker-complete snapshot, an `[object Object]`
  // serialization, a script that hand-rolls the body). Every legitimate body
  // write in this repo goes through `mutateIssueBody`, which fetches the live
  // body inside the same transaction and runs the marker-loss invariant. A
  // direct `gh issue edit --body*` from agent Bash is always the wrong
  // contract.
  if (parsed.source === 'file' || parsed.source === 'inline') {
    const reason =
      `gh issue edit on #${parsed.issueNumber} uses --${parsed.source === 'file' ? 'body-file' : 'body'}; direct body writes from Bash are forbidden.\n` +
      `  Route every issue-body write through \`mutateIssueBody({issueNumber, repo, mutate})\` in scripts/task-tracker/lib/issue-body-mutate.mjs so the live body is fetched in the same transaction and the marker-loss invariant runs.\n` +
      `  #362 — body writes must also stamp a proof marker (\`<!-- aitm-verified-at: ... -->\` or \`<!-- aitm-dod-evidence: ... -->\`) on the SAME line as any newly-ticked checkbox; \`mutateIssueBody\` throws \`CheckboxProofMissingError\` otherwise. Pass \`allowUnverifiedTicks: true\` only for legitimate edge cases.\n` +
      `  See CLAUDE.md "Route issue bodies through scripts".`;
    // #498 — emit a machine-readable defect-hint trailer so the AI can offer a
    // pre-filled `/task report` if this refusal turns out to be a false block.
    return {
      block: true,
      reason: appendDefectHint(
        reason,
        'gh issue edit --body',
        'direct body write from Bash refused; route through mutateIssueBody'
      ),
    };
  }

  // `parseGhIssueEdit` only yields source ∈ {none, file, inline}; the two
  // returns above are exhaustive. Defensive default for a hypothetical future
  // body source — a non-body edit should pass.
  return { block: false };
}

// Wrapper for `gh issue create`. No current body — only legacy-introduction
// checks apply.
export function evaluateGhCreate({ command, readBodyFile }) {
  const parsed = parseGhIssueCreate(command);
  if (!parsed || parsed.source === 'none') return { block: false };

  let newBody;
  if (parsed.source === 'file') {
    try {
      newBody = readBodyFile(parsed.path);
    } catch {
      return { block: false };
    }
  } else {
    newBody = parsed.body;
  }
  if (newBody == null) return { block: false };

  return checkNewBody({ newBody });
}
