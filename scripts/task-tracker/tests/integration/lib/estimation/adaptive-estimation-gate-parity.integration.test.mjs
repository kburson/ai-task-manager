// @story #1091
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveGate } from '../../../../lib/gate-resolve.mjs';
import { planApprovedGuard } from '../../../../lib/plan-approved-guard.mjs';
import { reviewExitReviewApprovedGuard } from '../../../../lib/review-exit-review-approved-guard.mjs';
import { applyChoice } from '../../../../lib/session-store.mjs';

test('adaptive evidence adds no gate or prompt: Full-Auto bypass and human approval stops are unchanged', async () => {
  const initial = {
    sessionId: 'adaptive-parity',
    gates: { analysisToDevelopment: null, reviewToDone: null },
    lastPromptedParent: null,
  };
  const fullAuto = applyChoice(initial, 'both');
  const humanGated = applyChoice(initial, 'off');
  assert.equal(resolveGate('analysisToDevelopment', { session: fullAuto }), false);
  assert.equal(resolveGate('reviewToDone', { session: fullAuto }), false);
  assert.equal(resolveGate('analysisToDevelopment', { session: humanGated }), true);
  assert.equal(resolveGate('reviewToDone', { session: humanGated }), true);

  const evidenceOnly =
    'body\n<!-- aitm-estimation-forecast-ready record-id="01J00000000000000000000999" -->\n';
  assert.equal((await planApprovedGuard.run({ body: evidenceOnly, toState: 'develop' })).ok, false);
  assert.equal(
    reviewExitReviewApprovedGuard.run({ body: evidenceOnly, toState: 'done' }).ok,
    false
  );
  assert.equal(
    (
      await planApprovedGuard.run({
        body: `${evidenceOnly}\n<!-- aitm-plan-approved ts="2026-08-02T16:00:00Z" -->`,
        toState: 'develop',
      })
    ).ok,
    true
  );
  assert.equal(
    reviewExitReviewApprovedGuard.run({
      body: `${evidenceOnly}\n<!-- aitm-review-approved ts="2026-08-02T16:00:00Z" -->`,
      toState: 'done',
    }).ok,
    true
  );
});
