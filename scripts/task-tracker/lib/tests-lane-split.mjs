// #934 — surgical migration converting an in-flight issue body from the single
// `npm run test:all` Functional-DoD `tests` verifier to the two-lane split
// (`npm test` + `npm run test:slow`). The single command's ~530–690s wall-time
// now exceeds the 600s per-command runner budget, so `dod-stamp tests`
// SIGTERM-kills it and the stamp is unreachable; declaring the two lanes as
// separate verifiers keeps each under its own budget (see the #934 deep-dive).
//
// This is NOT `heal-functional-dod.mjs`: that tool rebuilds the whole Functional
// section from a canonical template (for pre-#303 bodies missing keyed markers)
// and would clobber a live body's `dod:kinds` annotations and evidence. This
// migration is surgical — it rewrites ONLY the `tests` DoD line's `cmd=`
// declaration and reconciles the `## Verification Commands` mirror entry,
// touching nothing else.
//
// Pure string transform — no I/O, no mutation. Idempotent: a body already on the
// two-lane form (or with no legacy `test:all` `tests` line) returns unchanged.

import { parseVerificationCommands } from './verification-commands.mjs';
import { appendVcCommands, deleteVcById } from './vc-emit.mjs';

const LANE_COMMANDS = Object.freeze(['npm test', 'npm run test:slow']);

// The legacy single-command declaration substring on the `tests` DoD line, and
// its two-lane replacement. Matched literally so only an exact legacy line is
// rewritten (a partially-migrated or hand-edited line is left alone).
const LEGACY_CMD = 'cmd="`npm run test:all`"';
const LANE_CMD = 'cmd="`npm test` `npm run test:slow`"';

// A Functional-DoD `tests` line carries the `dod:functional:tests` key marker.
const TESTS_KEY_RE = /<!--\s*dod:functional:tests\s*-->/i;
// An already-stamped line carries execution props (`exit=`); such a line stamped
// successfully and must not be rewritten (rewriting would orphan its evidence).
const STAMPED_RE = /\bexit=/;
const VERIFIED_MARKER_RE = /<!--\s*aitm-verified\s+[\s\S]*?-->/g;
const VC_LIST_ATTR_RE = /\bvc-list="([^"]*)"/;
const AGGREGATE_TOMBSTONE_RE =
  /<!--\s*aitm-vc-tombstone\s+id=(\d+)\s+cmd="npm run test:all"\s*-->/gi;

function replaceRetiredVcCitations(body, retiredId, replacementIds) {
  const retired = `vc:${retiredId}`;
  const replacements = replacementIds.map((id) => `vc:${id}`);
  return String(body).replace(VERIFIED_MARKER_RE, (marker) => {
    const match = VC_LIST_ATTR_RE.exec(marker);
    if (!match) return marker;
    const tokens = match[1].trim().split(/\s+/).filter(Boolean);
    if (!tokens.includes(retired)) return marker;

    const rewritten = [];
    const seen = new Set();
    for (const token of tokens) {
      for (const candidate of token === retired ? replacements : [token]) {
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        rewritten.push(candidate);
      }
    }
    return marker.replace(VC_LIST_ATTR_RE, `vc-list="${rewritten.join(' ')}"`);
  });
}

function recoverTombstonedVcCitations(body) {
  const src = String(body);
  const tombstones = [...src.matchAll(AGGREGATE_TOMBSTONE_RE)];
  if (tombstones.length === 0) return { body: src, changed: false };
  if (tombstones.length !== 1) {
    throw new Error('tests-lane-split: aggregate verifier tombstone must be unique');
  }

  const liveCommands = parseVerificationCommands(src);
  const laneEntries = LANE_COMMANDS.map((command) =>
    liveCommands.filter((entry) => entry.command === command)
  );
  if (laneEntries.some((entries) => entries.length !== 1 || !Number.isInteger(entries[0]?.id))) {
    throw new Error('tests-lane-split: replacement lane commands must carry unique stable IDs');
  }
  const laneIds = laneEntries.map(([entry]) => entry.id);
  if (new Set(laneIds).size !== laneIds.length) {
    throw new Error('tests-lane-split: replacement lane command IDs must be distinct');
  }

  const rewritten = replaceRetiredVcCitations(src, Number(tombstones[0][1]), laneIds);
  return { body: rewritten, changed: rewritten !== src };
}

// Rewrite the Functional-DoD `tests` line from the single `test:all` declaration
// to the two-lane form. Only an UNSTAMPED legacy line is rewritten. Returns the
// body unchanged when no such line exists (already two-lane, stamped, or absent).
function migrateTestsDodLine(body) {
  const lines = String(body).split('\n');
  let changed = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!TESTS_KEY_RE.test(line)) continue;
    if (STAMPED_RE.test(line)) continue;
    if (!line.includes(LEGACY_CMD)) continue;
    lines[i] = line.replace(LEGACY_CMD, LANE_CMD);
    changed = true;
  }
  return { body: changed ? lines.join('\n') : String(body), changed };
}

// Reconcile the `## Verification Commands` mirror: replace a live `npm run
// test:all` entry with the two lane entries. An id-stamped entry is tombstoned
// (its id retired, never reissued) and the lanes are appended with fresh
// monotonic ids, so by-id citation resolution stays engaged. A legacy id-less
// entry is rewritten in place (preserving its ordinal position) and only the
// slow lane is appended. Bodies without a `test:all` VC entry (e.g. a DoD-line-
// only declaration) are left to `dod-stamp`'s reconcile pass and return
// unchanged here.
function migrateVcMirror(body) {
  const src = String(body);
  const target = parseVerificationCommands(src).find((it) => it.command === 'npm run test:all');
  if (!target) return recoverTombstonedVcCitations(src);

  if (Number.isInteger(target.id)) {
    // Id-safe path: tombstone the retired id, append both lanes with fresh ids.
    const tombstoned = deleteVcById(src, target.id);
    const appended = appendVcCommands(tombstoned, LANE_COMMANDS);
    const laneIds = LANE_COMMANDS.map(
      (command) => parseVerificationCommands(appended).find((it) => it.command === command)?.id
    );
    if (!laneIds.every(Number.isInteger)) {
      throw new Error('tests-lane-split: replacement lane commands must carry stable IDs');
    }
    const rewritten = replaceRetiredVcCitations(appended, target.id, laneIds);
    return { body: rewritten, changed: rewritten !== src };
  }

  // Legacy id-less path: rewrite the entry in place (holds its ordinal position),
  // then append the slow lane. `appendVcCommands` skips a lane already present.
  const lines = src.split('\n');
  lines[target.lineIndex] = lines[target.lineIndex].replace('npm run test:all', 'npm test');
  const rewritten = lines.join('\n');
  const appended = appendVcCommands(rewritten, ['npm run test:slow']);
  return { body: appended, changed: appended !== src };
}

// Migrate a whole body: the `tests` DoD line and its VC mirror. Returns
// `{ body, changed }` where `changed` is true if either half changed.
export function migrateTestsLaneSplit(body) {
  const dod = migrateTestsDodLine(body);
  const vc = migrateVcMirror(dod.body);
  return { body: vc.body, changed: dod.changed || vc.changed };
}
