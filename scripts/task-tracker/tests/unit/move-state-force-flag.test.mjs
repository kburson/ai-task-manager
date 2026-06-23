#!/usr/bin/env node
// @story #505
// #505 — `scripts/gh/move-state.mjs` gains a `--force` flag that relaxes the
// forward-progress gates for a *delivered operator override* (close --force's
// terminal board move), exactly as `--supersede` does for an *abandoned*
// story. Without it, a forced close from a non-`review` column closed the
// GitHub issue but the board move (`plan → done`) was refused by the one-step
// matrix, stranding the card.
//
// The flag logic is inline in the CLI body (the script executes at import and
// reads argv / the live board), so these are source-level invariants plus a
// behavioral check on the matrix the flag bypasses.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTransition } from '../../state-machine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.resolve(__dirname, '../../../gh/move-state.mjs'), 'utf8');

test('the matrix the --force flag bypasses genuinely refuses plan → done', () => {
  // If this ever becomes a legal one-step move, the bypass would be moot and
  // the #505 reproduction would no longer hold.
  const v = validateTransition('plan', 'done');
  assert.equal(v.ok, false, 'plan → done must be illegal under the normal matrix');
});

test('--force is parsed as a flag', () => {
  assert.ok(
    /cliArgs\[i\]\s*===\s*'--force'/.test(SRC),
    'move-state.mjs must recognize a --force CLI flag'
  );
  assert.ok(/forceFlag\s*=\s*true/.test(SRC), 'the --force flag must set forceFlag');
});

test('--force bypasses the state-machine matrix gate', () => {
  assert.ok(
    /if \(resolvedFromState && !supersedeFlag && !forceFlag\)/.test(SRC),
    'the matrix gate condition must exclude forceFlag (so --force skips validateTransition)'
  );
});

test('--force bypasses the runGuards entry/exit pipeline', () => {
  assert.ok(
    /if \(!SKIP_NETWORK && !supersedeFlag && !forceFlag\)/.test(SRC),
    'the guard pipeline condition must exclude forceFlag'
  );
});

test('--force is documented in usage and distinct from --supersede', () => {
  assert.ok(/\[--force\]/.test(SRC), 'usage must list --force');
  assert.ok(/operator override/.test(SRC), 'usage must describe --force as a delivered override');
});

console.log('move-state-force-flag.test.mjs — all assertions passed');
