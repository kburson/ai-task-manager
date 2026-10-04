// @story #1878
import assert from 'node:assert/strict';
import { unitTest as test } from '../../../helpers/unit-runtime-root.mjs';
import { closeBody, runClose } from '../../../helpers/close-convergence-wiring-helpers.mjs';
import {
  upsertDeliveredCloseTransaction,
  readDeliveredCloseTransactions,
  TERMINAL_CLOSE_STEPS,
} from '../../../../task-tracker/lib/close-convergence.mjs';

const HEAD = 'a'.repeat(40);
function partialBody() {
  return upsertDeliveredCloseTransaction(closeBody(), {
    schema: 'aitm.delivered-close/v1',
    transactionId: '1878-partial-close',
    issueNumber: 925,
    acceptedSha: HEAD,
    reviewAuthority: 'gate-bypassed',
    completedSteps: ['timing'],
  });
}
async function retry(change = null) {
  let resolvingOutcome = false;
  let outcomeReads = 0;
  const gate = {
    issueNumber: 925,
    acceptedSha: HEAD,
    localHeadSha: HEAD,
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    branch: 'feature/925',
    pullRequests: [{ number: 70, headRefOid: HEAD, state: 'MERGED' }],
    reviewAuthority: { outcome: 'passed', acceptedSha: HEAD },
    records: { liveIntent: { record: { intentId: 'intent-1', expectedHeadSha: HEAD } } },
  };
  const run = await runClose({
    body: partialBody(),
    boardState: 'done',
    closeSnapshot: { issueClosed: false, stateReason: null },
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'full-auto', standing: true, source: 'current-session' },
    createEstimationOutcomeWriter:
      ({ resolveDeliveryAuthority }) =>
      async () => {
        resolvingOutcome = true;
        outcomeReads += 1;
        const authority = await resolveDeliveryAuthority({ issueNumber: 925 });
        assert.equal(authority.authorization.source, 'delivered-close-transaction');
        return { status: 'existing' };
      },
    contextOverrides: {
      loadCloseDeliveryGateInput: async () => {
        const observed = structuredClone(gate);
        if (resolvingOutcome && change) change(observed);
        return observed;
      },
    },
  });
  return { ...run, outcomeReads };
}
test('partial close estimation refresh uses durable authority and completes only the missing suffix without force', async () => {
  const run = await retry();
  assert.equal(run.exitCode, 0);
  assert.ok(run.outcomeReads > 0);
  assert.equal(run.calls.timingRows.length, 0);
  assert.equal(run.calls.movesToDone.length, 0);
  assert.equal(run.calls.issueCloses, 1);
  assert.equal(run.calls.bindingReleases, 1);
  assert.deepEqual(
    readDeliveredCloseTransactions(run.body)[0].completedSteps,
    TERMINAL_CLOSE_STEPS
  );
});
for (const [name, change] of [
  [
    'approval revocation',
    (gate) => {
      gate.reviewAuthority.outcome = 'missing';
    },
  ],
  [
    'accepted source change',
    (gate) => {
      gate.acceptedSha = 'b'.repeat(40);
    },
  ],
  [
    'PR head change',
    (gate) => {
      gate.pullRequests[0].headRefOid = 'b'.repeat(40);
    },
  ],
  [
    'intent byte change',
    (gate) => {
      gate.records.liveIntent.record.expectedHeadSha = 'b'.repeat(40);
    },
  ],
]) {
  test(`partial close refuses ${name} observed by estimation and preserves the completed prefix`, async () => {
    const run = await retry(change);
    assert.equal(run.exitCode, 1);
    assert.equal(run.calls.timingRows.length, 0);
    assert.equal(run.calls.movesToDone.length, 0);
    assert.equal(run.calls.issueCloses, 0);
    assert.deepEqual(readDeliveredCloseTransactions(run.body)[0].completedSteps, ['timing']);
  });
}
