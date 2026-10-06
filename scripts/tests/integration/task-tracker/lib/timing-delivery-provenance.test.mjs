// @story #1857 #1894
import { createCascadeOutcomeAuthority } from '../../../../task-tracker/lib/estimation/cascade-outcome-authority.mjs';
import {
  parseVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';
import { hashRecordPayload } from '../../../../task-tracker/lib/github-records/record-envelope.mjs';
import {
  buildLocalTrunkCloseReceipt,
  renderLocalTrunkCloseReceipt,
} from '../../../../task-tracker/lib/local-trunk-close-receipt.mjs';
import { lineageDoneGate } from '../../../../task-tracker/lib/close-gates-lineage.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  projectDeliveryRecords,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalTestReceiptFixture } from '../../../fixtures/estimation-verification.mjs';
import { assertFieldsPersisted } from '../../../../task-tracker/verbs/close.mjs';
import {
  requireDeliveryReceipt,
  verifyCloseDeliveryReceipt,
} from '../../../../task-tracker/lib/close-delivery-receipt.mjs';
import {
  issue,
  repository,
  sha,
  forecastId,
  harness,
  closeBody,
  residentGate,
} from '../../../helpers/1857-timing-outcome-harness.mjs';

test('source issue with children retains its own frozen forecast and exact Test lane', async () => {
  const h = harness({ children: ['01J00000000000000000000842'] });
  const result = await h.runtime.ensure({
    issueNumber: issue,
    forecastRecordId: forecastId,
    body: closeBody(),
  });
  assert.equal(result.record.envelope.payload.kind, 'story');
  assert.equal(result.record.envelope.payload.telemetry.forecastStatus, 'frozen');
  assert.equal(result.record.envelope.payload.telemetry.verification.mode, 'exact-test');
  const missing = harness({ children: ['01J00000000000000000000842'] });
  await assert.rejects(
    () => missing.runtime.ensure({ issueNumber: issue, forecastRecordId: null, body: closeBody() }),
    /forecast-lineage/
  );
});

test('fresh delivery kind must match the body used to select forecast and accounting', async () => {
  const gate = residentGate();
  const h = harness({ resolveDeliveryAuthority: async () => gate });
  h.records.length = 0;
  await assert.rejects(
    () =>
      h.runtime.ensure({
        issueNumber: issue,
        forecastRecordId: null,
        body: closeBody().replace(/forecast-record-id=/g, 'old-record-id='),
      }),
    /outcome-delivery-kind/
  );
  assert.equal(h.records.length, 0);
});

test('parent-approved cascade reaches lawful child Close through fresh authority and immutable telemetry', async () => {
  const testBody = closeBody();
  const body = upsertVerificationReceipt(testBody, {
    ...parseVerificationReceipt(testBody, 'test'),
    stage: 'review',
    receiptId: '01J00000000000000000000992',
  });
  let authorized = true;
  const authority = createCascadeOutcomeAuthority({
    repository,
    parentIssue: 1847,
    issue,
    deps: {
      refreshParent: async () => ({
        authorization: { mode: authorized ? 'full-auto' : 'missing' },
        gateInput: { repository, issueNumber: 1847, acceptedSha: sha },
        receipt: { skipped: false, receipt: { acceptedSha: sha } },
        testReceiptSha: sha,
        acceptedReviewSha: sha,
      }),
      readChildBody: async () => body,
      readChildParent: async () => 1847,
      readChildCensus: async () => [{ num: issue, state: 'review' }],
      readLineage: async () => ({
        ok: true,
        evidence: {
          schema: 'aitm.lineage-delivery-evidence/v1',
          repository,
          issue,
          parentIssue: 1847,
          acceptedSha: sha,
          targetBranch: 'codex/1847',
          targetHead: 'b'.repeat(40),
          commits: ['c'.repeat(40)],
          children: [],
        },
      }),
    },
  });
  const h = harness({ resolveDeliveryAuthority: authority.resolveDeliveryAuthority });
  const args = {
    cfg: { repo: repository },
    issueNum: issue,
    acceptedSha: sha,
    pexec: async () => ({ stdout: body }),
    estimationOutcomeWriter: h.runtime,
  };
  const closed = await assertFieldsPersisted(args);
  assert.equal(closed.status, 'incomplete-telemetry-accepted');
  const original = JSON.stringify(h.records.at(-1));
  const proof = h.records.at(-1).envelope.payload.telemetry.verification;
  assert.equal(proof.cascadeScope.parentIssue, 1847);
  assert.equal(proof.cascadeScope.approvalMode, 'full-auto');
  assert.equal(proof.recordId, parseVerificationReceipt(testBody, 'test').receiptId);
  assert.ok(!body.includes('aitm-review-approved'));
  await assertFieldsPersisted(args);
  assert.equal(JSON.stringify(h.records.at(-1)), original);
  authorized = false;
  await assert.rejects(() => assertFieldsPersisted(args), /cascade-outcome-authority:parent/);
  assert.equal(JSON.stringify(h.records.at(-1)), original);
});

test('docs-only telemetry preserves genuine lint/format and recorded test lane skips', async () => {
  const quote = String.fromCharCode(34),
    nl = String.fromCharCode(10);
  const raw = canonicalTestReceiptFixture({ issue }).body.match(
    new RegExp('data=' + quote + '([A-Za-z0-9_-]+)' + quote)
  )[1];
  const receipt = JSON.parse(Buffer.from(raw, 'base64url').toString());
  receipt.commands = receipt.commands.filter((command) =>
    ['lint-full', 'format-full'].includes(command.classification)
  );
  receipt.verificationCommands = [];
  receipt.laneSkip = {
    reason: 'docs-only-diff',
    kind: 'docs-only',
    lanes: ['test-unit', 'test-integration', 'test-slow'],
    changedPaths: ['docs/1857-report.md'],
  };
  const encoded = Buffer.from(JSON.stringify(receipt)).toString('base64url');
  const body =
    '## AITM Progress Markers' +
    nl +
    nl +
    '<!-- aitm-issue-kind kind=' +
    quote +
    'docs-only' +
    quote +
    ' -->' +
    nl +
    '<!-- aitm-verification-receipt stage=' +
    quote +
    'test' +
    quote +
    ' data=' +
    quote +
    encoded +
    quote +
    ' -->' +
    nl;
  const h = harness();
  const result = await h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body });
  assert.equal(result.record.envelope.payload.telemetry.verification.issueKind, 'docs-only');
  assert.deepEqual(
    result.record.envelope.payload.actual.commands.map((command) => command.classification).sort(),
    ['format-full', 'lint-full']
  );
  receipt.laneSkip.changedPaths = ['scripts/source.mjs'];
  const invalid = body.replace(encoded, Buffer.from(JSON.stringify(receipt)).toString('base64url'));
  await assert.rejects(
    () => h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body: invalid }),
    /verification/
  );
});

