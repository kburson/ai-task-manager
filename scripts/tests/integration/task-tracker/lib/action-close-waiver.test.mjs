// @story #1787 #1800
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as closeReadiness from '../../../../task-tracker/lib/action-decision/close.mjs';
import {
  projectDeliveryRecords,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import {
  head as waiverHead,
  createdAt as waiverCreatedAt,
  original as waiverOriginal,
  grant as waiverGrant,
  pinnedIntent as waiverIntent,
  burn as waiverBurn,
  burnOid as waiverBurnOid,
  receipt as waiverReceipt,
  input as waiverInput,
} from '../../../unit/task-tracker/lib/pinned-delivery-waiver-fixture.mjs';

const BODY =
  '## User Story\nClose safely\n\n## Scope\nRead-only close\n\n## Acceptance Criteria\n- [x] Close safely';

test('production close guard adapter verifies a pinned v4 receipt through read-only ports', async () => {
  const issue = waiverOriginal.issueNumber;
  const verifiedBody = Buffer.from(
    JSON.stringify({ stage: 'test', commitSha: waiverHead })
  ).toString('base64url');
  const body = `${BODY}\n<!-- aitm-verification-receipt stage="test" data="${verifiedBody}" -->`;
  const records = projectDeliveryRecords([
    { id: 'original', createdAt: waiverCreatedAt, record: waiverOriginal },
    { id: 'pinned', createdAt: '2026-09-25T12:01:01.000Z', record: waiverIntent },
    { id: 'receipt', createdAt: '2026-09-25T12:04:00.000Z', record: waiverReceipt },
  ]);
  const pullRequest = {
    ...waiverInput(waiverIntent).pullRequest,
    headRefName: waiverOriginal.headRef,
  };
  const gateInput = {
    issueNumber: issue,
    repository: waiverOriginal.repository,
    body,
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    branch: waiverOriginal.headRef,
    acceptedSha: waiverHead,
    observedLocalHeadSha: waiverHead,
    pullRequests: [pullRequest],
    pullRequest,
    records,
    waiverRecords: [{ envelope: waiverGrant, createdAt: waiverGrant.createdAt }],
  };
  let journalReads = 0;
  const commands = [];
  const ports = closeReadiness.createCloseReadOnlyPorts({
    issue,
    cfg: { repo: waiverOriginal.repository, projectId: 'P' },
    projectDir: process.cwd(),
    deps: {
      readWaiverJournal: async () => {
        journalReads += 1;
        return {
          oid: 'f'.repeat(40),
          operations: new Map([
            [
              waiverIntent.deliveryOperationId,
              {
                state: 'completed',
                burn: waiverBurn,
                burnOid: waiverBurnOid,
                intentPublication: {
                  originalIntentId: waiverOriginal.intentId,
                  originalIntentDigest: waiverIntent.originalIntentDigest,
                  intentId: waiverIntent.intentId,
                  intentBody: renderDeliveryIntentComment(waiverIntent),
                },
                publication: { receiptBody: renderDeliveryReceiptComment(waiverReceipt) },
              },
            ],
          ]),
        };
      },
      verifyStoredDeliveryWaiverAuthority: async () => {},
      run: async (command, args) => {
        commands.push([command, args]);
        if (command !== 'git') throw new Error('unexpected provider read');
        if (args[0] === 'cat-file' && args[1] === 'commit')
          return {
            stdout: `tree ${'0'.repeat(40)}\nparent ${'d'.repeat(40)}\nparent ${waiverHead}\n\n${waiverOriginal.commitTitle}\n\n${waiverOriginal.commitMessage}\n`,
          };
        if (args[0] === 'log') return { stdout: '' };
        if (args[0] === 'cat-file' || args[0] === 'merge-base') return { stdout: '' };
        throw new Error(`unexpected git ${args.join(' ')}`);
      },
    },
  });
  const result = await ports.runReadOnlyGuards(
    'review',
    'done',
    {
      issueNumber: issue,
      cfg: { repo: waiverOriginal.repository, projectId: 'P' },
      body,
      toState: 'done',
      headSha: waiverHead,
      children: [],
      delivery: {
        gateInput,
        graph: [[issue, { parent: null, children: [] }]],
      },
      attribution: { status: 'attributed', tip: { sha: 'f'.repeat(40) } },
    },
    {
      comments: [{ body: `### 🔗 Commits\n<!-- aitm-commits: ${waiverHead} -->` }],
      files: { [waiverHead]: [] },
      dirty: [],
      parentState: 'review',
      dependency: { status: 'ready', blockedBy: [], unfinished: [], states: [] },
    }
  );
  assert.equal(result.status, 'blocked');
  assert.ok(result.refusals.some(({ id }) => id === 'review-exit-review-approved'));
  assert.ok(!JSON.stringify(result).includes('delivery-waiver-burn-mismatch'));
  assert.equal(journalReads, 1);
  assert.ok(
    commands.every(
      ([command, args]) => command === 'git' && !['fetch', 'update-ref', 'push'].includes(args[0])
    )
  );
});
