// @story #1498
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { recordFixture } from '../../../../helpers/evidence-v2/records.mjs';
import { journalPorts } from '../../../../helpers/evidence-v2/journal-ports.mjs';
import { buildEvidenceSubject } from '../../../../../task-tracker/lib/evidence-v2/subject.mjs';
import { authorizeAcceptance } from '../../../../../task-tracker/lib/evidence-v2/acceptance.mjs';
import { createRecord } from '../../../../../task-tracker/lib/evidence-v2/codec.mjs';
import { appendRecord, readJournal } from '../../../../../task-tracker/lib/evidence-v2/journal.mjs';
import {
  resolveDeliveryIntent,
  verifyDelivery,
} from '../../../../../task-tracker/lib/evidence-v2/delivery.mjs';
import { renderProtocolMarker } from '../../../../../task-tracker/lib/evidence-v2/protocol.mjs';
import { runDeliver } from '../../../../../task-tracker/verbs/deliver.mjs';
import { resolveAcceptedDeliveryAuthority } from '../../../../../task-tracker/lib/delivery-authority.mjs';
import { rawProjectConfig } from '../../../../../task-tracker/config.mjs';

function deliveryPolicy(f) {
  return {
    id: f.policy.id,
    version: f.policy.version,
    requiredMethod: 'squash',
    providers: ['github'],
  };
}

async function accept(f, candidate = f.candidate, verification = f.verification) {
  const reviewAuthority = {
    ...f.reviewAuthority,
    candidateId: candidate.recordId,
    requirementsDigest: candidate.payload.subject.requirementsDigest,
  };
  const result = await authorizeAcceptance({
    cycle: f.cycle,
    candidate,
    verificationRecords: [verification],
    reviewAuthority,
    policy: f.policy,
    target: f.target,
  });
  return f.make('acceptance', result.payload, { predecessorId: verification.recordId });
}

function prFor(f, candidate, { id = 'PR_rehearsal_2000001', number = 2000001 } = {}) {
  return {
    provider: 'github',
    id,
    number,
    repositoryId: f.repositoryId,
    baseRef: f.target.ref,
    headRef: 'refs/heads/feature',
    headSha: f.sandbox.git(['rev-parse', 'HEAD']),
    treeOid: candidate.payload.subject.source.treeOid,
  };
}

function appendArgs(f, record) {
  return {
    record,
    expectedHead: record.predecessorId,
    authority: { context: f.sandbox.context, hostId: f.authorityHostId },
    ports: journalPorts(f.sandbox.context),
  };
}

function deliveryObservations(f, pr) {
  const live = f.sandbox.provider.pullRequest(pr.id);
  return {
    repositoryId: f.repositoryId,
    provider: live.provider,
    prId: live.id,
    prNumber: live.number,
    baseRef: live.baseRef,
    headSha: live.headSha,
    state: live.state,
    landedCommitSha: live.landedCommitSha,
    landedTreeOid: live.landedTreeOid,
    targetHeadSha: live.targetHeadSha,
    method: live.method,
    transportResult: live.transportResult,
    contradictory: null,
  };
}

