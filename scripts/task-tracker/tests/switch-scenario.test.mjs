#!/usr/bin/env node
// @story #130
// Switch scenario — issue #130.
//
// Asserts the outgoing-only `switch-out → task #N` semantics of the
// `/task switch` verb chain:
//
//   - Switching from A to B emits a `switch-out → task #B` row on A's log.
//   - The incoming bind on B emits only `start`/`resumed` rows — there is
//     no `switch-in` event slug in the codebase.
//   - Returning to A after closing the trip to B emits a `resumed` row
//     on A's log (not a duplicate `start`, and not a `switch-in`).
//
// Like lifecycle-integration, this is a structural test that exercises
// the same `buildRow` + verb-event slugs that the runtime uses. It
// asserts:
//
//   1. The repo contains no `switch-in` emission anywhere outside tests.
//   2. `buildRow` renders a `switch-out → task #B` row exactly as the
//      switch verb constructs it.
//   3. `buildRow` renders a `resumed` row exactly as resume.mjs/start.mjs
//      construct it.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRow } from '../gh-timing-comment.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

// ---- 1. No `switch-in` slug emitted anywhere in runtime code -------------
// Grep all source under scripts/ excluding tests/. The slug must not appear
// as an emitted event. Documentation references (`resume.mjs` comment
// "no `switch-in`") are allowed.
let grep = '';
try {
  grep = execFileSync('grep', ['-rEn', `event: ['\\\"]switch-in['\\\"]`, 'scripts/'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
} catch (err) {
  // grep exits 1 when no matches — that's the success case here.
  if (err.status !== 1) throw err;
  grep = '';
}
assert.equal(grep, '', `runtime must not emit "switch-in" rows; found:\n${grep}`);

// ---- 2. `switch-out → task #B` row is well-formed -------------------------
const tsA = new Date(Date.now() - 5000).toISOString();
const outgoing = buildRow({
  ts: tsA,
  event: 'switch-out',
  activeMin: 3,
  idleMin: 0,
  deltaWords: 250,
  wordMarker: 1000,
  description: 'switch-out → task #777',
});
assert.match(outgoing, /\| switch-out \|/, 'outgoing row must use switch-out slug');
assert.match(
  outgoing,
  /switch-out → task #777/,
  'outgoing row must carry "switch-out → task #N" description'
);

// ---- 3. Re-bind to A emits `resumed`, not `switch-in` ---------------------
const tsBack = new Date(Date.now() - 1000).toISOString();
const resumed = buildRow({
  ts: tsBack,
  event: 'resumed',
  activeMin: 0,
  idleMin: 0,
  deltaWords: 0,
  wordMarker: 1000,
  description: 'agent',
});
assert.match(resumed, /\| resumed \|/, 'return-to-task row must use resumed slug');
assert.ok(!resumed.includes('switch-in'), 'return-to-task row must not contain "switch-in"');

// ---- 4. B's log: a fresh `start` row carries the role but no switch token --
const tsB = new Date(Date.now() - 4000).toISOString();
const startB = buildRow({
  ts: tsB,
  event: 'start',
  activeMin: 0,
  idleMin: 0,
  deltaWords: 0,
  wordMarker: 0,
  description: 'agent',
});
assert.match(startB, /\| start \|/, 'B-side bind must emit start');
assert.ok(!startB.includes('switch'), 'B-side bind must not include any switch token');

console.log('switch-scenario.test.mjs: ok');
