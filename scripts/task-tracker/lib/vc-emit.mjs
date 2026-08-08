// #772 — stable-id emission, blank-line hygiene, and tombstone-aware id
// allocation for the `## Verification Commands` (VC) section.
//
// The epic's citation scheme (`vc-list="vc:1 vc:3"`) uses whitespace-delimited tokens.
// It resolves BY ID, not by ordinal position, so an entry's id must be assigned
// exactly once and NEVER reused — even after the entry is deleted, and even when
// it was the LAST entry
// in the list (a naive `max(live-ids) + 1` would hand the freed id straight to
// the next append). We enforce that with a deletion TOMBSTONE: deleting a VC
// entry leaves a hidden `<!-- aitm-vc-tombstone id=N ... -->` note in the
// section. `highestVcId` counts tombstoned ids alongside live ones, so the
// high-water mark only ever climbs.
//
// All functions here are pure string transforms — no I/O, no mutation.

import { parseVerificationCommands } from './verification-commands.mjs';

export const VC_HEADING = '## Verification Commands';

// A tombstone note left behind by a deleted VC entry. Carries the retired id
// (the load-bearing part — it pins the high-water mark) and, for audit, the
// command text that used to occupy it. Not a checkbox line, so the VC parser
// ignores it; only the allocator reads it.
const TOMBSTONE_ID_RE = /<!--\s*aitm-vc-tombstone\s+id=(\d+)\b[\s\S]*?-->/gi;

// Highest id ever handed out in this body: the max over every LIVE VC-entry id
// and every TOMBSTONED id. Returns 0 for a body that has never carried an id.
export function highestVcId(body) {
  const src = String(body || '');
  let max = 0;
  for (const it of parseVerificationCommands(src)) {
    if (Number.isInteger(it.id) && it.id > max) max = it.id;
  }
  for (const m of src.matchAll(TOMBSTONE_ID_RE)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

// The next id to assign. Monotonic by construction — one past the high-water
// mark, so a freed id (deleted entry, even the last one) is never reissued.
export function nextVcId(body) {
  return highestVcId(body) + 1;
}

// The full set of retired ids, for callers that need to distinguish a
// deliberately-deleted citation target (tombstoned → resolves to nothing) from
// a never-existed one (typo/bug → hard error).
export function tombstonedVcIds(body) {
  const out = new Set();
  for (const m of String(body || '').matchAll(TOMBSTONE_ID_RE)) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}

// Render one VC checkbox line with its stable hidden id marker.
export function renderVcLine(command, id, checked = false) {
  return `- [${checked ? 'x' : ' '}] \`${command}\` <!-- id=${id} -->`;
}

// Render a complete `## Verification Commands` section body for `commands`,
// stamping consecutive ids starting at `startId`. Always terminated with a
// single trailing blank line (the "blank line BELOW the header/section"
// half of AC5); the "blank line ABOVE" half is guaranteed by `spliceVcSection`
// at the insertion point.
export function renderVcSection(commands, startId = 1) {
  const lines = (Array.isArray(commands) ? commands : []).map((c, i) =>
    renderVcLine(c, startId + i)
  );
  return `${VC_HEADING}\n\n${lines.join('\n')}\n\n`;
}

// Splice a rendered section (or any block) into `before`/`after` with EXACTLY
// one blank line above and one below, regardless of the surrounding
// whitespace the callers happen to slice on. This is the AC5 hygiene fix: the
// old emitters glued the header directly onto whatever preceded it when that
// text did not already end in a blank line.
export function spliceVcSection(before, section, after = '') {
  const head = String(before).replace(/\s*$/, '');
  const tail = String(after).replace(/^\s*/, '');
  const mid = String(section).replace(/^\s*/, '').replace(/\s*$/, '');
  const prefix = head ? `${head}\n\n` : '';
  return tail ? `${prefix}${mid}\n\n${tail}` : `${prefix}${mid}\n\n`;
}

// Locate the `[start, end)` line-index span of the VC section within `lines`
// (the heading line through the last line before the next heading / EOF).
// Returns null when there is no VC section.
function vcSectionSpan(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s+Verification Commands\s*$/i.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

// Append `commands` to the body's existing VC section, each stamped with the
// next monotonic id (tombstone-aware). Throws when the body has no VC section
// (the seed emitters own creation; this only extends). A command already
// present (same text, live) is skipped so re-appends stay idempotent.
export function appendVcCommands(body, commands) {
  const src = String(body || '');
  const lines = src.split('\n');
  const span = vcSectionSpan(lines);
  if (!span) throw new Error('appendVcCommands: body has no ## Verification Commands section');

  const live = new Set(parseVerificationCommands(src).map((it) => it.command));
  const toAdd = (Array.isArray(commands) ? commands : []).filter((c) => !live.has(c));
  if (!toAdd.length) return src;

  let id = nextVcId(src);
  const newLines = toAdd.map((c) => renderVcLine(c, id++));

  // Insert after the last non-blank line of the section, before the trailing
  // blank(s) that separate it from the next heading.
  let insertAt = span.end;
  while (insertAt > span.start + 1 && lines[insertAt - 1].trim() === '') insertAt--;
  lines.splice(insertAt, 0, ...newLines);
  return lines.join('\n');
}

// #774 — retrofit a stable hidden `<!-- id=N -->` marker onto every VC entry
// that lacks one, assigning consecutive ids from the current high-water mark
// (tombstone-aware, monotonic). No-op when every entry is already stamped.
// Pure string transform.
//
// This is the migration counterpart to `renderVcLine`'s emit-time stamping: it
// id-stamps a pre-#772 section in one pass so by-id citation resolution
// (`vc-ref.mjs::resolveVcRefCommands`) — which engages ONLY when EVERY entry
// carries an id — can take over for the whole section. A partial stamp would
// silently fall back to ordinal resolution, so the healer must stamp all-or-
// nothing.
export function stampMissingVcIds(body) {
  const src = String(body || '');
  const missing = parseVerificationCommands(src).filter((it) => !Number.isInteger(it.id));
  if (!missing.length) return src;
  const lines = src.split('\n');
  let id = nextVcId(src);
  for (const it of missing) {
    lines[it.lineIndex] = `${lines[it.lineIndex].replace(/\s*$/, '')} <!-- id=${id} -->`;
    id += 1;
  }
  return lines.join('\n');
}

// Delete the live VC entry whose id is `id`, replacing its checkbox line with a
// tombstone note so the id can never be reissued. No-op (returns the body
// unchanged) when no live entry carries that id. This is the write-side origin
// of the tombstone the allocator reads.
export function deleteVcById(body, id) {
  const src = String(body || '');
  const target = parseVerificationCommands(src).find((it) => it.id === id);
  if (!target) return src;
  const lines = src.split('\n');
  lines[target.lineIndex] =
    `<!-- aitm-vc-tombstone id=${id} cmd=${JSON.stringify(target.command)} -->`;
  return lines.join('\n');
}
