// @story #1499
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { CLOSE_EFFECTS } from '../../../../../task-tracker/lib/evidence-v2/close-machine.mjs';
import { resumeClose } from '../../../../../task-tracker/lib/evidence-v2/close-runner.mjs';
import { renderProtocolMarker } from '../../../../../task-tracker/lib/evidence-v2/protocol.mjs';
import { dispatchEvidenceV2Close } from '../../../../../task-tracker/verbs/close.mjs';
import { createSandbox } from '../../../../helpers/evidence-v2/sandbox.mjs';

function runFixture() {
  const cycleId = randomUUID();
  const closeTransactionId = randomUUID();
  const operationKeys = Object.fromEntries(
    CLOSE_EFFECTS.map((effect) => [effect, `${cycleId}:${closeTransactionId}:${effect}`])
  );
  const state = { steps: [], effects: {}, physical: {}, completion: null, cleanup: null };
  const cycle = () => ({
    cycleId,
    status: state.completion ? 'completed' : 'open',
    close: {
      started: {
        recordId: 'a'.repeat(64),
        payload: { closeTransactionId, effectOperationKeys: operationKeys },
      },
      steps: state.steps.map((payload) => ({ payload })),
      completion: state.completion,
      cleanup: state.cleanup,
    },
  });
  let fault = null;
  const ports = {
    project: async () => cycle(),
    observe: async () => ({ effects: structuredClone(state.effects) }),
    authority: async () => ({ binding: 'owned' }),
    applyEffect: async ({ effect, operationKey }) => {
      state.physical[effect] = (state.physical[effect] || 0) + (state.effects[effect] ? 0 : 1);
      state.effects[effect] = { status: 'confirmed', operationKey, physicalId: `${effect}:1` };
    },
    readEffect: async ({ effect }) => state.effects[effect] ?? { status: 'unknown' },
    appendCheckpoint: async ({ effect, payload }) => {
      if (!state.steps.some((step) => step.operationKey === payload.operationKey))
        state.steps.push(payload);
      if (effect === 'cleanup') state.cleanup = { recordId: 'c'.repeat(64) };
    },
    appendCompletion: async () => {
      state.completion = { recordId: 'b'.repeat(64) };
    },
    checkpoint: async (point, detail) => {
      if (fault && fault.point === point && fault.effect === detail.effect) {
        fault = null;
        throw new Error(`fault:${point}:${detail.effect}`);
      }
    },
  };
  return {
    cycleId,
    closeTransactionId,
    state,
    ports,
    setFault(value) {
      fault = value;
    },
  };
}

for (const effect of CLOSE_EFFECTS) {
  for (const point of [
    'before-effect',
    'after-effect-before-response',
    'after-response-before-checkpoint',
  ]) {
    test(`cold retry converges ${effect} after ${point}`, async () => {
      const f = runFixture();
      f.setFault({ effect, point });
      await assert.rejects(() => resumeClose({ context: {}, ports: f.ports }), /fault:/);
      const result = await resumeClose({ context: {}, ports: f.ports });
      assert.equal(result.status, 'complete');
      assert.equal(result.cycleId, f.cycleId);
      assert.equal(result.transactionId, f.closeTransactionId);
      assert.equal(f.state.physical[effect], 1);
      assert.equal(
        new Set(f.state.steps.map((step) => step.operationKey)).size,
        CLOSE_EFFECTS.length
      );
      assert.equal(f.state.steps.length, CLOSE_EFFECTS.length);
    });
  }
}

test('pre-close contention refuses effects while a post-completion race is cleanup pending', async () => {
  const pre = runFixture();
  pre.ports.authority = async () => ({ binding: 'foreign' });
  const refused = await resumeClose({ context: {}, ports: pre.ports });
  assert.equal(refused.status, 'refused');
  assert.deepEqual(pre.state.physical, {});

  const post = runFixture();
  post.state.steps = CLOSE_EFFECTS.slice(0, -1).map((effect) => ({
    step: effect,
    operationKey: `${post.cycleId}:${post.closeTransactionId}:${effect}`,
    outcome: 'confirmed',
    readBack: { status: 'confirmed', digest: `sha256:${'a'.repeat(64)}` },
  }));
  post.state.completion = { recordId: 'b'.repeat(64) };
  post.ports.authority = async () => ({ binding: 'conflict' });
  const pending = await resumeClose({ context: {}, ports: post.ports });
  assert.equal(pending.status, 'closed-cleanup-pending');
  assert.equal(pending.cleanup, 'pending-conflict');
  assert.equal(post.state.effects.cleanup, undefined);
});

test('public close dispatcher selects marked synthetic v2 and ignores unmarked v1', async () => {
  const sandbox = createSandbox({ runId: 'close-run' });
  try {
    const repositoryId = {
      nodeId: 'R_rehearsal_close-run',
      nameWithOwner: sandbox.context.repositoryId,
    };
    const cycleId = randomUUID();
    const marker = renderProtocolMarker({
      schema: 'aitm.evidence-projection/v2',
      repositoryId,
      issueNumber: 1000002,
      cycleId,
      headId: `sha256:${'a'.repeat(64)}`,
      authorityHostId: randomUUID(),
    });
    const close = runFixture();
    const dispatched = await dispatchEvidenceV2Close({
      ctx: {
        closeBody: marker,
        executionContext: sandbox.context,
        evidenceV2ClosePorts: close.ports,
      },
      issueNumber: 1000002,
      cfg: { repo: sandbox.context.repositoryId },
      pexec: null,
      state: {},
      skipNetwork: true,
    });
    assert.equal(dispatched.handled, true);
    assert.equal(dispatched.result.status, 'complete');
    assert.equal(dispatched.result.cycleId, close.cycleId);
    assert.equal(close.state.steps.length, CLOSE_EFFECTS.length);
    assert.deepEqual(Object.values(close.state.physical), Array(CLOSE_EFFECTS.length).fill(1));
    assert.deepEqual(
      await dispatchEvidenceV2Close({
        ctx: { closeBody: 'legacy' },
        issueNumber: 1499,
        cfg: { repo: 'kburson/ai-task-manager' },
        pexec: null,
        state: {},
        skipNetwork: true,
      }),
      { handled: false, result: null }
    );
  } finally {
    sandbox.dispose();
  }
});
