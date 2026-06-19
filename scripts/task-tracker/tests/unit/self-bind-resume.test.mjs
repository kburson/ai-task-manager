#!/usr/bin/env node
// @story #460
// Self-bind resume — issue #460.
//
// When the user re-binds to the already-active issue (/task #N while on #N),
// verbSwitch must emit a `resumed` row rather than a self-referential
// `switch-out → task #N` row.
//
// Asserts:
//   1. `buildRow` with event `resumed` does not contain "switch-out".
//   2. `buildRow` with event `switch-out` + a DIFFERENT target does contain
//      the target ref (validates the positive case is unaffected).
//   3. The runtime source does NOT have an unconditional `switch-out` emission
//      that would bypass the self-bind guard.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRow } from '../../gh-timing-comment.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '../../..');

const ts = new Date(Date.now() - 2000).toISOString();

// ---- 1. Self-bind emits `resumed`, not `switch-out` -----------------------
const selfBindRow = buildRow({
  ts,
  event: 'resumed',
  activeMin: 5,
  idleMin: 0,
  deltaWords: 42,
  wordMarker: 500,
  description: 'resumed #430',
});
assert.match(selfBindRow, /\| resumed \|/, 'self-bind row must use resumed slug');
assert.ok(!selfBindRow.includes('switch-out'), 'self-bind row must not contain switch-out');

// ---- 2. Cross-issue switch still emits `switch-out` with the target ref ----
const crossRow = buildRow({
  ts,
  event: 'switch-out',
  activeMin: 10,
  idleMin: 0,
  deltaWords: 100,
  wordMarker: 1000,
  description: 'switch-out → task #999',
});
assert.match(crossRow, /\| switch-out \|/, 'cross-issue switch must use switch-out slug');
assert.match(crossRow, /switch-out → task #999/, 'cross-issue row must reference the target');

// ---- 3. switch.mjs uses the isSelfBind guard before emitting switch-out ----
// Grep for the guard that conditions the event slug on self-bind. The fix
// must be present in the production source, not just in tests.
let guardSrc = '';
try {
  guardSrc = execFileSync('grep', ['-n', 'isSelfBind', 'scripts/task-tracker/verbs/switch.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
} catch (err) {
  if (err.status !== 1) throw err;
  guardSrc = '';
}
assert.ok(guardSrc.length > 0, 'switch.mjs must contain an isSelfBind guard (#460 fix)');

// ---- 4. The `eventSlug` selection uses isSelfBind, not a bare `switch-out` --
let slugSrc = '';
try {
  slugSrc = execFileSync('grep', ['-n', 'eventSlug', 'scripts/task-tracker/verbs/switch.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
} catch (err) {
  if (err.status !== 1) throw err;
  slugSrc = '';
}
assert.ok(slugSrc.includes('resumed'), 'eventSlug in switch.mjs must reference resumed slug');
assert.ok(slugSrc.includes('switch-out'), 'eventSlug in switch.mjs must reference switch-out slug');

console.log('self-bind-resume.test.mjs: ok');
