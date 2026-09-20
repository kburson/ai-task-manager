#!/usr/bin/env node
// @story #122 #1714
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
import {
  renderPlanTransitionAuthorityComment,
  resolvePlanTransitionAuthority,
} from '../../../../task-tracker/lib/plan-transition-authority.mjs';

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
        return comments.map((comment) =>
          typeof comment === 'string' ? { body: comment } : { ...comment }
        );
      },
      fetchAuthenticatedLogin: async () => overrides.authenticatedLogin ?? 'maintainer',
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

// @story #1711 — malformed content must never gain approval or audit evidence.
{
  const rawBody = STORY_BODY.replace('## Scope\n\n', '');
  const { deps, getBody } = makeDeps({ rawBody });
  const result = await runPlanApprove({ issueNumber: 1711, cfg, deps });
  assert.equal(result.status, 'approved');
  assert.equal(
    getBody().slice(0, getBody().indexOf('## Deep-Dive Analysis')),
    rawBody.slice(0, rawBody.indexOf('## Deep-Dive Analysis'))
  );
  assert.doesNotMatch(getBody(), /<details>/);
  assert.equal(resolveStoryIntentSource({ body: getBody(), projectDir: root }).ok, true);
}
for (const rawBody of [
  '## Scope\n',
  STORY_BODY.replace('As a release operator', 'As a governed agent'),
  STORY_BODY.replace('**Need:** registry checks can fail', '**Need:**'),
]) {
  const { deps, calls } = makeDeps({ rawBody, env: { TT_FULL_AUTO: '1' } });
  const result = await runPlanApprove({ issueNumber: 1711, cfg, deps });
  assert.equal(result.status, 'story-approval-binding-invalid');
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.comments.length, 0);
}
for (const entry of ['', '<!-- aitm-entered-plan ts="2026-01-01T00:00:00Z" -->']) {
  const { deps, calls, getBody } = makeDeps({
    initialBody: `## Scope\n${entry}\n<!-- aitm-plan-approved ts="2026-01-01T00:00:00Z" mode="human" -->`,
    env: { TT_FULL_AUTO: '1' },
  });
  const result = await runPlanApprove({ issueNumber: 1711, cfg, deps });
  assert.equal(
    result.status,
    'repaired-story-binding',
    JSON.stringify({
      result,
      resolved: resolveStoryIntentSource({ body: getBody(), projectDir: root }),
      body: getBody(),
    })
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(resolveStoryIntentSource({ body: getBody(), projectDir: root }).binding).map(
        (k) => [k, parsePlanApprovedMarker(getBody())[k]]
      )
    ),
    resolveStoryIntentSource({ body: getBody(), projectDir: root }).binding
  );
  assert.equal(parsePlanApprovedMarker(getBody()).mode, 'full-auto');
  assert.ok(calls.comments.some((b) => /Story-Binding Repair Audit/.test(b)));
}
for (const beforeMutate of [
  (body) => body.replace('As a release operator', 'As a registry operator'),
  (body) => body.replace('**Need:** registry checks can fail', '**Need:** publication can fail'),
]) {
  const { deps, calls } = makeDeps({ beforeMutate });
  await assert.rejects(
    () => runPlanApprove({ issueNumber: 1711, cfg, deps }),
    /story-approval.*changed/
  );
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.comments.length, 0);
}
{
  const { deps, calls } = makeDeps({
    deps: { mutateIssueBody: async () => ({ body: STORY_BODY }) },
  });
  assert.equal(
    (await runPlanApprove({ issueNumber: 1711, cfg, deps })).status,
    'story-approval-binding-persistence-mismatch'
  );
  assert.equal(calls.comments.length, 0);
}
for (const readDirectoryContract of [
  async () => ({ contract: {} }),
  async () => {
    throw new Error('transport '.repeat(100));
  },
]) {
  const { deps, calls } = makeDeps({ deps: { readDirectoryContract } });
  const result = await runPlanApprove({ issueNumber: 1711, cfg, deps });
  assert.equal(result.status, 'story-approval-binding-unsupported');
  assert.ok(result.message.length < 400);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.comments.length, 0);
}

