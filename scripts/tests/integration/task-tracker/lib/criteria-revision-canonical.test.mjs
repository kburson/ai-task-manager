// @story #1854
import {
  createAitmRecordEnvelope,
  renderAitmRecord,
  parseAitmRecord,
} from '../../../../task-tracker/lib/github-records/record-envelope.mjs';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCanonicalRevisionFixture } from '../../../fixtures/criteria-revision.mjs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import {
  applyRevision,
  observeRevision,
  recoverRevision,
  prepareRevision,
} from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
test('shared engine applies canonical revision and observes exact amended authority', async () => {
  const f = makeCanonicalRevisionFixture();
  const deps = createRevisionMemory({
    observation: f.observation,
    comments: [],
    hostMessages: [f.rawUserMessage],
  });
  const context = {
    repository: f.observation.repository,
    issue: f.observation.issue,
    executor: f.observation.executor,
  };
  const result = await applyRevision({ context, request: f.request, deps });
  assert.equal(result.status, 'applied', JSON.stringify(result));
  assert.equal((await observeRevision({ context, deps })).status, 'applied');
  assert.deepEqual(deps.observation.contract.value.acceptedRecordIds, []);
  assert.equal(deps.observation.contract.value.contractEpoch, f.contract.contractEpoch + 1);
});

for (const seam of [
  'capsule-write',
  'capsule-readback',
  'contract-write',
  'contract-readback',
  'proof-write',
  'proof-readback',
  'body-write',
  'body-readback',
]) {
  test(`canonical recovery resumes only remaining writes after ${seam}`, async () => {
    const f = makeCanonicalRevisionFixture(),
      deps = createRevisionMemory({
        observation: f.observation,
        comments: [],
        hostMessages: [f.rawUserMessage],
      });
    const context = {
      repository: f.observation.repository,
      issue: f.observation.issue,
      executor: f.observation.executor,
    };
    deps.failAfter = seam;
    await applyRevision({ context, request: f.request, deps }).catch((error) =>
      assert.match(error.message, /interrupted/)
    );
    const before = deps.effects.filter((x) =>
      ['capsule-write', 'contract-write', 'proof-write', 'body-write'].includes(x)
    );
    const state = await observeRevision({ context, deps });
    assert.ok(['pending-prefix', 'pending-after'].includes(state.status), JSON.stringify(state));
    const result = await recoverRevision({ context, request: f.request, deps });
    assert.equal(result.status, 'applied', JSON.stringify(result));
    assert.deepEqual(
      deps.effects.filter((x) =>
        ['capsule-write', 'contract-write', 'proof-write', 'body-write'].includes(x)
      ),
      ['capsule-write', 'contract-write', 'proof-write', 'body-write']
    );
    assert.ok(before.length > 0);
  });
}
test('new resume authorization retains exact canonical target and planned resource identities', async () => {
  const f = makeCanonicalRevisionFixture(),
    deps = createRevisionMemory({
      observation: f.observation,
      comments: [],
      hostMessages: [f.rawUserMessage],
    });
  const context = {
    repository: f.observation.repository,
    issue: f.observation.issue,
    executor: f.observation.executor,
  };
  deps.failAfter = 'contract-write';
  await assert.rejects(applyRevision({ context, request: f.request, deps }), /interrupted/);
  const prepared = await prepareRevision({
    context,
    input: {
      mode: 'resume',
      operationId: 'resume-operation',
      transactionId: f.proposal.transactionId,
      reason: 'Resume recorded canonical prefix',
      edits: { acceptanceCriteria: [], verificationCommands: [] },
    },
    deps,
  });
  assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
  assert.deepEqual(prepared.proposal.writeSet, f.proposal.writeSet);
});

