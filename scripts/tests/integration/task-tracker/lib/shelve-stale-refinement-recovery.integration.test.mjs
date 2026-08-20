// @story #1341
import assert from 'node:assert/strict';
import test from 'node:test';

import { writeLastKnownState } from '../../../../task-tracker/gh-timing-comment.mjs';
import { parseBlockedByStrict } from '../../../../task-tracker/lib/blocked-marker.mjs';
import {
  findNextEligibleChild,
  planEpicDevelopChildrenGate,
} from '../../../../task-tracker/lib/epic-children-gate.mjs';
import { verifyRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import { runShelveTransaction } from '../../../../task-tracker/lib/shelve-transaction.mjs';
import { runRefine } from '../../../../task-tracker/verbs/refine.mjs';
import { mapSubIssueNodes } from '../../../../gh/lib/wave-admission.mjs';

import { CFG, FIELD_DEFS, harness } from './shelve-transaction.fixture.mjs';

function refinementDeps(store) {
  return {
    assertBound: () => {},
    tetherIssueToProject: async ({ priority, size, estimate, rank }) => {
      store.fields = { priority: String(priority).toUpperCase(), size, estimate, rank };
    },
    fetchBody: async () => store.body,
    fetchLabels: async () => store.labels,
    mutateBody: async ({ mutate }) => {
      store.body = await mutate(store.body);
      return { body: store.body };
    },
    loadProjectFieldDefs: () => FIELD_DEFS,
    verbPromote: async () => {
      store.state = store.state === 'backlog' ? 'refine' : 'ready-for-plan';
      store.body = writeLastKnownState(store.body, store.state, '2026-08-12T01:00:00.000Z');
    },
  };
}

function epicChildNode(store) {
  return {
    number: 1215,
    state: 'OPEN',
    body: store.body,
    labels: { nodes: store.labels.map((name) => ({ name })), pageInfo: { hasNextPage: false } },
    projectItems: {
      nodes: [
        {
          project: { id: CFG.projectId },
          fieldValues: {
            nodes: [
              { name: 'Ready for Planning', field: { id: 'FIELD_status', name: 'Status' } },
              { number: store.fields.rank, field: { id: CFG.fieldIds.rank, name: 'Rank' } },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      ],
      pageInfo: { hasNextPage: false },
    },
  };
}

test('legacy blocker recovery returns a current schema-2 child to epic admission while its dependency is open', async () => {
  const h = harness({ state: 'ready-for-plan', legacyBlockers: [1212, 1213] });
  const migrated = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'Refresh only the legacy blocker evidence',
    refreshStaleBlockers: true,
    cfg: CFG,
    deps: h.deps,
  });
  assert.equal(migrated.status, 'shelved', JSON.stringify(migrated));
  assert.equal(h.store.state, 'backlog');

  const args = {
    issueNumber: 1215,
    size: 'M',
    estimate: '4',
    priority: 'p1',
    rank: 2,
    reason: 'Re-establish current refinement evidence',
  };
  const enteredRefine = await runRefine({ args, cfg: CFG, deps: refinementDeps(h.store) });
  assert.equal(enteredRefine.recordedState, 'backlog');
  assert.equal(h.store.state, 'refine');

  const completedRefine = await runRefine({ args, cfg: CFG, deps: refinementDeps(h.store) });
  assert.equal(completedRefine.completed, true);
  assert.equal(h.store.state, 'ready-for-plan');

  const verified = verifyRefinementSnapshot(h.store.body, { labels: h.store.labels });
  assert.equal(verified.ok, true, verified.reason);
  assert.equal(verified.snapshot.schema, '2');
  const expectedRefs = [1212, 1213];
  assert.deepEqual(parseBlockedByStrict(h.store.body), expectedRefs);
  assert.equal(
    verified.snapshot.fields.blockedBy,
    expectedRefs.map((number) => `#${number}`).join(',')
  );
  assert.ok(h.store.labels.includes('BLOCKED'));
  assert.equal(h.store.blockedBy, expectedRefs.map((number) => `#${number}`).join(', '));

  const [child] = mapSubIssueNodes([epicChildNode(h.store)], CFG);
  assert.equal(child.issueState, 'open');
  assert.deepEqual(child.blockedBy, expectedRefs);
  assert.equal(child.hasCurrentRefinement, true, child.childEvidenceError);
  const openDependency = {
    number: 1212,
    state: 'ready-for-plan',
    issueState: 'open',
    rank: 1,
    blockedBy: [],
    hasCurrentRefinement: true,
  };
  const admission = await planEpicDevelopChildrenGate({
    cfg: CFG,
    issueNumber: 1263,
    deps: { fetchSiblings: async () => [openDependency, child] },
  });
  assert.equal(admission.ok, true, JSON.stringify(admission));
  assert.equal(findNextEligibleChild([openDependency, child]).number, openDependency.number);
});
