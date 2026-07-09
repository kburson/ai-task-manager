#!/usr/bin/env node
// @story #752
// AC3: `ctx.runMoveState` must NOT bound the entire move-state child — the
// verified Status write PLUS the full best-effort post-commit tail — with the
// single-`gh`-call budget (GH_API_TIMEOUT_MS = 15s). On a terminal review→done
// move the tail is heaviest (audit comment + body edit + unpark + event syncs +
// timing flush), so the aggregate can exceed 15s and execFile SIGTERM-kills the
// child AFTER the board committed. A dedicated, generously-sized
// MOVE_STATE_TIMEOUT_MS decouples the child's wall-clock budget from one API call.
//
// The spawn is network-bound and not exercised here; this pins the constant and
// asserts runtime.mjs sources the move-state spawn timeout from it.
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

test('AC3: runtime.mjs bounds the move-state spawn with MOVE_STATE_TIMEOUT_MS', () => {
  const src = readFileSync(fileURLToPath(new URL('../../runtime.mjs', import.meta.url)), 'utf8');
  // The move-state child is spawned via `pexec(process.execPath, moveArgs, …)`.
  const spawnBlock = src.slice(src.indexOf('const moveArgs ='));
  const pexecIdx = spawnBlock.indexOf('pexec(process.execPath, moveArgs');
  assert.ok(pexecIdx >= 0, 'the move-state spawn call must exist');
  const optsSlice = spawnBlock.slice(pexecIdx, pexecIdx + 600);
  assert.match(
    optsSlice,
    /timeout:\s*MOVE_STATE_TIMEOUT_MS/,
    'the move-state spawn must use MOVE_STATE_TIMEOUT_MS, not the single-API GH_API_TIMEOUT_MS'
  );
  assert.ok(
    /import\s*\{[^}]*MOVE_STATE_TIMEOUT_MS[^}]*\}\s*from\s*'\.\/lib\/process-timeouts\.mjs'/.test(
      src
    ),
    'runtime.mjs must import MOVE_STATE_TIMEOUT_MS from process-timeouts.mjs'
  );
});
