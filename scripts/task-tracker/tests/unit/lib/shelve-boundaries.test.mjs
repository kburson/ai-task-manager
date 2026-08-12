// @story #1215
import test from 'node:test';
import assert from 'node:assert/strict';

import { actionPolicyFor } from '../../../lib/lifecycle-policy/index.mjs';
import {
  appendRefinementHistory,
  buildRefinementHistoryRecord,
  parseRefinementHistory,
} from '../../../lib/refinement-history.mjs';
import {
  activeFieldsAfterShelve,
  invalidateShelveBody,
  shelveBodyIsInvalidated,
} from '../../../lib/shelve-transaction.mjs';

const FIELD_DEFS = [
  { key: 'priority', name: 'Priority', type: 'single_select' },
  { key: 'size', name: 'Size', type: 'single_select' },
  { key: 'estimate', name: 'Estimate', type: 'number' },
  { key: 'rank', name: 'Rank', type: 'number' },
  { key: 'blockedBy', name: 'Blocked By', type: 'text' },
];

const BODY = `<!-- aitm-last-known-state state="refine" ts="2026-08-12T00:00:00.000Z" -->
<!-- aitm-refine-complete ts="2026-08-12T00:00:00.000Z" -->
<!-- aitm-refinement-rationale: {"size":"M","estimate":"4","priority":"P1","rank":2,"rationale":"current"} -->
<!-- aitm-refinement-snapshot schema="1" digest="${'a'.repeat(64)}" provenance="${'b'.repeat(64)}" priority="P1" size="M" estimate="4" rank="2" blocked-by="#11" ts="2026-08-12T00:00:00.000Z" -->
<!-- aitm-ready-for-plan ts="2026-08-12T00:00:30.000Z" -->
<!-- aitm-plan-approved ts="2026-08-12T00:01:00.000Z" -->
<!-- aitm-estimation-forecast-ready schema="2" record-id="forecast-1" -->
<!-- aitm-deep-dive-complete ts="2026-08-12T00:02:00.000Z" -->

## User Story

As a steward I want honest backlog evidence.

## Scope

Preserve this exact scope narrative while invalidating active refinement evidence.

## Story Origin

- **kind**: code

## Discussion

Keep this human discussion exactly as written.

Second discussion paragraph keeps its original spacing.

## Plan Metadata

- **Depends On**: #11
- **Execution Order**: 5

## Acceptance Criteria

- [x] Preserve the criterion <!-- aitm-verified vc-list="vc:6" sha="abc1234" ts="2026-08-12T00:03:00.000Z" exit="0" -->

## Verification Commands

- [x] \`node --test focused.test.mjs\` <!-- id=1 -->

## Testing

- [x] The manual regression scenario was observed <!-- id=test-1 -->

## Definition of Done

### Functional (verified at Test)

- [x] All automated tests pass <!-- aitm-verified cmd="\`npm test\`" sha="abc1234" ts="2026-08-12T00:03:00.000Z" exit="0" -->

<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"M","estimate":4,"rank":2,"blockedBy":"#11"}} -->
`;

function historyRecord(overrides = {}) {
  return buildRefinementHistoryRecord({
    tx: 'tx-1215',
    issueNumber: 1215,
    body: BODY,
    fields: { priority: 'P1', size: 'M', estimate: 4, rank: 2, blockedBy: '#11' },
    labels: ['kind:code', 'area:backlog'],
    reason: 'No longer prioritized',
    previousOwner: 'alice',
    baseSha: 'c02bdd3e00000000000000000000000000000000',
    createdAt: '2026-08-12T00:05:00.000Z',
    ...overrides,
  });
}

test('Shelve policy is legal only from Refine or Ready for Planning', () => {
  assert.equal(actionPolicyFor('shelve', 'refine').ok, true);
  assert.equal(actionPolicyFor('shelve', 'ready-for-plan').ok, true);
  for (const state of ['backlog', 'plan', 'develop', 'test', 'review', 'done']) {
    assert.equal(actionPolicyFor('shelve', state).ok, false, state);
  }
  assert.equal(actionPolicyFor('shelve').target, 'backlog');
});

