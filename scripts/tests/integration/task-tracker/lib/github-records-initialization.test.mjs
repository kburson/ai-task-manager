// @story #1071
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  createAitmRecordEnvelope,
  parseAitmRecord,
  renderAitmRecord,
} from '../../../../task-tracker/lib/github-records/record-envelope.mjs';
import {
  createDraftContract,
  sealContract,
} from '../../../../task-tracker/lib/github-records/delivery-contract.mjs';
import {
  parseIssueDirectory,
  singletonLogicalIdentity,
} from '../../../../task-tracker/lib/github-records/issue-directory.mjs';
import {
  discoverIssueSingletons,
  initializeIssueDirectory,
  repairIssueDirectory,
} from '../../../../task-tracker/lib/github-records/singleton-initializer.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1071;
const issueNodeId = 'I_kwDOpaqueIssueNode';
const actor = 'codex/session-1071';
const kinds = ['delivery-contract', 'coordination', 'evidence-projection', 'timing'];

function ids() {
  let next = 100;
  return () => `01J0000000000000000000${String(next++).padStart(4, '0')}`;
}

function singletonRecord({ kind, commentNodeId, id = ids()() }) {
  const payload = {
    schema: 'aitm.singleton/v1',
    kind,
    logicalId: singletonLogicalIdentity({ repository, issue, kind }),
  };
  const envelope = createAitmRecordEnvelope({
    recordType: 'singleton-projection',
    repository,
    issue,
    payload,
    actor,
    epoch: 1,
    createdAt: '2026-08-03T17:30:00.000Z',
    recordId: id,
    grantId: '01J00000000000000000000009',
  });
  return Object.freeze({
    commentNodeId,
    envelope,
    body: renderAitmRecord({ envelope, visibleMarkdown: 'AITM singleton projection.\n' }),
  });
}

function adoptedContractRecord({ commentNodeId, id = ids()() }) {
  const grantId = '01J00000000000000000000009';
  const contract = sealContract({
    contract: createDraftContract({
      recordId: id,
      authorityEpoch: 2,
      coordinatorGrantId: grantId,
      acceptanceCriteria: [{ logicalId: 'ac-1', text: 'Adopt records.' }],
      verificationCommands: [{ logicalId: 'vc-1', command: 'npm test' }],
      definitionOfDone: [{ logicalId: 'dod-1', text: 'Tests pass.' }],
    }),
    authorityEpoch: 2,
    coordinatorGrantId: grantId,
  }).contract;
  const envelope = createAitmRecordEnvelope({
    recordType: 'singleton-projection',
    repository,
    issue,
    payload: contract,
    actor,
    epoch: 2,
    createdAt: '2026-08-03T17:30:00.000Z',
    recordId: id,
    grantId,
  });
  return Object.freeze({
    commentNodeId,
    envelope,
    body: renderAitmRecord({ envelope, visibleMarkdown: 'AITM Delivery Contract.\n' }),
  });
}

function memoryIssue({ body = '## Stable story\n', records = [] } = {}) {
  const state = { body, records: [...records], writes: { comments: 0, body: 0 }, nextComment: 1 };
  const id = ids();
  const deps = {
    async readIssueBody() {
      return state.body;
    },
    async listIssueComments() {
      return Object.freeze([...state.records]);
    },
    async createIssueComment({ body: commentBody }) {
      state.writes.comments += 1;
      const commentNodeId = `IC_kwDOpaque${state.nextComment++}`;
      const parsed = parseAitmRecord({
        commentNodeId,
        body: commentBody,
        expectedRepository: repository,
        expectedIssue: issue,
      });
      const record = Object.freeze({ ...parsed, body: commentBody });
      state.records.push(record);
      return record;
    },
    async writeIssueBody({ body: nextBody }) {
      state.writes.body += 1;
      state.body = nextBody;
    },
    createRecordId: id,
  };
  return { state, deps };
}

function input(memory, overrides = {}) {
  return {
    repository,
    issue,
    issueNodeId,
    actor,
    now: '2026-08-03T17:30:00.000Z',
    deps: memory.deps,
    ...overrides,
  };
}

