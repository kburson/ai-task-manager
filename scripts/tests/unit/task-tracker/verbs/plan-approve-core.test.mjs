#!/usr/bin/env node
// @story #122 #1714
// Unit tests for scripts/task-tracker/verbs/plan-approve.mjs.
//
// Covers:
//   1. Refuses when issue is in `develop` (wrong-state — only valid from plan).
//   3. First call inserts the marker and returns 'approved' with ts.
//   4. Second call is a no-op ('already-approved'); body is not rewritten.
//   5. Marker is inserted before the fields-block when present.
//   6. Marker is appended at body end when no fields-block.
//   7. hasPlanApprovedMarker / buildPlanApprovedMarker pure helpers.
//   8. CLI help text (verb module) documents /task plan-approve #N.

import { strict as assert } from 'node:assert';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatPlanApproveOutcome,
  runPlanApprove,
  verbPlanApprove,
} from '../../../../task-tracker/verbs/plan-approve.mjs';
import {
  buildPlanApprovedMarker,
  hasPlanApprovedMarker,
  readPlanApprovedForecastRecordId,
  readPlanApprovedMode,
  parsePlanApprovedMarker,
  upsertPlanApprovedMarker,
} from '../../../../task-tracker/lib/markers.mjs';
import { resolveStoryIntentSource } from '../../../../task-tracker/lib/story-intent-source.mjs';
import {
  renderIssueDirectory,
  createIssueDirectory,
} from '../../../../task-tracker/lib/github-records/issue-directory.mjs';
import { storyApprovalBindingGuard } from '../../../../task-tracker/lib/story-approval-binding-guard.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { createWorkflowExceptionEnvelope } from '../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import {
  buildPlanApprovalAuditComment,
  isCanonicalPlanApprovalAuditComment,
} from '../../../../task-tracker/lib/plan-approval-audit.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const root = path.resolve(__dir, '../../../..');

const cfg = { repo: 'o/r' };
const FIXED_TS = '2026-05-16T00:00:00Z';
const STORY_BODY =
  '## User Story\n\nAs a release operator\nI want to stop partial publication because registry checks can fail\nSo that consumers receive complete releases\n\n## Scope\n\n## Deep-Dive Analysis\n\n### Story Intent\n- **Beneficiary:** release operator\n- **Capability:** stop partial publication\n- **Need:** registry checks can fail\n- **Value or failure prevented:** consumers receive complete releases\n\n';

function makeDeps(overrides = {}) {
  const calls = { writes: [], bodies: [], stateLookups: 0, comments: [], commentReads: 0 };
  const comments = [...(overrides.comments ?? [])];
  const initialBody =
    overrides.initialBody ??
    '## Acceptance Criteria\n\n- [x] all\n\n<!-- ai-task-manager:fields:start -->\n```json\n{"schema":1,"values":{"size":"S"}}\n```\n<!-- ai-task-manager:fields:end -->\n';
  let body =
    overrides.rawBody ?? (overrides.fullBody ? initialBody : `${STORY_BODY}${initialBody}`);
  if (overrides.currentApproval) {
    const prior = parsePlanApprovedMarker(body);
    body = upsertPlanApprovedMarker(body, prior.ts, {
      ...resolveStoryIntentSource({ body, projectDir: root }).binding,
      mode: prior.mode === 'unknown' ? null : prior.mode,
    });
  }
  return {
    calls,
    deps: {
      fetchEpicChildren: async () => [],
      fetchIssueBody: async () => {
        calls.bodies.push(body);
        return body;
      },
      // #295 — verb now writes via mutateIssueBody({mutate}); closure runs on
      // the FRESH base. Old `writeIssueBody({body})` signature retired.
      mutateIssueBody: async ({ mutate, validateFreshBase }) => {
        if (overrides.beforeMutate) body = overrides.beforeMutate(body);
        const before = body;
        const next = mutate(before);
        validateFreshBase?.(before, next);
        if (next === before) return { status: 'no-op', attempts: 1, body };
        calls.writes.push(next);
        body = next;
        return { status: 'ok', attempts: 1, body };
      },
      getBoardState: async () => {
        calls.stateLookups++;
        return overrides.state ?? 'plan';
      },
      resolveTrunkSha: async () => 'a'.repeat(40),
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
      listWorkflowExceptionRecords: async () => overrides.workflowRecords ?? [],
      listIssueBodyHistory: async () => overrides.issueBodyHistory ?? [body],
      ...overrides.deps,
    },
    getBody: () => body,
  };
}

