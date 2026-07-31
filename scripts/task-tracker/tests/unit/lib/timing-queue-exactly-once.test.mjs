// @story #1049

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  parseTimingProjectionReceipts,
  readTimingProjection,
  reconcileTimingProjectionRowEffect,
} from '../../../gh-timing-comment.mjs';
import { applyTimingProjection } from '../../../lib/work-lease/bind-orchestration.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import {
  canonicalTimingQueueProjection,
  drain,
  enqueue,
  peek,
  removeExactQueueEntries,
} from '../../../queue.mjs';
import { postRuntimeQueuedTimingEvent } from '../../../runtime.mjs';

const ROW =
  '| 2026-07-30 11:59:00 +00:00 | lifecycle-warn |  |  | 0 | 28 | queued source audit | 0 | <!-- row-sec: a=0 i=0 -->';
const EMPTY_TIMING_BODY = [
  '## ⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
  '|---|---|---|---|---|---|---|---|',
].join('\n');

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-timing-queue-once-'));
  return { dir, queuePath: path.join(dir, 'queue.json') };
}

function switchAuthorityFixture() {
  const holder = {
    principalKind: 'worker',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    pid: 123,
    worktreeId: 'worktree-1',
    pathHash: 'path-hash-1',
    branch: 'feature/child/1049',
  };
  return {
    transitionId: 'transition-1',
    request: {
      projectId: 'project-1',
      issueId: '1048',
      leaseId: 'source-lease',
      fencingToken: '7',
      idempotencyKey: 'switch:session-1:1048:1049:request-1',
      switchedAt: '2026-07-30T12:00:00.000Z',
      target: {
        projectId: 'project-1',
        issueId: '1049',
        mode: 'write',
        idempotencyKey: 'switch-target:session-1:1049:request-1',
        requestedAt: '2026-07-30T12:00:00.000Z',
        ttlMs: 900_000,
        holder,
      },
    },
    receipt: {
      lease: {
        projectId: 'project-1',
        issueId: '1049',
        mode: 'write',
        state: 'active',
        leaseId: 'target-lease',
        fencingToken: '8',
        holder,
        acquiredAt: '2026-07-30T12:00:00.000Z',
        heartbeatAt: '2026-07-30T12:00:00.000Z',
        expiresAt: '2026-07-30T12:15:00.000Z',
        audit: { operation: 'switch' },
      },
      transition: {
        transitionId: 'transition-1',
        fromIssueId: '1048',
        fromLeaseId: 'source-lease',
        fromToken: '7',
        toIssueId: '1049',
      },
    },
  };
}

function remoteTiming() {
  let body = EMPTY_TIMING_BODY;
  let mutations = 0;
  const post = async (input) => {
    const effect = reconcileTimingProjectionRowEffect(body, input);
    if (effect.status === 'missing') mutations += 1;
    body = effect.body;
    return { status: effect.status };
  };
  const read = async (input) =>
    readTimingProjection({
      ...input,
      deps: {
        readTimingCommentBody: async () => ({ status: 'found', body, error: null }),
      },
    });
  return {
    post,
    read,
    body: () => body,
    setBody: (value) => {
      body = value;
    },
    mutations: () => mutations,
  };
}

function sealedInput(entry) {
  const identity = canonicalTimingQueueProjection(entry);
  return {
    input: {
      issueNumber: '1049',
      sourceIssue: '#1048',
      repo: 'owner/repo',
      skippedNetwork: false,
      decision: {
        mode: 'switch',
        selectedEvent: 'bind',
        emittedEvent: 'bind',
        idleSec: 0,
        suppressed: false,
        syntheticGap: null,
      },
      rows: [],
      queuedSourceEntries: [
        {
          entry,
          deliveryProjectionId: identity.projectionId,
          deliverySubOperationId: identity.subOperationId,
        },
      ],
    },
    projectionId: 'switch:request-1:timing',
    ...switchAuthorityFixture(),
  };
}

function sealedContext(queuePath, remote) {
  return {
    projectDir: path.dirname(queuePath),
    queuePath,
    postTimingProjection: remote.post,
    readTimingProjection: remote.read,
    removeExactQueueEntries,
  };
}

async function consumeGeneric(event, remote) {
  return postRuntimeQueuedTimingEvent(event, {
    repo: 'owner/repo',
    timeoutMs: 2000,
    withGovernedEffect: async (_options, callback) => callback(),
    post: remote.post,
    read: remote.read,
  });
}

