// @story #1496
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSandbox } from '../../../../helpers/evidence-v2/sandbox.mjs';
import { openProvider } from '../../../../helpers/evidence-v2/provider.mjs';
import { normalizeIssueCloseSnapshot } from '../../../../../task-tracker/lib/closed-issue-convergence.mjs';
import { normalizeSubIssueBoardSnapshot } from '../../../../../task-tracker/lib/sub-issue-board-snapshot.mjs';
import { mutateIssueBody } from '../../../../../task-tracker/lib/issue-body-mutate.mjs';
import { FAULT_POINTS } from '../../../../helpers/evidence-v2/faults.mjs';

test('persistent provider payloads pass production close and board codecs', () => {
  const sandbox = createSandbox();
  try {
    const provider = sandbox.provider;
    assert.deepEqual(normalizeIssueCloseSnapshot(provider.issue(1000001)), {
      issueClosed: false,
      stateReason: null,
    });
    const snapshot = provider.boardSnapshot(1000001);
    assert.deepEqual(normalizeSubIssueBoardSnapshot(snapshot, 'PVT_rehearsal'), {
      status: 'ok',
      children: [],
    });
    provider.apply({ kind: 'close', issueNumber: 1000001, operationId: 'close-1', payload: {} });
    const fresh = openProvider(sandbox.context);
    assert.equal(fresh.issue(1000001).state, 'CLOSED');
    assert.equal(fresh.issue(1000001).stateReason, 'COMPLETED');
  } finally {
    sandbox.dispose();
  }
});

test('fresh processes reconcile every fault boundary using the original operation identity', () => {
  for (const fault of FAULT_POINTS) {
    const sandbox = createSandbox();
    try {
      const source = `
        import {readRecordedExecutionContext} from ${JSON.stringify(new URL('../../../../../task-tracker/lib/evidence-v2/execution-context.mjs', import.meta.url).href)};
        import {openProvider} from ${JSON.stringify(new URL('../../../../helpers/evidence-v2/provider.mjs', import.meta.url).href)};
        const provider = openProvider(readRecordedExecutionContext());
        provider.apply({kind:'comment',issueNumber:1000001,operationId:'stable-operation',payload:{body:'durable'},fault:${JSON.stringify(fault)}});
        provider.checkpoint({operationId:'stable-operation',fault:${JSON.stringify(fault)}});
      `;
      assert.notEqual(sandbox.probe(source).exitCode, 0);
      const retry = sandbox.probe(source);
      assert.equal(retry.exitCode, 0, retry.stderr);
      assert.equal(sandbox.provider.comments(1000001).length, 1);
      assert.equal(sandbox.provider.effects().length, 1);
    } finally {
      sandbox.dispose();
    }
  }
});

test('real body writer persists and reads back through the offline transport', async () => {
  const sandbox = createSandbox();
  try {
    await mutateIssueBody({
      repo: sandbox.context.repositoryId,
      issueNumber: 1000001,
      mutate: (body) => `${body}\nA durable planning note.\n`,
      deps: { pexec: sandbox.provider.pexec },
    });
    assert.match(openProvider(sandbox.context).issue(1000001).body, /A durable planning note/);
  } finally {
    sandbox.dispose();
  }
});

test('uncertain writes retain one effect and reject conflicting retry payloads', () => {
  const sandbox = createSandbox();
  try {
    const op = {
      kind: 'comment',
      issueNumber: 1000001,
      operationId: 'comment-1',
      payload: { body: 'persist me' },
      fault: 'after-effect',
    };
    assert.throws(() => sandbox.provider.apply(op), /rehearsal:fault:after-effect/);
    const fresh = openProvider(sandbox.context);
    assert.equal(fresh.comments(1000001).length, 1);
    fresh.apply(op);
    assert.equal(fresh.comments(1000001).length, 1);
    assert.throws(
      () => fresh.apply({ ...op, payload: { body: 'different' } }),
      /operation-conflict/
    );
    for (let i = 0; i < 4; i++)
      fresh.apply({
        kind: 'comment',
        issueNumber: 1000001,
        operationId: `extra-${i}`,
        payload: { body: `comment ${i}` },
      });
    const first = fresh.commentPage(1000001, { first: 2 });
    assert.equal(first.nodes.length, 2);
    assert.equal(first.pageInfo.hasNextPage, true);
    assert.equal(
      fresh.commentPage(1000001, { first: 2, after: first.pageInfo.endCursor }).nodes.length,
      2
    );
  } finally {
    sandbox.dispose();
  }
});

test('provider refuses unknown operations and production identities before effects', () => {
  const sandbox = createSandbox();
  try {
    assert.throws(
      () =>
        sandbox.provider.command([
          'issue',
          'edit',
          '1000001',
          '--repo=production/repo',
          '--body',
          'unsafe',
        ]),
      /production-target/
    );
    assert.throws(
      () =>
        sandbox.provider.command([
          'issue',
          'edit',
          '1000001',
          '--body',
          'unsafe',
          '--add-label',
          'unknown',
        ]),
      /unsupported-provider-option/
    );
    assert.throws(
      () =>
        sandbox.provider.apply({
          kind: 'close',
          issueNumber: 1490,
          operationId: 'forbidden',
          payload: {},
        }),
      /production-target/
    );
    assert.throws(
      () =>
        sandbox.provider.apply({
          kind: 'invented',
          issueNumber: 1000001,
          operationId: 'unknown',
          payload: {},
        }),
      /unsupported-operation/
    );
    assert.equal(sandbox.provider.effects().length, 0);
  } finally {
    sandbox.dispose();
  }
});

test('stale observations persist across restart without erasing the actual provider effect', () => {
  const sandbox = createSandbox();
  try {
    sandbox.provider.queueStaleRead(1000001);
    sandbox.provider.apply({
      kind: 'close',
      issueNumber: 1000001,
      operationId: 'close-stale',
      payload: {},
    });
    assert.equal(sandbox.restart().issue(1000001).state, 'OPEN');
    assert.equal(sandbox.restart().issue(1000001).state, 'CLOSED');
    assert.deepEqual(
      sandbox.events.filter((e) => e.kind === 'read').map((e) => e.observed.state),
      ['OPEN', 'CLOSED']
    );
    assert.equal(sandbox.provider.effects().length, 1);
  } finally {
    sandbox.dispose();
  }
});