test('explicit predecessor correction preserves old bytes and refuses changed original timing evidence', async () => {
  for (const tamper of [false, true]) {
    const h = harness(),
      body = closeBody();
    await h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body });
    const previous = structuredClone(h.records.at(-1));
    previous.envelope.payload.schema = 'aitm.estimation-outcome/v2';
    delete previous.envelope.payload.telemetry.verification;
    delete previous.envelope.payload.telemetry.forecastStatus;
    previous.envelope.payloadHash = hashRecordPayload(previous.envelope.payload);
    h.records[h.records.length - 1] = previous;
    const original = JSON.stringify(previous);
    if (tamper) h.setTiming(h.getTiming().replace('legacy', 'changed'));
    const correct = () =>
      h.runtime.ensure({
        issueNumber: issue,
        forecastRecordId: forecastId,
        body,
        supersedeExisting: true,
      });
    if (tamper) {
      await assert.rejects(correct, /source/);
      assert.equal(h.records.length, 2);
    } else {
      const result = await correct();
      assert.equal(result.record.envelope.payload.schema, 'aitm.estimation-outcome/v3');
      assert.equal(result.record.envelope.supersedes, previous.envelope.recordId);
      assert.equal(h.records.length, 3);
    }
    assert.equal(JSON.stringify(h.records[1]), original);
  }
});

