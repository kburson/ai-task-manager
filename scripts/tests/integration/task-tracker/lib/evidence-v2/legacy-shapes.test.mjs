// @story #1496
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createSandbox } from '../../../../helpers/evidence-v2/sandbox.mjs';
import {
  legacyFixtures,
  captureProtectedState,
  compareProtectedState,
} from '../../../../helpers/evidence-v2/fixtures.mjs';
import {
  readDeliveredCloseTransactions,
  decideCloseConvergence,
  upsertDeliveredCloseTransaction,
} from '../../../../../task-tracker/lib/close-convergence.mjs';
import {
  createReopenedCloseRecoveryRecord,
  replacementTransaction,
  classifyRecoveryProgress,
  REOPENED_CLOSE_RECOVERY_REASON,
} from '../../../../../task-tracker/lib/reopened-close-recovery.mjs';
import { normalizeIssueCloseSnapshot } from '../../../../../task-tracker/lib/closed-issue-convergence.mjs';
import { findMainWorktreePath } from '../../../../../task-tracker/fleet-registry.mjs';

test('synthetic completed-then-reopened history preserves the known v1 refusal', () => {
  const sandbox = createSandbox();
  try {
    const sha = sandbox.git(['rev-parse', 'HEAD']);
    const fixture = legacyFixtures({ acceptedSha: sha });
    const closeTransactions = readDeliveredCloseTransactions(fixture.completedBody);
    assert.throws(
      () =>
        decideCloseConvergence({
          ...normalizeIssueCloseSnapshot(fixture.reopened),
          boardState: 'review',
          closeTransactions,
          expectedIssueNumber: 1000001,
          expectedAcceptedSha: sha,
          terminalDisposition: 'Delivered',
        }),
      /terminal-state-conflict/
    );
    assert.equal(closeTransactions.length, 1);
    assert.equal(closeTransactions[0].completedSteps.length, 8);
    assert.equal(fixture.oldBinding.sessionId, fixture.newerSameSessionBinding.sessionId);
    assert.notEqual(fixture.oldBinding.generation, fixture.newerSameSessionBinding.generation);
    assert.equal(fixture.provenance.productionEvidenceEligible, false);
  } finally {
    sandbox.dispose();
  }
});

test('Done board effect before checkpoint remains a resumable production-codec prefix', () => {
  const sandbox = createSandbox();
  try {
    const sha = sandbox.git(['rev-parse', 'HEAD']);
    const fixture = legacyFixtures({ acceptedSha: sha });
    const result = decideCloseConvergence({
      issueClosed: false,
      boardState: 'done',
      closeTransactions: readDeliveredCloseTransactions(fixture.boardBeforeCheckpointBody),
      expectedIssueNumber: 1000001,
      expectedAcceptedSha: sha,
      terminalDisposition: '',
    });
    assert.equal(result.action, 'resume-delivered-close');
    assert.ok(result.remainingSteps.includes('board'));
  } finally {
    sandbox.dispose();
  }
});

test('legacy reopened recovery preserves a valid progressed replacement on retry', () => {
  const sandbox = createSandbox();
  try {
    const acceptedSha = sandbox.git(['rev-parse', 'HEAD']);
    sandbox.git(['commit', '--amend', '-qm', 'Synthetic replacement candidate']);
    const newAcceptedSha = sandbox.git(['rev-parse', 'HEAD']);
    const oldTransaction = readDeliveredCloseTransactions(
      legacyFixtures({ acceptedSha }).completedBody
    )[0];
    // Synthetic builder input for historical codec characterization, not a grant
    // of review/delivery authority and never persisted to the production provider.
    const authorization = {
      repository: sandbox.context.repositoryId,
      issueNumber: 1000001,
      oldTransaction,
      newAcceptedSha,
      newReviewAuthority: 'human-gate',
      actor: 'synthetic',
      reason: REOPENED_CLOSE_RECOVERY_REASON,
    };
    const record = createReopenedCloseRecoveryRecord(authorization, {
      now: '2026-01-01T00:00:00.000Z',
    });
    const replacement = replacementTransaction(authorization, record);
    const initial = upsertDeliveredCloseTransaction('', replacement);
    assert.equal(classifyRecoveryProgress(initial, authorization, record).phase, 'body-replaced');
    const progressed = upsertDeliveredCloseTransaction(initial, {
      ...replacement,
      completedSteps: ['timing'],
    });
    const resumed = classifyRecoveryProgress(progressed, authorization, record);
    assert.equal(resumed.phase, 'body-replaced');
    assert.deepEqual(resumed.transaction.completedSteps, ['timing']);
  } finally {
    sandbox.dispose();
  }
});

