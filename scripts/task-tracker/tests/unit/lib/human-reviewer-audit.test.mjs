// @story #169
// #169 — Full-Auto review-gate enforcement: env var present → marker stamped,
// no audit comment; env var absent → audit comment posted with stable marker;
// idempotent on both paths.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  enforceFullAutoAudit,
  getHumanReviewer,
  buildAuditCommentBody,
  buildHumanReviewerMarker,
  hasGenuineReviewApprovedMarker,
  resolveReviewAuthority,
  FULL_AUTO_AUDIT_RE,
  HUMAN_REVIEWER_MARKER_RE,
  HUMAN_REVIEWER_ENV,
} from '../../../lib/human-reviewer-audit.mjs';
import { buildReviewApprovedMarker } from '../../../lib/markers.mjs';

const REVIEW_TS = '2026-07-29T00:00:00Z';
const EPOCH = `review:1:${REVIEW_TS}`;
const SHA = 'abc1234';

function currentReviewAuthorityBody({ fullAuto = false } = {}) {
  return [
    `<!-- aitm-dod-verified sha="${SHA}" ts="2026-07-28T23:59:00Z" -->`,
    `<!-- aitm-entered-review ts="${REVIEW_TS}" -->`,
    `<!-- aitm-agent-review-proof schema="1" epoch="${EPOCH}" sha="${SHA}" ts="2026-07-29T00:00:01Z" validators="unit" result="pass" -->`,
    buildReviewApprovedMarker('2026-07-29T00:00:02Z', {
      epoch: EPOCH,
      proofSha: SHA,
      provenance: fullAuto ? 'full-auto' : 'human',
      signals: fullAuto ? 'reviewer-unset=1' : '',
    }),
  ].join('\n');
}

function makeRecorder() {
  const comments = [];
  const writes = [];
  return {
    comments,
    writes,
    postComment: async ({ body }) => {
      comments.push(body);
    },
    listComments: async () => comments.map((body) => ({ body })),
    writeIssueBody: async ({ body }) => {
      writes.push(body);
    },
  };
}

test('getHumanReviewer returns null when env unset or blank', () => {
  assert.equal(getHumanReviewer({}), null);
  assert.equal(getHumanReviewer({ [HUMAN_REVIEWER_ENV]: '' }), null);
  assert.equal(getHumanReviewer({ [HUMAN_REVIEWER_ENV]: '   ' }), null);
  assert.equal(getHumanReviewer({ [HUMAN_REVIEWER_ENV]: 'alice' }), 'alice');
  assert.equal(getHumanReviewer({ [HUMAN_REVIEWER_ENV]: '  alice  ' }), 'alice');
});

test('buildAuditCommentBody contains stable HTML marker and env-var name', () => {
  const body = buildAuditCommentBody({ ts: '2026-05-18T13:30:00Z' });
  assert.match(body, FULL_AUTO_AUDIT_RE);
  assert.match(body, new RegExp(HUMAN_REVIEWER_ENV));
  assert.match(body, /no human reviewer/i);
  assert.match(body, /2026-05-18T13:30:00Z/);
});

test('buildHumanReviewerMarker round-trips via HUMAN_REVIEWER_MARKER_RE', () => {
  const m = buildHumanReviewerMarker('alice', '2026-05-18T13:30:00Z');
  // #380: writer now emits the property grammar
  // `<!-- aitm-human-reviewer handle="alice" ts="..." -->`.
  assert.match(m, /^<!-- aitm-human-reviewer handle="alice" ts="2026-05-18T13:30:00Z" -->$/);
  assert.ok(HUMAN_REVIEWER_MARKER_RE.test(m), 'marker should match HUMAN_REVIEWER_MARKER_RE');
});

test('HUMAN_REVIEWER_MARKER_RE still matches the legacy colon form', () => {
  // #380: dual-tolerant reader keeps decoding the pre-migration shape until
  // #369's corpus sweep confirms zero residual legacy markers.
  const legacy = '<!-- aitm-human-reviewer: alice @ 2026-05-18T12:00:00Z -->';
  assert.ok(HUMAN_REVIEWER_MARKER_RE.test(legacy), 'legacy colon form should still match');
});

test('Full-Auto path (env absent) posts audit comment with marker', async () => {
  const rec = makeRecorder();
  const result = await enforceFullAutoAudit({
    issueNumber: 169,
    repo: 'org/repo',
    body: 'issue body',
    env: {},
    writeIssueBody: rec.writeIssueBody,
    postComment: rec.postComment,
    listComments: rec.listComments,
    now: () => '2026-05-18T13:30:00Z',
  });
  assert.equal(result.mode, 'full-auto');
  assert.equal(result.auditPosted, true);
  assert.equal(result.alreadyPresent, false);
  assert.equal(rec.comments.length, 1);
  assert.match(rec.comments[0], FULL_AUTO_AUDIT_RE);
  assert.equal(rec.writes.length, 0);
});

