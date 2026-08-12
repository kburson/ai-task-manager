// @story #277
// @parallel-unsafe (production guard imports spawn subprocesses transitively)
// Parity test for the plan → develop guard-registry migration (#277).
//
// Before #277, plan → develop was gated by inline checks at two call sites
// (scripts/gh/move-state.mjs and scripts/task-tracker/verbs/promote.mjs).
// After #277, the same rules live in `STATES.plan.exitGuards` and surface
// through the existing `runGuards('plan','develop', ctx)` call. This test
// pins the refusal contract end-to-end:
//
//   - The registry's refusal IDs are stable.
//   - The state-object walk (`STATES.plan.exitGuards`) agrees with the
//     registry walk (`runGuards`) on which guards fire.
//   - Solo + epic + missing-marker fixtures produce the documented refusal
//     mix.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runGuards } from '../../../lib/guard-registry.mjs';
import { STATES } from '../../../states/index.mjs';
import '../../../lib/guard-bootstrap.mjs';

const CFG = { repo: 'owner/name', projectId: 'PVT' };

async function runStateObjectGuards(from, to, ctx) {
  const refusals = [];
  const sequence = [
    ...STATES[from].exitGuards.map((g) => ({ slot: 'exit', guard: g })),
    ...STATES[to].entryGuards.map((g) => ({ slot: 'entry', guard: g })),
  ];
  for (const { guard } of sequence) {
    let result;
    try {
      result = await guard.run(ctx);
    } catch (err) {
      result = { ok: false, reason: String(err?.message ?? err) };
    }
    if (!result || result.ok === false) {
      refusals.push({ id: guard.id, reason: result?.reason ?? '(no reason)' });
    }
  }
  return { ok: refusals.length === 0, refusals };
}

// #336 — plan exit guards expanded to include planExitPlannedEstimateGuard
// (needs deps.plannedEstimate.listComments) and planExitDeepDiveGuard
// (body-only). APPROVED_BODY now carries the full deep-dive marker trio so
// only the plan-approved / epic-children rules drive accept/refuse here.
function makeCtx({ body = '', epicChildren = [] } = {}) {
  return {
    issueNumber: 277,
    repo: 'owner/name',
    fromState: 'plan',
    toState: 'develop',
    body,
    cfg: CFG,
    deps: {
      epicChildren: { fetchSiblings: async () => epicChildren },
      // #1052 — the newly registered decomposition guard must receive the
      // same offline board values through both parity paths.
      decomposition: {
        projectDir: process.cwd(),
        loadProjectFieldDefs: () => [],
        projectValuesForIssue: async () => ({ size: 'XS', estimate: 4 }),
      },
      ownership: {
        fetchCurrentUser: async () => 'kburson',
        fetchSnapshot: async () => ({ state: 'plan', assignees: ['kburson'] }),
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
              '| Field | Refine | Plan | Δ |',
              '|---|---|---|---|',
              '| Size | L | L | 0 |',
              '| Estimate (h) | 8 | 8 | 0 |',
              '',
              'rationale stub.',
            ].join('\n'),
          },
        ],
      },
    },
    fetchBlockerState: async () => null,
  };
}

