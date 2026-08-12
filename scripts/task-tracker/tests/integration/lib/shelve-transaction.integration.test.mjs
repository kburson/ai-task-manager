// @story #1215
import test from 'node:test';
import assert from 'node:assert/strict';

import { writeLastKnownState } from '../../../gh-timing-comment.mjs';
import { stampRefinementSnapshot } from '../../../lib/refinement-snapshot.mjs';
import {
  SHELVE_PHASES,
  activeFieldsAfterShelve,
  parseShelveJournal,
  runShelveTransaction,
} from '../../../lib/shelve-transaction.mjs';
import { parseRefinementHistory } from '../../../lib/refinement-history.mjs';

const CFG = {
  repo: 'owner/repo',
  projectId: 'PVT_target',
  fieldIds: {
    priority: 'FIELD_priority',
    size: 'FIELD_size',
    estimate: 'FIELD_estimate',
    rank: 'FIELD_rank',
  },
};
const FIELD_DEFS = [
  { key: 'priority', name: 'Priority', type: 'single_select' },
  { key: 'size', name: 'Size', type: 'single_select' },
  { key: 'estimate', name: 'Estimate', type: 'number' },
  { key: 'rank', name: 'Rank', type: 'number' },
  { key: 'blockedBy', name: 'Blocked By', type: 'text' },
];
const LABELS = ['kind:code', 'area:backlog'];

function initialBody(state = 'refine') {
  const body = writeLastKnownState(
    `<!-- aitm-refinement-rationale: {"size":"M","estimate":"4","priority":"P1","rank":2,"rationale":"current"} -->
<!-- aitm-refine-complete ts="2026-08-12T00:00:00.000Z" -->
<!-- aitm-estimation-forecast-ready schema="2" id="forecast-1" -->
<!-- aitm-deep-dive-complete ts="2026-08-12T00:01:00.000Z" -->

## User Story

As a steward I want shelving to be recoverable.

## Scope

This integration fixture has enough durable scope to build a current snapshot.

## Plan Metadata

- **Depends On**: #1213
- **Execution Order**: 5

## Acceptance Criteria

- [x] Shelve safely <!-- aitm-verified vc-list="vc:6" sha="abc1234" ts="2026-08-12T00:02:00.000Z" exit="0" -->

<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"M","estimate":4,"rank":2,"blockedBy":"#1213"}} -->
`,
    state,
    '2026-08-12T00:00:00.000Z'
  );
  return stampRefinementSnapshot(body, {
    labels: LABELS,
    ts: '2026-08-12T00:00:00.000Z',
  });
}

function harness({
  state = 'refine',
  issueState = 'OPEN',
  assignees = ['alice'],
  failOnce = null,
  failAfterPhase = null,
} = {}) {
  const store = {
    issueState,
    title: 'Shelve story',
    body: initialBody(state),
    labels: [...LABELS],
    state,
    fields: { priority: 'P1', size: 'M', estimate: 4, rank: 2 },
    assignees: [...assignees],
  };
  const calls = [];
  let failure = failOnce;

  function maybeFail(name) {
    if (failure === name) {
      failure = null;
      throw new Error(`injected:${name}`);
    }
  }

  const deps = {
    now: () => '2026-08-12T00:05:00.000Z',
    makeTx: () => 'tx-1215',
    getBaseSha: async () => 'c02bdd3e00000000000000000000000000000000',
    loadProjectFieldDefs: () => FIELD_DEFS,
    fetchSnapshot: async () => structuredClone(store),
    mutateBody: async ({ mutate }) => {
      maybeFail('mutate-body');
      store.body = await mutate(store.body);
      const phase = parseShelveJournal(store.body)?.phase || 'none';
      calls.push(['body', phase]);
      if (failAfterPhase === phase) {
        failAfterPhase = null;
        throw new Error(`injected:after-${phase}`);
      }
      return { body: store.body };
    },
    clearBoardFields: async () => {
      maybeFail('clear-fields');
      store.fields = { priority: null, size: null, estimate: null, rank: null };
      calls.push(['fields-cleared']);
    },
    runMoveState: async () => {
      maybeFail('move-status');
      store.state = 'backlog';
      store.body = writeLastKnownState(store.body, 'backlog', '2026-08-12T00:06:00.000Z');
      calls.push(['status-backlog']);
      return 0;
    },
    removeOwner: async () => {
      maybeFail('remove-owner');
      store.assignees = [];
      calls.push(['owner-removed']);
      return { status: 'unassigned' };
    },
  };
  return { store, calls, deps };
}

