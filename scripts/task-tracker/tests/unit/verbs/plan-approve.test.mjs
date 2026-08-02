#!/usr/bin/env node
// @story #122
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
import { runPlanApprove } from '../../../verbs/plan-approve.mjs';
import {
  buildPlanApprovedMarker,
  hasPlanApprovedMarker,
  readPlanApprovedForecastRecordId,
} from '../../../lib/markers.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const root = path.resolve(__dir, '..', '../../..');

const cfg = { repo: 'o/r' };
const FIXED_TS = '2026-05-16T00:00:00Z';

function makeDeps(overrides = {}) {
  const calls = { writes: [], bodies: [], stateLookups: 0, comments: [], commentReads: 0 };
  const comments = [...(overrides.comments ?? [])];
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
      // #295 — verb now writes via mutateIssueBody({mutate}); closure runs on
      // the FRESH base. Old `writeIssueBody({body})` signature retired.
      mutateIssueBody: async ({ mutate }) => {
        if (overrides.beforeMutate) body = overrides.beforeMutate(body);
        const before = body;
        const next = mutate(before);
        if (next === before) return { status: 'no-op', attempts: 1, body };
        calls.writes.push(next);
        body = next;
        return { status: 'ok', attempts: 1, body };
      },
      getBoardState: async () => {
        calls.stateLookups++;
        return overrides.state ?? 'plan';
      },
      nowIso: () => FIXED_TS,
      env: overrides.env ?? {},
      listComments: async () => {
        calls.commentReads++;
        return comments.map((body) => ({ body }));
      },
      postComment: async ({ body: commentBody }) => {
        calls.comments.push(commentBody);
        comments.push(commentBody);
      },
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
  assert.match(getBody(), /<!-- aitm-plan-approved ts="2026-05-16T00:00:00Z" -->/);
}

// Adaptive approval durably binds the frozen forecast record ID.
{
  const recordId = '01J00000000000000000000931';
  const { deps, getBody } = makeDeps({
    initialBody: `## Plan\n\n<!-- aitm-estimation-forecast-ready record-id="${recordId}" -->\n`,
  });
  await runPlanApprove({
    issueNumber: 1091,
    cfg: { ...cfg, estimationRubricIssue: 1091 },
    deps,
  });
  assert.equal(readPlanApprovedForecastRecordId(getBody()), recordId);
  assert.match(getBody(), new RegExp(`forecast-record-id="${recordId}"`));
}

// Adaptive approval refuses until Plan has converged a ready forecast.
{
  const { deps, calls } = makeDeps();
  const r = await runPlanApprove({
    issueNumber: 1091,
    cfg: { ...cfg, estimationRubricIssue: 1091 },
    deps,
  });
  assert.equal(r.status, 'forecast-missing');
  assert.equal(calls.writes.length, 0);
}

// Adaptive approval repairs an incomplete marker and freezes the ready ID from
// the fresh mutation base, not the stale diagnostic read.
{
  const stale = '01J00000000000000000000932';
  const fresh = '01J00000000000000000000933';
  const { deps, getBody } = makeDeps({
    initialBody: [
      '<!-- aitm-entered-plan ts="2026-05-01T00:00:00Z" -->',
      '<!-- aitm-plan-approved ts="2026-05-01T00:00:00Z" -->',
      `<!-- aitm-estimation-forecast-ready record-id="${stale}" -->`,
    ].join('\n'),
    beforeMutate: (body) => body.replace(stale, fresh),
  });
  const r = await runPlanApprove({
    issueNumber: 1091,
    cfg: { ...cfg, estimationRubricIssue: 1091 },
    deps,
  });
  assert.equal(r.status, 'repaired-approval');
  assert.equal(readPlanApprovedForecastRecordId(getBody()), fresh);
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
  const markerIdx = result.indexOf('<!-- aitm-plan-approved');
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
  assert.match(result, /<!-- aitm-plan-approved ts="2026-05-16T00:00:00Z" -->/);
}

