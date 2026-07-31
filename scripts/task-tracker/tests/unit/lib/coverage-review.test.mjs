#!/usr/bin/env node
// @story #622
// cspell:ignore gctx deadbee bbbbbbbbcccc
// Coverage test for verbs/review.mjs — drives every branch of `verbReview`
// (and the pure `buildDeferredReviewRow`) offline. Real I/O is redirected
// through the ctx injection bag (runReviewPreflight, mutateIssueBody,
// deriveAndStampFunctionalDod, runGuards, pexec, plus safePostTiming/
// runMoveState/fetchSubIssues). No gh/git subprocess is spawned — the lone
// exception (validateBody-refusal branch's un-injected postTimingEvent) is
// neutralized with an empty PATH so it ENOENTs into review's best-effort catch.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { buildPlanApprovalAuditComment } from '../../../lib/plan-approval-audit.mjs';
import { stampEntryMarker } from '../../../lib/stage-entry-markers.mjs';
import { verbReview, buildDeferredReviewRow } from '../../../verbs/review.mjs';

function tmpState(state) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-622-'));
  const p = join(dir, 'state.json');
  writeFileSync(p, JSON.stringify(state));
  return { statePath: p, dir };
}

const baseState = (over = {}) => ({
  active: '#777',
  entryStartTs: '2026-06-19T00:00:00.000Z',
  wordsAtEntryStart: 0,
  lastActive: '#777',
  lastWordMarker: 0,
  discoverBucket: null,
  ...over,
});

// The five report comments the V2 required-comments validator (#811) demands
// on any issue reaching Review; the pexec stub returns them for the
// `--json comments` fetch or the inline gate would demote to Develop. The
// ⏱ Timing Log body must also be a legal walk for the V3 timing-log-sequence
// validator (#812): a real header, monotonic timestamps, and balanced
// engage/depart/reengage rows (start → pause → resumed). Non-lifecycle events
// keep it decoupled from the aitm-entered-<stage> marker reconciliation.
// The New Automated Tests comment must also carry ≥1 nested test-name bullet
// under its file bullet for the V4 new-tests-content validator (#813): a bare
// file bullet with no test names is exactly the empty-report shape V4 demotes.
const REQUIRED_COMMENTS_STUB = [
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
  { body: '<!-- aitm-refined-estimate: 777 -->\n\n### Planned Estimate\n\n| Field | Value |' },
  {
    body: buildPlanApprovalAuditComment({
      issueNumber: 777,
      ts: '2026-06-19T00:00:00Z',
    }),
  },
  { body: '### 🔗 Commits\n\n- abc1234 fixture deliverable' },
  { body: '## New Automated Tests\n\n- `foo.test.mjs`\n  - exercises a thing' },
];

function makePexec({ gateBody, rawBody, scanBody, headSha, getLiveBody }) {
  let jq = 0;
  return async (cmd, args = []) => {
    if (cmd === 'git') return { stdout: headSha, stderr: '' };
    // #881 — the gate's fetch asks for `--json body,comments`, which arrives as
    // ONE comma-joined arg. Match on the parsed field list, not on a bare
    // 'comments' element, and reply with every requested field the way `gh` does.
    const jsonFields = Array.isArray(args)
      ? String(args[args.indexOf('--json') + 1] || '').split(',')
      : [];
    if (jsonFields.includes('comments')) {
      const payload = { comments: REQUIRED_COMMENTS_STUB };
      // The post-move snapshot the gate consumes is the post-derive `scanBody`,
      // which is what it received before the fetch was hoisted below the move.
      if (jsonFields.includes('body')) payload.body = getLiveBody();
      return { stdout: JSON.stringify(payload), stderr: '' };
    }
    if (Array.isArray(args) && args.includes('--jq')) {
      jq += 1;
      return { stdout: jq === 1 ? gateBody : getLiveBody(), stderr: '' };
    }
    return { stdout: JSON.stringify({ body: rawBody }), stderr: '' };
  };
}

