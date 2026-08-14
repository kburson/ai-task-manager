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
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  reviewNeedsAgentReview,
  formatReviewRemediationHint,
  reviewRemediationHint,
} from '../../../../task-tracker/lib/review-remediation-hint.mjs';

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

// --- integration: verbResume prints the attached hint -----------------------

const tmp = mkdtempProjectIsolated('tt-bind-hint-');
process.env.AI_TASK_MANAGER_PROJECT_DIR = tmp;
process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = path.join(tmp, 'transcripts');
mkdirSync(process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR, { recursive: true });

const { verbResume } = await import('../../../../task-tracker/verbs/resume.mjs');

let stateSeq = 0;
function writeState(obj) {
  const p = path.join(tmp, `state-${stateSeq++}.json`);
  writeFileSync(p, JSON.stringify(obj), 'utf8');
  return p;
}

// Capture console.log for the duration of one call.
async function captureResume(ctx) {
  const orig = console.log;
  const out = [];
  console.log = (...a) => out.push(a.join(' '));
  try {
    await verbResume(ctx);
  } finally {
    console.log = orig;
  }
  return out.join('\n');
}

function makeCtx({ rest, seedKanban, statePath }) {
  return {
    rest,
    cfg: { repo: 'owner/repo' },
    statePath,
    projectDir: tmp,
    role: 'agent',
    drainQueueIfAny: async () => {},
    safePostTiming: async () => {},
    nowIso: () => new Date().toISOString(),
    readTimingCommentBody: async () => ({ status: 'ok', body: '' }),
    seedKanban,
  };
}

test('verbResume prints the review-remediation hint when the seed attaches one', async () => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'bind-hint-present';
  const hint = formatReviewRemediationHint(935, REVIEW_NOT_RUN_BODY);
  const statePath = writeState({ active: null, lastActive: null });
  const out = await captureResume(
    makeCtx({
      rest: ['#935'],
      statePath,
      seedKanban: async () => ({ kanbanState: 'review', reviewRemediationHint: hint }),
    })
  );
  assert.match(out, /\/task review #935/, 'hint reaches stdout');
  assert.match(out, /Do NOT demote/);
});

test('verbResume stays silent when the seed attaches no hint', async () => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'bind-hint-absent';
  const statePath = writeState({ active: null, lastActive: null });
  const out = await captureResume(
    makeCtx({
      rest: ['#936'],
      statePath,
      seedKanban: async () => ({ kanbanState: 'review', reviewRemediationHint: null }),
    })
  );
  assert.equal(/Do NOT demote/.test(out), false, 'no hint printed when none is attached');
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