const APPROVED_BODY = [
  '## Scope',
  '',
  // #355 — contiguity guard now fires on every forward transition; the
  // plan→develop accept fixture needs prior-stage entry markers so the
  // registry-wired contiguityEntryGuard returns ok.
  '<!-- aitm-entered-backlog: 2026-06-07T05:00:00Z -->',
  '<!-- aitm-entered-refine: 2026-06-07T05:30:00Z -->',
  '<!-- aitm-entered-plan: 2026-06-07T05:45:00Z -->',
  '<!-- aitm-plan-approved: 2026-06-07T06:00:00Z -->',
  '',
  '## Story Origin',
  '- **kind**: code',
  '',
  '## Plan Metadata',
  '- **size**: XS',
  '- **estimate**: 2',
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '> Follow: `.ai-task-manager/templates/pickup-directive.md`',
  '',
  '<!-- aitm-deep-dive-posted: 2026-06-07T06:00:00Z -->',
  '<!-- aitm-deep-dive-complete: 2026-06-07T06:00:00Z -->',
  '',
  '## Deep-Dive Analysis',
  '',
  // #358 — planDeepDiveGate now enforces a size-bucketed substantive-chars
  // floor (XS=1200, default=2000). Tag the body as XS and pad the section.
  ...Array.from(
    { length: 20 },
    (_, i) =>
      `line ${i + 1}: substantive analysis paragraph describing the change, the surrounding subsystem, the risk surface, and the verification approach.`
  ),
  '',
  // #386 — planExitVcPresenceGuard now gates plan→develop; the accept fixture
  // needs a Verification Commands section with >= 1 parseable entry.
  '## Verification Commands',
  '',
  '- [ ] `npm run test:all`',
  '',
  `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: { size: 'XS' } })} -->`,
  '',
].join('\n');
const BARE_BODY = '## Scope\n\nno marker here\n';

describe('guard-parity-plan-develop: registry == state-object walk', () => {
  it('accept: solo issue with plan-approved marker passes both paths', async () => {
    const ctx = makeCtx({ body: APPROVED_BODY, epicChildren: [] });
    const reg = await runGuards('plan', 'develop', ctx);
    const obj = await runStateObjectGuards('plan', 'develop', ctx);
    assert.equal(reg.ok, true, JSON.stringify(reg.refusals));
    assert.equal(obj.ok, true, JSON.stringify(obj.refusals));
  });

  it('refuse: missing marker — both paths refuse with plan-exit-plan-approved', async () => {
    const ctx = makeCtx({ body: BARE_BODY });
    const reg = await runGuards('plan', 'develop', ctx);
    const obj = await runStateObjectGuards('plan', 'develop', ctx);
    assert.equal(reg.ok, false);
    assert.equal(obj.ok, false);
    const regIds = new Set(reg.refusals.map((x) => x.id));
    const objIds = new Set(obj.refusals.map((x) => x.id));
    assert.ok(regIds.has('plan-exit-plan-approved'));
    assert.ok(objIds.has('plan-exit-plan-approved'));
    assert.deepEqual(regIds, objIds);
  });

  it('refuse: epic with backlog child — both paths refuse with epic-children id', async () => {
    const ctx = makeCtx({
      body: APPROVED_BODY,
      epicChildren: [
        {
          number: 1,
          state: 'ready-for-plan',
          rank: 1,
          blockedBy: [],
          hasCurrentRefinement: true,
        },
        { number: 2, state: 'backlog' },
      ],
    });
    const reg = await runGuards('plan', 'develop', ctx);
    const obj = await runStateObjectGuards('plan', 'develop', ctx);
    assert.equal(reg.ok, false);
    assert.equal(obj.ok, false);
    const regIds = new Set(reg.refusals.map((x) => x.id));
    const objIds = new Set(obj.refusals.map((x) => x.id));
    assert.ok(regIds.has('plan-exit-epic-children-r4p-or-beyond'));
    assert.ok(objIds.has('plan-exit-epic-children-r4p-or-beyond'));
    assert.deepEqual(regIds, objIds);
  });

  it('refuse: missing marker + backlog child — both refusals surface together', async () => {
    const ctx = makeCtx({
      body: BARE_BODY,
      epicChildren: [{ number: 9, state: 'backlog' }],
    });
    const reg = await runGuards('plan', 'develop', ctx);
    assert.equal(reg.ok, false);
    const ids = new Set(reg.refusals.map((x) => x.id));
    assert.ok(ids.has('plan-exit-plan-approved'));
    assert.ok(ids.has('plan-exit-epic-children-r4p-or-beyond'));
  });

  it('rollback: plan → refine bypasses plan-exit-develop guards', async () => {
    const ctx = {
      ...makeCtx({ body: BARE_BODY }),
      toState: 'refine',
    };
    const reg = await runGuards('plan', 'refine', ctx);
    assert.equal(reg.ok, true, JSON.stringify(reg.refusals));
  });
});
