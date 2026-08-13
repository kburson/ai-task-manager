// @story #277
// Unit tests for the plan-exit guards introduced in #277:
//   - planApprovedGuard       (lib/plan-approved-guard.mjs)
//   - planEpicChildrenGuard   (lib/plan-epic-children-guard.mjs)
//
// Asserts:
//   1. Each guard's pure behavior in isolation.
//   2. Each guard short-circuits when ctx.toState !== 'develop'
//      (rollback/bounce-back semantics — does NOT fire on plan → refine).
//   3. Both guards are wired into STATES.plan.exitGuards in the correct order.
//   4. runGuards('plan','develop', ctx) surfaces refusals from both.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planApprovedGuard } from '../../../lib/plan-approved-guard.mjs';
import { planEpicChildrenGuard } from '../../../lib/plan-epic-children-guard.mjs';
import { planExitVcPresenceGuard } from '../../../lib/plan-exit-vc-presence-guard.mjs';
import {
  planExitPlannedEstimateGuard,
  validateForecastProjection,
} from '../../../lib/plan-exit-planned-estimate-guard.mjs';
import { STATES } from '../../../states/index.mjs';
import { runGuards } from '../../../lib/guard-registry.mjs';
import { buildEstimationForecast } from '../../../lib/estimation/forecast-model.mjs';
import { buildEpicOrchestrationPlanMarker } from '../../../lib/epic-orchestration-plan.mjs';
import { createBootstrapRubric } from '../../../lib/estimation/rubric-model.mjs';
import {
  createAitmRecordEnvelope,
  renderAitmRecord,
} from '../../../lib/github-records/record-envelope.mjs';
import '../../../lib/guard-bootstrap.mjs';

// #336 — APPROVED_BODY now also carries deep-dive signals so the
// planExitDeepDiveGuard (newly wired into STATES.plan.exitGuards) passes in
// integration tests below. Per-guard unit tests above use minimal bodies.
const APPROVED_BODY = [
  '## Scope',
  '',
  // #355 — contiguity guard now fires on every forward transition; the
  // plan→develop integration test below needs the prior-stage entry markers
  // so the registry-wired contiguityEntryGuard returns `ok`.
  '<!-- aitm-entered-backlog: 2026-06-07T05:00:00Z -->',
  '<!-- aitm-entered-refine: 2026-06-07T05:30:00Z -->',
  '<!-- aitm-entered-plan: 2026-06-07T05:45:00Z -->',
  '<!-- aitm-plan-approved: 2026-06-07T06:00:00Z -->',
  '<!-- aitm-deep-dive-posted: 2026-06-07T06:00:00Z -->',
  '<!-- aitm-deep-dive-complete: 2026-06-07T06:00:00Z -->',
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '',
  '## Plan Metadata',
  '',
  '- **size**: XS',
  '',
  '## Deep-Dive Analysis',
  '',
  // #358 — substantive-chars floor folded into planDeepDiveGate; pad section.
  ...Array.from(
    { length: 20 },
    (_, i) =>
      `line ${i + 1}: substantive analysis paragraph describing the change, the surrounding subsystem, the risk surface, and the verification approach.`
  ),
  '',
  // #386 — planExitVcPresenceGuard (newly wired into STATES.plan.exitGuards)
  // refuses plan→develop on a body with no parseable Verification Commands
  // entry; the integration "ok" test needs at least one.
  '## Verification Commands',
  '',
  '- [ ] `npm run test:all`',
  '',
  `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: { size: 'XS' } })} -->`,
  '',
].join('\n');
const BARE_BODY = '## Scope\n\nno marker here\n';