test('immutable predecessor v2 retries its original contract without fabricating v3 proof', async () => {
  const h = harness(),
    body = closeBody();
  await h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body });
  const previous = structuredClone(h.records.at(-1));
  h.records[h.records.length - 1] = previous;
  previous.envelope.payload.schema = 'aitm.estimation-outcome/v2';
  delete previous.envelope.payload.telemetry.verification;
  delete previous.envelope.payload.telemetry.forecastStatus;
  previous.envelope.payloadHash = hashRecordPayload(previous.envelope.payload);
  const original = JSON.stringify(previous);
  const retry = await h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body });
  assert.equal(retry.status, 'existing');
  assert.equal(retry.recordId, previous.envelope.recordId);
  assert.equal(JSON.stringify(h.records.at(-1)), original);
  const close = await assertFieldsPersisted({
    cfg: { repo: repository },
    issueNum: issue,
    acceptedSha: sha,
    pexec: async () => ({ stdout: body }),
    estimationOutcomeWriter: h.runtime,
  });
  assert.equal(close.status, 'incomplete-telemetry-accepted');
  assert.equal(h.records.length, 2);
  await assert.rejects(
    () =>
      h.runtime.ensure({
        issueNumber: issue,
        forecastRecordId: forecastId,
        body: canonicalTestReceiptFixture({ issue, sha: 'b'.repeat(40) }).body,
      }),
    /verification/
  );
  h.setTiming(h.getTiming().replace('legacy', 'changed'));
  await assert.rejects(() =>
    h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body })
  );
});

test('root epic local-trunk timing uses its actual completed burn receipt and empty parent Test commands', async () => {
  const gate = residentGate();
  gate.deliveryBody = gate.deliveryBody.replace(
    'kind=' + String.fromCharCode(34) + 'research',
    'kind=' + String.fromCharCode(34) + 'epic'
  );
  gate.gateInput.body = gate.deliveryBody;
  gate.gateInput.branch = 'trunk';
  gate.gateInput.lineage.localTrunkLaneAuthorized = true;
  const burn = {
    schema: 'aitm.local-trunk-close-burn/v1',
    repository,
    issue,
    deliveryOperationId: '01J00000000000000000000844',
    grantRecordId: '01J00000000000000000000845',
    grantRevision: 1,
    scopeIdentity: 'sha256:' + '1'.repeat(64),
    waiverScopeDigest: 'sha256:' + '2'.repeat(64),
    waiverReasonDigest: 'sha256:' + '3'.repeat(64),
    grantDigest: 'sha256:' + '4'.repeat(64),
    acceptedHeadSha: sha,
    baseRef: 'trunk',
    resolvedTrunkRef: 'origin/trunk',
    authorizedAt: '2026-09-26T12:00:00.000Z',
  };
  const burnOid = 'b'.repeat(40),
    receipt = buildLocalTrunkCloseReceipt({ burn, burnOid });
  const comment = {
    id: 'IC_local',
    createdAt: '2026-09-26T12:00:01.000Z',
    body: renderLocalTrunkCloseReceipt(receipt),
  };
  let reads = 0;
  const resolveDeliveryAuthority = async () => {
    gate.receipt = await verifyCloseDeliveryReceipt({
      gateInput: gate.gateInput,
      receiptGate: { skipped: false, mode: 'local-trunk', receipt, comment },
      testReceiptSha: sha,
      acceptedReviewSha: sha,
      deps: {
        readLocalTrunkJournal: async () => {
          reads++;
          return {
            operations: new Map([
              [
                burn.deliveryOperationId,
                {
                  state: 'completed',
                  burn,
                  burnOid,
                  publication: { commentNodeId: comment.id, createdAt: comment.createdAt },
                },
              ],
            ]),
          };
        },
      },
    });
    return gate;
  };
  const h = harness({ resolveDeliveryAuthority, children: ['01J00000000000000000000842'] });
  h.records.length = 0;
  const result = await h.runtime.ensure({
    issueNumber: issue,
    forecastRecordId: null,
    body: gate.deliveryBody,
  });
  assert.ok(reads > 0);
  assert.equal(result.record.envelope.payload.telemetry.verification.mode, 'local-trunk-delivery');
  assert.equal(
    result.record.envelope.payload.telemetry.verification.recordId,
    burn.deliveryOperationId
  );
  assert.deepEqual(result.record.envelope.payload.actual.commands, []);
  const empty = harness({ resolveDeliveryAuthority });
  empty.records.length = 0;
  const emptyResult = await empty.runtime.ensure({
    issueNumber: issue,
    forecastRecordId: null,
    body: gate.deliveryBody,
  });
  assert.equal(emptyResult.record.envelope.payload.kind, 'epic-orchestration');
  assert.equal(emptyResult.record.envelope.payload.telemetry.forecastStatus, 'epic-not-applicable');
  assert.equal(
    emptyResult.record.envelope.payload.telemetry.verification.mode,
    'local-trunk-delivery'
  );
  assert.deepEqual(emptyResult.record.envelope.payload.landscape.childOutcomeRecordIds, []);
});

