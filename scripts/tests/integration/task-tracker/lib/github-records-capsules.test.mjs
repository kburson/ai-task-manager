// @story #1073
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  createAitmRecordEnvelope,
  parseAitmRecord,
} from '../../../../task-tracker/lib/github-records/record-envelope.mjs';
import {
  appendCapsule,
  detectRecordFork,
} from '../../../../task-tracker/lib/github-records/capsule-chain.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1073;

function id(number) {
  return `01J0000000000000000000${String(number).padStart(4, '0')}`;
}

function candidate({ recordId, predecessor = null, createdAt = '2026-08-03T20:00:00.000Z' } = {}) {
  return {
    envelope: createAitmRecordEnvelope({
      recordId,
      recordType: 'verification-evidence',
      repository,
      issue,
      predecessor,
      supersedes: null,
      createdAt,
      actor: 'codex/session-1073',
      epoch: 1,
      grantId: id(9999),
      payload: { kind: 'verification-evidence', result: recordId },
    }),
    visibleMarkdown: 'Capsule evidence.\n',
  };
}

function memoryStore({ records = [], readBackOverride } = {}) {
  const state = { records: [...records], writes: 0, reads: 0 };
  const deps = {
    async listIssueComments() {
      return Object.freeze([...state.records]);
    },
    async createIssueComment({ body }) {
      state.writes += 1;
      const record = Object.freeze({
        ...parseAitmRecord({
          commentNodeId: `IC_kwDOCapsule${state.writes}`,
          body,
          expectedRepository: repository,
          expectedIssue: issue,
        }),
        body,
      });
      state.records.push(record);
      return record;
    },
    async readBackComment({ commentNodeId }) {
      state.reads += 1;
      const record = state.records.find(
        (candidateRecord) => candidateRecord.commentNodeId === commentNodeId
      );
      return readBackOverride?.(record) ?? record;
    },
  };
  return { state, deps };
}

test('appendCapsule writes once, validates exact read-back, and returns only a validated chain record', async () => {
  const memory = memoryStore();
  const result = await appendCapsule({
    repository,
    issue,
    expectedHeadRecordId: null,
    candidate: candidate({ recordId: id(1) }),
    deps: memory.deps,
  });

  assert.equal(memory.state.writes, 1);
  assert.equal(result.record.envelope.recordId, id(1));
  assert.deepEqual(result.chain.forks, []);
  assert.equal(Object.isFrozen(result.record), true);
});

test('appendCapsule rejects exact read-back mismatch after its one append', async () => {
  const memory = memoryStore({
    readBackOverride: (record) => ({
      ...record,
      envelope: { ...record.envelope, recordId: id(2) },
    }),
  });

  await assert.rejects(
    appendCapsule({
      repository,
      issue,
      expectedHeadRecordId: null,
      candidate: candidate({ recordId: id(1) }),
      deps: memory.deps,
    }),
    /capsule-chain:readback-mismatch/
  );
  assert.equal(memory.state.writes, 1);
});

test('appendCapsule rejects a duplicate candidate ID before writing', async () => {
  const root = candidate({ recordId: id(1) });
  const successor = candidate({ recordId: id(2), predecessor: id(1) });
  const memory = memoryStore({
    records: [
      { commentNodeId: 'IC_kwDORoot', envelope: root.envelope },
      { commentNodeId: 'IC_kwDOSuccessor', envelope: successor.envelope },
    ],
  });

  await assert.rejects(
    appendCapsule({
      repository,
      issue,
      expectedHeadRecordId: id(2),
      candidate: candidate({ recordId: id(1), predecessor: id(2) }),
      deps: memory.deps,
    }),
    /capsule-chain:duplicate-record-id/
  );
  assert.equal(memory.state.writes, 0);
});

test('appendCapsule rejects a split existing root history before writing', async () => {
  const firstRoot = candidate({ recordId: id(1) });
  const secondRoot = candidate({ recordId: id(2) });
  const memory = memoryStore({
    records: [
      { commentNodeId: 'IC_kwDOFirstRoot', envelope: firstRoot.envelope },
      { commentNodeId: 'IC_kwDOSecondRoot', envelope: secondRoot.envelope },
    ],
  });

  await assert.rejects(
    appendCapsule({
      repository,
      issue,
      expectedHeadRecordId: id(2),
      candidate: candidate({ recordId: id(3), predecessor: id(2) }),
      deps: memory.deps,
    }),
    /capsule-chain:multiple-roots/
  );
  assert.equal(memory.state.writes, 0);
});

test('a newer second successor remains a blocked fork and never becomes the selected authority', () => {
  const root = candidate({ recordId: id(1) }).envelope;
  const earlier = candidate({ recordId: id(2), predecessor: id(1) }).envelope;
  const newer = candidate({
    recordId: id(3),
    predecessor: id(1),
    createdAt: '2026-08-03T21:00:00.000Z',
  }).envelope;
  const records = [
    { commentNodeId: 'IC_kwDOForkRoot', envelope: root },
    { commentNodeId: 'IC_kwDOForkNewer', envelope: newer },
    { commentNodeId: 'IC_kwDOForkEarlier', envelope: earlier },
  ];

  assert.deepEqual(detectRecordFork({ records, repository, issue }), {
    status: 'blocked',
    predecessorRecordId: id(1),
    successorRecordIds: [id(2), id(3)],
  });
});
