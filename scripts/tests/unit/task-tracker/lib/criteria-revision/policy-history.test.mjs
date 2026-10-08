// @story #1855

import test from 'node:test';
import { runPlanApprove } from '../../../../../task-tracker/verbs/plan-approve.mjs';
import { createRevisionMemory } from '../../../../../task-tracker/lib/criteria-revision/store.mjs';
import assert from 'node:assert/strict';
import { fixture, approvedFixture } from '../../../../helpers/criteria-revision-consumers.mjs';
import { versionedWriteBody } from '../../../../../task-tracker/lib/versioned-issue-write.mjs';
import { mutateIssueBody } from '../../../../../task-tracker/lib/issue-body-mutate.mjs';
import { hashBytes } from '../../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { observeRevision } from '../../../../../task-tracker/lib/criteria-revision/engine.mjs';
import '../../../../../task-tracker/lib/guard-bootstrap.mjs';
import { validateBlocker } from '../../../../../task-tracker/lib/action-decision/contract.mjs';

for (const state of ['pending', 'stale', 'unavailable', 'conflict', 'criteria-change']) {
  test(`actual body mutation ${state} emits a closed native execution blocker`, async () => {
    const { backend, context } = ['conflict', 'criteria-change'].includes(state)
      ? await approvedFixture()
      : await fixture(state);
    if (state === 'conflict') {
      const next = backend.observation;
      next.body.bytes += '\n<!-- ungoverned-control -->\n';
      backend.replaceAuthority(next);
      backend.replacePlanning({
        ...backend.snapshot.planning,
        bodyHash: hashBytes(next.body.bytes),
      });
    }
    let effects = 0,
      refused;
    try {
      await versionedWriteBody({
        repo: context.repository,
        issueNumber: context.issue,
        mutate: (body) => body.replace('Supported model hooks', 'Changed requirement'),
        deps: {
          revisionBackend: backend,
          fetchBody: async () => backend.observation.body.bytes,
          pushBody: async () => {
            effects++;
          },
        },
      });
    } catch (error) {
      refused = error;
    }
    assert.equal(effects, 0);
    assert.ok(refused, state);
    assert.equal(refused.blocker?.guardId, 'revision-mutation');
    assert.equal(refused.blocker.code, refused.code);
    assert.deepEqual(validateBlocker(refused.blocker, { status: refused.status }), refused.blocker);
    assert.deepEqual(JSON.parse(JSON.stringify(refused)).blocker, refused.blocker);
  });
}
import { persistReadyNormalizations } from '../../../../../task-tracker/lib/action-decision/normalization.mjs';

for (const state of ['pending', 'stale', 'unavailable', 'malformed']) {
  test(`actual normalization ${state} refuses before evaluation callback and preserves its native blocker`, async () => {
    const { backend, context } = await fixture(state);
    if (state === 'malformed')
      backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
    let effects = 0;
    await assert.rejects(
      persistReadyNormalizations({
        repo: context.repository,
        issueNumber: context.issue,
        head: 'a'.repeat(40),
        evaluatedAt: '2026-09-30T00:00:00.000Z',
        deps: { revisionBackend: backend },
        readBack: async () => {
          effects++;
          return { body: backend.observation.body.bytes, head: 'a'.repeat(40) };
        },
        refreshAndEvaluate: async () => {
          effects++;
          return { status: 'ready', ok: true, refusals: [], humanDecision: null };
        },
      }),
      (error) =>
        error.blocker?.guardId === 'revision-mutation' &&
        error.code ===
          (state === 'pending'
            ? 'revision-pending'
            : state === 'stale'
              ? 'revision-approval-stale'
              : 'revision-authority-unavailable')
    );
    assert.equal(effects, 0);
  });
}

