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
  FULL_AUTO_AUDIT_RE,
  HUMAN_REVIEWER_MARKER_RE,
  HUMAN_REVIEWER_ENV,
} from '../../lib/human-reviewer-audit.mjs';

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
