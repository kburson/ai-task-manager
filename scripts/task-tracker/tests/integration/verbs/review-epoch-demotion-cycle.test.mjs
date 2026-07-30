// @story #1050
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { assertLifecycleSatisfied } from '../../../close-gate.mjs';
import { decideCloseConvergence } from '../../../lib/close-convergence.mjs';
import { buildPlanApprovalAuditComment } from '../../../lib/plan-approval-audit.mjs';
import {
  derivePersistedReviewAuthority,
  serializeAgentReviewProof,
  serializeReviewApproval,
} from '../../../lib/review-authority.mjs';
import { reviewExitReviewApprovedGuard } from '../../../lib/review-exit-review-approved-guard.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { stampEntryMarker } from '../../../lib/stage-entry-markers.mjs';
import { writeLastKnownState } from '../../../gh-timing-comment.mjs';
import { runApprove } from '../../../verbs/approve.mjs';
import { runDemote } from '../../../verbs/demote.mjs';
import { verbReview } from '../../../verbs/review.mjs';
import { runVerbTest } from '../../../verbs/test.mjs';

const REVIEW_COMMENTS = [
  {
    body: [
      '## ⏱ Timing Log',
      '',
      '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
      '|---|---|---|---|---|---|---|',
      '| 2026-06-19 00:00:00 -05:00 | start |  |  |  | 0 | bound |',
      '| 2026-06-19 00:01:00 -05:00 | pause |  |  |  | 0 | question |',
      '| 2026-06-19 00:02:00 -05:00 | resumed |  |  |  | 0 | answered |',
    ].join('\n'),
  },
  { body: '<!-- aitm-refined-estimate: 1050 -->\n\n### Planned Estimate\n\n| Field | Value |' },
  { body: buildPlanApprovalAuditComment({ issueNumber: 1050, ts: '2026-06-19T00:00:00Z' }) },
  { body: '### 🔗 Commits\n\n- def5678 fixture deliverable' },
  { body: '## New Automated Tests\n\n- `fixture.test.mjs`\n  - exercises authority renewal' },
];

function reviewableBody() {
  return [
    '## User Story',
    'As a maintainer, I want a reviewable body.',
    '## Scope',
    'Exercise the review success path.',
    '## Plan Metadata',
    '- **Size:** S',
    '## Pickup Directive',
    '- [x] Deep dive complete',
    '## Deep-Dive Analysis (2026-01-01)',
    'Design prose.',
    '<!-- aitm-fields: {"engagedTime":0} -->',
    '## Acceptance Criteria',
    '- [ ] Acceptance criteria met <!-- aitm-verified vc-list="vc:1" -->',
    '## Verification Commands',
    '- [ ] `node --test acceptance.test.mjs` <!-- id=1 -->',
    '## Definition of Done',
    '- [ ] `npm test` passes',
    '- [ ] Lint clean <!-- aitm-verified cmd="`npm run lint`" exit="0" sha="d" ts="t" -->',
    '- [ ] Acceptance criteria met',
    '- [ ] Issue body checkboxes ticked',
  ].join('\n');
}

function reviewEntry(visit, ts) {
  return `<!-- aitm-entered-review${visit > 1 ? `-${visit}` : ''} ts="${ts}" -->`;
}

function proof(epoch, sha, ts) {
  return serializeAgentReviewProof({ epoch, sha, ts, validators: 'unit', result: 'pass' });
}

function approval(epoch, sha, ts) {
  return serializeReviewApproval({ epoch, proofSha: sha, ts, provenance: 'human' });
}

