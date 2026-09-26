// @story #1827
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectCloseReadiness,
  createCloseReadOnlyPorts,
} from '../../../../task-tracker/lib/action-decision/close.mjs';
import {
  buildLocalTrunkCloseReceipt,
  renderLocalTrunkCloseReceipt,
} from '../../../../task-tracker/lib/local-trunk-close-receipt.mjs';
import {
  createVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';
import { createHash } from 'node:crypto';
import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';

const issue = 1827;
const repository = 'example/project';
const head = 'a'.repeat(40);
const body =
  '## User Story\nClose safely\n\n## Scope\nRead-only close\n\n## Acceptance Criteria\n- [x] Close safely\n\n<!-- aitm-last-known-state state="review" ts="2026-09-26T00:00:00Z" -->';
const now = () => '2026-09-26T00:00:00.000Z';
const gateInput = {
  issueNumber: issue,
  repository,
  body,
  branch: 'codex/1827-local-trunk-regression',
  acceptedSha: head,
  lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
  pullRequests: [],
};

function fixture(receiptGate, proof = { outcome: 'authorized-local-trunk-close' }) {
  const scope = computeScopeIdentity({ repository, issue, body });
  const values = {
    [`issue:${issue}:1`]: { number: issue, body, state: 'OPEN' },
    [`issue:${issue}:2`]: { state: 'review' },
    [`worktree:${issue}`]: { matches: true, headSha: head },
    [`evidence:${issue}:1`]: { mode: 'ordinary', gateInput },
    [`evidence:${issue}:2`]: {
      status: 'attributed',
      tip: {
        status: 'observed',
        remote: 'origin',
        ref: 'refs/heads/trunk',
        sha: head,
        objectComplete: true,
        shallow: false,
      },
    },
    [`evidence:${issue}:3`]: { complete: true, children: [] },
  };
  const attempt = createObservationAttempt({
    repository,
    issue,
    boundaryId: 'close-local-receipt-test',
    now,
    read: async (request) => ({ ...request, value: values[request.identity] }),
  });
  const ports = {
    scope,
    cfg: { repo: repository },
    head,
    evaluatedAt: now(),
    readLocalTrunkProof: async () => proof,
    readLocalTrunkReceipt: async () => receiptGate,
    runGuards: async () => ({ ok: true, status: 'ready', refusals: [], humanDecision: null }),
  };
  return collectCloseReadiness({ issue, attempt, ports });
}

test('completed local-trunk receipt makes advisory close ready without effects', async () => {
  const result = await fixture({
    skipped: false,
    mode: 'local-trunk',
    receipt: { result: 'authorized-local-trunk-close' },
    grant: { recordId: 'historical-grant' },
  });
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.equal(result.deliveryExceptions[0].outcome, 'authorized-local-trunk-close');
});

test('completed receipt still refuses when fresh trunk and PR proof drifts', async () => {
  const result = await fixture(
    {
      skipped: false,
      mode: 'local-trunk',
      receipt: { result: 'authorized-local-trunk-close' },
      grant: { recordId: 'historical-grant' },
    },
    { outcome: 'missing', reasonId: 'remote-trunk-ancestry' }
  );
  assert.equal(result.status, 'blocked');
});

test('unconsumed local grant stays blocked in advisory close', async () => {
  const result = await fixture(null);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some(({ guardId }) => guardId === 'review-exit-close-gates'));
});

test('production local receipt reader verifies exact journal and comment without writes', async () => {
  const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
  const operationId = '00000000000000000000000001';
  const burnOid = 'b'.repeat(40);
  const burn = {
    schema: 'aitm.local-trunk-close-burn/v1',
    repository,
    issue,
    deliveryOperationId: operationId,
    grantRecordId: '00000000000000000000000002',
    grantRevision: 1,
    scopeIdentity: digest('scope'),
    waiverScopeDigest: digest('waiver'),
    waiverReasonDigest: digest('reason'),
    grantDigest: digest('grant'),
    acceptedHeadSha: head,
    baseRef: 'trunk',
    resolvedTrunkRef: 'origin/trunk',
    authorizedAt: now(),
  };
  const receipt = buildLocalTrunkCloseReceipt({ burn, burnOid });
  const comment = {
    node_id: 'IC_test',
    created_at: now(),
    body: renderLocalTrunkCloseReceipt(receipt),
  };
  const snapshot = {
    operations: new Map([
      [
        operationId,
        {
          state: 'completed',
          burn,
          burnOid,
          publication: { commentNodeId: comment.node_id, createdAt: comment.created_at },
        },
      ],
    ]),
  };
  const testReceipt = createVerificationReceipt({
    issueNumber: issue,
    stage: 'test',
    fingerprint: {
      commitSha: head,
      verificationCommands: [],
      environment: {
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        lockfileHash: digest('lock'),
        configHashes: {},
        sandbox: { kind: 'worktree', identity: process.cwd(), clean: true },
      },
    },
    commands: [],
    now,
  });
  const input = { ...gateInput, body: upsertVerificationReceipt(body, testReceipt) };
  const ports = createCloseReadOnlyPorts({
    issue,
    cfg: { repo: repository },
    projectDir: process.cwd(),
    deps: {
      listLocalTrunkComments: async () => [[comment]],
      readLocalTrunkJournal: async () => snapshot,
      verifyHistoricalLocalTrunkGrant: async () => ({ recordId: burn.grantRecordId }),
    },
  });
  const verified = await ports.readLocalTrunkReceipt({
    gateInput: input,
    lifecycleEvidence: { expectedSha: head },
  });
  assert.equal(verified.receipt.result, 'authorized-local-trunk-close');
  const legacy = await ports.readLocalTrunkReceipt({ gateInput: input, lifecycleEvidence: null });
  assert.equal(legacy.receipt.result, 'authorized-local-trunk-close');
  const withoutGrant = createCloseReadOnlyPorts({
    issue,
    cfg: { repo: repository },
    projectDir: process.cwd(),
    deps: {
      listLocalTrunkComments: async () => [[comment]],
      readLocalTrunkJournal: async () => snapshot,
    },
  });
  await assert.rejects(
    withoutGrant.readLocalTrunkReceipt({ gateInput: input, lifecycleEvidence: null }),
    /grant-ambiguous/
  );
  comment.body += 'tampered';
  await assert.rejects(
    ports.readLocalTrunkReceipt({ gateInput: input, lifecycleEvidence: { expectedSha: head } })
  );
});
