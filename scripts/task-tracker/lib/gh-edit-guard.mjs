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

const ISSUE_EDIT_RE = /\bgh\s+issue\s+edit\s+(?:#)?(\d+)\b/;
const ISSUE_CREATE_RE = /\bgh\s+issue\s+create\b/;
const BODY_FILE_RE = /--body-file\s+(\S+)/;
const BODY_INLINE_RE = /--body\s+(['"])((?:\\.|(?!\1).)*?)\1/;

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
      'Replaced by hidden <!-- aitm-deep-dive-complete: ... --> marker. Let the /task check verb manage it.',
  },
];

const MARKER_PATTERNS = [
  { name: 'aitm-last-known-state', re: /<!--\s*aitm-last-known-state:/i },
  { name: 'aitm-plan-approved', re: /<!--\s*aitm-plan-approved:/i },
  { name: 'aitm-deep-dive-complete', re: /<!--\s*aitm-deep-dive-complete:/i },
  { name: 'aitm-review-approved', re: /<!--\s*aitm-review-approved:/i },
  { name: 'aitm-full-auto-approved', re: /<!--\s*aitm-full-auto-approved:/i },
  { name: 'aitm-full-auto-footnote:start', re: /<!--\s*aitm-full-auto-footnote:start\s*-->/i },
  { name: 'aitm-full-auto-footnote:end', re: /<!--\s*aitm-full-auto-footnote:end\s*-->/i },
  { name: 'aitm-fields', re: /<!--\s*aitm-fields:/i },
  { name: 'aitm-refinement-rationale', re: /<!--\s*aitm-refinement-rationale:/i },
  { name: 'aitm-lifecycle-optout', re: /<!--\s*aitm-lifecycle-optout:/i },
  { name: 'aitm-blocked-by', re: /<!--\s*aitm-blocked-by:/i },
];

const DEEP_DIVE_HEADING_RE = /^##\s+Deep-Dive Analysis\b/im;
const DEEP_DIVE_MARKER_RE = /<!--\s*aitm-deep-dive-complete:/i;

// State-marker drop/staleness protection (#258). The state mutators write
// `aitm-last-known-state`, `aitm-last-known-state-ts`, and one
// `aitm-entered-<stage>` per stage visited, atomically into the LIVE body. A
// stale frozen scratch re-pushed by the manual agent flow reverts those — the
// exact clobber observed twice in #257. These helpers let `checkBodyChange`
// refuse such a push at the only choke point that sees the manual flow.
const ENTERED_STAGE_RE = /<!--\s*aitm-entered-([a-z]+)\s*:/gi;
const LAST_KNOWN_STATE_TS_RE = /<!--\s*aitm-last-known-state-ts:\s*([^>]+?)\s*-->/i;

function enteredStages(body) {
  const set = new Set();
  for (const m of String(body || '').matchAll(ENTERED_STAGE_RE)) {
    set.add(m[1].toLowerCase());
  }
  return set;
}

function lastKnownStateTs(body) {
  const m = String(body || '').match(LAST_KNOWN_STATE_TS_RE);
  return m ? m[1].trim() : null;
}

export function parseGhIssueEdit(command) {
  const m = String(command || '').match(ISSUE_EDIT_RE);
  if (!m) return null;
  const issueNumber = Number(m[1]);
  const fileMatch = command.match(BODY_FILE_RE);
  if (fileMatch) return { issueNumber, source: 'file', path: fileMatch[1] };
  const inlineMatch = command.match(BODY_INLINE_RE);
  if (inlineMatch) return { issueNumber, source: 'inline', body: inlineMatch[2] };
  return { issueNumber, source: 'none' };
}

export function parseGhIssueCreate(command) {
  const cmd = String(command || '');
  if (!ISSUE_CREATE_RE.test(cmd)) return null;
  const fileMatch = cmd.match(BODY_FILE_RE);
  if (fileMatch) return { source: 'file', path: fileMatch[1] };
  const inlineMatch = cmd.match(BODY_INLINE_RE);
  if (inlineMatch) return { source: 'inline', body: inlineMatch[2] };
  return { source: 'none' };
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
        `  Run \`/task check "Deep dive complete"\` to write the marker, or include it directly in the body. Heading-without-marker leaves the issue vulnerable to deep-dive regeneration on re-open.`,
    };
  }

  return { block: false };
}

// Convenience wrapper: parses the command, resolves the body via injected
// readers, and runs the diff check. Returns { block: false } when the command
// is not a relevant `gh issue edit`, when the body can't be resolved, or when
// the diff is safe.
export function evaluateGhEdit({ command, readBodyFile, fetchCurrentBody, resolveCurrentState }) {
  const parsed = parseGhIssueEdit(command);
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

  let currentBody = '';
  try {
    currentBody = fetchCurrentBody(parsed.issueNumber) ?? '';
  } catch {
    currentBody = '';
  }

  let currentState;
  if (typeof resolveCurrentState === 'function') {
    try {
      currentState = resolveCurrentState(parsed.issueNumber) ?? undefined;
    } catch {
      currentState = undefined;
    }
  }

  return checkBodyChange({
    newBody,
    currentBody,
    issueNumber: parsed.issueNumber,
    currentState,
  });
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
