#!/usr/bin/env node
// @story #752 (original) / #764 (in-process migration)
// AC3 (#752): a terminal review→done move runs a verified Status write PLUS a
// heavy best-effort post-commit tail (audit comment + body edit + unpark + event
// syncs + timing flush). #752 mitigated the SIGTERM-mid-tail hazard by spawning
// the move-state child under a dedicated, generously-sized MOVE_STATE_TIMEOUT_MS
// instead of the single-`gh`-call budget (GH_API_TIMEOUT_MS).
//
// #764 removes the process boundary entirely: `ctx.runMoveState` now drives the
// move through the in-process `runMoveStateHost` seam, so there is no child to
// SIGTERM-kill and no separate wall-clock budget to blow. The hazard #752
// mitigated is structurally gone — a strict improvement, and parity is preserved
// because an in-process call cannot be timeout-killed after the board commits.
// The MOVE_STATE_TIMEOUT_MS constant remains exported for any residual spawn
// caller and as the documented budget relationship.
//
// vc:2 = node --test scripts/task-tracker/tests/unit/run-move-state-timeout.test.mjs

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MOVE_STATE_TIMEOUT_MS, GH_API_TIMEOUT_MS } from '../../lib/process-timeouts.mjs';

test('AC3: MOVE_STATE_TIMEOUT_MS is exported and dwarfs the single-API budget', () => {
  assert.equal(typeof MOVE_STATE_TIMEOUT_MS, 'number');
  assert.ok(
    MOVE_STATE_TIMEOUT_MS > GH_API_TIMEOUT_MS,
    `move-state budget (${MOVE_STATE_TIMEOUT_MS}) must exceed one gh call (${GH_API_TIMEOUT_MS})`
  );
  assert.ok(
    MOVE_STATE_TIMEOUT_MS >= GH_API_TIMEOUT_MS * 4,
    'the tail runs many sequential gh calls — the budget must give real headroom'
  );
});

test('#764: runtime.mjs drives the move in-process (no move-state child spawn to SIGTERM-kill)', () => {
  const src = readFileSync(fileURLToPath(new URL('../../runtime.mjs', import.meta.url)), 'utf8');
  // The move-state child spawn is gone: no `pexec(process.execPath, moveArgs …)`.
  assert.ok(
    !/pexec\(process\.execPath,\s*moveArgs/.test(src),
    'the move-state child spawn must be removed — the move runs in-process'
  );
  // The mover now delegates to the in-process host seam.
  assert.ok(
    /import\s*\{[^}]*runMoveStateHost[^}]*\}\s*from\s*'\.\.\/gh\/move-state\.mjs'/.test(src),
    'runtime.mjs must import runMoveStateHost from ../gh/move-state.mjs'
  );
  assert.ok(
    /runMoveStateInProcess\(/.test(src),
    'ctx.runMoveState must delegate to the in-process runMoveStateInProcess helper'
  );
});