test('legacy timing identity is canonical while durable identities are preserved and validated', () => {
  const legacy = { kind: 'timing', issue: '#1048', row: ROW };
  const first = canonicalTimingQueueProjection({ ...legacy, queuedAt: 'first' });
  const second = canonicalTimingQueueProjection({ ...legacy, queuedAt: 'second' });
  assert.deepEqual(first, second);
  assert.notDeepEqual(
    first,
    canonicalTimingQueueProjection({ ...legacy, issue: '#1049' }),
    'affected issue participates in the identity'
  );
  assert.notDeepEqual(
    first,
    canonicalTimingQueueProjection({ ...legacy, row: `${ROW} ` }),
    'the exact normalized row participates in the identity'
  );
  assert.deepEqual(
    canonicalTimingQueueProjection({
      ...legacy,
      projectionId: 'existing-projection',
      subOperationId: 'existing-operation',
    }),
    { projectionId: 'existing-projection', subOperationId: 'existing-operation' }
  );
  assert.throws(
    () => canonicalTimingQueueProjection({ ...legacy, projectionId: 'incomplete' }),
    /identity is incomplete/
  );
});

test('generic snapshot then sealed recovery coalesce one legacy timing remote effect', async () => {
  const { dir, queuePath } = fixture();
  try {
    enqueue({ kind: 'timing', issue: '#1048', row: ROW }, queuePath);
    const [entry] = peek(queuePath);
    const snapshotReached = deferred();
    const resumeGeneric = deferred();
    const remote = remoteTiming();
    const generic = drain(async (event) => {
      snapshotReached.resolve();
      await resumeGeneric.promise;
      await consumeGeneric(event, remote);
    }, queuePath);
    await snapshotReached.promise;

    const sealed = await applyTimingProjection(
      sealedContext(queuePath, remote),
      sealedInput(entry)
    );
    resumeGeneric.resolve();
    assert.equal(await generic, true);

    assert.deepEqual(sealed, {
      reconciled: true,
      projectionName: 'timing',
      projectionId: 'switch:request-1:timing',
    });
    assert.equal(remote.mutations(), 1);
    assert.equal(parseTimingProjectionReceipts(remote.body()).length, 1);
    assert.deepEqual(peek(queuePath), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('generic delivery then sealed recovery coalesce before generic final reconciliation', async () => {
  const { dir, queuePath } = fixture();
  try {
    enqueue({ kind: 'timing', issue: '#1048', row: ROW }, queuePath);
    const [entry] = peek(queuePath);
    const finalReconcileReached = deferred();
    const resumeGeneric = deferred();
    const remote = remoteTiming();
    const generic = drain((event) => consumeGeneric(event, remote), queuePath, {
      beforeFinalReconcile: async () => {
        finalReconcileReached.resolve();
        await resumeGeneric.promise;
      },
    });
    await finalReconcileReached.promise;

    const sealed = await applyTimingProjection(
      sealedContext(queuePath, remote),
      sealedInput(entry)
    );
    resumeGeneric.resolve();
    assert.equal(await generic, true);

    assert.equal(sealed.reconciled, true);
    assert.equal(remote.mutations(), 1);
    assert.equal(parseTimingProjectionReceipts(remote.body()).length, 1);
    assert.deepEqual(peek(queuePath), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const receiptFailure of ['mismatched', 'duplicate']) {
  test(`generic timing drain fails closed on ${receiptFailure} projection receipt`, async () => {
    const { dir, queuePath } = fixture();
    try {
      enqueue({ kind: 'timing', issue: '#1048', row: ROW }, queuePath);
      const [entry] = peek(queuePath);
      const identity = canonicalTimingQueueProjection(entry);
      const remote = remoteTiming();
      await remote.post({
        ...identity,
        row:
          receiptFailure === 'mismatched'
            ? ROW.replace('queued source audit', 'tampered queued source audit')
            : ROW,
      });
      if (receiptFailure === 'duplicate') {
        const receiptRow = remote
          .body()
          .split('\n')
          .find((line) => line.includes('work-lease-projection'));
        remote.setBody(`${remote.body().trimEnd()}\n${receiptRow}`);
      }
      assert.equal(
        await drain(
          (event) =>
            postRuntimeQueuedTimingEvent(event, {
              repo: 'owner/repo',
              timeoutMs: 2000,
              withGovernedEffect: async (_options, callback) => callback(),
              post: async () => ({ status: 'already-reconciled' }),
              read: remote.read,
            }),
          queuePath
        ),
        false
      );
      assert.deepEqual(peek(queuePath), [entry]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
