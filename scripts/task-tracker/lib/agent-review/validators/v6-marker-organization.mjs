// Agent Review Gate — V6 marker-organization normalizer (#815, epic #808).
//
// The only *normalizer* in the suite. V1–V5 are pure `validate` members; V6
// rewrites the body into a canonical marker layout and returns it via
// `normalized` so the registry adopts it (see registry.mjs `runAll`: a
// `typeof res.normalized === 'string'` result is threaded into every
// subsequent validator and the normalizer is re-run on its own output). V6
// fails only when normalization is impossible.
//
// The canonical layout:
//   - The state/version markers — `aitm-last-known-state`, `aitm-state`,
//     `aitm-body-version` (also tolerating `aitm-issue-version` / the bare
//     `issue-version` the design spec names) — are hoisted to the very top of
//     the body, in that fixed order, one per line.
//   - Every OTHER standalone `aitm-*` marker is gathered under the
//     `## AITM Progress Markers` anchor heading, in original document order.
//
// Organizable vs. untouchable — the safety rule. Only a *standalone marker
// line* is organized: a line whose entire trimmed content is a single
// `<!-- aitm-<name> … -->` comment. This structurally excludes every INLINE
// marker (an `aitm-verified`/`id=`/`dod:` comment sharing a line with an AC
// checkbox, a Verification-Commands row, or a Definition-of-Done item) and
// every non-`aitm-` comment (e.g. the multi-line DoD instruction block), so
// the normalizer can never corrupt AC/VC/DoD semantics by relocating a marker
// bound to visible content.
//
// Idempotency. `runAll` re-validates on the normalized body and `validate` is
// a pure function of `body`, so `normalize(normalize(x)) === normalize(x)` is
// required. Guaranteed by the fixed preamble order, the document-order gather,
// and returning `normalized` only when the result actually differs from the
// input (an already-canonical body yields a plain `{ pass: true }`).
//
// Marker safety. V6 MOVES markers, never deletes them, so every invariant
// marker survives relocation (no `MarkerLossError` when the review verb
// persists the normalized body) and no execution-proof marker is introduced.
//
// Consumes `context.body` — the raw issue-body string. Pure, no side effects.

import { registry } from '../registry.mjs';
import { findReviewFailureBlockSpan } from '../../review-failure-block.mjs';
import { maskFencedCodeBlocksPreservingOffsets } from '../../markers.mjs';

// A line that is EXACTLY one `<!-- aitm-<name> … -->` comment (ignoring
// surrounding whitespace). `name` is captured so we can classify hoist vs.
// gather. Inline markers never match — the leading `^\s*` + trailing `\s*$`
// anchors demand the comment be the whole line.
const STANDALONE_MARKER_RE = /^\s*<!--\s*(aitm-[a-z0-9-]+)\b[\s\S]*?-->\s*$/i;

// #994 — the `aitm-review-failed:start` / `-meta` / `:end` triple brackets
// ordinary prose (the failure explanation + bullet list) between its
// endpoints. Each of the three lines independently matches
// `STANDALONE_MARKER_RE`, so without this exception they get gathered to the
// anchor heading individually, leaving the bracketed prose orphaned at the
// block's old location once `clearReviewFailed` only finds an empty span at
// the markers' new, adjacent position. Detected structurally by its start/end
// line pair and treated as one opaque, untouched span: none of its lines
// (including the bracketed prose) participate in hoist/gather classification.
// The `## AITM Progress Markers` anchor heading (exactly level-2).
const ANCHOR_HEADING_RE = /^##\s+AITM Progress Markers\b[^\n]*$/im;

// State/version marker names hoisted to the top, in this fixed emission order.
// `aitm-body-version` is the live version marker; `aitm-issue-version` and the
// bare `issue-version` from the design spec are tolerated for forward-compat.
const HOIST_ORDER = ['aitm-last-known-state', 'aitm-state', 'aitm-body-version'];
const HOIST_ALIASES = {
  'aitm-body-version': ['aitm-body-version', 'aitm-issue-version', 'issue-version'],
  'aitm-last-known-state': ['aitm-last-known-state'],
  'aitm-state': ['aitm-state'],
};
// Flat set of every name that hoists.
const HOIST_NAMES = new Set(
  Object.values(HOIST_ALIASES)
    .flat()
    .map((n) => n.toLowerCase())
);

