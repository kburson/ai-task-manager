// cspell:ignore nonpair
// Corpus marker-grammar migration transforms (#389 / C3 of EPIC #369).
//
// One pure, idempotent `(body) => body` transform per hidden-marker FAMILY that
// the #373-#382 work taught the WRITERS to emit in canonical `key="value"`
// grammar but left RESIDUAL in already-stored issue bodies in the legacy colon
// grammar. This library is the single place that rewrites a stored body from
// legacy → canonical. The C3 runner (`.tmp/heal/migrate-markers-corpus.mjs`)
// composes these in dry-run; the C4 runner (#390) drives the same chain live.
//
// Design contract (mirrored in #389's deep-dive):
//   * Each transform matches ONLY the legacy grammar of its family, so applying
//     the chain to an already-canonical body is a no-op — this is what makes the
//     dry-run safe to re-run and the C4 resume idempotent.
//   * Every single-line capture uses `[^>\n]`, never a lazy `[^>]*?` that could
//     run a capture across a newline and swallow an adjacent marker.
//   * Re-serialization goes through each family's own `serializeMarker`/`build*`
//     helper — we do NOT re-derive the canonical grammar here.
//   * The audit/approval transform decodes via the C1-fixed
//     `parseFullAutoApprovedMarker` (#387) so ISO-rich legacy payloads split
//     correctly.
//   * A JSON-payload guard keeps the deep-dive-complete transform away from the
//     structured `{...}`-verdict relics that C2 (#388) migrated out-of-band.
//
// Out-of-scope families are NEVER matched here: `aitm-fields` (JSON db),
// `aitm-stage-rollup`, `aitm-refinement-rationale`, `aitm-full-auto-footnote`
// (its own start/end block grammar), and any valueless flag marker.

import { serializeMarker } from '../../task-tracker/lib/marker-grammar.mjs';
import {
  buildFullAutoApprovedMarker,
  parseFullAutoApprovedMarker,
} from '../../task-tracker/lib/markers.mjs';
import { serializeProofMarker, parseProofMarker } from '../../task-tracker/lib/proof-marker.mjs';
import { buildHumanReviewerMarker } from '../../task-tracker/lib/human-reviewer-audit.mjs';