// #336 — stub deps for the planned-estimate guard (newly wired into
// STATES.plan.exitGuards). Returns a refine-estimate comment whose
// `### Planned Estimate` appendix satisfies the gate.
const PLANNED_ESTIMATE_OK_DEPS = {
  // #1052 — keep registry integration tests offline while the decomposition
  // guard reads its own project Size/Estimate inputs.
  decomposition: {
    projectDir: process.cwd(),
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ size: 'XS', estimate: 4 }),
  },
  plannedEstimate: {
    listComments: async ({ issueNumber }) => [
      {
        id: 'cmt_1',
        body: [
          '### 🛠 Refine estimate',
          '',
          `<!-- aitm-refined-estimate: ${Number(issueNumber)} -->`,
          '',
          '### Planned Estimate',
          '',
          '| Bucket | Size | Estimate |',
          '| --- | --- | --- |',
          '| Planned | L | 8h |',
          '| Current | L | 8h |',
          '',
          'Rationale: stub.',
        ].join('\n'),
      },
    ],
  },
};

const CFG = { repo: 'owner/name', projectId: 'PVT' };

test('adaptive Plan exit refuses when ready forecast drifted after approval freeze', async () => {
  const frozen = '01J00000000000000000000710';
  const ready = '01J00000000000000000000711';
  const result = await planExitPlannedEstimateGuard.run({
    toState: 'develop',
    cfg: CFG,
    issueNumber: 1091,
    body: [
      `<!-- aitm-plan-approved ts="2026-08-02T14:00:00.000Z" forecast-record-id="${frozen}" -->`,
      `<!-- aitm-estimation-forecast-ready record-id="${ready}" -->`,
    ].join('\n'),
    deps: PLANNED_ESTIMATE_OK_DEPS,
  });
  assert.deepEqual(result.blockers, ['plan-forecast-freeze-mismatch']);
});

test('adaptive Plan exit refuses a ready forecast that was never frozen at approval', async () => {
  const ready = '01J00000000000000000000711';
  const result = await planExitPlannedEstimateGuard.run({
    toState: 'develop',
    cfg: { ...CFG, estimationRubricIssue: 1091 },
    issueNumber: 1091,
    body: [
      '<!-- aitm-plan-approved ts="2026-08-02T14:00:00.000Z" -->',
      `<!-- aitm-estimation-forecast-ready record-id="${ready}" -->`,
    ].join('\n'),
    deps: PLANNED_ESTIMATE_OK_DEPS,
  });
  assert.deepEqual(result.blockers, ['plan-forecast-freeze-missing']);
});

