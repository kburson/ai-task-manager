#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/plan-approve.mjs.
//
// Covers:
//   1. Refuses when issue is in `review` (wrong-state — plan-approve cannot approve Review).
//   2. Refuses when issue is in `develop` (wrong-state — only valid from plan).
//   3. First call inserts the marker and returns 'approved' with ts.
//   4. Second call is a no-op ('already-approved'); body is not rewritten.
//   5. Marker is inserted before the fields-block when present.
//   6. Marker is appended at body end when no fields-block.
//   7. hasPlanApprovedMarker / buildPlanApprovedMarker pure helpers.
//   8. CLI help text (verb module) documents /task plan-approve #N.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlanApprove } from '../verbs/plan-approve.mjs';
import { buildPlanApprovedMarker, hasPlanApprovedMarker } from '../lib/markers.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dir, '../../..');

const cfg = { repo: 'o/r' };
const FIXED_TS = '2026-05-16T00:00:00Z';

function makeDeps(overrides = {}) {
  const calls = { writes: [], bodies: [], stateLookups: 0 };
  const initialBody =
    overrides.initialBody ??
    '## Acceptance Criteria\n\n- [x] all\n\n<!-- ai-task-manager:fields:start -->\n```json\n{"schema":1,"values":{"size":"S"}}\n```\n<!-- ai-task-manager:fields:end -->\n';
  let body = initialBody;
  return {
    calls,
    deps: {
      fetchIssueBody: async () => {
        calls.bodies.push(body);
        return body;
      },
      writeIssueBody: async ({ body: b }) => {
        calls.writes.push(b);
        body = b;
      },
      getBoardState: async () => {
        calls.stateLookups++;
        return overrides.state ?? 'plan';
      },
      nowIso: () => FIXED_TS,
      ...overrides.deps,
    },
    getBody: () => body,
  };
}

// 1. wrong-state when in review (plan-approve cannot approve Review)
{
  const { deps, calls } = makeDeps({ state: 'review' });
  const r = await runPlanApprove({ issueNumber: 122, cfg, deps });
  assert.equal(r.status, 'wrong-state');
  assert.match(r.message, /review/);
  assert.match(r.message, /plan-approve only applies to issues in Plan/);
  assert.equal(calls.writes.length, 0);
}

// 2. wrong-state when in develop
{
  const { deps, calls } = makeDeps({ state: 'develop' });
  const r = await runPlanApprove({ issueNumber: 122, cfg, deps });
  assert.equal(r.status, 'wrong-state');
  assert.match(r.message, /develop/);
  assert.equal(calls.writes.length, 0);
}

// 3. first call inserts marker
{
  const { deps, calls, getBody } = makeDeps();
  const r = await runPlanApprove({ issueNumber: 122, cfg, deps });
  assert.equal(r.status, 'approved');
  assert.equal(r.ts, FIXED_TS);
  assert.equal(calls.writes.length, 1);
  assert.match(getBody(), /<!-- aitm-plan-approved: 2026-05-16T00:00:00Z -->/);
}

// 4. second call is idempotent
{
  const { deps, calls } = makeDeps();
  await runPlanApprove({ issueNumber: 122, cfg, deps });
  const r = await runPlanApprove({ issueNumber: 122, cfg, deps });
  assert.equal(r.status, 'already-approved');
  assert.equal(calls.writes.length, 1, 'second call must not rewrite the body');
}

// 5. marker inserted before fields-block when present; legacy block normalized to new encoding
{
  const bodyWithFields =
    '## Scope\n\nSome scope.\n\n<!-- ai-task-manager:fields:start -->\n```json\n{"schema":1,"values":{"size":"S"}}\n```\n<!-- ai-task-manager:fields:end -->\n';
  const { deps, getBody } = makeDeps({ initialBody: bodyWithFields });
  await runPlanApprove({ issueNumber: 122, cfg, deps });
  const result = getBody();
  const markerIdx = result.indexOf('<!-- aitm-plan-approved:');
  const fieldsIdx = result.indexOf('<!-- aitm-fields:');
  assert.ok(markerIdx !== -1, 'plan-approved marker must be present');
  assert.ok(fieldsIdx !== -1, 'normalized aitm-fields marker must be present');
  assert.ok(markerIdx < fieldsIdx, 'marker must appear before fields-block');
  assert.ok(
    !result.includes('<!-- ai-task-manager:fields:start -->'),
    'legacy fields-start marker must not survive a plan-approve write'
  );
}

// 6. marker appended at body end when no fields-block
{
  const bodyNoFields = '## Scope\n\nSome scope.\n';
  const { deps, getBody } = makeDeps({ initialBody: bodyNoFields });
  await runPlanApprove({ issueNumber: 122, cfg, deps });
  const result = getBody();
  assert.match(result, /<!-- aitm-plan-approved: 2026-05-16T00:00:00Z -->/);
}

// 7. pure helpers
{
  const marker = buildPlanApprovedMarker(FIXED_TS);
  assert.equal(marker, `<!-- aitm-plan-approved: ${FIXED_TS} -->`);
  assert.equal(hasPlanApprovedMarker(marker), true);
  assert.equal(hasPlanApprovedMarker('no marker here'), false);
  assert.equal(hasPlanApprovedMarker(''), false);
  assert.equal(hasPlanApprovedMarker(null), false);
}

// 8. verb module documents /task plan-approve #N
{
  const src = readFileSync(
    path.join(root, 'scripts', 'task-tracker', 'verbs', 'plan-approve.mjs'),
    'utf8'
  );
  assert.ok(
    src.includes('/task plan-approve #N'),
    'plan-approve.mjs must document /task plan-approve #N in its help text'
  );
}

console.log('plan-approve.test.mjs: all passed');
