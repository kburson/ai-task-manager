// @story #1215
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { writeLastKnownState } from '../../../../task-tracker/gh-timing-comment.mjs';
import { parseBodyVersion, stampBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import {
  stampRefinementSnapshot,
  verifyLegacyRefinementSnapshotForBlockerRefresh,
  verifyRefinementSnapshot,
} from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import { computeStageDurations } from '../../../../task-tracker/timing-rollup.mjs';
import { stripBodyVersion } from '../../../../task-tracker/lib/versioned-issue-write.mjs';
import {
  SHELVE_PHASES,
  activeFieldsAfterShelve,
  parseShelveJournal,
  runShelveTransaction,
} from '../../../../task-tracker/lib/shelve-transaction.mjs';
import { parseRefinementHistory } from '../../../../task-tracker/lib/refinement-history.mjs';
import { runRefine } from '../../../../task-tracker/verbs/refine.mjs';
import {
  findNextEligibleChild,
  planEpicDevelopChildrenGate,
} from '../../../../task-tracker/lib/epic-children-gate.mjs';
import { mapSubIssueNodes } from '../../../../gh/lib/wave-admission.mjs';
import { parseBlockedByStrict } from '../../../../task-tracker/lib/blocked-marker.mjs';

const CFG = {
  repo: 'owner/repo',
  projectId: 'PVT_target',
  fieldIds: {
    priority: 'FIELD_priority',
    size: 'FIELD_size',
    estimate: 'FIELD_estimate',
    rank: 'FIELD_rank',
    blockedBy: 'FIELD_blocked_by',
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function initialBody(state = 'refine') {
  let body = writeLastKnownState(
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
  body = body.replace(
    /^(<!--\s*aitm-last-known-state[^>]*?-->)/,
    '$1\n<!-- aitm-body-version version="7" -->'
  );
  if (state === 'ready-for-plan') {
    body = body.replace(
      '<!-- aitm-body-version version="7" -->',
      `<!-- aitm-body-version version="7" -->
<!-- aitm-entered-refine ts="2026-08-12T00:00:00.000Z" -->
<!-- aitm-entered-ready-for-plan ts="2026-08-12T01:00:00.000Z" -->
<!-- aitm-entered-plan ts="2026-08-12T02:00:00.000Z" -->
<!-- aitm-entered-ready-for-plan-2 ts="2026-08-12T03:00:00.000Z" -->
<!-- aitm-stage-rollup: {"schema":2,"perStageSec":{"backlog":0,"refine":3600,"ready-for-plan":3600,"plan":3600,"develop":0,"test":0,"review":0,"done":0},"totalSec":10800,"visits":[{"stage":"refine","visit":1,"durationSec":3600},{"stage":"ready-for-plan","visit":1,"durationSec":3600},{"stage":"plan","visit":1,"durationSec":3600},{"stage":"ready-for-plan","visit":2,"durationSec":0}]} -->`
    );
  }
  return stampRefinementSnapshot(body, {
    labels: LABELS,
    ts: '2026-08-12T00:00:00.000Z',
  });
}

function legacyBlockedBody(blockers) {
  const refs = blockers.map((number) => `#${number}`).join(',');
  const withoutSnapshot = initialBody('ready-for-plan')
    .replace(/<!--\s*aitm-refinement-snapshot\s+[^>]*?-->\n?/g, '')
    .replace(
      '\n<!-- aitm-fields:',
      '\n## Definition of Done\n\n- [ ] Preserve legacy evidence.\n\n<!-- aitm-fields:'
    )
    .replace('"blockedBy":"#1213"', '"blockedBy":null');
  const rationale = {
    size: 'M',
    estimate: '4',
    priority: 'P1',
    rank: 2,
    rationale: 'current',
  };
  const provenance = sha256(JSON.stringify(rationale));
  const digest = sha256(
    JSON.stringify({
      scope: 'This integration fixture has enough durable scope to build a current snapshot.',
      acceptanceCriteria:
        '- [x] Shelve safely <!-- aitm-verified vc-list="vc:6" sha="abc1234" ts="2026-08-12T00:02:00.000Z" exit="0" -->',
      fields: { priority: 'P1', size: 'M', estimate: 4, rank: 2, blockedBy: null },
      dependencies: '- **Depends On**: #1213',
      labels: [...LABELS].sort(),
      provenance,
    })
  );
  return `${withoutSnapshot.trimEnd()}\n<!-- aitm-blocked-by refs="${refs}" -->\n<!-- aitm-refinement-snapshot schema="1" digest="${digest}" provenance="${provenance}" priority="P1" size="M" estimate="4" rank="2" blocked-by="" ts="2026-08-12T00:00:00.000Z" -->\n`;
}

function harness({
  state = 'refine',
  issueState = 'OPEN',
  assignees = ['alice'],
  failOnce = null,
  failAfterPhase = null,
  failAfterMutation = null,
  failAfterClearFields = false,
  failAfterMove = false,
  failAfterOwner = false,
  onFetch = null,
  beforeFirstMutation = null,
  legacyBlockers = null,
  projectBlockedBy = null,
  labels = null,
} = {}) {
  const migration = Array.isArray(legacyBlockers);
  const store = {
    issueState,
    title: 'Shelve story',
    body: migration ? legacyBlockedBody(legacyBlockers) : initialBody(state),
    labels: labels || (migration ? ['BLOCKED', ...LABELS] : [...LABELS]),
    state,
    fields: { priority: 'P1', size: 'M', estimate: 4, rank: 2 },
    blockedBy: migration
      ? (projectBlockedBy ?? legacyBlockers.map((number) => `#${number}`).join(', '))
      : null,
    assignees: [...assignees],
  };
  const calls = [];
  let failure = failOnce;
  let fetchCount = 0;
  let mutationCount = 0;

  function maybeFail(name) {
    if (failure === name) {
      failure = null;
      throw new Error(`injected:${name}`);
    }
  }

  const deps = {
    assertIssueLockHeld: () => {},
    now: () => '2026-08-12T00:05:00.000Z',
    makeTx: () => 'tx-1215',
    getBaseSha: async () => 'c02bdd3e00000000000000000000000000000000',
    loadProjectFieldDefs: () => FIELD_DEFS,
    resolveLogin: async () => 'alice',
    fetchSnapshot: async () => {
      fetchCount += 1;
      await onFetch?.({ store, fetchCount });
      return structuredClone(store);
    },
    mutateBody: async ({ mutate }) => {
      maybeFail('mutate-body');
      mutationCount += 1;
      if (mutationCount === 1) await beforeFirstMutation?.({ store });
      const nextVersion = parseBodyVersion(store.body) + 1;
      store.body = stampBodyVersion(await mutate(stripBodyVersion(store.body)), nextVersion);
      const phase = parseShelveJournal(store.body)?.phase || 'none';
      calls.push(['body', phase]);
      if (failAfterMutation === mutationCount) {
        failAfterMutation = null;
        throw new Error(`transport failed after mutation ${mutationCount} landed`);
      }
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
      if (failAfterClearFields) {
        failAfterClearFields = false;
        throw new Error('transport failed after board fields landed');
      }
    },
    runMoveState: async () => {
      maybeFail('move-status');
      store.state = 'backlog';
      store.body = writeLastKnownState(store.body, 'backlog', '2026-08-12T00:06:00.000Z');
      calls.push(['status-backlog']);
      if (failAfterMove) {
        failAfterMove = false;
        throw new Error('transport failed after Status landed');
      }
      return 0;
    },
    removeOwner: async () => {
      maybeFail('remove-owner');
      store.assignees = [];
      calls.push(['owner-removed']);
      if (failAfterOwner) {
        failAfterOwner = false;
        throw new Error('transport failed after owner removal landed');
      }
      return { status: 'unassigned' };
    },
  };
  return { store, calls, deps };
}

function restoreRefinementCycle(store) {
  store.state = 'refine';
  store.fields = { priority: 'P1', size: 'M', estimate: 4, rank: 2 };
  let body = store.body.replace(
    /<!-- aitm-fields: [^>]+ -->/,
    '<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"M","estimate":4,"rank":2,"blockedBy":"#1213"}} -->'
  );
  body = `<!-- aitm-refinement-rationale: {"size":"M","estimate":"4","priority":"P1","rank":2,"rationale":"re-refined"} -->
<!-- aitm-refine-complete ts="2026-08-12T01:00:00.000Z" -->
<!-- aitm-estimation-forecast-ready schema="2" id="forecast-2" -->
${body}`;
  body = writeLastKnownState(body, 'refine', '2026-08-12T01:00:00.000Z');
  store.body = stampRefinementSnapshot(body, {
    labels: store.labels,
    ts: '2026-08-12T01:00:00.000Z',
  });
}

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

test('Shelve preserves immutable lifecycle timing while invalidating current R4P eligibility', async () => {
  const h = harness({ state: 'ready-for-plan' });
  const timingLines = h.store.body
    .split('\n')
    .filter((line) => /aitm-entered-|aitm-stage-rollup/.test(line));
  const beforeTiming = computeStageDurations(h.store.body);

  const result = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    cfg: CFG,
    deps: h.deps,
  });

  assert.equal(result.status, 'shelved', JSON.stringify(result));
  for (const line of timingLines) assert.ok(h.store.body.includes(line), line);
  assert.deepEqual(computeStageDurations(h.store.body), beforeTiming);
  assert.doesNotMatch(h.store.body, /aitm-refine-complete|aitm-refinement-rationale/);
});

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

test('a verified Shelve cycle does not block a later legitimate re-refinement cycle', async () => {
  const h = harness();
  const txs = ['tx-1215-a', 'tx-1215-b'];
  h.deps.makeTx = () => txs.shift();

  const first = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'First deprioritization',
    cfg: CFG,
    deps: h.deps,
  });
  assert.equal(first.status, 'shelved', JSON.stringify(first));

  restoreRefinementCycle(h.store);
  const second = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'Second deprioritization',
    cfg: CFG,
    deps: h.deps,
  });

  assert.equal(second.status, 'shelved', JSON.stringify(second));
  assert.deepEqual(
    parseRefinementHistory(h.store.body).map(({ tx }) => tx),
    ['tx-1215-a', 'tx-1215-b']
  );
  assert.equal([...h.store.body.matchAll(/<!--\s*aitm-shelve-transaction\s+[^>]*?-->/g)].length, 2);
  assert.equal(parseShelveJournal(h.store.body).tx, 'tx-1215-b');
  assert.equal(parseShelveJournal(h.store.body).phase, 'verified');
});

