// @story #925
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  readUnauthorizedCloseRecovery,
  upsertUnauthorizedCloseRecovery,
} from '../../../lib/closed-issue-convergence.mjs';
import { closeBody, runClose } from './close-convergence-wiring-helpers.mjs';
import {
  ensureCloseEstimationOutcome,
  resolveEstimationOutcomeProjectDir,
} from '../../../verbs/close.mjs';

test('close asks the outcome runtime about forecast-free epics and permits a legacy skip', async () => {
  const calls = [];
  const epic = await ensureCloseEstimationOutcome({
    issueNumber: 1067,
    body: 'epic body without a forecast marker',
    writer: {
      ensure: async (input) => {
        calls.push(input);
        return { status: 'written', recordId: '01J00000000000000000000999' };
      },
    },
  });
  assert.equal(epic.status, 'written');
  assert.equal(calls[0].forecastRecordId, null);

  const legacy = await ensureCloseEstimationOutcome({
    issueNumber: 7,
    body: 'legacy story',
    writer: { ensure: async () => ({ status: 'legacy-no-forecast' }) },
  });
  assert.equal(legacy.status, 'legacy-no-forecast');
});

test('close uses the frozen Plan forecast and refuses a drifted ready marker', async () => {
  const frozen = '01J00000000000000000000941';
  const drifted = '01J00000000000000000000942';
  const body = [
    `<!-- aitm-plan-approved ts="2026-08-02T14:00:00.000Z" forecast-record-id="${frozen}" -->`,
    `<!-- aitm-estimation-forecast-ready record-id="${drifted}" -->`,
  ].join('\n');
  await assert.rejects(
    ensureCloseEstimationOutcome({
      issueNumber: 1091,
      body,
      writer: { ensure: async () => ({ status: 'written' }) },
    }),
    /forecast.*lineage/i
  );
});

test('primary convergence resolves the issue worktree instead of inheriting the caller directory', () => {
  const resolved = resolveEstimationOutcomeProjectDir({
    issueNumber: 1091,
    closeIssueNum: 1091,
    projectDir: '/repo',
    issueWorkspaceResolver: ({ issueRef }) => `/repo/.worktrees/${issueRef.slice(1)}`,
  });
  assert.equal(resolved, '/repo/.worktrees/1091');
});

test('dead issue returns without body or child reads', async () => {
  const run = await runClose({
    closeSnapshot: { issueClosed: true, stateReason: 'not_planned' },
    bodyReadError: new Error('body must not be read'),
    childSnapshot: { status: 'unknown', error: 'children must not be read' },
  });

  assert.equal(run.result?.action, 'dead');
  assert.equal(run.result?.status, 'untouched');
  assert.equal(run.calls.bodyReads, 0);
  assert.equal(run.calls.childSnapshots, 0);
  assert.equal(run.exitCode, 0);
});

test('completed issue already at Done tolerates a failed best-effort body read', async () => {
  const run = await runClose({
    boardState: 'done',
    bodyReadError: new Error('transient body outage'),
  });

  assert.equal(run.result?.action, 'noop');
  assert.equal(run.result?.status, 'completed');
  assert.equal(run.calls.bodyReads, 1);
  assert.equal(run.calls.childSnapshots, 0);
  assert.equal(run.exitCode, 0);
});

test('pending recovery on a completed issue already at Done resumes before noop', async () => {
  const recovery = {
    tx: 'tx-closed-done-resume',
    phase: 'review',
    stateReason: 'completed',
    unticked: ['Agent Review Passed'],
    actor: 'unknown',
    ts: new Date().toISOString(),
  };
  const run = await runClose({
    boardState: 'done',
    body: upsertUnauthorizedCloseRecovery(closeBody({ agentReview: ' ' }), recovery),
    childSnapshot: { status: 'unknown', error: 'children must not be read' },
  });

  assert.equal(run.result?.action, 'aberration');
  assert.equal(run.result?.status, 'recovered');
  assert.equal(run.result?.durablePhase, 'complete');
  assert.equal(readUnauthorizedCloseRecovery(run.body)?.tx, 'tx-closed-done-resume');
  assert.equal(run.calls.bodyReads, 1);
  assert.equal(run.calls.childSnapshots, 0);
  assert.equal(run.exitCode, 0);
});

test('completed not-Done issue refuses an unknown strict child snapshot', async () => {
  const run = await runClose({
    childSnapshot: { status: 'unknown', error: 'GraphQL unavailable' },
  });

  assert.equal(run.result?.status, 'failed');
  assert.equal(run.result?.failedStep, 'fetchSubIssueBoardSnapshot');
  assert.equal(run.calls.bodyReads, 1);
  assert.equal(run.calls.childSnapshots, 1);
  assert.deepEqual(run.calls.movesToDone, []);
  assert.equal(run.exitCode, 1);
});

