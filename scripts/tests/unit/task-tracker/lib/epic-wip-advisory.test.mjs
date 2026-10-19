// @story #2031
import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyRankWavePorts } from '../../../fixtures/legacy-rank-wave.mjs';
import {
  wipAdvanceDecision,
  findNextEligibleChild,
} from '../../../../task-tracker/lib/epic-children-gate.mjs';
import { refineExitWipBudgetGuard } from '../../../../task-tracker/lib/refine-exit-wip-budget-guard.mjs';
import { STATES } from '../../../../task-tracker/states/index.mjs';
const child = (number, state, extra = {}) => ({
  number,
  state,
  boardState: state,
  rank: number,
  blockedBy: [],
  dependencyStates: new Map(),
  dependencyReadiness: 'ready',
  hasCurrentRefinement: true,
  ...extra,
});
const children = [child(11, 'develop', { blockedBy: [9] }), child(12, 'ready-for-plan')];
const warning = { code: 'epic-wip-capacity-exceeded', args: { activeIssues: '#11', budget: 1 } };
const context = (setting) => ({
  cfg: {
    repo: 'o/r',
    projectId: 'PVT_1',
    ...(setting === undefined ? {} : { gatePlanRefineWip: setting }),
  },
  issueNumber: 12,
  fromState: 'ready-for-plan',
  toState: 'plan',
  readOnly: true,
  deps: {
    fetchParentIssue: async () => 100,
    epicChildren: { ...legacyRankWavePorts, fetchSiblings: async () => children },
  },
});

test('active and held siblings produce an advisory without preventing dependency-ready selection', () => {
  const decision = wipAdvanceDecision({ promotingNumber: 12, children });
  assert.equal(decision.ok, true);
  assert.deepEqual(decision.warnings, [warning]);
  assert.equal(findNextEligibleChild(children)?.number, 12);
  assert.equal(
    findNextEligibleChild([
      children[0],
      child(12, 'ready-for-plan', {
        blockedBy: [11],
        dependencyStates: new Map([[11, 'develop']]),
        dependencyReadiness: 'blocked',
      }),
    ]),
    null
  );
});
for (const setting of [undefined, true, false])
  test(`legacy setting ${setting} preserves typed capacity warning through the registered guard`, async () => {
    const ctx = context(setting);
    const guard = STATES['ready-for-plan'].exitGuards.find(
      (g) => g.id === refineExitWipBudgetGuard.id
    );
    assert.ok(guard);
    const result = await guard.run(ctx);
    assert.equal(result.ok, true);
    assert.deepEqual(result.warnings, [warning]);
    const registry = await import(
      `../../../../task-tracker/lib/guard-registry.mjs?advisory=${setting}`
    );
    registry.registerGuard('ready-for-plan', 'exit', guard);
    const aggregated = await registry.runGuards('ready-for-plan', 'plan', ctx);
    assert.equal(aggregated.status, 'ready');
    assert.equal(aggregated.warns[0].code, warning.code);
    assert.deepEqual(aggregated.warns[0].args, warning.args);
  });
test('unreadable sibling authority still refuses admission', async () => {
  const ctx = context(false);
  ctx.deps.epicChildren.fetchSiblings = async () => {
    throw new Error('provider unavailable');
  };
  const result = await refineExitWipBudgetGuard.run(ctx);
  assert.equal(result.ok, false);
  assert.match(result.reason, /provider unavailable/);
});

test('a typed WIP warning cannot override the production native dependency guard', async () => {
  const ctx = context(false);
  ctx.cfg.fieldDisposition = 'DISPOSITION';
  ctx.readDependencies = async () => ({ blockedBy: [11] });
  ctx.fetchBlockerState = async () => 'develop';
  ctx.deps.dependencyDisposition = { readDisposition: async () => 'BLOCKED' };
  const registry =
    await import('../../../../task-tracker/lib/guard-registry.mjs?advisory=dependency');
  const selected = STATES['ready-for-plan'].exitGuards.filter((g) =>
    ['blocked-by-not-done', refineExitWipBudgetGuard.id].includes(g.id)
  );
  assert.equal(selected.length, 2);
  for (const guard of selected) registry.registerGuard('ready-for-plan', 'exit', guard);
  const result = await registry.runGuards('ready-for-plan', 'plan', ctx);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.warns[0].code, warning.code);
  assert.ok(
    result.refusals.some(
      (r) => r.id === 'blocked-by-not-done' && r.reason.includes('#11 (develop)')
    )
  );
});

