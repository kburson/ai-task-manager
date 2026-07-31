#!/usr/bin/env node
// @story #510
// `/task close` must fail CLOSED when the close-gate evaluation block throws
// (transient `gh issue view` body-fetch failure, JSON.parse error, or an
// exception raised from within `runGuards('review','done', …)`).
//
// Before #510 the gate-eval `try { … } catch (err)` in verbs/close.mjs only ran
// `console.warn('Could not check issue body: …')` and fell through to the
// unconditional terminal `gh issue close` + `clearActive`, silently SKIPPING
// every close gate on any transient failure (fail-OPEN).
//
// The fix routes the catch through a pure `decideGateEvalFailure({ error, force })`
// helper (lib/close-convergence.mjs) and exits non-zero on the non-force path
// BEFORE any mutation. `--force` remains a deliberate, audited bypass.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decideGateEvalFailure } from '../../../lib/close-convergence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const closeSrc = readFileSync(path.resolve(__dirname, '..', '..', 'verbs/close.mjs'), 'utf8');

// ── AC1: decision helper fails closed on a gate-eval error (no --force) ───────

test('decideGateEvalFailure: gate error without --force fails closed, exit 3', () => {
  const d = decideGateEvalFailure({ error: new Error('gh: network blip'), force: false });
  assert.equal(d.failClosed, true);
  assert.equal(d.exitCode, 3);
  assert.match(d.message, /gh: network blip/);
});

test('decideGateEvalFailure: gate error WITH --force continues (deliberate bypass)', () => {
  const d = decideGateEvalFailure({ error: new Error('gh: network blip'), force: true });
  assert.equal(d.failClosed, false);
});

test('decideGateEvalFailure: total over missing error (no throw)', () => {
  const d = decideGateEvalFailure({ force: false });
  assert.equal(d.failClosed, true);
  assert.equal(d.exitCode, 3);
});

// ── AC2 + AC3: close.mjs wiring leaves no fail-open fall-through ───────────────

test('source: gate-eval catch no longer ends in a bare warn-and-fall-through', () => {
  // The old fail-open shape: catch body whose ONLY statement is the warn.
  assert.ok(
    !/catch \(err\) \{\s*console\.warn\(`\[task-tracker\] Could not check issue body: \$\{err\.message\}`\);\s*\}/.test(
      closeSrc
    ),
    'gate-eval catch must not be a bare warn-and-continue (fail-open)'
  );
});

test('source: gate-eval catch routes through decideGateEvalFailure', () => {
  assert.ok(
    /decideGateEvalFailure\(/.test(closeSrc),
    'close.mjs must call decideGateEvalFailure in the gate-eval catch'
  );
  assert.ok(
    /import \{[^}]*decideGateEvalFailure[^}]*\} from '\.\.\/lib\/close-convergence\.mjs'/s.test(
      closeSrc
    ),
    'decideGateEvalFailure must be imported from lib/close-convergence.mjs'
  );
});

test('source: non-force gate-eval failure returns a structured refusal before mutation', () => {
  // The executor must return a refusal outcome. The outer verb applies CLI
  // exit state only after the lease scope and issue lock unwind.
  const idx = closeSrc.indexOf('decideGateEvalFailure(');
  assert.ok(idx >= 0);
  const after = closeSrc.slice(idx, idx + 600);
  assert.ok(
    /failClosed/.test(after) &&
      /return closeOutcome\(\{\s*status:\s*'gate-evaluation-refused',\s*exitCode:\s*decision\.exitCode\s*\}\)/s.test(
        after
      ),
    'failClosed branch must return a structured refusal before any close mutation'
  );
  const finalizeIdx = closeSrc.indexOf('export function finalizeCloseOutcome');
  const executeIdx = closeSrc.indexOf('export async function executeClosePlan');
  assert.ok(finalizeIdx >= 0 && finalizeIdx < executeIdx);
  assert.doesNotMatch(closeSrc.slice(executeIdx), /process\.exit\(/);
});
