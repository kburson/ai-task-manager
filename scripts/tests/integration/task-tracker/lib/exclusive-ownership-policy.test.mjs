// @story #1212
// @parallel-unsafe (imports subprocess-spawning commit guard coverage below)
import test from 'node:test';
import '../../../fixtures/offline-gh-auto.mjs';
import assert from 'node:assert/strict';

import {
  canonicalLogins,
  ownershipDecision,
} from '../../../../task-tracker/lib/ownership-policy.mjs';

const taskTrackerModule = await import('../../../../task-tracker/task-tracker.mjs');

test('all governed lifecycle mutators route through exclusive-ownership preflight', () => {
  for (const verb of [
    'plan',
    'test',
    'reconcile',
    'check',
    'ensureChecked',
    'ensureUnchecked',
    'dod-stamp',
    'ac-stamp',
    'kind',
    'epic-reconcile',
    'commit-trace',
    'evidence-markers',
    'block',
    'unblock',
    'user-story',
    'story',
    'inflate-estimate',
    'plan-estimate',
    'mirror-deep-dive',
    'adopt-github-records',
    'log',
    'brainstorm',
    'discover',
    'new',
    'split-plan',
  ]) {
    assert.equal(
      Boolean(taskTrackerModule.PREFLIGHT_MODE?.[verb]),
      true,
      `${verb} must resolve its target and run the shared ownership preflight`
    );
  }
});

test('direct and warm switch-style binds preflight the requested issue ownership', () => {
  assert.deepEqual(
    taskTrackerModule.resolvePreflightInvocation({
      verb: '#1212',
      mode: 'switch-target',
      rest: [],
      stateBefore: { active: '#999' },
    }),
    { target: '#1212', stateBefore: { active: '#1212' } }
  );
  assert.deepEqual(
    taskTrackerModule.resolvePreflightInvocation({
      verb: 'mirror-deep-dive',
      mode: 'target-last-optional',
      rest: ['--from-comment', '4866618296', '1212'],
      stateBefore: { active: '#999' },
    }),
    { target: '#1212', stateBefore: { active: '#999' } }
  );
  assert.deepEqual(
    taskTrackerModule.resolvePreflightInvocation({
      verb: 'start',
      mode: 'switch-target',
      rest: ['1212'],
      stateBefore: { active: '#999' },
    }),
    { target: '#1212', stateBefore: { active: '#1212' } }
  );
  assert.deepEqual(
    taskTrackerModule.resolvePreflightInvocation({
      verb: 'resume',
      mode: 'switch-target',
      rest: [],
      stateBefore: { active: null, lastActive: '#1212', paused: true },
    }),
    {
      target: '#1212',
      stateBefore: { active: '#1212', lastActive: '#1212', paused: true },
    }
  );
});

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
await import('../../../unit/task-tracker/lib/assignment-snapshot.test.mjs');
await import('../../../unit/task-tracker/verbs/assign.test.mjs');
await import('../../../unit/task-tracker/verbs/unassign.test.mjs');
await import('./ownership-boundaries.integration.test.mjs');
await import('./source-edit-gate.cache.test.mjs');
await import('./commit-ownership-message-sources.test.mjs');
await import('../../../unit/task-tracker/lib/gh-edit-guard-body.test.mjs');