function makeEvidenceRepairFixture(issueNumber = 1716, { includeLegacyProof = true } = {}) {
  const acceptanceLine = includeLegacyProof
    ? '- [x] Repair is evidence-derived. <!-- aitm-verified exit="0" sha="abcdef0" key="repair" vc-list="vc:1" -->'
    : '- [x] Repair is evidence-derived.';
  const initialBody = [
    '## User Story',
    '',
    'As a maintainer I want approved planning provenance so that review can trust the record.',
    '',
    '## Scope',
    '',
    'Repair the missing automated Plan approval from durable evidence.',
    '',
    '## Plan Metadata',
    '',
    '- Implementation authority: Scope and Deep-Dive Analysis.',
    '',
    '## Deep-Dive Analysis (2026-09-19)',
    '',
    'The implementation path and risks were examined before development.',
    '',
    '## Acceptance Criteria',
    '',
    acceptanceLine,
    '',
    '## Plan Adjustment',
    '',
    'Keep this exact adjustment byte-for-byte.',
    '',
    '<!-- aitm-entered-plan ts="2026-09-19T15:20:24.739Z" -->',
    '<!-- aitm-entered-ready-for-plan ts="2026-09-19T15:19:55.540Z" -->',
    '<!-- aitm-entered-develop ts="2026-09-19T15:22:16.645Z" -->',
    '<!-- aitm-deep-dive-complete ts="2026-09-19T15:21:00.000Z" -->',
    '',
  ].join('\n');
  const historicalBody = initialBody.replace(
    acceptanceLine,
    includeLegacyProof
      ? '- [ ] Repair is evidence-derived. <!-- aitm-verified key="repair" vc-list="vc:1" -->'
      : '- [ ] Repair is evidence-derived.'
  );
  const scopeIdentity = computeScopeIdentity({
    repository: cfg.repo,
    issue: issueNumber,
    body: historicalBody,
  });
  const authorization = {
    reference: 'codex://sessions/repair/messages/approval',
    statement: 'Revoke the workflow exception including every waiver.',
    principal: 'github-user:maintainer',
    recordingActor: 'codex/session:repair',
    origin: 'codex-session-transcript',
    verificationLevel: 'host-verified-user-message',
  };
  const first = createWorkflowExceptionEnvelope({
    repository: cfg.repo,
    issue: issueNumber,
    exceptionId: 'historical-plan-waiver',
    revision: 1,
    scopeIdentity,
    requirementIds: ['approval.plan'],
    constraints: [],
    reason: 'The earlier workflow interpretation waived Plan approval.',
    authorization,
    operationId: `sha256:${'1'.repeat(64)}`,
    createdAt: '2026-09-19T15:21:00.000Z',
    recordId: '01M2Y000000000000000000001',
    grantId: '01M2Y000000000000000000091',
  });
  const revoked = createWorkflowExceptionEnvelope({
    repository: cfg.repo,
    issue: issueNumber,
    exceptionId: 'historical-plan-waiver',
    revision: 2,
    status: 'revoked',
    scopeIdentity,
    requirementIds: ['approval.plan'],
    constraints: [],
    reason: 'The prior Plan-approval waiver was revoked.',
    authorization,
    operationId: `sha256:${'2'.repeat(64)}`,
    predecessor: first.recordId,
    supersedes: first.recordId,
    createdAt: '2026-09-19T17:25:45.930Z',
    recordId: '01M2Y000000000000000000002',
    grantId: '01M2Y000000000000000000092',
  });
  const comments = [
    [
      'Timing Log',
      '| Timestamp | Event |',
      '|---|---|',
      '| 2026-09-19 10:20:24 -05:00 | plan:started |',
      '| 2026-09-19 10:22:13 -05:00 | plan:completed |',
      '| 2026-09-19 10:22:13 -05:00 | develop:started |',
    ].join('\n'),
    [
      '<!-- aitm-refined-estimate: 1716 -->',
      '### Planned Estimate',
      '| Field | Refine | Plan | Delta |',
      '|---|---|---|---|',
      '| Size | M | L | M to L |',
      '| Estimate (h) | 4 | 9.5 | +5.5 |',
    ].join('\n'),
  ];
  return {
    fullBody: true,
    initialBody,
    comments,
    workflowRecords: [
      { commentNodeId: 'IC_first', envelope: first },
      { commentNodeId: 'IC_revoked', envelope: revoked },
    ],
    issueBodyHistory: [historicalBody],
    approvalPlanRecordId: first.recordId,
    revokedRecordId: revoked.recordId,
  };
}

