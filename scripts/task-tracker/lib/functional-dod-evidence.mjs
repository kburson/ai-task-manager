// #303 — Functional DoD evidence markers: every box ticked in the
// `#### Functional (verified at Test)` subsection must carry a hidden marker
// proving the verification was actually run. The checkbox is the visible
// sign-off; the marker is the evidence trail.
//
// Key classification:
//   - 'stampable' (tests, lint, commits): a verifier command runs in a sandbox
//     and stamps `<!-- aitm-dod-evidence:KEY cmd="…" exit=0 sha=… ts=… -->`
//     onto the item line. The `dod-stamp` verb owns this path.
//   - 'derived'   (acs, checkboxes): truth is computed from the rest of the
//     body — all AC checkboxes ticked / all non-self / non-derived checkboxes
//     ticked. `verbs/close.mjs` derives + stamps these last, immediately before
//     its pre-flight gate.
//
// `verbs/check.mjs` gates every Functional DoD tick: a `dod:functional:KEY`
// line without an `aitm-dod-evidence:KEY` marker refuses to flip. Batches are
// atomic — if any line in the batch fails the gate, the whole batch refuses.

import { locateFunctionalSection } from './lifecycle-dod.mjs';
import { unescapeValue } from './marker-grammar.mjs';
import {
  parseProofMarker,
  hasExecutionProof,
  extractVerifiedCommands,
  upsertProofMarker,
} from './proof-marker.mjs';

export const KEY_CLASSIFICATION = Object.freeze({
  tests: 'stampable',
  lint: 'stampable',
  commits: 'stampable',
  acs: 'derived',
  checkboxes: 'derived',
});

export const STAMPABLE_KEYS = Object.freeze(
  Object.keys(KEY_CLASSIFICATION).filter((k) => KEY_CLASSIFICATION[k] === 'stampable')
);

export const DERIVED_KEYS = Object.freeze(
  Object.keys(KEY_CLASSIFICATION).filter((k) => KEY_CLASSIFICATION[k] === 'derived')
);

const KEY_MARKER_RE = /<!--\s*dod:functional:([a-z0-9-]+)\s*-->/i;
// Legacy half-quoted colon form (read-only back-compat until the #369 corpus
// sweep): key folded into the marker NAME via `:<key>`, exit/sha/ts bare.
const EVIDENCE_LEGACY_RE =
  /<!--\s*aitm-dod-evidence:([a-z0-9-]+)\s+cmd="([^"]*)"\s+exit=(-?\d+)\s+sha=([^\s]+)\s+ts=([^\s]+)\s*-->/i;
// New consolidated property form (#379, parent epic #367): every value
// double-quoted, the key folded into a `key="..."` property, one comment.
const EVIDENCE_NEW_RE =
  /<!--\s*aitm-dod-evidence\s+((?:[a-zA-Z0-9_-]+="(?:[^"]|&quot;)*"\s*)+)-->/i;
// "Any form" matcher — detect / strip / replace-in-place EITHER shape.
const EVIDENCE_ANY_RE = /<!--\s*aitm-dod-evidence(?::[a-z0-9-]+)?\s[\s\S]*?-->/i;
const NEW_ATTR_RE = /([a-zA-Z0-9_-]+)="((?:[^"]|&quot;)*)"/g;
const BOX_RE = /^(\s*- \[)([ x])(\]\s+)(.+)$/;

// #481 — `cmd` is the persistent declaration component (read regardless of
// run-props), so this delegates to the shared extractor. The pre-#481 local copy
// guarded on `hasExecutionProof`, which broke once run-props were upserted onto
// the same `aitm-verified` marker.
function extractCommands(text) {
  return extractVerifiedCommands(text);
}

function parseEvidence(text) {
  const src = String(text || '');
  // New fully-quoted property form first.
  const nm = src.match(EVIDENCE_NEW_RE);
  if (nm) {
    const props = {};
    for (const a of String(nm[1]).matchAll(NEW_ATTR_RE)) {
      props[a[1]] = unescapeValue(a[2]);
    }
    // Strict canonical form only: all of key/cmd/exit/sha/ts must be present
    // and exit numeric — a partial fragment does not count as evidence.
    if (props.key == null || props.cmd == null || props.sha == null || props.ts == null) {
      return null;
    }
    const exit = Number(props.exit);
    if (!Number.isFinite(exit)) return null;
    return {
      key: String(props.key).toLowerCase(),
      cmd: props.cmd,
      exit,
      sha: props.sha,
      ts: props.ts,
    };
  }
  // Legacy half-quoted colon form.
  const m = src.match(EVIDENCE_LEGACY_RE);
  if (!m) return null;
  return {
    key: m[1].toLowerCase(),
    cmd: m[2],
    exit: Number(m[3]),
    sha: m[4],
    ts: m[5],
  };
}