test('actual native Plan completion retains its checked journal and ordered reference after original snapshot restart', async () => {
  const { backend, context } = await approvedFixture();
  const snapshot = JSON.parse(JSON.stringify(backend.snapshot));
  assert.equal(snapshot.nativePlanRecords?.length, 1);
  assert.equal(snapshot.nativeOrder?.length, 1);
  assert.equal(snapshot.nativeOrder[0].kind, 'plan');
  assert.equal(snapshot.nativeOrder[0].predecessor, null);
  assert.equal(
    snapshot.nativePlanRecords[0].revisionEventHead,
    snapshot.nativeOrder[0].revisionEventHead
  );
  const restored = createRevisionMemory(snapshot);
  assert.equal((await observeRevision({ context, deps: restored })).status, 'applied');
  assert.deepEqual(restored.snapshot.nativePlanRecords, snapshot.nativePlanRecords);
  assert.deepEqual(restored.snapshot.nativeOrder, snapshot.nativeOrder);
});

for (const phase of ['failBefore', 'failAfter']) {
  for (const step of ['native-plan-record-write', 'native-plan-record-readback']) {
    test(`actual Plan completion ${phase} ${step} resumes after restart without duplicate retained history`, async () => {
      const original = await approvedFixture();
      const prior = original.backend.snapshot.nativePlanRecords[0];
      // Rebuild the original pre-approval fixture, then execute the native verb
      // anew. No historical completion is inferred from the final body.
      let backend = createRevisionMemory({
        observation: prior.before,
        comments: prior.comments,
        hostMessages: original.backend.snapshot.hostMessages,
        planning: prior.planning,
      });
      backend[phase] = step;
      const approve = () =>
        runPlanApprove({
          issueNumber: original.context.issue,
          cfg: prior.planning.cfg,
          projectDir: prior.before.executor.worktree,
          deps: { revisionBackend: backend, env: { TT_FULL_AUTO: '1' } },
        });
      await assert.rejects(approve(), new RegExp(`interrupted:${phase}:${step}`));
      assert.ok(backend.snapshot.planJournal);
      backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
      let ordinaryEffects = 0;
      await assert.rejects(
        mutateIssueBody({
          repo: original.context.repository,
          issueNumber: original.context.issue,
          mutate: (body) => {
            ordinaryEffects++;
            return body + '\nShould remain denied.\n';
          },
          deps: {
            revisionBackend: backend,
            fetchBody: async () => {
              ordinaryEffects++;
              return backend.observation.body.bytes;
            },
            pushBody: async () => {
              ordinaryEffects++;
            },
          },
        }),
        (error) => error.code === 'revision-approval-stale'
      );
      assert.equal(
        ordinaryEffects,
        0,
        'incomplete native Plan retention denies covered writer before retry'
      );
      const result = await approve();
      assert.equal(result.status, 'approved', JSON.stringify(result));
      assert.equal(backend.snapshot.nativePlanRecords.length, 1);
      assert.equal(backend.snapshot.nativeOrder.length, 1);
      assert.equal(backend.snapshot.planJournal, undefined);
      assert.equal(
        (await observeRevision({ context: original.context, deps: backend })).status,
        'applied'
      );
    });
  }
}

test('retained Plan index rejects absent, duplicate, changed, foreign and reordered references', async () => {
  const { backend } = await approvedFixture();
  for (const mutate of [
    (snapshot) => {
      delete snapshot.nativeOrder;
    },
    (snapshot) => {
      snapshot.nativeOrder.push(snapshot.nativeOrder[0]);
    },
    (snapshot) => {
      snapshot.nativeOrder[0].kind = 'proof';
    },
    (snapshot) => {
      snapshot.nativeOrder[0].revisionEventHead = 'foreign';
    },
    (snapshot) => {
      snapshot.nativeOrder[0].predecessor = snapshot.nativeOrder[0].id;
    },
    (snapshot) => {
      snapshot.nativePlanRecords[0].audit += 'changed';
    },
  ]) {
    const snapshot = JSON.parse(JSON.stringify(backend.snapshot));
    mutate(snapshot);
    assert.throws(() => createRevisionMemory(snapshot), /native-order/);
  }
});