test('Shelve rebuilds history from the fresh complete source snapshot before append', async () => {
  const h = harness({
    onFetch: ({ store, fetchCount }) => {
      if (fetchCount !== 2) return;
      store.title = 'Fresh Shelve story';
      store.labels = [...LABELS, 'triage:fresh'];
      store.fields.estimate = 8;
      store.body = store.body
        .replace('"estimate":"4"', '"estimate":"8"')
        .replace('"estimate":4', '"estimate":8')
        .replace('**Depends On**: #1213', '**Depends On**: #9999')
        .replace('id="forecast-1"', 'id="forecast-fresh"');
      store.body = stampRefinementSnapshot(store.body, {
        labels: store.labels,
        ts: '2026-08-12T00:04:00.000Z',
      });
    },
  });

  const result = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    cfg: CFG,
    deps: h.deps,
  });

  assert.equal(result.status, 'shelved', JSON.stringify(result));
  const [record] = parseRefinementHistory(h.store.body);
  assert.equal(record.title, 'Fresh Shelve story');
  assert.deepEqual(record.labels, [...LABELS, 'triage:fresh'].sort());
  assert.equal(record.fields.estimate, 8);
  assert.match(record.dependencies, /#9999/);
  assert.equal(record.forecastProvenance, 'forecast-fresh');
  assert.match(record.sourceDigest, /^[0-9a-f]{64}$/);
});