function makeCtx(opts = {}) {
  const {
    statePath,
    rest = ['#777'],
    preflight = { ok: true, reasons: [] },
    gateBody = '',
    rawBody = '',
    scanBody = '',
    headSha = 'deadbeef1234',
    guardSeq = [{ refusals: [] }, { refusals: [] }],
    moveResults = {},
    subs = [],
    childState = 'review',
  } = opts;
  const calls = {
    post: [],
    move: [],
    guards: [],
    mutate: 0,
    logTime: 0,
    logOptions: [],
    authority: [],
    reverify: 0,
    queue: 0,
    lock: 0,
    sequence: [],
  };
  let gi = 0;
  let liveBody = scanBody || rawBody;
  const ctx = {
    cfg: { repo: 'o/r', projectId: 'PROJ', idleThresholdMinutes: 5 },
    statePath,
    projectDir: '/proj',
    rest,
    SKIP_NETWORK: false,
    pexec: makePexec({ gateBody, rawBody, scanBody, headSha, getLiveBody: () => liveBody }),
    drainQueueIfAny: async () => {
      calls.queue += 1;
    },
    withGovernedEffect: async (options, callback) => {
      calls.authority.push(options);
      calls.sequence.push('root');
      return callback({
        lease: { issueId: '777' },
        leaseContext: { leaseId: 'lease-review' },
        reverify: async () => {
          calls.reverify += 1;
          calls.sequence.push('reverify');
        },
      });
    },
    withIssueLock: async (options, callback) => {
      calls.lock += 1;
      calls.sequence.push('lock');
      assert.deepEqual(options, { issue: '777', verb: 'review', projDir: '/proj' });
      return callback();
    },
    safePostTiming: async (_t, row) => {
      calls.post.push(row);
    },
    flushActiveToGH: async (_s, event, desc) => ({
      row: { event, description: desc },
      deltaMin: 1,
      idleMin: 0,
      deltaWords: 0,
      wordMarker: 0,
    }),
    runMoveState: async (_t, to) => {
      calls.move.push(to);
      if (to === 'review') liveBody = stampEntryMarker(liveBody, to, ctx.nowIso());
      return moveResults[to] || { ok: true };
    },
    runLogIssueTime: async (_target, options) => {
      calls.logTime += 1;
      calls.logOptions.push(options);
    },
    fetchSubIssues: async () => subs,
    getIssueBoardState: async () => childState,
    nowIso: () => new Date().toISOString(), // within buildRow's retroactive window
    runReviewPreflight: async () => preflight,
    mutateIssueBody: async ({ mutate }) => {
      calls.mutate += 1;
      calls.sequence.push('body');
      const next = mutate(liveBody);
      if (next === liveBody) return { status: 'no-op', body: liveBody };
      liveBody = next;
      return { status: 'ok', body: liveBody };
    },
    deriveAndStampFunctionalDod: async () => ({}),
    runGuards: async (_f, _to, gctx) => {
      calls.guards.push(gctx);
      return guardSeq[gi++] || { refusals: [] };
    },
  };
  return { ctx, calls };
}

// Run verbReview, trapping process.exit (thrown to unwind) and muting the
// verb's stderr/console chatter. Returns the captured exit code (null = no exit).
async function runExit(ctx) {
  const origExit = process.exit;
  const origErr = process.stderr.write.bind(process.stderr);
  const ol = console.log;
  const oe = console.error;
  let code = null;
  process.exit = (c) => {
    code = c;
    throw new Error(`__exit__${c}`);
  };
  process.stderr.write = () => true;
  console.log = () => {};
  console.error = () => {};
  try {
    await verbReview(ctx);
  } catch (e) {
    if (!String(e.message).startsWith('__exit__')) throw e;
  } finally {
    process.exit = origExit;
    process.stderr.write = origErr;
    console.log = ol;
    console.error = oe;
  }
  return code;
}

