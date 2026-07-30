#!/usr/bin/env node
// @story #460 #833
// Self-bind no-op — issue #833 (supersedes the #460 self-bind-resume behavior).
//
// #460 originally made a re-bind to the already-active issue (/task #N while on
// #N) emit a `resumed` row instead of a self-referential `switch-out → #N` row.
// #833 goes further: a self-bind to an active, never-paused issue never actually
// stopped work, so it must be a TRUE no-op — verbSwitch emits ZERO timing rows
// and leaves the live active span intact. The doubled `resumed` (outgoing flush
// + incoming bind) is the defect this test now guards against.
//
// Asserts:
//   1. `buildRow` with event `resumed` grammar is intact — still used by the
//      legitimate resume-after-pause path (which is NOT a self-bind).
//   2. `buildRow` with event `switch-out` + a DIFFERENT target still references
//      the target ref (cross-issue switch is unaffected).
//   3. governed bind orchestration contains the #833 self-bind no-op guard with
//      an early `return` before any timing emission.
//   4. governed bind orchestration no longer conditions emission on `isSelfBind` — the dead
//      self-bind branch was removed once the guard made it unreachable.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRow } from '../../../gh-timing-comment.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = path.resolve(here, '..', '../../..');
const switchSrc = readFileSync(
  path.join(repoRoot, 'scripts/task-tracker/lib/work-lease/bind-orchestration.mjs'),
  'utf8'
);

const ts = new Date(Date.now() - 2000).toISOString();

// ---- 1. resume-after-pause row grammar is intact (`resumed`) ---------------
const resumeRow = buildRow({
  ts,
  event: 'resumed',
  activeMin: 5,
  idleMin: 0,
  deltaWords: 42,
  wordMarker: 500,
  description: 'resumed #430',
});
assert.match(resumeRow, /\| resumed \|/, 'resume-after-pause row must use resumed slug');
assert.ok(!resumeRow.includes('switch-out'), 'resume row must not contain switch-out');

// ---- 2. Cross-issue switch still emits `switch-out` with the target ref ----
const crossRow = buildRow({
  ts,
  event: 'switch-out:#999',
  activeMin: 10,
  idleMin: 0,
  deltaWords: 100,
  wordMarker: 1000,
  description: 'switch-out → task #999',
});
assert.match(
  crossRow,
  /\| switch-out:#999 \|/,
  'cross-issue switch must use the target-specific switch-out slug'
);
assert.match(crossRow, /switch-out → task #999/, 'cross-issue row must reference the target');

// ---- 3. governed bind carries the #833 self-bind no-op guard ----------------
// The guard short-circuits a re-bind to the already-active, never-paused issue
// with an early `return` before any flush/bind emission.
assert.match(
  switchSrc,
  /const selfHeldLease =[\s\S]{0,160}state\.active === target[\s\S]{0,100}!session\?\.workLeaseIntent/,
  'governed bind must identify a held, active, intent-free self-bind (#833)'
);
// The guard body must return early (no-op) — locate a `return;` after the guard.
const guardIdx = switchSrc.indexOf('const selfHeldLease =');
assert.ok(guardIdx > 0, 'self-bind guard condition must be present');
const afterGuard = switchSrc.slice(guardIdx, guardIdx + 1400);
assert.match(
  afterGuard,
  /console\.log\(`already active:[\s\S]{0,80}\breturn;/,
  'self-bind no-op guard must return early (#833)'
);

// ---- 4. The dead `isSelfBind` conditional was removed ----------------------
// Once the guard makes self-bind unreachable in the switch-out branch, the old
// `isSelfBind` event-slug conditional is gone. Grep must find no runtime use.
let selfBindHits = '';
try {
  selfBindHits = execFileSync(
    'grep',
    ['-n', 'isSelfBind', 'scripts/task-tracker/lib/work-lease/bind-orchestration.mjs'],
    { cwd: repoRoot, encoding: 'utf8' }
  ).trim();
} catch (err) {
  if (err.status !== 1) throw err;
  selfBindHits = '';
}
assert.equal(
  selfBindHits,
  '',
  'governed bind must no longer branch on isSelfBind — the no-op guard replaces it (#833)'
);

console.log('self-bind-resume.test.mjs: ok');
