#!/usr/bin/env node
// @story #914 (epic #912)
// Unit tests for gated-delivery.mjs — the done-transition VERIFIER that a child
// was merged back into its non-trunk parent and had its branch eliminated.
//
// Pure core: graph + git predicates are injected via `deps`, so no real git is
// touched. GRAPH fixture mirrors the epic tree used across #912's children.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { deliveryOrderingSatisfied, verifyMergeBackForDone } from './gated-delivery.mjs';

// #912 → [913, 914]; #859 → [860] → [872]; #777 standalone story.
const GRAPH = {
  912: { parent: null, children: [913, 914] },
  913: { parent: 912, children: [] },
  914: { parent: 912, children: [] },
  859: { parent: null, children: [860] },
  860: { parent: 859, children: [872] },
  872: { parent: 860, children: [] },
  777: { parent: null, children: [] },
};

function graph(issue) {
  return GRAPH[Number(issue)] || { parent: null, children: [] };
}

// A child of #912; its parent branch is the epic branch feature/epic/912.
const CHILD = 914;
const PARENT_BRANCH = 'feature/epic/912';
const CHILD_BRANCH = 'feature/child/914';

test('deliveryOrderingSatisfied: both true → true', () => {
  assert.equal(deliveryOrderingSatisfied({ gatesPassed: true, mergeVerified: true }), true);
});

test('deliveryOrderingSatisfied: gates fail → false', () => {
  assert.equal(deliveryOrderingSatisfied({ gatesPassed: false, mergeVerified: true }), false);
});

test('deliveryOrderingSatisfied: merge unverified → false (ordering invariant)', () => {
  assert.equal(deliveryOrderingSatisfied({ gatesPassed: true, mergeVerified: false }), false);
});

test('deliveryOrderingSatisfied: no args → false (fail-closed)', () => {
  assert.equal(deliveryOrderingSatisfied(), false);
});

test('verifyMergeBackForDone: child branch gone + reachable → ok merged', () => {
  const r = verifyMergeBackForDone({
    issueNumber: CHILD,
    deps: {
      graph,
      branchExists: () => false,
      commitReachable: () => true,
    },
  });
  assert.deepEqual(r, {
    ok: true,
    childBranch: CHILD_BRANCH,
    parentBranch: PARENT_BRANCH,
    merged: true,
  });
});

test('verifyMergeBackForDone: child branch gone, no reachability probe → ok (trusts elimination)', () => {
  const r = verifyMergeBackForDone({
    issueNumber: CHILD,
    deps: { graph, branchExists: () => false },
  });
  assert.equal(r.ok, true);
  assert.equal(r.merged, true);
});

test('verifyMergeBackForDone: child branch survives but merged → not-eliminated refusal', () => {
  const r = verifyMergeBackForDone({
    issueNumber: CHILD,
    deps: {
      graph,
      branchExists: () => true,
      isAncestor: () => true, // child IS an ancestor of parent → merged
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /gated-delivery-child-branch-not-eliminated/);
  assert.match(r.blocker, /feature\/child\/914/);
  assert.equal(r.merged, true);
});

test('verifyMergeBackForDone: child branch survives + unmerged → merge-back-not-performed refusal', () => {
  const r = verifyMergeBackForDone({
    issueNumber: CHILD,
    deps: {
      graph,
      branchExists: () => true,
      isAncestor: () => false, // child has commits not on parent
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /gated-delivery-merge-back-not-performed/);
  assert.equal(r.merged, false);
});

test('verifyMergeBackForDone: branch eliminated WITHOUT merge-back → merge-back-missing refusal', () => {
  const r = verifyMergeBackForDone({
    issueNumber: CHILD,
    deps: {
      graph,
      branchExists: () => false,
      commitReachable: () => false, // deleted, but nothing landed on parent
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /gated-delivery-merge-back-missing/);
  assert.match(r.blocker, /\[#914\]/);
  assert.equal(r.merged, false);
});

test('verifyMergeBackForDone: standalone story (trunk parent) → inert skip', () => {
  const r = verifyMergeBackForDone({
    issueNumber: 777,
    deps: { graph, branchExists: () => true },
  });
  assert.equal(r.ok, true);
  // #777 resolves to role 'story' → not a child delivery.
  assert.match(r.skipped, /not-a-child-delivery/);
});

test('verifyMergeBackForDone: epic (has children) → inert skip', () => {
  const r = verifyMergeBackForDone({
    issueNumber: 912,
    deps: { graph, branchExists: () => true },
  });
  assert.equal(r.ok, true);
  assert.match(r.skipped, /not-a-child-delivery/);
});

test('verifyMergeBackForDone: child whose parent branch IS trunk → out-of-scope skip (#908 owns it)', () => {
  // Point the trunk name at this child's resolved parent branch so the
  // short-circuit fires: trunk delivery is PR-gated and out of scope here.
  const r = verifyMergeBackForDone({
    issueNumber: CHILD,
    deps: {
      graph,
      trunk: PARENT_BRANCH,
      branchExists: () => true, // would refuse if the gate ran — it must not
    },
  });
  assert.equal(r.ok, true);
  assert.match(r.skipped, /trunk-parent-delivery-out-of-scope/);
});

test('verifyMergeBackForDone: missing issueNumber → throws', () => {
  assert.throws(() => verifyMergeBackForDone({ deps: { graph } }), /issueNumber is required/);
});
