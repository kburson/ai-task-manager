// @story #1216
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEpicOrchestrationPlanMarker,
  verifyEpicOrchestrationPlan,
} from '../../../lib/epic-orchestration-plan.mjs';
import { buildPlanApprovedMarker } from '../../../lib/markers.mjs';
import { planApprovedGuard } from '../../../lib/plan-approved-guard.mjs';
import { planEpicChildrenGuard } from '../../../lib/plan-epic-children-guard.mjs';
import { runPlanApprove } from '../../../verbs/plan-approve.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

const children = [
  {
    number: 1215,
    state: 'done',
    boardState: 'done',
    issueState: 'closed',
    closeReason: 'completed',
    rank: 5,
    blockedBy: [],
    hasCurrentRefinement: true,
  },
  {
    number: 1216,
    state: 'ready-for-plan',
    boardState: 'ready-for-plan',
    issueState: 'open',
    closeReason: null,
    rank: 6,
    blockedBy: [1215],
    hasCurrentRefinement: true,
  },
];

test('epic orchestration plan binds the complete child graph and strict execution policy', () => {
  const marker = buildEpicOrchestrationPlanMarker({ children, trunkSha: SHA_A });
  assert.match(marker, /aitm-epic-orchestration-plan/);
  assert.equal(verifyEpicOrchestrationPlan(marker, { children, trunkSha: SHA_A }).ok, true);

  for (const changed of [
    children.slice(0, 1),
    children.map((child) => (child.number === 1216 ? { ...child, rank: 9 } : child)),
    children.map((child) => (child.number === 1216 ? { ...child, blockedBy: [999] } : child)),
  ]) {
    assert.equal(
      verifyEpicOrchestrationPlan(marker, { children: changed, trunkSha: SHA_A }).ok,
      false
    );
  }
});

test('R4P-origin Plan approval is bound to current trunk before Develop', async () => {
  const body = [
    '<!-- aitm-entered-ready-for-plan ts="2026-08-12T00:00:00Z" -->',
    buildPlanApprovedMarker('2026-08-12T00:01:00Z', {
      mode: 'full-auto',
      trunkSha: SHA_A,
    }),
  ].join('\n');

  assert.equal(
    (
      await planApprovedGuard.run({
        toState: 'develop',
        body,
        deps: { resolveTrunkSha: async () => SHA_A },
      })
    ).ok,
    true
  );
  assert.equal(
    (
      await planApprovedGuard.run({
        toState: 'develop',
        body,
        deps: { resolveTrunkSha: async () => SHA_B },
      })
    ).ok,
    false
  );
  assert.equal(
    (
      await planApprovedGuard.run({
        toState: 'develop',
        body: body.replace(` trunk-sha="${SHA_A}"`, ''),
        deps: { resolveTrunkSha: async () => SHA_A },
      })
    ).ok,
    false
  );
});

test('epic Plan exit requires a durable graph matching live children and trunk', async () => {
  const marker = buildEpicOrchestrationPlanMarker({ children, trunkSha: SHA_A });
  const deps = {
    epicChildren: { fetchSiblings: async () => children },
    resolveTrunkSha: async () => SHA_A,
  };
  assert.equal(
    (
      await planEpicChildrenGuard.run({
        toState: 'develop',
        cfg: { repo: 'o/r', projectId: 'PVT_1' },
        issueNumber: 1209,
        body: marker,
        deps,
      })
    ).ok,
    true
  );
  assert.equal(
    (
      await planEpicChildrenGuard.run({
        toState: 'develop',
        cfg: { repo: 'o/r', projectId: 'PVT_1' },
        issueNumber: 1209,
        body: '',
        deps,
      })
    ).ok,
    false
  );
});

test('plan approval stamps trunk and complete epic orchestration provenance', async () => {
  let body = [
    '## Acceptance Criteria',
    '',
    '- [x] planned',
    '',
    '## AITM Progress Markers',
    '',
    '<!-- aitm-issue-kind kind="epic" -->',
    '<!-- aitm-entered-ready-for-plan ts="2026-08-12T00:00:00Z" -->',
  ].join('\n');
  const result = await runPlanApprove({
    issueNumber: 1209,
    cfg: { repo: 'o/r', projectId: 'PVT_1', trunkRef: 'origin/trunk' },
    projectDir: process.cwd(),
    deps: {
      getBoardState: async () => 'plan',
      fetchIssueBody: async () => body,
      mutateIssueBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok', body };
      },
      nowIso: () => '2026-08-12T00:01:00Z',
      env: { TT_FULL_AUTO: '1' },
      listComments: async () => [],
      postComment: async () => {},
      resolveTrunkSha: async () => SHA_A,
      fetchEpicChildren: async () => children,
      contractWrite: { writeOperation: async () => ({ status: 'not-applicable' }) },
    },
  });
  assert.equal(result.status, 'approved');
  assert.match(body, new RegExp(`trunk-sha="${SHA_A}"`));
  assert.equal(verifyEpicOrchestrationPlan(body, { children, trunkSha: SHA_A }).ok, true);
});

test('plan approval discovers children for an implicit epic before stamping approval', async () => {
  let body = [
    '## Acceptance Criteria',
    '',
    '- [x] planned',
    '',
    '## AITM Progress Markers',
    '',
    '<!-- aitm-entered-ready-for-plan ts="2026-08-12T00:00:00Z" -->',
  ].join('\n');
  const result = await runPlanApprove({
    issueNumber: 1209,
    cfg: { repo: 'o/r', projectId: 'PVT_1', trunkRef: 'origin/trunk' },
    projectDir: process.cwd(),
    deps: {
      getBoardState: async () => 'plan',
      fetchIssueBody: async () => body,
      mutateIssueBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok', body };
      },
      nowIso: () => '2026-08-12T00:01:00Z',
      env: { TT_FULL_AUTO: '1' },
      listComments: async () => [],
      postComment: async () => {},
      resolveTrunkSha: async () => SHA_A,
      fetchEpicChildren: async () => children,
      contractWrite: { writeOperation: async () => ({ status: 'not-applicable' }) },
    },
  });

  assert.equal(result.status, 'approved');
  assert.equal(verifyEpicOrchestrationPlan(body, { children, trunkSha: SHA_A }).ok, true);
});

test('legacy Plan epic without kind or R4P markers still freezes children and trunk', async () => {
  let body = ['## Acceptance Criteria', '', '- [x] planned'].join('\n');
  const result = await runPlanApprove({
    issueNumber: 1209,
    cfg: { repo: 'o/r', projectId: 'PVT_1', trunkRef: 'origin/trunk' },
    projectDir: process.cwd(),
    deps: {
      getBoardState: async () => 'plan',
      fetchIssueBody: async () => body,
      mutateIssueBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok', body };
      },
      nowIso: () => '2026-08-12T00:01:00Z',
      env: { TT_FULL_AUTO: '1' },
      listComments: async () => [],
      postComment: async () => {},
      resolveTrunkSha: async () => SHA_A,
      fetchEpicChildren: async () => children,
      contractWrite: { writeOperation: async () => ({ status: 'not-applicable' }) },
    },
  });

  assert.equal(result.status, 'approved');
  assert.match(body, new RegExp(`trunk-sha="${SHA_A}"`));
  assert.equal(verifyEpicOrchestrationPlan(body, { children, trunkSha: SHA_A }).ok, true);
});
