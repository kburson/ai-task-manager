#!/usr/bin/env node
// @story #62
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  STATES,
  FORWARD,
  BACKWARD,
  validateTransition,
  normalizeStateSlug,
} from '../../../state-machine.mjs';

test('STATES is the canonical 8-state chain in order', () => {
  assert.deepEqual(STATES, [
    'backlog',
    'on-deck',
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
    ['backlog', 'on-deck'],
    ['on-deck', 'refine'],
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

test('no backlog→refine shortcut — every item passes through On Deck', () => {
  assert.equal(FORWARD.backlog, 'on-deck');
  const r = validateTransition('backlog', 'refine');
  assert.equal(r.ok, false);
  assert.match(r.reason, /illegal transition/);
});

test('BACKWARD allows on-deck→backlog, test→develop and review→develop', () => {
  assert.equal(BACKWARD['on-deck'], 'backlog');
  assert.equal(BACKWARD.test, 'develop');
  assert.equal(BACKWARD.review, 'develop');
  assert.deepEqual(validateTransition('on-deck', 'backlog'), { ok: true });
  assert.deepEqual(validateTransition('test', 'develop'), { ok: true });
  assert.deepEqual(validateTransition('review', 'develop'), { ok: true });
});

// #882 — same-state transitions used to refuse; they are now a SATISFIED NO-OP.
// Callers short-circuit on `noop` rather than performing the move, so re-running
// a state's verb in place no longer hits an illegal-transition refusal. Full
// coverage of the rule lives in state-machine-self-transition.test.mjs.
test('same-state transitions are a legal no-op', () => {
  for (const s of STATES) {
    const r = validateTransition(s, s);
    assert.equal(r.ok, true);
    assert.equal(r.noop, true);
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

// #436 — regression: normalizeStateSlug must collapse a multi-word board
// display name to its canonical kebab slug. Before the fix it only lowercased,
// so "On Deck" (the first multi-word state, added in #433) resolved to
// "on deck" (space) and downstream consumers — the live-board-status → slug
// path #433's AC5 never exercised — rejected it as an unknown stage.
test('normalizeStateSlug maps the multi-word display name "On Deck" to "on-deck"', () => {
  assert.equal(normalizeStateSlug('On Deck'), 'on-deck');
});

test('normalizeStateSlug collapses interior whitespace runs and trims', () => {
  assert.equal(normalizeStateSlug('  On   Deck  '), 'on-deck');
  assert.equal(normalizeStateSlug('On\tDeck'), 'on-deck');
  assert.equal(normalizeStateSlug('On Deck Soon'), 'on-deck-soon');
});

test('normalizeStateSlug leaves every single-word state slug unchanged', () => {
  const displayNames = ['Backlog', 'Refine', 'Plan', 'Develop', 'Test', 'Review', 'Done'];
  for (const name of displayNames) {
    const slug = name.toLowerCase();
    assert.equal(normalizeStateSlug(name), slug, `${name} should normalize to ${slug}`);
    assert.ok(STATES.includes(slug), `${slug} should be a canonical state`);
  }
  // the canonical slug round-trips unchanged (idempotent)
  for (const slug of STATES) {
    assert.equal(normalizeStateSlug(slug), slug, `${slug} should be idempotent`);
  }
});

test('normalizeStateSlug returns null for null/undefined input', () => {
  assert.equal(normalizeStateSlug(null), null);
  assert.equal(normalizeStateSlug(undefined), null);
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