test('intent is journaled before one provider effect and lost response resumes by readback', async () => {
  const f = recordFixture();
  try {
    const acceptance = await accept(f);
    for (const record of [f.cycle, f.candidate, f.verification, acceptance])
      await appendRecord(appendArgs(f, record));

    const originalSha = f.sandbox.git(['rev-parse', 'HEAD']);
    f.sandbox.git(['commit', '--amend', '-m', 'metadata rewrite with identical content']);
    const rewrittenSha = f.sandbox.git(['rev-parse', 'HEAD']);
    assert.notEqual(rewrittenSha, originalSha);
    assert.equal(
      f.sandbox.git(['rev-parse', 'HEAD^{tree}']),
      f.candidate.payload.subject.source.treeOid
    );

    const pr = prFor(f, f.candidate);
    const operationId = randomUUID();
    const intentPayload = resolveDeliveryIntent({
      acceptance,
      candidate: f.candidate,
      pr,
      policy: deliveryPolicy(f),
      operation: { operationId, requestedMethod: 'squash' },
    });
    const intent = createRecord({
      schema: 'aitm.evidence-record/v2',
      recordType: 'delivery-intent',
      repositoryId: f.repositoryId,
      issueNumber: 1000001,
      cycleId: f.cycle.cycleId,
      operationId,
      predecessorId: acceptance.recordId,
      actor: { id: 'rehearsal-author', kind: 'user' },
      recordedAt: '2026-09-03T17:00:00.000Z',
      payload: intentPayload,
    });
    await appendRecord(appendArgs(f, intent));
    assert.equal(
      (
        await readJournal({
          repositoryId: f.repositoryId,
          issueNumber: 1000001,
          ports: journalPorts(f.sandbox.context),
        })
      ).headId,
      intent.recordId
    );

    f.sandbox.provider.seedPullRequest({ ...pr, issueNumber: 1000001 });
    assert.throws(
      () =>
        f.sandbox.provider.mergePullRequest({
          id: pr.id,
          expectedHeadSha: pr.headSha,
          landedCommitSha: '3'.repeat(40),
          landedTreeOid: pr.treeOid,
          targetHeadSha: '4'.repeat(40),
          method: 'squash',
          operationId,
          fault: 'after-effect',
        }),
      /fault:after-effect/
    );
    const intentWithId = { ...intent.payload, intentId: intent.recordId };
    const payload = await verifyDelivery({
      intent: intentWithId,
      observations: deliveryObservations(f, pr),
      ports: { inspectCommit: async () => ({ treeOid: pr.treeOid }) },
    });
    const delivery = createRecord({
      schema: 'aitm.evidence-record/v2',
      recordType: 'delivery',
      repositoryId: f.repositoryId,
      issueNumber: 1000001,
      cycleId: f.cycle.cycleId,
      operationId: randomUUID(),
      predecessorId: intent.recordId,
      actor: { id: 'rehearsal-author', kind: 'runner' },
      recordedAt: '2026-09-03T17:01:00.000Z',
      payload,
    });
    await appendRecord(appendArgs(f, delivery));

    assert.equal(
      f.sandbox.provider.effects().filter((effect) => effect.kind === 'merge-pr').length,
      1
    );
    assert.equal(
      (
        await readJournal({
          repositoryId: f.repositoryId,
          issueNumber: 1000001,
          ports: journalPorts(f.sandbox.context),
        })
      ).headId,
      delivery.recordId
    );
  } finally {
    f.sandbox.dispose();
  }
});

test('real Git multi-source squash matches accepted tree while changed-base and dropped content refuse', async () => {
  const f = recordFixture();
  try {
    const originalBase = f.sandbox.git(['rev-parse', 'HEAD']);
    f.sandbox.git(['checkout', '-qb', 'feature']);
    await import('node:fs').then(({ appendFileSync, writeFileSync }) => {
      appendFileSync(`${f.sandbox.context.sourceRoot}/source.txt`, 'feature one\n');
      writeFileSync(`${f.sandbox.context.sourceRoot}/second.txt`, 'feature two\n');
    });
    f.sandbox.git(['add', 'source.txt']);
    f.sandbox.git(['commit', '-qm', 'feature one']);
    f.sandbox.git(['add', 'second.txt']);
    f.sandbox.git(['commit', '-qm', 'feature two']);
    const captured = buildEvidenceSubject(f.input);
    const candidate = f.make(
      'candidate',
      {
        ...f.candidate.payload,
        subject: captured.subject,
        sourceSha: captured.observations.sourceSha,
      },
      { predecessorId: f.cycle.recordId }
    );
    const verification = f.make(
      'verification',
      {
        ...f.verification.payload,
        candidateId: candidate.recordId,
        subjectId: candidate.payload.subject.subjectId,
        testedSha: candidate.payload.sourceSha,
      },
      { predecessorId: candidate.recordId }
    );
    const acceptance = await accept(f, candidate, verification);
    const acceptedHead = f.sandbox.git(['rev-parse', 'HEAD']);
    f.sandbox.git(['checkout', '-q', 'trunk']);
    f.sandbox.git(['commit', '--amend', '-m', 'same base tree, rewritten identity']);
    f.sandbox.git(['checkout', '-q', 'feature']);
    f.sandbox.git(['rebase', '--onto', 'trunk', originalBase, 'feature']);
    const featureHead = f.sandbox.git(['rev-parse', 'HEAD']);
    assert.notEqual(featureHead, acceptedHead);
    assert.equal(
      f.sandbox.git(['rev-parse', 'HEAD^{tree}']),
      candidate.payload.subject.source.treeOid
    );
    const pr = prFor(f, candidate, { id: 'PR_rehearsal_2000002', number: 2000002 });
    const intent = resolveDeliveryIntent({
      acceptance,
      candidate,
      pr,
      policy: deliveryPolicy(f),
      operation: { operationId: randomUUID(), requestedMethod: 'squash' },
    });

    f.sandbox.git(['checkout', '-q', 'trunk']);
    f.sandbox.git(['merge', '--squash', featureHead]);
    f.sandbox.git(['commit', '-qm', 'squashed delivery']);
    const landedCommitSha = f.sandbox.git(['rev-parse', 'HEAD']);
    const landedTreeOid = f.sandbox.git(['rev-parse', 'HEAD^{tree}']);
    assert.equal(landedTreeOid, intent.authorizedTreeOid);
    const delivered = await verifyDelivery({
      intent,
      observations: {
        repositoryId: f.repositoryId,
        provider: pr.provider,
        prId: pr.id,
        prNumber: pr.number,
        baseRef: pr.baseRef,
        headSha: pr.headSha,
        state: 'MERGED',
        landedCommitSha,
        landedTreeOid,
        targetHeadSha: landedCommitSha,
        method: 'squash',
        transportResult: 'merged',
        contradictory: null,
      },
      ports: {
        inspectCommit: async ({ sha }) => ({
          treeOid: f.sandbox.git(['show', '-s', '--format=%T', sha]),
        }),
      },
    });
    assert.equal(delivered.contentVerification.result, 'match');

    await import('node:fs').then(({ writeFileSync }) =>
      writeFileSync(`${f.sandbox.context.sourceRoot}/base-change.txt`, 'changed target\n')
    );
    f.sandbox.git(['add', 'base-change.txt']);
    f.sandbox.git(['commit', '-qm', 'target advances']);
    assert.notEqual(f.sandbox.git(['rev-parse', 'HEAD^{tree}']), delivered.landedTreeOid);
    assert.equal(delivered.contentVerification.result, 'match');

    assert.throws(
      () =>
        resolveDeliveryIntent({
          acceptance,
          candidate,
          pr: { ...pr, treeOid: f.sandbox.git(['rev-parse', 'HEAD^{tree}']) },
          policy: deliveryPolicy(f),
          operation: { operationId: randomUUID(), requestedMethod: 'squash' },
        }),
      /delivery-content/
    );
    await assert.rejects(
      () =>
        verifyDelivery({
          intent,
          observations: {
            repositoryId: f.repositoryId,
            provider: pr.provider,
            prId: pr.id,
            prNumber: pr.number,
            baseRef: pr.baseRef,
            headSha: pr.headSha,
            state: 'MERGED',
            landedCommitSha: f.sandbox.git(['rev-parse', 'HEAD']),
            landedTreeOid: f.sandbox.git(['rev-parse', 'HEAD^{tree}']),
            targetHeadSha: f.sandbox.git(['rev-parse', 'HEAD']),
            method: 'squash',
            transportResult: 'merged',
            contradictory: 'reverted',
          },
          ports: {
            inspectCommit: async () => ({ treeOid: f.sandbox.git(['rev-parse', 'HEAD^{tree}']) }),
          },
        }),
      /contradictory/
    );
  } finally {
    f.sandbox.dispose();
  }
});