function makeModernTransitionAuthorityFixture({
  issueNumber = 61,
  authorityScopeIdentity = null,
  orphan = false,
} = {}) {
  const fixture = makeEvidenceRepairFixture(issueNumber, { includeLegacyProof: false });
  const transitionId = 'move:11111111-1111-4111-8111-111111111111';
  const active = fixture.workflowRecords[0].envelope;
  const scopeIdentity = authorityScopeIdentity ?? active.payload.scopeIdentity;
  fixture.initialBody = fixture.initialBody.replace(
    '<!-- aitm-entered-develop ts="2026-09-19T15:22:16.645Z" -->',
    `<!-- aitm-entered-develop ts="2026-09-19T15:22:16.645Z" move="${transitionId}" -->`
  );
  if (!orphan) {
    fixture.initialBody += `<!-- aitm-move-complete state=develop ts=2026-09-19T15:22:16.645Z move=${transitionId} -->\n`;
  }
  const record = resolvePlanTransitionAuthority({
    repository: cfg.repo,
    issue: issueNumber,
    transitionId,
    body: fixture.issueBodyHistory[0],
    workflowPolicy: {
      scopeIdentity,
      decision(id) {
        assert.equal(id, 'approval.plan');
        return {
          id,
          outcome: 'waived',
          authority: {
            recordId: active.recordId,
            revision: active.payload.revision,
            reference: active.payload.approvalEvidence.reference,
            verificationLevel: active.payload.approvalEvidence.verificationLevel,
          },
        };
      },
    },
    sessionPolicy: { gates: { analysisToDevelopment: true } },
    scopeIdentity,
    recordedAt: '2026-09-19T15:22:13.000Z',
  });
  fixture.comments.push({
    id: 'IC_transition_authority',
    body: renderPlanTransitionAuthorityComment(record),
    authorLogin: 'maintainer',
    createdAt: '2026-09-19T15:22:14.000Z',
    updatedAt: '2026-09-19T15:22:14.000Z',
  });
  return { ...fixture, transitionId, authorityRecord: record };
}

test('completed waived transition auto-converges after prospective exception revocation', async () => {
  const fixture = makeModernTransitionAuthorityFixture();
  const { deps, calls, getBody } = makeDeps({
    state: 'develop',
    env: { TT_FULL_AUTO: '1' },
    ...fixture,
  });

  const result = await runPlanApprove({ issueNumber: 61, cfg, projectDir: root, deps });

  assert.equal(result.status, 'repaired-from-transition-authority', JSON.stringify(result));
  assert.equal(result.historicalOutcome, 'waived');
  assert.equal(result.transitionId, fixture.transitionId);
  assert.equal(result.authorityRecordId, fixture.approvalPlanRecordId);
  assert.equal(result.authorityRevision, 1);
  assert.equal(result.revokedRecordId, fixture.revokedRecordId);
  assert.equal(parsePlanApprovedMarker(getBody()).mode, 'full-auto');
  assert.equal(parsePlanApprovedMarker(getBody()).repairRecordId, fixture.revokedRecordId);
  assert.equal(fixture.authorityRecord.outcome, 'waived');
  assert.match(calls.comments.at(-1), /Historical transition authority: `waived`/);
  assert.match(calls.comments.at(-1), new RegExp(fixture.transitionId));

  const retry = await runPlanApprove({ issueNumber: 61, cfg, projectDir: root, deps });
  assert.equal(retry.status, 'repaired-from-transition-authority');
  assert.equal(calls.writes.length, 1, 'retry must not rewrite the approval marker');
  assert.equal(calls.comments.length, 1, 'retry must recognize the canonical modern audit');
});

