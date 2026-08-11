// @story #1133
// Regression: Review approval owns the timing boundary. The marker timestamp
// must terminate Review even when close happens hours later, and retries must
// converge exactly one chronologically placed `review:approved` row.

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { test } from 'node:test';

import { runApprove } from '../../../verbs/approve.mjs';
import { buildInitialComment, appendRow } from '../../../gh-timing-comment.internals.mjs';
import { parseTimingRow } from '../../../lib/timing-row-reader.mjs';
import { computeActiveByPhaseSpans } from '../../../lib/timing-rows.mjs';
import { parseTimingRows, rollupTotals } from '../../../timing-rollup.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const REVIEW_STARTED = '2026-08-06T05:56:41Z';
const APPROVED = '2026-08-06T05:58:36Z';
const STALE_APPROVED = '2026-08-06T05:57:10Z';
const CLOSE_PAUSE = '2026-08-06T12:50:17Z';
const CLOSED = '2026-08-06T12:50:44Z';
const APPROVAL_MARKER = `<!-- aitm-review-approved ts="${APPROVED}" -->`;
const AGENT_REVIEW_PASSED =
  '- [ ] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-08-06T05:58:14Z" sha="sandbox" validators="body-sections" result="pass" -->';

const row = (ts, event, marker = 100, fullMarker = marker) =>
  `| ${ts.replace('T', ' ').replace('Z', ' +00:00')} | ${event} |  |  |  | ${marker} |  | ${fullMarker} | <!-- row-sec: a=0 i=0 -->`;

const eventRows = (body) =>
  String(body)
    .split('\n')
    .map((line) => parseTimingRow(line))
    .filter((parsed) => parsed && parsed.event !== 'event');
const markerNumber = (value) => Number(String(value).replace(/,/g, ''));

const timingModule = await import('../../../lib/review-approval-timing.mjs').catch(() => ({}));
const timingCommentModule = await import('../../../gh-timing-comment.mjs');

test('exports the marker-authorized approval timing capabilities', () => {
  assert.equal(
    typeof timingModule.reconcileReviewApprovedTiming,
    'function',
    'shared approval timing reconciler must exist'
  );
  assert.equal(
    typeof timingCommentModule.buildMarkerAuthorizedReviewApprovedRow,
    'function',
    'marker-authorized row constructor must exist'
  );
});

test('#1127 marker-authorized boundary is inserted at approval and deduplicated', () => {
  assert.equal(typeof timingCommentModule.buildMarkerAuthorizedReviewApprovedRow, 'function');
  const issueBody = `body\n\n${APPROVAL_MARKER}\n`;
  const approvalRow = timingCommentModule.buildMarkerAuthorizedReviewApprovedRow({
    issueBody,
    activeSec: 115,
    idleSec: 0,
    wordMarker: 35742,
  });
  let timingBody = buildInitialComment();
  timingBody = appendRow(timingBody, row(REVIEW_STARTED, 'review:started', 35742, 50000));
  timingBody = appendRow(timingBody, row(CLOSE_PAUSE, 'pause:other', 36316, 51000));
  timingBody = appendRow(timingBody, approvalRow);
  const once = timingBody;
  timingBody = appendRow(timingBody, approvalRow);

  const rows = eventRows(timingBody);
  assert.deepEqual(
    rows.map(({ event }) => event),
    ['review:started', 'review:approved', 'pause:other']
  );
  assert.equal(Date.parse(rows[1].ts), Date.parse(APPROVED));
  assert.equal(timingBody, once, 'retry must not append a duplicate approval boundary');
});

test('marker-authorized boundary ignores fenced approval lookalikes', () => {
  const issueBody = [
    '```md',
    '<!-- aitm-review-approved ts="2099-01-01T00:00:00Z" -->',
    '```',
    APPROVAL_MARKER,
  ].join('\n');
  const approvalRow = timingCommentModule.buildMarkerAuthorizedReviewApprovedRow({
    issueBody,
    activeSec: 115,
    idleSec: 0,
    wordMarker: 35742,
  });
  assert.equal(Date.parse(parseTimingRow(approvalRow).ts), Date.parse(APPROVED));
});

test('legacy colon approval marker remains valid reconciliation authority', () => {
  const issueBody = '<!-- aitm-review-approved: 2026-08-06T05:58:36Z -->';
  const approvalRow = timingCommentModule.buildMarkerAuthorizedReviewApprovedRow({
    issueBody,
    activeSec: 115,
    idleSec: 0,
    wordMarker: 35742,
  });
  assert.equal(Date.parse(parseTimingRow(approvalRow).ts), Date.parse(APPROVED));
});

