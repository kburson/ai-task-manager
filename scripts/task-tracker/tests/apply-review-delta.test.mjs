#!/usr/bin/env node
// Unit: drive `applyReviewDelta` with deps stubs. Asserts the close-time
// review-delta hook (#75):
//   1. Auto path: estimate=16, actual=22.5 → +40.6% delta comment.
//   2. Missing-actual fallback: '—' cells + read-only footer, no crash.
//   3. TASK_TRACKER_SKIP_DELTA=1 short-circuits with a bypass comment.

import { strict as assert } from 'node:assert';
import { applyReviewDelta } from '../lib/apply-review-delta.mjs';

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

function buildDeps({ estimate = 16, engagedTime = 22.5 } = {}) {
  const state = { comments: [] };
  return {
    state,
    deps: {
      postComment: async ({ body }) => {
        state.comments.push(body);
      },
      loadProjectFieldDefs: () => [
        { key: 'estimate', name: 'Estimate', type: 'number' },
        { key: 'engagedTime', name: 'Actual Hours', type: 'number' },
      ],
      projectValuesForIssue: async () => {
        const out = {};
        if (estimate != null) out.estimate = estimate;
        if (engagedTime != null) out.engagedTime = engagedTime;
        return out;
      },
    },
  };
}

// Test 1: auto path — estimate=16, actual=22.5 → +40.6%.
{
  const { state, deps } = buildDeps();
  const res = await applyReviewDelta({ cfg: CFG, issueNumber: 999, body: FIXTURE_BODY, deps });
  assert.equal(res.status, 'applied');
  assert.equal(state.comments.length, 1);
  const c = state.comments[0];
  assert.ok(c.startsWith('### 📊 Review delta'), 'header present');
  assert.match(c, /\| Hours \| 16 \| 22\.5 \| \+40\.6% \|/, 'row shows +40.6%');
  assert.match(c, /read-only/i, 'read-only footer present');
}

// Test 2: missing-actual — board returns no engagedTime; body provides estimate.
{
  const { state, deps } = buildDeps({ estimate: null, engagedTime: null });
  const res = await applyReviewDelta({ cfg: CFG, issueNumber: 999, body: FIXTURE_BODY, deps });
  assert.equal(res.status, 'applied');
  const c = state.comments[0];
  assert.match(c, /\| Hours \| 16 \| — \| — \|/, 'em-dash cells when actual missing');
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

console.log('apply-review-delta.test.mjs: all passed');
