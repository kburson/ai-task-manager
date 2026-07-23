#!/usr/bin/env node
// @story #329
// Regression tests for nested-epic semantics (#329).
//
// Premise: every kanban gate walks exactly ONE parent/child edge. Under a
// nested chain root → sub-epic → grandchild, that is sufficient for transitive
// correctness because each level enforces the same rule via normal verb flow.
//
// These tests exercise the three central gates against shapes that would only
// surface a transitive bug if a gate started reading beyond its immediate edge:
//
//   1. planEpicDevelopChildrenGate on a root epic whose sole child is a
//      sub-epic at `refine` — passes. The gate must NOT walk into the sub-epic
//      and refuse based on grandchildren.
//   2. checkParentAdmission on a grandchild whose IMMEDIATE parent (the
//      sub-epic) is at `develop`. Passes regardless of root state, because the
//      gate must read only the immediate parent.
//   3. planRefineWipGate / wipAdvanceDecision compute budget against the
//      grandchild's sibling set (immediate sub-epic's children), not against
//      cousins under unrelated branches of the root.
//
// All deps are injected; no network. If a gate ever silently starts walking
// to root state, one of these assertions flips.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  planEpicDevelopChildrenGate,
  planRefineWipGate,
  wipAdvanceDecision,
} from '../../../lib/epic-children-gate.mjs';
import { checkParentAdmission } from '../../../lib/body-gates.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_NESTED' };

function stubFetchSiblings(map) {
  // Map<parentEpicNumber, children[]> → fetchSiblings dep.
  return async ({ parentEpicNumber }) => map.get(Number(parentEpicNumber)) || [];
}

// -------- (1) planEpicDevelopChildrenGate against a sub-epic at refine -----

test('planEpicDevelopChildrenGate: root epic with sole sub-epic at refine passes (does not walk into grandchildren)', async () => {
  // Shape: root #100 → sub-epic #200 (refine) → grandchildren #201..#203 in
  // whatever states. If the gate transitively read grandchildren it would see
  // non-refine states and refuse. It must NOT — it only inspects immediate
  // children of #100.
  const siblings = new Map([
    [100, [{ number: 200, state: 'refine', rank: 1 }]],
    [
      200,
      [
        { number: 201, state: 'develop', rank: 1 },
        { number: 202, state: 'plan', rank: 2 },
        { number: 203, state: 'done', rank: 3 },
      ],
    ],
  ]);
  const result = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 100,
    deps: { fetchSiblings: stubFetchSiblings(siblings) },
  });
  assert.equal(result.ok, true, `expected root to pass; got ${JSON.stringify(result)}`);
  assert.equal(result.children.length, 1);
  assert.equal(result.children[0].number, 200);
});

test('planEpicDevelopChildrenGate: sub-epic with all grandchildren at refine passes (per-level recursion)', async () => {
  // The sub-epic's own plan→develop check is the same gate, one level lower.
  // This is the recursion that makes nesting work.
  const siblings = new Map([
    [
      200,
      [
        { number: 201, state: 'refine', rank: 1 },
        { number: 202, state: 'refine', rank: 2 },
      ],
    ],
  ]);
  const result = await planEpicDevelopChildrenGate({
    cfg,
    issueNumber: 200,
    deps: { fetchSiblings: stubFetchSiblings(siblings) },
  });
  assert.equal(result.ok, true);
});

// -------- (2) checkParentAdmission reads immediate parent only --------------

test('checkParentAdmission: grandchild target=plan passes when immediate parent (sub-epic) is at develop', async () => {
  // Shape: root #100 (state irrelevant — gate never reads it) → sub-epic #200
  // at develop → grandchild #210 being promoted refine→plan. Gate must accept
  // because the immediate parent is at develop. readParentStatus stub returns
  // ONLY the immediate parent's state; if the gate ever started walking to
  // root, the test would have to thread root state through this stub.
  const blockers = await checkParentAdmission({
    parentEpicNumber: 200,
    repo: 'o/r',
    projectId: 'P',
    readParentStatus: async ({ parentEpicNumber }) => {
      assert.equal(
        Number(parentEpicNumber),
        200,
        'checkParentAdmission must read only the immediate parent — never the root'
      );
      return 'develop';
    },
    targetState: 'plan',
  });
  assert.deepEqual(blockers, []);
});

test('checkParentAdmission: grandchild refuses when immediate parent (sub-epic) is at refine, regardless of root', async () => {
  // Even if the root were at done, the grandchild cannot lead its immediate
  // sub-epic. Symmetric proof that one-edge reads are sufficient.
  const blockers = await checkParentAdmission({
    parentEpicNumber: 200,
    repo: 'o/r',
    projectId: 'P',
    readParentStatus: async () => 'refine',
    targetState: 'plan',
  });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].kind, 'parent-admission');
  assert.match(blockers[0].message, /#200/);
});

// -------- (3) WIP gate is per-sub-epic, not root-wide ----------------------

test('wipAdvanceDecision: budget counts only immediate siblings under the sub-epic', async () => {
  // Grandchild #210 promoting refine→plan under sub-epic #200. Its only sibling
  // under #200 is at refine — budget free. A cousin under a different sub-epic
  // of the same root must NOT count and is therefore not in this children
  // array (the WIP gate fetches siblings from the immediate parent only).
  const decision = wipAdvanceDecision({
    promotingNumber: 210,
    children: [
      { number: 210, state: 'refine' },
      { number: 211, state: 'refine' },
    ],
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.advancing.length, 0);
});

test('wipAdvanceDecision: budget refuses when an immediate sub-epic sibling is already advancing', async () => {
  const decision = wipAdvanceDecision({
    promotingNumber: 210,
    children: [
      { number: 210, state: 'refine' },
      { number: 211, state: 'plan' },
    ],
  });
  assert.equal(decision.ok, false);
  assert.match(decision.reason, /#211/);
});

test('planRefineWipGate: grandchild promotion fetches parent via fetchParentIssue and siblings under that immediate parent', async () => {
  // Asserts the network shape: planRefineWipGate must ask fetchParentIssue for
  // the IMMEDIATE parent (the sub-epic #200), then ask fetchSiblings for that
  // sub-epic's children. Root #100 must never be queried.
  let parentQueriedFor = null;
  const siblingsQueriedFor = [];
  const result = await planRefineWipGate({
    cfg,
    issueNumber: 210,
    deps: {
      fetchParentIssue: async ({ issueNumber }) => {
        parentQueriedFor = Number(issueNumber);
        return 200; // immediate parent is the sub-epic
      },
      fetchSiblings: async ({ parentEpicNumber }) => {
        siblingsQueriedFor.push(Number(parentEpicNumber));
        return [
          { number: 210, state: 'refine' },
          { number: 211, state: 'refine' },
        ];
      },
      fetchBody: async () => '', // no aitm-blocked-by markers
    },
  });
  assert.equal(parentQueriedFor, 210);
  assert.deepEqual(
    siblingsQueriedFor,
    [200],
    'WIP gate must walk exactly one edge to the immediate parent'
  );
  assert.equal(result.ok, true);
});