test('source drift after the fresh snapshot is journaled but blocks every destructive phase', async () => {
  const h = harness({
    beforeFirstMutation: ({ store }) => {
      store.title = 'Concurrent title edit';
    },
  });

  const result = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    cfg: CFG,
    deps: h.deps,
  });

  assert.equal(result.status, 'recovery-pending', JSON.stringify(result));
  assert.equal(result.phase, 'snapshot-recorded');
  assert.deepEqual(
    h.calls.filter(([name]) =>
      ['fields-cleared', 'status-backlog', 'owner-removed'].includes(name)
    ),
    []
  );
});

test('body CAS refuses a changed mutation base instead of appending stale history', async () => {
  const h = harness({
    beforeFirstMutation: ({ store }) => {
      store.body = store.body.replace('**Execution Order**: 5', '**Execution Order**: 6');
    },
  });

  const result = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    cfg: CFG,
    deps: h.deps,
  });

  assert.notEqual(result.status, 'shelved', JSON.stringify(result));
  assert.equal(parseRefinementHistory(h.store.body).length, 0);
  assert.equal(parseShelveJournal(h.store.body), null);
  assert.deepEqual(
    h.calls.filter(([name]) =>
      ['fields-cleared', 'status-backlog', 'owner-removed'].includes(name)
    ),
    []
  );
});

