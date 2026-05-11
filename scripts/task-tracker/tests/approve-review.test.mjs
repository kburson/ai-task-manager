#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/approve-review.mjs.
//
// Covers:
//   1. Refuses when issue is not in `review` (wrong-state).
//   2. First call inserts the marker and returns 'approved' with ts.
//   3. Second call is a no-op ('already-approved'); body is not rewritten.
//   4. Marker is inserted before the fields-block when present.
//   5. Marker is appended at body end when no fields-block.
//   6. hasApprovalMarker / buildMarker pure helpers.

import { strict as assert } from 'node:assert';
import {
  runApproveReview,
  buildMarker,
  hasApprovalMarker,
  insertApprovalMarker,
} from '../verbs/approve-review.mjs';

const cfg = { repo: 'o/r' };
const FIXED_TS = '2026-05-10T00:00:00Z';

function makeDeps(overrides = {}) {
  const calls = { writes: [], bodies: [], stateLookups: 0 };
  const initialBody = overrides.initialBody ?? '## Acceptance Criteria\n\n- [x] all\n\n<!-- ai-task-manager:fields:start -->\n{"size":"S"}\n<!-- ai-task-manager:fields:end -->\n';
  let body = initialBody;
  return {
    calls,
    deps: {
      fetchIssueBody: async () => { calls.bodies.push(body); return body; },
      writeIssueBody: async ({ body: b }) => { calls.writes.push(b); body = b; },
      getBoardState: async () => { calls.stateLookups++; return overrides.state ?? 'review'; },
      nowIso: () => FIXED_TS,
      ...overrides.deps,
    },
    getBody: () => body,
  };
}

// 1. wrong-state when not in review
{
  const { deps, calls } = makeDeps({ state: 'development' });
  const r = await runApproveReview({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'wrong-state');
  assert.match(r.message, /development/);
  assert.equal(calls.writes.length, 0);
}

// 2. first call inserts marker
{
  const { deps, calls, getBody } = makeDeps();
  const r = await runApproveReview({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'approved');
  assert.equal(r.ts, FIXED_TS);
  assert.equal(calls.writes.length, 1);
  assert.match(getBody(), /<!-- aitm-review-approved: 2026-05-10T00:00:00Z -->/);
}

// 3. second call is idempotent
{
  const { deps, calls } = makeDeps();
  await runApproveReview({ issueNumber: 58, cfg, deps });
  const r = await runApproveReview({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'already-approved');
  assert.equal(calls.writes.length, 1, 'second call must not rewrite the body');
}

// 4. marker placed before fields-block
{
  const { deps, getBody } = makeDeps();
  await runApproveReview({ issueNumber: 58, cfg, deps });
  const body = getBody();
  const markerIdx = body.indexOf('<!-- aitm-review-approved:');
  const fieldsIdx = body.indexOf('<!-- ai-task-manager:fields:start -->');
  assert.ok(markerIdx >= 0 && fieldsIdx > markerIdx,
    `marker must appear before fields-block; markerIdx=${markerIdx}, fieldsIdx=${fieldsIdx}`);
}

// 5. marker appended at end when no fields-block
{
  const { deps, getBody } = makeDeps({ initialBody: '## AC\n- [x] x\n' });
  await runApproveReview({ issueNumber: 58, cfg, deps });
  assert.match(getBody(), /<!-- aitm-review-approved: 2026-05-10T00:00:00Z -->\s*$/);
}

// 6. pure helpers
{
  assert.equal(buildMarker(FIXED_TS), `<!-- aitm-review-approved: ${FIXED_TS} -->`);
  assert.equal(hasApprovalMarker(''), false);
  assert.equal(hasApprovalMarker(buildMarker(FIXED_TS)), true);
  assert.equal(hasApprovalMarker('<!--aitm-review-approved:foo-->'), true);
  // insertApprovalMarker is idempotent on already-marked body.
  const already = `body\n${buildMarker(FIXED_TS)}\n`;
  assert.equal(insertApprovalMarker(already, '2099-01-01T00:00:00Z'), already);
}

console.log('approve-review.test.mjs: all passed');