test('Full-Auto path is idempotent — does not duplicate audit comment', async () => {
  const rec = makeRecorder();
  rec.comments.push('previous audit\n<!-- aitm-full-auto-approval -->');
  const result = await enforceFullAutoAudit({
    issueNumber: 169,
    repo: 'org/repo',
    body: 'issue body',
    env: {},
    writeIssueBody: rec.writeIssueBody,
    postComment: rec.postComment,
    listComments: rec.listComments,
    now: () => '2026-05-18T13:30:00Z',
  });
  assert.equal(result.mode, 'full-auto');
  assert.equal(result.auditPosted, false);
  assert.equal(result.alreadyPresent, true);
  assert.equal(rec.comments.length, 1, 'no new comment posted');
});

test('Human-reviewer path (env set) stamps body marker, no comment', async () => {
  const rec = makeRecorder();
  const result = await enforceFullAutoAudit({
    issueNumber: 169,
    repo: 'org/repo',
    body: 'issue body',
    env: { [HUMAN_REVIEWER_ENV]: 'alice' },
    writeIssueBody: rec.writeIssueBody,
    postComment: rec.postComment,
    listComments: rec.listComments,
    now: () => '2026-05-18T13:30:00Z',
  });
  assert.equal(result.mode, 'human-reviewer');
  assert.equal(result.handle, 'alice');
  assert.equal(result.stamped, true);
  assert.equal(rec.writes.length, 1);
  assert.match(rec.writes[0], HUMAN_REVIEWER_MARKER_RE);
  assert.equal(rec.comments.length, 0, 'no audit comment in human-reviewer path');
});

test('Human-reviewer path is idempotent — does not double-stamp marker', async () => {
  const rec = makeRecorder();
  const prior = 'issue body\n\n<!-- aitm-human-reviewer: alice @ 2026-05-18T12:00:00Z -->';
  const result = await enforceFullAutoAudit({
    issueNumber: 169,
    repo: 'org/repo',
    body: prior,
    env: { [HUMAN_REVIEWER_ENV]: 'alice' },
    writeIssueBody: rec.writeIssueBody,
    postComment: rec.postComment,
    listComments: rec.listComments,
    now: () => '2026-05-18T13:30:00Z',
  });
  assert.equal(result.mode, 'human-reviewer');
  assert.equal(result.stamped, false, 'no rewrite when marker present');
  assert.equal(rec.writes.length, 0);
});

test('hasGenuineReviewApprovedMarker: true for non-full-auto marker, false for full-auto marker or absent', () => {
  assert.equal(hasGenuineReviewApprovedMarker(currentReviewAuthorityBody()), true);
  assert.equal(
    hasGenuineReviewApprovedMarker(currentReviewAuthorityBody({ fullAuto: true })),
    false
  );
  assert.equal(hasGenuineReviewApprovedMarker('body with no marker'), false);
  assert.equal(hasGenuineReviewApprovedMarker(null), false);
});

test('current Full-Auto provenance overrides a human-gate call-site hint', async () => {
  const rec = makeRecorder();
  const result = await enforceFullAutoAudit({
    issueNumber: 1050,
    repo: 'org/repo',
    body: currentReviewAuthorityBody({ fullAuto: true }),
    env: { [HUMAN_REVIEWER_ENV]: 'alice' },
    reviewAuthority: 'human-gate',
    writeIssueBody: rec.writeIssueBody,
    postComment: rec.postComment,
    listComments: rec.listComments,
    now: () => '2026-07-29T00:00:03Z',
  });

  assert.equal(result.mode, 'full-auto');
  assert.equal(rec.writes.length, 0);
  assert.equal(rec.comments.length, 1);
  assert.match(rec.comments[0], /persisted Full-Auto review authority/i);
  assert.doesNotMatch(rec.comments[0], /without a `TASK_TRACKER_HUMAN_REVIEWER` signal/);
});

test('explicit review authority takes precedence over legacy reviewer environment detection', async () => {
  const cases = [
    {
      name: 'genuine marker wins over a bypass context',
      body: currentReviewAuthorityBody(),
      reviewAuthority: 'gate-bypassed',
      expected: 'human-reviewer',
    },
    {
      name: 'explicit bypass records Full-Auto even with a reviewer env',
      body: '',
      env: { TASK_TRACKER_HUMAN_REVIEWER: 'alice' },
      reviewAuthority: 'gate-bypassed',
      expected: 'full-auto',
    },
    {
      name: 'human gate does not become Full-Auto when reviewer env is absent',
      body: '',
      env: {},
      reviewAuthority: 'human-gate',
      expected: 'human-reviewer',
    },
  ];

  for (const { name, body, env = {}, reviewAuthority, expected } of cases) {
    await test(name, async () => {
      const rec = makeRecorder();
      const result = await enforceFullAutoAudit({
        issueNumber: 925,
        repo: 'org/repo',
        body,
        env,
        reviewAuthority,
        writeIssueBody: rec.writeIssueBody,
        postComment: rec.postComment,
        listComments: rec.listComments,
        now: () => '2026-07-29T00:00:00Z',
      });
      assert.equal(result.mode, expected);
      if (expected === 'human-reviewer') {
        assert.equal(rec.writes.length, 1);
        assert.equal(rec.comments.length, 0);
        if (reviewAuthority === 'human-gate') {
          assert.equal(result.handle, 'review-gate');
          assert.match(rec.writes[0], /aitm-human-reviewer handle="review-gate"/);
        }
      } else {
        assert.equal(rec.writes.length, 0);
        assert.equal(rec.comments.length, 1);
        assert.match(rec.comments[0], FULL_AUTO_AUDIT_RE);
      }
    });
  }
});

