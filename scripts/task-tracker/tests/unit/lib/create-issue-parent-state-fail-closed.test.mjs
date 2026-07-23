#!/usr/bin/env node
// @story #513
// `scripts/gh/create-issue.mjs` must fail CLOSED when the parent-epic state read
// that feeds the #247 Done-parent invariant throws. Before #513 the read was
// wrapped in `try { … } catch { parentState = null; /* fail open */ }` and the
// refusal only fired for `parentState != null`, so a failed read silently skipped
// the gate and the sub-issue was created without verifying the invariant —
// fail-OPEN.
//
// The fix routes the failure through a pure
// `decideParentStateReadFailure({ readFailed, override })` helper
// (lib/parent-state-gate.mjs) and `die`s on the fail-closed path BEFORE any
// `gh issue create`. The explicit `AITM_SKIP_PARENT_STATE_GATE=1` override stays
// available for legitimate internal/testing use.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decideParentStateReadFailure } from '../../../lib/parent-state-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const createSrc = readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'gh', 'create-issue.mjs'),
  'utf8'
);

// ── AC1: a parent-state read failure fails closed ──────────────────────────────

test('decideParentStateReadFailure: read failure without override fails closed, exit 2', () => {
  const d = decideParentStateReadFailure({ readFailed: true, override: false });
  assert.equal(d.failClosed, true);
  assert.equal(d.exitCode, 2);
  assert.match(d.message, /AITM_SKIP_PARENT_STATE_GATE/);
});

// ── AC2: the explicit override path stays open ─────────────────────────────────

test('decideParentStateReadFailure: read failure WITH override continues', () => {
  const d = decideParentStateReadFailure({ readFailed: true, override: true });
  assert.equal(d.failClosed, false);
});

test('decideParentStateReadFailure: a successful read never fails closed', () => {
  const d = decideParentStateReadFailure({ readFailed: false, override: false });
  assert.equal(d.failClosed, false);
});

test('decideParentStateReadFailure: total over missing inputs (treated as no failure)', () => {
  assert.equal(decideParentStateReadFailure().failClosed, false);
  assert.equal(decideParentStateReadFailure({}).failClosed, false);
});

// ── AC3: create-issue.mjs wiring leaves no fail-open fall-through ───────────────

test('source: parent-state catch no longer fails open with a null assignment', () => {
  assert.ok(
    !/catch \{\s*parentState = null; \/\/ fail open[^\n]*\n\s*\}/.test(createSrc),
    'parent-state catch must not silently null-out the state (fail-open)'
  );
});

test('source: parent-state read failure routes through decideParentStateReadFailure', () => {
  assert.ok(
    /decideParentStateReadFailure\(/.test(createSrc),
    'create-issue.mjs must call decideParentStateReadFailure'
  );
  assert.ok(
    /import\(\s*(['"])[^'"]*parent-state-gate\.mjs\1\s*\)/.test(createSrc) ||
      /import \{[^}]*decideParentStateReadFailure[^}]*\} from '[^']*parent-state-gate\.mjs'/s.test(
        createSrc
      ),
    'decideParentStateReadFailure must be imported from lib/parent-state-gate.mjs'
  );
});

test('source: fail-closed parent-read failure dies before any gh issue create', () => {
  const idx = createSrc.indexOf('decideParentStateReadFailure(');
  assert.ok(idx >= 0);
  const after = createSrc.slice(idx, idx + 600);
  assert.ok(
    /failClosed/.test(after) && /die\(/.test(after),
    'failClosed branch must die before issue creation'
  );
  // The decision + die must precede the `ghCreate(...)` invocation that runs
  // `gh issue create` (the `ghCreate` *definition* sits earlier in the file, so
  // we key on the call site, not the literal).
  const createIdx = createSrc.indexOf('ghCreate(ghArgs');
  assert.ok(createIdx >= 0, 'expected a ghCreate(ghArgs ...) invocation in create-issue.mjs');
  assert.ok(createIdx > idx, 'decideParentStateReadFailure must be evaluated before issue create');
});

test('source: the explicit AITM_SKIP_PARENT_STATE_GATE override path remains', () => {
  assert.ok(
    /AITM_SKIP_PARENT_STATE_GATE/.test(createSrc),
    'the explicit override env guard must remain available'
  );
});