// A V1-well-formed body: all nine canonical sections, in order, each non-empty,
// so the inline Agent Review Gate passes and the success path is reached.
const CLEAN_BODY = [
  '## User Story',
  'As a maintainer, I want a clean, well-formed body.',
  '## Scope',
  'Exercise the review success path.',
  '## Plan Metadata',
  '- **Size:** S',
  '## Pickup Directive',
  '- [x] Deep dive complete',
  '## Deep-Dive Analysis (2026-01-01)',
  'Design prose.',
  '## Acceptance Criteria',
  '- [ ] Acceptance criteria met <!-- aitm-verified vc-list="vc:1" -->',
  '## Verification Commands',
  // #934: an AC verifier must be targeted — a full-lane command (`npm test`,
  // `npm run test:slow`, `npm run test:all`) is now rejected by the AC-floor.
  '- [ ] `node --test acceptance.test.mjs` <!-- id=1 -->',
  '## Definition of Done',
  '- [ ] `npm test` passes',
  '- [ ] Lint clean <!-- aitm-verified cmd="`npm run lint`" exit="0" sha="d" ts="t" -->',
  '- [ ] Acceptance criteria met',
  '- [ ] Issue body checkboxes ticked',
  '#### Lifecycle (auto-ticked at Review/Close)',
  '- [ ] Agent Review Passed',
  '- [ ] Final Review Passed',
  '- [ ] Story closed and moved to Done',
  '- [ ] Timing data flushed to issue',
  '## AITM Progress Markers',
  '<!-- aitm-test-started sha="deadbee" ts="2026-01-01T00:00:00Z" -->',
  '<!-- aitm-dod-verified sha="deadbee" ts="2026-01-01T00:00:00Z" -->',
].join('\n');

test('buildDeferredReviewRow: null spec → null', () => {
  assert.equal(buildDeferredReviewRow(null, 't'), null);
});

test('buildDeferredReviewRow: flush kind → buildFlushRow row', () => {
  const row = buildDeferredReviewRow(
    { kind: 'flush', event: 'update', activeMin: 1, idleMin: 0, deltaWords: 0, wordMarker: 0 },
    new Date().toISOString()
  );
  assert.ok(row && typeof row === 'string');
});

test('buildDeferredReviewRow: row kind → buildRow row', () => {
  const row = buildDeferredReviewRow(
    { kind: 'row', event: 'update', activeSec: 60, idleSec: 0, deltaWords: 0, wordMarker: 0 },
    new Date().toISOString()
  );
  assert.ok(row && typeof row === 'string');
});