test('real rewrites share trees while changed input differs and linked authority remains isolated', () => {
  const sandbox = createSandbox();
  const protectedSandbox = createSandbox();
  try {
    const before = captureProtectedState({ paths: [protectedSandbox.root] });
    const initial = sandbox.git(['rev-parse', 'HEAD']);
    const initialTree = sandbox.git(['rev-parse', 'HEAD^{tree}']);
    sandbox.git(['commit', '--amend', '-qm', 'Metadata-only rewrite']);
    assert.notEqual(sandbox.git(['rev-parse', 'HEAD']), initial);
    assert.equal(sandbox.git(['rev-parse', 'HEAD^{tree}']), initialTree);
    sandbox.git(['switch', '-qc', 'feature']);
    writeFileSync(path.join(sandbox.context.sourceRoot, 'feature.txt'), 'feature\n');
    sandbox.git(['add', 'feature.txt']);
    sandbox.git(['commit', '-qm', 'Feature one']);
    writeFileSync(path.join(sandbox.context.sourceRoot, 'second.txt'), 'second\n');
    sandbox.git(['add', 'second.txt']);
    sandbox.git(['commit', '-qm', 'Feature two']);
    const featureTree = sandbox.git(['rev-parse', 'HEAD^{tree}']);
    sandbox.git(['switch', 'trunk']);
    sandbox.git(['merge', '--squash', 'feature']);
    sandbox.git(['commit', '-qm', 'Squashed feature']);
    assert.equal(sandbox.git(['rev-parse', 'HEAD^{tree}']), featureTree);
    sandbox.git(['switch', 'feature']);
    sandbox.git(['rebase', 'trunk']);
    assert.equal(sandbox.git(['rev-parse', 'HEAD^{tree}']), featureTree);
    sandbox.git(['switch', 'trunk']);
    const linked = path.join(sandbox.root, 'linked');
    sandbox.git(['worktree', 'add', '-b', 'linked', linked]);
    assert.equal(findMainWorktreePath(linked), sandbox.context.sourceRoot);
    writeFileSync(path.join(sandbox.context.sourceRoot, 'source.txt'), 'changed\n');
    sandbox.git(['add', 'source.txt']);
    sandbox.git(['commit', '-qm', 'Changed input']);
    assert.notEqual(sandbox.git(['rev-parse', 'HEAD^{tree}']), featureTree);
    assert.equal(
      compareProtectedState(before, captureProtectedState({ paths: [protectedSandbox.root] })),
      'unchanged'
    );
    writeFileSync(path.join(protectedSandbox.root, 'changed-control'), 'detected');
    assert.equal(
      compareProtectedState(before, captureProtectedState({ paths: [protectedSandbox.root] })),
      'changed'
    );
  } finally {
    sandbox.dispose();
    protectedSandbox.dispose();
  }
});

test('pinned imports copy independent objects while preserving the source repository bytes', () => {
  const source = createSandbox();
  let copy;
  try {
    writeFileSync(path.join(source.context.sourceRoot, 'import.txt'), 'pinned snapshot\n');
    source.git(['add', 'import.txt']);
    source.git(['commit', '-qm', 'Pinned source']);
    const commitSha = source.git(['rev-parse', 'HEAD']);
    copy = createSandbox({
      sourceSnapshots: [{ sourceRoot: source.context.sourceRoot, commitSha }],
    });
    assert.equal(copy.git(['show', `${commitSha}:import.txt`]), 'pinned snapshot');
    assert.notEqual(copy.context.gitCommonDir, source.context.gitCommonDir);
    assert.equal(
      compareProtectedState(
        copy.protectedBefore,
        captureProtectedState({ paths: [source.context.sourceRoot] })
      ),
      'unchanged'
    );
    source.dispose();
    assert.equal(copy.git(['show', `${commitSha}:import.txt`]), 'pinned snapshot');
  } finally {
    copy?.dispose();
    source.dispose();
  }
});
