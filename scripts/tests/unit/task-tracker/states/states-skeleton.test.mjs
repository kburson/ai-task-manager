#!/usr/bin/env node
// @story #309 #1025
// State-object skeleton tests (#292, parent epic #259).
//
// Asserts each `scripts/task-tracker/states/<state>.mjs` module exports the
// `{ name, entryGuards, exitGuards, onEnter }` container shape, that `STATES`
// contains exactly the eight kanban state names, and that `FORWARD_CHAIN`
// covers the documented edges. Shape-only — no behavior assertions; the
// parity test covers guard behavior.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { STATES, FORWARD_CHAIN, getState } from '../../../../task-tracker/states/index.mjs';

const EXPECTED_NAMES = [
  'backlog',
  'refine',
  'ready-for-plan',
  'plan',
  'develop',
  'test',
  'review',
  'done',
];

function assertGuard(guard, label) {
  assert.equal(typeof guard.id, 'string', `${label}: guard.id must be a string`);
  assert.ok(guard.id.length > 0, `${label}: guard.id must be non-empty`);
  assert.equal(typeof guard.run, 'function', `${label}: guard.run must be a function`);
}

function assertAction(action, label) {
  assert.equal(typeof action.id, 'string', `${label}: action.id must be a string`);
  assert.ok(action.id.length > 0, `${label}: action.id must be non-empty`);
  assert.equal(typeof action.run, 'function', `${label}: action.run must be a function`);
}

describe('states-skeleton: STATES map', () => {
  it('contains exactly the eight kanban states', () => {
    assert.deepEqual(Object.keys(STATES).sort(), [...EXPECTED_NAMES].sort());
  });

  it('STATES map is frozen', () => {
    assert.equal(Object.isFrozen(STATES), true);
  });

  it('getState returns each state and throws on unknown', () => {
    for (const name of EXPECTED_NAMES) {
      const s = getState(name);
      assert.equal(s.name, name);
    }
    assert.throws(() => getState('nonsense'), /unknown state/);
  });
});

describe('states-skeleton: per-state container shape', () => {
  for (const name of EXPECTED_NAMES) {
    it(`${name}: exports { name, entryGuards, exitGuards, onEnter }`, () => {
      const s = STATES[name];
      assert.ok(s, `STATES.${name} missing`);
      assert.equal(s.name, name);
      assert.ok(Array.isArray(s.entryGuards), `${name}.entryGuards must be an array`);
      assert.ok(Array.isArray(s.exitGuards), `${name}.exitGuards must be an array`);
      assert.ok(Array.isArray(s.onEnter), `${name}.onEnter must be an array`);
      assert.equal(Object.isFrozen(s), true, `${name} container must be frozen`);
      assert.equal(Object.isFrozen(s.entryGuards), true, `${name}.entryGuards must be frozen`);
      assert.equal(Object.isFrozen(s.exitGuards), true, `${name}.exitGuards must be frozen`);
      assert.equal(Object.isFrozen(s.onEnter), true, `${name}.onEnter must be frozen`);

      for (const g of s.entryGuards) assertGuard(g, `${name}.entryGuards`);
      for (const g of s.exitGuards) assertGuard(g, `${name}.exitGuards`);
      for (const a of s.onEnter) assertAction(a, `${name}.onEnter`);
    });
  }

  it('done is terminal: no exit guards', () => {
    assert.equal(STATES.done.exitGuards.length, 0);
  });
});

describe('states-skeleton: FORWARD_CHAIN', () => {
  it('covers every forward edge in the kanban', () => {
    // Mirrors state-machine.mjs FORWARD: each non-terminal state has exactly
    // one canonical forward successor; done is terminal.
    const expected = {
      backlog: 'refine',
      refine: 'ready-for-plan',
      'ready-for-plan': 'plan',
      plan: 'develop',
      develop: 'test',
      test: 'review',
      review: 'done',
    };
    assert.deepEqual({ ...FORWARD_CHAIN }, expected);
  });
});