test('explicit bypass audit names the bypass without claiming a reviewer signal was absent', async () => {
  const rec = makeRecorder();
  const result = await enforceFullAutoAudit({
    issueNumber: 925,
    repo: 'org/repo',
    body: '',
    env: { [HUMAN_REVIEWER_ENV]: 'alice' },
    reviewAuthority: 'gate-bypassed',
    writeIssueBody: rec.writeIssueBody,
    postComment: rec.postComment,
    listComments: rec.listComments,
    now: () => '2026-07-29T00:00:00Z',
  });

  assert.equal(result.mode, 'full-auto');
  assert.equal(rec.comments.length, 1);
  assert.match(rec.comments[0], /review[ -]gate.*explicitly bypassed/i);
  assert.doesNotMatch(rec.comments[0], /without a `TASK_TRACKER_HUMAN_REVIEWER` signal/);
  assert.match(rec.comments[0], FULL_AUTO_AUDIT_RE);
});

test('enforceFullAutoAudit rejects an unsupported explicit review authority', async () => {
  await assert.rejects(
    enforceFullAutoAudit({
      issueNumber: 925,
      repo: 'org/repo',
      body: '',
      reviewAuthority: 'untrusted',
    }),
    /invalid reviewAuthority/
  );
});

test('resolveReviewAuthority accepts only the internal authority union', () => {
  assert.equal(resolveReviewAuthority(), null);
  assert.equal(resolveReviewAuthority(null), null);
  assert.equal(resolveReviewAuthority('human-gate'), 'human-gate');
  assert.equal(resolveReviewAuthority('gate-bypassed'), 'gate-bypassed');
  assert.throws(() => resolveReviewAuthority('untrusted'), /invalid reviewAuthority/);
});

// #979 AC3 — a genuine (non-full-auto) aitm-review-approved marker on the
// body overrides an env that would otherwise read as Full-Auto: no audit
// comment, human-reviewer marker stamped instead.
test('body already carrying a genuine review-approved marker suppresses the Full-Auto audit even with env unset', async () => {
  const rec = makeRecorder();
  const result = await enforceFullAutoAudit({
    issueNumber: 979,
    repo: 'org/repo',
    body: `## Acceptance Criteria\n\n${currentReviewAuthorityBody()}\n`,
    env: {},
    writeIssueBody: rec.writeIssueBody,
    postComment: rec.postComment,
    listComments: rec.listComments,
    now: () => '2026-07-26T00:00:00Z',
  });
  assert.equal(result.mode, 'human-reviewer');
  assert.equal(rec.comments.length, 0, 'no Full-Auto audit comment posted');
  assert.equal(rec.writes.length, 1);
  assert.match(rec.writes[0], HUMAN_REVIEWER_MARKER_RE);
});

// #979 regression — a body carrying the full-auto-flagged review-approved
// marker does NOT suppress the audit; the Full-Auto path still fires.
test('a full-auto-flagged review-approved marker does not suppress the audit', async () => {
  const rec = makeRecorder();
  const fullAutoMarker = buildReviewApprovedMarker('2026-07-26T00:00:00Z', {
    fullAuto: true,
    signals: 'reviewer-unset=1',
  });
  const result = await enforceFullAutoAudit({
    issueNumber: 979,
    repo: 'org/repo',
    body: `## Acceptance Criteria\n\n${fullAutoMarker}\n`,
    env: {},
    writeIssueBody: rec.writeIssueBody,
    postComment: rec.postComment,
    listComments: rec.listComments,
    now: () => '2026-07-26T00:00:00Z',
  });
  assert.equal(result.mode, 'full-auto');
  assert.equal(result.auditPosted, true);
});

test('Full-Auto path tolerates listComments throwing — posts comment anyway', async () => {
  const posted = [];
  const result = await enforceFullAutoAudit({
    issueNumber: 169,
    repo: 'org/repo',
    body: 'issue body',
    env: {},
    postComment: async ({ body }) => {
      posted.push(body);
    },
    listComments: async () => {
      throw new Error('network glitch');
    },
    now: () => '2026-05-18T13:30:00Z',
  });
  assert.equal(result.mode, 'full-auto');
  assert.equal(result.auditPosted, true);
  assert.equal(posted.length, 1);
});

test('Full-Auto path returns error when postComment throws', async () => {
  const result = await enforceFullAutoAudit({
    issueNumber: 169,
    repo: 'org/repo',
    body: 'issue body',
    env: {},
    postComment: async () => {
      throw new Error('rate-limited');
    },
    listComments: async () => [],
    now: () => '2026-05-18T13:30:00Z',
    warn: () => {},
  });
  assert.equal(result.mode, 'full-auto');
  assert.equal(result.auditPosted, false);
  assert.match(result.error, /rate-limited/);
});
