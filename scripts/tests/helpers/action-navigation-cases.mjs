// @story #1752
import assert from 'node:assert/strict';
import { evaluateAction } from '../../task-tracker/lib/action-decision/evaluate.mjs';
import { createObservationAttempt } from '../../task-tracker/lib/action-decision/observations.mjs';
import { validateActionDecision } from '../../task-tracker/lib/action-decision/contract.mjs';
import { runPromote } from '../../task-tracker/verbs/promote.mjs';

export function registerActionNavigationCases({ test, body, now }) {
  test('production evaluator routes a complete bind collector and finishes one v2 attempt', async () => {
    const issue = 1752;
    const repository = 'example/project';
    const config = {
      repo: repository,
      projectId: 'project-1752',
      preferences: { gateAssigneeMatch: false },
    };
    const sessionState = { active: null, paused: false };
    const effects = [];
    const reads = [];
    const raw = createObservationAttempt({
      repository,
      issue,
      boundaryId: 'action:bind:1752',
      now,
      read: async (request) => {
        reads.push(request.resource);
        const values = {
          'local-config': { repo: repository, projectId: 'project-1752', gateAssigneeMatch: false },
          'session-state': sessionState,
          worktree: { matches: true },
          occupancy: { available: true },
          'migration-journal': { active: false },
          'project-board': { state: 'plan', assignees: [] },
          'issue-body': { number: issue, body },
        };
        return { ...request, value: values[request.resource] };
      },
    });
    let finishes = 0;
    const attempt = {
      observe: raw.observe,
      finish: (...args) => {
        finishes += 1;
        return raw.finish(...args);
      },
    };
    const decision = await evaluateAction({
      actionId: 'bind',
      repository,
      issue,
      inputs: { state: 'plan', head: 'a'.repeat(40), body, sessionState, config },
      attempt,
      deps: { effectAttempts: () => effects },
    });
    assert.equal(decision.status, 'ready');
    assert.deepEqual(decision.blockers, []);
    assert.equal(finishes, 1);
    assert.deepEqual(reads, [
      'local-config',
      'session-state',
      'worktree',
      'occupancy',
      'migration-journal',
      'project-board',
      'issue-body',
    ]);
    assert.deepEqual(effects, []);
    assert.deepEqual(validateActionDecision(decision), decision);
  });

  test('production evaluator routes complete early promotion without an effect', async () => {
    const issue = 1752;
    const repository = 'example/project';
    const effects = [];
    const attempt = createObservationAttempt({
      repository,
      issue,
      boundaryId: 'action:promote:1752',
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
    const decision = await evaluateAction({
      actionId: 'promote',
      repository,
      issue,
      inputs: { state: 'plan', head: 'a'.repeat(40), body, config: { repo: repository } },
      attempt,
      deps: {
        effectAttempts: () => effects,
        promotePorts: {
          runGuards: async () => ({ ok: true, status: 'ready', refusals: [], humanDecision: null }),
        },
      },
    });
    assert.equal(decision.status, 'ready');
    assert.deepEqual(decision.blockers, []);
    assert.deepEqual(effects, []);
    assert.deepEqual(validateActionDecision(decision), decision);
  });

  test('production evaluator routes explicit resume through complete session authority', async () => {
    const issue = 1752;
    const repository = 'example/project';
    const config = {
      repo: repository,
      projectId: 'project-1752',
      preferences: { gateAssigneeMatch: false },
    };
    const sessionState = { active: null, paused: true, lastActive: '#1752' };
    const values = {
      'local-config': { repo: repository, projectId: 'project-1752', gateAssigneeMatch: false },
      'session-state': sessionState,
      worktree: { matches: true },
      occupancy: { available: true },
      'migration-journal': { active: false },
      'project-board': { state: 'plan', assignees: [] },
      'issue-body': { number: issue, body },
    };
    const effects = [];
    const attempt = createObservationAttempt({
      repository,
      issue,
      boundaryId: 'action:resume:1752',
      now,
      read: async (request) => ({ ...request, value: values[request.resource] }),
    });
    const decision = await evaluateAction({
      actionId: 'resume',
      repository,
      issue,
      inputs: { state: 'plan', head: 'a'.repeat(40), body, sessionState, config },
      attempt,
      deps: { effectAttempts: () => effects },
    });
    assert.equal(decision.status, 'ready');
    assert.equal(decision.actionId, 'resume');
    assert.deepEqual(effects, []);
    assert.deepEqual(validateActionDecision(decision), decision);
  });

  test('v2 navigation rejects rebind and unresolved state while keeping Done terminal', async () => {
    const issue = 1752;
    const repository = 'example/project';
    for (const [actionId, state, code, expectedAction] of [
      ['rebind', 'plan', 'unknown-vocabulary', 'rebind'],
      ['promote', 'mystery', 'state-unavailable', null],
      ['promote', { recorded: 'plan', live: 'develop' }, 'state-unavailable', null],
      ['promote', 'develop', 'action-not-explain-ready', 'promote'],
      ['promote', 'test', 'action-not-explain-ready', 'promote'],
      ['promote', 'review', 'action-not-explain-ready', 'promote'],
    ]) {
      const effects = [];
      const attempt = createObservationAttempt({
        repository,
        issue,
        boundaryId: `action:${actionId}:${String(state)}:1752`,
        now,
        read: async (request) => ({ ...request, value: { number: issue, body } }),
      });
      const decision = await evaluateAction({
        actionId,
        repository,
        issue,
        inputs: { state, head: 'a'.repeat(40), body },
        attempt,
        deps: { effectAttempts: () => effects },
      });
      assert.equal(decision.status, 'indeterminate');
      assert.equal(decision.blockers[0].code, code);
      assert.equal(decision.actionId, expectedAction);
      assert.deepEqual(effects, []);
      assert.deepEqual(validateActionDecision(decision), decision);
    }
    const doneBody = body.replace('state="plan"', 'state="done"');
    const doneAttempt = createObservationAttempt({
      repository,
      issue,
      boundaryId: 'action:done:1752',
      now,
      read: async (request) => ({ ...request, value: { number: issue, body: doneBody } }),
    });
    const done = await evaluateAction({
      actionId: 'promote',
      repository,
      issue,
      inputs: { state: 'done', head: 'a'.repeat(40), body: doneBody },
      attempt: doneAttempt,
      deps: { effectAttempts: () => [] },
    });
    assert.deepEqual(
      [done.status, done.actionId, done.guidanceIds],
      ['ready', null, ['state.done']]
    );
    assert.deepEqual(validateActionDecision(done), done);
  });

  test('a ready v2 explanation never authorizes stale promotion execution', async () => {
    const issue = 1752;
    const repository = 'example/project';
    let dependencyReady = true;
    const effects = [];
    const guards = async () =>
      dependencyReady
        ? { ok: true, status: 'ready', refusals: [], humanDecision: null }
        : {
            ok: false,
            status: 'blocked',
            refusals: [{ id: 'blocked-by-not-done', reason: 'dependency remains open' }],
            humanDecision: null,
          };
    const attempt = createObservationAttempt({
      repository,
      issue,
      boundaryId: 'action:promote:drift:1752',
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
    const decision = await evaluateAction({
      actionId: 'promote',
      repository,
      issue,
      inputs: { state: 'plan', head: 'a'.repeat(40), body, config: { repo: repository } },
      attempt,
      deps: {
        effectAttempts: () => effects,
        promotePorts: { projectDir: process.cwd(), runGuards: guards },
      },
    });
    assert.equal(decision.status, 'ready');
    dependencyReady = false;
    const execution = await runPromote({
      issueNumber: issue,
      cfg: { repo: repository },
      deps: {
        assertBound: () => {},
        migrationFreezeActive: () => false,
        resolveProjectDir: () => process.cwd(),
        fetchIssueBody: async () => ({ body }),
        getLiveState: async () => 'plan',
        runGuards: guards,
        runMoveState: async () => {
          effects.push('move');
          return 0;
        },
      },
    });
    assert.equal(execution.status, 'blocked-refused');
    assert.deepEqual(effects, []);
  });

  test('v2 early promotion preserves typed plan-approval remediation and human request', async () => {
    const issue = 1752;
    const repository = 'example/project';
    const attempt = createObservationAttempt({
      repository,
      issue,
      boundaryId: 'action:promote:approval:1752',
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
    const decision = await evaluateAction({
      actionId: 'promote',
      repository,
      issue,
      inputs: { state: 'plan', head: 'a'.repeat(40), body, config: { repo: repository } },
      attempt,
      deps: {
        effectAttempts: () => [],
        promotePorts: {
          projectDir: process.cwd(),
          runGuards: async () => ({
            ok: false,
            status: 'blocked',
            humanDecision: null,
            refusals: [
              {
                id: 'plan-exit-plan-approved',
                guardId: 'plan-exit-plan-approved',
                code: 'plan-approval-missing',
                args: {},
                remediation: { id: 'record-plan-approval', args: { issue } },
                reason: 'plan approval missing',
              },
            ],
          }),
          loadPolicy: async () => ({ status: 'observed' }),
        },
      },
    });
    assert.equal(decision.status, 'blocked');
    assert.equal(decision.blockers[0].code, 'plan-approval-missing');
    assert.deepEqual(decision.humanDecision?.requests[0], {
      kind: 'plan-approval',
      actor: 'configured-approver',
      subject: { issue, actionId: 'promote' },
      args: {},
    });
    assert.deepEqual(validateActionDecision(decision), decision);
  });

  test('matching recorded and live state selects one canonical early edge', async () => {
    const issue = 1752;
    const repository = 'example/project';
    const attempt = createObservationAttempt({
      repository,
      issue,
      boundaryId: 'action:promote:matching-state:1752',
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
    const decision = await evaluateAction({
      actionId: 'promote',
      repository,
      issue,
      inputs: {
        state: { recorded: 'plan', live: 'plan' },
        head: 'a'.repeat(40),
        body,
        config: { repo: repository },
      },
      attempt,
      deps: {
        effectAttempts: () => [],
        promotePorts: {
          projectDir: process.cwd(),
          runGuards: async () => ({ ok: true, status: 'ready', refusals: [], humanDecision: null }),
        },
      },
    });
    assert.equal(decision.status, 'ready');
    assert.equal(decision.snapshot.state, 'plan');
  });

  test('missing effect ledger does not erase unknown navigation authority', async () => {
    const issue = 1752;
    const repository = 'example/project';
    for (const [actionId, state, code] of [
      ['rebind', 'plan', 'unknown-vocabulary'],
      ['promote', 'mystery', 'state-unavailable'],
    ]) {
      const attempt = createObservationAttempt({
        repository,
        issue,
        boundaryId: `action:missing-ledger:${actionId}:1752`,
        now,
        read: async (request) => ({ ...request, value: { number: issue, body } }),
      });
      const decision = await evaluateAction({
        actionId,
        repository,
        issue,
        inputs: { state, head: 'a'.repeat(40), body },
        attempt,
      });
      assert.equal(decision.status, 'indeterminate');
      assert.ok(decision.blockers.some((blocker) => blocker.code === code));
      assert.ok(decision.blockers.some((blocker) => blocker.code === 'guard-result-invalid'));
      assert.deepEqual(validateActionDecision(decision), decision);
    }
  });

  test('session navigation refuses a stale proposed state despite internally matching board and marker', async () => {
    const issue = 1752;
    const repository = 'example/project';
    const changedBody = body.replace('state="plan"', 'state="develop"');
    const config = {
      repo: repository,
      projectId: 'project-1752',
      preferences: { gateAssigneeMatch: false },
    };
    const sessionState = { active: null, paused: false };
    const values = {
      'local-config': { repo: repository, projectId: 'project-1752', gateAssigneeMatch: false },
      'session-state': sessionState,
      worktree: { matches: true },
      occupancy: { available: true },
      'migration-journal': { active: false },
      'project-board': { state: 'develop', assignees: [] },
      'issue-body': { number: issue, body: changedBody },
    };
    const attempt = createObservationAttempt({
      repository,
      issue,
      boundaryId: 'action:bind:stale-state:1752',
      now,
      read: async (request) => ({ ...request, value: values[request.resource] }),
    });
    const decision = await evaluateAction({
      actionId: 'bind',
      repository,
      issue,
      inputs: { state: 'plan', head: 'a'.repeat(40), body: changedBody, sessionState, config },
      attempt,
      deps: { effectAttempts: () => [] },
    });
    assert.equal(decision.status, 'indeterminate');
    assert.equal(decision.blockers[0].code, 'state-unavailable');
    assert.deepEqual(decision.blockers[0].args, { reason: 'conflicting' });
    assert.deepEqual(validateActionDecision(decision), decision);
  });

  test('network-skipped early promotion emits valid v2 uncertainty without remote reads', async () => {
    const issue = 1752;
    const repository = 'example/project';
    const reads = [];
    const attempt = createObservationAttempt({
      repository,
      issue,
      boundaryId: 'action:promote:skipped:1752',
      now,
      read: async (request) => {
        reads.push(request.resource);
        return { ...request, value: { active: false } };
      },
    });
    const decision = await evaluateAction({
      actionId: 'promote',
      repository,
      issue,
      inputs: { state: 'plan', head: 'a'.repeat(40), body, config: { repo: repository } },
      attempt,
      deps: { effectAttempts: () => [], promotePorts: { skipNetwork: true } },
    });
    assert.equal(decision.status, 'indeterminate');
    assert.deepEqual(
      decision.blockers.map((blocker) => blocker.code),
      ['authority-read-skipped', 'authority-read-skipped']
    );
    assert.deepEqual(reads, ['migration-journal']);
    assert.deepEqual(validateActionDecision(decision), decision);
  });
}
