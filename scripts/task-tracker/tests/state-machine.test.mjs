#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { STATES, FORWARD, BACKWARD, validateTransition } from '../state-machine.mjs';

test('STATES is the canonical 7-state chain in order', () => {
  assert.deepEqual(STATES, [
    'backlog',
    'refine',
    'plan',
    'develop',
    'test',
    'review',
    'done',
  ]);
});

test('FORWARD covers every adjacent forward pair', () => {
  const pairs = [
    ['backlog', 'refine'],
    ['refine', 'plan'],
    ['plan', 'develop'],
    ['develop', 'test'],
    ['test', 'review'],
    ['review', 'done'],
  ];
  for (const [from, to] of pairs) {
    assert.equal(FORWARD[from], to, `FORWARD[${from}] should be ${to}`);
    assert.deepEqual(validateTransition(from, to), { ok: true });
  }
});

test('BACKWARD allows test→develop and review→develop', () => {
  assert.equal(BACKWARD.test, 'develop');
  assert.equal(BACKWARD.review, 'develop');
  assert.deepEqual(validateTransition('test', 'develop'), { ok: true });
  assert.deepEqual(validateTransition('review', 'develop'), { ok: true });
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
    ['backlog', 'develop'],
    ['backlog', 'done'],
    ['refine', 'develop'],
    ['plan', 'test'],
    ['develop', 'review'],
    ['develop', 'done'],
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
    ['done', 'develop'],
    ['plan', 'refine'],
    ['refine', 'backlog'],
    ['test', 'plan'],
    ['review', 'test'],
  ];
  for (const [from, to] of cases) {
    const r = validateTransition(from, to);
    assert.equal(r.ok, false, `${from}→${to} should refuse`);
    assert.match(r.reason, /illegal transition/);
  }
});

test('unknown state strings refuse with unknown-state message', () => {
  const r1 = validateTransition('bogus', 'refine');
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /unknown state: bogus/);

  const r2 = validateTransition('refine', 'shipped');
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /unknown state: shipped/);

  const r3 = validateTransition('', '');
  assert.equal(r3.ok, false);
  assert.match(r3.reason, /unknown state/);
});

test('refusal message lists allowed next states', () => {
  // forward + backward both available
  const r1 = validateTransition('test', 'backlog');
  assert.match(r1.reason, /Allowed: review, develop/);
  // forward only (no backward defined)
  const r2 = validateTransition('refine', 'test');
  assert.match(r2.reason, /Allowed: plan/);
  // terminal state (no forward, no backward)
  const r3 = validateTransition('done', 'review');
  assert.match(r3.reason, /Allowed: none/);
});
