// @story #1117 #1459

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { InMemoryRepositoryAdapter } from '../../../helpers/in-memory-repository-adapter.mjs';
import { fingerprint } from '../../../../task-tracker/lib/resident-action-ledger-codec.mjs';
import {
  INLINE_BODY_LIMIT,
  createGenesisHead,
} from '../../../../task-tracker/lib/resident-action-ledger-write.mjs';
import { createResidentActionRunner } from '../../../../task-tracker/lib/resident-action-runner.mjs';
import { STATE_MACHINE } from '../../../../task-tracker/states/index.mjs';

const ISSUE = 1459;
const CWD = '/worktree';
const ENTRY = [
  '<!-- aitm-entered-review ts="2026-08-31T12:00:00.000Z" -->',
  '- [ ] Agent Review Passed',
].join('\n');

function registeredActions() {
  return STATE_MACHINE.order.flatMap((state) =>
    STATE_MACHINE.get(state).residentActions.map((action) => ({ state, action }))
  );
}

function reviewCapabilities(repository, { pass = true } = {}) {
  return {
    review: {
      repo: 'kburson/ai-task-manager',
      readComments: async () => [],
      computeChangedPaths: async () => ['scripts/task-tracker/lib/state-cursor.mjs'],
      runAgentReviewGate: async () => ({
        pass,
        failures: pass ? [] : ['declared objection'],
        validatorsRun: ['state-action-conformance'],
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

async function snapshot(repository, actionId) {
  return repository.hydrateTask({ issue: ISSUE, cwd: CWD, actionId });
}

test('the conformance registry covers every installed resident action', () => {
  assert.deepEqual(
    registeredActions().map(({ state, action }) => `${state}:${action.id}`),
    ['review:review-agent-validation']
  );
});

for (const { state, action } of registeredActions()) {
  test(`${state}:${action.id} verify is deterministic and read-only`, async () => {
    const repository = new InMemoryRepositoryAdapter({
      issue: ISSUE,
      statusState: state,
      stateVisitId: `${state}:1`,
      actionId: action.id,
      body: ENTRY,
    });
    const initial = await snapshot(repository, action.id);
    const before = repository.mutationSnapshot();
    const first = await action.verify({}, initial);
    const second = await action.verify({}, initial);

    assert.deepEqual(first, second);
    assert.deepEqual(repository.mutationSnapshot(), before);
  });

  test(`${state}:${action.id} run and fresh hydration converge without duplicate effects`, async () => {
    const repository = new InMemoryRepositoryAdapter({
      issue: ISSUE,
      statusState: state,
      stateVisitId: `${state}:1`,
      actionId: action.id,
      body: ENTRY,
    });
    const runner = createResidentActionRunner({
      repository,
      actionContext: reviewCapabilities(repository),
    });
    const first = await runner.resume([action], await snapshot(repository, action.id), {
      trigger: 'actions-only',
      writeAuthorized: true,
    });
    const freshRunner = createResidentActionRunner({
      repository: repository.freshAdapter(),
      actionContext: reviewCapabilities(repository),
    });
    const second = await freshRunner.resume([action], await snapshot(repository, action.id), {
      trigger: 'actions-only',
      writeAuthorized: true,
    });

    assert.deepEqual(first, { status: 'complete' });
    assert.deepEqual(second, { status: 'complete' });
    assert.equal(repository.providerEffectCount, 1);
    assert.equal((await snapshot(repository, action.id)).actionLedger.events[0].phase, 'resolved');
  });
}

test('fresh hydration correlates an effect committed immediately before interruption', async () => {
  const [{ action }] = registeredActions();
  const repository = new InMemoryRepositoryAdapter({
    issue: ISSUE,
    statusState: 'review',
    stateVisitId: 'review:1',
    actionId: action.id,
    body: ENTRY,
    abortAt: 'after-provider-submission',
  });
  const execute = async (adapter) =>
    createResidentActionRunner({
      repository: adapter,
      actionContext: reviewCapabilities(repository),
    }).resume(
      [action],
      await adapter.hydrateTask({ issue: ISSUE, cwd: CWD, actionId: action.id }),
      { trigger: 'actions-only', writeAuthorized: true }
    );

  await assert.rejects(() => execute(repository), /abort:after-provider-submission/);
  repository.disableAbort();
  assert.deepEqual(await execute(repository.freshAdapter()), { status: 'complete' });
  assert.equal(repository.providerEffectCount, 1);
  const [resolved] = (await snapshot(repository, action.id)).actionLedger.events;
  assert.equal(resolved.phase, 'resolved');
  assert.equal(resolved.attribution, 'observed');
});

test('stale Review evidence remains incomplete', async () => {
  const [{ action }] = registeredActions();
  const body = [
    '- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-08-31T11:59:00.000Z" sha="sandbox" validators="state-action-conformance" result="pass" -->',
    ENTRY,
  ].join('\n');
  const result = await action.verify({}, { body: { value: body }, stateVisitId: 'review:1' });
  assert.deepEqual(result, { status: 'incomplete', reason: 'stale-evidence' });
});

test('event budget refusal occurs before the provider effect', async () => {
  const [{ action }] = registeredActions();
  const repository = new InMemoryRepositoryAdapter({
    issue: ISSUE,
    statusState: 'review',
    stateVisitId: 'review:1',
    actionId: action.id,
    body: ENTRY,
    correlation: { key: 'x'.repeat(5 * 1024) },
  });
  const runner = createResidentActionRunner({
    repository,
    actionContext: reviewCapabilities(repository),
  });

  await assert.rejects(
    async () =>
      runner.resume([action], await snapshot(repository, action.id), {
        trigger: 'actions-only',
        writeAuthorized: true,
      }),
    /resident-action-ledger-codec:comment-budget/
  );
  assert.equal(repository.providerEffectCount, 0);
});

test('stale spill preflight refuses before creating a protected comment', async () => {
  const repository = new InMemoryRepositoryAdapter({
    issue: ISSUE,
    body: 'x'.repeat(INLINE_BODY_LIMIT),
  });
  const definition = fingerprint({ id: 'review-agent-validation' });

  await assert.rejects(
    () =>
      repository.advanceActionLedgerHead({
        issue: ISSUE,
        expectedHead: createGenesisHead({ visit: 'review:stale', definition }),
        nextHead: createGenesisHead({ visit: 'review:1', definition }),
      }),
    /stale-expected-head/
  );
  assert.equal(repository.comments.size, 0);
});