test('Shelve runs the ordered journal, preserves classifications, and verifies exact final state', async () => {
  const h = harness();
  const before = structuredClone(h.store);
  const result = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    removeOwner: false,
    cfg: CFG,
    deps: h.deps,
  });

  assert.equal(result.status, 'shelved', JSON.stringify(result));
  assert.equal(h.store.state, 'backlog');
  assert.deepEqual(activeFieldsAfterShelve(h.store.body), {
    priority: null,
    size: null,
    estimate: null,
    rank: null,
  });
  assert.deepEqual(h.store.fields, {
    priority: null,
    size: null,
    estimate: null,
    rank: null,
  });
  assert.deepEqual(h.store.labels, before.labels);
  assert.equal(h.store.title, before.title);
  assert.deepEqual(h.store.assignees, ['alice']);
  assert.equal(parseRefinementHistory(h.store.body).length, 1);
  assert.equal(parseShelveJournal(h.store.body).phase, 'verified');
  assert.deepEqual(SHELVE_PHASES, [
    'snapshot-recorded',
    'active-evidence-cleared',
    'fields-cleared',
    'status-backlog',
    'owner-updated',
    'verified',
  ]);
});

test('Shelve explicitly removes the sole owner only when requested', async () => {
  const h = harness();
  const result = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    removeOwner: true,
    cfg: CFG,
    deps: h.deps,
  });
  assert.equal(result.status, 'shelved', JSON.stringify(result));
  assert.deepEqual(h.store.assignees, []);
  assert.deepEqual(h.store.labels, LABELS);
  assert.deepEqual(
    h.calls.filter(([name]) => name === 'owner-removed'),
    [['owner-removed']]
  );
});

for (const source of ['backlog', 'plan', 'develop', 'test', 'review', 'done']) {
  test(`Shelve refuses ${source} before the first write`, async () => {
    const h = harness({ state: source });
    const result = await runShelveTransaction({
      issueNumber: 1215,
      reason: 'No longer prioritized',
      removeOwner: false,
      cfg: CFG,
      deps: h.deps,
    });
    assert.equal(result.status, 'invalid-source-refused');
    assert.deepEqual(h.calls, []);
    assert.equal(parseRefinementHistory(h.store.body).length, 0);
  });
}

test('Shelve refuses a closed issue before the first write', async () => {
  const h = harness({ issueState: 'CLOSED' });
  const result = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    cfg: CFG,
    deps: h.deps,
  });
  assert.equal(result.status, 'closed-issue-refused');
  assert.deepEqual(h.calls, []);
});

test('a partial failure remains journaled and an identical retry resumes without duplicate history', async () => {
  const h = harness({ failOnce: 'move-status' });
  const first = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    removeOwner: false,
    cfg: CFG,
    deps: h.deps,
  });
  assert.equal(first.status, 'recovery-pending');
  assert.equal(first.phase, 'fields-cleared');
  assert.equal(parseRefinementHistory(h.store.body).length, 1);

  const second = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    removeOwner: false,
    cfg: CFG,
    deps: h.deps,
  });
  assert.equal(second.status, 'shelved', JSON.stringify(second));
  assert.equal(parseRefinementHistory(h.store.body).length, 1);
});

for (const phase of SHELVE_PHASES) {
  test(`an ambiguous response after ${phase} resumes from durable read-back`, async () => {
    const h = harness({ failAfterPhase: phase });
    const first = await runShelveTransaction({
      issueNumber: 1215,
      reason: 'No longer prioritized',
      removeOwner: false,
      cfg: CFG,
      deps: h.deps,
    });
    assert.notEqual(first.status, 'shelved', `phase ${phase} must not claim success`);

    const second = await runShelveTransaction({
      issueNumber: 1215,
      reason: 'No longer prioritized',
      removeOwner: false,
      cfg: CFG,
      deps: h.deps,
    });
    assert.equal(second.status, 'shelved', JSON.stringify(second));
    assert.equal(parseShelveJournal(h.store.body).phase, 'verified');
    assert.equal(parseRefinementHistory(h.store.body).length, 1);
  });
}

test('a retry with different reason or remove-owner intent refuses without further writes', async () => {
  const h = harness({ failOnce: 'move-status' });
  await runShelveTransaction({
    issueNumber: 1215,
    reason: 'Original reason',
    removeOwner: false,
    cfg: CFG,
    deps: h.deps,
  });
  const beforeCalls = h.calls.length;

  const differentReason = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'Different reason',
    removeOwner: false,
    cfg: CFG,
    deps: h.deps,
  });
  assert.equal(differentReason.status, 'retry-intent-refused');

  const differentOwnerIntent = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'Original reason',
    removeOwner: true,
    cfg: CFG,
    deps: h.deps,
  });
  assert.equal(differentOwnerIntent.status, 'retry-intent-refused');
  assert.equal(h.calls.length, beforeCalls);
});

test('unreadable or missing configured-project state fails closed before mutation', async () => {
  const h = harness();
  h.deps.fetchSnapshot = async () => {
    throw new Error('configured project membership is unreadable');
  };
  await assert.rejects(
    runShelveTransaction({
      issueNumber: 1215,
      reason: 'No longer prioritized',
      cfg: CFG,
      deps: h.deps,
    }),
    /configured project membership is unreadable/
  );
  assert.deepEqual(h.calls, []);
});