// A JSON-ish payload begins (after trim) with `{` — the structured deep-dive
// verdict relics C2 handled. The generic lifecycle transform must skip these.
function isJsonPayload(value) {
  return /^\s*\{/.test(String(value || ''));
}

// ---------------------------------------------------------------------------
// 1. stage-entry — `aitm-entered-<stage>[-<visit>]: <ts>` → ts="<ts>" (#374)
// ---------------------------------------------------------------------------
const ENTERED_LEGACY_RE = /<!--\s*aitm-entered-([a-z]+)(?:-(\d+))?:\s*([^>\n]+?)\s*-->/gi;

export function migrateStageEntry(body) {
  return String(body ?? '').replace(ENTERED_LEGACY_RE, (_m, stage, visit, ts) =>
    serializeMarker(`entered-${stage}${visit ? `-${visit}` : ''}`, { ts })
  );
}

// ---------------------------------------------------------------------------
// 2. re-entry audit — `aitm-reentry-audit: <stage>-<visit>` → stage/visit (#374)
// ---------------------------------------------------------------------------
const REENTRY_AUDIT_LEGACY_RE = /<!--\s*aitm-reentry-audit:\s*([a-z]+)-(\d+)\s*-->/gi;

export function migrateReentryAudit(body) {
  return String(body ?? '').replace(REENTRY_AUDIT_LEGACY_RE, (_m, stage, visit) =>
    serializeMarker('reentry-audit', { stage, visit })
  );
}

// ---------------------------------------------------------------------------
// 3. backfill audit — `aitm-backfill: <stage>:<reason>:<ts>` → props (#380)
//    Reason was `:`-sanitized at write time, so colon-splitting yields exactly
//    [stage, reason, ts].
// ---------------------------------------------------------------------------
const BACKFILL_LEGACY_RE = /<!--\s*aitm-backfill:\s*([a-z]+):([^>\n]*?):([^>\n]+?)\s*-->/gi;

export function migrateBackfill(body) {
  return String(body ?? '').replace(BACKFILL_LEGACY_RE, (_m, stage, reason, ts) =>
    serializeMarker('backfill', { stage, reason, ts })
  );
}

// ---------------------------------------------------------------------------
// 4. lifecycle timestamp — single-`ts` markers in legacy colon form (#375).
//    plan-approved, review-approved, deep-dive-posted, deep-dive-complete,
//    refine-complete. deep-dive-complete carries a JSON-payload guard.
// ---------------------------------------------------------------------------
const LIFECYCLE_TS_NAMES = [
  'plan-approved',
  'review-approved',
  'deep-dive-posted',
  'deep-dive-complete',
  'refine-complete',
];
const LIFECYCLE_TS_LEGACY_RE = new RegExp(
  `<!--\\s*aitm-(${LIFECYCLE_TS_NAMES.join('|')}):\\s*([^>\\n]*?)\\s*-->`,
  'gi'
);

export function migrateLifecycleTs(body) {
  return String(body ?? '').replace(LIFECYCLE_TS_LEGACY_RE, (m, name, ts) => {
    // JSON-payload guard: structured deep-dive-complete verdict relics are
    // left byte-untouched (C2 / #388 migrated those out-of-band).
    if (name === 'deep-dive-complete' && isJsonPayload(ts)) return m;
    return serializeMarker(name, { ts });
  });
}

// ---------------------------------------------------------------------------
// 5. body-version — `aitm-body-version: <N>` → version="<N>" (#376)
// ---------------------------------------------------------------------------
const BODY_VERSION_LEGACY_RE = /<!--\s*aitm-body-version:\s*(\d+)\s*-->/gi;

export function migrateBodyVersion(body) {
  return String(body ?? '').replace(BODY_VERSION_LEGACY_RE, (_m, version) =>
    serializeMarker('body-version', { version })
  );
}

// ---------------------------------------------------------------------------
// 6. sha:ts pair — `aitm-dod-verified: <sha>:<ts>` / `aitm-test-started: …`
//    → sha="<sha>" ts="<ts>" (#377)
//
//    #392 (C6) — the pair RE only matched the packed `<sha>:<ts>` value. Three
//    legacy non-pair shapes survived the C3 migration and showed up as residual:
//      * date-only:        `aitm-dod-verified: 2026-05-19`            → ts only
//      * date-time no sha:  `aitm-dod-verified: 2026-05-18T13:35:00Z`  → ts only
//      * space-joined sha:  `aitm-dod-verified: <ts> sha=<sha>`        → ts + sha
//    The pair RE runs FIRST and rewrites every packed value into canonical
//    `sha="…" ts="…"` (space-separated, no trailing colon after the name), so
//    the non-pair RE — which keys on the legacy `aitm-…:` colon form — never
//    re-matches an already-canonical marker. Both passes are idempotent.
// ---------------------------------------------------------------------------
const SHA_TS_LEGACY_RE =
  /<!--\s*aitm-(dod-verified|test-started):\s*([0-9a-f]{7,40}):([^>\s]+)\s*-->/gi;
const SHA_TS_NONPAIR_RE = /<!--\s*aitm-(dod-verified|test-started):\s*([^>\n]+?)\s*-->/gi;

export function migrateShaTsPair(body) {
  let out = String(body ?? '').replace(SHA_TS_LEGACY_RE, (_m, name, sha, ts) =>
    serializeMarker(name, { sha, ts })
  );
  out = out.replace(SHA_TS_NONPAIR_RE, (_m, name, value) => {
    const v = String(value).trim();
    // `<ts> sha=<sha>` — timestamp followed by an explicit `sha=` token.
    const withSha = v.match(/^(.*?)\s+sha=(\S+)$/);
    if (withSha) {
      return serializeMarker(name, { sha: withSha[2], ts: withSha[1].trim() });
    }
    // Bare timestamp / date — no sha component.
    return serializeMarker(name, { ts: v });
  });
  return out;
}

// ---------------------------------------------------------------------------
// 7. last-known-state pair-merge — two legacy markers
//      `aitm-last-known-state: <state>` + `aitm-last-known-state-ts: <ts>`
//    collapse into one `aitm-last-known-state state="…" ts="…"` (#378).
//    The two markers are written adjacently; tolerate intervening whitespace
//    (incl. one newline) without crossing into unrelated content.
// ---------------------------------------------------------------------------
const LAST_KNOWN_STATE_PAIR_RE =
  /<!--\s*aitm-last-known-state:\s*([^>\n]+?)\s*-->(\s*)<!--\s*aitm-last-known-state-ts:\s*([^>\n]+?)\s*-->/gi;

export function migrateLastKnownState(body) {
  return String(body ?? '').replace(LAST_KNOWN_STATE_PAIR_RE, (_m, state, _gap, ts) =>
    serializeMarker('last-known-state', { state, ts })
  );
}

// ---------------------------------------------------------------------------
// 8. evidence full-quote — `aitm-ac-evidence:<key> cmd="…" exit=N sha=X ts=Y`
//    and the identically-shaped `aitm-dod-evidence:<key> …`
//    → key/cmd/exit/sha/ts all double-quoted (#379).
// ---------------------------------------------------------------------------
const EVIDENCE_LEGACY_RE =
  /<!--\s*aitm-(ac-evidence|dod-evidence):([a-z0-9-]+)\s+cmd="((?:[^"]|&quot;)*)"\s+exit=(-?\d+)\s+sha=([^\s]+)\s+ts=([^\s]+)\s*-->/gi;