test('Shelve enforces the shared ownership decision from its fetched snapshot', async () => {
  const h = harness({ assignees: ['bob'] });
  const result = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    cfg: CFG,
    deps: h.deps,
  });

  assert.equal(result.status, 'foreign-owner-refused');
  assert.deepEqual(h.calls, []);
  assert.equal(parseRefinementHistory(h.store.body).length, 0);
});

test('a resumable journal cannot bypass a new foreign-owner decision', async () => {
  const h = harness({ failOnce: 'move-status' });
  const first = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    cfg: CFG,
    deps: h.deps,
  });
  assert.equal(first.status, 'recovery-pending');
  const beforeRetryCalls = h.calls.length;
  h.store.assignees = ['bob'];

  const retry = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    cfg: CFG,
    deps: h.deps,
  });

  assert.equal(retry.status, 'foreign-owner-refused');
  assert.equal(h.calls.length, beforeRetryCalls);
});

test('the transaction authority refuses production calls outside the issue lock', async () => {
  const h = harness();
  delete h.deps.assertIssueLockHeld;
  await assert.rejects(
    runShelveTransaction({
      issueNumber: 1215,
      reason: 'No longer prioritized',
      cfg: CFG,
      deps: h.deps,
    }),
    /issue lock/i
  );
  assert.deepEqual(h.calls, []);
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
  const [partialRecord] = parseRefinementHistory(h.store.body);
  assert.equal(partialRecord.migration, undefined);
  const partialDigest = partialRecord.digest;

  const second = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    removeOwner: false,
    cfg: CFG,
    deps: h.deps,
  });
  assert.equal(second.status, 'shelved', JSON.stringify(second));
  const [replayedRecord] = parseRefinementHistory(h.store.body);
  assert.equal(replayedRecord.digest, partialDigest);
});

test('a landed active-evidence write with a lost response resumes from its exact durable transform', async () => {
  const h = harness({ failAfterMutation: 2 });
  const first = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    cfg: CFG,
    deps: h.deps,
  });
  assert.deepEqual(
    { status: first.status, phase: first.phase },
    { status: 'recovery-pending', phase: 'snapshot-recorded' }
  );
  assert.match(first.error, /transport failed after mutation 2 landed/);
  assert.equal(parseShelveJournal(h.store.body).phase, 'snapshot-recorded');

  const second = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'No longer prioritized',
    cfg: CFG,
    deps: h.deps,
  });

  assert.equal(second.status, 'shelved', JSON.stringify(second));
  assert.equal(parseShelveJournal(h.store.body).phase, 'verified');
  assert.equal(h.store.state, 'backlog');
  assert.deepEqual(h.store.fields, {
    priority: null,
    size: null,
    estimate: null,
    rank: null,
  });
});

test('unrelated drift after a landed active-evidence write still blocks later phases', async () => {
  const h = harness({ failAfterMutation: 2 });
  const intent = {
    issueNumber: 1215,
    reason: 'No longer prioritized',
    cfg: CFG,
    deps: h.deps,
  };
  const first = await runShelveTransaction(intent);
  assert.equal(first.status, 'recovery-pending');
  h.store.body = h.store.body.replace(
    'This integration fixture has enough durable scope to build a current snapshot.',
    'A concurrent editor changed the durable scope after invalidation landed.'
  );
  const beforeRetryCalls = h.calls.length;

  const second = await runShelveTransaction(intent);

  assert.equal(second.status, 'recovery-pending');
  assert.equal(second.phase, 'snapshot-recorded');
  assert.match(second.error, /source changed before destructive phases/);
  assert.equal(h.calls.length, beforeRetryCalls);
  assert.equal(h.store.state, 'refine');
  assert.deepEqual(h.store.fields, { priority: 'P1', size: 'M', estimate: 4, rank: 2 });
});

