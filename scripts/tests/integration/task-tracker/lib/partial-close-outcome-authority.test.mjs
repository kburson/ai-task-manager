// @story #2100
import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizePartialCloseOutcomeCorrection as authorize } from '../../../../task-tracker/lib/delivered-close-supersession.mjs';
import { partialCloseFixture } from '../../../helpers/2100-partial-close-outcome.mjs';
import { canonicalSupersession } from '../../../helpers/2096-close-recovery-outcome.mjs';
test('ordinary outcome correction requires a complete unique chain and current exact native authority', async (t) => {
  const f = await partialCloseFixture();
  try {
    const operatorContext = {
      boundIssue: 1878,
      headSha: f.acceptedSha,
      sessionId: 'fixture',
      worktreePath: '/fixture',
      branch: 'feature/1878',
      bindingGenerationId: 'generation',
    };
    const proof = {
      mode: 'exact-test',
      issueKind: 'code',
      recordId: f.original.envelope.payload.telemetry.verification.recordId,
      recordDigest: 'a'.repeat(64),
      acceptedSha: f.acceptedSha,
    };
    const base = {
      repository: f.repository,
      issueNumber: 1878,
      projectId: 'PVT_native',
      operatorContext,
      transaction: {
        schema: 'aitm.delivered-close/v1',
        transactionId: 'current',
        issueNumber: 1878,
        acceptedSha: f.acceptedSha,
        reviewAuthority: 'human-gate',
        completedSteps: [],
      },
      comments: f.supersessions,
      previousRecord: f.original,
      currentVerification: proof,
      nativeBoardAuthority: {
        repository: f.repository,
        issueNumber: 1878,
        projectId: 'PVT_native',
        projectItemId: 'PVTI_native',
        boardState: 'review',
        acceptedSha: f.acceptedSha,
        testReceiptId: proof.recordId,
        testReceiptSha: f.acceptedSha,
        reviewApprovedSha: f.acceptedSha,
        deliveryIntentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        deliveryAcceptedSha: f.acceptedSha,
        operatorContext,
      },
      live: {
        boardState: 'review',
        issueClosed: false,
        terminalDisposition: null,
        bindingStatus: 'pending',
        dirty: false,
      },
    };
    assert.deepEqual(authorize(base), {
      status: 'authorized',
      predecessorRecordId: f.original.envelope.recordId,
    });
    const variants = [
      [
        'missing chain',
        (b) => {
          b.comments = [];
        },
      ],
      [
        'gap',
        (b) => {
          b.comments.shift();
        },
      ],
      [
        'duplicate comment',
        (b) => {
          b.comments.push(b.comments[0]);
        },
      ],
      [
        'edited immutable comment',
        (b) => {
          b.comments[0].updated_at = '2026-10-02T00:00:00.000Z';
        },
      ],
      [
        'foreign comment issue',
        (b) => {
          b.comments[0].issue_url = b.comments[0].issue_url.replace('/1878', '/1879');
        },
      ],
      [
        'malformed bytes',
        (b) => {
          b.comments[0].body = b.comments[0].body.replace('data="', 'data="X');
        },
      ],
      [
        'wrong transaction',
        (b) => {
          b.transaction.transactionId = 'unrelated';
        },
      ],
      [
        'wrong current authority',
        (b) => {
          b.transaction.reviewAuthority = 'gate-bypassed';
        },
      ],
      [
        'estimation already checkpointed',
        (b) => {
          b.transaction.completedSteps = ['timing', 'estimation'];
        },
      ],
      [
        'noncontiguous timing',
        (b) => {
          b.transaction.completedSteps = ['estimation'];
        },
      ],
      [
        'terminal issue',
        (b) => {
          b.live.issueClosed = true;
        },
      ],
      [
        'terminal board',
        (b) => {
          b.live.boardState = 'done';
        },
      ],
      [
        'terminal disposition',
        (b) => {
          b.live.terminalDisposition = 'Delivered';
        },
      ],
      [
        'released binding',
        (b) => {
          b.live.bindingStatus = 'released';
        },
      ],
      [
        'dirty operator',
        (b) => {
          b.live.dirty = true;
        },
      ],
      [
        'foreign project',
        (b) => {
          b.projectId = 'PVT_other';
        },
      ],
      [
        'changed operator',
        (b) => {
          b.operatorContext = { ...b.operatorContext, bindingGenerationId: 'other' };
        },
      ],
      [
        'foreign previous record',
        (b) => {
          b.previousRecord.envelope.repository = 'foreign/repo';
        },
      ],
      [
        'unrelated previous source',
        (b) => {
          b.previousRecord.envelope.payload.telemetry.verificationSha = 'e'.repeat(40);
        },
      ],
      [
        'foreign current proof',
        (b) => {
          b.currentVerification.acceptedSha = 'f'.repeat(40);
        },
      ],
      [
        'wrong current Test',
        (b) => {
          b.currentVerification.recordId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
        },
      ],
    ];
    for (const [name, mutate] of variants)
      await t.test(name, () => {
        const b = structuredClone(base);
        mutate(b);
        assert.throws(() => authorize(b));
      });
    await t.test('forked predecessor refuses', async () => {
      const b = structuredClone(base);
      const extra = await canonicalSupersession({
        repository: f.repository,
        issueNumber: 1878,
        oldTransaction: {
          ...b.transaction,
          transactionId: 'middle',
          acceptedSha: f.sources[1].oid,
        },
        newAcceptedSha: 'e'.repeat(40),
        replacementTransactionId: 'fork',
      });
      extra.comment.id = 44;
      b.comments.push(extra.comment);
      assert.throws(() => authorize(b), /ambiguous/);
    });
    await t.test('timing-only retry is still pre-estimation', () => {
      const b = structuredClone(base);
      b.transaction.completedSteps = ['timing'];
      assert.equal(authorize(b).status, 'authorized');
    });
  } finally {
    f.cleanup();
  }
});
