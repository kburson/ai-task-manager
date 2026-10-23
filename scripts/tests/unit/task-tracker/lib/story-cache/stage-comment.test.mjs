// @story #2039 #2058
// Pure argument contracts. Native Git/claim/store behavior lives in integration.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stageOwnedComment } from '../../../../../task-tracker/lib/story-cache/stage-comment.mjs';
const valid = {
  key: 'comment:new:intent',
  body: 'Audit\n\n<!-- aitm-owned-comment key="plan.audit" -->',
};
const guarded = (extra) => ({
  ...valid,
  ...extra,
  get store() {
    return assert.fail('store accessed');
  },
  get claim() {
    return assert.fail('claim accessed');
  },
});
test('invalid arguments refuse before any claim, store or runtime discovery', async () => {
  for (const extra of [
    { key: 'issue:I_test' },
    { key: 'comment:new:' },
    { key: 'comment:new:bad key' },
    { body: null },
    { body: '' },
    { body: '\ud800' },
    { transport: () => assert.fail('transport') },
  ])
    await assert.rejects(stageOwnedComment(guarded(extra)), { code: 'STORY_MUTATION_INVALID' });
});
test('non-null proof capabilities cannot authorize a local comment edit', async () => {
  for (const capability of [
    true,
    false,
    0,
    '',
    { allowMarkerLoss: true },
    { allowUnverifiedTicks: true },
  ])
    await assert.rejects(stageOwnedComment(guarded({ capability })), {
      code: 'STORY_MUTATION_INVALID',
      reason: 'capability',
    });
});
test('a changing capability getter cannot reach dependencies after a forged grant', async () => {
  let reads = 0;
  const input = guarded({});
  Object.defineProperty(input, 'capability', {
    enumerable: true,
    get() {
      return ++reads === 1 ? { allowMarkerLoss: true } : null;
    },
  });
  await assert.rejects(stageOwnedComment(input), {
    code: 'STORY_MUTATION_INVALID',
    reason: 'capability',
  });
  assert.equal(reads, 1);
});
