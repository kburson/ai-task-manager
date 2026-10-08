// @story #1855

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, approvedFixture } from '../../../../helpers/criteria-revision-consumers.mjs';
import { versionedWriteBody } from '../../../../../task-tracker/lib/versioned-issue-write.mjs';
import { mutateIssueBody } from '../../../../../task-tracker/lib/issue-body-mutate.mjs';

for (const [name, adapter] of [
  ['versionedWriteBody', versionedWriteBody],
  ['mutateIssueBody', mutateIssueBody],
]) {
  for (const [state, status, code] of [
    ['pending', 'blocked', 'revision-pending'],
    ['stale', 'blocked', 'revision-approval-stale'],
    ['unavailable', 'indeterminate', 'revision-authority-unavailable'],
  ]) {
    test(`${name} ${state} authority refuses before caller transformation or transport effects`, async () => {
      const { backend, context } = await fixture(state);
      const effects = [];
      let remote = backend.observation.body.bytes;
      let result;
      try {
        result = await adapter({
          repo: context.repository,
          issueNumber: context.issue,
          mutate: (body) => {
            effects.push('transform');
            return body + '\nOrdinary note.\n';
          },
          deps: {
            revisionBackend: backend,
            fetchBody: async () => remote,
            pushBody: async (_repo, _issue, body) => {
              effects.push('push');
              remote = body;
            },
          },
        });
      } catch (error) {
        result = error;
      }
      assert.deepEqual(
        effects,
        [],
        `${name} must not transform or write against ${state} authority`
      );
      assert.equal(result.status, status);
      assert.equal(result.code, code);
    });
  }
}
import { hashBytes } from '../../../../../task-tracker/lib/criteria-revision/schema.mjs';
import {
  withGovernedRevisionMutation,
  evaluateRevisionPolicy,
} from '../../../../../task-tracker/lib/criteria-revision/policy.mjs';

for (const state of ['baseline', 'approved']) {
  test(`real ${state} authority permits ordinary body writing with deny published before effects`, async () => {
    const { backend, context } =
      state === 'approved' ? await approvedFixture() : await fixture('baseline');
    let remote = backend.observation.body.bytes;
    const effects = [];
    await mutateIssueBody({
      repo: context.repository,
      issueNumber: context.issue,
      mutate: (body) => {
        effects.push(['transform', backend.admission.state]);
        return body + '\nOrdinary note.\n';
      },
      deps: {
        revisionBackend: backend,
        fetchBody: async () => remote,
        pushBody: async (_repo, _issue, body) => {
          effects.push(['push', backend.admission.state]);
          remote = body;
        },
      },
    });
    assert.deepEqual(effects, [
      ['transform', 'deny'],
      ['push', 'deny'],
    ]);
    assert.match(remote, /Ordinary note/);
  });
}

test('public observation objects and caller ready callbacks cannot mint authority', async () => {
  const { backend, context } = await fixture('baseline');
  assert.equal(
    evaluateRevisionPolicy({
      activity: 'body-write',
      observation: { status: 'ready' },
      capability: {},
    }).status,
    'indeterminate'
  );
  let effects = 0;
  await assert.rejects(
    withGovernedRevisionMutation(
      { context: { ...context, backend }, observe: async () => ({ status: 'ready' }) },
      async () => {
        effects++;
      }
    ),
    { code: 'revision-authority-unavailable' }
  );
  assert.equal(effects, 0);
});
import { appendCapsule } from '../../../../../task-tracker/lib/github-records/capsule-chain.mjs';
import {
  executeContractWrite,
  planContractWrite,
  writeDirectoryContractOperation,
} from '../../../../../task-tracker/lib/github-records/contract-write.mjs';
import { createDraftContract } from '../../../../../task-tracker/lib/github-records/delivery-contract.mjs';
import {
  createIssueDirectory,
  renderIssueDirectory,
} from '../../../../../task-tracker/lib/github-records/issue-directory.mjs';
import { parseAitmRecord } from '../../../../../task-tracker/lib/github-records/record-envelope.mjs';

