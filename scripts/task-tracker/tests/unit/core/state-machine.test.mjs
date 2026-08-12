#!/usr/bin/env node
// @story #62
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  backwardTargets,
  forwardTarget,
  normalizeStateId as normalizeStateSlug,
  stateIds,
  validateTransition,
} from '../../../lib/lifecycle-policy/index.mjs';

const STATES = stateIds();
const FORWARD = Object.fromEntries(
  STATES.flatMap((state) => {
    const target = forwardTarget(state);
    return target == null ? [] : [[state, target]];
  })
);
const BACKWARD = Object.fromEntries(
  STATES.flatMap((state) => {
    const targets = backwardTargets(state);
    return targets.length === 0 ? [] : [[state, targets.length === 1 ? targets[0] : [...targets]]];
  })
);

test('STATES is the canonical 8-state chain in order', () => {
  assert.deepEqual(STATES, [
    'backlog',
    'refine',
    'ready-for-plan',
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
    ['refine', 'ready-for-plan'],
    ['ready-for-plan', 'plan'],
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

test('no refine→plan shortcut — every refined item passes through Ready for Planning', () => {
  assert.equal(FORWARD.refine, 'ready-for-plan');
  const r = validateTransition('refine', 'plan');
  assert.equal(r.ok, false);
  assert.match(r.reason, /illegal transition/);
});

test('BACKWARD allows R4P→backlog, test→develop and review→develop', () => {
  assert.equal(BACKWARD['ready-for-plan'], 'backlog');
  assert.equal(BACKWARD.test, 'develop');
  assert.deepEqual(BACKWARD.review, ['develop', 'test']);
  assert.deepEqual(validateTransition('ready-for-plan', 'backlog'), { ok: true });
  assert.deepEqual(validateTransition('test', 'develop'), { ok: true });
  assert.deepEqual(validateTransition('review', 'develop'), { ok: true });
});

// #999 — review→test drift re-verify. #998 taught verb-home-state-guard.mjs
// that `test`'s legal home states include `review`, but the executable policy's
// BACKWARD map was never updated to match, so the board move that guard
// fix was supposed to unlock (`/task test <N>` invoked from `review`) landed
// sandbox verification only to be refused one layer lower at the board move.
test('review→test is a legal backward transition (drift re-verify, #999)', () => {
  assert.deepEqual(validateTransition('review', 'test'), { ok: true });
});

test('review→develop remains legal after #999 widened review to a multi-target array', () => {
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
    ['test', 'plan'],
    ['review', 'plan'],
  ];
  for (const [from, to] of cases) {
    const r = validateTransition(from, to);
    assert.equal(r.ok, false, `${from}→${to} should refuse`);
    assert.match(r.reason, /illegal transition/);
  }
});

// #848 — refine/plan → backlog is the `park` verb's transition (premise
// falsified / deprioritized). #1213 adds the governed Plan→R4P cancellation
// edge without removing Plan→Backlog shelving.
test('refine→backlog, plan→backlog, and plan→R4P are legal', () => {
  assert.equal(BACKWARD.refine, 'backlog');
  assert.deepEqual(BACKWARD.plan, ['backlog', 'ready-for-plan']);
  assert.deepEqual(validateTransition('refine', 'backlog'), { ok: true });
  assert.deepEqual(validateTransition('plan', 'backlog'), { ok: true });
  assert.deepEqual(validateTransition('plan', 'ready-for-plan'), { ok: true });
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

test('normalizeStateSlug maps the canonical display name to ready-for-plan', () => {
  assert.equal(normalizeStateSlug('Ready for Planning'), 'ready-for-plan');
});

// #436 originally pinned whitespace-to-hyphen normalization for the multi-word
// `On Deck` display name added by #433. #1206 retains that spelling as a read
// alias while projecting it onto the canonical `ready-for-plan` state.
test('normalizeStateSlug preserves historical On Deck display-name compatibility', () => {
  assert.equal(normalizeStateSlug('On Deck'), 'ready-for-plan');
  assert.equal(normalizeStateSlug('  On   Deck  '), 'ready-for-plan');
  assert.equal(normalizeStateSlug('On\tDeck'), 'ready-for-plan');
  assert.equal(normalizeStateSlug('Assigned'), 'ready-for-plan');
  assert.equal(normalizeStateSlug('Assigned Soon'), 'assigned-soon');
});

test('normalizeStateSlug maps every canonical display name to its state id', () => {
  const displayNames = [
    ['Backlog', 'backlog'],
    ['Refine', 'refine'],
    ['Ready for Planning', 'ready-for-plan'],
    ['Plan', 'plan'],
    ['Develop', 'develop'],
    ['Test', 'test'],
    ['Review', 'review'],
    ['Done', 'done'],
  ];
  for (const [name, slug] of displayNames) {
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
  const r2 = validateTransition('ready-for-plan', 'test');
  assert.match(r2.reason, /Allowed: plan, backlog/);
  // terminal state (no forward, no backward)
  const r3 = validateTransition('done', 'review');
  assert.match(r3.reason, /Allowed: none/);
});
