// @story #1751
import assert from 'node:assert/strict';
import { createObservationAttempt } from '../../task-tracker/lib/action-decision/observations.mjs';
import { computeScopeIdentity } from '../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import { blockedByGuard } from '../../task-tracker/lib/blocked-by-guard.mjs';
import { runPromote } from '../../task-tracker/verbs/promote.mjs';
import { validateBlocker } from '../../task-tracker/lib/action-decision/contract.mjs';
import { planApprovedGuard } from '../../task-tracker/lib/plan-approved-guard.mjs';
import { runGuards as productionGuards } from '../../task-tracker/lib/guard-registry.mjs';

export function registerEarlyPromoteCases({ test, body, now }) {
  test('early promotion readiness retains an unmapped complete-guard refusal', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    const issue = 1751;
    const bodyValue = body;
    const scope = computeScopeIdentity({ repository: 'example/project', issue, body: bodyValue });
    const effects = [];
    const identities = [];
    const attempt = createObservationAttempt({
      repository: 'example/project',
      issue,
      boundaryId: 'action:promote:1751',
      now,
      read: async (request) => {
        identities.push(request.identity);
        return {
          ...request,
          value:
            request.resource === 'issue-body'
              ? { number: issue, body: bodyValue }
              : request.resource === 'project-board'
                ? { state: 'plan' }
                : { active: false },
        };
      },
    });
    const result = await collectEarlyPromoteReadiness({
      issue,
      fromState: 'plan',
      body: bodyValue,
      attempt,
      ports: {
        scope,
        cfg: { repo: 'example/project' },
        projectDir: process.cwd(),
        runGuards: async () => ({
          ok: false,
          status: 'blocked',
          refusals: [
            {
              id: 'plan-exit-plan-approved',
              guardId: 'plan-exit-plan-approved',
              code: 'unclassified-refusal',
              args: {},
              noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
              reason: 'plan approval is missing',
            },
          ],
          humanDecision: null,
        }),
        loadPolicy: async () => ({ status: 'observed' }),
        effectAttempts: effects,
      },
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.target, 'develop');
    assert.deepEqual(
      result.blockers.map((blocker) => blocker.code),
      ['unclassified-refusal']
    );
    assert.deepEqual(effects, []);
    assert.deepEqual(identities, ['issue:1751:1', 'issue:1751:2', 'migration-journal:1751']);
  });

  test('typed plan approval remediation survives complete guard projection', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    const issue = 1751;
    const attempt = {
      observe: async ({ resource }) => ({
        status: 'observed',
        resource,
        value:
          resource === 'issue-body'
            ? { number: issue, body }
            : resource === 'project-board'
              ? { state: 'plan' }
              : { active: false },
      }),
    };
    const remediation = { id: 'record-plan-approval', args: { issue } };
    const result = await collectEarlyPromoteReadiness({
      issue,
      fromState: 'plan',
      body,
      attempt,
      ports: {
        scope: 'plan-approval:1751',
        cfg: { repo: 'example/project' },
        projectDir: process.cwd(),
        runGuards: async () => ({
          ok: false,
          status: 'blocked',
          refusals: [
            {
              id: 'plan-exit-plan-approved',
              guardId: 'plan-exit-plan-approved',
              code: 'plan-approval-missing',
              args: {},
              remediation,
              reason: 'plan approval is missing',
            },
          ],
          humanDecision: null,
        }),
        loadPolicy: async () => ({ status: 'observed' }),
      },
    });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.blockers[0].remediation, remediation);
    validateBlocker(result.blockers[0], { status: 'blocked' });
  });

  test('unknown and conflicting early state authority never yields a target grant', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    const unknown = await collectEarlyPromoteReadiness({
      issue: 1751,
      fromState: 'mystery',
      body,
      attempt: { observe: () => assert.fail('unknown state must not collect') },
      ports: { scope: 'unknown:1751' },
    });
    assert.equal(unknown.status, 'indeterminate');
    assert.equal(unknown.target, null);
    assert.deepEqual(
      unknown.blockers.map((blocker) => blocker.code),
      ['state-unavailable']
    );

    const issue = 1751;
    const scope = computeScopeIdentity({ repository: 'example/project', issue, body });
    const attempt = createObservationAttempt({
      repository: 'example/project',
      issue,
      boundaryId: 'action:promote:state-conflict:1751',
      now,
      read: async (request) => ({
        ...request,
        value:
          request.resource === 'issue-body'
            ? { number: issue, body }
            : request.resource === 'project-board'
              ? { state: 'develop' }
              : { active: false },
      }),
    });
    const conflicting = await collectEarlyPromoteReadiness({
      issue,
      fromState: 'plan',
      body,
      attempt,
      ports: { scope, cfg: { repo: 'example/project' }, projectDir: process.cwd() },
    });
    assert.equal(conflicting.status, 'indeterminate');
    assert.deepEqual(
      conflicting.blockers.map((blocker) => blocker.code),
      ['state-unavailable']
    );
  });

  test('early promotion readiness follows all four canonical forward edges', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    for (const [fromState, target] of [
      ['backlog', 'refine'],
      ['refine', 'ready-for-plan'],
      ['ready-for-plan', 'plan'],
      ['plan', 'develop'],
    ]) {
      const issue = 1751;
      const bodyValue = body.replace('state="plan"', `state="${fromState}"`);
      const scope = computeScopeIdentity({ repository: 'example/project', issue, body: bodyValue });
      const effects = [];
      const attempt = createObservationAttempt({
        repository: 'example/project',
        issue,
        boundaryId: `action:promote:${fromState}:1751`,
        now,
        read: async (request) => ({
          ...request,
          value:
            request.resource === 'issue-body'
              ? { number: issue, body: bodyValue }
              : request.resource === 'project-board'
                ? { state: fromState }
                : { active: false },
        }),
      });
      const result = await collectEarlyPromoteReadiness({
        issue,
        fromState,
        body: bodyValue,
        attempt,
        ports: {
          scope,
          cfg: { repo: 'example/project' },
          projectDir: process.cwd(),
          runGuards: async (from, to) => {
            assert.equal(from, fromState);
            assert.equal(to, target);
            return { ok: true, status: 'ready', refusals: [], humanDecision: null };
          },
          effectAttempts: effects,
        },
      });
      assert.deepEqual(
        { status: result.status, target: result.target, blockers: result.blockers },
        { status: 'ready', target, blockers: [] }
      );
      assert.deepEqual(effects, []);
    }
  });

  test('a migration freeze discovered after explanation blocks early promotion readiness', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    const issue = 1751;
    const scope = computeScopeIdentity({ repository: 'example/project', issue, body });
    const attempt = createObservationAttempt({
      repository: 'example/project',
      issue,
      boundaryId: 'action:promote:frozen:1751',
      now,
      read: async (request) => ({
        ...request,
        value:
          request.resource === 'issue-body'
            ? { number: issue, body }
            : request.resource === 'project-board'
              ? { state: 'plan' }
              : { active: true },
      }),
    });
    const result = await collectEarlyPromoteReadiness({
      issue,
      fromState: 'plan',
      body,
      attempt,
      ports: {
        scope,
        cfg: { repo: 'example/project' },
        projectDir: process.cwd(),
        runGuards: async () => {
          assert.fail('freeze must refuse before the guard evaluator');
        },
      },
    });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(
      result.blockers.map((blocker) => blocker.code),
      ['migration-freeze']
    );
  });

  test('terminal Done has no executable early promotion target', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    const result = await collectEarlyPromoteReadiness({
      issue: 1751,
      fromState: 'done',
      body,
      attempt: { observe: () => assert.fail('terminal state must not read authority') },
      ports: { scope: 'terminal:1751' },
    });
    assert.equal(result.target, null);
    assert.equal(result.status, 'indeterminate');
    assert.deepEqual(
      result.blockers.map((blocker) => blocker.code),
      ['action-not-explain-ready']
    );
    assert.equal(result.delegate.executable, false);
  });

  test('later promotion delegate stays pending with a valid navigation blocker', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    const result = await collectEarlyPromoteReadiness({
      issue: 1751,
      fromState: 'develop',
      body,
      attempt: { observe: () => assert.fail('pending adapter must not collect') },
      ports: { scope: 'pending:1751' },
    });
    assert.equal(result.status, 'indeterminate');
    assert.equal(result.target, 'test');
    assert.equal(result.delegate.executable, false);
    validateBlocker(result.blockers[0], { status: 'indeterminate' });
  });

  test('skipped remote authority cannot yield ready early promotion', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    const result = await collectEarlyPromoteReadiness({
      issue: 1751,
      fromState: 'plan',
      body,
      attempt: { observe: () => assert.fail('skipped authority must not be read') },
      ports: { scope: 'skipped:1751', skipNetwork: true },
    });
    assert.equal(result.status, 'indeterminate');
    assert.ok(result.blockers.every((blocker) => blocker.code === 'authority-read-skipped'));
    assert.equal(result.target, 'develop');
  });

  test('TT_SKIP_NETWORK also skips early promotion authority without a caller flag', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    const previous = process.env.TT_SKIP_NETWORK;
    process.env.TT_SKIP_NETWORK = '1';
    try {
      const result = await collectEarlyPromoteReadiness({
        issue: 1751,
        fromState: 'plan',
        body,
        attempt: { observe: () => assert.fail('network skip must precede reads') },
        ports: { scope: 'skipped:1751' },
      });
      assert.equal(result.status, 'indeterminate');
      assert.ok(result.blockers.some((blocker) => blocker.code === 'authority-read-skipped'));
    } finally {
      if (previous === undefined) delete process.env.TT_SKIP_NETWORK;
      else process.env.TT_SKIP_NETWORK = previous;
    }
  });

  test('read-only dependency readiness does not reconcile disposition', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    const issue = 1751;
    const scope = computeScopeIdentity({ repository: 'example/project', issue, body });
    const effects = [];
    const attempt = createObservationAttempt({
      repository: 'example/project',
      issue,
      boundaryId: 'action:promote:read-only-dependency:1751',
      now,
      read: async (request) => ({
        ...request,
        value:
          request.resource === 'issue-body'
            ? { number: issue, body }
            : request.resource === 'project-board'
              ? { state: 'plan' }
              : { active: false },
      }),
    });
    const result = await collectEarlyPromoteReadiness({
      issue,
      fromState: 'plan',
      body,
      attempt,
      ports: {
        scope,
        cfg: { repo: 'example/project' },
        projectDir: process.cwd(),
        deps: {
          observeDependencyReadiness: async () => ({ status: 'ready', unfinished: [] }),
          reconcileDependencyDisposition: async () => {
            effects.push('reconcile');
          },
        },
        runGuards: async (from, to, context) => {
          const guard = await blockedByGuard.run(context);
          return {
            ok: guard.ok,
            status: guard.ok ? 'ready' : 'blocked',
            refusals: guard.ok ? [] : [{ id: 'blocked-by-not-done', reason: guard.reason }],
            humanDecision: null,
          };
        },
      },
    });
    assert.equal(result.status, 'ready');
    assert.deepEqual(effects, []);
  });

  test('a ready early explanation is not a grant after dependency readiness changes', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    const issue = 1751;
    const scope = computeScopeIdentity({ repository: 'example/project', issue, body });
    const attempt = createObservationAttempt({
      repository: 'example/project',
      issue,
      boundaryId: 'action:promote:dependency:1751',
      now,
      read: async (request) => ({
        ...request,
        value:
          request.resource === 'issue-body'
            ? { number: issue, body }
            : request.resource === 'project-board'
              ? { state: 'plan' }
              : { active: false },
      }),
    });
    let dependencyDone = true;
    const runGuards = async () =>
      dependencyDone
        ? { ok: true, status: 'ready', refusals: [], humanDecision: null }
        : {
            ok: false,
            status: 'blocked',
            refusals: [
              {
                id: 'blocked-by-not-done',
                guardId: 'blocked-by-not-done',
                code: 'unclassified-refusal',
                args: {},
                noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
                reason: 'cannot exit because #1750 is open',
              },
            ],
            humanDecision: null,
          };
    const explanation = await collectEarlyPromoteReadiness({
      issue,
      fromState: 'plan',
      body,
      attempt,
      ports: { scope, cfg: { repo: 'example/project' }, projectDir: process.cwd(), runGuards },
    });
    assert.equal(explanation.status, 'ready');
    dependencyDone = false;
    const effects = [];
    const result = await runPromote({
      issueNumber: issue,
      cfg: { repo: 'example/project' },
      deps: {
        assertBound: () => {},
        fetchIssueBody: async () => ({ body }),
        getLiveState: async () => 'plan',
        resolveProjectDir: () => process.cwd(),
        sessionPolicy: {},
        runGuards,
        runMoveState: async () => {
          effects.push('transition');
          return 0;
        },
      },
    });
    assert.equal(result.status, 'blocked-refused');
    assert.deepEqual(effects, []);
  });

  test('a migration freeze activated before locked execution refuses without reading or moving', async () => {
    const effects = [];
    const result = await runPromote({
      issueNumber: 1751,
      cfg: { repo: 'example/project' },
      deps: {
        assertBound: () => {},
        migrationFreezeActive: () => true,
        fetchIssueBody: async () => {
          effects.push('read');
          return { body };
        },
        runMoveState: async () => {
          effects.push('move');
          return 0;
        },
      },
    });
    assert.equal(result.status, 'migration-freeze');
    assert.deepEqual(effects, []);
  });

  test('early readiness shares execution session policy and story-intent resolver', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    const seen = [];
    const attempt = {
      observe: async ({ resource }) => ({
        status: 'observed',
        resource,
        value:
          resource === 'issue-body'
            ? { number: 1751, body }
            : resource === 'project-board'
              ? { state: 'plan' }
              : { active: false },
      }),
    };
    const resolver = async () => ({ ok: true, source: 'linked-plan-task', digest: 'example' });
    await collectEarlyPromoteReadiness({
      issue: 1751,
      fromState: 'plan',
      body,
      attempt,
      ports: {
        scope: 'shared-authority',
        cfg: { repo: 'example/project' },
        projectDir: process.cwd(),
        currentSessionId: () => 'session-1751',
        loadSession: (id) => {
          seen.push(id);
          return { gates: { analysisToDevelopment: true } };
        },
        resolveStoryIntent: resolver,
        runGuards: async (_from, _to, ctx) => {
          assert.equal(ctx.sessionPolicy.gates.analysisToDevelopment, true);
          assert.equal(ctx.deps.resolveStoryIntent, resolver);
          return { ok: true, status: 'ready', refusals: [] };
        },
        loadPolicy: async () => ({ status: 'observed' }),
      },
    });
    assert.deepEqual(seen, ['session-1751']);
  });

  test('a real plan-approval guard refuses the same missing marker in explanation and execution', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    const refusal = async (_from, _to, ctx) => {
      const result = await planApprovedGuard.run(ctx);
      return result.ok
        ? { ok: true, status: 'ready', refusals: [], humanDecision: null }
        : {
            ok: false,
            status: 'blocked',
            refusals: [{ id: planApprovedGuard.id, reason: result.reason }],
            humanDecision: null,
          };
    };
    const attempt = {
      observe: async ({ resource }) => ({
        status: 'observed',
        resource,
        value:
          resource === 'issue-body'
            ? { number: 1751, body }
            : resource === 'project-board'
              ? { state: 'plan' }
              : { active: false },
      }),
    };
    const sessionPolicy = { gates: { analysisToDevelopment: true } };
    const explanation = await collectEarlyPromoteReadiness({
      issue: 1751,
      fromState: 'plan',
      body,
      attempt,
      ports: {
        scope: 'real-plan-gate',
        cfg: { repo: 'example/project', gateAnalysisToDevelopment: false },
        projectDir: process.cwd(),
        sessionPolicy,
        runGuards: refusal,
        loadPolicy: async () => ({ status: 'observed' }),
      },
    });
    assert.equal(explanation.status, 'blocked');
    assert.equal(explanation.blockers[0].guardId, planApprovedGuard.id);
    const effects = [];
    const execution = await runPromote({
      issueNumber: 1751,
      cfg: { repo: 'example/project', gateAnalysisToDevelopment: false },
      deps: {
        assertBound: () => {},
        migrationFreezeActive: () => false,
        resolveProjectDir: () => process.cwd(),
        fetchIssueBody: async () => ({ body }),
        getLiveState: async () => 'plan',
        sessionPolicy,
        runGuards: refusal,
        runMoveState: async () => {
          effects.push('move-refused');
          return 1;
        },
        loadWorkflowBoundary: async () => ({ status: 'observed' }),
      },
    });
    assert.equal(execution.status, 'transition-failed');
    assert.deepEqual(effects, ['move-refused']);
  });

  test('complete production early registry retains field, parent, dependency, contiguity, and plan refusals', async () => {
    const { collectEarlyPromoteReadiness } =
      await import('../../task-tracker/lib/action-decision/promote.mjs');
    const cases = [
      {
        from: 'backlog',
        bodyValue: body.replace('state="plan"', 'state="backlog"'),
        expected: ['backlog-exit-child-parent-refine-or-plan'],
      },
      {
        from: 'refine',
        bodyValue: body.replace('state="plan"', 'state="refine"'),
        expected: ['plan-entry-fields-body', 'contiguity-entry'],
      },
      {
        from: 'ready-for-plan',
        bodyValue: body.replace('state="plan"', 'state="ready-for-plan"'),
        expected: ['blocked-by-not-done'],
      },
      {
        from: 'plan',
        bodyValue: body,
        expected: ['plan-exit-deep-dive', 'plan-exit-plan-metadata', 'plan-exit-planned-estimate'],
      },
    ];
    for (const scenario of cases) {
      const deps = {
        fetchParentIssue: async () => (scenario.from === 'backlog' ? 1665 : null),
        readParentStatus: async () => 'done',
        observeDependencyReadiness: async () => ({ status: 'blocked', unfinished: [1750] }),
        reconcileDependencyDisposition: async () => ({ status: 'idempotent' }),
        plannedEstimate: { listComments: async () => [] },
      };
      const cfg = { repo: 'example/project', projectId: 'project-1751' };
      let explanationGuards;
      const captureExplanation = async (from, to, ctx, options) => {
        const result = await productionGuards(from, to, ctx, options);
        explanationGuards = result;
        return result;
      };
      const attempt = {
        observe: async ({ resource }) => ({
          status: 'observed',
          resource,
          value:
            resource === 'issue-body'
              ? { number: 1751, body: scenario.bodyValue }
              : resource === 'project-board'
                ? { state: scenario.from }
                : { active: false },
        }),
      };
      const explanation = await collectEarlyPromoteReadiness({
        issue: 1751,
        fromState: scenario.from,
        body: scenario.bodyValue,
        attempt,
        ports: {
          scope: `registry:${scenario.from}`,
          cfg,
          deps,
          sessionPolicy: { gates: { analysisToDevelopment: true } },
          projectDir: process.cwd(),
          runGuards: captureExplanation,
          loadPolicy: async () => ({ status: 'observed', isWaived: () => false }),
        },
      });
      const ids = explanation.blockers.map((blocker) => blocker.guardId);
      assert.deepEqual(
        ids,
        explanationGuards.refusals.map((refusal) => refusal.guardId)
      );
      for (const expected of scenario.expected)
        assert.ok(ids.includes(expected), `${scenario.from}: ${ids}`);
      assert.notEqual(explanation.status, 'ready');
      const effects = [];
      let executionGuards;
      let executionContext;
      let lowerGuards;
      const captureExecution = async (from, to, ctx, options) => {
        const result = await productionGuards(from, to, ctx, options);
        executionGuards = result;
        executionContext = ctx;
        return result;
      };
      const execution = await runPromote({
        issueNumber: 1751,
        cfg,
        deps: {
          ...deps,
          assertBound: () => {},
          migrationFreezeActive: () => false,
          resolveProjectDir: () => process.cwd(),
          fetchIssueBody: async () => ({ body: scenario.bodyValue }),
          getLiveState: async () => scenario.from,
          sessionPolicy: { gates: { analysisToDevelopment: true } },
          runGuards: captureExecution,
          loadWorkflowBoundary: async () => ({ status: 'observed', isWaived: () => false }),
          runMoveState: async () => {
            const lower = await productionGuards(
              scenario.from,
              explanation.target,
              executionContext
            );
            lowerGuards = lower;
            effects.push(lower.ok ? 'lower-accepted' : 'lower-refused');
            return lower.ok ? 0 : 1;
          },
          mutateIssueBody: async () => {
            effects.push('body-write');
          },
        },
      });
      assert.notEqual(execution.status, 'promoted');
      assert.ok(execution.status.endsWith('refused') || execution.status === 'transition-failed');
      assert.deepEqual(
        executionGuards.refusals.map((refusal) => refusal.guardId),
        ids
      );
      assert.deepEqual(
        executionGuards.refusals.map((refusal) => refusal.code),
        explanationGuards.refusals.map((refusal) => refusal.code)
      );
      assert.ok(!effects.includes('lower-accepted'));
      if (scenario.from === 'backlog') {
        assert.deepEqual(effects, ['lower-refused']);
        assert.deepEqual(
          lowerGuards.refusals.map((refusal) => refusal.guardId),
          ids
        );
        assert.deepEqual(
          lowerGuards.refusals.map((refusal) => refusal.code),
          explanationGuards.refusals.map((refusal) => refusal.code)
        );
      }
      assert.ok(!effects.includes('body-write'));
    }
  });
}
