#!/usr/bin/env node
// @story #1144

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';

import {
  hasAcceptedApprovalEvidence,
  hasAcceptedReviewEvidence,
} from '../../../../task-tracker/lib/github-records/lifecycle-gate-source.mjs';
import { assertLifecycleSatisfied } from '../../../../task-tracker/close-gate.mjs';
import { reviewExitReviewApprovedGuard } from '../../../../task-tracker/lib/review-exit-review-approved-guard.mjs';
import { runApprove } from '../../../../task-tracker/verbs/approve.mjs';
import { resolveCloseLifecycleEvidence } from '../../../../task-tracker/verbs/close.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const SHA = 'a'.repeat(40);
const PROJECT_DIR = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-approval-close-1144-'));
const AUTHORITY = Object.freeze({
  contractEpoch: 3,
  coordinatorGrantId: 'grant-3',
  authorityEpoch: 7,
});

function evidenceEntry({ recordId, evidenceKind, result, provenance, overrides = {} }) {
  return {
    recordId,
    recordType: 'review-result',
    evidenceKind,
    result,
    contractEpoch: AUTHORITY.contractEpoch,
    commitSha: SHA,
    provenance,
    authority: {
      grantId: AUTHORITY.coordinatorGrantId,
      epoch: AUTHORITY.authorityEpoch,
    },
    ...overrides,
  };
}

function acceptedEvidence({ approvalProvenance = 'human', entryOverrides = {} } = {}) {
  const review = evidenceEntry({
    recordId: 'review-1',
    evidenceKind: 'review',
    result: 'passed',
    provenance: 'agent',
  });
  const approval = evidenceEntry({
    recordId: 'approval-1',
    evidenceKind: 'approval',
    result: 'approved',
    provenance: approvalProvenance,
    overrides: entryOverrides,
  });
  return Object.freeze({
    sourceKind: 'github-records/v1',
    expectedSha: SHA,
    evidence: Object.freeze([Object.freeze(review), Object.freeze(approval)]),
    acceptedRecordIds: Object.freeze(['review-1', 'approval-1']),
    authority: AUTHORITY,
  });
}

function withReviewOverrides(projection, overrides) {
  return {
    ...projection,
    evidence: projection.evidence.map((entry) =>
      entry.evidenceKind === 'review' ? { ...entry, ...overrides } : entry
    ),
  };
}

const LEGACY_REVIEW_BODY = [
  '## Acceptance Criteria',
  '- [x] verified',
  '',
  '### Lifecycle (verified at Review)',
  '- [ ] Agent Review Passed <!-- aitm-verified gate="agent-review" result="pass" -->',
  '- [ ] Final Review Passed',
].join('\n');

function approveDeps({ body = LEGACY_REVIEW_BODY, evidence, fullAuto = false } = {}) {
  let liveBody = body;
  const writes = [];
  return {
    writes,
    deps: {
      assertBound: () => {},
      getBoardState: async () => 'review',
      fetchIssueBody: async () => liveBody,
      mutateIssueBody: async ({ mutate }) => {
        const next = mutate(liveBody);
        if (next !== liveBody) writes.push(next);
        liveBody = next;
        return { status: 'ok', body: liveBody };
      },
      locateAuthoritySource: () =>
        evidence ? { kind: 'github-records/v1' } : { kind: 'legacy-body/v1' },
      getHeadSha: async () => SHA,
      resolveLifecycleEvidence: async () => evidence,
      detectFullAuto: () =>
        fullAuto ? { fired: true, signals: 'env=1' } : { fired: false, signals: '' },
      nowIso: () => '2026-08-08T10:00:00Z',
      postComment: async () => {},
      fetchComments: async () => [],
      fetchProjectValues: async () => ({}),
      promptDrivers: async () => [],
      reconcileReviewApprovedTiming: async () => ({ status: 'posted' }),
    },
  };
}

test('legacy approval keeps the marker lane while directory approval consumes accepted evidence', async () => {
  const legacy = approveDeps();
  const legacyResult = await runApprove({
    issueNumber: 1144,
    cfg: { repo: 'owner/repo' },
    projectDir: PROJECT_DIR,
    deps: legacy.deps,
    human: true,
  });
  assert.equal(legacyResult.status, 'approved');
  assert.equal(legacy.writes.length, 1);
  assert.match(legacy.writes[0], /aitm-review-approved/);

  const directory = approveDeps({ evidence: acceptedEvidence() });
  const directoryResult = await runApprove({
    issueNumber: 1144,
    cfg: { repo: 'owner/repo' },
    projectDir: PROJECT_DIR,
    deps: directory.deps,
    human: true,
  });
  assert.equal(directoryResult.status, 'directory-approved');
  assert.equal(directoryResult.provenance, 'human');
  assert.equal(
    directory.writes.length,
    0,
    'directory authority must not be translated to a body marker'
  );
});

