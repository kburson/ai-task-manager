// @story #1632
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { requireDeliveryReceipt } from '../../../../task-tracker/lib/close-delivery-receipt.mjs';
import { buildNoCommitDeliveryRecord } from '../../../../task-tracker/lib/no-commit-delivery-record.mjs';

const ISSUE = 1624;
const REPOSITORY = 'kburson/ai-task-manager';
const ACCEPTED_SHA = '2158a289a63b27b9b4d08b8701a16f0b9d3e805d';
const DELIVERABLE_URL =
  'https://github.com/kburson/ai-task-manager/issues/1624#issuecomment-5675442778';

function rootEpicNoPullRequestInput() {
  const receipt = buildNoCommitDeliveryRecord({
    // cspell:disable-next-line
    recordId: '01M2HV3M65E99VQEAREGNPRS5G',
    repository: REPOSITORY,
    issueNumber: ISSUE,
    issueKind: 'epic',
    deliverableUrl: DELIVERABLE_URL,
    acceptedSha: ACCEPTED_SHA,
    provider: 'codex',
    sessionId: '01a0a50b-285e-7770-8489-94214eb19cea',
    verifiedAt: '2026-09-15T06:13:24.000Z',
  });
  return {
    issueNumber: ISSUE,
    repository: REPOSITORY,
    body: `## AITM Progress Markers

<!-- aitm-issue-kind kind="epic" -->
<!-- aitm-deliverable-posted url="${DELIVERABLE_URL}" ts="2026-09-15T05:53:56.595Z" -->`,
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    branch: 'feature/epic/1624',
    acceptedSha: ACCEPTED_SHA,
    observedLocalHeadSha: ACCEPTED_SHA,
    headRelation: 'current',
    pullRequest: null,
    pullRequests: [],
    records: null,
    noCommitRecords: {
      records: [{ record: receipt }],
      record: { record: receipt },
    },
  };
}

test('root epic cannot use a posted deliverable as authority for Done without a trunk PR', () => {
  assert.throws(
    () => requireDeliveryReceipt(rootEpicNoPullRequestInput()),
    /close-delivery-receipt:ambiguous-pr/
  );
});