async function captureVerbStdout(issueNumber, deps, extraArgs = []) {
  const write = process.stdout.write;
  const chunks = [];
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    await verbPlanApprove([String(issueNumber), ...extraArgs], cfg, deps);
  } finally {
    process.stdout.write = write;
  }
  return chunks.join('');
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
  assert.equal(r.mode, 'human');
  assert.deepEqual(r.audit, {
    mode: 'human',
    auditPosted: false,
    alreadyPresent: false,
  });
  assert.equal(calls.writes.length, 1);
  assert.equal(parsePlanApprovedMarker(getBody()).mode, 'human');
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
  assert.equal(readPlanApprovedMode(getBody()), 'human');
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

// #1579: linked-plan policy refusal happens before approval or audit writes.
{
  const { deps, calls } = makeDeps({
    env: { TT_FULL_AUTO: '1' },
    deps: {
      validateGovernedPlan: async () => ({
        ok: false,
        status: 'invalid',
        planPath: 'docs/unsafe-plan.md',
        violations: [
          {
            rule: 'governed-plan-raw-issue-body-write',
            line: 7,
            excerpt: 'unsafe body replacement',
          },
        ],
      }),
    },
  });
  const r = await runPlanApprove({ issueNumber: 1579, cfg, projectDir: root, deps });
  assert.equal(r.status, 'governed-plan-policy');
  assert.match(r.message, /governed-plan-raw-issue-body-write/);
  assert.match(r.message, /docs\/unsafe-plan\.md:7/);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.comments.length, 0);
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
  assert.equal(r.status, 'repaired-story-binding');
  assert.equal(readPlanApprovedForecastRecordId(getBody()), fresh);
  assert.equal(readPlanApprovedMode(getBody()), 'human');
}

// A legacy adaptive issue already in Develop can backfill the forecast ID onto
// its existing approval without creating a new approval decision.
{
  const ready = '01J00000000000000000000934';
  const originalTs = '2026-05-01T00:00:00Z';
  const { deps, getBody } = makeDeps({
    state: 'develop',
    initialBody: [
      '<!-- aitm-entered-plan ts="2026-05-01T00:00:00Z" -->',
      `<!-- aitm-plan-approved ts="${originalTs}" -->`,
      `<!-- aitm-estimation-forecast-ready record-id="${ready}" -->`,
    ].join('\n'),
  });
  const r = await runPlanApprove({
    issueNumber: 1091,
    cfg: { ...cfg, estimationRubricIssue: 1091 },
    deps,
  });
  assert.equal(r.status, 'repaired-approval');
  assert.equal(r.ts, originalTs);
  assert.equal(readPlanApprovedForecastRecordId(getBody()), ready);
  assert.equal(readPlanApprovedMode(getBody()), 'unknown');
  assert.match(getBody(), new RegExp(`ts="${originalTs}"`));
}

// @story #1703 #1716 — adaptive late repair must retain reconstructed approval
// provenance together with the story binding while freezing the forecast.
{
  const ready = '01J00000000000000000000935';
  const originalTs = '2026-05-01T00:00:00Z';
  const repairRecordId = '01M2Y000000000000000000002';
  const binding = resolveStoryIntentSource({ body: STORY_BODY, projectDir: root }).binding;
  const { deps, getBody } = makeDeps({
    state: 'develop',
    initialBody: [
      '<!-- aitm-entered-plan ts="2026-05-01T00:00:00Z" -->',
      buildPlanApprovedMarker(originalTs, {
        ...binding,
        mode: 'full-auto',
        repairRecordId,
      }),
      `<!-- aitm-estimation-forecast-ready record-id="${ready}" -->`,
    ].join('\n'),
  });
  const result = await runPlanApprove({
    issueNumber: 1703,
    cfg: { ...cfg, estimationRubricIssue: 1703 },
    deps,
  });
  const approval = parsePlanApprovedMarker(getBody());
  assert.equal(result.status, 'repaired-approval');
  assert.equal(approval.repairRecordId, repairRecordId);
  assert.equal(approval.forecastRecordId, ready);
  for (const [key, value] of Object.entries(binding)) assert.equal(approval[key], value);
}

