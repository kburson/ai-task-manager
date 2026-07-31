// @story #1049

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import * as bindOrchestration from '../../../lib/work-lease/bind-orchestration.mjs';
import * as transitionAuthority from '../../../lib/work-lease/transition-projection-authority.mjs';
import { peek } from '../../../queue.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

function timingInput(mode, projectionId) {
  return {
    issueNumber: '1049',
    repo: 'owner/repo',
    skippedNetwork: false,
    sourceIssue: mode === 'switch' ? '#1048' : undefined,
    decision: {
      mode,
      selectedEvent: 'update',
      emittedEvent: 'update',
      idleSec: 0,
      suppressed: false,
      syntheticGap: null,
    },
    rows: [
      {
        issueNumber: mode === 'switch' ? '1048' : '1049',
        row: '| governed timing row |',
        projectionId,
        subOperationId: `${projectionId}:row`,
      },
    ],
    queuedSourceEntries: [],
  };
}

function fixture() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-bind-queue-refusal-'));
  return {
    dir,
    queuePath: path.join(dir, 'queue.json'),
    ctx: {
      projectDir: dir,
      queuePath: path.join(dir, 'queue.json'),
      drainQueueIfAny: async () => {},
    },
  };
}

test('bind timing projection exposes a testable central seam and sealed proof refusal', () => {
  assert.equal(typeof bindOrchestration.applyTimingProjection, 'function');
  assert.equal(typeof transitionAuthority.TransitionProjectionAuthorityError, 'function');
  assert.equal(typeof transitionAuthority.isTransitionProjectionAuthorityError, 'function');
});

for (const code of ['lease-not-held', 'fence-stale']) {
  test(`ordinary ${code} timing refusal performs zero queue mutation`, async () => {
    const { dir, queuePath, ctx } = fixture();
    try {
      const projectionId = `acquire:${code}:timing`;
      ctx.postTimingProjection = async () => {
        const error = new Error(code);
        error.code = code;
        throw error;
      };
      await assert.rejects(
        bindOrchestration.applyTimingProjection(ctx, {
          input: timingInput('bind', projectionId),
          projectionId,
        }),
        (error) => error.code === code
      );
      assert.deepEqual(peek(queuePath), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('sealed transition proof refusal performs zero queue mutation', async () => {
  const { dir, queuePath, ctx } = fixture();
  try {
    const projectionId = 'switch:proof-refusal:timing';
    ctx.postTimingProjection = async () => {
      throw new transitionAuthority.TransitionProjectionAuthorityError(
        'persisted switch receipt is malformed'
      );
    };
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
    const request = {
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
    };
    const receipt = {
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
    };
    await assert.rejects(
      bindOrchestration.applyTimingProjection(ctx, {
        input: timingInput('switch', projectionId),
        projectionId,
        request,
        receipt,
        transitionId: 'transition-1',
      }),
      transitionAuthority.TransitionProjectionAuthorityError
    );
    assert.deepEqual(peek(queuePath), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('post-authority transient delivery failure remains eligible for queueing', async () => {
  const { dir, queuePath, ctx } = fixture();
  try {
    const projectionId = 'acquire:network:timing';
    ctx.postTimingProjection = async () => {
      throw new Error('network is unreachable');
    };
    await assert.rejects(
      bindOrchestration.applyTimingProjection(ctx, {
        input: timingInput('bind', projectionId),
        projectionId,
      }),
      /network is unreachable/
    );
    const queued = peek(queuePath);
    assert.equal(queued.length, 1);
    assert.equal(queued[0].projectionId, projectionId);
    assert.equal(queued[0].subOperationId, `${projectionId}:row`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
