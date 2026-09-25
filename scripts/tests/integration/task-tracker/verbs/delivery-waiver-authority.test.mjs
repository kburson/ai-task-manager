// @story #1787 #1795
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import test from 'node:test';

import { makeDeliveryAuthorityFixture } from '../../../unit/task-tracker/lib/delivery-waiver-authority-fixtures.mjs';
import { hashRecordPayload } from '../../../../task-tracker/lib/github-records/record-envelope.mjs';
import {
  DeliveryWaiverAuthorityError,
  resolveDeliveryWaiver,
} from '../../../../task-tracker/lib/workflow-policy/delivery-waiver-authority.mjs';
import { prepareDeliveryWaiver } from '../../../../task-tracker/lib/workflow-policy/delivery-request.mjs';
import { executeWorkflowExceptionWrite } from '../../../../task-tracker/lib/workflow-policy/exception-store.mjs';

test('delivery grant requires the genuine exact Codex user statement and scope', async () => {
  for (const option of [
    {},
    { role: 'assistant' },
    { statement: 'Authorize a different delivery scope.' },
    { scopeOverride: { acceptedHeadSha: 'c'.repeat(40) } },
  ]) {
    const fixture = makeDeliveryAuthorityFixture(option);
    try {
      if (Object.keys(option).length === 0) {
        const result = await resolveDeliveryWaiver(fixture);
        assert.equal(result.outcome, 'waived');
        assert.equal(result.grant.recordId, fixture.envelope.recordId);
        assert.equal(result.waiverScopeDigest, fixture.prepared.request.waiverScopeDigest);
      } else {
        await assert.rejects(
          () => resolveDeliveryWaiver(fixture),
          (error) => error instanceof DeliveryWaiverAuthorityError && error.outcome !== 'waived'
        );
      }
    } finally {
      rmSync(fixture.sandbox, { recursive: true, force: true });
    }
  }
});

test('wrong issue, pull request, base, and operation never select authority', async () => {
  for (const scopeOverride of [
    { issue: 1796 },
    { pullRequest: 1786 },
    { baseRef: 'release' },
    { deliveryOperationId: '01M2H000000000000000000002' },
  ]) {
    const fixture = makeDeliveryAuthorityFixture({ scopeOverride });
    try {
      let outcome;
      try {
        outcome = (await resolveDeliveryWaiver(fixture)).outcome;
      } catch (error) {
        assert.ok(error instanceof DeliveryWaiverAuthorityError);
        outcome = error.outcome;
      }
      assert.notEqual(outcome, 'waived');
    } finally {
      rmSync(fixture.sandbox, { recursive: true, force: true });
    }
  }
});

test('unreadable host source is indeterminate', async () => {
  const fixture = makeDeliveryAuthorityFixture();
  try {
    fixture.runtime.resolveTranscriptPath = () => null;
    await assert.rejects(
      () => resolveDeliveryWaiver(fixture),
      (error) =>
        error instanceof DeliveryWaiverAuthorityError &&
        error.category === 'delivery-waiver-ambiguity' &&
        error.outcome === 'indeterminate'
    );
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test('stored delivery grant with a placeholder reason never resolves', async () => {
  const fixture = makeDeliveryAuthorityFixture();
  try {
    const envelope = structuredClone(fixture.envelope);
    envelope.payload.reason = 'TBD';
    envelope.payloadHash = hashRecordPayload(envelope.payload);
    fixture.records = [{ envelope, commentNodeId: `IC_${envelope.recordId}` }];
    await assert.rejects(
      () => resolveDeliveryWaiver(fixture),
      (error) => error instanceof DeliveryWaiverAuthorityError && error.outcome !== 'waived'
    );
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test('expired and body-stale delivery grant accepts an exact revocation', async () => {
  const fixture = makeDeliveryAuthorityFixture({
    createdAt: '2026-09-25T06:00:00.000Z',
    expiresAt: '2026-09-25T07:00:00.000Z',
    observedAt: '2026-09-25T08:00:00.000Z',
  });
  try {
    const issue = fixture.envelope.issue;
    const repository = fixture.envelope.repository;
    const scopeIdentity = `sha256:${'d'.repeat(64)}`;
    const input = {
      ...fixture.prepared.proposal,
      action: 'revoke',
      priorRecordId: fixture.envelope.recordId,
      priorRevision: 1,
      reason: 'The operator revokes the expired grant under the current issue body.',
      expiresAt: '2026-09-26T08:00:00.000Z',
    };
    const prior = {
      recordId: fixture.envelope.recordId,
      revision: 1,
      exceptionId: fixture.envelope.payload.exceptionId,
      deliveryScope: fixture.envelope.payload.deliveryScope,
    };
    const prepared = prepareDeliveryWaiver({
      input,
      facts: {
        repository,
        issue,
        scopeIdentity,
        originalIntentRecordId: '01M2H000000000000000000080',
        prior,
        now: fixture.now,
      },
    });
    const records = [...fixture.records];
    const runtime = {
      async listRecords() {
        return [...records];
      },
      async appendRecord({ envelope }) {
        records.push({ envelope, commentNodeId: `IC_${envelope.recordId}` });
      },
      nextIds() {
        return { recordId: '01M2H000000000000000000022', grantId: '01M2H000000000000000000023' };
      },
    };
    const authority = {
      ...fixture.envelope.payload.approvalEvidence,
      reference: 'codex://sessions/01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed/messages/msg_revoke',
      statement: prepared.statement,
    };
    const result = await executeWorkflowExceptionWrite({
      action: 'revoke',
      repository,
      issue,
      scopeIdentity,
      request: prepared.request,
      authority,
      now: fixture.now,
      runtime,
    });
    assert.equal(result.status, 'revoked');
    assert.equal(records[1].envelope.payload.expiresAt, input.expiresAt);
    assert.equal(records[1].envelope.payload.status, 'revoked');
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});
