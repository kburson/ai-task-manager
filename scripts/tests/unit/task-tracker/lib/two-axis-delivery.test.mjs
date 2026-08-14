// @story #915 (epic #912) — targeted verifier (vc:5)
// Proves the two delivery axes are surfaced distinctly (AC1), the trunk axis is
// derived-on-demand and never persisted (AC2), and no consumer conflates them (AC3).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deliveryAxes,
  assertDeliveredNotPersisted,
  PersistedDeliveredAxisError,
  auditConsumers,
  CONSUMER_REGISTRY,
  DONE_AXIS,
  DELIVERED_AXIS,
} from '../../../../task-tracker/lib/two-axis-delivery.mjs';

// A child (#915) of epic #912 with a surviving epic branch — its done-target is
// the epic branch, NOT trunk, so the two axes are genuinely different branches.
function childGraph() {
  return (issue) => {
    if (issue === 912) return { parent: null, children: [{ number: 915 }] };
    if (issue === 915) return { parent: 912, children: [] };
    return { parent: null, children: [] };
  };
}

// reach: Set of `${issue}@${branch}` pairs currently reachable. A closure lets a
// test flip trunk reachability between calls to prove the derived axis re-reads git.
function reachProbe(reach) {
  return (issue, branch) => reach.has(`${issue}@${branch}`);
}

// ── AC1: two distinct axes surfaced ──────────────────────────────────────────
test('AC1: surfaces done (delivered-to-parent, recorded) and delivered-to-customer (derived) as distinct axes', () => {
  const graph = childGraph();
  const trunk = 'trunk';
  // done on the epic (parent) branch, NOT yet on trunk.
  const targetBranch = deliveryAxes({
    issueNumber: 915,
    deps: { graph, branchExists: () => true, trunk, commitReachable: () => false },
  }).done.targetBranch;
  assert.notEqual(targetBranch, trunk, 'child done-target must be the parent branch, not trunk');

  const reach = new Set([`915@${targetBranch}`]); // done-at-parent, not on trunk
  const axes = deliveryAxes({
    issueNumber: 915,
    deps: { graph, branchExists: () => true, trunk, commitReachable: reachProbe(reach) },
  });

  assert.equal(axes.done.axis, DONE_AXIS);
  assert.equal(axes.done.recorded, true);
  assert.equal(axes.done.basis, 'parent-branch-reachability');
  assert.equal(axes.done.reachable, true, 'done: reachable on the parent branch');

  assert.equal(axes.delivered.axis, DELIVERED_AXIS);
  assert.equal(axes.delivered.derived, true);
  assert.equal(axes.delivered.basis, 'trunk-reachability');
  assert.equal(axes.delivered.onTrunk, false, 'delivered: not yet on trunk');

  // The two axes are genuinely distinct — different names, bases, and here values.
  assert.notEqual(axes.done.axis, axes.delivered.axis);
  assert.notEqual(axes.done.basis, axes.delivered.basis);
  assert.notEqual(axes.done.reachable, axes.delivered.onTrunk);
});

// ── AC2: derived on demand, never persisted ──────────────────────────────────
test('AC2: delivered axis is recomputed from git each call and reflects trunk advancing', () => {
  const graph = childGraph();
  const reach = new Set([`915@epic/912`]);
  const deps = {
    graph,
    branchExists: () => true,
    trunk: 'trunk',
    commitReachable: reachProbe(reach),
  };

  const before = deliveryAxes({ issueNumber: 915, deps });
  assert.equal(before.delivered.onTrunk, false);

  // Trunk advances to include the deliverable — same item, no re-record, next read flips.
  reach.add('915@trunk');
  const after = deliveryAxes({ issueNumber: 915, deps });
  assert.equal(after.delivered.onTrunk, true, 'derived axis must re-read git, not a stored value');
});

test('AC2: delivered axis carries persisted:false and the axes object is frozen', () => {
  const graph = childGraph();
  const axes = deliveryAxes({
    issueNumber: 915,
    deps: { graph, branchExists: () => true, trunk: 'trunk', commitReachable: () => false },
  });
  assert.equal(axes.delivered.persisted, false);
  assert.ok(Object.isFrozen(axes));
  assert.ok(Object.isFrozen(axes.delivered));
});

test('AC2: assertDeliveredNotPersisted refuses any write recording the trunk axis', () => {
  // Object-shaped writes.
  assert.throws(
    () => assertDeliveredNotPersisted({ 'delivered-to-customer': true }),
    PersistedDeliveredAxisError
  );
  assert.throws(() => assertDeliveredNotPersisted({ onTrunk: true }), PersistedDeliveredAxisError);
  // Array-of-descriptors writes (board-field intents).
  assert.throws(
    () => assertDeliveredNotPersisted([{ key: 'trunkDelivered', value: 1 }]),
    PersistedDeliveredAxisError
  );
  // Clean writes (Axis-1 done is recordable) pass through unchanged.
  const clean = { done: true, status: 'Done' };
  assert.equal(assertDeliveredNotPersisted(clean), clean);
  assert.deepEqual(assertDeliveredNotPersisted(null), null);
});

// ── AC3: no consumer conflates the axes ──────────────────────────────────────
test('AC3: the real consumer registry sources delivered-to-customer from git (no conflation)', () => {
  const result = auditConsumers(CONSUMER_REGISTRY);
  assert.equal(result.ok, true, JSON.stringify(result.violations));
  assert.equal(result.violations.length, 0);
  // The named surfaces from the scope are all covered.
  const names = CONSUMER_REGISTRY.map((c) => c.name);
  for (const n of [
    'verbs/status.mjs',
    'verbs/board.mjs',
    'verbs/report.mjs',
    'lib/upstream-report.mjs',
  ]) {
    assert.ok(names.includes(n), `registry must cover ${n}`);
  }
});

test('AC3: a consumer that reads the recorded done/Status field is flagged as conflation', () => {
  const consumers = [
    { name: 'good.mjs', deliveredSource: 'git-derived' },
    { name: 'conflates-done.mjs', deliveredSource: 'done-field' },
    { name: 'conflates-status.mjs', deliveredSource: 'status' },
    { name: 'missing.mjs' },
  ];
  const { ok, violations } = auditConsumers(consumers);
  assert.equal(ok, false);
  const flagged = violations.map((v) => v.name).sort();
  assert.deepEqual(flagged, ['conflates-done.mjs', 'conflates-status.mjs', 'missing.mjs']);
  assert.ok(!flagged.includes('good.mjs'));
});
