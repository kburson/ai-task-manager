#!/usr/bin/env node
// @story #511
// `move-state.mjs` must fail CLOSED when the issue-body fetch that feeds the
// entry/exit guard pipeline throws on a body-gated transition (Test, Review,
// Done).
//
// Before #511 the fetch was wrapped in a `try { … } catch { /* empty body means
// no marker means guard passes */ }` that swallowed the failure and left
// `guardBody = ''`. The body-gated entry guards short-circuit to `{ ok: true }`
// on an empty body, so a failed fetch silently skipped the Test/Review/Done
// structural gates and the board move proceeded — fail-OPEN.
//
// The fix routes the failure through a pure
// `decideBodyFetchFailure({ toState, fetchFailed, force })` helper
// (lib/body-fetch-gate.mjs) and exits non-zero on the fail-closed path BEFORE the
// `project item-edit` board mutation. `--force` remains a deliberate bypass and
// non-gated targets keep tolerating an absent body.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decideBodyFetchFailure, BODY_GATED_STATES } from '../../lib/body-fetch-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moveSrc = readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'gh', 'move-state.mjs'),
  'utf8'
);

// ── AC1: decision helper fails closed on a gated-move body-fetch failure ───────

test('decideBodyFetchFailure: fetch failure into a gated state fails closed, exit 3', () => {
  for (const state of ['test', 'review', 'done']) {
    const d = decideBodyFetchFailure({ toState: state, fetchFailed: true, force: false });
    assert.equal(d.failClosed, true, `${state} must fail closed`);
    assert.equal(d.exitCode, 3);
    assert.match(d.message, new RegExp(state));
  }
});

test('decideBodyFetchFailure: fetch failure into a non-gated state continues', () => {
  for (const state of ['backlog', 'on-deck', 'refine', 'plan', 'develop']) {
    const d = decideBodyFetchFailure({ toState: state, fetchFailed: true, force: false });
    assert.equal(d.failClosed, false, `${state} is not body-gated`);
  }
});

test('decideBodyFetchFailure: gated fetch failure WITH --force continues (deliberate bypass)', () => {
  const d = decideBodyFetchFailure({ toState: 'done', fetchFailed: true, force: true });
  assert.equal(d.failClosed, false);
});

test('decideBodyFetchFailure: a successful fetch never fails closed', () => {
  const d = decideBodyFetchFailure({ toState: 'review', fetchFailed: false, force: false });
  assert.equal(d.failClosed, false);
});

test('decideBodyFetchFailure: total over missing toState (treated as non-gated)', () => {
  const d = decideBodyFetchFailure({ fetchFailed: true, force: false });
  assert.equal(d.failClosed, false);
});

test('BODY_GATED_STATES is exactly the body-reading entry-guard states', () => {
  assert.deepEqual([...BODY_GATED_STATES].sort(), ['done', 'review', 'test']);
});

// ── AC2 + AC3: move-state.mjs wiring leaves no fail-open fall-through ───────────

test('source: body-fetch catch no longer swallows failure as a passing empty body', () => {
  // The old fail-open shape: catch whose body is ONLY the "guard passes" comment.
  assert.ok(
    !/catch \{\s*\/\* ignore — empty body means no marker means guard passes \*\/\s*\}/.test(
      moveSrc
    ),
    'body-fetch catch must not silently swallow the failure (fail-open)'
  );
});

test('source: body-fetch failure routes through decideBodyFetchFailure', () => {
  assert.ok(
    /decideBodyFetchFailure\(/.test(moveSrc),
    'move-state.mjs must call decideBodyFetchFailure'
  );
  assert.ok(
    /import \{[^}]*decideBodyFetchFailure[^}]*\} from '[^']*body-fetch-gate\.mjs'/s.test(moveSrc),
    'decideBodyFetchFailure must be imported from lib/body-fetch-gate.mjs'
  );
});

test('source: fail-closed body-fetch failure exits before the board mutation', () => {
  const idx = moveSrc.indexOf('decideBodyFetchFailure(');
  assert.ok(idx >= 0);
  const after = moveSrc.slice(idx, idx + 600);
  assert.ok(
    /failClosed/.test(after) && /process\.exit\(/.test(after),
    'failClosed branch must process.exit before the project item-edit mutation'
  );
  // The decision + exit must precede the board-mutation call site.
  const mutIdx = moveSrc.indexOf("'item-edit'");
  assert.ok(mutIdx > idx, 'decideBodyFetchFailure must be evaluated before item-edit');
});