test('modern transition authority does not auto-converge in human mode', async () => {
  const fixture = makeModernTransitionAuthorityFixture();
  const { deps, calls } = makeDeps({ state: 'develop', env: {}, ...fixture });

  const result = await runPlanApprove({ issueNumber: 61, cfg, projectDir: root, deps });

  assert.equal(result.status, 'wrong-state');
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.comments.length, 0);
});

test('modern transition authority retains all legacy planning evidence gates', async () => {
  const fixture = makeModernTransitionAuthorityFixture();
  fixture.comments = fixture.comments.filter(
    (comment) =>
      !(typeof comment === 'string' ? comment : comment.body).includes('### Planned Estimate')
  );
  const { deps, calls } = makeDeps({
    state: 'develop',
    env: { TT_FULL_AUTO: '1' },
    ...fixture,
  });

  const result = await runPlanApprove({ issueNumber: 61, cfg, projectDir: root, deps });

  assert.equal(result.status, 'evidence-repair-refused');
  assert.ok(result.blockers.includes('planned-estimate-missing'), JSON.stringify(result));
  assert.equal(calls.writes.length, 0);
});

test('modern transition authority refuses stale scope and orphan records', async () => {
  const scenarios = [
    {
      name: 'stale scope',
      fixture: makeModernTransitionAuthorityFixture({
        authorityScopeIdentity: `sha256:${'b'.repeat(64)}`,
      }),
      blocker: 'plan-transition-authority-scope',
    },
    {
      name: 'orphan',
      fixture: makeModernTransitionAuthorityFixture({ orphan: true }),
      blocker: 'plan-transition-authority-ambiguous',
    },
  ];
  for (const scenario of scenarios) {
    const { deps, calls } = makeDeps({
      state: 'develop',
      env: { TT_FULL_AUTO: '1' },
      ...scenario.fixture,
    });
    const result = await runPlanApprove({ issueNumber: 61, cfg, projectDir: root, deps });
    assert.equal(result.status, 'evidence-repair-refused', scenario.name);
    assert.ok(result.blockers.includes(scenario.blocker), scenario.name);
    assert.equal(calls.writes.length, 0, scenario.name);
  }
});

test('modern transition authority requires authenticated immutable pre-transition provenance', async () => {
  const scenarios = [
    {
      name: 'forged author',
      mutate: (comment) => ({ ...comment, authorLogin: 'attacker' }),
      blocker: 'plan-transition-authority-author',
    },
    {
      name: 'edited comment',
      mutate: (comment) => ({ ...comment, updatedAt: '2026-09-19T15:22:15.000Z' }),
      blocker: 'plan-transition-authority-edited',
    },
    {
      name: 'posted after transition',
      mutate: (comment) => ({
        ...comment,
        createdAt: '2026-09-19T15:22:17.000Z',
        updatedAt: '2026-09-19T15:22:17.000Z',
      }),
      blocker: 'plan-transition-authority-temporal',
    },
  ];
  for (const scenario of scenarios) {
    const fixture = makeModernTransitionAuthorityFixture();
    const index = fixture.comments.findIndex((comment) => typeof comment === 'object');
    fixture.comments[index] = scenario.mutate(fixture.comments[index]);
    const { deps, calls } = makeDeps({
      state: 'develop',
      env: { TT_FULL_AUTO: '1' },
      ...fixture,
    });

    const result = await runPlanApprove({ issueNumber: 61, cfg, projectDir: root, deps });

    assert.equal(result.status, 'evidence-repair-refused', scenario.name);
    assert.ok(result.blockers.includes(scenario.blocker), JSON.stringify(result));
    assert.equal(calls.writes.length, 0, scenario.name);
  }
});