export function migrateEvidence(body) {
  return String(body ?? '').replace(EVIDENCE_LEGACY_RE, (_m, name, key, cmd, exit, sha, ts) =>
    serializeMarker(name, { key, cmd, exit, sha, ts })
  );
}

// ---------------------------------------------------------------------------
// 9. CSV-list blocked-by — `aitm-blocked-by: #5, #6` → refs="#5, #6" (#381)
// ---------------------------------------------------------------------------
const BLOCKED_BY_LEGACY_RE = /<!--\s*aitm-blocked-by:\s*([^>\n]*?)\s*-->/gi;

export function migrateBlockedBy(body) {
  return String(body ?? '').replace(BLOCKED_BY_LEGACY_RE, (_m, refs) =>
    serializeMarker('blocked-by', { refs })
  );
}

// ---------------------------------------------------------------------------
// 10. audit/approval — `aitm-full-auto-approved: <iso>:<signals>` → ts/signals
//     (#380). Decoded via the C1-fixed (#387) ISO-aware parser so a colon-rich
//     legacy timestamp is not mis-split.
// ---------------------------------------------------------------------------
const FULL_AUTO_APPROVED_LEGACY_RE = /<!--\s*aitm-full-auto-approved:\s*([^>\n]*?)\s*-->/gi;

export function migrateFullAutoApproved(body) {
  return String(body ?? '').replace(FULL_AUTO_APPROVED_LEGACY_RE, (m) => {
    const parsed = parseFullAutoApprovedMarker(m);
    if (!parsed) return m;
    return buildFullAutoApprovedMarker(parsed.ts, parsed.signals);
  });
}

// ---------------------------------------------------------------------------
// 11. human-reviewer audit — `aitm-human-reviewer: <handle> @ <ts>`
//     → handle="<handle>" ts="<ts>" (#380). A handle-only legacy payload
//     (no ` @ `) maps to ts="".
// ---------------------------------------------------------------------------
const HUMAN_REVIEWER_LEGACY_RE = /<!--\s*aitm-human-reviewer:\s*([^>\n]*?)\s*-->/gi;

export function migrateHumanReviewer(body) {
  return String(body ?? '').replace(HUMAN_REVIEWER_LEGACY_RE, (_m, payload) => {
    const idx = payload.indexOf(' @ ');
    const handle = (idx >= 0 ? payload.slice(0, idx) : payload).trim();
    const ts = idx >= 0 ? payload.slice(idx + 3).trim() : '';
    return buildHumanReviewerMarker(handle, ts);
  });
}