test('the mutation host prints active sibling advice without changing the ready exit status', async (t) => {
  const { runGuardExecution } =
    await import('../../../../task-tracker/lib/move-state/guard-execution.mjs');
  const registry = await import('../../../../task-tracker/lib/guard-registry.mjs?advisory=host');
  registry.registerGuard('ready-for-plan', 'exit', refineExitWipBudgetGuard);
  const warnings = [];
  t.mock.method(console, 'warn', (message) => {
    warnings.push(message);
  });
  const result = await runGuardExecution({
    issueArg: '12',
    stateArg: 'plan',
    resolvedFromState: 'ready-for-plan',
    plan: { runGuardPipeline: true },
    cfg: context(false).cfg,
    projectDir: process.cwd(),
    boundarySnapshot: { body: { value: '' } },
    sessionPolicy: {},
    _runGuards: (from, to, ctx) => registry.runGuards(from, to, { ...ctx, ...context(false) }),
  });
  assert.equal(result.exit, null);
  assert.ok(warnings.some((message) => message.includes('#11') && message.includes('budget=1')));
});

for (const blocked of [false, true])
  test(`Explain retains the registered capacity warning when dependency readiness is ${blocked ? 'blocked' : 'ready'}`, async () => {
    const { createObservationAttempt } =
      await import('../../../../task-tracker/lib/action-decision/observations.mjs');
    const { evaluateAction } =
      await import('../../../../task-tracker/lib/action-decision/evaluate.mjs');
    const registry = await import(
      `../../../../task-tracker/lib/guard-registry.mjs?advisory=explain-${blocked}`
    );
    const selected = STATES['ready-for-plan'].exitGuards.filter((guard) =>
      ['blocked-by-not-done', refineExitWipBudgetGuard.id].includes(guard.id)
    );
    assert.equal(selected.length, 2);
    for (const guard of selected) registry.registerGuard('ready-for-plan', 'exit', guard);
    const ctx = context(false);
    const body =
      '<!-- aitm-last-known-state state="ready-for-plan" ts="2026-10-18T00:00:00.000Z" -->\n## User Story\nAs a delivery operator, prepare independent work.\n## Scope\nPrepare independent work.\n## Acceptance Criteria\n- [ ] Surface a capacity warning.\n';
    const decision = await evaluateAction({
      actionId: 'promote',
      repository: ctx.cfg.repo,
      issue: ctx.issueNumber,
      inputs: {
        state: 'ready-for-plan',
        head: 'a'.repeat(40),
        body,
        sessionState: {},
        config: ctx.cfg,
      },
      attempt: createObservationAttempt({
        repository: ctx.cfg.repo,
        issue: ctx.issueNumber,
        boundaryId: `explain:promote:${ctx.issueNumber}`,
        now: () => '2026-10-18T00:00:00.000Z',
        read: async (request) => ({
          ...request,
          value:
            request.resource === 'issue-body'
              ? { number: ctx.issueNumber, body }
              : request.resource === 'project-board'
                ? { state: 'ready-for-plan' }
                : { active: false },
        }),
      }),
      deps: {
        effectAttempts: () => [],
        promotePorts: {
          projectDir: process.cwd(),
          sessionPolicy: {},
          runGuards: (from, to, current) =>
            registry.runGuards(from, to, {
              ...current,
              ...ctx,
              readDependencies: async () => ({ blockedBy: blocked ? [11] : [] }),
              fetchBlockerState: async () => 'develop',
              reconcileDisposition: async () => {},
            }),
        },
      },
    });
    assert.equal(decision.status, blocked ? 'blocked' : 'ready', JSON.stringify(decision));
    assert.deepEqual(decision.warnings, [warning]);
    if (blocked)
      assert.ok(decision.blockers.some(({ guardId }) => guardId === 'blocked-by-not-done'));
    else assert.deepEqual(decision.blockers, []);
  });
