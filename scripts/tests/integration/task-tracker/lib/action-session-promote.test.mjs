// @story #1750
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import { evaluateSessionReadiness } from '../../../../task-tracker/lib/action-decision/session.mjs';
import { validateBlocker } from '../../../../task-tracker/lib/action-decision/contract.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import { registerEarlyPromoteCases } from '../../../helpers/action-early-promote-cases.mjs';
import { registerActionNavigationCases } from '../../../helpers/action-navigation-cases.mjs';
import { runPreflight } from '../../../../task-tracker/lib/verb-preflight.mjs';
import { resolveSessionActionInvocation } from '../../../../task-tracker/task-tracker.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  claimOccupancy,
  OccupancyConflictError,
  readOccupancy,
} from '../../../../task-tracker/lib/occupancy.mjs';
import {
  enforceVerbWorktreeBinding,
  ForeignWorktreeBindingError,
} from '../../../../task-tracker/lib/worktree-binding-guard.mjs';

const now = () => '2026-09-21T16:00:00.000Z';

test('rebind remains a cursor trigger, not a session action', async () => {
  await assert.rejects(
    evaluateSessionReadiness({ actionId: 'rebind', issue: 1750 }),
    /session-readiness:action/
  );
});

test('read-only bind reports skipped required authority as indeterminate', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const scope = 'session:1750';
  const effects = [];
  const attempt = createObservationAttempt({
    repository: 'example/project',
    issue: 1750,
    boundaryId: 'action:bind:1750',
    now,
    read: async (request) => {
      if (request.resource === 'project-board' || request.resource === 'issue-body') {
        return undefined;
      }
      return {
        ...request,
        value:
          request.resource === 'local-config'
            ? { repo: 'example/project', projectId: null, gateAssigneeMatch: false }
            : request.resource === 'session-state'
              ? { active: null, paused: false }
              : request.resource === 'migration-journal'
                ? { active: false }
                : request.resource === 'occupancy'
                  ? { available: true }
                  : { matches: true },
      };
    },
  });
  const result = await collectSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: { scope, skipNetwork: true, effectAttempts: effects },
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some((blocker) => blocker.code === 'authority-read-skipped'));
  for (const blocker of result.blockers)
    validateBlocker(blocker, { status: 'indeterminate', mixedStatus: true });
  assert.deepEqual(effects, []);
});

test('the execution TT_SKIP_NETWORK setting skips required explanation reads', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const previous = process.env.TT_SKIP_NETWORK;
  process.env.TT_SKIP_NETWORK = '1';
  try {
    const bodyValue = `## User Story\nAs an operator\nI want to bind because a session can refuse\nSo that I see readiness\n\n## Scope\nRead-only session readiness.\n\n## Acceptance Criteria\n- [ ] Bind is ready.\n\n<!-- aitm-last-known-state state="plan" ts="2026-09-21T16:00:00Z" -->`;
    const scope = computeScopeIdentity({
      repository: 'example/project',
      issue: 1750,
      body: bodyValue,
    });
    const { attempt } = completeSession({ bodyValue });
    const result = await collectSessionReadiness({
      actionId: 'bind',
      issue: 1750,
      stateBefore: { active: null, paused: false },
      config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
      attempt,
      ports: { scope, skipNetwork: false },
    });
    assert.equal(result.status, 'indeterminate');
    assert.ok(result.blockers.some((blocker) => blocker.code === 'authority-read-skipped'));
    assert.equal(
      result.observations.some((observation) => observation.resource === 'project-board'),
      false
    );
  } finally {
    if (previous === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = previous;
  }
});

const body = `## User Story
As an operator
I want to inspect readiness because a bind can refuse
So that I do not change a session accidentally

## Scope
Read-only bind readiness for the selected issue.

## Acceptance Criteria
- [ ] The same known refusal is shown before execution.

<!-- aitm-last-known-state state="plan" ts="2026-09-21T16:00:00Z" -->`;
const issueScope = computeScopeIdentity({ repository: 'example/project', issue: 1750, body });