test('draft revision preserves draft status with empty current proof', async () => {
  const f = makeCanonicalRevisionFixture({ draftOnly: true }),
    deps = createRevisionMemory({
      observation: f.observation,
      comments: [],
      hostMessages: [f.rawUserMessage],
    });
  const context = {
    repository: f.observation.repository,
    issue: f.observation.issue,
    executor: f.observation.executor,
  };
  const result = await applyRevision({ context, request: f.request, deps });
  assert.equal(result.status, 'applied', JSON.stringify(result));
  assert.equal(deps.observation.contract.value.status, 'draft');
  assert.deepEqual(deps.observation.proofRecords, []);
});
test('expiry after preparation refuses authority before any new effects', async () => {
  const f = makeCanonicalRevisionFixture(),
    deps = createRevisionMemory({
      observation: f.observation,
      comments: [],
      hostMessages: [f.rawUserMessage],
    });
  const context = {
    repository: f.observation.repository,
    issue: f.observation.issue,
    executor: f.observation.executor,
  };
  const o = deps.observation,
    grant = { ...f.nativeGrant, expiresAt: '2026-10-01T00:00:00.000Z' };
  const record = o.canonicalArchive.records[0];
  const before = parseAitmRecord({
    commentNodeId: record.recordId,
    body: record.bytes,
    expectedRepository: o.repository,
    expectedIssue: o.issue,
  }).envelope;
  record.bytes = renderAitmRecord({
    envelope: createAitmRecordEnvelope({
      ...before,
      grantId: before.authority.grantId,
      epoch: before.authority.epoch,
      actor: before.authority.actor,
      payload: grant,
    }),
  });
  o.grant.bytes = canonicalRecordJson(grant);
  deps.replaceAuthority(o);
  const result = await applyRevision({ context, request: f.request, deps });
  assert.equal(result.status, 'refused');
  assert.match(result.code, /revision-authority-unavailable/);
  assert.equal(deps.createdEvents.length, 0);
  assert.ok(!deps.effects.some((x) => x.endsWith('-write')));
});
test('a changed observation timestamp alone does not stale sealed canonical authority', async () => {
  const f = makeCanonicalRevisionFixture(),
    deps = createRevisionMemory({
      observation: f.observation,
      comments: [],
      hostMessages: [f.rawUserMessage],
    });
  const context = {
    repository: f.observation.repository,
    issue: f.observation.issue,
    executor: f.observation.executor,
  };
  const o = deps.observation;
  o.canonicalArchive.observedAt = '2026-09-30T00:01:00.000Z';
  deps.replaceAuthority(o);
  const result = await applyRevision({ context, request: f.request, deps });
  assert.equal(result.status, 'applied', JSON.stringify(result));
});

test('canonical declaration projection supports the next genuine revision', async () => {
  const f = makeCanonicalRevisionFixture(),
    deps = createRevisionMemory({
      observation: f.observation,
      comments: [],
      hostMessages: [f.rawUserMessage],
    });
  const context = {
    repository: f.observation.repository,
    issue: f.observation.issue,
    executor: f.observation.executor,
  };
  assert.equal((await applyRevision({ context, request: f.request, deps })).status, 'applied');
  const old = deps.observation.contract.value.acceptanceCriteria[0];
  const { hashBytes } = await import('../../../../task-tracker/lib/criteria-revision/schema.mjs');
  const prepared = await prepareRevision({
    context,
    input: {
      mode: 'revision',
      operationId: 'next-operation',
      transactionId: 'next-revision',
      reason: 'Correct next canonical requirement',
      edits: {
        acceptanceCriteria: [
          {
            operation: 'replace',
            occurrence: 1,
            oldBytes: canonicalRecordJson(old),
            oldHash: hashBytes(canonicalRecordJson(old)),
            replacements: [
              {
                text: 'Further supported model hooks',
                declaration: { kind: 'vc-list', vcIds: ['vc-hook'] },
              },
            ],
          },
        ],
        verificationCommands: [],
      },
    },
    deps,
  });
  assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
});
test('canonical semantic declaration drift cannot borrow a matching body projection', async () => {
  const f = makeCanonicalRevisionFixture(),
    deps = createRevisionMemory({
      observation: f.observation,
      comments: [],
      hostMessages: [f.rawUserMessage],
    });
  const context = {
    repository: f.observation.repository,
    issue: f.observation.issue,
    executor: f.observation.executor,
  };
  assert.equal((await applyRevision({ context, request: f.request, deps })).status, 'applied');
  const o = deps.observation;
  o.criterionBindings[0].vcIds = ['vc-independent'];
  deps.replaceAuthority(o);
  assert.equal((await observeRevision({ context, deps })).status, 'authority-drift');
});