// ---------------------------------------------------------------------------
// 12. commits trail CSV-list — `aitm-commits: SHA1,SHA2` → shas="SHA1,SHA2"
//     (#381). SHAs are hex+comma (no `-`), so the legacy capture is safe.
// ---------------------------------------------------------------------------
const COMMITS_LEGACY_RE = /<!--\s*aitm-commits:\s*([^>\n]*?)\s*-->/gi;

export function migrateCommits(body) {
  return String(body ?? '').replace(COMMITS_LEGACY_RE, (_m, csv) =>
    serializeMarker('commits', {
      shas: csv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(','),
    })
  );
}

// ---------------------------------------------------------------------------
// 13. proof marker (#382) — legacy `aitm-verified-at:` / `aitm-verified-by:`
//     inline checkbox markers consolidate into one `aitm-verified key="…"`.
//     Line-scoped: a checkbox label can carry both legacy markers; we parse the
//     whole line, drop the legacy alias keys, and re-emit one consolidated
//     marker in their place (appended at the original tail position).
// ---------------------------------------------------------------------------
const PROOF_LEGACY_ANY_RE = /<!--\s*aitm-verified-(?:at|by):/i;
// #392 (C6) — a consolidated `aitm-verified` marker can still carry the LEGACY
// key names `verified-at=` / `verified-by=` (issues that closed before #382
// normalized the proof keys). The colon-form gate above never fires on these,
// so the line was skipped and the legacy-keyed marker left as residual. This
// gate catches the consolidated-with-legacy-keys form; `parseProofMarker`
// already normalizes the keys, so the migrate path below rewrites it cleanly.
const PROOF_LEGACY_CONSOLIDATED_RE = /<!--\s*aitm-verified\s[^>\n]*\b(?:verified-at|verified-by)=/i;
// The value is matched with a tempered token `(?:(?!-->).)*?` — "any non-newline
// char that does not begin the closing `-->`" — NOT `[^>\n]`. A marker value can
// legitimately contain `>` (e.g. a command with a `<child>` placeholder, as on
// #328). `[^>\n]` halted at that interior `>`, so the strip never reached `-->`:
// the legacy marker survived (permanent residual) AND the consolidated form was
// never deduped, so every `--live` run appended another copy (non-idempotent).
// `.` already excludes `\n`, keeping the match single-line; comment values can
// never contain `-->` (it would close the comment), so the tempered token is safe.
const PROOF_LEGACY_STRIP_RE = /\s*<!--\s*aitm-verified-(?:at|by):\s*(?:(?!-->).)*?-->/gi;
// An already-canonical consolidated marker on the same line. The `\s` boundary
// after `aitm-verified` excludes the legacy `-at`/`-by` names (next char `-`),
// so this strips ONLY the consolidated form.
const PROOF_CONSOLIDATED_STRIP_RE = /\s*<!--\s*aitm-verified\s(?:(?!-->).)*?-->/gi;

// A fenced-code-block delimiter (``` or ~~~, possibly indented / with an info
// string). Toggling on these lets the transform skip every line inside a fence.
const FENCE_DELIM_RE = /^\s*(?:```|~~~)/;
// Inline-code span on a single line. Redacting these before the legacy-marker
// test means a marker that exists ONLY inside backticks (documentation /
// example prose that quotes the marker grammar) is not mistaken for a real
// declaration. Mirrors `redactDocContexts`' inline-code rule, line-scoped.
// A span is a run of N backticks, the shortest content, then a matching run of N
// backticks (`\1`). Matching the run length lets a `` ``-delimited span legally
// CONTAIN single backticks — which is exactly how the marker grammar is quoted in
// prose, e.g. `` <!-- aitm-verified-by: `cmd` --> ``. A naive single-backtick
// regex stopped at the inner backticks, leaving the comment prefix exposed and
// re-corrupting that documentation on every run.
const INLINE_CODE_RE = /(`+)(.+?)\1/g;