function canonicalWriterFixture({ backend, context }) {
  let contract = createDraftContract({
    recordId: '01KZ0000000000000000000001',
    authorityEpoch: 3,
    coordinatorGrantId: '01KZ0000000000000000000002',
    acceptanceCriteria: [{ logicalId: 'ac-1', text: 'Concrete check' }],
    verificationCommands: [{ logicalId: 'vc-1', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-tests', text: 'Tests pass' }],
  });
  const records = [],
    effects = [];
  const plan = planContractWrite({
    ...context,
    contract,
    action: 'set-check',
    kind: 'acceptanceCriteria',
    logicalId: 'ac-1',
  });
  const deps = {
    revisionBackend: backend,
    readContractRecord: async () => ({ envelope: { payload: contract } }),
    listRecords: async () => [...records],
    listIssueComments: async () => [...records],
    createIssueComment: async ({ body }) => {
      effects.push(['comment', backend.admission.state]);
      const commentNodeId = `COMMENT_${records.length + 1}`;
      records.push({
        ...parseAitmRecord({
          commentNodeId,
          body,
          expectedRepository: context.repository,
          expectedIssue: context.issue,
        }),
        body,
      });
      return { commentNodeId };
    },
    readBackComment: async ({ commentNodeId }) =>
      records.find((record) => record.commentNodeId === commentNodeId),
    readProjection: async () => contract,
    updateProjection: async ({ contract: next }) => {
      effects.push(['projection', backend.admission.state]);
      contract = next;
    },
  };
  deps.appendRecord = async (candidate) =>
    (await appendCapsule({ ...context, expectedHeadRecordId: null, candidate, deps })).record;
  const issueBody = renderIssueDirectory(
    createIssueDirectory({
      issueNodeId: 'ISSUE_TEST',
      singletons: {
        'delivery-contract': 'CONTRACT_COMMENT',
        coordination: 'COORDINATION_COMMENT',
        'evidence-projection': 'EVIDENCE_COMMENT',
        timing: 'TIMING_COMMENT',
      },
    })
  );
  return {
    effects,
    run: {
      appendCapsule: () =>
        appendCapsule({
          ...context,
          expectedHeadRecordId: null,
          candidate: { envelope: plan.envelope, visibleMarkdown: 'Concrete capsule.\n' },
          deps,
        }),
      executeContractWrite: () => executeContractWrite({ plan, deps }),
      writeDirectoryContractOperation: () =>
        writeDirectoryContractOperation({
          ...context,
          issueBody,
          action: 'set-check',
          kind: 'acceptanceCriteria',
          logicalId: 'ac-1',
          deps,
        }),
    },
  };
}

for (const name of ['appendCapsule', 'executeContractWrite', 'writeDirectoryContractOperation']) {
  for (const state of ['pending', 'stale', 'unavailable', 'malformed', 'baseline', 'approved']) {
    test(`${name} real adapter ${state} authority and transport effects`, async () => {
      const f = state === 'approved' ? await approvedFixture() : await fixture(state);
      if (state === 'malformed')
        f.backend.addComment({
          id: 'bad',
          body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
        });
      const { effects, run } = canonicalWriterFixture(f);
      let error = null;
      try {
        await run[name]();
      } catch (caught) {
        error = caught;
      }
      if (['baseline', 'approved'].includes(state)) {
        assert.equal(error, null);
        assert.equal(effects.length, name === 'appendCapsule' ? 1 : 2);
        assert.ok(effects.every(([, admission]) => admission === 'deny'));
      } else {
        assert.deepEqual(effects, [], name);
        assert.equal(
          error?.status,
          ['unavailable', 'malformed'].includes(state) ? 'indeterminate' : 'blocked'
        );
        assert.equal(
          error?.code,
          state === 'pending'
            ? 'revision-pending'
            : state === 'stale'
              ? 'revision-approval-stale'
              : 'revision-authority-unavailable'
        );
      }
    });
  }
}
import { observeRevision } from '../../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { parseBodyVersion } from '../../../../../task-tracker/lib/body-version.mjs';

test('ordinary metadata body write retains recognized current approval for the next real backend consumer', async () => {
  const { backend, context } = await approvedFixture();
  const before = backend.observation;
  const effects = [];
  const deps = {
    revisionBackend: backend,
    fetchBody: async () => backend.observation.body.bytes,
    pushBody: async (_repo, _issue, body) => {
      const next = backend.observation;
      effects.push({ beforeVersion: next.body.version, afterVersion: parseBodyVersion(body) });
      next.body = { bytes: body, version: parseBodyVersion(body) };
      backend.replaceAuthority(next);
      backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
    },
  };
  await mutateIssueBody({
    repo: context.repository,
    issueNumber: context.issue,
    mutate: (body) => body + '\nOrdinary metadata note.\n',
    deps,
  });
  assert.equal(effects.length, 1);
  assert.equal(backend.observation.body.version, before.body.version + 1);
  assert.equal(backend.observation.stage, before.stage);
  const current = await observeRevision({ context, deps: backend });
  assert.equal(
    current.status,
    'applied',
    JSON.stringify({
      status: current.status,
      code: current.code,
      resourceVector: current.resourceVector,
    })
  );
  await mutateIssueBody({
    repo: context.repository,
    issueNumber: context.issue,
    mutate: (body) => body + '\nSecond ordinary metadata note.\n',
    deps,
  });
  assert.equal(effects.length, 2);
});
import '../../../../../task-tracker/lib/guard-bootstrap.mjs';
