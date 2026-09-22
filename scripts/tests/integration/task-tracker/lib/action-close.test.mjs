// @story #1669
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveActionNavigation } from '../../../../task-tracker/lib/action-decision/navigation.mjs';
import { evaluateAction } from '../../../../task-tracker/lib/action-decision/evaluate.mjs';
import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import * as closeReadiness from '../../../../task-tracker/lib/action-decision/close.mjs';

const ISSUE = 1669;
const HEAD = 'a'.repeat(40);
const BODY =
  '## User Story\nClose safely\n\n## Scope\nRead-only close\n\n## Acceptance Criteria\n- [x] Close safely\n\n<!-- aitm-last-known-state state="review" ts="2026-09-21T00:00:00Z" -->';
const REPO = 'example/project';
const now = () => '2026-09-21T00:00:00.000Z';

function closeFixture({ values = {}, guards, unreadable } = {}) {
  const effects = [];
  const scope = computeScopeIdentity({ repository: REPO, issue: ISSUE, body: BODY });
  const authority = {
    'issue-body': { number: ISSUE, body: BODY },
    'project-board': { state: 'review' },
    worktree: { matches: true, headSha: HEAD },
    'evidence:1669:1': {
      mode: 'ordinary',
      gateInput: {
        issueNumber: ISSUE,
        repository: REPO,
        body: BODY,
        branch: 'feature/1669',
        acceptedSha: HEAD,
        lineage: { parentIssueNumber: 1558, deliveryTarget: 'feature/epic/1558' },
      },
    },
    'evidence:1669:2': {
      status: 'attributed',
      tip: {
        status: 'observed',
        remote: 'origin',
        ref: 'refs/heads/feature/epic/1558',
        sha: HEAD,
        objectComplete: true,
        shallow: false,
      },
    },
    'evidence:1669:3': { complete: true, children: [] },
    ...values,
  };
  const attempt = createObservationAttempt({
    repository: REPO,
    issue: ISSUE,
    boundaryId: 'close-test',
    now,
    read: async (request) => {
      if (request.resource === unreadable || request.identity === unreadable)
        throw new Error('unavailable');
      return { ...request, value: authority[request.identity] ?? authority[request.resource] };
    },
  });
  const ports = {
    scope,
    cfg: { repo: REPO },
    head: HEAD,
    evaluatedAt: now(),
    runGuards:
      guards ?? (async () => ({ ok: true, status: 'ready', refusals: [], humanDecision: null })),
  };
  return {
    effects,
    attempt,
    ports,
    evaluate: () =>
      evaluateAction({
        actionId: 'close',
        repository: REPO,
        issue: ISSUE,
        inputs: { state: 'review', body: BODY, head: HEAD },
        attempt,
        deps: { closePorts: ports, effectAttempts: () => effects },
      }),
  };
}

test('ordinary close collects current authority without effects', async () => {
  const fixture = closeFixture();
  const result = await fixture.evaluate();
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.equal(result.actionId, 'close');
  assert.equal(result.snapshot.observations.length, 6);
  assert.deepEqual(fixture.effects, []);
});

test('close fails closed on missing objects and retains independent guard blockers', async () => {
  const fixture = closeFixture({
    values: { 'evidence:1669:2': { status: 'indeterminate' } },
    guards: async () => ({
      ok: false,
      status: 'blocked',
      refusals: [
        {
          id: 'review-exit-close-gates',
          code: 'unclassified-refusal',
          args: {},
          noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
        },
      ],
      humanDecision: null,
    }),
  });
  const result = await fixture.evaluate();
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some(({ code }) => code === 'attribution-authority-unavailable'));
  assert.ok(result.blockers.some(({ code }) => code === 'unclassified-refusal'));
  assert.deepEqual(fixture.effects, []);
});

test('close cannot convert a missing receipt or child read into readiness', async () => {
  for (const unreadable of ['evidence:1669:1', 'evidence:1669:3']) {
    const result = await closeFixture({ unreadable }).evaluate();
    assert.equal(result.status, 'indeterminate');
    assert.ok(result.blockers.some(({ code }) => code === 'authority-read-failed'));
  }
});

