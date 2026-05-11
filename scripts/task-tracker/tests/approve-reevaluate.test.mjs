#!/usr/bin/env node
// Unit: drive `runApprove(...) --answer yes` with deps stubs. Asserts the
// analyze→development hook (#74) performs the re-evaluation that previously
// fired at review time:
//   1. Body fields-block patched with new size + estimate.
//   2. Audit comment posted with header `### 🔁 Analysis re-estimate`.
//   3. ≥2-tier jump posts ⚠ HUMAN ATTENTION comment and skips field mutation.
//   4. TASK_TRACKER_SKIP_REEVAL=1 short-circuits the hook with a bypass comment.

import { strict as assert } from 'node:assert';
import { runApprove } from '../verbs/approve.mjs';
import { applyReevaluate } from '../lib/apply-reevaluate.mjs';

// Body scoring to M: 3 files, 4 steps, 2 risks, 2 deps → score 11.5 → M (8h).
const FIXTURE_BODY_M = `## Acceptance Criteria

- [ ] do the thing

## Deep-Dive Analysis

### Files to edit

- a.mjs — one
- b.mjs — two
- c.mjs — three

### Step-by-step plan

1. Step one.
2. Step two.
3. Step three.
4. Step four.

### Identified risks

- Risk A
- Risk B

## Dependency Map

Depends on: #11, #12

<!-- ai-task-manager:fields:start -->
\`\`\`json
{"schema":1,"values":{"size":"S","estimate":3.5}}
\`\`\`
<!-- ai-task-manager:fields:end -->
`;

// Same body but starting from XS so size delta is XS→M (≥2 tiers).
const FIXTURE_BODY_HUMAN = FIXTURE_BODY_M.replace('"size":"S","estimate":3.5', '"size":"XS","estimate":1.5');

const CFG = {
  repo: 'test/repo',
  projectId: 'PVT_test',
  fieldIds: { size: 'F_size', estimate: 'F_estimate' },
};

function buildDeps(body) {
  const state = { body, comments: [], fieldWrites: [] };
  return {
    state,
    deps: {
      fetchIssueBody: async () => ({ title: 't', body: state.body }),
      writeIssueBody: async ({ body }) => { state.body = body; },
      postComment: async ({ body }) => { state.comments.push(body); },
      moveState: async () => 0,
      isHeadless: () => false,
      fetchParentEpicNumber: async () => null,
      readParentStatus: async () => 'development',
      applyReevaluate: (args) => applyReevaluate({
        ...args,
        deps: {
          postComment: async ({ body }) => { state.comments.push(body); },
          writeIssueBody: async ({ body }) => { state.body = body; },
          loadProjectFieldDefs: () => ([
            { key: 'size', name: 'Size', type: 'single_select' },
            { key: 'estimate', name: 'Estimate', type: 'number' },
          ]),
          projectValuesForIssue: async () => ({}),
          projectItemForIssue: async () => ({ itemId: 'PVTI_test' }),
          writeProjectFieldValue: async (w) => { state.fieldWrites.push(w); },
          fieldOptionMap: async () => ({ M: 'O_m', L: 'O_l', XS: 'O_xs', S: 'O_s', XL: 'O_xl' }),
        },
      }),
    },
  };
}

// Test 1: auto-apply path — S → M.
{
  const { state, deps } = buildDeps(FIXTURE_BODY_M);
  const result = await runApprove({ issueNumber: 999, answer: 'yes', cfg: CFG, deps });
  assert.equal(result.status, 'approved');
  assert.match(state.body, /"size":"M"/, 'body fields-block patched to M');
  assert.match(state.body, /"estimate":8/, 'body fields-block patched to estimate 8');
  const audit = state.comments.find(c => c.startsWith('### 🔁 Analysis re-estimate'));
  assert.ok(audit, 'expected audit comment with new header');
  assert.match(audit, /\| Size \| S \| M \|/, 'audit table shows S→M');
  assert.ok(!/HUMAN ATTENTION/.test(audit), 'auto-apply must not include human-attention banner');
  assert.equal(state.fieldWrites.length, 2, 'two field writes (size + estimate)');
}

// Test 2: ≥2-tier jump — XS → M is 2 tiers; emits human-attention, skips writes.
{
  const { state, deps } = buildDeps(FIXTURE_BODY_HUMAN);
  const result = await runApprove({ issueNumber: 999, answer: 'yes', cfg: CFG, deps });
  assert.equal(result.status, 'approved');
  const audit = state.comments.find(c => c.includes('HUMAN ATTENTION'));
  assert.ok(audit, 'expected human-attention comment');
  assert.match(audit, /\| Size \| XS \| M \|/, 'audit table shows XS→M');
  assert.equal(state.fieldWrites.length, 0, 'no field writes on human-attention path');
  assert.match(state.body, /"size":"XS"/, 'body unchanged on human-attention path');
}

// Test 3: TASK_TRACKER_SKIP_REEVAL=1 bypass.
{
  process.env.TASK_TRACKER_SKIP_REEVAL = '1';
  const { state, deps } = buildDeps(FIXTURE_BODY_M);
  const result = await runApprove({ issueNumber: 999, answer: 'yes', cfg: CFG, deps });
  delete process.env.TASK_TRACKER_SKIP_REEVAL;
  assert.equal(result.status, 'approved');
  const bypass = state.comments.find(c => /Bypassed via `TASK_TRACKER_SKIP_REEVAL=1`/.test(c));
  assert.ok(bypass, 'expected bypass comment');
  assert.match(state.body, /"size":"S"/, 'body unchanged when reeval skipped');
  assert.equal(state.fieldWrites.length, 0, 'no field writes on bypass');
}

console.log('approve-reevaluate.test.mjs: all passed');