// 4. second call is idempotent
{
  const { deps, calls } = makeDeps();
  await runPlanApprove({ issueNumber: 122, cfg, deps });
  const r = await runPlanApprove({ issueNumber: 122, cfg, deps });
  assert.equal(r.status, 'already-approved');
  assert.equal(calls.writes.length, 1, 'second call must not rewrite the body');
  assert.equal(r.repairAudit, null, 'an ordinary complete no-op has no repair evidence');
  assert.equal(
    calls.comments.filter((body) => /Story-Binding Repair Audit/.test(body)).length,
    0,
    'an ordinary complete no-op must not fabricate a repair audit'
  );
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
  assert.equal(parsePlanApprovedMarker(result).mode, 'human');
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

// #1109: provenance-bearing markers distinguish both live modes while old
// property/colon markers remain readable and default to unknown.
{
  assert.equal(
    buildPlanApprovedMarker(FIXED_TS, { mode: 'human' }),
    `<!-- aitm-plan-approved ts="${FIXED_TS}" mode="human" -->`
  );
  assert.equal(
    buildPlanApprovedMarker(FIXED_TS, { mode: 'full-auto' }),
    `<!-- aitm-plan-approved ts="${FIXED_TS}" mode="full-auto" -->`
  );
  assert.equal(readPlanApprovedMode(buildPlanApprovedMarker(FIXED_TS, { mode: 'human' })), 'human');
  assert.equal(
    readPlanApprovedMode(buildPlanApprovedMarker(FIXED_TS, { mode: 'full-auto' })),
    'full-auto'
  );
  assert.equal(readPlanApprovedMode(buildPlanApprovedMarker(FIXED_TS)), 'unknown');
  assert.equal(readPlanApprovedMode(`<!-- aitm-plan-approved: ${FIXED_TS} -->`), 'unknown');
}

// #1109 AC3: every successful output names durable provenance and audit
// disposition, including the human branch that previously printed no clue.
{
  assert.match(
    formatPlanApproveOutcome(122, {
      status: 'approved',
      ts: FIXED_TS,
      mode: 'human',
      audit: { mode: 'human', auditPosted: false, alreadyPresent: false },
    }),
    /provenance=human; Full-Auto audit=not-applicable/
  );
  assert.match(
    formatPlanApproveOutcome(122, {
      status: 'approved',
      ts: FIXED_TS,
      mode: 'full-auto',
      audit: { mode: 'full-auto', auditPosted: true, alreadyPresent: false },
    }),
    /provenance=full-auto; Full-Auto audit=posted/
  );

  const human = makeDeps({ env: {} });
  assert.match(
    await captureVerbStdout(122, human.deps),
    /provenance=human; Full-Auto audit=not-applicable/
  );
  const fullAuto = makeDeps({ env: { TT_FULL_AUTO: '1' } });
  assert.match(
    await captureVerbStdout(1021, fullAuto.deps),
    /provenance=full-auto; Full-Auto audit=posted/
  );
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
  assert.equal(r.status, 'repaired-story-binding');
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
  const { deps, calls } = makeDeps({ initialBody: bodyBoth, currentApproval: true });
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
  assert.equal(parsePlanApprovedMarker(out).mode, 'human');
}

// 12. visit-suffix safe: if aitm-entered-plan-2 exists (legitimate re-entry)
//     but bare aitm-entered-plan does not, do NOT backfill a phantom visit-1.
{
  const bodyReentry =
    '## Scope\n\n<!-- aitm-entered-plan-2: 2026-05-10T00:00:00Z -->\n\n<!-- aitm-plan-approved: 2026-05-01T00:00:00Z -->\n';
  const { deps, getBody } = makeDeps({ initialBody: bodyReentry, currentApproval: true });
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
  assert.equal(r.mode, 'full-auto');
  assert.equal(r.audit.auditPosted, true);
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

// #1021/#1714: re-running Full-Auto approval neither rewrites the marker nor
// duplicates the approval audit or fabricates a story-binding repair audit.
{
  const { deps, calls } = makeDeps({ env: { TT_FULL_AUTO: '1' } });
  await runPlanApprove({ issueNumber: 1021, cfg, deps });
  const r = await runPlanApprove({ issueNumber: 1021, cfg, deps });
  assert.equal(r.status, 'already-approved');
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.comments.length, 1);
  assert.equal(calls.comments.filter((b) => /Full-Auto Plan-Approval Audit/.test(b)).length, 1);
  assert.equal(calls.commentReads, 2);
}

// #1109/#1714: durable human provenance wins over a later Full-Auto
// environment; an idempotent run posts neither a false Full-Auto attestation
// nor fabricated repair evidence.
{
  const initialBody =
    '## Scope\n\n<!-- aitm-entered-plan ts="2026-05-01T00:00:00Z" -->\n\n' +
    '<!-- aitm-plan-approved ts="2026-05-01T00:00:00Z" mode="human" -->\n';
  const { deps, calls } = makeDeps({
    initialBody,
    currentApproval: true,
    env: { TT_FULL_AUTO: '1' },
  });
  const r = await runPlanApprove({ issueNumber: 1109, cfg, deps });
  assert.equal(r.status, 'already-approved');
  assert.equal(r.mode, 'human');
  assert.equal(r.audit.mode, 'human');
  assert.equal(calls.comments.length, 0);
}

// #1021: a prior marker with no audit is a repairable partial success, not an
// `already-approved` fast path that permanently skips the required comment.
{
  const initialBody =
    '## Scope\n\n<!-- aitm-entered-plan ts="2026-05-01T00:00:00Z" -->\n\n' +
    '<!-- aitm-plan-approved ts="2026-05-01T00:00:00Z" -->\n';
  const { deps, calls } = makeDeps({
    initialBody,
    currentApproval: true,
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
      `${buildPlanApprovedMarker(concurrentTs, { ...resolveStoryIntentSource({ body, projectDir: root }).binding, mode: 'full-auto' })}\n`,
  });
  await runPlanApprove({ issueNumber: 1021, cfg, deps });
  assert.equal(calls.comments.length, 1);
  assert.match(calls.comments[0], new RegExp(concurrentTs));
  assert.doesNotMatch(calls.comments[0], new RegExp(FIXED_TS));
}

console.log('plan-approve-core.test.mjs: all passed');

const INTENT_BLOCK = STORY_BODY.slice(STORY_BODY.indexOf('- **Beneficiary:**')).trim();
function planFixture(t) {
  const projectDir = mkdtempSync(
    path.join(projectScratchDir('test', process.cwd()), 'story-approval-')
  );
  t.after(() => rmSync(projectDir, { recursive: true, force: true }));
  const content = `## Story Intent\n${INTENT_BLOCK}\n\n## Implementation\n### Task 3: Publish\n#### Story Intent\n${INTENT_BLOCK}\n`;
  writeFileSync(path.join(projectDir, 'plan.md'), content);
  writeFileSync(path.join(projectDir, 'other.md'), content);
  return { projectDir, content };
}
for (const task of [false, true])
  test(`approval persists ${task ? 'task' : 'root'} linked intent and revalidates each observation once`, async (t) => {
    const { projectDir } = planFixture(t);
    let reads = 0;
    const { deps, getBody } = makeDeps({
      initialBody: `## Plan Metadata\n- **Source-plan**: plan.md\n${task ? '- **Source-plan-section**: ### Task 3: Publish\n' : ''}`,
      deps: {
        governedPlanPolicy: {
          readFile: (file) => {
            reads++;
            return readFileSync(file, 'utf8');
          },
        },
      },
    });
    const result = await runPlanApprove({ issueNumber: 1711, cfg, projectDir, deps });
    assert.equal(result.status, 'approved');
    assert.equal(reads, 3);
    assert.equal(
      parsePlanApprovedMarker(getBody()).storyIntentSource,
      task ? 'linked-plan-task' : 'linked-plan'
    );
    assert.equal(
      (
        await storyApprovalBindingGuard.run({
          issueNumber: 1711,
          toState: 'develop',
          body: getBody(),
          projectDir,
          deps: { resolveStoryIntent: resolveStoryIntentSource },
        })
      ).ok,
      true
    );
  });
for (const race of ['path', 'selector', 'duplicate', 'file', 'key'])
  test(`approval refuses fresh ${race} changes with zero writes`, async (t) => {
    const { projectDir, content } = planFixture(t);
    const { deps, calls } = makeDeps({
      initialBody:
        '## Plan Metadata\n- **Source-plan**: plan.md\n- **Source-plan-section**: ### Task 3: Publish\n',
      beforeMutate: (body) => {
        if (race === 'path')
          return body.replace('**Source-plan**: plan.md', '**Source-plan**: other.md');
        if (race === 'selector') return body.replace('### Task 3: Publish', '### Task 9: Missing');
        if (race === 'duplicate') return body + '- **Source-plan-section**: ### Task 3: Publish\n';
        if (race === 'key') return body.replace('**Source-plan**:', '**Implementation-plan**:');
        writeFileSync(path.join(projectDir, 'plan.md'), content + '\nchanged plan bytes\n');
        return body;
      },
    });
    await assert.rejects(
      () => runPlanApprove({ issueNumber: 1711, cfg, projectDir, deps }),
      /story-approval-binding-changed/
    );
    assert.equal(calls.writes.length, 0);
    assert.equal(calls.comments.length, 0);
  });
const DIRECTORY = renderIssueDirectory(
  createIssueDirectory({
    issueNodeId: 'I_1711',
    singletons: {
      'delivery-contract': 'C_contract',
      coordination: 'C_coord',
      'evidence-projection': 'C_evidence',
      timing: 'C_timing',
    },
  })
);
for (const kind of ['missing', 'invalid', 'transport', 'syntax'])
  test(`directory ${kind} inspection fails without mutation`, async () => {
    let inspected = 0;
    const { deps, calls } = makeDeps({
      initialBody: kind === 'syntax' ? '<!-- aitm-directory invalid -->' : DIRECTORY,
      deps: {
        contractWrite: {
          readContractRecord: async () => {
            inspected++;
            if (kind === 'transport') throw new Error('offline');
            return kind === 'missing' ? undefined : { envelope: { payload: {} } };
          },
        },
      },
    });
    const result = await runPlanApprove({ issueNumber: 1711, cfg, deps });
    assert.equal(result.status, 'story-approval-binding-unsupported');
    assert.equal(result.reason, 'directory-inspection-failed');
    assert.equal(inspected, kind === 'syntax' ? 0 : 1);
    assert.equal(calls.writes.length, 0);
    assert.equal(calls.comments.length, 0);
  });
for (const fresh of [DIRECTORY, '<!-- aitm-directory invalid -->'])
  test('directory introduced in fresh transaction is refused without a write', async () => {
    const { deps, calls } = makeDeps({ beforeMutate: (body) => `${body}\n${fresh}` });
    await assert.rejects(
      () => runPlanApprove({ issueNumber: 1711, cfg, deps }),
      /story-approval-binding-unsupported: directory-inspection-failed/
    );
    assert.equal(calls.writes.length, 0);
    assert.equal(calls.comments.length, 0);
  });
test('failed repair audit retains prior payload and exact retry repairs once', async () => {
  const comments = [];
  let fail = true;
  const { deps, getBody, calls } = makeDeps({
    initialBody: '## Scope\n<!-- aitm-plan-approved ts="2026-01-01T00:00:00Z" mode="human" -->',
    deps: {
      listComments: async () => comments,
      postComment: async ({ body }) => {
        if (fail) throw new Error('audit offline');
        comments.push({ body });
      },
    },
  });
  let payload;
  await assert.rejects(
    () => runPlanApprove({ issueNumber: 1711, cfg, deps }),
    (error) => {
      payload = error.storyBindingRepair;
      return error.message === 'audit offline';
    }
  );
  assert.equal(payload.previousApproval.ts, '2026-01-01T00:00:00Z');
  assert.equal(parsePlanApprovedMarker(getBody()).storyIntentSource, 'deep-dive');
  fail = false;
  const result = await runPlanApprove({
    issueNumber: 1711,
    cfg,
    deps: { ...deps, previousApproval: payload.previousApproval },
  });
  assert.equal(result.status, 'already-approved');
  await runPlanApprove({ issueNumber: 1711, cfg, deps });
  assert.equal(comments.length, 1);
  assert.match(comments[0].body, /2026-01-01T00:00:00Z/);
  assert.equal(calls.writes.length, 1);
});

for (const race of ['story', 'directory'])
  test(`real versioned writer refuses ${race} authority drift before a retry push`, async () => {
    const initial = `${STORY_BODY}## Notes\nKeep this section.\n`;
    const changed =
      race === 'story'
        ? initial.replace('As a release operator', 'As a deployment reviewer')
        : `${DIRECTORY}\n${initial}`;
    let remote = initial;
    const pushes = [];
    const { deps, calls } = makeDeps({
      deps: {
        fetchIssueBody: async () => remote,
        mutateIssueBody: (args) =>
          mutateIssueBody({
            ...args,
            deps: {
              fetchBody: async () => remote,
              pushBody: async (_repo, _issue, next) => {
                pushes.push(next);
                // The first push loses to an independent non-overlapping edit.
                remote = pushes.length === 1 ? changed : next;
              },
            },
          }),
      },
    });
    let failure;
    try {
      await runPlanApprove({ issueNumber: 1711, cfg, projectDir: root, deps });
    } catch (error) {
      failure = error;
    }
    assert.equal(pushes.length, 1, 'no stale approval may be pushed on the changed retry base');
    assert.match(
      failure?.message ?? '',
      race === 'story' ? /story-approval-binding-changed/ : /story-approval-binding-unsupported/
    );
    assert.equal(remote, changed);
    assert.equal(hasPlanApprovedMarker(remote), false);
    assert.equal(calls.comments.length, 0);
  });

test('complete no-op refuses persisted marker or Plan-entry drift before audit', async () => {
  for (const change of [
    (body) => body.replace(/<!-- aitm-entered-plan[^>]*-->/, ''),
    (body) => body.replace('mode="human"', `mode="human" trunk-sha="${'e'.repeat(40)}"`),
  ]) {
    const current = upsertPlanApprovedMarker(
      `${STORY_BODY}\n## Markers\n<!-- aitm-entered-plan ts="${FIXED_TS}" -->`,
      FIXED_TS,
      { ...resolveStoryIntentSource({ body: STORY_BODY, projectDir: root }).binding, mode: 'human' }
    );
    let reads = 0;
    const { deps, calls } = makeDeps({
      deps: { fetchIssueBody: async () => (++reads === 1 ? current : change(current)) },
    });
    const result = await runPlanApprove({ issueNumber: 1711, cfg, deps });
    assert.equal(result.status, 'story-approval-binding-persistence-mismatch');
    assert.equal(calls.comments.length, 0);
  }
});

test('stale complete bindings renew actor and timestamp even in the same clock tick', async () => {
  for (const stale of [
    { storyDigest: 'a'.repeat(64) },
    { storyIntentDigest: 'b'.repeat(64) },
    { storyIntentSource: 'linked-plan' },
  ]) {
    const rawBody = upsertPlanApprovedMarker(
      `${STORY_BODY}\n## Markers\n<!-- aitm-entered-plan ts="${FIXED_TS}" -->`,
      FIXED_TS,
      {
        ...resolveStoryIntentSource({ body: STORY_BODY, projectDir: root }).binding,
        ...stale,
        mode: 'human',
      }
    );
    const { deps, getBody } = makeDeps({ rawBody, env: { TT_FULL_AUTO: '1' } });
    const result = await runPlanApprove({ issueNumber: 1711, cfg, deps });
    assert.equal(result.status, 'repaired-story-binding');
    assert.notEqual(parsePlanApprovedMarker(getBody()).ts, FIXED_TS);
    assert.equal(parsePlanApprovedMarker(getBody()).mode, 'full-auto');
  }
});

test('a failed canonical Full-Auto audit retains the original binding repair payload', async () => {
  const { deps } = makeDeps({
    initialBody: '## Markers\n<!-- aitm-plan-approved ts="2026-01-01T00:00:00Z" mode="human" -->',
    env: { TT_FULL_AUTO: '1' },
    deps: {
      postComment: async () => {
        throw new Error('audit transport');
      },
    },
  });
  await assert.rejects(
    () => runPlanApprove({ issueNumber: 1711, cfg, deps }),
    (error) => {
      assert.equal(error.storyBindingRepair?.previousApproval?.ts, '2026-01-01T00:00:00Z');
      assert.equal(error.storyBindingRepair.approved.mode, 'full-auto');
      return error.message === 'audit transport';
    }
  );
});
