// @story #1855

import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCanonicalRevisionFixture } from '../../../../fixtures/criteria-revision.mjs';

const approval =
  await import('../../../../../task-tracker/lib/criteria-revision/plan-approval.mjs').catch(
    (error) => {
      if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
      throw error;
    }
  );
import {
  createIssueDirectory,
  renderIssueDirectory,
} from '../../../../../task-tracker/lib/github-records/issue-directory.mjs';
import { createRevisionMemory } from '../../../../../task-tracker/lib/criteria-revision/store.mjs';

const story =
  '## User Story\nAs a release operator\nI want to stop partial publication because registry checks can fail\nSo that consumers receive complete releases\n\n## Deep-Dive Analysis\n### Story Intent\n- **Beneficiary:** release operator\n- **Capability:** stop partial publication\n- **Need:** registry checks can fail\n- **Value or failure prevented:** consumers receive complete releases\n\n';

function planningMemory({ validStory = true } = {}) {
  const f = makeCanonicalRevisionFixture();
  const observation = structuredClone(f.observation);
  observation.stage = 'plan';
  observation.body.bytes =
    (validStory ? story : '') +
    observation.body.bytes +
    '\n' +
    renderIssueDirectory(
      createIssueDirectory({
        issueNodeId: 'synthetic-issue',
        singletons: {
          'delivery-contract': 'synthetic-contract',
          coordination: 'synthetic-coordination',
          'evidence-projection': 'synthetic-evidence',
          timing: 'synthetic-timing',
        },
      })
    );
  return createRevisionMemory({
    observation,
    comments: [],
    hostMessages: [],
    planning: planningSnapshot(observation),
  });
}
import { hashBytes } from '../../../../../task-tracker/lib/criteria-revision/schema.mjs';
import {
  applyRevision,
  observeRevision,
  prepareRevision,
  recoverRevision,
} from '../../../../../task-tracker/lib/criteria-revision/engine.mjs';

function planningSnapshot(observation) {
  return {
    schema: 'aitm.memory-planning/v1',
    cfg: { repo: observation.repository },
    repository: observation.repository,
    issue: observation.issue,
    bodyHash: hashBytes(observation.body.bytes),
    epicChildren: [],
    trunkSha: null,
  };
}

test('canonical baseline native approval survives untouched first revision abort without an invented applied epoch', async () => {
  let backend = planningMemory();
  const context = {
    repository: backend.observation.repository,
    issue: backend.observation.issue,
    executor: backend.observation.executor,
  };
  assert.equal(
    (
      await approval.runMemoryPlanApproval({
        issueNumber: context.issue,
        cfg: { repo: context.repository },
        projectDir: process.cwd(),
        backend,
        env: { TT_FULL_AUTO: '1' },
      })
    ).status,
    'approved'
  );
  assert.ok(await approval.readCurrentMemoryPlanApproval({ backend, context }));
  const original = backend.snapshot;
  const fixture = makeCanonicalRevisionFixture();
  const prepare = (mode, operationId, edits) =>
    prepareRevision({
      context,
      deps: backend,
      input: {
        mode,
        operationId,
        transactionId: 'canonical-baseline-abort',
        reason: 'Keep original baseline after untouched abort',
        edits,
      },
    });
  const authorize = (result) => {
    assert.equal(result.status, 'prepared', JSON.stringify(result));
    const messageId = result.proposal.operationId + '-human';
    backend.addHostMessage({
      ...fixture.rawUserMessage,
      id: messageId,
      sessionId: context.executor.sessionId,
      content: [{ type: 'input_text', text: result.approvalStatement }],
    });
    return {
      schema: 'aitm.criteria-revision/v1',
      action: result.proposal.mode === 'revision' ? 'apply' : 'recover',
      proposal: result.proposal,
      authorizationSource: {
        schema: 'aitm.authorization-source/v1',
        adapter: context.executor.adapter,
        sessionId: context.executor.sessionId,
        messageId,
        statementHash: hashBytes(result.approvalStatement),
      },
    };
  };
  const request = authorize(
    await prepare('revision', 'canonical-baseline-prepare', fixture.context.edits)
  );
  backend.failAfter = 'event-write:prepared';
  await assert.rejects(applyRevision({ context, request, deps: backend }), /interrupted/);
  backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
  const pending = await observeRevision({ context, deps: backend });
  assert.equal(pending.status, 'pending-before', JSON.stringify(pending));
  const aborted = await recoverRevision({
    context,
    deps: backend,
    request: authorize(
      await prepare('abort', 'canonical-baseline-abort-operation', {
        acceptanceCriteria: [],
        verificationCommands: [],
      })
    ),
  });
  assert.equal(aborted.status, 'aborted', JSON.stringify(aborted));
  backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
  assert.deepEqual(backend.observation, original.observation);
  assert.deepEqual(backend.snapshot.nativePlanRecords, original.nativePlanRecords);
  assert.ok(await approval.readCurrentMemoryPlanApproval({ backend, context }));
  const next = await prepareRevision({
    context,
    deps: backend,
    input: {
      mode: 'revision',
      operationId: 'after-baseline-abort',
      transactionId: 'after-baseline-abort-tx',
      reason: 'Actually revise a different criterion after untouched baseline abort',
      edits: {
        acceptanceCriteria: [
          {
            operation: 'replace',
            occurrence: 2,
            oldBytes: canonicalRecordJson(backend.observation.contract.value.acceptanceCriteria[1]),
            oldHash: hashBytes(
              canonicalRecordJson(backend.observation.contract.value.acceptanceCriteria[1])
            ),
            replacements: [
              {
                text: 'Changed independent requirement',
                declaration: { kind: 'vc-list', vcIds: ['vc-independent'] },
              },
            ],
          },
        ],
        verificationCommands: [],
      },
    },
  });
  assert.equal(next.status, 'prepared', JSON.stringify(next));
  assert.equal(
    (await applyRevision({ context, deps: backend, request: authorize(next) })).status,
    'applied'
  );
  assert.ok(
    backend.observation.contract.value.acceptanceCriteria.some(
      (ac) => ac.logicalId === 'ac-hook' && ac.text === 'Old model hooks'
    )
  );
});

