// #721/#774 — detect + heal legacy verification-citation forms in the
// `## Acceptance Criteria` section into the epic's canonical by-id citation
// (`vc-list="vc:<id>"`). Parallel in shape to `heal-functional-dod.mjs`'s
// detect/heal pair, but scoped to `## Acceptance Criteria` and the vc-ref
// citation grammar (`vc-ref.mjs`) instead of the Functional DoD keyed template.
//
// A "legacy" AC (both forms #773's Refine-exit guardrail now forbids) is one
// whose `aitm-verified` marker either:
//   (a) embeds a raw backtick command — `cmd="`npm test`"`; or
//   (b) carries an ordinal citation — `cmd="vc:2"` (the interim form #721 first
//       emitted, before by-id resolution existed).
// Healing:
//   - id-stamps every `## Verification Commands` entry that lacks an id and
//     appends any genuinely-new commands (dedup by literal text), so by-id
//     resolution engages for the whole section;
//   - rewrites each legacy AC to `vc-list="vc:<id>"` (space-separated for a
//     multi-command AC), dropping the forbidden `cmd` attribute while
//     preserving any other marker props (e.g. the `key` AC digest).
//
// A post-Develop AC whose marker already carries run-props (`exit`/`sha`/`ts`/
// `evidence`) is verified proof and is left untouched (#774 AC-3) — rewriting
// it would strip evidence and trip `mutateIssueBody`'s MarkerLossError.
//
// Idempotent: an issue with no legacy citations reports `affected: false` and
// `healVcRefs` returns `{ changed: false }` unchanged (a converted marker
// carries `vc-list`, not `cmd`, so a second pass finds nothing).

import { parseProofMarker, upsertProofMarker } from './proof-marker.mjs';
import { parseVerificationCommands } from './verification-commands.mjs';
import { appendVcCommands, stampMissingVcIds } from './vc-emit.mjs';
import { parseVcRefIndexes } from './vc-ref.mjs';

