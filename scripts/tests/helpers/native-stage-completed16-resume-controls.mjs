// @story #1915
// Assertions consume actual original-call returns; they never grant custody.
import assert from 'node:assert/strict';

export function assertResumeResult(actual, partial) {
  assert.deepEqual(actual, {
    exit: 4,
    code: 'revision-authority-unavailable',
    phase: 'native-stage-resume',
    preparationReason: 'native-source-unavailable',
    tail: { failures: [] },
    ...partial,
  });
}
export function unverifiedPartial() {
  return {
    itemId: '',
    boardMoved: false,
    sentinelPresent: false,
    transitionCommitPresent: false,
    transitionCommitId: null,
    progressVerified: false,
  };
}

const fixedAudits = new Set([
  'authority-read',
  'page-read',
  'native-history-readback',
  'native-proof-record-readback',
]);

export async function qualifyCompleted16ReadControls({
  t,
  originalContext,
  snapshots,
  captureFiles,
}) {
  const { moveState } = await import('../../task-tracker/lib/move-state/move-state-core.mjs');
  const { createRevisionMemory } =
    await import('../../task-tracker/lib/criteria-revision/store.mjs');
  const selected = snapshots.get(16);
  const nodeId = selected.nativeStageRecords.at(-1).steps[15].intent.nodeId;
  const controls = [
    [
      'envelope-only drift with identical parsed body',
      (r) => {
        r.comments.find((c) => c.nodeId === nodeId).bytes += ' ';
      },
    ],
    [
      'duplicate current identity',
      (r) => {
        r.comments.push({ ...r.comments.find((c) => c.nodeId === nodeId) });
      },
    ],
    [
      'missing current comment',
      (r) => {
        r.comments.splice(
          r.comments.findIndex((c) => c.nodeId === nodeId),
          1
        );
      },
    ],
    [
      'changed current comment body',
      (r) => {
        const c = r.comments.find((v) => v.nodeId === nodeId);
        const parsed = JSON.parse(c.bytes);
        parsed.body += ' changed';
        c.bytes = JSON.stringify(parsed);
      },
    ],
    [
      'changed whole census',
      (r) => {
        r.comments.push({
          nodeId: 'NODE_unrelated',
          id: '99999',
          bytes: JSON.stringify({ id: 99999, node_id: 'NODE_unrelated', body: 'unrelated' }),
        });
      },
    ],
    [
      'incompatible whole active-task resource',
      (r) => {
        r.local.activeTask.bytes += ' ';
      },
      true,
    ],
  ];
  for (const [label, change, whole] of controls) {
    await t.test(`existing read after admission refuses ${label}`, async () => {
      const backend = createRevisionMemory(selected);
      const expected = structuredClone(selected);
      change(expected.nativeStageResources);
      const beforeFiles = captureFiles();
      const originalClone = globalThis.structuredClone;
      let observed = 0;
      globalThis.structuredClone = (value, ...args) => {
        const stack = new Error().stack;
        if (
          !observed &&
          stack.includes('readMemoryExistingNativeStageTransition') &&
          /at clone \([^\n]*\/criteria-revision\/store\.mjs:\d+/.test(stack)
        ) {
          if (
            whole &&
            value?.nativeStageResources &&
            value?.nativeStageRecords?.at(-1)?.steps.length === 16
          ) {
            observed++;
            change(value.nativeStageResources);
          } else if (
            !whole &&
            Array.isArray(value) &&
            value.some((entry) => entry?.nodeId === nodeId)
          ) {
            observed++;
            change({ comments: value });
          }
        }
        return originalClone(value, ...args);
      };
      let result;
      try {
        result = await moveState({ ...originalContext, revisionBackend: backend });
      } finally {
        globalThis.structuredClone = originalClone;
      }
      assert.equal(
        observed,
        1,
        'actual private reader resource observation fired after frame admission'
      );
      assertResumeResult(result, unverifiedPartial());
      assert.deepEqual(
        backend.snapshot,
        expected,
        'retain exactly the independently injected resource drift'
      );
      assert.deepEqual(
        backend.effects.filter((name) => !fixedAudits.has(name)),
        [],
        'no POST, new intent or completed read on refusal'
      );
      assert.deepEqual(captureFiles(), beforeFiles);
    });
  }
  await t.test(
    'genuine existing read raw response accessor refuses without a getter or subsequent audit',
    async () => {
      const backend = createRevisionMemory(selected);
      const beforeFiles = captureFiles();
      const originalDescriptors = Object.getOwnPropertyDescriptors;
      let observed = 0,
        gets = 0,
        atInjection;
      Object.getOwnPropertyDescriptors = (value) => {
        const descriptors = originalDescriptors(value);
        const stack = new Error().stack;
        if (
          !observed &&
          stack.includes('assertMemoryExistingNativeStageTransitionResponse') &&
          Object.hasOwn(descriptors.stdout ?? {}, 'value') &&
          descriptors.exitCode?.value === 0
        ) {
          observed++;
          atInjection = backend.effects;
          Object.defineProperty(value, 'stdout', {
            enumerable: true,
            configurable: true,
            get() {
              gets++;
              return descriptors.stdout.value;
            },
          });
          return originalDescriptors(value);
        }
        return descriptors;
      };
      let result;
      try {
        result = await moveState({ ...originalContext, revisionBackend: backend });
      } finally {
        Object.getOwnPropertyDescriptors = originalDescriptors;
      }
      assert.equal(observed, 1, 'actual returned response comparison fired');
      assert.equal(gets, 0);
      assertResumeResult(result, unverifiedPartial());
      assert.deepEqual(backend.snapshot, selected);
      assert.deepEqual(
        backend.effects,
        atInjection,
        'no additional audit after response custody refusal'
      );
      assert.deepEqual(
        backend.effects.filter((name) => !fixedAudits.has(name)),
        ['native-stage-existing-transition-read']
      );
      assert.deepEqual(captureFiles(), beforeFiles);
    }
  );
}

export async function qualifyCompleted16OriginalCall({
  t,
  originalContext,
  snapshots,
  captureFiles,
}) {
  const { moveState } = await import('../../task-tracker/lib/move-state/move-state-core.mjs');
  const { tryNativeStageOriginalEntry } =
    await import('../../task-tracker/lib/criteria-revision/policy.mjs');
  const { createRevisionMemory } =
    await import('../../task-tracker/lib/criteria-revision/store.mjs');
  await t.test(
    'overlapping public policy call cannot reuse the actual current caller',
    async () => {
      const selected = snapshots.get(16),
        backend = createRevisionMemory(selected);
      const retry = { ...originalContext, revisionBackend: backend };
      const beforeFiles = captureFiles();
      const original = moveState(retry);
      const overlap = tryNativeStageOriginalEntry(retry);
      await assert.rejects(overlap, (error) => error.code === 'revision-authority-unavailable');
      assertResumeResult(await original, unverifiedPartial());
      assert.deepEqual(backend.snapshot, selected);
      assert.deepEqual(
        backend.effects.filter((name) => !fixedAudits.has(name)),
        ['native-stage-existing-transition-read']
      );
      assert.deepEqual(captureFiles(), beforeFiles);
    }
  );
}