test('initialization writes four validated singleton comments before one complete directory and then re-enters read-only', async () => {
  const memory = memoryIssue();
  const result = await initializeIssueDirectory(input(memory));
  const directory = parseIssueDirectory({ issueBody: memory.state.body });

  assert.deepEqual(Object.keys(directory.singletons).sort(), [...kinds].sort());
  assert.equal(memory.state.writes.comments, 4);
  assert.equal(memory.state.writes.body, 1);
  assert.deepEqual(
    result.singletons.map((record) => record.envelope.payload.kind).sort(),
    [...kinds].sort()
  );

  await initializeIssueDirectory(input(memory));
  assert.deepEqual(memory.state.writes, { comments: 4, body: 1 });
});

test('pre-publication mode prepares validated singletons without exposing the directory', async () => {
  const memory = memoryIssue();

  const result = await initializeIssueDirectory(input(memory, { publishDirectory: false }));

  assert.equal(result.published, false);
  assert.equal(result.singletons.length, 4);
  assert.equal(parseIssueDirectory({ issueBody: memory.state.body }), null);
  assert.deepEqual(memory.state.writes, { comments: 4, body: 0 });
});

test('discovery is read-only and does not need an actor or write transport', async () => {
  const memory = memoryIssue({
    records: kinds.map((kind, index) =>
      singletonRecord({ kind, commentNodeId: `IC_kwDOpaqueDiscovery${index}` })
    ),
  });
  const { actor: _actor, ...readInput } = input(memory, {
    deps: {
      readIssueBody: memory.deps.readIssueBody,
      listIssueComments: memory.deps.listIssueComments,
    },
  });

  const discovered = await discoverIssueSingletons(readInput);
  assert.deepEqual(discovered.missing, []);
  assert.deepEqual(memory.state.writes, { comments: 0, body: 0 });
});

test('invalid directory issue IDs refuse before the first singleton mutation', async () => {
  for (const issueNodeId of ['I'.repeat(257), 'I_kwDOpaque\ncontrol']) {
    const memory = memoryIssue();
    await assert.rejects(
      initializeIssueDirectory(input(memory, { issueNodeId })),
      /singleton-initializer:input/
    );
    assert.deepEqual(memory.state.writes, { comments: 0, body: 0 });
  }
});

test('an opaque issue ID containing a comment terminator round-trips through initialization and re-entry', async () => {
  const issueNodeId = 'I_kwDOpaque-->';
  const memory = memoryIssue();
  await initializeIssueDirectory(input(memory, { issueNodeId }));

  const directory = parseIssueDirectory({ issueBody: memory.state.body });
  assert.equal(directory.issueNodeId, issueNodeId);
  assert.equal([...memory.state.body.matchAll(/-->/g)].length, 1);
  assert.deepEqual(memory.state.writes, { comments: 4, body: 1 });

  await initializeIssueDirectory(input(memory, { issueNodeId }));
  assert.deepEqual(memory.state.writes, { comments: 4, body: 1 });
});

test('every before and after comment/body write crash re-enters without blind duplicate creation', async () => {
  const boundaries = [
    ...kinds.flatMap((kind) => [`before-comment:${kind}`, `after-comment:${kind}`]),
    'before-body',
    'after-body',
  ];

  for (const boundary of boundaries) {
    const memory = memoryIssue();
    await assert.rejects(
      initializeIssueDirectory(
        input(memory, {
          crashAt: ({ phase, kind }) => {
            if (`${phase}${kind ? `:${kind}` : ''}` === boundary) throw new Error('injected stop');
          },
        })
      ),
      /injected stop/
    );
    await initializeIssueDirectory(input(memory));
    assert.equal(memory.state.records.length, 4, boundary);
    assert.equal(memory.state.writes.body, 1, boundary);
  }
});