// #420 — prose-safe discriminator. A line carries a REAL legacy proof marker
// only when the colon-form / consolidated-legacy-keys marker SURVIVES
// inline-code-span redaction. Callers additionally skip lines inside a fenced
// code block (tracked across lines in `migrateProofMarkers`). Without this the
// line-based transform corrupted documentation that merely *quotes* the legacy
// grammar in backticks, and — because it appended a fresh consolidated marker
// each run — was non-idempotent on that prose.
function lineHasLegacyProof(line) {
  const redacted = String(line).replace(INLINE_CODE_RE, '');
  return PROOF_LEGACY_ANY_RE.test(redacted) || PROOF_LEGACY_CONSOLIDATED_RE.test(redacted);
}

export function migrateProofMarkers(body) {
  const src = String(body ?? '');
  let inFence = false;
  return src
    .split('\n')
    .map((line) => {
      // Fence delimiters toggle the in-fence state and are themselves never
      // marker lines — leave them byte-untouched.
      if (FENCE_DELIM_RE.test(line)) {
        inFence = !inFence;
        return line;
      }
      // Inside a fenced code block every line is documentation, never a real
      // marker — leave it untouched (prose-safety, #420).
      if (inFence) return line;
      if (!lineHasLegacyProof(line)) return line;
      // Parse the ORIGINAL line (not the redacted form) so a backticked command
      // value inside the real marker is preserved.
      const props = parseProofMarker(line);
      if (!props) return line;
      // Drop the legacy alias keys; #382's normalizeProofKeys already mapped
      // them onto the canonical ts/cmd/sha contract.
      const { 'verified-at': _at, 'verified-by': _by, ...canonical } = props;
      // Strip BOTH the legacy at/by markers AND any pre-existing consolidated
      // marker on this line, then re-emit a single merged one. Without the
      // consolidated strip, a line carrying a legacy marker beside an existing
      // canonical one ends up with two `aitm-verified` markers.
      const stripped = line
        .replace(PROOF_LEGACY_STRIP_RE, '')
        .replace(PROOF_CONSOLIDATED_STRIP_RE, '');
      return `${stripped} ${serializeProofMarker(canonical)}`;
    })
    .join('\n');
}

// A checklist item line: `- [ ]` / `- [x]`, possibly indented. Genuine
// functional declaration / proof markers ONLY ever live on these lines
// (including `### Verification Commands` items, which are checklist lines).
const CHECKLIST_ITEM_RE = /^\s*- \[[ x]\] /;

// #421 — remove spurious appended consolidated `aitm-verified` markers from
// PROSE lines. Before #420 made `migrateProofMarkers` prose-safe, the #390 live
// corpus pass mistook backticked *example* mentions of the legacy
// `aitm-verified-by:` marker (in epic/docs bodies documenting the grammar) for
// real declarations: it stripped/garbled the example and APPENDED a consolidated
// `<!-- aitm-verified ... -->` marker to the end of the prose. Non-idempotent on
// prose, so some lines carry two or more. This transform reverses that damage.
//
// Discriminator (>95% confidence, empirically grounded over all corpus issues):
// on a line that is NOT a checklist item and NOT inside a fenced block, a bare
// consolidated `<!-- aitm-verified <space>... -->` comment lying OUTSIDE
// inline-code spans is ALWAYS spurious. Genuine markers live only on checklist
// lines. Placeholder-valued appended markers (e.g. `cmd="<short>"`) are likewise
// corruption here and must be stripped. The `\s` boundary after `aitm-verified`
// (in PROOF_CONSOLIDATED_STRIP_RE) means legacy `aitm-verified-by`/`-at`
// documentation TEXT is never matched. Corruption is always trailing-appended,
// so a trailing-trim after the strip restores the original line; a line that becomes
// whitespace-only *as a result of* the strip is dropped, but pre-existing blank
// lines are preserved.
function stripConsolidatedFromNonCode(line) {
  // A spurious marker's value can itself contain backticks (e.g.
  // `cmd="`npm test`"`), so we CANNOT simply preserve every inline-code span —
  // that would split the marker apart and leave it unmatched. Instead: find each
  // consolidated marker on the raw line, and keep it ONLY when its `<!--`
  // delimiter sits INSIDE an inline-code span (a genuine documentation mention
  // like `` `<!-- aitm-verified cmd="x" -->` ``). A marker whose delimiter is
  // bare is spurious — remove it, value-backticks and all.
  const codeRanges = [];
  INLINE_CODE_RE.lastIndex = 0;
  let cm;
  while ((cm = INLINE_CODE_RE.exec(line)) !== null) {
    codeRanges.push([cm.index, cm.index + cm[0].length]);
  }
  const startInCode = (i) => codeRanges.some(([s, e]) => i >= s && i < e);
  let out = '';
  let last = 0;
  let stripped = false;
  PROOF_CONSOLIDATED_STRIP_RE.lastIndex = 0;
  let mm;
  while ((mm = PROOF_CONSOLIDATED_STRIP_RE.exec(line)) !== null) {
    // The strip regex includes leading `\s*`; the real delimiter is the `<!--`.
    const markerStart = mm.index + mm[0].indexOf('<!--');
    if (startInCode(markerStart)) continue; // genuine in-code mention — keep
    out += line.slice(last, mm.index);
    last = mm.index + mm[0].length;
    stripped = true;
  }
  // No spurious marker on this line — return it byte-identical. Crucially, do NOT
  // trailing-trim an untouched line: a whitespace-only prose line (e.g. `"   "`) would
  // otherwise collapse to `""` and be dropped by the caller, shifting the body.
  if (!stripped) return line;
  out += line.slice(last);
  return out.replace(/\s+$/, '');
}