function completeSession({
  boardState = 'plan',
  worktreeMatches = true,
  assignees = [],
  currentUser = 'alice',
  gateAssigneeMatch = false,
  sessionState = { active: null, paused: false },
  boardReadable = true,
  bodyValue = body,
  occupancyAvailable = true,
  migrationFreezeActive = false,
} = {}) {
  const effects = [];
  const read = async (request) => {
    let value;
    switch (request.resource) {
      case 'local-config':
        value = { repo: 'example/project', projectId: null, gateAssigneeMatch };
        break;
      case 'session-state':
        value = sessionState;
        break;
      case 'worktree':
        value = { matches: worktreeMatches };
        break;
      case 'occupancy':
        value = { available: occupancyAvailable };
        break;
      case 'migration-journal':
        value = { active: migrationFreezeActive };
        break;
      case 'project-board':
        if (!boardReadable) return undefined;
        value = { state: boardState, assignees };
        break;
      case 'github-user':
        value = { login: currentUser };
        break;
      case 'issue-body':
        value = { number: 1750, body: bodyValue };
        break;
      default:
        throw new Error(`unexpected source ${request.resource}`);
    }
    return { ...request, value };
  };
  return {
    effects,
    attempt: createObservationAttempt({
      repository: 'example/project',
      issue: 1750,
      boundaryId: 'action:bind:1750',
      now,
      read,
    }),
  };
}

test('disabled assignee match remains ready only with complete matching board and marker', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const { attempt, effects } = completeSession();
  const result = await collectSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: { scope: issueScope },
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(effects, []);
});

test('disabled assignee match does not conceal a missing board read', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const { attempt } = completeSession({ boardReadable: false });
  const result = await collectSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: { scope: issueScope },
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some((blocker) => blocker.args.source === 'project-board'));
});

test('a body without a last-known-state marker is indeterminate', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const bodyWithoutMarker = body.replace(/<!-- aitm-last-known-state[^>]+-->/, '');
  const { attempt } = completeSession({
    bodyValue: bodyWithoutMarker,
  });
  const result = await collectSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: {
      scope: computeScopeIdentity({
        repository: 'example/project',
        issue: 1750,
        body: bodyWithoutMarker,
      }),
    },
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some((blocker) => blocker.args.source === 'issue-body'));
});

test('a board and body-marker disagreement blocks bind readiness', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const { attempt } = completeSession({ boardState: 'develop' });
  const result = await collectSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: { scope: issueScope },
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some((blocker) => blocker.code === 'state-drift'));
  for (const blocker of result.blockers) validateBlocker(blocker, { status: 'blocked' });
});

test('a mismatched worktree blocks bind readiness', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const { attempt } = completeSession({ worktreeMatches: false });
  const result = await collectSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: { scope: issueScope },
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some((blocker) => blocker.code === 'worktree-mismatch'));
  for (const blocker of result.blockers) validateBlocker(blocker, { status: 'blocked' });
  let auditCalls = 0;
  await assert.rejects(
    enforceVerbWorktreeBinding({
      verb: 'resume',
      rest: ['1750'],
      cfg: { repo: 'example/project' },
      invokingDir: '/invoking',
      deps: {
        resolveBoundDir: () => '/bound',
        resolveBinding: ({ projectDir }) => ({
          worktreePath: projectDir,
          worktreeBranch: projectDir === '/bound' ? 'feature/child/1750' : 'foreign',
        }),
        postAudit: async () => {
          auditCalls += 1;
        },
      },
    }),
    ForeignWorktreeBindingError
  );
  assert.equal(auditCalls, 0);
});

test('an unreadable worktree match is indeterminate, not ready', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const { attempt } = completeSession({ worktreeMatches: null });
  const result = await collectSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: { scope: issueScope },
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some((blocker) => blocker.code === 'authority-read-failed'));
});