test('concurrent initializers refuse duplicate singleton candidates before either publishes a directory', async () => {
  const memory = memoryIssue();
  const listRecords = memory.deps.listIssueComments;
  let initialScans = 0;
  let releaseInitialScans;
  const initialScansReady = new Promise((resolve) => {
    releaseInitialScans = resolve;
  });
  memory.deps.listIssueComments = async (context) => {
    if (initialScans < 2) {
      initialScans += 1;
      const snapshot = await listRecords(context);
      if (initialScans === 2) releaseInitialScans();
      await initialScansReady;
      return snapshot;
    }
    return listRecords(context);
  };

  const results = await Promise.allSettled([
    initializeIssueDirectory(input(memory)),
    initializeIssueDirectory(input(memory)),
  ]);

  assert.equal(memory.state.records.length, 8);
  assert.equal(memory.state.writes.body, 0);
  assert.ok(results.every((result) => result.status === 'rejected'));
  for (const result of results) {
    assert.match(result.reason.message, /singleton-initializer:ambiguous/);
  }
});

test('initializer compensates a duplicate injected after final scan before body publication', async () => {
  const memory = memoryIssue();
  const writeIssueBody = memory.deps.writeIssueBody;
  const competing = singletonRecord({
    kind: 'timing',
    commentNodeId: 'IC_kwDOpaqueInitializerLateRace',
  });
  memory.deps.writeIssueBody = async (args) => {
    await writeIssueBody(args);
    if (memory.state.writes.body === 1) memory.state.records.push(competing);
  };

  await assert.rejects(initializeIssueDirectory(input(memory)), /singleton-initializer:ambiguous/);
  assert.equal(memory.state.writes.comments, 4);
  assert.equal(memory.state.writes.body, 2);
  assert.equal(parseIssueDirectory({ issueBody: memory.state.body }), null);
});

test('discovery and repair refuse malformed, foreign, missing, or duplicate singleton candidates', async () => {
  const valid = singletonRecord({ kind: 'timing', commentNodeId: 'IC_kwDOpaqueTiming' });
  const foreign = {
    ...valid,
    envelope: { ...valid.envelope, issue: issue + 1 },
  };
  const stale = {
    ...valid,
    envelope: { ...valid.envelope, authority: { ...valid.envelope.authority, epoch: 2 } },
  };
  const hashMismatch = {
    ...valid,
    envelope: { ...valid.envelope, payloadHash: 'sha256:0'.padEnd(71, '0') },
  };
  const duplicate = singletonRecord({ kind: 'timing', commentNodeId: 'IC_kwDOpaqueTimingTwo' });

  for (const [records, category] of [
    [[foreign], 'record'],
    [[stale], 'epoch'],
    [[hashMismatch], 'record'],
    [[valid, duplicate], 'ambiguous'],
  ]) {
    const memory = memoryIssue({ records });
    await assert.rejects(
      discoverIssueSingletons(input(memory)),
      new RegExp(`singleton-initializer:${category}`)
    );
  }

  const partial = memoryIssue({
    records: kinds
      .slice(0, -1)
      .map((kind, index) => singletonRecord({ kind, commentNodeId: `IC_kwDOpaque${index}` })),
  });
  await assert.rejects(repairIssueDirectory(input(partial)), /singleton-initializer:missing/);
  assert.deepEqual(partial.state.writes, { comments: 0, body: 0 });
});

test('a published directory with a deleted singleton blocks re-entry without a repair write', async () => {
  const memory = memoryIssue();
  await initializeIssueDirectory(input(memory));
  memory.state.records.pop();

  await assert.rejects(initializeIssueDirectory(input(memory)), /singleton-initializer:missing/);
  assert.deepEqual(memory.state.writes, { comments: 4, body: 1 });
});

test('explicit repair writes a missing directory only from one complete unambiguous candidate per identity', async () => {
  const records = kinds.map((kind, index) =>
    singletonRecord({ kind, commentNodeId: `IC_kwDOpaqueRepair${index}` })
  );
  const memory = memoryIssue({ records });
  const repaired = await repairIssueDirectory(input(memory));

  assert.equal(repaired.repaired, true);
  assert.equal(memory.state.writes.comments, 0);
  assert.equal(memory.state.writes.body, 1);
  await repairIssueDirectory(input(memory));
  assert.equal(memory.state.writes.body, 1);
});

