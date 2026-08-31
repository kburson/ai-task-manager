// @story #1117 #1459

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { InMemoryRepositoryAdapter } from '../../../helpers/in-memory-repository-adapter.mjs';
import { createResidentActionRunner } from '../../../../task-tracker/lib/resident-action-runner.mjs';
import { createStateCursor } from '../../../../task-tracker/lib/state-cursor.mjs';
import { reviewAgentValidationAction } from '../../../../task-tracker/lib/resident-actions/review-agent-validation.mjs';
import { STATE_MACHINE } from '../../../../task-tracker/states/index.mjs';
import { INLINE_BODY_LIMIT } from '../../../../task-tracker/lib/resident-action-ledger-write.mjs';

const ISSUE = 1459;
const CWD = '/worktree';
const ENTRY = [
  '<!-- aitm-entered-review ts="2026-08-31T12:00:00.000Z" -->',
  '- [ ] Agent Review Passed',
].join('\n');

function actionContext(repository) {
  return {
    review: {
      repo: 'kburson/ai-task-manager',
      readComments: async () => [],
      computeChangedPaths: async () => ['scripts/task-tracker/lib/state-cursor.mjs'],
      runAgentReviewGate: async () => ({
        pass: true,
        failures: [],
        validatorsRun: ['state-cursor-interruption'],
      }),
      onPass: async ({ passedBody, correlation }) =>
        repository.recordProviderEffect({
          correlation,
          apply: () => repository.setBody(passedBody),
        }),
      onFailure: async ({ failedBody, correlation }) =>
        repository.recordProviderEffect({
          correlation,
          apply: () => repository.setBody(failedBody),
        }),
    },
  };
}

function cursor(repository) {
  return createStateCursor({
    machine: STATE_MACHINE,
    repository,
    actions: createResidentActionRunner({ repository, actionContext: actionContext(repository) }),
  });
}

async function runReview(repository) {
  return cursor(repository).execute({ issue: ISSUE, cwd: CWD, trigger: 'actions-only' });
}

function assertOneAttemptPerPhase(snapshot) {
  const seen = new Set();
  for (const event of snapshot.actionLedger.events) {
    const key = `${event.attemptId}:${event.phase}`;
    assert.equal(seen.has(key), false, `duplicate durable phase ${key}`);
    seen.add(key);
  }
}

const ACTION_POINTS = [
  'before-genesis',
  'after-genesis',
  'before-intent',
  'after-intent',
  'before-provider-submission',
  'after-provider-submission',
  'before-resolved',
  'after-resolved',
  'before-body-head-advance',
  'after-body-head-advance',
];

for (const point of ACTION_POINTS) {
  test(`fresh Cursor converges after ${point}`, async () => {
    const repository = new InMemoryRepositoryAdapter({
      issue: ISSUE,
      statusState: 'review',
      stateVisitId: 'review:1',
      actionId: reviewAgentValidationAction.id,
      body: ENTRY,
      abortAt: point,
    });

    await assert.rejects(() => runReview(repository), new RegExp(`abort:${point}`));
    repository.disableAbort();
    const recovered = await runReview(repository.freshAdapter());
    const hydrated = await repository.hydrateTask({
      issue: ISSUE,
      cwd: CWD,
      actionId: reviewAgentValidationAction.id,
    });

    assert.deepEqual(recovered, { kind: 'resident-complete', state: 'review' });
    assert.equal(repository.providerEffectCount, 1);
    assert.equal(repository.boundaryCount, 0);
    assert.equal(hydrated.actionLedger.events[0].phase, 'resolved');
    assertOneAttemptPerPhase(hydrated);
  });
}

for (const point of ['before-spill-write', 'after-spill-write']) {
  test(`fresh Cursor converges after ${point}`, async () => {
    const repository = new InMemoryRepositoryAdapter({
      issue: ISSUE,
      statusState: 'review',
      stateVisitId: 'review:1',
      actionId: reviewAgentValidationAction.id,
      body: `${ENTRY}\n${'x'.repeat(INLINE_BODY_LIMIT)}`,
      abortAt: point,
    });

    await assert.rejects(() => runReview(repository), new RegExp(`abort:${point}`));
    repository.disableAbort();
    const recovered = await runReview(repository.freshAdapter());
    assert.deepEqual(recovered, { kind: 'resident-complete', state: 'review' });
    assert.equal(repository.providerEffectCount, 1);
    assert.equal(repository.boundaryCount, 0);
  });
}

function syntheticAction(outcome) {
  return Object.freeze({
    id: `synthetic-${outcome}`,
    serialization: 'correlation',
    async verify() {
      return { status: 'incomplete' };
    },
    async run(context, _snapshot, { correlation }) {
      await context.pullRequests.submit({ correlation });
      if (outcome === 'waiting') {
        return {
          status: 'waiting',
          correlation,
          deadline: '2026-09-01T00:00:00.000Z',
        };
      }
      return { status: 'failed', reason: 'declared failure' };
    },
  });
}

for (const phase of ['waiting', 'failed']) {
  for (const side of ['before', 'after']) {
    const point = `${side}-${phase}`;
    test(`fresh runner converges after ${point}`, async () => {
      const action = syntheticAction(phase);
      const repository = new InMemoryRepositoryAdapter({
        issue: ISSUE,
        statusState: 'review',
        stateVisitId: 'review:1',
        actionId: action.id,
        body: ENTRY,
        abortAt: point,
      });
      const run = async (adapter) =>
        createResidentActionRunner({
          repository: adapter,
          actionContext: {
            pullRequests: {
              submit: ({ correlation }) => repository.recordProviderEffect({ correlation }),
            },
          },
        }).resume(
          [action],
          await adapter.hydrateTask({ issue: ISSUE, cwd: CWD, actionId: action.id }),
          { trigger: 'actions-only', writeAuthorized: true }
        );

      await assert.rejects(() => run(repository), new RegExp(`abort:${point}`));
      repository.disableAbort();
      const recovered = await run(repository.freshAdapter());
      assert.equal(recovered.status, phase);
      assert.equal(repository.providerEffectCount, 1);
      assertOneAttemptPerPhase(
        await repository.hydrateTask({ issue: ISSUE, cwd: CWD, actionId: action.id })
      );
    });
  }
}

for (const point of [
  'after-confirmed-move',
  'before-target-hydration',
  'before-first-target-action',
]) {
  test(`fresh Cursor converges after ${point}`, async () => {
    const repository = new InMemoryRepositoryAdapter({
      issue: ISSUE,
      statusState: 'test',
      stateVisitId: 'test:1',
      actionId: reviewAgentValidationAction.id,
      body: ENTRY,
      abortAt: point,
    });
    const execute = (adapter) =>
      cursor(adapter).execute({
        issue: ISSUE,
        cwd: CWD,
        trigger: 'advance-forward',
        requestedTarget: 'review',
      });

    await assert.rejects(() => execute(repository), new RegExp(`abort:${point}`));
    repository.disableAbort();
    const recovered = await execute(repository.freshAdapter());

    assert.ok(['noop', 'resident-result'].includes(recovered.kind));
    assert.equal(repository.statusState, 'review');
    assert.equal(repository.boundaryCount, 1);
    assert.equal(repository.providerEffectCount, 1);
  });
}