test('#1050 hermetic incident: demote, Test, Review verb, stale close refusal, fresh human approval, and close success', async () => {
  const oldEpoch = 'review:1:2026-07-29T10:00:00Z';
  const oldSha = 'abc1234';
  const initial = [
    '<!-- aitm-last-known-state state="review" -->',
    reviewableBody(),
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Agent Review Passed',
    '- [x] Final Review Passed',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
    `<!-- aitm-dod-verified sha="${oldSha}" ts="2026-07-29T09:59:00Z" -->`,
    reviewEntry(1, '2026-07-29T10:00:00Z'),
    proof(oldEpoch, oldSha, '2026-07-29T10:01:00Z'),
    approval(oldEpoch, oldSha, '2026-07-29T10:02:00Z'),
  ].join('\n');
  let liveBody = initial;
  const demoted = await runDemote({
    issueNumber: 1050,
    cfg: { repo: 'o/r' },
    rework: 'renew review authority',
    now: () => '2026-07-29T10:03:00Z',
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body: liveBody }),
      getLiveState: async () => 'review',
      runMoveState: async () => 0,
      mutateIssueBody: async ({ mutate }) => {
        liveBody = mutate(liveBody);
        return { status: 'ok', body: liveBody };
      },
    },
  });
  assert.equal(demoted.status, 'demoted');
  assert.equal(derivePersistedReviewAuthority(liveBody).status, 'stale');

  const newSha = 'def5678';
  const projectDir = mkdtempSync(path.join(projectScratchDir('test'), 'review-epoch-cycle-'));
  const statePath = path.join(projectDir, 'state.json');
  writeFileSync(
    statePath,
    JSON.stringify({
      active: '#1050',
      lastActive: '#1050',
      entryStartTs: '2026-07-29T10:30:00Z',
      wordsAtEntryStart: 0,
      lastWordMarker: 0,
    })
  );

  try {
    const tested = await runVerbTest({
      cfg: { repo: 'o/r' },
      issueNumber: 1050,
      projectDir,
      now: () => '2026-07-29T10:30:00Z',
      deps: {
        fetchBody: async () => liveBody,
        mutateBody: async ({ mutate }) => {
          liveBody = mutate(liveBody);
          return { status: 'ok', body: liveBody };
        },
        postComment: async () => {},
        getHeadSha: async () => newSha,
        createWorktree: async () => {},
        removeWorktree: async () => {},
        npmCi: async () => {},
        execInSandbox: async () => ({ exit: 0, stdout: '', stderr: '' }),
        moveState: async ({ target }) => {
          liveBody = writeLastKnownState(
            stampEntryMarker(liveBody, target, '2026-07-29T10:30:00Z'),
            target
          );
          return { ok: true };
        },
        logIssueTime: async () => {},
      },
    });
    assert.equal(tested.status, 'passed');
    assert.equal(derivePersistedReviewAuthority(liveBody).status, 'stale');

    const reviewTs = new Date().toISOString();
    const concurrentReviewEdit = 'Concurrent operator note preserved through review normalization.';
    let injectConcurrentReviewEdit = true;
    await verbReview({
      cfg: { repo: 'o/r', projectId: 'PROJ', idleThresholdMinutes: 5 },
      statePath,
      projectDir,
      rest: ['#1050'],
      SKIP_NETWORK: false,
      pexec: async (cmd, args = []) => {
        if (cmd === 'git') return { stdout: newSha, stderr: '' };
        const fields = String(args[args.indexOf('--json') + 1] || '').split(',');
        if (fields.includes('comments')) {
          return {
            stdout: JSON.stringify({ body: liveBody, comments: REVIEW_COMMENTS }),
            stderr: '',
          };
        }
        if (args.includes('--jq')) return { stdout: liveBody, stderr: '' };
        return { stdout: JSON.stringify({ body: liveBody }), stderr: '' };
      },
      drainQueueIfAny: async () => {},
      safePostTiming: async () => {},
      runMoveState: async (_target, target) => {
        if (target === 'review') {
          liveBody = writeLastKnownState(stampEntryMarker(liveBody, 'review', reviewTs), 'review');
        }
        return { ok: true };
      },
      runLogIssueTime: async () => {},
      fetchSubIssues: async () => [],
      getIssueBoardState: async () => 'review',
      nowIso: () => new Date().toISOString(),
      runReviewPreflight: async () => ({ ok: true, reasons: [] }),
      mutateIssueBody: async ({ mutate }) => {
        if (injectConcurrentReviewEdit) {
          injectConcurrentReviewEdit = false;
          liveBody = liveBody.replace(
            'Exercise the review success path.',
            `Exercise the review success path.\n${concurrentReviewEdit}`
          );
        }
        liveBody = mutate(liveBody);
        return { status: 'ok', body: liveBody };
      },
      deriveAndStampFunctionalDod: async () => ({ status: 'no-op' }),
      runGuards: async () => ({ refusals: [] }),
    });
    assert.match(liveBody, new RegExp(concurrentReviewEdit));
    assert.equal(reviewExitReviewApprovedGuard.run({ body: liveBody, toState: 'done' }).ok, false);
    assert.equal(
      decideCloseConvergence({ boardState: 'done', issueClosed: false, body: liveBody }).action,
      'authority-refused'
    );

    const approved = await runApprove({
      issueNumber: 1050,
      cfg: { repo: 'o/r' },
      human: true,
      deps: {
        assertBound: () => {},
        fetchIssueBody: async () => liveBody,
        getBoardState: async () => 'review',
        nowIso: () => '2026-07-29T11:02:00Z',
        detectFullAuto: () => ({ fired: true, signals: 'ci=1' }),
        postComment: async () => {},
        fetchComments: async () => [],
        fetchProjectValues: async () => ({}),
        mutateIssueBody: async ({ mutate }) => {
          liveBody = mutate(liveBody);
          return { status: 'ok', body: liveBody };
        },
      },
    });
    assert.equal(approved.status, 'approved');
    assert.equal(derivePersistedReviewAuthority(liveBody).approval.provenance, 'human');
    assert.equal(reviewExitReviewApprovedGuard.run({ body: liveBody, toState: 'done' }).ok, true);
    assert.equal(assertLifecycleSatisfied({ body: liveBody }).block, false);
    assert.equal(
      decideCloseConvergence({ boardState: 'done', issueClosed: false, body: liveBody }).action,
      'close-issue'
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