test('outcome publication revalidates actual delivery authority after immutable write', async () => {
  const gate = residentGate();
  gate.gateInput.lineage = { parentIssueNumber: 1847, deliveryTarget: 'epic/1847' };
  delete gate.gateInput.noCommitRecords;
  gate.receipt = requireDeliveryReceipt(gate.gateInput);
  const h = harness({
    resolveDeliveryAuthority: async () => gate,
    onWrite: () => {
      gate.acceptedReviewSha = 'b'.repeat(40);
    },
  });
  await assert.rejects(
    () =>
      h.runtime.ensure({
        issueNumber: issue,
        forecastRecordId: forecastId,
        body: gate.deliveryBody,
      }),
    /delivery.*changed|delivery.*linkage/
  );
  assert.equal(
    h.records.length,
    2,
    'refusal preserves the original written evidence for reconciliation'
  );
});

test('child resident runtime preserves existing no-provider delivery with exact Test and posted deliverable', async () => {
  const gate = residentGate();
  gate.gateInput.lineage = { parentIssueNumber: 1847, deliveryTarget: 'epic/1847' };
  delete gate.gateInput.noCommitRecords;
  gate.receipt = requireDeliveryReceipt(gate.gateInput);
  assert.equal(gate.receipt.skipped, true);
  const h = harness({ resolveDeliveryAuthority: async () => gate });
  h.records.length = 0;
  const result = await h.runtime.ensure({
    issueNumber: issue,
    forecastRecordId: null,
    body: gate.deliveryBody,
  });
  const proof = result.record.envelope.payload.telemetry.verification;
  assert.equal(proof.mode, 'child-resident-delivery');
  assert.equal(proof.parentIssue, 1847);
  assert.equal(proof.deliverableUrl, 'https://example.test/report');
  assert.deepEqual(result.record.envelope.payload.actual.commands, []);
  gate.acceptedReviewSha = null;
  await assert.rejects(
    () => h.runtime.ensure({ issueNumber: issue, forecastRecordId: null, body: gate.deliveryBody }),
    /linkage/
  );
});

test('child runtime couples actual lineage evidence with exact source Test proof and fresh retry', async () => {
  const root = createRuntimeRootFixture('1857-lineage-growth-');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const commit = (message) => {
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      message
    );
    return git('rev-parse', 'HEAD');
  };
  try {
    const originalTarget = commit('original target');
    const body = canonicalTestReceiptFixture({ issue }).body;
    const gateInput = {
      repository,
      issueNumber: issue,
      body,
      lineage: { parentIssueNumber: 1847, deliveryTarget: 'codex/1847' },
      branch: 'codex/1857',
      acceptedSha: sha,
      pullRequests: [],
    };
    let target = originalTarget;
    let attributedCommit = 'c'.repeat(40);
    const resolveDeliveryAuthority = async () => {
      const lineage = await lineageDoneGate({
        cfg: { repo: repository },
        issueNumber: issue,
        projectDir: '/fixture',
        body,
        includeEvidence: true,
        acceptedSha: sha,
        deps: {
          trunk: 'trunk',
          graph: (n) =>
            n === issue ? { parent: 1847, children: [] } : { parent: null, children: [issue] },
          branchExists: () => true,
          listComments: async () => [
            { body: '### 🔗 Commits\n<!-- aitm-commits shas="ccccccc" -->\n' },
          ],
          resolveHead: async () => target,
          attributingCommits: async () => [{ sha: attributedCommit, subject: '[#1857] work' }],
        },
      });
      assert.equal(lineage.ok, true, lineage.blocker);
      return {
        gateInput,
        deliveryBody: body,
        receipt: requireDeliveryReceipt(gateInput),
        testReceiptSha: sha,
        acceptedReviewSha: sha,
        lineageEvidence: lineage.evidence,
      };
    };
    const h = harness({ resolveDeliveryAuthority, projectDir: root });
    const result = await h.runtime.ensure({
      issueNumber: issue,
      forecastRecordId: forecastId,
      body,
    });
    const proof = result.record.envelope.payload.telemetry.verification;
    assert.equal(proof.mode, 'child-lineage');
    assert.equal(proof.lineage.parentIssue, 1847);
    assert.equal(proof.lineage.targetHead, target);
    assert.notEqual(proof.recordId, null);
    const grownTarget = commit('legitimate growth');
    target = grownTarget;
    const original = JSON.stringify(result.record.envelope.payload);
    const retry = await h.runtime.ensure({
      issueNumber: issue,
      forecastRecordId: forecastId,
      body,
    });
    assert.equal(retry.status, 'existing');
    assert.equal(JSON.stringify(retry.record.envelope.payload), original);
    git('checkout', '-q', '--orphan', 'replaced-target');
    target = commit('rewritten target');
    await assert.rejects(
      () => h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body }),
      /lineage/
    );
    target = grownTarget;
    attributedCommit = 'e'.repeat(40);
    await assert.rejects(
      () => h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body }),
      /lineage/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('skipped child wrapper without fresh lineage cannot become delivered timing authority', async () => {
  const body = canonicalTestReceiptFixture({ issue }).body;
  const gateInput = {
    repository,
    issueNumber: issue,
    body,
    lineage: { parentIssueNumber: 1847, deliveryTarget: 'codex/1847' },
    branch: 'codex/1857',
    acceptedSha: sha,
  };
  const h = harness({
    resolveDeliveryAuthority: async () => ({
      gateInput,
      deliveryBody: body,
      receipt: requireDeliveryReceipt(gateInput),
      testReceiptSha: sha,
      acceptedReviewSha: sha,
    }),
  });
  await assert.rejects(() =>
    h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body })
  );
});