// 7. pure helpers
{
  const marker = buildPlanApprovedMarker(FIXED_TS);
  assert.equal(marker, `<!-- aitm-plan-approved ts="${FIXED_TS}" -->`);
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

// 9. re-stamps aitm-entered-plan when approval marker present but entry missing
//    (defense-in-depth against external `gh issue edit --body-file` overwrites
//    that wiped the entry marker; see #217).
{
  const bodyApprovedNoEntry =
    '## Scope\n\nSome scope.\n\n<!-- aitm-plan-approved: 2026-05-01T00:00:00Z -->\n';
  const { deps, calls, getBody } = makeDeps({ initialBody: bodyApprovedNoEntry });
  const r = await runPlanApprove({ issueNumber: 217, cfg, deps });
  assert.equal(r.status, 're-stamped-entry');
  assert.equal(r.ts, FIXED_TS);
  assert.equal(calls.writes.length, 1);
  const out = getBody();
  assert.match(out, /<!-- aitm-entered-plan ts="2026-05-16T00:00:00Z" -->/);
  // approval marker preserved (only one — must not be duplicated).
  const approvalMatches = out.match(/<!-- aitm-plan-approved(?: ts="|:)/g) || [];
  assert.equal(approvalMatches.length, 1, 'approval marker must not be duplicated');
}

// 10. idempotent when both markers already present (true no-op).
{
  const bodyBoth =
    '## Scope\n\n<!-- aitm-entered-plan: 2026-05-01T00:00:00Z -->\n\n<!-- aitm-plan-approved: 2026-05-01T00:00:00Z -->\n';
  const { deps, calls } = makeDeps({ initialBody: bodyBoth });
  const r = await runPlanApprove({ issueNumber: 217, cfg, deps });
  assert.equal(r.status, 'already-approved');
  assert.equal(calls.writes.length, 0, 'no-op must not rewrite body');
}

// 11. first approval on issue with no plan markers stamps BOTH markers.
{
  const bodyEmpty = '## Scope\n\nSome scope.\n';
  const { deps, getBody } = makeDeps({ initialBody: bodyEmpty });
  const r = await runPlanApprove({ issueNumber: 217, cfg, deps });
  assert.equal(r.status, 'approved');
  const out = getBody();
  assert.match(out, /<!-- aitm-entered-plan ts="2026-05-16T00:00:00Z" -->/);
  assert.match(out, /<!-- aitm-plan-approved ts="2026-05-16T00:00:00Z" -->/);
}

// 12. visit-suffix safe: if aitm-entered-plan-2 exists (legitimate re-entry)
//     but bare aitm-entered-plan does not, do NOT backfill a phantom visit-1.
{
  const bodyReentry =
    '## Scope\n\n<!-- aitm-entered-plan-2: 2026-05-10T00:00:00Z -->\n\n<!-- aitm-plan-approved: 2026-05-01T00:00:00Z -->\n';
  const { deps, getBody } = makeDeps({ initialBody: bodyReentry });
  const r = await runPlanApprove({ issueNumber: 217, cfg, deps });
  assert.equal(r.status, 'already-approved');
  const out = getBody();
  // No new entry marker stamped.
  assert.ok(
    !/<!-- aitm-entered-plan: /.test(out),
    'must not backfill bare aitm-entered-plan when -2 already exists'
  );
  assert.match(out, /<!-- aitm-entered-plan-2: 2026-05-10T00:00:00Z -->/);
}

// #1021: an explicitly authorized Full-Auto plan approval posts the canonical
// visible audit with the exact timestamp recorded in the body marker.
{
  const { deps, calls } = makeDeps({ env: { TT_FULL_AUTO: '1' } });
  const r = await runPlanApprove({ issueNumber: 1021, cfg, deps });
  assert.equal(r.status, 'approved');
  assert.equal(calls.comments.length, 1);
  assert.match(calls.comments[0], /^### Full-Auto Plan-Approval Audit — #1021/m);
  assert.match(calls.comments[0], new RegExp(FIXED_TS));
  assert.match(calls.comments[0], /no human reviewer/i);
}

// #1021: absence of reviewer metadata alone is not Full-Auto authorization.
{
  const { deps, calls } = makeDeps({ env: {} });
  await runPlanApprove({ issueNumber: 1021, cfg, deps });
  assert.equal(calls.comments.length, 0);
  assert.equal(calls.commentReads, 0);
}

// #1021: re-running Full-Auto approval neither rewrites the marker nor
// duplicates the audit comment.
{
  const { deps, calls } = makeDeps({ env: { TT_FULL_AUTO: '1' } });
  await runPlanApprove({ issueNumber: 1021, cfg, deps });
  const r = await runPlanApprove({ issueNumber: 1021, cfg, deps });
  assert.equal(r.status, 'already-approved');
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.comments.length, 1);
  assert.equal(calls.commentReads, 2);
}

// #1021: a prior marker with no audit is a repairable partial success, not an
// `already-approved` fast path that permanently skips the required comment.
{
  const initialBody =
    '## Scope\n\n<!-- aitm-entered-plan ts="2026-05-01T00:00:00Z" -->\n\n' +
    '<!-- aitm-plan-approved ts="2026-05-01T00:00:00Z" -->\n';
  const { deps, calls } = makeDeps({
    initialBody,
    env: { TT_FULL_AUTO: '1' },
  });
  const r = await runPlanApprove({ issueNumber: 1021, cfg, deps });
  assert.equal(r.status, 'already-approved');
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.comments.length, 1);
  assert.match(calls.comments[0], /2026-05-01T00:00:00Z/);
}

// #1021 review: a concurrent writer can land an approval marker after the
// diagnostic fetch. The audit must cite the timestamp in the fresh body that
// mutateIssueBody actually preserved, not this invocation's stale timestamp.
{
  const concurrentTs = '2026-01-01T00:00:00Z';
  const { deps, calls } = makeDeps({
    env: { TT_FULL_AUTO: '1' },
    beforeMutate: (body) =>
      `${body}\n<!-- aitm-entered-plan ts="${concurrentTs}" -->\n` +
      `<!-- aitm-plan-approved ts="${concurrentTs}" -->\n`,
  });
  await runPlanApprove({ issueNumber: 1021, cfg, deps });
  assert.equal(calls.comments.length, 1);
  assert.match(calls.comments[0], new RegExp(concurrentTs));
  assert.doesNotMatch(calls.comments[0], new RegExp(FIXED_TS));
}

console.log('plan-approve.test.mjs: all passed');
