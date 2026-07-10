// @story #605
// Smoke leaf for `scripts/task-tracker/verify-epic-114.mjs` (epic #586, Group B).
//
// Per the #586 smoke-only split this epic-invariant checker is covered by a
// clean-invocation smoke rather than a >=80% coverage target. The script takes
// no arguments — it runs two repo invariant checks (cross-adapter SKILL.md
// parity and the DESIGN.md "Skill loading model" section) and exits 0 with
// `epic #114 invariants: ok` when they both hold, or 1 with diagnostics
// otherwise. (A former check #3 asserted a machine-specific `$HOME/.claude`
// memory-archive path; it was dropped in #743 because it failed on every
// machine but the author's, including CI.) The smoke drives the script as a
// child process and asserts the success path, plus source-level guards that
// pin #743's fix in place.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../verify-epic-114.mjs', import.meta.url));
const SOURCE = readFileSync(SCRIPT, 'utf8');

test('verify-epic-114 smoke: invariants hold → prints ok and exits 0', () => {
  const res = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /epic #114 invariants: ok/);
});

// #743 AC1 — the machine-specific memory-archive check must stay gone. The
// source may not reference the author's personal Claude auto-memory path in any
// form, or the smoke passes only on that one laptop.
test('verify-epic-114 source: no hardcoded personal $HOME/.claude memory path', () => {
  assert.doesNotMatch(SOURCE, /-Users-kpburson/, 'personal path segment resurfaced');
  assert.doesNotMatch(SOURCE, /\.claude\/projects/, '$HOME/.claude memory path resurfaced');
});

// #743 AC3 — the two genuine repo invariants must still be enforced. Guard the
// fail branches at the source level so a regression that silently deletes a
// real invariant (leaving the smoke green because the success path is
// unaffected) is caught here instead.
test('verify-epic-114 source: genuine repo invariants (#1, #2) still enforced', () => {
  assert.match(SOURCE, /shared\/router\.md/, 'check #1 (SKILL.md router parity) removed');
  assert.match(SOURCE, /Skill loading model/, 'check #2 (DESIGN.md section) removed');
});