// #481 — read a Functional line's run-evidence. The single-marker form keeps
// run-props (`cmd`/`exit`/`sha`/`ts`) on the line's `aitm-verified` marker while
// the `dod:functional:<key>` tag stays separate (the key is NOT folded in, per
// the Refine decision), so the key is supplied by the caller from that tag.
// Falls back to the legacy sibling `aitm-dod-evidence` marker (read-only
// back-compat until the #369 corpus sweep). Returns `{key,cmd,exit,sha,ts}` or
// null when the line carries no run proof yet (a declaration-only line).
function parseFunctionalEvidence(text, key) {
  const src = String(text || '');
  if (hasExecutionProof(src)) {
    const props = parseProofMarker(src);
    if (props && typeof props.cmd === 'string' && props.sha != null && props.ts != null) {
      const exit = Number(props.exit);
      return {
        key: String(key).toLowerCase(),
        cmd: props.cmd,
        exit: Number.isFinite(exit) ? exit : 0,
        sha: props.sha,
        ts: props.ts,
      };
    }
  }
  return parseEvidence(src);
}

// Parse every `dod:functional:KEY`-keyed checkbox in the Functional subsection.
// Returns objects keyed by the marker — items without a marker (legacy/custom
// templates) are skipped.
export function parseFunctionalDodKeys(body) {
  const src = String(body || '');
  const loc = locateFunctionalSection(src);
  if (!loc) return [];
  const sectionStart = loc.before.length;
  const lines = src.split('\n');
  const sectionStartLine = src.slice(0, sectionStart).split('\n').length - 1;
  const sectionEndLine = src.slice(0, loc.before.length + loc.section.length).split('\n').length;
  const out = [];
  for (let i = sectionStartLine; i < sectionEndLine && i < lines.length; i += 1) {
    const line = lines[i];
    const box = line.match(BOX_RE);
    if (!box) continue;
    const rest = box[4];
    const km = rest.match(KEY_MARKER_RE);
    if (!km) continue;
    out.push({
      key: km[1].toLowerCase(),
      lineIndex: i,
      checked: box[2] === 'x',
      label: rest
        .replace(KEY_MARKER_RE, '')
        .replace(EVIDENCE_ANY_RE, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim(),
      evidenceCommands: extractCommands(rest),
      evidenceMarker: parseFunctionalEvidence(rest, km[1]),
      classification: KEY_CLASSIFICATION[km[1].toLowerCase()] || null,
    });
  }
  return out;
}

export function findEvidenceMarker(body, key) {
  const items = parseFunctionalDodKeys(body);
  const match = items.find((it) => it.key === String(key).toLowerCase());
  return match ? match.evidenceMarker : null;
}

// #481 — Idempotently record a run on the `dod:functional:KEY` line by upserting
// run-props (`exit`/`sha`/`ts`) onto the line's existing `aitm-verified`
// declaration — the single-expandable marker. The `dod:functional:<key>` tag is
// left in place as the locator; NO sibling `aitm-dod-evidence` is written, and
// any legacy sibling on the line is stripped so a migrated line ends with
// exactly one marker. When the line has no declaration (e.g. derived acs/
// checkboxes lines), the upsert seeds `cmd` from the evidence so the resulting
// marker still carries a command record. Returns the (possibly-unchanged) body.
// Throws on unknown key or when the keyed line is absent.
export function stampEvidenceMarker(body, key, evidence) {
  const k = String(key || '').toLowerCase();
  if (!(k in KEY_CLASSIFICATION)) {
    throw new Error(`stampEvidenceMarker: unknown functional DoD key "${key}"`);
  }
  const { cmd, sha, ts, exit } = evidence || {};
  if (typeof cmd !== 'string' || typeof sha !== 'string' || typeof ts !== 'string') {
    throw new Error('stampEvidenceMarker: evidence requires { cmd, sha, ts, exit }');
  }
  const exitN = Number.isFinite(exit) ? Number(exit) : 0;

  const src = String(body || '');
  const lines = src.split('\n');
  const items = parseFunctionalDodKeys(src);
  const target = items.find((it) => it.key === k);
  if (!target) {
    throw new Error(`stampEvidenceMarker: no dod:functional:${k} line found`);
  }
  const line = lines[target.lineIndex];
  // Strip any legacy sibling marker first, then upsert run-props onto the
  // line's `aitm-verified` marker (preserving its persistent `cmd` declaration).
  const stripped = line
    .replace(EVIDENCE_ANY_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+$/, '');
  const hasDecl = /<!--\s*aitm-verified\s/.test(stripped);
  const props = { exit: String(exitN), sha: String(sha), ts: String(ts) };
  if (!hasDecl) props.cmd = String(cmd);
  const next = upsertProofMarker(stripped, props);
  if (next === line) return src;
  lines[target.lineIndex] = next;
  return lines.join('\n');
}

// Parse Acceptance Criteria checkbox state. Returns { total, ticked, allTicked }.
// AC heading match is generous: `## Acceptance Criteria` or `### Acceptance Criteria`.
const AC_HEADING_RE = /^#{1,4}\s+Acceptance Criteria\b[^\n]*$/im;
const SECTION_END_RE = /^(#{1,4}\s|<!--\s*aitm-fields:)/m;

function locateAcSection(body) {
  const src = String(body || '');
  const m = src.match(AC_HEADING_RE);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = src.slice(start);
  const end = rest.match(SECTION_END_RE);
  const endIdx = end ? start + end.index : src.length;
  return { start, end: endIdx, section: src.slice(start, endIdx) };
}

export function deriveAcsStatus(body) {
  const loc = locateAcSection(body);
  if (!loc) return { total: 0, ticked: 0, allTicked: false, sectionPresent: false };
  let total = 0;
  let ticked = 0;
  const re = /^- \[([ x])\]\s+(.+)$/gm;
  let m;
  while ((m = re.exec(loc.section)) !== null) {
    total += 1;
    if (m[1] === 'x') ticked += 1;
  }
  return { total, ticked, allTicked: total > 0 && ticked === total, sectionPresent: true };
}

// Tally every non-self, non-derived checkbox in the body. Self-reference
// (`dod:functional:checkboxes`) and the other derived key (`dod:functional:acs`)
// are excluded so the count is meaningful at the moment close() stamps the
// derived keys.
//
// Lifecycle boxes are excluded when `lifecyclePresent` is true — they are owned
// by approve/close and would either pre-tick (regression) or remain unticked at
// the moment of derivation.
export function deriveCheckboxesStatus(body, { lifecyclePresent = false } = {}) {
  const src = String(body || '');
  const lines = src.split('\n');
  // Mark line ranges that are excluded from the tally.
  const skip = new Set();

  // #481 (routed from #480) — exclude lines inside fenced code blocks so an
  // example checkbox shown in a ```fence``` no longer false-counts toward the
  // derived `checkboxes` total. Matches the completeness-gate scanner in
  // review.mjs. A fence opens/closes on a line whose first non-space content is
  // ``` or ~~~ (≥3); the fence lines themselves are skipped too.
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      skip.add(i);
      inFence = !inFence;
      continue;
    }
    if (inFence) skip.add(i);
  }

  if (lifecyclePresent) {
    const lcStart = src.match(/^#{3,4}\s+Lifecycle\b[^\n]*$/im);
    if (lcStart) {
      const startIdx = lcStart.index + lcStart[0].length;
      const rest = src.slice(startIdx);
      const endRel = rest.match(SECTION_END_RE);
      const endIdx = endRel ? startIdx + endRel.index : src.length;
      const startLine = src.slice(0, startIdx).split('\n').length - 1;
      const endLine = src.slice(0, endIdx).split('\n').length;
      for (let i = startLine; i < endLine; i += 1) skip.add(i);
    }
  }

  let total = 0;
  let ticked = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (skip.has(i)) continue;
    const box = lines[i].match(BOX_RE);
    if (!box) continue;
    const rest = box[4];
    const km = rest.match(KEY_MARKER_RE);
    if (km) {
      const k = km[1].toLowerCase();
      // Exclude the two derived keys: counting them would be self-referential
      // (checkboxes counts itself) or order-dependent (acs ticks before
      // checkboxes derives).
      if (k === 'checkboxes' || k === 'acs') continue;
    }
    total += 1;
    if (box[2] === 'x') ticked += 1;
  }
  return { total, ticked, allTicked: total > 0 && ticked === total };
}