test('no target → exit 1', async () => {
  const { statePath, dir } = tmpState(baseState({ active: 'discover' }));
  try {
    const { ctx, calls } = makeCtx({ statePath, rest: [] });
    assert.equal(await runExit(ctx), 1);
    assert.equal(calls.queue, 0, 'queue drain follows successful target resolution');
    assert.equal(calls.lock, 0);
    assert.deepEqual(calls.authority, [], 'missing target opens no review mutation authority');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('preflight refusal → exit 4', async () => {
  const { statePath, dir } = tmpState(baseState());
  try {
    const { ctx, calls } = makeCtx({
      statePath,
      preflight: { ok: false, reasons: ['uncommitted work'] },
    });
    assert.equal(await runExit(ctx), 4);
    assert.deepEqual(calls.authority, [], 'read-only preflight refusal opens no authority');
    assert.equal(calls.lock, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateBody gate refusal → exit 4', async () => {
  const { statePath, dir } = tmpState(baseState());
  const origPath = process.env.PATH;
  const origProj = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  process.env.PATH = '';
  process.env.AI_TASK_MANAGER_PROJECT_DIR = dir;
  try {
    const { ctx, calls } = makeCtx({ statePath, gateBody: '- [x] Dependency Map\n' });
    assert.equal(await runExit(ctx), 4);
    assert.equal(calls.authority.length, 1, 'body-gate refusal audits under review authority');
    assert.equal(calls.lock, 1, 'mutating refusal audit holds the issue lock');
    assert.equal(calls.authority[0].operation, 'review-mutation');
    assert.equal(calls.post.length, 1, 'body-gate refusal records its timing audit');
  } finally {
    process.env.PATH = origPath;
    if (origProj === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
    else process.env.AI_TASK_MANAGER_PROJECT_DIR = origProj;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('non-empty clean gate body passes validateBody (no refusal)', async () => {
  const { statePath, dir } = tmpState(baseState({ active: '#888' }));
  try {
    // hasAgentTiming branch + clean non-empty gate body → exercises the
    // validateBody ok path and the agent-timing pendingReviewRow build.
    const { ctx, calls } = makeCtx({
      statePath,
      rest: ['#777', '--duration-minutes', '30', '--words', '500'],
      gateBody: 'A clean body with no gate triggers\n',
      rawBody: CLEAN_BODY,
      scanBody: CLEAN_BODY,
    });
    assert.equal(await runExit(ctx), null);
    assert.ok(calls.move.includes('review'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dod-verified guard refusal → exit 4 (else timing branch)', async () => {
  const { statePath, dir } = tmpState(baseState({ active: '#888' }));
  try {
    const { ctx, calls } = makeCtx({
      statePath,
      rawBody: '## Definition of Done\n- [ ] x\n',
      guardSeq: [{ refusals: [{ id: 'test-exit-dod-verified' }] }],
    });
    assert.equal(await runExit(ctx), 4);
    assert.deepEqual(calls.authority, [], 'missing DoD proof is a read-only refusal');
    assert.equal(calls.lock, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('persisted Test marker mismatch → exit 4 without consulting ambient HEAD', async () => {
  const { statePath, dir } = tmpState(baseState());
  try {
    const rawBody = [
      '## Definition of Done',
      '- [ ] `npm test` passes',
      '<!-- aitm-test-started sha="aaaaaaaa" ts="t" -->',
      '<!-- aitm-dod-verified sha="bbbbbbbb" ts="t" -->',
    ].join('\n');
    const { ctx, calls } = makeCtx({ statePath, rawBody, headSha: 'bbbbbbbbcccc' });
    assert.equal(await runExit(ctx), 4);
    assert.deepEqual(calls.authority, [], 'Test SHA mismatch is a read-only refusal');
    assert.equal(calls.lock, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unbacked checkbox → failures revert to Develop, exit 3', async () => {
  const { statePath, dir } = tmpState(baseState());
  try {
    const { ctx, calls } = makeCtx({
      statePath,
      rawBody: [
        '## Definition of Done',
        '- [x] Unbacked claim',
        '<!-- aitm-test-started sha="deadbee" ts="2026-01-01T00:00:00Z" -->',
        '<!-- aitm-dod-verified sha="deadbee" ts="2026-01-01T00:00:00Z" -->',
      ].join('\n'),
    });
    assert.equal(await runExit(ctx), 3);
    assert.ok(calls.move.includes('develop'));
    assert.equal(calls.mutate, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('epic child not in review → exit 3', async () => {
  const { statePath, dir } = tmpState(baseState());
  try {
    const { ctx, calls } = makeCtx({
      statePath,
      rawBody: CLEAN_BODY,
      scanBody: CLEAN_BODY,
      subs: [101],
      childState: 'develop',
    });
    assert.equal(await runExit(ctx), 3);
    assert.deepEqual(calls.authority, [], 'epic child readiness is a read-only refusal');
    assert.equal(calls.lock, 0);
    assert.equal(calls.mutate, 0, 'epic refusal does not normalize the issue body');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('completeness guard refusal → exit 4', async () => {
  const { statePath, dir } = tmpState(baseState());
  try {
    const { ctx } = makeCtx({
      statePath,
      rawBody: CLEAN_BODY,
      scanBody: CLEAN_BODY,
      guardSeq: [
        { refusals: [] },
        {
          refusals: [
            {
              id: 'test-exit-pre-close-completeness',
              blockers: [
                'test-to-review-incomplete: - [ ] Foo (the close gate enforces the same set)',
              ],
            },
          ],
        },
      ],
    });
    assert.equal(await runExit(ctx), 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runMoveState refuses the review move → propagates its status', async () => {
  const { statePath, dir } = tmpState(baseState());
  try {
    const { ctx } = makeCtx({
      statePath,
      rawBody: CLEAN_BODY,
      scanBody: CLEAN_BODY,
      moveResults: { review: { ok: false, benign: false, status: 5, stderr: 'boom' } },
    });
    assert.equal(await runExit(ctx), 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('success: all checks pass → moves to Review, prompts approval', async () => {
  const { statePath, dir } = tmpState(baseState());
  try {
    const { ctx, calls } = makeCtx({
      statePath,
      rawBody: CLEAN_BODY,
      scanBody: CLEAN_BODY,
    });
    assert.equal(await runExit(ctx), null);
    assert.ok(calls.move.includes('review'));
    assert.equal(calls.logTime, 1);
    assert.equal(calls.logOptions[0].operation, 'review-mutation');
    assert.equal(typeof calls.logOptions[0].withGovernedEffect, 'function');
    // EPIC #823 timing model v2 (C6 / defect D1): the success path no longer
    // emits the two ad-hoc verb rows (bare `review` + `review-ready`); the
    // canonical `test:passed` + `review:started` pair is written by runMoveState
    // (tracked via calls.move). #904 restores exactly ONE verb-level row — the
    // symmetric `review:passed` the Agent-Review-Gate PASS branch now emits to
    // mirror the FAIL branch's `review:failed` row.
    assert.equal(calls.post.length, 1);
    assert.match(String(calls.post[0]), /review:passed/);
    assert.equal(calls.authority.length, 1, 'review owns one outer lease authority session');
    assert.equal(calls.lock, 1, 'review holds one issue lock around its mutation scope');
    assert.deepEqual(calls.authority[0], {
      issueId: '777',
      operation: 'review-mutation',
      heartbeat: true,
    });
    assert.ok(calls.reverify > 0, 'review reverifies before mutation effects');
    assert.deepEqual(
      calls.sequence.slice(0, 3),
      ['lock', 'root', 'reverify'],
      'issue lock precedes the one review root and its first effect reverify'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('success via else branch (target not the active session)', async () => {
  const { statePath, dir } = tmpState(baseState({ active: '#888' }));
  try {
    const { ctx, calls } = makeCtx({
      statePath,
      rest: ['#777'],
      rawBody: CLEAN_BODY,
      scanBody: CLEAN_BODY,
    });
    assert.equal(await runExit(ctx), null);
    assert.ok(calls.move.includes('review'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('review authority refusal releases the issue lock before any mutation effect', async () => {
  const { statePath, dir } = tmpState(baseState());
  try {
    const { ctx, calls } = makeCtx({
      statePath,
      rawBody: CLEAN_BODY,
      scanBody: CLEAN_BODY,
    });
    const events = [];
    ctx.withIssueLock = async (_options, callback) => {
      events.push('lock');
      try {
        return await callback();
      } finally {
        events.push('release');
      }
    };
    ctx.withGovernedEffect = async () => {
      events.push('root-refused');
      const error = new Error('stale review fence');
      error.code = 'fence-stale';
      throw error;
    };
    await assert.rejects(
      () => runExit(ctx),
      (error) => error.code === 'fence-stale'
    );
    assert.deepEqual(events, ['lock', 'root-refused', 'release']);
    assert.equal(calls.mutate, 0);
    assert.deepEqual(calls.move, []);
    assert.deepEqual(calls.post, []);
    assert.equal(calls.logTime, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('nested review writer refuses a mismatched governed operation', async () => {
  const { statePath, dir } = tmpState(baseState());
  try {
    const { ctx, calls } = makeCtx({
      statePath,
      rawBody: CLEAN_BODY,
      scanBody: CLEAN_BODY,
    });
    let escaped = false;
    ctx.mutateIssueBody = async (options) =>
      options.deps.withGovernedEffect(
        { issueId: '777', operation: 'evidence-mutation' },
        async () => {
          escaped = true;
        }
      );
    await assert.rejects(
      () => runExit(ctx),
      /verb mutation scope continuation does not match issue\/operation/
    );
    assert.equal(escaped, false);
    assert.equal(calls.authority.length, 1);
    assert.deepEqual(calls.move, []);
    assert.deepEqual(calls.post, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
