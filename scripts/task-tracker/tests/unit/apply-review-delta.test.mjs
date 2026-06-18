#!/usr/bin/env node
// @story #75
// Unit: drive `applyReviewDelta` with deps stubs. Asserts the close-time
// review-delta hook (#75):
//   1. Auto path: estimate=16, actual=22.5 → +40.6% delta comment.
//   2. Missing-actual fallback: '—' cells + read-only footer, no crash.
//   3. TASK_TRACKER_SKIP_DELTA=1 short-circuits with a bypass comment.
//
// Board "actuals" fields are Text duration strings (`DDd HHh MMm SSs`, integer
// seconds) since #398/#399/#243; the stubs feed those strings and assertions
// expect formatDuration-rendered cells.

import { strict as assert } from 'node:assert';
import { applyReviewDelta } from '../../lib/apply-review-delta.mjs';

const CFG = {
  repo: 'test/repo',
  projectId: 'PVT_test',
  fieldIds: { size: 'F_size', estimate: 'F_estimate' },
};

const FIXTURE_BODY = `## ACs

<!-- ai-task-manager:fields:start -->
\`\`\`json
{"schema":1,"values":{"size":"L","estimate":16}}
\`\`\`
<!-- ai-task-manager:fields:end -->
`;

function buildDeps({
  estimate = 16,
  engagedTime = '00d 22h 30m 00s',
  planTime = null,
  fetchedComments = [],
} = {}) {
  const state = { comments: [] };
  return {
    state,
    deps: {
      postComment: async ({ body }) => {
        state.comments.push(body);
      },
      loadProjectFieldDefs: () => [
        { key: 'estimate', name: 'Estimate', type: 'number' },
        { key: 'engagedTime', name: 'Engaged Time', type: 'text' },
        { key: 'planTime', name: 'Plan Time', type: 'text' },
      ],
      projectValuesForIssue: async () => {
        const out = {};
        if (estimate != null) out.estimate = estimate;
        if (engagedTime != null) out.engagedTime = engagedTime;
        if (planTime != null) out.planTime = planTime;
        return out;
      },
      fetchComments: async () => fetchedComments,
    },
  };
}

// Test 1: auto path — estimate=16 hours (57600s), engagedTime board string
// "00d 22h 30m 00s" (=81000s = 22.5h, +40.6% over). Verifies the board duration
// string is parsed to seconds at the boundary (parseDuration), no minutes math.
{
  const { state, deps } = buildDeps({ estimate: 16, engagedTime: '00d 22h 30m 00s' });
  const res = await applyReviewDelta({ cfg: CFG, issueNumber: 999, body: FIXTURE_BODY, deps });
  assert.equal(res.status, 'applied');
  assert.equal(state.comments.length, 1);
  const c = state.comments[0];
  assert.ok(c.startsWith('### 📊 Review delta'), 'header present');
  assert.match(
    c,
    /\| Story effort \| 00d 16h 00m 00s \| 00d 22h 30m 00s \| \+40\.6% \|/,
    'row shows +40.6% in DDd HHh MMm SSs'
  );
  assert.match(c, /read-only/i, 'read-only footer present');
}

// Test 2: missing-actual — board returns no engagedTime; body provides estimate.
{
  const { state, deps } = buildDeps({ estimate: null, engagedTime: null });
  const res = await applyReviewDelta({ cfg: CFG, issueNumber: 999, body: FIXTURE_BODY, deps });
  assert.equal(res.status, 'applied');
  const c = state.comments[0];
  assert.match(
    c,
    /\| Story effort \| 00d 16h 00m 00s \| — \| — \|/,
    'em-dash cells when actual missing'
  );
  assert.match(c, /Actual Session Time.*not set/i, 'fallback note present');
}

// Test 3: TASK_TRACKER_SKIP_DELTA=1 bypass.
{
  process.env.TASK_TRACKER_SKIP_DELTA = '1';
  const { state, deps } = buildDeps();
  const res = await applyReviewDelta({ cfg: CFG, issueNumber: 999, body: FIXTURE_BODY, deps });
  delete process.env.TASK_TRACKER_SKIP_DELTA;
  assert.equal(res.status, 'skipped');
  assert.equal(state.comments.length, 1);
  assert.match(state.comments[0], /Bypassed via `TASK_TRACKER_SKIP_DELTA=1`/);
}

// Test 4 (D1) — drivers present in a `### 📝 Review Notes` comment are
// rendered into the delta comment under a `Drivers:` heading.
{
  const notesBody = [
    '### 📝 Review Notes',
    '',
    '- driver one',
    '- driver two',
    '',
    '<!-- aitm-review-notes-source: auto -->',
  ].join('\n');
  const { state, deps } = buildDeps({
    estimate: 16,
    engagedTime: '00d 22h 30m 00s',
    fetchedComments: [{ body: notesBody, createdAt: '2026-05-17T00:00:00Z' }],
  });
  const res = await applyReviewDelta({ cfg: CFG, issueNumber: 999, body: FIXTURE_BODY, deps });
  assert.equal(res.status, 'applied');
  const c = state.comments[0];
  assert.match(c, /Drivers:/, 'Drivers section present when notes comment exists');
  assert.match(c, /- driver one/, 'driver one rendered');
  assert.match(c, /- driver two/, 'driver two rendered');
}

// Test 5 (D1) — no review-notes comment → no Drivers section.
{
  const { state, deps } = buildDeps({
    estimate: 16,
    engagedTime: '00d 22h 30m 00s',
    fetchedComments: [],
  });
  const res = await applyReviewDelta({ cfg: CFG, issueNumber: 999, body: FIXTURE_BODY, deps });
  assert.equal(res.status, 'applied');
  const c = state.comments[0];
  assert.doesNotMatch(c, /Drivers:/, 'no Drivers section when no notes comment');
}

// Test 6 (#187/#243): planTime present (board string "00d 00h 25m 00s") →
// comment includes a Plan time row rendered via formatDuration.
{
  const { state, deps } = buildDeps({ planTime: '00d 00h 25m 00s' });
  const res = await applyReviewDelta({ cfg: CFG, issueNumber: 999, body: FIXTURE_BODY, deps });
  assert.equal(res.status, 'applied');
  const c = state.comments[0];
  assert.match(
    c,
    /\| Plan time \| — \| 00d 00h 25m 00s \| — \|/,
    'Plan time row present when planTime set'
  );
}

// Test 7 (#187): planTime absent → no Plan time row.
{
  const { state, deps } = buildDeps({ planTime: null });
  const res = await applyReviewDelta({ cfg: CFG, issueNumber: 999, body: FIXTURE_BODY, deps });
  assert.equal(res.status, 'applied');
  const c = state.comments[0];
  assert.ok(!/Plan time/.test(c), 'Plan time row absent when planTime missing');
}

console.log('apply-review-delta.test.mjs: all passed');
