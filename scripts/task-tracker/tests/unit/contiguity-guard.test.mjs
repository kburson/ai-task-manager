// @story #252
// Tests for evaluateContiguity (scripts/task-tracker/lib/stage-entry-markers.mjs)
// — the #252 forward-transition contiguity guard's pure decision function. The
// single state-mutator (move-state.mjs) wraps this with body-fetch + stderr +
// process.exit + audit-comment IO; the decision logic itself is exercised here
// without network so every branch is covered deterministically.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateContiguity } from '../../lib/stage-entry-markers.mjs';

const M = (...stages) =>
  stages.map((s) => `<!-- aitm-entered-${s}: 2026-06-01T00:00:00.000Z -->`).join('\n');

// ── forward move, full prior prefix present → allow ──────────────────────────

test('forward move with all prior markers → allow', () => {
  const body = M('backlog', 'refine', 'plan');
  const v = evaluateContiguity({ fromState: 'plan', toState: 'develop', body });
  assert.equal(v.action, 'allow');
  assert.deepEqual(v.missing, []);
});

test('first forward move (backlog→refine) with backlog marker → allow', () => {
  const v = evaluateContiguity({ fromState: 'backlog', toState: 'refine', body: M('backlog') });
  assert.equal(v.action, 'allow');
});

// ── forward move, immediately-prior hole → refuse ────────────────────────────

test('forward move missing immediately-prior marker → refuse, names it', () => {
  // plan→develop but no plan marker
  const body = M('backlog', 'refine');
  const v = evaluateContiguity({ fromState: 'plan', toState: 'develop', body });
  assert.equal(v.action, 'refuse');
  assert.deepEqual(v.missing, ['plan']);
  assert.match(v.message, /aitm-entered-plan/);
});

// ── forward move, TWO-back hole (the #251 shape) → refuse ─────────────────────

test('forward move with a two-back hole (refine missing on plan→develop) → refuse', () => {
  // The exact #251 failure: refine marker clobbered, surfaced at plan→develop.
  // An immediately-prior-only check would inspect `plan` (present) and miss it.
  const body = M('backlog', 'plan');
  const v = evaluateContiguity({ fromState: 'plan', toState: 'develop', body });
  assert.equal(v.action, 'refuse');
  assert.deepEqual(v.missing, ['refine']);
  assert.match(v.message, /aitm-entered-refine/);
});

test('forward move with multiple prior holes → refuse, lists all missing', () => {
  // develop→test with only backlog present; refine, plan, develop all missing.
  const body = M('backlog');
  const v = evaluateContiguity({ fromState: 'develop', toState: 'test', body });
  assert.equal(v.action, 'refuse');
  assert.deepEqual(v.missing, ['refine', 'plan', 'develop']);
});

// ── backward / rework transitions → skip (never blocked) ─────────────────────

test('rework develop→plan → skip', () => {
  const v = evaluateContiguity({ fromState: 'develop', toState: 'plan', body: M('backlog') });
  assert.equal(v.action, 'skip');
});

test('rework review→develop → skip', () => {
  const v = evaluateContiguity({ fromState: 'review', toState: 'develop', body: '' });
  assert.equal(v.action, 'skip');
});

test('rework plan→backlog → skip', () => {
  const v = evaluateContiguity({ fromState: 'plan', toState: 'backlog', body: '' });
  assert.equal(v.action, 'skip');
});

// ── re-entry after a bounce → skip (test→develop is backward) ─────────────────

test('re-entry develop after a test bounce (test→develop) → skip', () => {
  const v = evaluateContiguity({
    fromState: 'test',
    toState: 'develop',
    body: M('backlog', 'refine', 'plan', 'develop'),
  });
  assert.equal(v.action, 'skip');
});

// ── offline / unknown stage → skip ───────────────────────────────────────────

test('empty fromState (offline, no live Status) → skip', () => {
  const v = evaluateContiguity({ fromState: '', toState: 'develop', body: M('backlog') });
  assert.equal(v.action, 'skip');
});

test('unknown target stage → skip', () => {
  const v = evaluateContiguity({ fromState: 'plan', toState: 'bogus', body: '' });
  assert.equal(v.action, 'skip');
});

test('same-state move → skip', () => {
  const v = evaluateContiguity({ fromState: 'develop', toState: 'develop', body: '' });
  assert.equal(v.action, 'skip');
});

// ── FORCE override → bypass with audit payload ───────────────────────────────

test('force override on a prefix hole → bypass, carries missing + message', () => {
  const body = M('backlog', 'plan'); // refine hole
  const v = evaluateContiguity({ fromState: 'plan', toState: 'develop', body, force: true });
  assert.equal(v.action, 'bypass');
  assert.deepEqual(v.missing, ['refine']);
  assert.match(v.message, /plan → develop/);
  assert.match(v.message, /aitm-entered-refine/);
});

test('force override is a no-op when there is no hole → allow', () => {
  const body = M('backlog', 'refine', 'plan');
  const v = evaluateContiguity({ fromState: 'plan', toState: 'develop', body, force: true });
  assert.equal(v.action, 'allow');
});

// ── visit-numbered markers count as present ──────────────────────────────────

test('re-entry visit markers (aitm-entered-develop-2) count as present', () => {
  const body = `${M('backlog', 'refine', 'plan')}\n<!-- aitm-entered-develop: 2026-06-01T00:00:00.000Z -->\n<!-- aitm-entered-develop-2: 2026-06-01T01:00:00.000Z -->`;
  const v = evaluateContiguity({ fromState: 'develop', toState: 'test', body });
  assert.equal(v.action, 'allow');
});