test('repair recognizes an adopted Delivery Contract singleton after the directory marker is lost', async () => {
  const records = [
    adoptedContractRecord({ commentNodeId: 'IC_kwDOpaqueAdoptedContract' }),
    ...kinds
      .filter((kind) => kind !== 'delivery-contract')
      .map((kind, index) =>
        singletonRecord({ kind, commentNodeId: `IC_kwDOpaqueAdopted${index}` })
      ),
  ];
  const memory = memoryIssue({ records });

  const repaired = await repairIssueDirectory(input(memory));

  assert.equal(repaired.repaired, true);
  assert.equal(repaired.directory.singletons['delivery-contract'], 'IC_kwDOpaqueAdoptedContract');
  assert.equal(memory.state.writes.body, 1);
});

test('repair refuses a duplicate injected after discovery before publishing a directory', async () => {
  const records = kinds.map((kind, index) =>
    singletonRecord({ kind, commentNodeId: `IC_kwDOpaqueRepairRace${index}` })
  );
  const memory = memoryIssue({ records });
  const listRecords = memory.deps.listIssueComments;
  const competing = singletonRecord({
    kind: 'timing',
    commentNodeId: 'IC_kwDOpaqueRepairRaceCompeting',
  });
  let scans = 0;
  memory.deps.listIssueComments = async (context) => {
    const snapshot = await listRecords(context);
    scans += 1;
    if (scans === 1) queueMicrotask(() => memory.state.records.push(competing));
    return snapshot;
  };

  await assert.rejects(repairIssueDirectory(input(memory)), /singleton-initializer:ambiguous/);
  assert.equal(memory.state.writes.body, 0);
});

test('repair compensates a duplicate injected after final scan before body publication', async () => {
  const records = kinds.map((kind, index) =>
    singletonRecord({ kind, commentNodeId: `IC_kwDOpaqueRepairLateRace${index}` })
  );
  const memory = memoryIssue({ records });
  const writeIssueBody = memory.deps.writeIssueBody;
  const competing = singletonRecord({
    kind: 'timing',
    commentNodeId: 'IC_kwDOpaqueRepairLateRaceCompeting',
  });
  memory.deps.writeIssueBody = async (args) => {
    await writeIssueBody(args);
    if (memory.state.writes.body === 1) memory.state.records.push(competing);
  };

  await assert.rejects(repairIssueDirectory(input(memory)), /singleton-initializer:ambiguous/);
  assert.equal(memory.state.writes.comments, 0);
  assert.equal(memory.state.writes.body, 2);
  assert.equal(parseIssueDirectory({ issueBody: memory.state.body }), null);
});

test('a failed duplicate compensation returns a fail-closed body-compensation error', async () => {
  const memory = memoryIssue();
  const writeIssueBody = memory.deps.writeIssueBody;
  const competing = singletonRecord({
    kind: 'timing',
    commentNodeId: 'IC_kwDOpaqueCompensationFailure',
  });
  let writes = 0;
  memory.deps.writeIssueBody = async (args) => {
    writes += 1;
    if (writes === 2) throw new Error('compensation transport failure');
    await writeIssueBody(args);
    memory.state.records.push(competing);
  };

  await assert.rejects(
    initializeIssueDirectory(input(memory)),
    /singleton-initializer:body-compensation/
  );
  assert.equal(memory.state.writes.body, 1);
});

test('compensation body-write crash hooks preserve a fail-closed recoverable state', async () => {
  for (const phase of ['before-compensation-body', 'after-compensation-body']) {
    const memory = memoryIssue();
    const writeIssueBody = memory.deps.writeIssueBody;
    const competing = singletonRecord({
      kind: 'timing',
      commentNodeId: `IC_kwDOpaqueCompensationCrash${phase}`,
    });
    memory.deps.writeIssueBody = async (args) => {
      await writeIssueBody(args);
      if (memory.state.writes.body === 1) memory.state.records.push(competing);
    };

    await assert.rejects(
      initializeIssueDirectory(
        input(memory, {
          crashAt: ({ phase: observed }) => {
            if (observed === phase) throw new Error('injected compensation stop');
          },
        })
      ),
      /injected compensation stop/
    );
    await assert.rejects(discoverIssueSingletons(input(memory)), /singleton-initializer:ambiguous/);
    assert.equal(memory.state.writes.body, phase === 'before-compensation-body' ? 1 : 2);
    assert.equal(
      parseIssueDirectory({ issueBody: memory.state.body }) === null,
      phase === 'after-compensation-body'
    );
  }
});