test('human and Full-Auto approval provenance are explicit and non-interchangeable', async () => {
  const humanOnly = approveDeps({ evidence: acceptedEvidence(), fullAuto: true });
  const refused = await runApprove({
    issueNumber: 1144,
    cfg: { repo: 'owner/repo' },
    projectDir: PROJECT_DIR,
    deps: humanOnly.deps,
  });
  assert.equal(refused.status, 'directory-evidence-invalid');
  assert.deepEqual(refused.reasons, [{ code: 'directory-full-auto-approval-missing' }]);

  const fullAuto = approveDeps({
    evidence: acceptedEvidence({ approvalProvenance: 'full-auto' }),
    fullAuto: true,
  });
  const accepted = await runApprove({
    issueNumber: 1144,
    cfg: { repo: 'owner/repo' },
    projectDir: PROJECT_DIR,
    deps: fullAuto.deps,
  });
  assert.equal(accepted.status, 'directory-approved');
  assert.equal(accepted.provenance, 'full-auto');
});

test('directory Review and Approval predicates reject stale SHA, epoch, and authority', () => {
  const current = acceptedEvidence();
  assert.equal(hasAcceptedReviewEvidence(current), true);
  assert.equal(hasAcceptedApprovalEvidence(current, { provenance: 'human' }), true);

  for (const entryOverrides of [
    { commitSha: 'b'.repeat(40) },
    { contractEpoch: 2 },
    { authority: { grantId: 'stale-grant', epoch: 7 } },
    { authority: { grantId: 'grant-3', epoch: 6 } },
  ]) {
    const stale = acceptedEvidence({ entryOverrides });
    assert.equal(hasAcceptedApprovalEvidence(stale, { provenance: 'human' }), false);
  }

  for (const reviewOverrides of [
    { commitSha: 'b'.repeat(40) },
    { contractEpoch: 2 },
    { authority: { grantId: 'stale-grant', epoch: 7 } },
    { authority: { grantId: 'grant-3', epoch: 6 } },
  ]) {
    assert.equal(hasAcceptedReviewEvidence(withReviewOverrides(current, reviewOverrides)), false);
  }
});

test('manual lifecycle checkbox edits cannot satisfy directory-governed close', () => {
  const manualOnly = [
    '### Lifecycle (verified at Review)',
    '- [x] Agent Review Passed',
    '- [x] Final Review Passed',
  ].join('\n');
  assert.equal(reviewExitReviewApprovedGuard.run({ body: manualOnly }).ok, false);

  const unticked = manualOnly.replaceAll('[x]', '[ ]');
  const accepted = acceptedEvidence();
  assert.equal(
    reviewExitReviewApprovedGuard.run({ body: unticked, lifecycleEvidence: accepted }).ok,
    true
  );
  assert.equal(
    assertLifecycleSatisfied({ body: unticked, lifecycleEvidence: accepted }).block,
    false
  );
});

test('close resolves current directory evidence but leaves legacy bodies on the existing lane', async () => {
  const legacy = await resolveCloseLifecycleEvidence({
    body: 'legacy body',
    issueNumber: 1144,
    repository: 'owner/repo',
    projectDir: '/repo',
    deps: { locateAuthoritySource: () => ({ kind: 'legacy-body/v1' }) },
  });
  assert.equal(legacy, null);

  const accepted = acceptedEvidence({ approvalProvenance: 'full-auto' });
  const directory = await resolveCloseLifecycleEvidence({
    body: 'directory body',
    issueNumber: 1144,
    repository: 'owner/repo',
    projectDir: '/repo',
    deps: {
      locateAuthoritySource: () => ({ kind: 'github-records/v1' }),
      getHeadSha: async () => SHA,
      resolveLifecycleEvidence: async () => accepted,
    },
  });
  assert.equal(directory, accepted);
});

test('close fails closed when accepted directory Review or Approval evidence is absent', async () => {
  const missingApproval = {
    ...acceptedEvidence(),
    evidence: acceptedEvidence().evidence.filter((entry) => entry.evidenceKind === 'review'),
    acceptedRecordIds: ['review-1'],
  };
  await assert.rejects(
    () =>
      resolveCloseLifecycleEvidence({
        body: 'directory body',
        issueNumber: 1144,
        repository: 'owner/repo',
        projectDir: '/repo',
        deps: {
          locateAuthoritySource: () => ({ kind: 'github-records/v1' }),
          getHeadSha: async () => SHA,
          resolveLifecycleEvidence: async () => missingApproval,
        },
      }),
    /directory-approval-evidence-missing/
  );
});
