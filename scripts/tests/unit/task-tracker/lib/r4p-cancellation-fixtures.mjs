// @story #1988 — canonical refinement and cancellation provider inputs.
import assert from 'node:assert/strict';
import { stampRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
export const CFG = { repo: 'owner/repo', projectId: 'PVT_PROJECT' };
export const TS = '2026-08-12T12:00:00.000Z';
export function refinedBody({
  state = 'refine',
  scope = 'Implement the governed R4P boundary.',
  rank = 4,
  blocker = null,
} = {}) {
  return [
    `<!-- aitm-last-known-state state="${state}" ts="2026-08-12T11:00:00.000Z" -->`,
    '## User Story',
    'As a delivery owner',
    'I want recoverable planning because interruptions can leave partial revisions',
    'So that stale Plan work cannot bypass refinement',
    '',
    `<!-- aitm-refinement-rationale: {"size":"M","estimate":"8","priority":"p1","rank":${rank},"rationale":"current architecture"} -->`,
    '',
    '## Scope',
    '',
    scope,
    '',
    '## Plan Metadata',
    '',
    '- **Depends On**: #1212',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] Snapshot is current. <!-- aitm-verified vc-list="vc:1" -->',
    '- [ ] Plan cancellation is recoverable. <!-- aitm-verified vc-list="vc:1" -->',
    '',
    '## Verification Commands',
    '- [ ] `node verify.mjs` <!-- id=1 -->',
    '',
    '## Definition of Done',
    '',
    '- [ ] Acceptance criteria met.',
    '',
    ...(blocker ? [`<!-- aitm-blocked-by refs="#${blocker}" -->`, ''] : []),
    `<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"M","estimate":8,"rank":${rank},"blockedBy":null}} -->`,
    '',
  ].join('\n');
}

export function plannedBody({ rank = 4 } = {}) {
  const refined = stampRefinementSnapshot(refinedBody({ state: 'plan', rank }), {
    labels: ['enhancement'],
    ts: TS,
  });
  return [
    refined,
    '<!-- aitm-deep-dive-posted ts="2026-08-12T12:05:00.000Z" -->',
    '<!-- aitm-deep-dive-complete ts="2026-08-12T12:06:00.000Z" -->',
    '<!-- aitm-estimation-forecast-ready record-id="forecast-record-1213" -->',
    '<!-- aitm-plan-approved ts="2026-08-12T12:07:00.000Z" forecast-record-id="forecast-record-1213" mode="full-auto" -->',
    `<!-- aitm-epic-orchestration-plan schema="1" digest="${'a'.repeat(64)}" payload="e30" -->`,
    '<!-- aitm-test-started sha="abcdef1" ts="2026-08-12T12:08:00.000Z" -->',
    '<!-- aitm-dod-verified sha="abcdef1" ts="2026-08-12T12:09:00.000Z" -->',
  ].join('\n');
}

export function fetchPlanBoardFields(overrides = {}) {
  return async () => ({ priority: 'P1', size: 'M', estimate: 8, rank: 4, ...overrides });
}

export function plannedEstimateFixture() {
  const comments = [
    {
      id: 42,
      body:
        '<!-- aitm-refined-estimate: 1213 -->\n### Refine estimate\n\n' +
        '### Planned Estimate\n\n| Field | Refine | Plan | Δ |\n|---|---|---|---|\n' +
        '| Size | M | L | M→L |\n| Estimate (h) | 8 | 13 | +5 |\n',
    },
  ];
  return {
    comments,
    deps: {
      listComments: async () => comments,
      patchComment: async ({ commentId, body }) => {
        assert.equal(commentId, 42);
        comments[0].body = body;
      },
    },
  };
}
