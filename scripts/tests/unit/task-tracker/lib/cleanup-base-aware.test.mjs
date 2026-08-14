#!/usr/bin/env node
// @story #871
// #871 — unit tests for the base-aware post-close cleanup contract
// (`lib/cleanup-base-aware.mjs`).
//
// The behavior under test is the one the contract exists to guarantee: BOTH
// cleanup decisions — the prune predicate and the rebase target — are evaluated
// against `--base`, never against a hardcoded `origin/trunk`. Mid-epic, that is
// the difference between reaping merged children and reaping nothing, and
// between leaving survivors on the epic head and dragging them back to trunk.
//
// Coverage:
//   - resolveCleanupBase: explicit `--base` wins; default is `origin/trunk`;
//     blank/whitespace falls back to the default.
//   - planBaseAwareCleanup with `--base <epic-branch>`: the child whose `[#N]`
//     commit is reachable on the epic branch is pruned, and the surviving
//     sibling rebases onto the epic branch, NOT `origin/trunk`.
//   - the reachability probe is called with the resolved base, so the predicate
//     cannot silently consult a different ref than the rebase target uses.
//   - the default invocation still plans against `origin/trunk`.
//   - malformed input fails loud rather than silently skipping a child.

import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  DEFAULT_CLEANUP_BASE,
  planBaseAwareCleanup,
  resolveCleanupBase,
} from '../../../../task-tracker/lib/cleanup-base-aware.mjs';

const EPIC_BRANCH = 'feature/epic/871';

// Two children of the same epic: #872 has merged back into the epic branch,
// #873 is still in flight. Only #872's `[#N]` token is reachable from the epic
// head; neither is on trunk yet, because the epic PR has not merged.
const CHILDREN = [
  { issue: 872, branch: 'feature/child/872', worktree: '.claude/worktrees/child-872' },
  { issue: 873, branch: 'feature/child/873', worktree: '.claude/worktrees/child-873' },
];

const REACHABLE_FROM = {
  [EPIC_BRANCH]: new Set([872]),
  'origin/trunk': new Set(),
};

function stubReachable({ issue, base }) {
  return REACHABLE_FROM[base]?.has(issue) ?? false;
}

test('resolveCleanupBase defaults to origin/trunk and honors an explicit base', () => {
  assert.equal(DEFAULT_CLEANUP_BASE, 'origin/trunk');
  assert.equal(resolveCleanupBase(), 'origin/trunk');
  assert.equal(resolveCleanupBase({}), 'origin/trunk');
  assert.equal(resolveCleanupBase({ base: '   ' }), 'origin/trunk');
  assert.equal(resolveCleanupBase({ base: EPIC_BRANCH }), EPIC_BRANCH);
  assert.equal(resolveCleanupBase({ base: `  ${EPIC_BRANCH}  ` }), EPIC_BRANCH);
});

test('--base <epic-branch>: merged child is pruned, survivor rebases onto the epic branch', () => {
  const plan = planBaseAwareCleanup({
    base: EPIC_BRANCH,
    children: CHILDREN,
    isReachable: stubReachable,
  });

  assert.equal(plan.base, EPIC_BRANCH);

  // The child already merged back into the epic is prunable mid-epic, even
  // though its commit is nowhere near trunk.
  assert.deepEqual(
    plan.prune.map((c) => c.issue),
    [872]
  );
  assert.equal(plan.prune[0].worktree, '.claude/worktrees/child-872');

  // The survivor stays, and its rebase target is the epic branch — the whole
  // point of the contract. A hardcoded origin/trunk here is the defect.
  assert.deepEqual(
    plan.rebase.map((c) => c.issue),
    [873]
  );
  assert.equal(plan.rebase[0].onto, EPIC_BRANCH);
  assert.notEqual(plan.rebase[0].onto, 'origin/trunk');
});

test('the reachability probe is consulted with the same resolved base the rebase targets', () => {
  const seen = [];
  const plan = planBaseAwareCleanup({
    base: EPIC_BRANCH,
    children: CHILDREN,
    isReachable: (args) => {
      seen.push(args);
      return stubReachable(args);
    },
  });

  assert.deepEqual(
    seen.map((s) => s.base),
    [EPIC_BRANCH, EPIC_BRANCH]
  );
  assert.deepEqual(
    seen.map((s) => s.issue),
    [872, 873]
  );
  for (const entry of plan.rebase) assert.equal(entry.onto, plan.base);
});

test('default invocation plans against origin/trunk', () => {
  const plan = planBaseAwareCleanup({ children: CHILDREN, isReachable: stubReachable });

  assert.equal(plan.base, 'origin/trunk');
  // Nothing has landed on trunk yet, so nothing is prunable and every survivor
  // targets trunk.
  assert.deepEqual(plan.prune, []);
  assert.deepEqual(
    plan.rebase.map((c) => c.onto),
    ['origin/trunk', 'origin/trunk']
  );
});

test('accepts "#N" issue forms and fails loud on a malformed child', () => {
  const plan = planBaseAwareCleanup({
    base: EPIC_BRANCH,
    children: [{ issue: '#872', branch: 'feature/child/872' }],
    isReachable: stubReachable,
  });
  assert.deepEqual(
    plan.prune.map((c) => c.issue),
    [872]
  );

  assert.throws(
    () =>
      planBaseAwareCleanup({
        base: EPIC_BRANCH,
        children: [{ issue: 'not-a-number' }],
        isReachable: stubReachable,
      }),
    /bad child issue number/
  );

  assert.throws(
    () => planBaseAwareCleanup({ base: EPIC_BRANCH, children: CHILDREN }),
    /isReachable/
  );
});