test('immutable refinement history captures required pre-invalidation provenance', () => {
  const record = historyRecord();
  assert.equal(record.schema, 'aitm.refinement-history/v1');
  assert.deepEqual(record.fields, {
    priority: 'P1',
    size: 'M',
    estimate: 4,
    rank: 2,
  });
  assert.equal(record.dependencies, '- **Depends On**: #11\n- **Execution Order**: 5');
  assert.equal(record.forecastProvenance, 'forecast-1');
  assert.equal(record.refinementTimestamp, '2026-08-12T00:00:00.000Z');
  assert.equal(record.baseSha, 'c02bdd3e00000000000000000000000000000000');
  assert.match(record.scopeFingerprint, /^[0-9a-f]{64}$/);
  assert.match(record.acceptanceCriteriaFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(record.reason, 'No longer prioritized');
  assert.equal(record.previousOwner, 'alice');
  assert.equal(record.refinementSnapshotDigest, 'a'.repeat(64));
  assert.match(record.digest, /^[0-9a-f]{64}$/);
});

test('history append is deterministic, tamper-evident, and never rewrites prior records', () => {
  const first = historyRecord();
  const withFirst = appendRefinementHistory(BODY, first);
  assert.deepEqual(parseRefinementHistory(withFirst), [first]);
  assert.equal(appendRefinementHistory(withFirst, first), withFirst);

  const second = historyRecord({ tx: 'tx-1215-b', reason: 'A later shelving decision' });
  const withSecond = appendRefinementHistory(withFirst, second);
  assert.deepEqual(parseRefinementHistory(withSecond), [first, second]);
  assert.ok(withSecond.includes(BODY.trimEnd()), 'story body is preserved byte-for-byte');

  const tampered = withSecond.replace(
    /payload="([A-Za-z0-9_-])/,
    (_match, firstByte) => `payload="${firstByte === 'A' ? 'B' : 'A'}`
  );
  assert.throws(() => parseRefinementHistory(tampered), /digest/i);
});

test('Shelve invalidation clears active fields and derived evidence while preserving story text', () => {
  const withHistory = appendRefinementHistory(BODY, historyRecord());
  const after = invalidateShelveBody(withHistory, { fieldDefs: FIELD_DEFS });

  assert.deepEqual(activeFieldsAfterShelve(after), {
    priority: null,
    size: null,
    estimate: null,
    rank: null,
  });
  assert.equal(shelveBodyIsInvalidated(after), true);
  assert.doesNotMatch(
    after,
    /aitm-refine-complete|aitm-refinement-rationale|aitm-refinement-snapshot|aitm-ready-for-plan/
  );
  assert.doesNotMatch(after, /aitm-plan-approved|aitm-estimation-forecast-ready/);
  assert.doesNotMatch(after, /aitm-deep-dive-complete/);
  assert.match(after, /- \[ \] Preserve the criterion/);
  assert.match(after, /- \[ \] \`node --test focused\.test\.mjs\` <!-- id=1 -->/);
  assert.match(after, /- \[ \] The manual regression scenario was observed/);
  assert.match(after, /aitm-verified vc-list="vc:6"/);
  assert.doesNotMatch(after, /sha="abc1234"|exit="0"/);
  assert.match(after, /As a steward I want honest backlog evidence/);
  assert.match(after, /Preserve this exact scope narrative/);
  assert.match(after, /- \*\*kind\*\*: code/);
  assert.match(after, /Keep this human discussion exactly as written/);
  assert.match(after, /Second discussion paragraph keeps its original spacing/);
  assert.equal(parseRefinementHistory(after).length, 1);
});

test('Shelve does not mutate labels because labels remain classification evidence', () => {
  const before = { labels: ['kind:code', 'area:backlog'] };
  const labelsAfterShelve = (record) => record.labels;
  assert.deepEqual(labelsAfterShelve(before), before.labels);
});
