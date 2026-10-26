// @story #2096
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeHarness, deliver, mergePendingIntent } from './deliver-test-harness.mjs';

test('#2096 receipt publication refuses Review revocation during final trunk reachability', async () => {
  const h = makeHarness();
  await mergePendingIntent(h);
  const fetch = h.deps.fetchOriginTrunk;
  h.deps.fetchOriginTrunk = async (input) => {
    await fetch(input);
    if (h.calls.inspectMergeCommit > 0) h.data.agentReviewPassed = false;
  };
  await assert.rejects(deliver(h), /authority-drift|review|approval/);
  assert.equal(h.calls.events.includes('receipt:post'), false);
});