test('a conflicting occupancy blocks bind before any claim', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const { attempt, effects } = completeSession({ occupancyAvailable: false });
  const result = await collectSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: { scope: issueScope },
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some((blocker) => blocker.code === 'occupancy-conflict'));
  assert.deepEqual(effects, []);
});

test('an implicit resume cannot target a different active issue', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const sessionState = { active: null, lastActive: '#1751', paused: true };
  const { attempt } = completeSession({ sessionState });
  const result = await collectSessionReadiness({
    actionId: 'resume',
    issue: 1750,
    stateBefore: sessionState,
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: { scope: issueScope, explicitTarget: false },
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some((blocker) => blocker.code === 'session-bind-mismatch'));
});

test('no-argument resume is not ready without a paused session', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const sessionState = { active: null, lastActive: '#1750', paused: false };
  const { attempt } = completeSession({ sessionState });
  const result = await collectSessionReadiness({
    actionId: 'resume',
    issue: 1750,
    stateBefore: sessionState,
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: { scope: issueScope, explicitTarget: false },
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some((blocker) => blocker.code === 'resume-not-paused'));
});

test('no-argument resume is ready for its paused last issue', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const sessionState = { active: null, lastActive: '#1750', paused: true };
  const { attempt } = completeSession({ sessionState });
  const result = await collectSessionReadiness({
    actionId: 'resume',
    issue: 1750,
    stateBefore: sessionState,
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: { scope: issueScope, explicitTarget: false },
  });
  assert.equal(result.status, 'ready');
});

test('migration freeze blocks a complete session decision without a side effect', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const { attempt } = completeSession({ migrationFreezeActive: true });
  const result = await collectSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: { scope: issueScope },
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some((blocker) => blocker.code === 'migration-freeze'));
  for (const blocker of result.blockers) validateBlocker(blocker, { status: 'blocked' });
});

test('enabled ownership check blocks a foreign owner', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const { attempt } = completeSession({ assignees: ['bob'], gateAssigneeMatch: true });
  const result = await collectSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: true } },
    attempt,
    ports: { scope: issueScope },
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some((blocker) => blocker.code === 'ownership-mismatch'));
});

test('enabled ownership check blocks multiple owners and treats unknown identity as indeterminate', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  for (const scenario of [
    {
      assignees: ['alice', 'bob'],
      currentUser: 'alice',
      status: 'blocked',
      code: 'ownership-mismatch',
    },
    {
      assignees: ['alice'],
      currentUser: null,
      status: 'indeterminate',
      code: 'authority-read-failed',
    },
  ]) {
    const { attempt } = completeSession({ ...scenario, gateAssigneeMatch: true });
    const result = await collectSessionReadiness({
      actionId: 'bind',
      issue: 1750,
      stateBefore: { active: null, paused: false },
      config: { repo: 'example/project', preferences: { gateAssigneeMatch: true } },
      attempt,
      ports: { scope: issueScope },
    });
    assert.equal(result.status, scenario.status);
    assert.ok(result.blockers.some((blocker) => blocker.code === scenario.code));
  }
});

test('a conflicting local configuration observation cannot yield a ready decision', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const { attempt } = completeSession({ gateAssigneeMatch: true });
  const result = await collectSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: { scope: issueScope },
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some((blocker) => blocker.code === 'authority-read-failed'));
});

test('missing repository configuration is indeterminate even with a complete board fixture', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  const { attempt } = completeSession();
  const result = await collectSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: { preferences: { gateAssigneeMatch: false } },
    attempt,
    ports: { scope: issueScope },
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some((blocker) => blocker.args.source === 'local-config'));
});

