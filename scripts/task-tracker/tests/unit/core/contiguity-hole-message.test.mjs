#!/usr/bin/env node
// @story #675 (AC2)
// The contiguity-hole refusal banner in `guard-execution.mjs` must name
// `reconcile backfill` as the primary recovery path (it is the tool actually
// designed to fill historical entry-marker holes), and must qualify the
// `reconcile accept-live` suggestion so it isn't offered unconditionally for
// every hole — `accept-live` overwrites recorded state wholesale and is only
// appropriate when live/recorded state have genuinely drifted, not merely
// when a historical marker is missing.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const guardSrc = readFileSync(
  path.resolve(__dirname, '..', '..', 'lib', 'move-state', 'guard-execution.mjs'),
  'utf8'
);

function contiguityRecoveryBlock(src) {
  const idx = src.indexOf("guardResult.refusals.find((r) => r.id === 'contiguity-entry')");
  assert.ok(idx >= 0, 'contiguity-entry refusal block must exist');
  return src.slice(idx, idx + 1200);
}

test('contiguity-hole refusal names `reconcile backfill` as the primary recovery path', () => {
  const block = contiguityRecoveryBlock(guardSrc);
  assert.match(block, /reconcile backfill/);
});

test('contiguity-hole refusal qualifies `reconcile accept-live` on genuine drift, not unconditionally', () => {
  const block = contiguityRecoveryBlock(guardSrc);
  assert.match(block, /reconcile accept-live/);
  // The old unconditional phrasing offered accept-live for ANY hole ("if the
  // board and body have drifted" read as a throwaway qualifier). The fix must
  // gate it explicitly against a hole being fixable by backfill.
  assert.match(block, /actually drifted/);
  assert.match(block, /not merely a missing historical marker/);
});

test('backfill is offered before accept-live (primary vs fallback ordering)', () => {
  const block = contiguityRecoveryBlock(guardSrc);
  const backfillIdx = block.indexOf('reconcile backfill');
  const acceptLiveIdx = block.indexOf('reconcile accept-live');
  assert.ok(backfillIdx >= 0 && acceptLiveIdx >= 0);
  assert.ok(backfillIdx < acceptLiveIdx, 'backfill must be presented before accept-live');
});
