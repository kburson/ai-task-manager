#!/usr/bin/env node
// @story #935
//
// Bind-time review-remediation hint. When an agent binds to an issue parked in
// `review` whose body carries no Agent-Review pass-evidence marker, every bind
// path surfaces a diagnostic naming `/task review` as the in-place remediation
// and warning against demoting. These tests cover the pure hint lib and the
// integration point where `verbResume` prints the attached hint.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  reviewNeedsAgentReview,
  formatReviewRemediationHint,
  reviewRemediationHint,
} from '../lib/review-remediation-hint.mjs';

// A body whose "Agent Review Passed" box carries this gate's own pass evidence.
const PASS_MARKER =
  '<!-- aitm-verified gate="agent-review" ts="2026-07-22T00:00:00.000Z" sha="sandbox" validators="v1" result="pass" -->';
const REVIEW_COMPLETE_BODY = `## Definition of Done\n- [x] Agent Review Passed ${PASS_MARKER}\n`;
// A hand-ticked box with NO pass-evidence marker still reads as incomplete.
const REVIEW_HAND_TICKED_BODY = `## Definition of Done\n- [x] Agent Review Passed\n`;
const REVIEW_NOT_RUN_BODY = `## Definition of Done\n- [ ] Agent Review Passed\n`;

// --- unit: reviewNeedsAgentReview -------------------------------------------

test('reviewNeedsAgentReview is true only for review + no pass evidence', () => {
  assert.equal(reviewNeedsAgentReview({ state: 'review', body: REVIEW_NOT_RUN_BODY }), true);
  assert.equal(reviewNeedsAgentReview({ state: 'review', body: REVIEW_HAND_TICKED_BODY }), true);
});

test('reviewNeedsAgentReview is false for a complete review', () => {
  assert.equal(reviewNeedsAgentReview({ state: 'review', body: REVIEW_COMPLETE_BODY }), false);
});

test('reviewNeedsAgentReview is false for any non-review state', () => {
  for (const state of ['backlog', 'develop', 'test', 'done']) {
    assert.equal(reviewNeedsAgentReview({ state, body: REVIEW_NOT_RUN_BODY }), false, state);
  }
});

// --- unit: formatReviewRemediationHint --------------------------------------

test('formatReviewRemediationHint names /task review and warns against demote', () => {
  const hint = formatReviewRemediationHint(935, REVIEW_NOT_RUN_BODY);
  assert.match(hint, /\/task review #935/);
  assert.match(hint, /Do NOT demote/);
  assert.match(hint, /NOT been run/);
});

test('formatReviewRemediationHint distinguishes the review-failed cause', () => {
  const failedBody =
    REVIEW_NOT_RUN_BODY +
    '\n<!-- aitm-review-failed:start -->\n- boom\n<!-- aitm-review-failed:end -->\n';
  const hint = formatReviewRemediationHint(935, failedBody);
  assert.match(hint, /OBJECTED/);
});

test('reviewRemediationHint returns null when the hint does not apply', () => {
  assert.equal(
    reviewRemediationHint({ state: 'develop', body: REVIEW_NOT_RUN_BODY, issueNumber: 1 }),
    null
  );
  assert.equal(
    reviewRemediationHint({ state: 'review', body: REVIEW_COMPLETE_BODY, issueNumber: 1 }),
    null
  );
  assert.match(
    reviewRemediationHint({ state: 'review', body: REVIEW_NOT_RUN_BODY, issueNumber: 1 }),
    /\/task review/
  );
});

// --- governed integration seam ---------------------------------------------

const bindSource = readFileSync(
  new URL('../lib/work-lease/bind-orchestration.mjs', import.meta.url),
  'utf8'
);

test('governed bind persists the review-remediation hint in its session projection', () => {
  assert.match(bindSource, /reviewRemediationHint = eligibility\.reviewRemediationHint \?\? null/);
  assert.match(bindSource, /result\.projectionInputs\?\.session\?\.reviewRemediationHint/);
});

test('governed bind prints no review-remediation hint when the persisted value is absent', () => {
  assert.match(bindSource, /if \(reviewHint\) console\.log\(reviewHint\)/);
  assert.doesNotMatch(bindSource, /seedSessionKanbanFromBody|verbResumeLegacy/);
});