function hoistRank(name) {
  const lower = String(name).toLowerCase();
  for (let i = 0; i < HOIST_ORDER.length; i += 1) {
    if (HOIST_ALIASES[HOIST_ORDER[i]].some((a) => a.toLowerCase() === lower)) return i;
  }
  return -1;
}

export function validate({ body } = {}) {
  const src = typeof body === 'string' ? body : '';
  const maskedSrc = maskFencedCodeBlocksPreservingOffsets(src);

  // Normalization needs the anchor heading to gather non-hoist markers under.
  if (!ANCHOR_HEADING_RE.test(maskedSrc)) {
    return {
      pass: false,
      failures: ["normalization impossible: '## AITM Progress Markers' anchor heading absent"],
    };
  }

  const lines = src.split('\n');
  const maskedLines = maskedSrc.split('\n');
  const anchorSourceIdx = maskedLines.findIndex((line) => ANCHOR_HEADING_RE.test(line));
  const hoist = []; // { name, text }
  const gather = []; // { text }
  const kept = []; // { text, sourceIndex } — non-marker lines, in place

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const maskedLine = maskedLines[i] ?? '';
    // #1111 — shared fence masking preserves every newline/offset while
    // replacing fenced content with spaces. Classification must consult the
    // masked line, but rebuilding always keeps the original bytes. Checking
    // this before review-failure span detection prevents a fenced example
    // start marker from making the rest of the live body opaque.
    if (maskedLine !== line) {
      kept.push({ text: line, sourceIndex: i });
      continue;
    }
    const reviewFailureSpan = findReviewFailureBlockSpan(lines, {
      fromIndex: i,
      requireStartAt: true,
      includeUnterminated: true,
    });
    if (reviewFailureSpan) {
      for (let j = i; j <= reviewFailureSpan.end; j += 1) {
        kept.push({ text: lines[j], sourceIndex: j });
      }
      i = reviewFailureSpan.end;
      continue;
    }
    const m = STANDALONE_MARKER_RE.exec(maskedLine);
    if (!m) {
      kept.push({ text: line, sourceIndex: i });
      continue;
    }
    const name = m[1].toLowerCase();
    const text = line.trim();
    if (HOIST_NAMES.has(name)) hoist.push({ name, text });
    else gather.push({ text });
  }

  // Stable-sort the hoist markers into canonical order; document order breaks
  // ties within a rank (JS sort is stable).
  hoist.sort((a, b) => hoistRank(a.name) - hoistRank(b.name));

  // Re-emit the gather markers under the anchor heading. Walk `kept` and, at
  // the anchor heading line, drop in the gathered markers (blank-line
  // separated) before continuing with the rest of the kept content.
  const anchorIdx = kept.findIndex((entry) => entry.sourceIndex === anchorSourceIdx);
  const rebuilt = [];
  const preamble = hoist.map((h) => h.text);
  for (let i = 0; i < kept.length; i += 1) {
    rebuilt.push(kept[i].text);
    if (i === anchorIdx) {
      for (const g of gather) {
        rebuilt.push('');
        rebuilt.push(g.text);
      }
    }
  }

  // Assemble: preamble (state/version) then the rebuilt body. A single blank
  // line separates the preamble from the first body line when a preamble
  // exists.
  const head = preamble.length ? `${preamble.join('\n')}\n\n` : '';
  let normalized = `${head}${rebuilt.join('\n')}`;

  // Collapse any run of 3+ blank lines the extraction may have opened up, so
  // re-runs converge to a fixed point regardless of the input's blank spacing.
  normalized = normalized.replace(/\n{3,}/g, '\n\n');

  if (normalized === src) {
    return { pass: true, failures: [] };
  }
  return { pass: true, failures: [], normalized };
}

export const markerOrganizationValidator = {
  id: 'marker-organization',
  describe: () =>
    'V6: hoist state/version markers to the top and gather all other hidden markers under AITM Progress Markers (normalizer)',
  validate,
};

registry.register(markerOrganizationValidator);

export default markerOrganizationValidator;