test('pending recovery on an open issue resumes from its serialized phase', async () => {
  const recovery = {
    tx: 'tx-open-resume',
    phase: 'review',
    stateReason: 'completed',
    unticked: ['Agent Review Passed'],
    actor: 'unknown',
    ts: new Date().toISOString(),
  };
  const run = await runClose({
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: upsertUnauthorizedCloseRecovery(closeBody({ agentReview: ' ' }), recovery),
  });

  assert.equal(run.result?.action, 'aberration');
  assert.equal(run.result?.status, 'recovered');
  assert.equal(run.result?.durablePhase, 'complete');
  assert.equal(readUnauthorizedCloseRecovery(run.body)?.phase, 'complete');
  assert.equal(run.calls.bodyReads, 1);
  assert.deepEqual(run.calls.movesToReview, []);
  assert.equal(run.calls.timingRows.length, 1);
  assert.match(run.calls.timingRows[0], /tx=tx-open-resume/);
  assert.equal(run.exitCode, 0);
});

test('pending recovery outranks close-issue for an open issue already at Done', async () => {
  const recovery = {
    tx: 'tx-open-done-resume',
    phase: 'review',
    stateReason: 'completed',
    unticked: ['Agent Review Passed'],
    actor: 'unknown',
    ts: new Date().toISOString(),
  };
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: upsertUnauthorizedCloseRecovery(closeBody({ agentReview: ' ' }), recovery),
  });

  assert.equal(run.result?.action, 'aberration');
  assert.equal(run.result?.status, 'recovered');
  assert.equal(readUnauthorizedCloseRecovery(run.body)?.phase, 'complete');
  assert.equal(run.calls.bodyReads, 1);
  assert.equal(run.calls.issueCloses, 0);
  assert.equal(run.exitCode, 0);
});

test('retry after a successful timing post does not duplicate the transaction audit', async () => {
  const recovery = {
    tx: 'tx-timing-already-posted',
    phase: 'review',
    stateReason: 'completed',
    unticked: ['Agent Review Passed'],
    actor: 'unknown',
    ts: new Date().toISOString(),
  };
  const run = await runClose({
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: upsertUnauthorizedCloseRecovery(closeBody({ agentReview: ' ' }), recovery),
    timingBody:
      '| 2026-07-29 20:00:00 -05:00 | unauthorized-close |  |  |  | 0 | tx=tx-timing-already-posted; recovered |',
  });

  assert.equal(run.result?.status, 'recovered');
  assert.equal(readUnauthorizedCloseRecovery(run.body)?.phase, 'complete');
  assert.deepEqual(run.calls.timingRows, []);
  assert.equal(run.exitCode, 0);
});

test('pending recovery on a still-closed issue preserves its durable transaction', async () => {
  const recovery = {
    tx: 'tx-closed-resume',
    phase: 'intent',
    stateReason: 'completed',
    unticked: ['Agent Review Passed'],
    actor: 'unknown',
    ts: new Date().toISOString(),
  };
  const run = await runClose({
    body: upsertUnauthorizedCloseRecovery(closeBody({ agentReview: ' ' }), recovery),
    childSnapshot: { status: 'unknown', error: 'children must not be read' },
  });

  assert.equal(run.result?.action, 'aberration');
  assert.equal(run.result?.status, 'recovered');
  assert.equal(run.result?.durablePhase, 'complete');
  assert.equal(readUnauthorizedCloseRecovery(run.body)?.tx, 'tx-closed-resume');
  assert.equal(run.calls.bodyReads, 1);
  assert.equal(run.calls.childSnapshots, 0);
  assert.equal(run.exitCode, 0);
});

test('complete recovery is not reused when a later close is a new aberration', async () => {
  const priorRecovery = {
    tx: 'tx-prior-complete',
    phase: 'complete',
    stateReason: 'completed',
    unticked: ['Agent Review Passed'],
    actor: 'unknown',
    ts: new Date().toISOString(),
  };
  const run = await runClose({
    body: upsertUnauthorizedCloseRecovery(closeBody({ agentReview: ' ' }), priorRecovery),
  });

  assert.equal(run.result?.action, 'aberration');
  assert.equal(run.result?.status, 'recovered');
  assert.ok(run.calls.mutations > 0);
  assert.notEqual(readUnauthorizedCloseRecovery(run.body)?.tx, 'tx-prior-complete');
  assert.equal(run.exitCode, 0);
});