import { renderApprovalStatement } from '../../../../task-tracker/lib/criteria-revision/proposal.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';
function scenario() {
  const f = makeCanonicalRevisionFixture(),
    deps = createRevisionMemory({
      observation: f.observation,
      comments: [],
      hostMessages: [f.rawUserMessage],
    });
  return {
    ...f,
    deps,
    context: {
      repository: f.observation.repository,
      issue: f.observation.issue,
      executor: f.observation.executor,
    },
  };
}
function authorizeRecovery(f, proposal) {
  const text = renderApprovalStatement(proposal),
    messageId = 'actual-recovery-message';
  f.deps.addHostMessage({
    ...f.rawUserMessage,
    id: messageId,
    content: [{ type: 'input_text', text }],
  });
  return {
    schema: 'aitm.criteria-revision/v1',
    action: 'recover',
    proposal,
    authorizationSource: { ...f.authorizationSource, messageId, statementHash: hashBytes(text) },
  };
}
function appendAuthority(o, recordType, payload, recordId) {
  const envelope = createAitmRecordEnvelope({
      repository: o.repository,
      issue: o.issue,
      recordType,
      payload,
      recordId,
      predecessor: o.capsule.head,
      actor: o.grant.coordinator.actor,
      epoch: o.grant.epoch,
      grantId: o.grant.identity,
      createdAt: '2026-09-30T00:01:00.000Z',
    }),
    bytes = renderAitmRecord({ envelope });
  o.canonicalArchive.records.push({ recordId, bytes });
  o.capsule = { head: recordId, bytes };
}
for (const state of ['revoked', 'replaced'])
  test(`durable ${state} grant record refuses original revision with zero revision effects`, async () => {
    const f = scenario(),
      o = f.deps.observation;
    if (state === 'replaced')
      appendAuthority(
        o,
        'coordinator-grant',
        {
          ...f.nativeGrant,
          grantId: '01J00000000000000000000006',
          epoch: 2,
          issuer: f.nativeGrant.coordinator,
        },
        '01J00000000000000000000007'
      );
    appendAuthority(
      o,
      'coordinator-revocation',
      {
        schema: 'aitm.coordinator-revocation/v1',
        grantId: f.nativeGrant.grantId,
        epoch: 1,
        state,
        ...(state === 'replaced' ? { replacementGrantId: '01J00000000000000000000006' } : {}),
      },
      '01J00000000000000000000008'
    );
    f.deps.replaceAuthority(o);
    const result = await applyRevision({ context: f.context, request: f.request, deps: f.deps });
    assert.equal(result.status, 'refused');
    assert.match(result.code, /revision-authority-unavailable/);
    assert.equal(f.deps.createdEvents.length, 0);
    assert.ok(!f.deps.effects.some((e) => e.endsWith('-write')));
  });
test('fresh resume authorization executes the sealed target after a canonical prefix', async () => {
  const f = scenario();
  f.deps.failAfter = 'contract-write';
  await assert.rejects(
    applyRevision({ context: f.context, request: f.request, deps: f.deps }),
    /interrupted/
  );
  const prepared = await prepareRevision({
    context: f.context,
    input: {
      mode: 'resume',
      operationId: 'resume-fresh',
      transactionId: f.proposal.transactionId,
      reason: 'Resume exact recorded target',
      edits: { acceptanceCriteria: [], verificationCommands: [] },
    },
    deps: f.deps,
  });
  assert.equal(prepared.status, 'prepared', prepared.code);
  const result = await recoverRevision({
    context: f.context,
    request: authorizeRecovery(f, prepared.proposal),
    deps: f.deps,
  });
  assert.equal(result.status, 'applied', result.code);
  assert.deepEqual(
    f.deps.effects.filter((e) =>
      ['capsule-write', 'contract-write', 'proof-write', 'body-write'].includes(e)
    ),
    ['capsule-write', 'contract-write', 'proof-write', 'body-write']
  );
});
test('JSON key ordering cannot change canonical recovery identity or borrow another executor', async () => {
  const f = scenario(),
    request = JSON.parse(canonicalRecordJson(f.request));
  f.deps.failAfter = 'proof-write';
  await assert.rejects(applyRevision({ context: f.context, request, deps: f.deps }), /interrupted/);
  const foreign = {
    ...f.context,
    executor: { ...f.context.executor, sessionId: 'foreign-session' },
  };
  assert.equal(
    (await recoverRevision({ context: foreign, request, deps: f.deps })).status,
    'refused'
  );
  assert.equal(
    (await recoverRevision({ context: f.context, request, deps: f.deps })).status,
    'applied'
  );
});
test('future sealed preparation time cannot excuse grant validity or publish events', async () => {
  const f = scenario(),
    o = f.deps.observation;
  o.canonicalArchive.observedAt = '2099-01-01T00:00:00.000Z';
  const { deriveProposal } =
    await import('../../../../task-tracker/lib/criteria-revision/proposal.mjs');
  const proposal = deriveProposal({ ...makeCanonicalRevisionFixture().context, observation: o });
  const request = authorizeRecovery(f, proposal);
  request.action = 'apply';
  const result = await applyRevision({ context: f.context, request, deps: f.deps });
  assert.equal(result.status, 'refused');
  assert.match(result.code, /future-canonical-time/);
  assert.equal(f.deps.createdEvents.length, 0);
});