for (const [name, options] of [
  ['board field clear', { failAfterClearFields: true }],
  ['body field clear', { failAfterMutation: 4 }],
  ['Status move', { failAfterMove: true }],
  ['owner removal', { failAfterOwner: true, assignees: ['alice'] }],
]) {
  test(`a lost response after landed ${name} remains idempotently resumable`, async () => {
    const h = harness(options);
    const intent = {
      issueNumber: 1215,
      reason: 'No longer prioritized',
      removeOwner: name === 'owner removal',
      cfg: CFG,
      deps: h.deps,
    };
    const first = await runShelveTransaction(intent);
    if (first.status !== 'shelved') {
      const second = await runShelveTransaction(intent);
      assert.equal(second.status, 'shelved', JSON.stringify(second));
    }
    assert.equal(parseShelveJournal(h.store.body).phase, 'verified');
  });
}

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

test('Shelve refreshes the exact legacy blocker-only snapshot and retains every blocker carrier', async () => {
  const h = harness({ state: 'ready-for-plan', legacyBlockers: [1212, 1213] });
  const verified = verifyLegacyRefinementSnapshotForBlockerRefresh(h.store.body, {
    labels: h.store.labels,
  });
  assert.equal(verified.ok, true, verified.reason);

  const result = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'Refresh only the legacy blocker evidence',
    refreshStaleBlockers: true,
    cfg: CFG,
    deps: h.deps,
  });

  assert.equal(result.status, 'shelved', JSON.stringify(result));
  const [record] = parseRefinementHistory(h.store.body);
  assert.equal(record.migration, 'legacy-blocker-refresh');
  assert.deepEqual(record.liveBlockedBy, [1212, 1213]);
  assert.match(h.store.body, /aitm-blocked-by refs="#1212,#1213"/);
  assert.deepEqual(h.store.labels, ['BLOCKED', ...LABELS]);
  assert.equal(h.store.blockedBy, '#1212, #1213');
  assert.equal(parseShelveJournal(h.store.body).refreshStaleBlockers, true);
});

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
  assert.equal(openDependency.issueState, 'open');
  const admission = await planEpicDevelopChildrenGate({
    cfg: CFG,
    issueNumber: 1263,
    deps: { fetchSiblings: async () => [openDependency, child] },
  });
  assert.equal(admission.ok, true, JSON.stringify(admission));
  assert.equal(findNextEligibleChild([openDependency, child]).number, openDependency.number);
});

test('legacy blocker refresh refuses every divergent carrier before it records history', async () => {
  for (const options of [
    { labels: [...LABELS] },
    { projectBlockedBy: '#1212' },
    { projectBlockedBy: '#1213, #1212' },
    { projectBlockedBy: '#1212,#1213' },
  ]) {
    const h = harness({ state: 'ready-for-plan', legacyBlockers: [1212, 1213], ...options });
    const result = await runShelveTransaction({
      issueNumber: 1215,
      reason: 'Refresh only the legacy blocker evidence',
      refreshStaleBlockers: true,
      cfg: CFG,
      deps: h.deps,
    });
    assert.equal(result.status, 'migration-carriers-refused', JSON.stringify(result));
    assert.deepEqual(h.calls, []);
    assert.equal(parseRefinementHistory(h.store.body).length, 0);
  }
});

test('legacy blocker refresh refuses a lowercase noncanonical BLOCKED label before history', async () => {
  const h = harness({
    state: 'ready-for-plan',
    legacyBlockers: [1212],
    labels: ['blocked', ...LABELS],
  });

  const result = await runShelveTransaction({
    issueNumber: 1215,
    reason: 'Refresh only the legacy blocker evidence',
    refreshStaleBlockers: true,
    cfg: CFG,
    deps: h.deps,
  });

  assert.equal(result.status, 'migration-carriers-refused', JSON.stringify(result));
  assert.deepEqual(h.calls, []);
  assert.equal(parseRefinementHistory(h.store.body).length, 0);
});

test('Shelve refuses a retry that changes the legacy blocker refresh intent', async () => {
  const h = harness({
    state: 'ready-for-plan',
    legacyBlockers: [1212],
    failOnce: 'move-status',
  });
  const migrationIntent = {
    issueNumber: 1215,
    reason: 'Refresh only the legacy blocker evidence',
    refreshStaleBlockers: true,
    cfg: CFG,
    deps: h.deps,
  };
  const first = await runShelveTransaction(migrationIntent);
  assert.equal(first.status, 'recovery-pending', JSON.stringify(first));
  const beforeRetryCalls = h.calls.length;

  const retry = await runShelveTransaction({ ...migrationIntent, refreshStaleBlockers: false });

  assert.equal(retry.status, 'retry-intent-refused');
  assert.equal(h.calls.length, beforeRetryCalls);
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
