// @story #925
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { verbClose } from '../../../verbs/close.mjs';

async function runOfflineOrdinaryClose({ gateReviewToDone, reviewer }) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-close-authority-'));
  const statePath = join(dir, 'state.json');
  const configDir = join(dir, '.ai-task-manager');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    statePath,
    JSON.stringify({
      active: '#925',
      lastActive: '#925',
      entryStartTs: new Date(Date.now() - 60_000).toISOString(),
      wordsAtEntryStart: 0,
      lastWordMarker: 0,
    })
  );
  writeFileSync(join(configDir, 'task-tracker.json'), JSON.stringify({ gateReviewToDone }));

  const previousProjectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  const previousReviewer = process.env.TASK_TRACKER_HUMAN_REVIEWER;
  const previousDirty = process.env.TT_SKIP_DIRTY_CHECK;
  process.env.AI_TASK_MANAGER_PROJECT_DIR = dir;
  process.env.TT_SKIP_DIRTY_CHECK = '1';
  if (reviewer === undefined) delete process.env.TASK_TRACKER_HUMAN_REVIEWER;
  else process.env.TASK_TRACKER_HUMAN_REVIEWER = reviewer;

  const moves = [];
  try {
    await verbClose({
      cfg: { repo: 'o/r' },
      statePath,
      projectDir: dir,
      rest: ['#925'],
      SKIP_NETWORK: true,
      closeBody: '<!-- aitm-review-approved ts="2026-07-29T00:00:00Z" -->',
      pexec: async () => ({ stdout: '{}', stderr: '' }),
      drainQueueIfAny: async () => {},
      flushAndForgetQueueFor: async () => ({ delivered: 0, discarded: 0 }),
      safePostTiming: async () => ({ ok: true }),
      runMoveState: async () => ({ ok: true, benign: false }),
      runMoveStateDone: async (_target, options) => {
        moves.push(options);
        return { ok: true, benign: false };
      },
      writeTerminalDisposition: async () => ({ status: 'ok' }),
      runLogIssueTime: async () => {},
      fetchSubIssues: async () => [],
      getIssueBoardState: async () => 'review',
      getIssueClosedState: async () => false,
      uncheckedPreCloseCheckboxes: () => [],
      tickLifecycleOnClose: async () => ({ ok: true }),
      nowIso: () => new Date().toISOString(),
    });
    return moves;
  } finally {
    if (previousProjectDir === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
    else process.env.AI_TASK_MANAGER_PROJECT_DIR = previousProjectDir;
    if (previousReviewer === undefined) delete process.env.TASK_TRACKER_HUMAN_REVIEWER;
    else process.env.TASK_TRACKER_HUMAN_REVIEWER = previousReviewer;
    if (previousDirty === undefined) delete process.env.TT_SKIP_DIRTY_CHECK;
    else process.env.TT_SKIP_DIRTY_CHECK = previousDirty;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('gate-bypassed ordinary close ignores reviewer env and passes explicit authority', async () => {
  const moves = await runOfflineOrdinaryClose({
    gateReviewToDone: false,
    reviewer: 'alice',
  });

  assert.equal(moves.length, 1);
  assert.equal(moves[0].reviewAuthority, 'gate-bypassed');
});

test('human-gate ordinary close without reviewer env passes explicit authority', async () => {
  const moves = await runOfflineOrdinaryClose({
    gateReviewToDone: true,
    reviewer: undefined,
  });

  assert.equal(moves.length, 1);
  assert.equal(moves[0].reviewAuthority, 'human-gate');
});
