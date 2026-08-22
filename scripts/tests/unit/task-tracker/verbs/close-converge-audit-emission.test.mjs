// @story #801
// Regression: the close converge/no-op fast-path must STILL emit the terminal
// `review:approved → issue:wrap` audit pair. Before #801, a close that resolved
// through the already-CLOSED-on-GitHub converge branch (GitHub UI / Projects
// auto-close, then `/task close` to converge the board) returned BEFORE the
// pair-emission block the full close pipeline reaches — so the per-issue Timing
// Log lost its closing rows and AI-value accounting under-reported.
//
// The invariant (driving the real `verbClose` seam down the converge/noop path):
//   - approved body  → BOTH `review:approved` and `issue:wrap` are posted;
//   - un-approved body → `review:approved` is WITHHELD (anti-fabrication), but
//     `issue:wrap` (the terminal-close record, not an approval claim) still posts;
//   - a timing body already carrying both halves → NOTHING is re-emitted.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { verbClose } from '../../../../task-tracker/verbs/close.mjs';
import { buildReviewToDoneClosePair } from '../../../../task-tracker/gh-timing-comment.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const APPROVAL_MARKER = '<!-- aitm-review-approved ts="2026-07-13T00:00:00Z" -->';

const baseState = (active = '#5') => ({
  active,
  lastActive: active,
  entryStartTs: new Date(Date.now() - 60_000).toISOString(),
  wordsAtEntryStart: 0,
  lastWordMarker: 0,
});

function tmpState(state) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-801-'));
  const statePath = join(dir, 'state.json');
  writeFileSync(statePath, JSON.stringify(state));
  return { statePath, dir };
}

// Drive the real verbClose down the converge/noop path through grouped
// capabilities. `getIssueClosedState → true` + a Done board makes
// decideCloseConvergence return `{action:'noop'}`. `pexec` answers the
// housekeeping branch's best-effort body read with `issueBody`;
// `ctx.readTimingCommentBody` injects prior timing rows and `safePostTiming`
// captures posted rows.
async function runConverge({ issueBody, timingBody }) {
  const { statePath, dir } = tmpState(baseState());
  const posted = [];
  const ctx = {
    rest: ['#5'],
    projectConfig: {
      cfg: { repo: 'o/r' },
      statePath,
      projectDir: dir,
      SKIP_NETWORK: false,
      pexec: async (_cmd, args = []) => {
        if (args.includes('view') && args.includes('body')) {
          return { stdout: JSON.stringify({ body: issueBody }), stderr: '' };
        }
        return { stdout: '{}', stderr: '' };
      },
      uncheckedPreCloseCheckboxes: () => [],
      nowIso: () => new Date().toISOString(),
    },
    timingRecorder: {
      drainQueueIfAny: async () => {},
      flushAndForgetQueueFor: async () => ({ delivered: 0, discarded: 0 }),
      safePostTiming: async (_target, row) => {
        posted.push(row);
      },
    },
    stateRunner: {
      runMoveState: async () => ({ ok: true, benign: false }),
      runMoveStateDone: async () => ({ ok: true, benign: false }),
      runLogIssueTime: async () => {},
    },
    githubClient: {
      fetchSubIssues: async () => [],
      getIssueBoardState: async () => 'done',
      getIssueClosedState: async () => true,
    },
    readTimingCommentBody: async () => ({ status: 'found', body: timingBody, error: null }),
    tickLifecycleOnClose: async () => ({ ok: true }),
    loadCloseDeliveryBody: async () => issueBody,
    loadCloseDeliveryGateInput: async () => ({
      issueNumber: 5,
      lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
      branch: 'feature/5',
      acceptedSha: 'a'.repeat(40),
      localHeadSha: 'a'.repeat(40),
      pullRequests: [],
      records: null,
    }),
    resolveReviewAuthorization: () => ({ mode: 'human', standing: true, source: 'test' }),
    requireDeliveryReceipt: () => ({ skipped: false, receipt: {} }),
  };
  const prevSkip = process.env.TT_SKIP_DIRTY_CHECK;
  process.env.TT_SKIP_DIRTY_CHECK = '1';
  const realLog = console.log;
  console.log = () => {};
  try {
    await verbClose(ctx);
  } finally {
    console.log = realLog;
    if (prevSkip === undefined) delete process.env.TT_SKIP_DIRTY_CHECK;
    else process.env.TT_SKIP_DIRTY_CHECK = prevSkip;
    rmSync(dir, { recursive: true, force: true });
  }
  return posted;
}

const hasReviewApproved = (rows) => rows.some((r) => /\| review:approved \|/.test(r));
const hasIssueWrap = (rows) => rows.some((r) => /\| issue:wrap \|/.test(r));
const reviewStartedTiming = [
  '## ⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  '| 2026-07-12 23:58:00 +00:00 | review:started |  |  |  | 0 | waiting in review | <!-- row-sec: a=0 i=0 -->',
  '',
].join('\n');

test('Case A — converge with approved body emits BOTH review:approved and issue:wrap (#801 AC1)', async () => {
  const posted = await runConverge({
    issueBody: `## Some issue\n\n${APPROVAL_MARKER}\n`,
    timingBody: reviewStartedTiming,
  });
  assert.ok(hasReviewApproved(posted), 'review:approved row is posted on the converge path');
  assert.ok(hasIssueWrap(posted), 'issue:wrap row is posted on the converge path');
});

test('Case B — converge with no approval marker WITHHOLDS review:approved, still emits issue:wrap (#801 AC2)', async () => {
  const posted = await runConverge({
    issueBody: '## Some issue with no approval marker\n',
    timingBody: '',
  });
  assert.ok(
    !hasReviewApproved(posted),
    'review:approved is withheld when the approval marker never persisted (anti-fabrication)'
  );
  assert.ok(
    hasIssueWrap(posted),
    'issue:wrap still posts — it records the terminal close, not approval'
  );
});

test('Case C — converge is idempotent when the pair already exists (#801 AC3)', async () => {
  // Timing body already carries both halves of the current close window. Build
  // the rows through the real emitter so the table format is byte-identical to
  // what pendingClosePairState parses (a hand-rolled row won't match).
  const [approvedRow, wrapRow] = buildReviewToDoneClosePair({
    ts: new Date().toISOString(),
    activeSec: 0,
    idleSec: 0,
    wordMarker: 0,
  });
  const priorTiming = [
    '## ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    approvedRow,
    wrapRow,
    '',
  ].join('\n');
  const posted = await runConverge({
    issueBody: `## Some issue\n\n${APPROVAL_MARKER}\n`,
    timingBody: priorTiming,
  });
  assert.ok(!hasReviewApproved(posted), 'review:approved is NOT re-emitted when already present');
  assert.ok(!hasIssueWrap(posted), 'issue:wrap is NOT re-emitted when already present');
});

console.log('close-converge-audit-emission.test.mjs: defined');
