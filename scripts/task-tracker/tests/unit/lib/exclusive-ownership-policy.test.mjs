// @story #1212
import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalLogins, ownershipDecision } from '../../../lib/ownership-policy.mjs';

const decide = (overrides = {}) =>
  ownershipDecision({
    state: 'refine',
    assignees: [],
    currentUser: 'alice',
    mode: 'interactive',
    transition: null,
    ...overrides,
  });

test('canonicalLogins normalizes case and preserves invalid duplicate ownership evidence', () => {
  assert.deepEqual(canonicalLogins(['Alice', { login: 'BOB' }]), ['alice', 'bob']);
  assert.deepEqual(canonicalLogins(['Alice', 'alice']), ['alice', 'alice']);
});

test('unassigned team work is allowed through Plan without claiming', () => {
  for (const state of ['backlog', 'refine', 'ready-for-plan', 'plan']) {
    assert.deepEqual(decide({ state, mode: 'full-auto' }), {
      ok: true,
      kind: 'team-unassigned',
      currentUser: 'alice',
      owners: [],
    });
  }
});

test('a singleton local owner is authorized in every lifecycle state', () => {
  for (const state of [
    'backlog',
    'refine',
    'ready-for-plan',
    'plan',
    'develop',
    'test',
    'review',
    'done',
  ]) {
    assert.equal(decide({ state, assignees: ['ALICE'] }).kind, 'owned-by-session');
    assert.equal(decide({ state, assignees: ['ALICE'] }).ok, true);
  }
});

test('a foreign singleton owner blocks the current session in every state', () => {
  for (const state of [
    'backlog',
    'refine',
    'ready-for-plan',
    'plan',
    'develop',
    'test',
    'review',
  ]) {
    assert.deepEqual(decide({ state, assignees: ['Bob'] }), {
      ok: false,
      kind: 'foreign-owner',
      currentUser: 'alice',
      owners: ['bob'],
    });
  }
});

test('multiple assignees are invalid even when one login matches the current session', () => {
  assert.deepEqual(decide({ assignees: ['alice', 'bob'] }), {
    ok: false,
    kind: 'multiple-owners',
    currentUser: 'alice',
    owners: ['alice', 'bob'],
  });
  assert.equal(decide({ assignees: ['Alice', 'alice'] }).kind, 'multiple-owners');
});

test('Plan to Develop claims only an unassigned Full-Auto story', () => {
  assert.deepEqual(decide({ state: 'plan', transition: 'develop', mode: 'full-auto' }), {
    ok: false,
    action: 'claim',
    kind: 'claim-at-commitment',
    currentUser: 'alice',
    owners: [],
  });
  assert.equal(
    decide({
      state: 'plan',
      transition: 'develop',
      mode: 'full-auto',
      assignees: ['bob'],
    }).kind,
    'foreign-owner'
  );
});

test('interactive Plan to Develop prompts instead of silently claiming', () => {
  assert.deepEqual(decide({ state: 'plan', transition: 'develop' }), {
    ok: false,
    action: 'prompt',
    kind: 'assignment-required',
    currentUser: 'alice',
    owners: [],
  });
});

test('lost in-flight ownership blocks Full-Auto and requires human coordination', () => {
  for (const state of ['develop', 'test', 'review']) {
    assert.deepEqual(decide({ state, mode: 'full-auto' }), {
      ok: false,
      action: 'prompt',
      kind: 'human-coordination-required',
      currentUser: 'alice',
      owners: [],
    });
  }
});

test('unverifiable identity or ownership fails closed', () => {
  assert.equal(decide({ currentUser: '' }).kind, 'ownership-unverifiable');
  assert.equal(decide({ assignees: null }).kind, 'ownership-unverifiable');
  assert.equal(decide({ state: 'unknown' }).kind, 'ownership-unverifiable');
});

// The issue's single focused verifier is the durable AC evidence surface.
// Load the production-boundary and transaction suites so that command proves
// more than the pure decision table.
await import('./assignment-snapshot.test.mjs');
await import('../verbs/assign.test.mjs');
await import('../verbs/unassign.test.mjs');
await import('../../integration/lib/ownership-boundaries.integration.test.mjs');