test('forward repair requires already restored matching current grant and contract authority', async () => {
  const f = scenario();
  f.deps.failAfter = 'body-readback';
  await assert.rejects(
    applyRevision({ context: f.context, request: f.request, deps: f.deps }),
    /interrupted/
  );
  const o = f.deps.observation,
    newGrant = {
      ...f.nativeGrant,
      grantId: '01J00000000000000000000006',
      epoch: 2,
      issuer: f.nativeGrant.coordinator,
    };
  appendAuthority(o, 'coordinator-grant', newGrant, '01J00000000000000000000007');
  appendAuthority(
    o,
    'coordinator-revocation',
    {
      schema: 'aitm.coordinator-revocation/v1',
      grantId: f.nativeGrant.grantId,
      epoch: 1,
      state: 'replaced',
      replacementGrantId: newGrant.grantId,
    },
    '01J00000000000000000000008'
  );
  o.canonicalArchive.coordinationProjectionBytes = canonicalRecordJson({
    schema: 'aitm.coordination-projection/v1',
    grantId: newGrant.grantId,
    epoch: 2,
    adoptionState: 'adopted',
  });
  f.deps.replaceAuthority(o);
  const old = o.contract.value.acceptanceCriteria[0],
    input = {
      mode: 'forward-repair',
      operationId: 'restored-repair',
      transactionId: f.proposal.transactionId,
      reason: 'Repair under normally restored current authority',
      edits: {
        acceptanceCriteria: [
          {
            operation: 'replace',
            occurrence: 1,
            oldBytes: canonicalRecordJson(old),
            oldHash: hashBytes(canonicalRecordJson(old)),
            replacements: [
              {
                text: 'Further supported model hooks',
                declaration: { kind: 'vc-list', vcIds: ['vc-hook'] },
              },
            ],
          },
        ],
        verificationCommands: [],
      },
    };
  assert.equal(
    (await prepareRevision({ context: f.context, input, deps: f.deps })).status,
    'refused'
  );
  // Complete data-only fixture of the ordinary governed restoration, outside
  // revision execution: durable replacement plus matching singleton authority.
  o.grant = {
    ...o.grant,
    identity: newGrant.grantId,
    epoch: 2,
    bytes: canonicalRecordJson(newGrant),
  };
  o.contract.value = {
    ...o.contract.value,
    authorityEpoch: 2,
    coordinatorGrantId: newGrant.grantId,
  };
  o.contract.bytes = canonicalRecordJson(o.contract.value);
  appendAuthority(o, 'contract-amended', o.contract.value, '01J00000000000000000000009');
  f.deps.replaceAuthority(o);
  const prepared = await prepareRevision({ context: f.context, input, deps: f.deps });
  assert.equal(prepared.status, 'prepared', prepared.code);
  const result = await recoverRevision({
    context: f.context,
    request: authorizeRecovery(f, prepared.proposal),
    deps: f.deps,
  });
  assert.equal(result.status, 'applied', result.code);
  assert.equal(f.deps.observation.contract.value.coordinatorGrantId, newGrant.grantId);
  assert.equal(f.deps.observation.contract.value.authorityEpoch, 2);
});

