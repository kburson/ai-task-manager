#!/usr/bin/env node
// @story #673
// Coverage for scripts/task-tracker/lib/pickup-directive-gate.mjs.
//
// isPickupDirectiveEligible(kanbanState): pure predicate over the issue's
// kanban state — eligible at `plan` and every later state in the verb chain,
// not eligible at `backlog`/`on-deck`/`refine`, and fails closed (not
// eligible) on unknown/missing state.
//
// formatPickupDirectiveDeferredBanner(ref, kanbanState): the routing banner
// printed in place of pickup-directive instructions when ineligible; asserts
// it names `/task promote` from `refine` and `/task refine` from earlier
// states.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  isPickupDirectiveEligible,
  formatPickupDirectiveDeferredBanner,
} from '../../lib/pickup-directive-gate.mjs';

test('isPickupDirectiveEligible: early states (AC1 — suppression)', () => {
  assert.equal(isPickupDirectiveEligible('backlog'), false);
  assert.equal(isPickupDirectiveEligible('on-deck'), false);
  assert.equal(isPickupDirectiveEligible('refine'), false);
});

test('isPickupDirectiveEligible: plan boundary is eligible', () => {
  assert.equal(isPickupDirectiveEligible('plan'), true);
});

test('isPickupDirectiveEligible: late states (AC2 — pass-through)', () => {
  assert.equal(isPickupDirectiveEligible('develop'), true);
  assert.equal(isPickupDirectiveEligible('test'), true);
  assert.equal(isPickupDirectiveEligible('review'), true);
  assert.equal(isPickupDirectiveEligible('done'), true);
});

test('isPickupDirectiveEligible: unknown/missing state fails closed', () => {
  assert.equal(isPickupDirectiveEligible('bogus-state'), false);
  assert.equal(isPickupDirectiveEligible(''), false);
  assert.equal(isPickupDirectiveEligible(undefined), false);
  assert.equal(isPickupDirectiveEligible(null), false);
});

test('formatPickupDirectiveDeferredBanner: routes refine -> promote', () => {
  const banner = formatPickupDirectiveDeferredBanner('#673', 'refine');
  assert.match(banner, /PICKUP DIRECTIVE DEFERRED — #673 \(state: refine\)/);
  assert.match(banner, /\/task promote #673/);
});

test('formatPickupDirectiveDeferredBanner: routes backlog\\/on-deck -> refine', () => {
  const backlogBanner = formatPickupDirectiveDeferredBanner('#673', 'backlog');
  assert.match(backlogBanner, /\/task refine #673/);
  const onDeckBanner = formatPickupDirectiveDeferredBanner('#673', 'on-deck');
  assert.match(onDeckBanner, /\/task refine #673/);
});