test('observed state drift and migration freeze agree with the execution preflight', async () => {
  const { collectSessionReadiness } =
    await import('../../../../task-tracker/lib/action-decision/session.mjs');
  for (const scenario of [
    {
      boardState: 'develop',
      freeze: false,
      explanationCode: 'state-drift',
      executorKind: 'human-move',
    },
    {
      boardState: 'plan',
      freeze: true,
      explanationCode: 'migration-freeze',
      executorKind: 'migration-freeze',
    },
  ]) {
    const { attempt } = completeSession({
      boardState: scenario.boardState,
      migrationFreezeActive: scenario.freeze,
    });
    const explanation = await collectSessionReadiness({
      actionId: 'bind',
      issue: 1750,
      stateBefore: { active: null, paused: false },
      config: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
      attempt,
      ports: { scope: issueScope },
    });
    const execution = await runPreflight({
      stateBefore: { active: null, paused: false },
      target: '#1750',
      cfg: { repo: 'example/project', preferences: { gateAssigneeMatch: false } },
      deps: {
        migrationFreezeActive: () => scenario.freeze,
        fetchLive: async () => scenario.boardState,
        fetchLastKnownState: async () => 'plan',
        fetchLastStatusActor: async () => null,
      },
    });
    assert.equal(explanation.status, 'blocked');
    assert.ok(explanation.blockers.some((blocker) => blocker.code === scenario.explanationCode));
    assert.equal(execution.ok, false);
    assert.equal(execution.kind, scenario.executorKind);
  }
});

test('production session reads and execution refresh the same changed board authority', async () => {
  let liveState = 'plan';
  const effects = [];
  const deps = {
    readIssueBody: async () => body,
    fetchAssignmentSnapshot: async () => ({ state: liveState, assignees: [] }),
    readWorktreeIdentity: ({ projectDir }) => ({ worktreePath: projectDir }),
    resolveProjectDir: () => '/issue-worktree',
    readOccupancy: () => ({}),
    findMainWorktreePath: () => '/issue-worktree',
    currentSessionId: () => 'session-1750',
    loadMigrationJournal: () => null,
  };
  const stateBefore = { active: null, paused: false };
  const config = {
    repo: 'example/project',
    projectId: 'project-1',
    preferences: { gateAssigneeMatch: false },
  };
  const explanation = await evaluateSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore,
    config,
    projectDir: '/issue-worktree',
    invokingDir: '/issue-worktree',
    now,
    deps,
  });
  assert.equal(explanation.status, 'ready');
  assert.deepEqual(effects, []);
  assert.deepEqual(
    explanation.bundle.observations.map((observation) => observation.resource),
    [
      'local-config',
      'session-state',
      'worktree',
      'occupancy',
      'migration-journal',
      'project-board',
      'issue-body',
    ]
  );
  liveState = 'develop';
  const execution = await runPreflight({
    stateBefore,
    target: '#1750',
    cfg: config,
    deps: {
      migrationFreezeActive: () => false,
      fetchLive: async () => liveState,
      fetchLastKnownState: async () => 'plan',
      fetchLastStatusActor: async () => null,
    },
  });
  assert.deepEqual(
    { ok: execution.ok, kind: execution.kind, code: execution.code },
    { ok: false, kind: 'human-move', code: 9 }
  );
  assert.deepEqual(effects, []);
});

