// @story #1872
import test from 'node:test';
import assert from 'node:assert/strict';
import { refineExitWipBudgetGuard } from '../../../../task-tracker/lib/refine-exit-wip-budget-guard.mjs';
import { freezeRankGraph } from '../../../../task-tracker/lib/epic-rank-wave-policy.mjs';
import { runGuards } from '../../../../task-tracker/lib/guard-registry.mjs';
import '../../../../task-tracker/lib/guard-bootstrap.mjs';
function fixture(status = 'ready') {
  const children = [140, 144].map((number) => ({
    number,
    rank: 2,
    state: number === 140 ? 'plan' : 'ready-for-plan',
    boardState: number === 140 ? 'plan' : 'ready-for-plan',
    issueState: 'open',
    closeReason: null,
    recoveryPhase: null,
    refinementDigest: 'a'.repeat(64),
    hasCurrentRefinement: true,
    blockedBy: [],
    dependencyStates: new Map(),
    dependencyReadiness: 'ready',
  }));
  const runtime = {
    async readSnapshot() {
      return { children };
    },
    async verifyBindings() {
      return { ok: true };
    },
  };
  const publication = {
    status,
    snapshot: { children },
    record: {
      rank: 2,
      members: [140, 144],
      graph: freezeRankGraph(children),
      bindings: [],
      parent: {},
    },
  };
  return {
    cfg: { repo: 'o/r' },
    issueNumber: 144,
    projectDir: '/unused',
    deps: {
      fetchParentIssue: async () => 107,
      epicChildren: {
        fetchSiblings: async () => children,
        rankWaveRuntime: runtime,
        inspectRankWavePublication: async () => publication,
      },
    },
  };
}
test('R4P Plan and Plan Develop use the same opted-in admission observation and typed refusal', async () => {
  for (const status of ['ready', 'revoked', 'expired', 'publication-incomplete']) {
    const ctx = fixture(status);
    const plan = await refineExitWipBudgetGuard.run({
      ...ctx,
      fromState: 'ready-for-plan',
      toState: 'plan',
      readOnly: true,
    });
    const develop = await refineExitWipBudgetGuard.run({
      ...ctx,
      fromState: 'plan',
      toState: 'develop',
      readOnly: true,
    });
    assert.equal(plan.ok, status === 'ready');
    assert.deepEqual(plan, develop);
    if (status !== 'ready') {
      assert.equal(plan.code, 'rank-wave-admission-refused');
      assert.equal(plan.args.reason, `rank-wave-${status}`);
    }
  }
});
test('Plan Develop registry actually includes the rank-wave guard', async () => {
  const result = await runGuards('plan', 'develop', { ...fixture('revoked'), readOnly: true });
  assert.ok(
    result.refusals.some(
      (r) => r.id === 'refine-exit-wip-budget' && r.code === 'rank-wave-admission-refused'
    )
  );
});

test('serialized public Promote takes the common parent lock before the child lock and passes its context', async () => {
  const { runSerializedPromote } = await import('../../../../task-tracker/verbs/promote.mjs');
  const order = [],
    context = { proof: 'test-only' };
  const result = await runSerializedPromote({
    issueNumber: 144,
    cfg: { repo: 'o/r' },
    deps: {
      projectDir: '/unused',
      fetchParentIssue: async () => 107,
      withEpicAdmissionLock: async (options, fn) => {
        order.push(`parent:${options.epic}`);
        return fn(context);
      },
      withIssueLock: async (options, fn) => {
        order.push(`child:${options.issue}`);
        return fn();
      },
      promoteRunner: async ({ deps }) => {
        assert.equal(deps.admissionLockContext, context);
        order.push('runner');
        return { status: 'promoted' };
      },
    },
  });
  assert.equal(result.status, 'promoted');
  assert.deepEqual(order, ['parent:107', 'child:144', 'runner']);
});

test('Explain collector, direct Plan and pull-next agree without admitting a second child on revoked authority', async () => {
  const { collectEarlyPromoteReadiness } =
    await import('../../../../task-tracker/lib/action-decision/promote.mjs');
  const { runPlan } = await import('../../../../task-tracker/verbs/plan.mjs');
  const { runPullNext } = await import('../../../../task-tracker/verbs/pull-next.mjs');
  for (const status of ['ready', 'revoked', 'expired', 'publication-incomplete']) {
    const ctx = fixture(status),
      effects = [];
    const guard = () => refineExitWipBudgetGuard.run({ ...ctx, toState: 'plan', readOnly: true });
    await runPlan({
      issueNumber: 144,
      cfg: ctx.cfg,
      deps: {
        assertBound() {},
        getLiveState: async () => 'ready-for-plan',
        verbPromote: async () => {
          effects.push(await guard());
        },
      },
    });
    const direct = effects[0];
    const pull = await runPullNext({
      epicNumber: 107,
      cfg: ctx.cfg,
      deps: {
        projectDir: '/unused',
        withEpicAdmissionLock: async (_, fn) => fn({}),
        withIssueLock: async (_, fn) => fn(),
        getLiveState: async () => 'develop',
        audit: async () => ({ ok: true }),
        epicChildren: {
          fetchSiblings: async () =>
            ctx.deps.epicChildren.rankWaveRuntime.readSnapshot().then((s) => s.children),
        },
        enrich: {},
        getChildLiveState: async () => 'plan',
        rankWave: ctx.deps.epicChildren,
        observeRankWaveAdmission: async (args) => {
          const { observeRankWaveAdmission } =
            await import('../../../../task-tracker/lib/epic-rank-wave-admission.mjs');
          return observeRankWaveAdmission({ ...args, readOnly: true });
        },
        promote: async () => effects.push('move'),
      },
    });
    assert.equal(pull.status, status === 'ready' ? 'pulled' : 'rank-wave-refused');
    assert.equal(direct.ok, status === 'ready');
    assert.equal(effects.filter((x) => x === 'move').length, status === 'ready' ? 1 : 0);
    const body =
      '<!-- aitm-last-known-state state="ready-for-plan" ts="2026-10-04T01:00:00.000Z" -->';
    const explainEffects = [];
    const explanation = await collectEarlyPromoteReadiness({
      issue: 144,
      fromState: 'ready-for-plan',
      body,
      attempt: {
        async observe(request) {
          return {
            status: 'observed',
            resource: request.resource,
            value:
              request.resource === 'issue-body'
                ? { number: 144, body }
                : request.resource === 'project-board'
                  ? { state: 'ready-for-plan' }
                  : { active: false },
          };
        },
      },
      ports: {
        scope: 'test-scope',
        cfg: ctx.cfg,
        projectDir: '/unused',
        sessionPolicy: {},
        deps: ctx.deps,
        runGuards: async (_from, _to, context) => {
          assert.equal(context.readOnly, true);
          const r = await refineExitWipBudgetGuard.run(context);
          return r.ok
            ? { ok: true, status: 'ready', refusals: [], humanDecision: null }
            : {
                ok: false,
                status: 'blocked',
                refusals: [
                  { id: 'refine-exit-wip-budget', guardId: 'refine-exit-wip-budget', ...r },
                ],
                humanDecision: null,
              };
        },
        loadPolicy: async () => {
          explainEffects.push('policy-read');
          return { status: 'observed' };
        },
      },
    });
    assert.equal(explanation.status, status === 'ready' ? 'ready' : 'blocked');
    if (status !== 'ready') assert.equal(explanation.blockers[0].code, direct.code);
    assert.deepEqual(explainEffects, []);
  }
});
