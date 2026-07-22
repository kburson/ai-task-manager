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
  if (!target) return { body: src, changed: false };

  if (Number.isInteger(target.id)) {
    // Id-safe path: tombstone the retired id, append both lanes with fresh ids.
    const tombstoned = deleteVcById(src, target.id);
    const appended = appendVcCommands(tombstoned, LANE_COMMANDS);
    return { body: appended, changed: appended !== src };
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