export function stripSpuriousProseMarkers(body) {
  const src = String(body ?? '');
  let inFence = false;
  const out = [];
  for (const line of src.split('\n')) {
    if (FENCE_DELIM_RE.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    // Fenced documentation and genuine checklist declarations are never touched.
    if (inFence || CHECKLIST_ITEM_RE.test(line)) {
      out.push(line);
      continue;
    }
    const cleaned = stripConsolidatedFromNonCode(line);
    if (cleaned === line) {
      out.push(line);
      continue;
    }
    // The strip changed the line. If what remains is whitespace-only, the line
    // was nothing but an appended marker (plus stripped trailing space) — drop
    // it. Otherwise keep the restored prose.
    if (cleaned.trim() === '') continue;
    out.push(cleaned);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Ordered, named transform chain. Order matters only for last-known-state
// (pair-merge must run before any generic single-marker pass could touch its
// halves — none does, but we keep the pair transform early for clarity). The
// `name` is what the runner tallies per-family.
// ---------------------------------------------------------------------------
export const FAMILIES = [
  { name: 'last-known-state', fn: migrateLastKnownState },
  { name: 'stage-entry', fn: migrateStageEntry },
  { name: 'reentry-audit', fn: migrateReentryAudit },
  { name: 'backfill', fn: migrateBackfill },
  { name: 'lifecycle', fn: migrateLifecycleTs },
  { name: 'body-version', fn: migrateBodyVersion },
  { name: 'sha-ts', fn: migrateShaTsPair },
  { name: 'evidence', fn: migrateEvidence },
  { name: 'blocked-by', fn: migrateBlockedBy },
  { name: 'commits', fn: migrateCommits },
  { name: 'full-auto-approved', fn: migrateFullAutoApproved },
  { name: 'human-reviewer', fn: migrateHumanReviewer },
  { name: 'proof', fn: migrateProofMarkers },
  { name: 'prose-cleanup', fn: stripSpuriousProseMarkers },
];

// Back-compat: bare ordered function list.
export const TRANSFORMS = FAMILIES.map((f) => f.fn);

// Apply every family transform in order. Pure and idempotent: re-running on an
// already-migrated body returns it unchanged.
export function migrateBody(body) {
  return FAMILIES.reduce((acc, f) => f.fn(acc), String(body ?? ''));
}

// Apply every family, returning the migrated body plus the names of families
// that actually changed it. Used by the runner for per-issue family tallies.
export function migrateBodyWithFamilies(body) {
  let cur = String(body ?? '');
  const families = [];
  for (const { name, fn } of FAMILIES) {
    const next = fn(cur);
    if (next !== cur) families.push(name);
    cur = next;
  }
  return { body: cur, families };
}