test('production close adapter fails closed without read-only delivery and guard seams', async () => {
  assert.equal(typeof closeReadiness.evaluateCloseReadiness, 'function');
  const result = await closeReadiness.evaluateCloseReadiness({
    issue: ISSUE,
    cfg: { repo: REPO },
    projectDir: process.cwd(),
    now,
    deps: {
      readBody: async () => BODY,
      readHead: async () => HEAD,
      fetchBoard: async () => ({ state: 'review' }),
      readWorktree: async () => ({ matches: true, headSha: HEAD }),
    },
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some(({ code }) => code === 'authority-read-failed'));
});

test('collector preserves all seven fields on read failure and does not execute effects', async () => {
  const fixture = closeFixture({ unreadable: 'issue-body' });
  const result = await closeReadiness.collectCloseReadiness({
    issue: ISSUE,
    attempt: fixture.attempt,
    ports: fixture.ports,
  });
  assert.deepEqual(Object.keys(result).sort(), [
    'blockers',
    'humanDecision',
    'normalizations',
    'observations',
    'selectedAction',
    'status',
    'warnings',
  ]);
  assert.equal(result.status, 'indeterminate');
  assert.deepEqual(fixture.effects, []);
});

test('epic child refusals and independent child approval requests survive close collection', async () => {
  const requests = [1701, 1702].map((issue) => ({
    kind: 'plan-approval',
    actor: 'configured-approver',
    subject: { issue, actionId: 'promote' },
    args: {},
  }));
  const fixture = closeFixture({
    values: {
      'evidence:1669:3': {
        complete: true,
        children: [
          { number: 1701, state: 'plan' },
          { number: 1702, state: 'plan' },
        ],
      },
    },
    guards: async () => ({
      ok: false,
      status: 'blocked',
      refusals: [1701, 1702].map((issue) => ({
        id: 'review-exit-epic-child-disposition',
        code: 'plan-approval-missing',
        args: {},
        remediation: { id: 'request-plan-approval', args: { issue } },
      })),
      humanDecision: { requests },
    }),
  });
  const result = await closeReadiness.collectCloseReadiness({
    issue: ISSUE,
    attempt: fixture.attempt,
    ports: fixture.ports,
  });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.humanDecision, { requests });
  assert.equal(result.blockers.length, 2);
});

test('close preserves approval requests alongside attribution investigation', async () => {
  const fixture = closeFixture({
    values: { 'evidence:1669:2': { status: 'indeterminate' } },
    guards: async () => ({
      ok: false,
      status: 'blocked',
      refusals: [
        {
          id: 'review-exit-review-approved',
          code: 'review-approval-missing',
          args: { head: HEAD },
          remediation: { id: 'request-review-approval', args: { issue: ISSUE, head: HEAD } },
        },
      ],
      humanDecision: {
        requests: [
          {
            kind: 'review-approval',
            actor: 'configured-approver',
            subject: { issue: ISSUE, actionId: 'close' },
            args: { head: HEAD },
          },
        ],
      },
    }),
  });
  const result = await fixture.evaluate();
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.humanDecision.requests.some(({ kind }) => kind === 'review-approval'));
});

test('incorporated and malformed evidence-v2 authority cannot select a special close lane', async () => {
  for (const mode of ['incorporated', 'evidence-v2']) {
    const fixture = closeFixture();
    const original = fixture.attempt.observe;
    const attempt = {
      observe: async (request) => {
        const observation = await original(request);
        return request.identity === 'evidence:1669:1'
          ? { ...observation, value: { ...observation.value, mode } }
          : observation;
      },
    };
    const result = await closeReadiness.collectCloseReadiness({
      issue: ISSUE,
      attempt,
      ports: fixture.ports,
    });
    assert.equal(result.status, 'indeterminate');
    assert.equal(result.selectedAction, 'close');
    assert.deepEqual(fixture.effects, []);
  }
});

test('a current Review state selects sanctioned close navigation', () => {
  const result = resolveActionNavigation({ actionId: 'close', state: 'review' });
  assert.deepEqual(result, { status: 'ready', target: 'done', delegate: 'close', blocker: null });
});

test('Done remains terminal and cannot select another close', () => {
  const result = resolveActionNavigation({ actionId: 'close', state: 'done' });
  assert.deepEqual(result, { status: 'terminal', target: null, delegate: null, blocker: null });
});