test('#1127 delayed close cannot inflate Review or published active totals', async () => {
  assert.equal(typeof timingModule.reconcileReviewApprovedTiming, 'function');
  const issueBody = `body\n\n${APPROVAL_MARKER}\n`;
  let timingBody = buildInitialComment();
  timingBody = appendRow(timingBody, row(REVIEW_STARTED, 'review:started', 35742));
  const postTimingEvent = async ({ row: next }) => {
    timingBody = appendRow(timingBody, next);
  };
  const readTimingCommentBody = async () => ({ status: 'found', body: timingBody });

  await timingModule.reconcileReviewApprovedTiming({
    issueNumber: 1127,
    repo: 'o/r',
    issueBody,
    wordMarker: 35742,
    readTimingCommentBody,
    postTimingEvent,
  });
  await timingModule.reconcileReviewApprovedTiming({
    issueNumber: 1127,
    repo: 'o/r',
    issueBody,
    wordMarker: 36316,
    readTimingCommentBody,
    postTimingEvent,
  });

  const atApproval = computeActiveByPhaseSpans(timingBody, APPROVED);
  const atClose = computeActiveByPhaseSpans(timingBody, CLOSED);
  const rollAtClose = rollupTotals(parseTimingRows(timingBody), 5, timingBody);
  assert.equal(atApproval.totalActiveSec, 115);
  assert.equal(atClose.totalActiveSec, 115);
  assert.equal(atClose.perPhase.find((phase) => phase.event === 'review:started').activeSec, 115);
  assert.equal(rollAtClose.totalActiveSec, 115);
  assert.equal(rollAtClose.engagedSec, 115);
  assert.equal(rollAtClose.reviewSec, 0);
  assert.equal(eventRows(timingBody).filter(({ event }) => event === 'review:approved').length, 1);
});

test('legacy repair uses the last marker at approval, not a later close marker', async () => {
  assert.equal(typeof timingModule.reconcileReviewApprovedTiming, 'function');
  const issueBody = `body\n\n${APPROVAL_MARKER}\n`;
  let timingBody = buildInitialComment();
  timingBody = appendRow(timingBody, row(REVIEW_STARTED, 'review:started', 35742, 50000));
  timingBody = appendRow(timingBody, row(CLOSE_PAUSE, 'pause:other', 36316, 51000));
  await timingModule.reconcileReviewApprovedTiming({
    issueNumber: 1127,
    repo: 'o/r',
    issueBody,
    wordMarker: 40000,
    fullWordMarker: 60000,
    readTimingCommentBody: async () => ({ status: 'found', body: timingBody }),
    postTimingEvent: async ({ row: next }) => {
      timingBody = appendRow(timingBody, next);
    },
  });
  const rows = eventRows(timingBody);
  const approval = rows.find(({ event }) => event === 'review:approved');
  assert.equal(markerNumber(approval.wordMarker), 35742);
  assert.equal(markerNumber(approval.fullWordMarker), 50000);
  assert.deepEqual(
    rows.map(({ wordMarker }) => markerNumber(wordMarker)),
    [35742, 35742, 36316]
  );
});

test('post-close retry cannot duplicate the same authoritative approval event', async () => {
  const issueBody = `body\n\n${APPROVAL_MARKER}\n`;
  const existingApproval = timingCommentModule.buildMarkerAuthorizedReviewApprovedRow({
    issueBody,
    activeSec: 115,
    idleSec: 0,
    wordMarker: 35742,
  });
  let timingBody = buildInitialComment();
  for (const timingRow of [
    row(REVIEW_STARTED, 'review:started', 35742),
    existingApproval,
    row(CLOSED, 'issue:wrap', 36316),
    row('2026-08-06T12:51:06Z', 'issue:closed', 36319),
    row('2026-08-06T12:52:10Z', 'resumed', 36325),
  ]) {
    timingBody = appendRow(timingBody, timingRow);
  }
  const before = timingBody;
  await timingModule.reconcileReviewApprovedTiming({
    issueNumber: 1127,
    repo: 'o/r',
    issueBody,
    wordMarker: 36325,
    readTimingCommentBody: async () => ({ status: 'found', body: timingBody }),
    postTimingEvent: async ({ row: next }) => {
      timingBody = appendRow(timingBody, next);
    },
  });
  assert.equal(timingBody, before);
  assert.equal(eventRows(timingBody).filter(({ event }) => event === 'review:approved').length, 1);
});

function approveDeps({ initialBody, reconciliations }) {
  let body = initialBody;
  return {
    assertBound: () => {},
    fetchIssueBody: async () => body,
    mutateIssueBody: async ({ mutate }) => {
      const before = body;
      body = mutate(body);
      return { status: body === before ? 'no-op' : 'ok', body };
    },
    getBoardState: async () => 'review',
    nowIso: () => APPROVED,
    detectFullAuto: () => ({ fired: true, signals: 'env=1' }),
    postComment: async () => {},
    fetchComments: async () => [],
    fetchProjectValues: async () => ({}),
    deriveDrivers: () => [],
    reconcileReviewApprovedTiming: async (args) => {
      reconciliations.push(args);
      return { status: 'posted', ts: APPROVED };
    },
  };
}

