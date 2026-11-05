// @story #2153
// cspell:ignore digestless
import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewAgentValidationAction } from '../../../../task-tracker/lib/resident-actions/review-agent-validation.mjs';
import { buildPlanApprovedMarker } from '../../../../task-tracker/lib/markers.mjs';
import {
  stampAgentReviewPassed,
  buildReviewContext,
} from '../../../../task-tracker/lib/agent-review/review-gate.mjs';
import { buildPlanApprovalAuditComment } from '../../../../task-tracker/lib/plan-approval-audit.mjs';
import {
  createCurrentPlanApprovalEvidence,
  currentPlanApprovalDigest,
} from '../../../../task-tracker/lib/plan-approval-current-scope.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';

// @story #2153
function currentResidentFixture(forecastRecordId = null) {
  const repo = 'o/r',
    issue = 2153,
    head = 'e'.repeat(40),
    ts = '2026-11-05T07:00:00Z';
  const base =
    '## User Story\n\nAs a release operator\nI want to stop partial publication because checks fail\nSo that consumers receive complete releases\n\n## Scope\n\nStop partial publication.\n\n## Plan Metadata\n\n- Implementation-plan: plan.md\n\n## Acceptance Criteria\n\n- [ ] Reject incomplete publication.\n\n## Definition of Done\n\n- [ ] Agent Review Passed\n\n## AITM Progress Markers\n\n<!-- aitm-entered-review ts="2026-11-05T06:00:00Z" -->';
  const binding = {
    storyDigest: 'b'.repeat(64),
    storyIntentDigest: 'c'.repeat(64),
    storyIntentSource: 'linked-plan',
  };
  const evidence = createCurrentPlanApprovalEvidence({
    repository: repo,
    issue,
    scopeIdentity: computeScopeIdentity({ repository: repo, issue, body: base }),
    sourceHead: head,
    trunkSha: 'f'.repeat(40),
    planPath: 'plan.md',
    planContentSha256: 'a'.repeat(64),
    storyBinding: binding,
    forecastRecordId,
    admission: {
      transitionId: 'move:bbec1b1c-b113-4ae3-8037-9db4ea1152b0',
      authorityCommentId: '1',
      commitCommentId: '2',
      historicalScopeIdentity: `sha256:${'4'.repeat(64)}`,
      authorityFingerprint: `sha256:${'5'.repeat(64)}`,
      commitFingerprint: `sha256:${'6'.repeat(64)}`,
    },
  });
  const body = stampAgentReviewPassed(
    base +
      '\n' +
      (forecastRecordId
        ? `<!-- aitm-estimation-forecast-ready record-id="${forecastRecordId}" -->\n`
        : '') +
      buildPlanApprovedMarker(ts, {
        ...binding,
        forecastRecordId,
        mode: 'full-auto',
        trunkSha: evidence.trunkSha,
        currentApprovalDigest: currentPlanApprovalDigest(evidence),
      }),
    { ts: '2026-11-05T07:01:00Z', validators: ['required-comments'] }
  );
  const comments = [
    { body: buildPlanApprovalAuditComment({ issueNumber: issue, ts, currentEvidence: evidence }) },
  ];
  return {
    repo,
    issue,
    head,
    ts,
    body,
    comments,
    context: { review: { repo, readComments: async () => comments } },
    snapshot: {
      issue: { value: issue },
      body: { value: body },
      headSha: { value: head },
      reviewComments: comments,
      stateVisitId: 'review:1',
    },
  };
}
test('#2153 resident pass reuse accepts matching current approval at selected source', async () => {
  const f = currentResidentFixture();
  assert.equal(
    (await reviewAgentValidationAction.verify(f.context, f.snapshot)).status,
    'complete'
  );
});
for (const [name, alter] of Object.entries({
  'different selected source': (f) => {
    f.snapshot.headSha.value = 'd'.repeat(40);
  },
  'missing selected source': (f) => {
    delete f.snapshot.headSha;
  },
  'frozen forecast differs from audited null': (f) => {
    f.snapshot.body.value = f.snapshot.body.value.replace(
      ' mode="full-auto"',
      ' forecast-record-id="01M00000000000000000000001" mode="full-auto"'
    );
  },
  'malformed forecast wrapper': (f) => {
    f.snapshot.body.value += '\n<!-- aitm-estimation-forecast-ready record-id="BROKEN" -->';
  },
  'malformed second approval claim': (f) => {
    f.snapshot.body.value += '\n<!-- aitm-plan-approved -->';
  },
  'duplicate approval mode attribute': (f) => {
    f.snapshot.body.value = f.snapshot.body.value.replace(
      'mode="full-auto"',
      'mode="full-auto" mode="human"'
    );
  },
  'ordinary audit at same timestamp': (f) => {
    f.comments[0].body = buildPlanApprovalAuditComment({ issueNumber: f.issue, ts: f.ts });
  },
  'waiver audit at same timestamp': (f) => {
    f.comments[0].body = buildPlanApprovalAuditComment({
      issueNumber: f.issue,
      ts: f.ts,
      repairEvidence: {
        approvalPlanRecordId: '01M2Y000000000000000000001',
        revokedRecordId: '01M2Y000000000000000000002',
      },
    });
  },
  'current audit with digestless marker': (f) => {
    f.snapshot.body.value = f.snapshot.body.value.replace(/ current-approval-digest="[^"]+"/, '');
  },
}))
  test(`#2153 resident pass reuse refuses ${name}`, async () => {
    const f = currentResidentFixture();
    alter(f);
    assert.notEqual(
      (await reviewAgentValidationAction.verify(f.context, f.snapshot)).status,
      'complete'
    );
  });
test('#2153 review context retains the selected acceptance source', () => {
  const ctx = buildReviewContext({ acceptedSourceHead: 'e'.repeat(40) });
  assert.equal(ctx.acceptedSourceHead, 'e'.repeat(40));
});

for (const replacement of ['', ' forecast-record-id="01M00000000000000000000002"'])
  test('#2153 resident refuses changed or missing present frozen forecast', async () => {
    const f = currentResidentFixture('01M00000000000000000000001');
    assert.equal(
      (await reviewAgentValidationAction.verify(f.context, f.snapshot)).status,
      'complete'
    );
    f.snapshot.body.value = f.snapshot.body.value.replace(
      / forecast-record-id="[^"]+"/,
      replacement
    );
    assert.notEqual(
      (await reviewAgentValidationAction.verify(f.context, f.snapshot)).status,
      'complete'
    );
  });