test('revised canonical native Plan remains current after untouched successor abort with genuine envelope authority', async (t) => {
  const { approvedFixture } = await import('../../../../helpers/criteria-revision-consumers.mjs');
  const f = await approvedFixture({ kind: 'canonical' });
  let backend = f.backend;
  const context = f.context;
  assert.ok(await approval.readCurrentMemoryPlanApproval({ backend, context }));
  const oldBytes = canonicalRecordJson(backend.observation.contract.value.acceptanceCriteria[0]);
  const prepare = (mode, operationId, edits) =>
    prepareRevision({
      context,
      deps: backend,
      input: {
        mode,
        operationId,
        transactionId: 'canonical-revised-abort',
        reason: 'Keep current canonical contract after untouched abort',
        edits,
      },
    });
  const authorize = (result) => {
    assert.equal(result.status, 'prepared', JSON.stringify(result));
    const messageId = result.proposal.operationId + '-human';
    backend.addHostMessage({
      ...backend.snapshot.hostMessages[0],
      id: messageId,
      content: [{ type: 'input_text', text: result.approvalStatement }],
    });
    return {
      schema: 'aitm.criteria-revision/v1',
      action: result.proposal.mode === 'revision' ? 'apply' : 'recover',
      proposal: result.proposal,
      authorizationSource: {
        schema: 'aitm.authorization-source/v1',
        adapter: context.executor.adapter,
        sessionId: context.executor.sessionId,
        messageId,
        statementHash: hashBytes(result.approvalStatement),
      },
    };
  };
  const request = authorize(
    await prepare('revision', 'canonical-revised-prepare', {
      acceptanceCriteria: [
        {
          operation: 'replace',
          occurrence: 1,
          oldBytes,
          oldHash: hashBytes(oldBytes),
          replacements: [
            { text: 'Next canonical hooks', declaration: { kind: 'vc-list', vcIds: ['vc-hook'] } },
          ],
        },
      ],
      verificationCommands: [],
    })
  );
  backend.failAfter = 'event-write:prepared';
  await assert.rejects(applyRevision({ context, request, deps: backend }), /interrupted/);
  backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
  assert.equal(
    (
      await recoverRevision({
        context,
        deps: backend,
        request: authorize(
          await prepare('abort', 'canonical-revised-abort-operation', {
            acceptanceCriteria: [],
            verificationCommands: [],
          })
        ),
      })
    ).status,
    'aborted'
  );
  backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
  const state = await observeRevision({ context, deps: backend });
  assert.equal(state.status, 'aborted', JSON.stringify(state));
  assert.ok(await approval.readCurrentMemoryPlanApproval({ backend, context }));
  const original = backend.snapshot;
  for (const [name, alter] of [
    [
      'current native grant bytes',
      (s) => {
        const g = JSON.parse(s.observation.grant.bytes);
        g.expiresAt = '2020-01-01T00:00:00.000Z';
        s.observation.grant.bytes = canonicalRecordJson(g);
      },
    ],
    [
      'current grant identity',
      (s) => {
        s.observation.grant.identity = '01J00000000000000000000999';
      },
    ],
    [
      'current authority epoch',
      (s) => {
        s.observation.grant.epoch++;
      },
    ],
    [
      'current source prose',
      (s) => {
        s.observation.body.bytes = s.observation.body.bytes.replace(
          'registry checks can fail',
          'current changed source'
        );
      },
    ],
    [
      'current protected source',
      (s) => {
        s.observation.protectedSourceBindings[0].hash = hashBytes('foreign source');
      },
    ],
    [
      'current capsule bytes',
      (s) => {
        s.observation.capsule.bytes += '\nforeign';
      },
    ],
    [
      'native retained predecessor',
      (s) => {
        s.nativePlanRecords[0].before.stage = 'test';
      },
    ],
    [
      'native audit provenance',
      (s) => {
        s.comments = s.comments.filter((c) => !c.body.includes('FULL AUTO'));
        s.comments = s.comments.filter((c) => !c.body.includes('Plan approval'));
      },
    ],
  ])
    await t.test(name, async () => {
      const changed = structuredClone(original);
      alter(changed);
      let accepted = false;
      try {
        const restored = createRevisionMemory(changed);
        accepted = Boolean(
          await approval.readCurrentMemoryPlanApproval({ backend: restored, context })
        );
      } catch (error) {
        assert.match(String(error), /criteria-revision|record|capsule|authority/);
      }
      assert.equal(accepted, false, 'changed current native authority must never remain approved');
    });
});