test('v1 Plan projection requires one ready forecast matching board and body authority', async () => {
  const recordId = '01J00000000000000000000700';
  const forecast = {
    recordId,
    supersededBy: null,
    payload: { plan: { size: 'XL', humanHours: 40 } },
  };
  assert.deepEqual(
    validateForecastProjection({
      forecast,
      activeForecastRecordIds: [recordId],
      readyForecastRecordId: recordId,
      board: { size: 'XL', estimate: 40 },
      bodyFields: { size: 'XL', estimate: 40 },
    }),
    { ok: true, forecastRecordId: recordId }
  );
  for (const projection of [
    {
      forecast: null,
      activeForecastRecordIds: [recordId],
      readyForecastRecordId: recordId,
      board: { size: 'XL', estimate: 40 },
      bodyFields: { size: 'XL', estimate: 40 },
    },
    {
      forecast,
      activeForecastRecordIds: [recordId],
      readyForecastRecordId: '01J00000000000000000000701',
      board: { size: 'XL', estimate: 40 },
      bodyFields: { size: 'XL', estimate: 40 },
    },
    {
      forecast,
      activeForecastRecordIds: [recordId],
      readyForecastRecordId: recordId,
      board: { size: 'L', estimate: 20 },
      bodyFields: { size: 'XL', estimate: 40 },
    },
    {
      forecast: { ...forecast, supersededBy: '01J00000000000000000000701' },
      activeForecastRecordIds: ['01J00000000000000000000701'],
      readyForecastRecordId: recordId,
      board: { size: 'XL', estimate: 40 },
      bodyFields: { size: 'XL', estimate: 40 },
    },
    {
      forecast,
      activeForecastRecordIds: [recordId, '01J00000000000000000000701'],
      readyForecastRecordId: recordId,
      board: { size: 'XL', estimate: 40 },
      bodyFields: { size: 'XL', estimate: 40 },
    },
  ])
    assert.equal(validateForecastProjection(projection).ok, false);

  const body = [
    `<!-- aitm-plan-approved ts="2026-08-02T14:00:00.000Z" forecast-record-id="${recordId}" -->`,
    `<!-- aitm-estimation-forecast-ready record-id="${recordId}" -->`,
  ].join('\n');
  const result = await planExitPlannedEstimateGuard.run({
    toState: 'develop',
    cfg: CFG,
    issueNumber: 1091,
    body,
    deps: {
      plannedEstimate: {
        listComments: PLANNED_ESTIMATE_OK_DEPS.plannedEstimate.listComments,
        forecastProjection: async () => ({
          forecast,
          activeForecastRecordIds: [recordId],
          board: { size: 'XL', estimate: 40 },
          bodyFields: { size: 'XL', estimate: 40 },
        }),
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.forecastRecordId, recordId);
});

test('configured adaptive Plan refuses marker-free exit even when the legacy appendix is valid', async () => {
  let projectionReads = 0;
  const result = await planExitPlannedEstimateGuard.run({
    toState: 'develop',
    cfg: { ...CFG, estimationRubricIssue: 1091 },
    issueNumber: 1091,
    body: 'body without a forecast-ready marker',
    deps: {
      plannedEstimate: {
        listComments: PLANNED_ESTIMATE_OK_DEPS.plannedEstimate.listComments,
        forecastProjection: async () => {
          projectionReads += 1;
          return {
            forecast: null,
            activeForecastRecordIds: [],
            board: { size: 'L', estimate: 8 },
            bodyFields: { size: 'L', estimate: 8 },
          };
        },
      },
    },
  });

  assert.equal(projectionReads, 0);
  assert.equal(result.ok, false);
  assert.deepEqual(result.blockers, ['plan-forecast-freeze-missing']);
});

test('v1 Plan projection uses production raw-comment pagination when no reader is injected', async () => {
  const recordId = '01J00000000000000000000702';
  const rubricRecordId = '01J00000000000000000000703';
  const rubric = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  const payload = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'XL', humanHours: 40 },
    planInput: {
      schema: 'aitm.plan-estimation-input/v1',
      wbs: [
        {
          id: 'implementation',
          description: 'Implement the planned change',
          baseHumanHours: 39.15,
          independentlyReviewable: true,
          signals: { modules: ['estimation'], dependencies: ['github-records'] },
        },
      ],
      testImpact: { lanes: ['unit'], isolation: 'test-sandbox', expectedMinutes: 0 },
      risks: [],
      comparableIssueIds: [],
    },
    rubric: { recordId: rubricRecordId, payload: rubric },
  });
  const envelope = createAitmRecordEnvelope({
    recordType: 'estimation-forecast',
    repository: 'owner/name',
    issue: 1091,
    payload,
    actor: 'aitm/plan-estimate',
    recordId,
    grantId: '01J00000000000000000000704',
    createdAt: '2026-08-02T14:00:00.000Z',
  });
  const planHours = payload.plan.humanHours;
  const cfg = {
    ...CFG,
    sizeFieldId: 'SIZE_FIELD',
    fieldEstimate: 'ESTIMATE_FIELD',
    kanbanFieldId: 'STATUS_FIELD',
    fieldIds: { size: 'SIZE_FIELD', estimate: 'ESTIMATE_FIELD', status: 'STATUS_FIELD' },
  };
  const result = await planExitPlannedEstimateGuard.run({
    toState: 'develop',
    cfg,
    issueNumber: 1091,
    body: [
      `<!-- aitm-plan-approved ts="2026-08-02T14:00:00.000Z" forecast-record-id="${recordId}" -->`,
      `<!-- aitm-estimation-forecast-ready record-id="${recordId}" -->`,
    ].join('\n'),
    deps: {
      plannedEstimate: {
        listComments: PLANNED_ESTIMATE_OK_DEPS.plannedEstimate.listComments,
        graphql: async ({ query, variables }) => {
          if (query.includes('AitmEstimationProjectionComments')) {
            assert.equal(variables.after, 'CURSOR_1');
            return {
              data: {
                repository: {
                  issue: {
                    number: 1091,
                    repository: { nameWithOwner: 'owner/name' },
                    comments: {
                      nodes: [
                        {
                          __typename: 'IssueComment',
                          id: 'COMMENT',
                          body: renderAitmRecord({ envelope }),
                          updatedAt: '2026-08-02T14:00:01Z',
                          issue: { number: 1091, repository: { nameWithOwner: 'owner/name' } },
                        },
                      ],
                      pageInfo: { hasNextPage: false, endCursor: null },
                    },
                  },
                },
              },
            };
          }
          assert.match(query, /pageInfo\s*\{\s*hasNextPage\s+endCursor\s*\}/);
          return {
            data: {
              repository: {
                issue: {
                  body: [
                    `<!-- aitm-estimation-forecast-ready record-id="${recordId}" -->`,
                    `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: { size: 'XL', estimate: planHours } })} -->`,
                  ].join('\n'),
                  comments: {
                    nodes: [],
                    pageInfo: { hasNextPage: true, endCursor: 'CURSOR_1' },
                  },
                  projectItems: {
                    nodes: [
                      {
                        id: 'ITEM',
                        project: { id: cfg.projectId },
                        fieldValues: {
                          nodes: [
                            { number: planHours, field: { id: cfg.fieldEstimate } },
                            { name: 'XL', field: { id: cfg.sizeFieldId } },
                            { name: 'Plan', field: { id: cfg.kanbanFieldId } },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          };
        },
      },
    },
  });
  assert.deepEqual(result, { ok: true, forecastRecordId: recordId });
});

// ── planApprovedGuard ────────────────────────────────────────────────────────

test('planApprovedGuard: body with marker → ok', async () => {
  const r = await planApprovedGuard.run({ toState: 'develop', body: APPROVED_BODY });
  assert.deepEqual(r, { ok: true });
});

test('planApprovedGuard: missing marker, toState=develop → refuse', async () => {
  const r = await planApprovedGuard.run({ toState: 'develop', body: BARE_BODY });
  assert.equal(r.ok, false);
  assert.match(r.reason, /aitm-plan-approved/);
  assert.match(r.reason, /plan-approve/);
});

test('planApprovedGuard: missing marker, toState=refine (rollback) → ok', async () => {
  // Bounce-backs out of plan must NOT require fresh plan-approved markers.
  const r = await planApprovedGuard.run({ toState: 'refine', body: BARE_BODY });
  assert.deepEqual(r, { ok: true });
});

test('planApprovedGuard: missing marker, toState absent → falls through (refuse)', async () => {
  // Ctx without toState is the legacy caller shape; we still enforce the marker.
  const r = await planApprovedGuard.run({ body: BARE_BODY });
  assert.equal(r.ok, false);
});

test('planApprovedGuard: empty/undefined body → refuse', async () => {
  const r = await planApprovedGuard.run({ toState: 'develop' });
  assert.equal(r.ok, false);
});

// ── planEpicChildrenGuard ───────────────────────────────────────────────────

test('planEpicChildrenGuard: toState=refine (rollback) → ok regardless of children', async () => {
  // No deps wired; guard must short-circuit before touching `gh`.
  const r = await planEpicChildrenGuard.run({
    toState: 'refine',
    cfg: CFG,
    issueNumber: 999,
  });
  assert.deepEqual(r, { ok: true });
});

test('planEpicChildrenGuard: missing cfg/issueNumber → fail-open', async () => {
  // Parity-test shape sometimes omits these; refusal here would mask the
  // real cause.
  const r1 = await planEpicChildrenGuard.run({ toState: 'develop' });
  assert.deepEqual(r1, { ok: true });
  const r2 = await planEpicChildrenGuard.run({ toState: 'develop', cfg: CFG });
  assert.deepEqual(r2, { ok: true });
});

test('planEpicChildrenGuard: solo issue (no children) → ok', async () => {
  const r = await planEpicChildrenGuard.run({
    toState: 'develop',
    cfg: CFG,
    issueNumber: 277,
    deps: {
      epicChildren: {
        fetchSiblings: async () => [],
      },
    },
  });
  assert.deepEqual(r, { ok: true });
});

test('planEpicChildrenGuard: epic with all children at R4P → ok', async () => {
  const children = [
    {
      number: 1,
      state: 'ready-for-plan',
      rank: 1,
      blockedBy: [],
      hasCurrentRefinement: true,
    },
    {
      number: 2,
      state: 'ready-for-plan',
      rank: 2,
      blockedBy: [],
      hasCurrentRefinement: true,
    },
  ];
  const trunkSha = 'a'.repeat(40);
  const r = await planEpicChildrenGuard.run({
    toState: 'develop',
    cfg: CFG,
    issueNumber: 999,
    body: buildEpicOrchestrationPlanMarker({ children, trunkSha }),
    deps: {
      epicChildren: {
        fetchSiblings: async () => children,
      },
      resolveTrunkSha: async () => trunkSha,
    },
  });
  assert.deepEqual(r, { ok: true });
});

test('planEpicChildrenGuard: epic with backlog child → refuse', async () => {
  const r = await planEpicChildrenGuard.run({
    toState: 'develop',
    cfg: CFG,
    issueNumber: 999,
    deps: {
      epicChildren: {
        fetchSiblings: async () => [
          { number: 1, state: 'ready-for-plan', rank: 1, hasCurrentRefinement: true },
          { number: 2, state: 'backlog' },
        ],
      },
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /epic-children-not-r4p/);
  assert.match(r.reason, /#2/);
});

// ── planExitVcPresenceGuard (#386) ───────────────────────────────────────────

test('planExitVcPresenceGuard: body with a parseable VC entry → ok', () => {
  const body = '## Verification Commands\n\n- [ ] `npm run test:all`\n';
  assert.deepEqual(planExitVcPresenceGuard.run({ toState: 'develop', body }), { ok: true });
});

test('planExitVcPresenceGuard: no VC section, toState=develop → refuse', () => {
  const r = planExitVcPresenceGuard.run({ toState: 'develop', body: BARE_BODY });
  assert.equal(r.ok, false);
  assert.match(r.reason, /verification-commands-missing/);
  assert.ok(Array.isArray(r.blockers) && r.blockers.length === 1);
});

test('planExitVcPresenceGuard: VC heading present but no parseable entry → refuse', () => {
  // Heading with zero `- [ ] `cmd`` lines is treated as absent (parser-defined).
  const body = '## Verification Commands\n\nnothing parseable here\n';
  const r = planExitVcPresenceGuard.run({ toState: 'develop', body });
  assert.equal(r.ok, false);
});

test('planExitVcPresenceGuard: unchecked entry still passes (presence, not completion)', () => {
  const body = '## Verification Commands\n\n- [ ] `npm run lint`\n';
  assert.deepEqual(planExitVcPresenceGuard.run({ toState: 'develop', body }), { ok: true });
});

test('planExitVcPresenceGuard: toState=refine (rollback) → ok regardless of body', () => {
  assert.deepEqual(planExitVcPresenceGuard.run({ toState: 'refine', body: BARE_BODY }), {
    ok: true,
  });
});

test('planExitVcPresenceGuard: undefined body → fail-open', () => {
  assert.deepEqual(planExitVcPresenceGuard.run({ toState: 'develop' }), { ok: true });
});

test('STATES.plan.exitGuards: includes plan-exit-vc-presence', () => {
  const ids = STATES.plan.exitGuards.map((g) => g.id);
  assert.ok(
    ids.includes('plan-exit-vc-presence'),
    `expected plan-exit-vc-presence in [${ids.join(', ')}]`
  );
});

test('runGuards(plan,develop): no VC section → surfaces plan-exit-vc-presence refusal', async () => {
  const r = await runGuards('plan', 'develop', {
    issueNumber: 277,
    repo: 'owner/name',
    fromState: 'plan',
    toState: 'develop',
    // APPROVED_BODY minus its VC section: passes every OTHER plan-exit guard so
    // the only refusal surfaced is the new presence guard.
    body: APPROVED_BODY.replace(/## Verification Commands\n\n- \[ \] `npm run test:all`\n\n/, ''),
    cfg: CFG,
    deps: {
      epicChildren: { fetchSiblings: async () => [] },
      ownership: {
        fetchCurrentUser: async () => 'kburson',
        fetchSnapshot: async () => ({ state: 'plan', assignees: ['kburson'] }),
      },
      ...PLANNED_ESTIMATE_OK_DEPS,
    },
    fetchBlockerState: async () => null,
  });
  assert.equal(r.ok, false);
  const ids = r.refusals.map((x) => x.id);
  assert.ok(ids.includes('plan-exit-vc-presence'), JSON.stringify(r));
});

// ── states/plan.mjs wiring ───────────────────────────────────────────────────

test('STATES.plan.exitGuards: includes plan-exit-plan-approved', () => {
  const ids = STATES.plan.exitGuards.map((g) => g.id);
  assert.ok(
    ids.includes('plan-exit-plan-approved'),
    `expected plan-exit-plan-approved in [${ids.join(', ')}]`
  );
});

test('STATES.plan.exitGuards: includes plan-exit-epic-children-r4p-or-beyond', () => {
  const ids = STATES.plan.exitGuards.map((g) => g.id);
  assert.ok(
    ids.includes('plan-exit-epic-children-r4p-or-beyond'),
    `expected plan-exit-epic-children-r4p-or-beyond in [${ids.join(', ')}]`
  );
});

test('STATES.plan.exitGuards: blockedBy runs before plan-exit guards', () => {
  const ids = STATES.plan.exitGuards.map((g) => g.id);
  const blocked = ids.indexOf('blocked-by-not-done');
  const approved = ids.indexOf('plan-exit-plan-approved');
  assert.ok(blocked !== -1 && approved !== -1);
  assert.ok(blocked < approved, `blocked-by should run first; got order [${ids.join(', ')}]`);
});

// ── runGuards integration ────────────────────────────────────────────────────

test('runGuards(plan,develop): missing plan-approved marker → refusal', async () => {
  const r = await runGuards('plan', 'develop', {
    issueNumber: 277,
    repo: 'owner/name',
    fromState: 'plan',
    toState: 'develop',
    body: BARE_BODY,
    cfg: CFG,
    deps: {
      epicChildren: { fetchSiblings: async () => [] },
      ...PLANNED_ESTIMATE_OK_DEPS,
    },
    fetchBlockerState: async () => null,
  });
  assert.equal(r.ok, false);
  const ids = r.refusals.map((x) => x.id);
  assert.ok(ids.includes('plan-exit-plan-approved'), JSON.stringify(r));
});

test('runGuards(plan,refine): rollback bypasses plan-exit guards', async () => {
  // No body marker, no epic-children deps — both guards must short-circuit
  // because toState !== 'develop'.
  const r = await runGuards('plan', 'refine', {
    issueNumber: 277,
    repo: 'owner/name',
    fromState: 'plan',
    toState: 'refine',
    body: BARE_BODY,
    cfg: CFG,
    fetchBlockerState: async () => null,
  });
  assert.equal(r.ok, true, JSON.stringify(r.refusals));
});

test('runGuards(plan,develop): marker present + solo issue → ok', async () => {
  const r = await runGuards('plan', 'develop', {
    issueNumber: 277,
    repo: 'owner/name',
    fromState: 'plan',
    toState: 'develop',
    body: APPROVED_BODY,
    cfg: CFG,
    deps: {
      epicChildren: { fetchSiblings: async () => [] },
      ownership: {
        fetchCurrentUser: async () => 'kburson',
        fetchSnapshot: async () => ({ state: 'plan', assignees: ['kburson'] }),
      },
      ...PLANNED_ESTIMATE_OK_DEPS,
    },
    fetchBlockerState: async () => null,
  });
  assert.equal(r.ok, true, JSON.stringify(r.refusals));
});
