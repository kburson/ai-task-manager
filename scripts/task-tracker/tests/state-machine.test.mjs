#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { STATES, FORWARD, BACKWARD, validateTransition } from '../state-machine.mjs';

test('STATES is the canonical 7-state chain in order', () => {
  assert.deepEqual(STATES, [
    'backlog', 'groom', 'analyze', 'development', 'validate', 'review', 'done',
  ]);
});

test('FORWARD covers every adjacent forward pair', () => {
  const pairs = [
    ['backlog', 'groom'],
    ['groom', 'analyze'],
    ['analyze', 'development'],
    ['development', 'validate'],
    ['validate', 'review'],
    ['review', 'done'],
  ];
  for (const [from, to] of pairs) {
    assert.equal(FORWARD[from], to, `FORWARD[${from}] should be ${to}`);
    assert.deepEqual(validateTransition(from, to), { ok: true });
  }
});

test('BACKWARD allows validate→development and review→development', () => {
  assert.equal(BACKWARD.validate, 'development');
  assert.equal(BACKWARD.review, 'development');
  assert.deepEqual(validateTransition('validate', 'development'), { ok: true });
  assert.deepEqual(validateTransition('review', 'development'), { ok: true });
});

test('same-state transitions refuse', () => {
  for (const s of STATES) {
    const r = validateTransition(s, s);
    assert.equal(r.ok, false);
    assert.match(r.reason, /illegal transition/);
  }
});

test('skip-forward transitions refuse', () => {
  const cases = [
    ['backlog', 'development'],
    ['backlog', 'done'],
    ['groom', 'development'],
    ['analyze', 'validate'],
    ['development', 'review'],
    ['development', 'done'],
  ];
  for (const [from, to] of cases) {
    const r = validateTransition(from, to);
    assert.equal(r.ok, false, `${from}→${to} should refuse`);
    assert.match(r.reason, /illegal transition/);
  }
});

test('illegal backward transitions refuse', () => {
  const cases = [
    ['done', 'review'],
    ['done', 'development'],
    ['analyze', 'groom'],
    ['groom', 'backlog'],
    ['validate', 'analyze'],
    ['review', 'validate'],
  ];
  for (const [from, to] of cases) {
    const r = validateTransition(from, to);
    assert.equal(r.ok, false, `${from}→${to} should refuse`);
    assert.match(r.reason, /illegal transition/);
  }
});

test('unknown state strings refuse with unknown-state message', () => {
  const r1 = validateTransition('bogus', 'groom');
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /unknown state: bogus/);

  const r2 = validateTransition('groom', 'shipped');
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /unknown state: shipped/);

  const r3 = validateTransition('', '');
  assert.equal(r3.ok, false);
  assert.match(r3.reason, /unknown state/);
});

test('refusal message lists allowed next states', () => {
  // forward + backward both available
  const r1 = validateTransition('validate', 'backlog');
  assert.match(r1.reason, /Allowed: review, development/);
  // forward only (no backward defined)
  const r2 = validateTransition('groom', 'validate');
  assert.match(r2.reason, /Allowed: analyze/);
  // terminal state (no forward, no backward)
  const r3 = validateTransition('done', 'review');
  assert.match(r3.reason, /Allowed: none/);
});