test('cold numeric bind, switch, and explicit resume select the same fresh target', async () => {
  for (const scenario of [
    { verb: '#1750', rest: [], stateBefore: { active: null, paused: false }, actionId: 'bind' },
    { verb: '#1750', rest: [], stateBefore: { active: '#1751', paused: false }, actionId: 'bind' },
    {
      verb: 'resume',
      rest: ['#1750'],
      stateBefore: { active: '#1751', paused: false },
      actionId: 'resume',
    },
  ]) {
    const invocation = resolveSessionActionInvocation({
      ...scenario,
      mode: 'switch-target',
    });
    assert.equal(invocation.actionId, scenario.actionId);
    assert.equal(invocation.issue, 1750);
    assert.equal(invocation.explicitTarget, true);
    const config = {
      repo: 'example/project',
      projectId: 'project-1',
      preferences: { gateAssigneeMatch: false },
    };
    const explanation = await evaluateSessionReadiness({
      actionId: invocation.actionId,
      issue: invocation.issue,
      stateBefore: scenario.stateBefore,
      config,
      projectDir: '/issue-worktree',
      invokingDir: '/issue-worktree',
      now,
      explicitTarget: invocation.explicitTarget,
      deps: {
        readIssueBody: async () => body,
        fetchAssignmentSnapshot: async () => ({ state: 'plan', assignees: [] }),
        readWorktreeIdentity: ({ projectDir }) => ({ worktreePath: projectDir }),
        resolveProjectDir: () => '/issue-worktree',
        readOccupancy: () => ({}),
        findMainWorktreePath: () => '/issue-worktree',
        currentSessionId: () => 'session-1750',
        loadMigrationJournal: () => null,
      },
    });
    const execution = await runPreflight({
      stateBefore: invocation.stateBefore,
      target: invocation.target,
      cfg: config,
      deps: {
        migrationFreezeActive: () => false,
        fetchLive: async () => 'plan',
        fetchLastKnownState: async () => 'plan',
      },
    });
    assert.equal(explanation.status, 'ready', scenario.verb);
    assert.equal(execution.ok, true, scenario.verb);
  }
});

test('foreign ownership blocks both production explanation and execution preflight', async () => {
  const config = {
    repo: 'example/project',
    projectId: 'project-1',
    preferences: { gateAssigneeMatch: true },
  };
  const explanation = await evaluateSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config,
    projectDir: '/issue-worktree',
    invokingDir: '/issue-worktree',
    now,
    deps: {
      readIssueBody: async () => body,
      fetchAssignmentSnapshot: async () => ({ state: 'plan', assignees: ['bob'] }),
      readCurrentUser: async () => 'alice',
      readWorktreeIdentity: ({ projectDir }) => ({ worktreePath: projectDir }),
      resolveProjectDir: () => '/issue-worktree',
      readOccupancy: () => ({}),
      findMainWorktreePath: () => '/issue-worktree',
      currentSessionId: () => 'session-1750',
      loadMigrationJournal: () => null,
    },
  });
  const execution = await runPreflight({
    stateBefore: { active: null, paused: false },
    target: '#1750',
    cfg: config,
    deps: {
      migrationFreezeActive: () => false,
      fetchSnapshot: async () => ({ state: 'plan', assignees: ['bob'] }),
      fetchCurrentUser: async () => 'alice',
    },
  });
  assert.equal(explanation.status, 'blocked');
  assert.ok(explanation.blockers.some((blocker) => blocker.code === 'ownership-mismatch'));
  assert.deepEqual(
    { ok: execution.ok, kind: execution.kind, code: execution.code },
    { ok: false, kind: 'assignee-mismatch', code: 10 }
  );
});