test('malformed authority wrapper colliding with a completed transition fails closed', async () => {
  const fixture = makeModernTransitionAuthorityFixture();
  fixture.comments.push({
    id: 'IC_transition_collision',
    body: `<!-- aitm-plan-transition-authority id="${fixture.transitionId}" -->`,
    authorLogin: 'maintainer',
    createdAt: '2026-09-19T15:22:15.000Z',
    updatedAt: '2026-09-19T15:22:15.000Z',
  });
  const { deps, calls } = makeDeps({
    state: 'develop',
    env: { TT_FULL_AUTO: '1' },
    ...fixture,
  });

  const result = await runPlanApprove({ issueNumber: 61, cfg, projectDir: root, deps });

  assert.equal(result.status, 'evidence-repair-refused');
  assert.ok(result.blockers.includes('plan-transition-authority-malformed-collision'));
  assert.equal(calls.writes.length, 0);
});

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

// #1716: the public CLI flag reaches the evidence-repair branch.
{
  const fixture = makeEvidenceRepairFixture();
  const { deps } = makeDeps({
    state: 'review',
    env: { TT_FULL_AUTO: '1' },
    ...fixture,
  });
  const output = await captureVerbStdout(1716, deps, ['--repair-from-evidence']);
  assert.match(output, /Reconstructed Full-Auto Plan approval/);
  assert.match(output, new RegExp(fixture.revokedRecordId));
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

// #1716: an explicit Full-Auto repair reconstructs approval only from a
// complete later-stage evidence bundle and preserves Plan Adjustment bytes.
{
  const fixture = makeEvidenceRepairFixture();
  const adjustment = '## Plan Adjustment\n\nKeep this exact adjustment byte-for-byte.';
  const { deps, calls, getBody } = makeDeps({
    state: 'review',
    env: { TT_FULL_AUTO: '1' },
    ...fixture,
  });
  const r = await runPlanApprove({
    issueNumber: 1716,
    cfg,
    repairFromEvidence: true,
    deps,
  });
  assert.equal(r.status, 'repaired-from-evidence');
  assert.equal(r.mode, 'full-auto');
  assert.equal(readPlanApprovedMode(getBody()), 'full-auto');
  assert.equal(parsePlanApprovedMarker(getBody()).trunkSha, 'a'.repeat(40));
  assert.equal(parsePlanApprovedMarker(getBody()).repairRecordId, fixture.revokedRecordId);
  assert.equal(calls.comments.length, 1);
  assert.match(calls.comments.at(-1), /^### Full-Auto Plan-Approval Audit — #1716/m);
  assert.match(calls.comments.at(-1), new RegExp(fixture.revokedRecordId));
  assert.equal(getBody().includes(adjustment), true);
}

// #1716: the repair audit remains part of Agent Review's exact canonical
// comment contract while naming the revoked record that justified repair.
{
  const fixture = makeEvidenceRepairFixture();
  const audit = buildPlanApprovalAuditComment({
    issueNumber: 1716,
    ts: FIXED_TS,
    repairEvidence: {
      approvalPlanRecordId: fixture.approvalPlanRecordId,
      revokedRecordId: fixture.revokedRecordId,
    },
  });
  assert.equal(
    isCanonicalPlanApprovalAuditComment(audit, { issueNumber: 1716, ts: FIXED_TS }),
    true
  );
  assert.equal(
    isCanonicalPlanApprovalAuditComment(audit.replace('approval.plan', 'review.peer'), {
      issueNumber: 1716,
      ts: FIXED_TS,
    }),
    false
  );
  assert.equal(
    isCanonicalPlanApprovalAuditComment(audit, {
      issueNumber: 1716,
      ts: FIXED_TS,
      repairEvidence: {
        source: 'plan-transition-authority',
        historicalOutcome: 'waived',
        transitionId: 'move:11111111-1111-4111-8111-111111111111',
        authorityRecordId: fixture.approvalPlanRecordId,
        authorityRevision: 1,
        approvalPlanRecordId: fixture.approvalPlanRecordId,
        revokedRecordId: fixture.revokedRecordId,
      },
    }),
    false,
    'legacy and modern audit shapes must never satisfy each other'
  );
}

// #1716: partial marker/audit writes are safely retryable without duplicate
// provenance or loss of the separate Plan Adjustment record.
{
  const fixture = makeEvidenceRepairFixture();
  const { deps, calls, getBody } = makeDeps({
    state: 'review',
    env: { TT_FULL_AUTO: '1' },
    ...fixture,
  });
  await runPlanApprove({ issueNumber: 1716, cfg, repairFromEvidence: true, deps });
  const afterFirst = getBody();
  const r = await runPlanApprove({ issueNumber: 1716, cfg, repairFromEvidence: true, deps });
  assert.equal(r.status, 'repaired-from-evidence');
  assert.equal(getBody(), afterFirst);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.comments.length, 1);
}

// #1716: the reconstruction timestamp is chosen only after the complete
// authority snapshot has been read, so later events are subsequent history.
{
  const fixture = makeEvidenceRepairFixture();
  let snapshotComplete = false;
  const { deps } = makeDeps({
    state: 'review',
    env: { TT_FULL_AUTO: '1' },
    ...fixture,
    deps: {
      listIssueBodyHistory: async () => {
        snapshotComplete = true;
        return fixture.issueBodyHistory;
      },
      nowIso: () => {
        assert.equal(snapshotComplete, true);
        return FIXED_TS;
      },
    },
  });
  const result = await runPlanApprove({
    issueNumber: 1716,
    cfg,
    repairFromEvidence: true,
    deps,
  });
  assert.equal(result.status, 'repaired-from-evidence');
}

// #1716: incomplete GitHub edit history is a typed evidence refusal, not an
// uncatalogued generic CLI failure.
{
  const fixture = makeEvidenceRepairFixture();
  const { deps } = makeDeps({
    state: 'review',
    env: { TT_FULL_AUTO: '1' },
    ...fixture,
    deps: {
      listIssueBodyHistory: async () => {
        throw new Error('issue edit history is incomplete');
      },
    },
  });
  const result = await runPlanApprove({
    issueNumber: 1716,
    cfg,
    repairFromEvidence: true,
    deps,
  });
  assert.equal(result.status, 'evidence-repair-refused');
  assert.deepEqual(result.blockers, ['evidence-read-failed']);
}

// #1716: when the revoked head no longer lists approval.plan, the audit names
// the historical record that did cover it instead of wrongly attributing the head.
{
  const fixture = makeEvidenceRepairFixture();
  const first = fixture.workflowRecords[0].envelope;
  const revoked = fixture.workflowRecords[1].envelope;
  const replacedHead = createWorkflowExceptionEnvelope({
    repository: cfg.repo,
    issue: 1716,
    exceptionId: revoked.payload.exceptionId,
    revision: 2,
    status: 'revoked',
    scopeIdentity: revoked.payload.scopeIdentity,
    requirementIds: ['review.peer'],
    constraints: [],
    reason: revoked.payload.reason,
    authorization: revoked.payload.approvalEvidence,
    operationId: revoked.payload.operationId,
    predecessor: first.recordId,
    supersedes: first.recordId,
    createdAt: revoked.createdAt,
    recordId: revoked.recordId,
    grantId: revoked.authority.grantId,
  });
  const { deps, calls } = makeDeps({
    state: 'review',
    env: { TT_FULL_AUTO: '1' },
    ...fixture,
    workflowRecords: [
      fixture.workflowRecords[0],
      { commentNodeId: 'IC_revoked_replaced', envelope: replacedHead },
    ],
  });
  const result = await runPlanApprove({
    issueNumber: 1716,
    cfg,
    repairFromEvidence: true,
    deps,
  });
  assert.equal(result.status, 'repaired-from-evidence');
  assert.equal(result.approvalPlanRecordId, first.recordId);
  assert.equal(calls.comments.at(-1).includes(`record \`${first.recordId}\` covered`), true);
  assert.equal(
    calls.comments.at(-1).includes(`chain head \`${revoked.recordId}\` is revoked`),
    true
  );
}

// #1716: each missing or contradictory authority predicate fails closed.
{
  const fixture = makeEvidenceRepairFixture();
  const originalActive = fixture.workflowRecords[0].envelope;
  const currentActive = createWorkflowExceptionEnvelope({
    repository: cfg.repo,
    issue: 1716,
    exceptionId: originalActive.payload.exceptionId,
    revision: 1,
    scopeIdentity: computeScopeIdentity({
      repository: cfg.repo,
      issue: 1716,
      body: fixture.initialBody,
    }),
    requirementIds: originalActive.payload.requirementIds,
    constraints: originalActive.payload.constraints,
    reason: originalActive.payload.reason,
    authorization: originalActive.payload.approvalEvidence,
    operationId: originalActive.payload.operationId,
    createdAt: originalActive.createdAt,
    recordId: originalActive.recordId,
    grantId: originalActive.authority.grantId,
  });
  const scenarios = [
    {
      name: 'interactive invocation',
      env: {},
      want: 'full-auto-authority-missing',
    },
    {
      name: 'active exception',
      env: { TT_FULL_AUTO: '1' },
      workflowRecords: [{ commentNodeId: 'IC_active', envelope: currentActive }],
      issueBodyHistory: [fixture.initialBody],
      want: 'workflow-exception-active',
    },
    {
      name: 'missing Plan completion sequence',
      env: { TT_FULL_AUTO: '1' },
      comments: fixture.comments.slice(1),
      want: 'plan-completion-sequence-missing',
    },
    {
      name: 'missing matching scope history',
      env: { TT_FULL_AUTO: '1' },
      issueBodyHistory: [],
      want: 'workflow-exception-scope-history-missing',
    },
    {
      name: 'cancelled Plan',
      env: { TT_FULL_AUTO: '1' },
      initialBody: `${fixture.initialBody}\n<!-- aitm-plan-cancelled ts="2026-09-19T15:21:30.000Z" -->\n`,
      want: 'plan-cancelled-or-rejected',
    },
    {
      name: 'stale scope',
      env: { TT_FULL_AUTO: '1' },
      initialBody: fixture.initialBody.replace(
        'Repair the missing automated Plan approval from durable evidence.',
        'Changed scope that was never covered by the exception.'
      ),
      want: 'workflow-exception-semantic-scope-drift',
    },
    {
      name: 'existing human approval',
      env: { TT_FULL_AUTO: '1' },
      initialBody: `${fixture.initialBody}\n<!-- aitm-plan-approved ts="2026-09-19T15:21:30Z" mode="human" -->\n`,
      want: 'existing-approval-not-full-auto',
    },
    {
      name: 'existing ordinary Full-Auto approval',
      env: { TT_FULL_AUTO: '1' },
      initialBody: `${fixture.initialBody}\n<!-- aitm-plan-approved ts="2026-09-19T15:21:30Z" mode="full-auto" -->\n`,
      want: 'existing-approval-not-evidence-repair',
    },
  ];
  for (const scenario of scenarios) {
    const { deps, calls } = makeDeps({
      state: 'review',
      ...fixture,
      ...scenario,
    });
    const r = await runPlanApprove({
      issueNumber: 1716,
      cfg,
      repairFromEvidence: true,
      deps,
    });
    assert.equal(r.status, 'evidence-repair-refused', scenario.name);
    assert.ok(r.blockers.includes(scenario.want), `${scenario.name}: ${r.blockers.join(', ')}`);
    assert.equal(calls.writes.length, 0, scenario.name);
    assert.equal(calls.comments.length, 0, scenario.name);
  }
}