const AC_HEADING_RE = /^#{1,4}\s+Acceptance Criteria\b[^\n]*$/im;
const SECTION_END_RE = /^(#{1,4}\s|<!--\s*aitm-fields:)/m;
const BOX_RE = /^(\s*- \[)([ x])(\]\s+)(.+)$/;

function locateAcSection(body) {
  const src = String(body || '');
  const m = src.match(AC_HEADING_RE);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = src.slice(start);
  const end = rest.match(SECTION_END_RE);
  const endIdx = end ? start + end.index : src.length;
  return { start, end: endIdx };
}

// A proof marker carries execution evidence when any record-of-run prop is
// present. Such a marker is verified proof (#774 AC-3) — never rewrite it.
function hasRunProps(props) {
  return !!props && ('exit' in props || 'sha' in props || 'ts' in props || 'evidence' in props);
}

// Scan the `## Acceptance Criteria` section for checkbox lines whose
// `aitm-verified` marker is a legacy citation form (embedded backtick command
// or ordinal `cmd="vc:<n>"`). Returns `{ affected, items }` where each item is
// `{ lineIndex, commands }` — `commands` is the item's resolved command list,
// in declared order.
export function detectLegacyAcCitations(body) {
  const src = String(body || '');
  const loc = locateAcSection(src);
  if (!loc) return { affected: false, items: [] };

  const vcItems = parseVerificationCommands(src);
  const lines = src.split('\n');
  const startLine = src.slice(0, loc.start).split('\n').length - 1;
  const endLine = src.slice(0, loc.end).split('\n').length;
  const items = [];

  for (let i = startLine; i < endLine && i < lines.length; i += 1) {
    const box = lines[i].match(BOX_RE);
    if (!box) continue;
    const rest = box[4];
    const props = parseProofMarker(rest);
    if (!props) continue;
    // AC-3: a verified (run-props) marker is left intact — no-op skip.
    if (hasRunProps(props)) continue;
    // Already migrated to the canonical by-id form.
    if (typeof props['vc-list'] === 'string') continue;
    if (typeof props.cmd !== 'string') continue;

    // Forbidden form (b): ordinal `cmd="vc:N"`. Resolve the cited commands by
    // ordinal against the current VC list; skip a dangling ordinal (its index
    // points past the VC list — a separate defect this heal won't paper over).
    const refIdx = parseVcRefIndexes(props.cmd);
    let commands;
    if (refIdx) {
      commands = refIdx.map((n) => vcItems[n - 1]?.command);
      if (commands.some((c) => typeof c !== 'string')) continue;
    } else {
      // Forbidden form (a): raw backtick command(s) embedded in the marker.
      commands = [];
      for (const m of props.cmd.matchAll(/`([^`]+)`/g)) commands.push(m[1]);
    }
    if (!commands.length) continue;

    items.push({ lineIndex: i, commands });
  }

  return { affected: items.length > 0, items };
}

// Rewrite every legacy AC's declaration to a by-id `vc-list="vc:<id>"`
// citation, id-stamping the whole VC section and appending any commands not
// already present (first-seen order preserved). Returns `{ body, changed }`.
export function healVcRefs(body) {
  const src = String(body || '');
  const det = detectLegacyAcCitations(src);
  if (!det.affected) return { body: src, changed: false };

  // 1. Collect every command the legacy ACs target that isn't already a live
  //    VC entry (first-seen order across the ACs being healed).
  const existing = new Set(parseVerificationCommands(src).map((it) => it.command));
  const newCommands = [];
  for (const item of det.items) {
    for (const cmd of item.commands) {
      if (!existing.has(cmd) && !newCommands.includes(cmd)) newCommands.push(cmd);
    }
  }

  // 2. Id-stamp any pre-existing id-less entries FIRST (so they keep the lower
  //    ids, staying positionally ordered), then append the new commands (each
  //    id-stamped at emit time). By-id resolution now engages section-wide.
  let next = stampMissingVcIds(src);
  next = newCommands.length ? appendVcCommands(next, newCommands) : next;

  // 3. Map command text -> stable id from the now fully-stamped VC list.
  const idByCommand = new Map();
  for (const it of parseVerificationCommands(next)) {
    if (Number.isInteger(it.id) && !idByCommand.has(it.command)) idByCommand.set(it.command, it.id);
  }

  // 4. Re-detect against the mutated body (VC edits shift AC line indexes) and
  //    rewrite each legacy marker to its by-id `vc-list` citation, dropping the
  //    forbidden `cmd` attribute (`cmd: undefined` is stripped by
  //    `orderProofProps`).
  const det2 = detectLegacyAcCitations(next);
  const lines = next.split('\n');
  for (const item of det2.items) {
    const ids = item.commands.map((c) => idByCommand.get(c));
    if (ids.some((n) => !Number.isInteger(n))) continue; // safety; unreachable in practice
    const citation = ids.map((n) => `vc:${n}`).join(' ');
    const box = lines[item.lineIndex].match(BOX_RE);
    const nextRest = upsertProofMarker(box[4], { cmd: undefined, 'vc-list': citation });
    lines[item.lineIndex] = `${box[1]}${box[2]}${box[3]}${nextRest}`;
  }

  const out = lines.join('\n');
  return { body: out, changed: out !== src };
}

// #774 AC-4 — compute a heal PLAN for `body` without mutating it, for the CLI
// dry-run. Returns the commands an `--apply` would append, the VC ids it would
// stamp onto previously-id-less entries, and the per-AC citation conversions
// (`{ label, vcList }` for each legacy AC, label stripped of its marker).
export function planVcRefHeal(body) {
  const src = String(body || '');
  const det = detectLegacyAcCitations(src);
  if (!det.affected) {
    return { affected: false, appendedCommands: [], stampedIds: [], conversions: [] };
  }

  const { body: healed } = healVcRefs(src);
  const before = parseVerificationCommands(src);
  const after = parseVerificationCommands(healed);
  const beforeCmds = new Set(before.map((it) => it.command));
  const beforeIds = new Set(before.filter((it) => Number.isInteger(it.id)).map((it) => it.id));

  const appendedCommands = after
    .filter((it) => !beforeCmds.has(it.command))
    .map((it) => it.command);
  const stampedIds = after
    .filter((it) => Number.isInteger(it.id) && !beforeIds.has(it.id))
    .map((it) => it.id);

  // The set of legacy AC label texts (marker stripped) this heal converts.
  // Label visible text is stable across heal (only the marker changes), so we
  // match healed vc-list markers back to the ACs det flagged pre-heal.
  const stripMarker = (rest) => rest.replace(/\s*<!--[\s\S]*?-->\s*$/g, '').trim();
  const srcLines = src.split('\n');
  const legacyLabels = new Set(
    det.items.map((it) => stripMarker(srcLines[it.lineIndex].match(BOX_RE)[4]))
  );

  const conversions = [];
  const loc = locateAcSection(healed);
  if (loc) {
    const lines = healed.split('\n');
    const startLine = healed.slice(0, loc.start).split('\n').length - 1;
    const endLine = healed.slice(0, loc.end).split('\n').length;
    for (let i = startLine; i < endLine && i < lines.length; i += 1) {
      const box = lines[i].match(BOX_RE);
      if (!box) continue;
      const props = parseProofMarker(box[4]);
      if (!props || typeof props['vc-list'] !== 'string') continue;
      const label = stripMarker(box[4]);
      if (!legacyLabels.has(label)) continue;
      conversions.push({ label, vcList: props['vc-list'] });
    }
  }

  return { affected: true, appendedCommands, stampedIds, conversions };
}