for (const seam of [
  'event-write:prepared',
  'event-readback:prepared',
  'event-write:applied',
  'event-readback:applied',
])
  test(`canonical event interruption ${seam} preserves one effective target`, async () => {
    const f = scenario();
    f.deps.failAfter = seam;
    await assert.rejects(
      applyRevision({ context: f.context, request: f.request, deps: f.deps }),
      /interrupted/
    );
    const result = await recoverRevision({ context: f.context, request: f.request, deps: f.deps });
    assert.equal(result.status, 'applied', result.code);
    assert.equal(f.deps.createdEvents.filter((e) => e.type === 'prepared').length, 1);
    assert.equal(f.deps.createdEvents.filter((e) => e.type === 'applied').length, 1);
    assert.deepEqual(
      f.deps.effects.filter((e) =>
        ['capsule-write', 'contract-write', 'proof-write', 'body-write'].includes(e)
      ),
      ['capsule-write', 'contract-write', 'proof-write', 'body-write']
    );
  });

test('canonical revision retires body-carried downstream receipts while retaining timing history', async () => {
  const f = makeCanonicalRevisionFixture();
  const markers = [
    '<!-- aitm-test-receipt identity="old-test" -->',
    '<!-- aitm-agent-review identity="old-agent-review" -->',
    '<!-- aitm-review-approved ts="2026-09-30T00:00:00Z" -->',
  ];
  f.observation.body.bytes +=
    '\n' + markers.join('\n') + '\n<!-- aitm-timing-log synthetic="yes" -->';
  const { deriveProposal } =
    await import('../../../../task-tracker/lib/criteria-revision/proposal.mjs');
  const proposal = deriveProposal({ ...f.context, observation: f.observation }),
    statement = renderApprovalStatement(proposal);
  const request = {
    ...f.request,
    proposal,
    authorizationSource: { ...f.authorizationSource, statementHash: hashBytes(statement) },
  };
  const deps = createRevisionMemory({
    observation: f.observation,
    comments: [],
    hostMessages: [{ ...f.rawUserMessage, content: [{ type: 'input_text', text: statement }] }],
  });
  const context = {
    repository: f.observation.repository,
    issue: f.observation.issue,
    executor: f.observation.executor,
  };
  const result = await applyRevision({ context, request, deps });
  assert.equal(result.status, 'applied', result.code);
  for (const marker of markers) assert.ok(!deps.observation.body.bytes.includes(marker));
  assert.ok(deps.observation.body.bytes.includes('aitm-timing-log'));
});

test('direct canonical resource writer rejects reordered and digest-borrowing writes under a real lock', async () => {
  const f = scenario();
  f.deps.failAfter = 'event-write:prepared';
  await assert.rejects(
    applyRevision({ context: f.context, request: f.request, deps: f.deps }),
    /interrupted/
  );
  const { withMemoryInterlock, writeMemoryCanonical } =
    await import('../../../../task-tracker/lib/criteria-revision/store.mjs');
  const proposal = f.deps.createdEvents[0].proposal,
    write = proposal.writeSet.find((w) => w.resource === 'delivery-contract');
  await withMemoryInterlock(f.deps, f.context, async (capability) => {
    const { withCanonicalBodyWriteCapability } =
      await import('../../../../task-tracker/lib/criteria-revision/legacy.mjs');
    await assert.rejects(
      withCanonicalBodyWriteCapability(
        {
          backend: f.deps,
          capability,
          context: f.context,
          proposal,
          before: f.deps.observation.body.bytes,
        },
        () => true
      ),
      /canonical-body-order/
    );
    await assert.rejects(
      writeMemoryCanonical({ backend: f.deps, capability, context: f.context, proposal, write }),
      /canonical-write-order/
    );
    const tampered = { ...write, afterBytes: write.afterBytes + ' ' };
    tampered.afterHash = hashBytes(tampered.afterBytes);
    await assert.rejects(
      writeMemoryCanonical({
        backend: f.deps,
        capability,
        context: f.context,
        proposal: { ...proposal, writeSet: [tampered] },
        write: tampered,
      }),
      /canonical-effective-event/
    );
  });
  assert.ok(!f.deps.effects.includes('contract-write'));
});
