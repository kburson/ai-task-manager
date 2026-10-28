// @story #2100
import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactRepository } from '../../../helpers/artifact-repository.mjs';
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { captureArtifactOperator } from '../../../../task-tracker/lib/artifact-execution.mjs';
import {
  createVerificationReceipt,
  upsertVerificationReceipt,
  buildArtifactVerificationFingerprint,
} from '../../../../task-tracker/lib/verification-receipt.mjs';
import * as recovery from '../../../../task-tracker/lib/delivered-close-supersession.mjs';
const { sid } = initializeFixtureActor(import.meta.url);
function fixture(t, actor = sid) {
  const r = artifactRepository(t);
  const binding = {
    issue: 2100,
    bindingGenerationId: 'native-restart',
    worktreePath: r.root,
    worktreeBranch: r.git('branch', '--show-current'),
    entryStartTs: '2026-10-28T10:00:00.000Z',
  };
  setActiveTask(actor, binding, r.root);
  const artifactSubject = { commitSha: r.candidate, treeSha: r.tree };
  const operatorContext = captureArtifactOperator({ projectDir: r.root, issueNumber: 2100 });
  const fingerprint = buildArtifactVerificationFingerprint({
    projectDir: r.root,
    artifactSubject,
    operatorContext,
    verificationCommands: [],
  });
  fingerprint.environment.sandbox = { kind: 'worktree', identity: r.root, clean: true };
  const receipt = createVerificationReceipt({
    issueNumber: 2100,
    stage: 'test',
    fingerprint,
    commands: [],
  });
  const gate = {
    gateInput: {
      acceptedSha: r.candidate,
      operatorContext,
      issueNumber: 2100,
      repository: 'example/project',
    },
    deliveryBody: upsertVerificationReceipt('', receipt),
    testReceiptSha: r.candidate,
    recoveryReviewApprovedSha: r.candidate,
    receipt: {
      receipt: {
        schema: 'aitm.delivery-receipt/v5',
        issueNumber: 2100,
        expectedHeadSha: r.candidate,
        intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      },
    },
  };
  const cfg = { repo: 'example/project', projectId: 'PVT_native' };
  const item = {
    id: 'PVTI_native',
    project: { id: cfg.projectId },
    fieldValueByName: { name: 'Review' },
  };
  const data = {
    repository: {
      id: 'R_native',
      issue: {
        id: 'I_native',
        number: 2100,
        projectItems: { nodes: [item], pageInfo: { hasNextPage: false, endCursor: null } },
      },
    },
  };
  return { ...r, binding, cfg, gate, receipt, artifactSubject, operatorContext, data, item };
}
const observe = (f, runGql = async () => f.data) =>
  recovery.observeNativeCloseRestartAuthority({
    cfg: f.cfg,
    issueNumber: 2100,
    projectDir: f.root,
    gate: f.gate,
    artifactSubject: f.artifactSubject,
    deps: { runGql },
  });
test('unlabeled three-step Close restart obtains exact native membership, Test and operator authority', async (t) => {
  const f = fixture(t);
  const authority = await observe(f);
  assert.equal(authority.projectItemId, 'PVTI_native');
  assert.equal(authority.testReceiptId, f.receipt.receiptId);
  const authorization = recovery.authorizeDeliveredCloseRestart({
    repository: f.cfg.repo,
    projectId: f.cfg.projectId,
    issueNumber: 2100,
    operatorContext: f.operatorContext,
    nativeBoardAuthority: authority,
    oldTransaction: {
      schema: 'aitm.delivered-close/v1',
      transactionId: 'preserved-old',
      issueNumber: 2100,
      acceptedSha: 'a'.repeat(40),
      reviewAuthority: 'human-gate',
      completedSteps: ['timing', 'estimation', 'lifecycle'],
    },
    newAcceptedSha: f.candidate,
    newReviewAuthority: 'human-gate',
    live: {
      boardState: 'review',
      issueClosed: false,
      terminalDisposition: null,
      labels: ['plan:native-recovery-delivery'],
      bindingStatus: 'pending',
      dirty: false,
    },
  });
  assert.deepEqual(authorization.oldTransaction.completedSteps, [
    'timing',
    'estimation',
    'lifecycle',
  ]);
});
test('native restart refuses missing artifact, wrong issue/project, ambiguous membership and stale Review/delivery/Test', async (t) => {
  for (const change of [
    (f) => {
      f.artifactSubject = undefined;
    },
    (f) => {
      f.data.repository.issue.number = 2099;
    },
    (f) => {
      f.item.project.id = 'PVT_foreign';
    },
    (f) => {
      f.data.repository.issue.projectItems.nodes.push({ ...f.item, id: 'PVTI_duplicate' });
    },
    (f) => {
      f.item.fieldValueByName.name = 'Done';
    },
    (f) => {
      f.gate.recoveryReviewApprovedSha = null;
    },
    (f) => {
      f.gate.receipt.receipt.expectedHeadSha = 'c'.repeat(40);
    },
    (f) => {
      f.gate.receipt.receipt.issueNumber = 2099;
    },
    (f) => {
      f.gate.deliveryBody = '';
    },
    (f) => {
      f.gate.gateInput.operatorContext = { ...f.operatorContext, bindingGenerationId: 'stale' };
    },
  ]) {
    const f = fixture(t);
    change(f);
    await assert.rejects(() => observe(f));
  }
});
test('native restart refuses actual binding drift during its final provider observation', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    () =>
      observe(f, async () => {
        setActiveTask(sid, { ...f.binding, bindingGenerationId: 'changed-during-read' }, f.root);
        return f.data;
      }),
    /operator|binding/
  );
});