test('root epic runtime consumes freshly verified merged receipt with empty parent Test commands', async () => {
  const gate = residentGate('research');
  gate.deliveryBody = gate.deliveryBody.replace('kind="research"', 'kind="epic"');
  gate.deliveryBody +=
    '\n<!-- aitm-plan-approved ts="2026-08-02T14:00:00.000Z" forecast-record-id="' +
    forecastId +
    '" -->\n<!-- aitm-fields: {"schema":1,"values":{"engagedTime":null}} -->\n';
  const intent = buildDeliveryIntent({
    intentId: '01J00000000000000000000843',
    supersedesIntentId: null,
    issueNumber: issue,
    repository,
    prNumber: 1858,
    baseRef: 'trunk',
    headRef: 'codex/fixture',
    expectedHeadSha: sha,
    mergeMethod: 'squash',
    attributionTokens: ['#1857'],
    commitTitle: '[#1857] Delivered aggregate',
    commitMessage: ['PR #1858', 'Source: ' + sha, '', 'Attribution: [#1857]'].join(
      String.fromCharCode(10)
    ),
    provider: 'fixture',
    sessionId: 'isolated-fixture',
    clientCreatedAt: '2026-08-22T00:00:00.000Z',
  });
  const receipt = buildDeliveryReceipt({
    intentId: intent.intentId,
    issueNumber: issue,
    prNumber: 1858,
    expectedHeadSha: sha,
    mergeCommitSha: 'b'.repeat(40),
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'fixture',
    sessionId: 'isolated-fixture',
    verifiedAt: '2026-08-22T00:02:00.000Z',
  });
  const pullRequest = {
    number: 1858,
    state: 'MERGED',
    merged: true,
    headRefName: 'codex/fixture',
    headRefOid: sha,
    baseRefName: 'trunk',
    mergeCommitSha: 'b'.repeat(40),
    mergedAt: '2026-08-22T00:02:00.000Z',
  };
  gate.gateInput = {
    repository,
    issueNumber: issue,
    body: gate.deliveryBody,
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    branch: 'codex/fixture',
    acceptedSha: sha,
    observedLocalHeadSha: sha,
    headRelation: 'current',
    pullRequests: [pullRequest],
    pullRequest,
    records: projectDeliveryRecords([
      { id: 'IC_intent', createdAt: '2026-08-22T00:00:01.000Z', record: intent },
      { id: 'IC_receipt', createdAt: '2026-08-22T00:02:01.000Z', record: receipt },
    ]),
  };
  let verified = 0;
  const resolveDeliveryAuthority = async () => {
    gate.receipt = await verifyCloseDeliveryReceipt({
      gateInput: gate.gateInput,
      receiptGate: requireDeliveryReceipt(gate.gateInput),
      testReceiptSha: sha,
      acceptedReviewSha: sha,
      deps: {
        fetchOriginTrunk: async () => {},
        isAncestor: async () => true,
        inspectMergeCommit: async () => ({
          parents: ['e'.repeat(40)],
          commitTitle: intent.commitTitle,
          commitMessage: intent.commitMessage,
        }),
        attributingCommits: async () => [],
      },
    });
    verified++;
    return gate;
  };
  const h = harness({ resolveDeliveryAuthority, children: ['01J00000000000000000000842'] });
  const result = await h.runtime.ensure({
    issueNumber: issue,
    forecastRecordId: forecastId,
    body: gate.deliveryBody,
  });
  const original = JSON.stringify(result.record);
  const closeArgs = {
    cfg: { repo: repository },
    issueNum: issue,
    acceptedSha: sha,
    pexec: async () => ({ stdout: gate.deliveryBody }),
    estimationOutcomeWriter: h.runtime,
  };
  assert.equal((await assertFieldsPersisted(closeArgs)).status, 'incomplete-telemetry-accepted');
  assert.equal((await assertFieldsPersisted(closeArgs)).recordId, result.recordId);
  assert.equal(JSON.stringify(h.records.at(-1)), original);
  assert.equal(result.record.envelope.payload.forecastRecordId, null);
  assert.equal(result.record.envelope.payload.actual.engagedHours, null);
  assert.deepEqual(result.record.envelope.payload.landscape.childOutcomeRecordIds, [
    '01J00000000000000000000842',
  ]);
  assert.ok(verified > 0);
  assert.equal(result.record.envelope.payload.telemetry.verification.mode, 'merged-pr-delivery');
  assert.equal(result.record.envelope.payload.telemetry.verification.recordId, intent.intentId);
  assert.deepEqual(result.record.envelope.payload.actual.commands, []);
  assert.equal(result.record.envelope.payload.telemetry.forecastStatus, 'epic-not-applicable');
  // A canonical aggregate must not satisfy the source-issue Close contract.
  await assert.rejects(
    () =>
      assertFieldsPersisted({
        ...closeArgs,
        pexec: async () => ({
          stdout: '<!-- aitm-fields: {"schema":1,"values":{"engagedTime":null}} -->',
        }),
        estimationOutcomeWriter: { ensure: async () => result },
      }),
    new RegExp('canonical incomplete outcome linkage')
  );
  for (const corrupt of [
    (r) => {
      r.record.envelope.repository = 'other/repo';
    },
    (r) => {
      r.record.envelope.issue = 999;
    },
    (r) => {
      r.record.commentNodeId = null;
    },
    (r) => {
      r.recordId = '01J00000000000000000000899';
    },
    (r) => {
      r.record.envelope.payload.telemetry.verificationSha = 'c'.repeat(40);
    },
    (r) => {
      r.record.envelope.payload.kind = 'story';
    },
    (r) => {
      r.record.envelope.payload.forecastRecordId = forecastId;
    },
  ]) {
    const invalid = structuredClone(result);
    corrupt(invalid);
    await assert.rejects(
      () =>
        assertFieldsPersisted({
          ...closeArgs,
          estimationOutcomeWriter: { ensure: async () => invalid },
        }),
      new RegExp('canonical incomplete outcome linkage')
    );
  }
  const empty = harness({ resolveDeliveryAuthority });
  empty.records.length = 0;
  const emptyResult = await empty.runtime.ensure({
    issueNumber: issue,
    forecastRecordId: null,
    body: gate.deliveryBody,
  });
  assert.equal(emptyResult.record.envelope.payload.kind, 'epic-orchestration');
  assert.equal(emptyResult.record.envelope.payload.telemetry.forecastStatus, 'epic-not-applicable');
  assert.equal(
    emptyResult.record.envelope.payload.telemetry.verification.mode,
    'merged-pr-delivery'
  );
  assert.deepEqual(emptyResult.record.envelope.payload.landscape.childOutcomeRecordIds, []);
});

test('no-commit proof rejects another checkout head and any issue-attributed commits', async () => {
  const root = createRuntimeRootFixture('1857-resident-head-');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  try {
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'fixture baseline'
    );
    const head = git('rev-parse', 'HEAD');
    for (const accepted of [sha, head]) {
      if (accepted === head)
        git(
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.test',
          'commit',
          '-q',
          '--allow-empty',
          '-m',
          '[#1857] actual source work'
        );
      const acceptedHead = accepted === head ? git('rev-parse', 'HEAD') : accepted;
      const gate = residentGate('research', acceptedHead);
      const h = harness({
        projectDir: root,
        acceptedSha: acceptedHead,
        useDefaultDiff: true,
        resolveDeliveryAuthority: async () => gate,
      });
      h.records.length = 0;
      await assert.rejects(() =>
        h.runtime.ensure({ issueNumber: issue, forecastRecordId: null, body: gate.deliveryBody })
      );
      assert.equal(h.records.length, 0);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