test('another issue occupying the target worktree blocks readiness and the real claim', async () => {
  const projectDir = mkdtempProjectIsolated('action-session-occupancy-');
  const occupancyFile = path.join(projectDir, 'occupancy.json');
  try {
    claimOccupancy({
      issue: 1751,
      sid: 'other-session',
      provider: 'codex',
      worktreePath: projectDir,
      occupancyFile,
    });
    const result = await evaluateSessionReadiness({
      actionId: 'bind',
      issue: 1750,
      stateBefore: { active: null, paused: false },
      config: {
        repo: 'example/project',
        projectId: 'project-1',
        preferences: { gateAssigneeMatch: false },
      },
      projectDir,
      invokingDir: projectDir,
      now,
      deps: {
        readIssueBody: async () => body,
        fetchAssignmentSnapshot: async () => ({ state: 'plan', assignees: [] }),
        readWorktreeIdentity: ({ projectDir: dir }) => ({ worktreePath: dir }),
        resolveProjectDir: () => projectDir,
        readOccupancy: () => readOccupancy(occupancyFile),
        findMainWorktreePath: () => projectDir,
        currentSessionId: () => 'session-1750',
        loadMigrationJournal: () => null,
      },
    });
    assert.equal(result.status, 'blocked');
    assert.ok(result.blockers.some((blocker) => blocker.code === 'occupancy-conflict'));
    assert.throws(
      () =>
        claimOccupancy({
          issue: 1750,
          sid: 'session-1750',
          provider: 'codex',
          worktreePath: projectDir,
          occupancyFile,
        }),
      OccupancyConflictError
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('a body changing between scope selection and observation is indeterminate', async () => {
  let reads = 0;
  const changedBody = body.replace('Read-only bind readiness', 'Changed bind readiness');
  const result = await evaluateSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: {
      repo: 'example/project',
      projectId: 'project-1',
      preferences: { gateAssigneeMatch: false },
    },
    projectDir: '/issue-worktree',
    invokingDir: '/issue-worktree',
    now,
    deps: {
      readIssueBody: async () => (++reads === 1 ? body : changedBody),
      fetchAssignmentSnapshot: async () => ({ state: 'plan', assignees: [] }),
      readWorktreeIdentity: ({ projectDir }) => ({ worktreePath: projectDir }),
      resolveProjectDir: () => '/issue-worktree',
      readOccupancy: () => ({}),
      findMainWorktreePath: () => '/issue-worktree',
      currentSessionId: () => 'session-1750',
      loadMigrationJournal: () => null,
    },
  });
  assert.equal(reads, 2);
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some((blocker) => blocker.args.source === 'issue-body'));
});

test('a readable stub body without scope sections is an issue-body authority failure', async () => {
  const result = await evaluateSessionReadiness({
    actionId: 'bind',
    issue: 1750,
    stateBefore: { active: null, paused: false },
    config: {
      repo: 'example/project',
      projectId: 'project-1',
      preferences: { gateAssigneeMatch: false },
    },
    projectDir: '/issue-worktree',
    invokingDir: '/issue-worktree',
    now,
    deps: {
      readIssueBody: async () => 'Stub only',
      fetchAssignmentSnapshot: async () => ({ state: 'plan', assignees: [] }),
      readWorktreeIdentity: ({ projectDir }) => ({ worktreePath: projectDir }),
      resolveProjectDir: () => '/issue-worktree',
      readOccupancy: () => ({}),
      findMainWorktreePath: () => '/issue-worktree',
      currentSessionId: () => 'session-1750',
      loadMigrationJournal: () => null,
    },
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some((blocker) => blocker.args.source === 'issue-body'));
});

test('real injected resume execution refreshes freeze and preserves its exit 14 refusal', () => {
  for (const mode of ['offline', 'freeze']) {
    const projectDir = mkdtempProjectIsolated(`action-session-${mode}-`);
    try {
      const child = spawnSync(
        process.execPath,
        ['scripts/tests/helpers/action-session-executor-fixture.mjs', projectDir, mode],
        { cwd: process.cwd(), encoding: 'utf8' }
      );
      assert.equal(child.status, 0, child.stderr);
      const line = child.stdout.split('\n').find((entry) => entry.startsWith('FIXTURE_RESULT '));
      assert.ok(line, child.stdout);
      const result = JSON.parse(line.slice('FIXTURE_RESULT '.length));
      if (mode === 'freeze') {
        assert.deepEqual(result.preflight, { ok: false, kind: 'migration-freeze', code: 14 });
        assert.equal(result.active, null);
        assert.deepEqual(result.effects, []);
      } else {
        assert.equal(result.preflight.ok, true);
        assert.equal(result.active, '#1750');
        assert.equal(result.effects.length, 1);
        assert.equal(result.effects[0].kind, 'timing');
      }
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  }
});

registerEarlyPromoteCases({ test, body, now });
registerActionNavigationCases({ test, body, now });