test('runApprove reconciles timing after first approval and on an already-approved retry', async () => {
  const projectDir = mkdtempSync(`${projectScratchDir('test')}/aitm-1133-`);
  const baseBody = `## Definition of Done\n\n### Lifecycle (verified at Review)\n\n- [ ] Final Review Passed\n${AGENT_REVIEW_PASSED}\n`;
  const firstCalls = [];
  const retryCalls = [];
  try {
    const first = await runApprove({
      issueNumber: 1133,
      cfg: { repo: 'o/r' },
      projectDir,
      deps: approveDeps({ initialBody: baseBody, reconciliations: firstCalls }),
    });
    const retry = await runApprove({
      issueNumber: 1134,
      cfg: { repo: 'o/r' },
      projectDir,
      deps: approveDeps({
        initialBody: `${baseBody.replace('- [ ] Final Review Passed', '- [x] Final Review Passed')}\n${APPROVAL_MARKER}\n`,
        reconciliations: retryCalls,
      }),
    });
    assert.equal(first.status, 'approved');
    assert.equal(retry.status, 'already-approved');
    assert.equal(firstCalls.length, 1);
    assert.equal(retryCalls.length, 1);
    assert.equal(firstCalls[0].issueBody.includes('aitm-review-approved'), true);
    assert.equal(retryCalls[0].issueBody.includes(APPROVAL_MARKER), true);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

// @story #1161
test('runApprove refreshes stale Full-Auto approval carriers after lifecycle invalidation', async () => {
  const projectDir = mkdtempSync(`${projectScratchDir('test')}/aitm-1161-`);
  const staleMarker = `<!-- aitm-review-approved ts="${STALE_APPROVED}" full-auto="yes" signals="env=1" -->`;
  const staleFootnote = [
    '<!-- aitm-full-auto-footnote:start -->',
    '> Full-Auto mode enabled.',
    `> Approval was stamped at ${STALE_APPROVED}.`,
    '<!-- aitm-full-auto-footnote:end -->',
  ].join('\n');
  const body = [
    '## Definition of Done',
    '',
    '### Lifecycle (verified at Review)',
    '',
    '- [ ] Final Review Passed',
    AGENT_REVIEW_PASSED,
    '',
    staleFootnote,
    '',
    staleMarker,
    '',
  ].join('\n');
  const reconciliations = [];
  try {
    const result = await runApprove({
      issueNumber: 1161,
      cfg: { repo: 'o/r' },
      projectDir,
      deps: approveDeps({ initialBody: body, reconciliations }),
    });

    assert.equal(result.status, 'approved');
    assert.equal(reconciliations.length, 1);
    const refreshed = reconciliations[0].issueBody;
    assert.match(refreshed, /- \[x\] Final Review Passed/);
    assert.match(
      refreshed,
      new RegExp(`<!-- aitm-review-approved ts="${APPROVED}" full-auto="yes" signals="env=1" -->`)
    );
    assert.doesNotMatch(refreshed, new RegExp(STALE_APPROVED));
    assert.equal((refreshed.match(/aitm-review-approved/g) || []).length, 2);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

// @story #1172
test('runApprove removes a legacy unbounded Full-Auto footnote during stale re-approval', async () => {
  const projectDir = mkdtempSync(`${projectScratchDir('test')}/aitm-1172-`);
  const staleMarker = `<!-- aitm-review-approved ts="${STALE_APPROVED}" full-auto="yes" signals="env=1" -->`;
  const staleLegacyFootnote = [
    '> ⚙️ **Full-Auto mode enabled: human review skipped.**',
    `> Approval was stamped by an autonomous agent (\`env=1\`) at ${STALE_APPROVED}.`,
    '> Hidden marker: `aitm-review-approved full-auto="yes"`.',
  ].join('\n');
  const body = [
    '## Definition of Done',
    '',
    '### Lifecycle (verified at Review)',
    '',
    '- [ ] Final Review Passed',
    AGENT_REVIEW_PASSED,
    '',
    staleLegacyFootnote,
    '',
    staleMarker,
    '',
  ].join('\n');
  const reconciliations = [];
  try {
    const result = await runApprove({
      issueNumber: 1172,
      cfg: { repo: 'o/r' },
      projectDir,
      deps: approveDeps({ initialBody: body, reconciliations }),
    });

    assert.equal(result.status, 'approved');
    const refreshed = reconciliations[0].issueBody;
    assert.doesNotMatch(refreshed, new RegExp(STALE_APPROVED));
    assert.equal(
      (refreshed.match(/Full-Auto mode enabled: human review skipped/g) || []).length,
      1
    );
    assert.equal((refreshed.match(/aitm-full-auto-footnote:start/g) || []).length, 1);
    assert.equal((refreshed.match(/aitm-review-approved ts=/g) || []).length, 1);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