test('public deliver dispatcher selects synthetic v2 and leaves unmarked bodies on v1', async () => {
  const f = recordFixture();
  try {
    const acceptance = await accept(f);
    const marker = renderProtocolMarker({
      schema: 'aitm.evidence-projection/v2',
      repositoryId: f.repositoryId,
      issueNumber: 1000001,
      cycleId: f.cycle.cycleId,
      headId: acceptance.recordId,
      authorityHostId: f.authorityHostId,
    });
    let calls = 0;
    const result = await runDeliver({
      issueNumber: 1000001,
      cfg: { repo: f.sandbox.context.repositoryId },
      state: {},
      deps: {
        executionContext: f.sandbox.context,
        fetchIssue: async () => ({ number: 1000001, body: marker }),
        resolveLineage: async () => ({ parentIssueNumber: null, deliveryTarget: 'trunk' }),
        runEvidenceV2Delivery: async ({ protocol }) => {
          calls += 1;
          return { status: 'delivered', protocol: protocol.protocol };
        },
      },
    });
    assert.deepEqual(result, { status: 'delivered', protocol: 'v2' });
    assert.equal(calls, 1);

    const v1Head = 'a'.repeat(40);
    const v1 = resolveAcceptedDeliveryAuthority({
      issueNumber: 1498,
      branch: 'codex/legacy',
      localHeadSha: v1Head,
      testReceiptSha: v1Head,
      reviewReceiptSha: v1Head,
      agentReviewPassed: true,
      pullRequests: [{ number: 42, headRefName: 'codex/legacy', headRefOid: v1Head }],
    });
    assert.equal(v1.acceptedSha, v1Head);
    assert.equal(rawProjectConfig().fullAutoMerge.mergeMethod, 'squash');
    assert.throws(
      () =>
        resolveAcceptedDeliveryAuthority({
          issueNumber: 1498,
          branch: 'codex/legacy',
          localHeadSha: 'b'.repeat(40),
          testReceiptSha: v1Head,
          reviewReceiptSha: v1Head,
          agentReviewPassed: true,
          pullRequests: [{ number: 42, headRefName: 'codex/legacy', headRefOid: 'b'.repeat(40) }],
        }),
      /ambiguous-pr/
    );
  } finally {
    f.sandbox.dispose();
  }
});
