// #721 — detect + heal legacy single-command ACs into shared `## Verification
// Commands` entries plus `vc:<n>` citations. Parallel in shape to
// `heal-functional-dod.mjs`'s detect/heal pair, but scoped to the
// `## Acceptance Criteria` section and the vc-ref citation grammar
// (`vc-ref.mjs`) instead of the Functional DoD keyed template.
//
// A "legacy" AC is one whose `aitm-verified cmd="..."` declaration embeds a
// raw backtick command rather than citing an existing VC entry. Healing:
//   - dedupes each legacy AC's command(s) against the issue's existing VC
//     list (by literal command text), appending only genuinely new ones;
//   - rewrites the AC's `cmd` to a `vc:<n>` citation (or space-separated list
//     for a multi-command AC), preserving any run-props already on the marker.
//
// Idempotent: an issue with no legacy citations reports `affected: false` and
// `healVcRefs` returns `{ changed: false }` unchanged.

import { parseProofMarker, upsertProofMarker } from './proof-marker.mjs';
import { parseVerificationCommands } from './verification-commands.mjs';
import { insertVerificationCommands } from './evidence-markers.mjs';
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

// Scan the `## Acceptance Criteria` section for checkbox lines whose
// `aitm-verified cmd="..."` declaration is a legacy embedded command (not a
// `vc:<n>` citation). Returns `{ affected, items }` where each item is
// `{ lineIndex, commands }` — `commands` is the item's backtick-extracted
// command list, in declared order.
export function detectLegacyAcCitations(body) {
  const src = String(body || '');
  const loc = locateAcSection(src);
  if (!loc) return { affected: false, items: [] };

  const lines = src.split('\n');
  const startLine = src.slice(0, loc.start).split('\n').length - 1;
  const endLine = src.slice(0, loc.end).split('\n').length;
  const items = [];

  for (let i = startLine; i < endLine && i < lines.length; i += 1) {
    const box = lines[i].match(BOX_RE);
    if (!box) continue;
    const rest = box[4];
    const props = parseProofMarker(rest);
    if (!props || typeof props.cmd !== 'string') continue;
    if (parseVcRefIndexes(props.cmd)) continue; // already a citation

    const commands = [];
    for (const m of props.cmd.matchAll(/`([^`]+)`/g)) commands.push(m[1]);
    if (!commands.length) continue;

    items.push({ lineIndex: i, commands });
  }

  return { affected: items.length > 0, items };
}

// Rewrite every legacy AC's declaration to a `vc:<n>` citation, appending any
// commands not already present in `## Verification Commands` (preserving
// first-seen order across the ACs being healed). Returns `{ body, changed }`.
export function healVcRefs(body) {
  const src = String(body || '');
  const det = detectLegacyAcCitations(src);
  if (!det.affected) return { body: src, changed: false };

  const vcItems = parseVerificationCommands(src);
  const commandIndex = new Map(vcItems.map((it, idx) => [it.command, idx + 1]));
  const newCommands = [];

  for (const item of det.items) {
    for (const cmd of item.commands) {
      if (commandIndex.has(cmd)) continue;
      if (!newCommands.includes(cmd)) newCommands.push(cmd);
    }
  }

  const baseCount = vcItems.length;
  const newCommandIndex = new Map(newCommands.map((cmd, i) => [cmd, baseCount + i + 1]));
  const resolveIndex = (cmd) => commandIndex.get(cmd) ?? newCommandIndex.get(cmd);

  const lines = src.split('\n');
  for (const item of det.items) {
    const citation = item.commands.map((cmd) => `vc:${resolveIndex(cmd)}`).join(' ');
    const line = lines[item.lineIndex];
    const box = line.match(BOX_RE);
    const nextRest = upsertProofMarker(box[4], { cmd: citation });
    lines[item.lineIndex] = `${box[1]}${box[2]}${box[3]}${nextRest}`;
  }

  const finalLines = newCommands.length ? insertVerificationCommands(lines, newCommands) : lines;
  const next = finalLines.join('\n');
  return { body: next, changed: next !== src };
}