for (const [name, mutationResult, expected] of [
  [
    'mismatched transaction',
    ({ nextBody }) => {
      const recovery = readUnauthorizedCloseRecovery(nextBody);
      return {
        status: 'ok',
        body: upsertUnauthorizedCloseRecovery(nextBody, {
          ...recovery,
          tx: 'tx-stale',
        }),
      };
    },
    /recovery marker readback mismatch.*transaction/,
  ],
  [
    'mismatched phase',
    ({ nextBody }) => {
      const recovery = readUnauthorizedCloseRecovery(nextBody);
      return {
        status: 'ok',
        body: upsertUnauthorizedCloseRecovery(nextBody, {
          ...recovery,
          phase: 'reopened',
        }),
      };
    },
    /recovery marker readback mismatch.*phase/,
  ],
  [
    'failed status',
    ({ nextBody }) => ({ status: 'failed', body: nextBody }),
    /recovery marker mutation failed/,
  ],
  [
    'failed result',
    ({ nextBody }) => ({ ok: false, status: 'ok', body: nextBody }),
    /recovery marker mutation failed/,
  ],
]) {
  test(`${name} recovery mutation refuses before later effects`, async () => {
    const run = await runClose({
      body: closeBody({ agentReview: ' ' }),
      mutationResult,
    });

    assert.equal(run.result?.status, 'failed');
    assert.equal(run.result?.failedStep, 'writeRecoveryPhase:intent');
    assert.match(run.result?.error, expected);
    assert.equal(run.calls.reopens, 0);
    assert.deepEqual(run.calls.movesToReview, []);
    assert.deepEqual(run.calls.timingRows, []);
    assert.equal(run.exitCode, 1);
  });
}

test('recovery persistence requires the grouped issue-body mutator capability', async () => {
  const run = await runClose({
    body: closeBody({ agentReview: ' ' }),
    omitIssueBodyMutator: true,
  });

  assert.equal(run.result?.status, 'failed');
  assert.equal(run.result?.failedStep, 'writeRecoveryPhase:intent');
  assert.match(run.result?.error, /issueBodyMutator\.mutate capability is required/);
  assert.equal(run.calls.reopens, 0);
});

test('explicit close has no direct issue-body mutator import or fallback', () => {
  const source = readFileSync(new URL('../../../verbs/close.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /import\s+\{\s*mutateIssueBody\s*\}/);
  assert.doesNotMatch(source, /ctx\.issueBodyMutator\s*\?\?/);
});

test('v1 estimation outcome is required before the terminal Done move', () => {
  const source = readFileSync(new URL('../../../verbs/close.mjs', import.meta.url), 'utf8');
  const outcome = source.indexOf('ensureCloseEstimationOutcome({');
  const terminalMove = source.indexOf('if (!force && !SKIP_NETWORK && closeIssueNum) {', outcome);
  assert.ok(outcome > 0, 'close must invoke the estimation outcome writer');
  assert.ok(terminalMove > outcome, 'outcome must be durable before the non-force Done move');
});

test('fallible merge preparation precedes the outcome; Done precedes Delivered disposition', () => {
  const source = readFileSync(new URL('../../../verbs/close.mjs', import.meta.url), 'utf8');
  const merge = source.indexOf(
    'enableFullAutoMergeForClose({',
    source.indexOf('await emitReviewToDoneClosePair')
  );
  const outcome = source.indexOf('ensureCloseEstimationOutcome({', merge);
  const terminalMove = source.indexOf('if (!force && !SKIP_NETWORK && closeIssueNum) {', outcome);
  const delivered = source.indexOf('writeDeliveredOrRefuse({', terminalMove);
  assert.ok(merge > 0 && outcome > merge, 'merge preparation must finish before outcome');
  assert.ok(terminalMove > outcome, 'outcome must be durable before Done');
  assert.ok(delivered > terminalMove, 'Delivered must be written only after Done');
});

test('convergence close synchronizes terminal timing before freezing its outcome', () => {
  const source = readFileSync(new URL('../../../verbs/close.mjs', import.meta.url), 'utf8');
  const closeIssue = source.indexOf("if (decision.action === 'close-issue') {");
  const closeIssueEnd = source.indexOf(
    "if (['dead', 'finalize', 'aberration', 'noop']",
    closeIssue
  );
  const closeIssueBranch = source.slice(closeIssue, closeIssueEnd);
  assert.ok(
    closeIssueBranch.indexOf('emitReviewToDoneClosePair') <
      closeIssueBranch.indexOf('ensureConvergenceOutcome'),
    'board-Done convergence must emit the close pair before its outcome'
  );

  const convergence = source.indexOf('runClosedIssueConvergence(');
  const convergenceCall = source.slice(
    convergence,
    source.indexOf('if (convergence.status', convergence)
  );
  assert.match(convergenceCall, /ensureOutcome:\s*async/);
});

test('convergence refuses completion when a terminal timing row is only queued', async () => {
  const run = await runClose({ timingResult: { ok: false, queued: true, err: 'network down' } });

  assert.equal(run.result?.status, 'failed');
  assert.equal(run.result?.failedStep, 'emitClosePair');
  assert.equal(run.calls.mutations, 0);
  assert.equal(run.exitCode, 1);
});

test('board-Done open-issue convergence refuses GitHub close when terminal timing is queued', async () => {
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: false, stateReason: null },
    timingResult: { ok: false, queued: true, err: 'network down' },
  });

  assert.equal(run.result?.status, 'failed');
  assert.equal(run.result?.failedStep, 'emitClosePair');
  assert.equal(run.calls.issueCloses, 0);
  assert.equal(run.exitCode, 1);
});