// The native observer and authorizer execute inside the real Close orchestration.
for (const driftPhase of [null, 'audit-readback', 'body-fetch'])
  test(`native unlabeled partial Close ${driftPhase ? 'refuses operator drift during ' + driftPhase : 'audits supersession before completing all checkpoints'}`, async (t) => {
    const { runClose, closeBody } =
      await import('../../../helpers/close-convergence-wiring-helpers.mjs');
    const {
      upsertDeliveredCloseTransaction,
      readDeliveredCloseTransactions,
      TERMINAL_CLOSE_STEPS,
    } = await import('../../../../task-tracker/lib/close-convergence.mjs');
    const previousSid = process.env.AI_TASK_MANAGER_SESSION_ID;
    process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-close-wiring';
    try {
      const f = fixture(t, 'fixture-close-wiring');
      const driftOperator = () =>
        setActiveTask(
          'fixture-close-wiring',
          { ...f.binding, bindingGenerationId: 'drift-after-observation' },
          f.root
        );
      const stale = {
        schema: 'aitm.delivered-close/v1',
        transactionId: 'native-preserved-three',
        issueNumber: 2100,
        acceptedSha: 'a'.repeat(40),
        reviewAuthority: 'gate-bypassed',
        completedSteps: ['timing', 'estimation', 'lifecycle'],
      };
      const body = upsertDeliveredCloseTransaction(
        closeBody() +
          f.gate.deliveryBody +
          `\n<!-- aitm-review-approved ts="${new Date().toISOString()}" approved-sha="${f.candidate}" full-auto="yes" signals="env=1" -->`,
        stale
      );
      const run = await runClose({
        issueNumber: 2100,
        repository: f.cfg.repo,
        operatorProjectDir: f.root,
        configOverrides: { projectId: f.cfg.projectId },
        boardState: 'review',
        closeSnapshot: { issueClosed: false, stateReason: null },
        body,
        restartStaleTransaction: true,
        supersessionCommentReadTransform: (comment) => {
          if (driftPhase === 'audit-readback') driftOperator();
          return comment;
        },
        beforeBodyMutation: () => {
          if (driftPhase === 'body-fetch') driftOperator();
        },
        acceptedSha: f.candidate,
        localHeadSha: f.operatorHead,
        liveLabels: ['plan:native-recovery-delivery'],
        gateReviewToDone: false,
        reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
        deliveryGateInput: {
          ...f.gate.gateInput,
          lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
          branch: f.operatorContext.branch,
          pullRequests: [],
          records: null,
        },
        contextOverrides: {
          loadCloseDeliveryGateInput: async () => {
            setActiveTask('fixture-close-wiring', f.binding, f.root);
            return {
              ...f.gate.gateInput,
              lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
              branch: f.operatorContext.branch,
              pullRequests: [],
              records: null,
            };
          },
          cfg: { ...f.cfg, trunkRef: 'origin/trunk' },
          projectDir: f.root,
          artifactSubject: f.artifactSubject,
          nativeCloseRestartAuthorityDeps: { runGql: async () => f.data },
          requireDeliveryReceipt: () => ({ skipped: false, receipt: f.gate.receipt.receipt }),
        },
      });
      if (driftPhase) {
        assert.equal(run.exitCode, 1);
        assert.equal(run.calls.movesToDone.length, 0);
        assert.equal(run.calls.bindingReleases, 0);
        assert.equal(
          readDeliveredCloseTransactions(run.body)[0].transactionId,
          'native-preserved-three'
        );
        return;
      }
      assert.equal(run.exitCode, 0);
      assert.equal(run.supersessionComments.length, 1);
      const audit = recovery.parseDeliveredCloseSupersessionComment(run.supersessionComments[0], {
        repository: f.cfg.repo,
        issueNumber: 2100,
      });
      assert.equal(audit.record.oldTransactionId, 'native-preserved-three');
      assert.deepEqual(audit.record.completedSteps, ['timing', 'estimation', 'lifecycle']);
      assert.deepEqual(run.calls.order.slice(0, 4), [
        'comment:list',
        'comment:create',
        'comment:read',
        'body:mutate',
      ]);
      const [completed] = readDeliveredCloseTransactions(run.body);
      assert.equal(completed.acceptedSha, f.candidate);
      assert.deepEqual(completed.completedSteps, TERMINAL_CLOSE_STEPS);
    } finally {
      process.env.AI_TASK_MANAGER_SESSION_ID = previousSid;
    }
  });
