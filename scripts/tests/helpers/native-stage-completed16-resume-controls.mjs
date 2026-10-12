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
      const { verifiedCompleted16Partial } =
        await import('./native-stage-completed16-report-controls.mjs');
      assertResumeResult(await original, verifiedCompleted16Partial(selected));
      assert.deepEqual(backend.snapshot, await expectedCompleted16Tail(selected));
      assert.deepEqual(
        backend.effects.filter((name) => !fixedAudits.has(name)),
        ['native-stage-existing-transition-read', ...resumedStageOperations]
      );
      assert.deepEqual(captureFiles(), beforeFiles);
    }
  );
}

export const resumedStageOperations = Object.freeze([
  'native-stage-tail-dispatch-intent-write',
  'native-stage-tail-dispatch-intent-readback',
  'native-stage-tail-dispatch-execution',
  'native-stage-tail-dispatch-readback',
  'native-stage-cache-intent-write',
  'native-stage-cache-intent-readback',
  'native-stage-cache-effect-write',
  'native-stage-cache-effect-readback',
]);

// Expected DATA is derived from the already captured original program contract;
// it is never installed in execution/authority maps or supplied to moveState.
export async function expectedCompleted16Tail(selected) {
  const { canonicalRecordJson } =
    await import('../../task-tracker/lib/github-records/canonical-json.mjs');
  const { hashBytes } = await import('../../task-tracker/lib/criteria-revision/schema.mjs');
  const { reconstructNativeStageTailDispatch, reconstructNativeStageTailCache } =
    await import('../../task-tracker/lib/criteria-revision/stage-execution.mjs');
  const { deriveRecordedNativeLocalTail } =
    await import('../../task-tracker/lib/move-state/cache-unpark.mjs');
  const { activeTaskPath } = await import('../../task-tracker/paths.mjs');
  const expected = structuredClone(selected);
  const journal = expected.nativeStageRecords.at(-1);
  const header = journal.header,
    actor = header.original.actor;
  const dispatch = {
    ordinal: 17,
    kind: 'tail-dispatch',
    previous: hashBytes(canonicalRecordJson(journal.steps[15])),
    intent: { target: 'test', actions: [] },
    readback: null,
  };
  journal.steps.push(dispatch);
  const beforeCache = await reconstructNativeStageTailDispatch({ header, steps: journal.steps });
  dispatch.readback = {
    actions: [],
    resources: structuredClone(beforeCache.resources),
    body: structuredClone(beforeCache.body),
    stage: beforeCache.stage,
  };
  const projected = deriveRecordedNativeLocalTail({
    kind: 'refreshKanbanStateCache',
    issue: String(header.scope.issue),
    projectDir: header.original.observation.executor.worktree,
    statePath: actor.capture.statePath,
    identity: actor.identity,
    boundAt: null,
    local: beforeCache.resources.local,
  });
  const cache = {
    ordinal: 18,
    kind: 'tail-cache',
    previous: hashBytes(canonicalRecordJson(dispatch)),
    intent: {
      file: activeTaskPath(actor.identity.sid, actor.capture.projectDir),
      sid: actor.identity.sid,
      beforeBytes: beforeCache.resources.local.activeTask?.bytes ?? null,
      bytes: projected.local.activeTask?.bytes ?? null,
      operations: projected.operations,
    },
    readback: null,
  };
  journal.steps.push(cache);
  const afterCache = await reconstructNativeStageTailCache({ header, steps: journal.steps });
  cache.readback = structuredClone(afterCache.readback);
  expected.nativeStageResources = structuredClone(afterCache.afterResources);
  return expected;
}

function actualStoreBoundary(stack, name) {
  const functions = [
    ...stack.matchAll(
      /at (?:async )?(?:Module\.)?(\w+) \([^\n]*\/criteria-revision\/store\.mjs:\d+/g
    ),
  ].map((match) => match[1]);
  if (functions[0] !== 'assertCommentStoreKeys') return false;
  if (name.startsWith('release')) return functions[1] === name;
  if (functions[1] !== 'commentStoreContinuity') return false;
  const authority = name.includes('ExistingNativeStageTransition')
    ? 'existingStageTransitionAuthority'
    : name.includes('TailDispatch')
      ? 'stageTailDispatchAuthority'
      : 'cacheAuthority';
  return functions[2] === name || (functions[2] === authority && functions[3] === name);
}

// Observe real owner DATA at unchanged Store validation boundaries; never issue
// a token or invoke a lock call from this probe.
export function observeCompleted16Locks(backend) {
  const original = Object.getOwnPropertyDescriptors;
  const seen = new Map(),
    calls = [];
  Object.getOwnPropertyDescriptors = (value) => {
    const descriptors = original(value);
    const stack = new Error().stack;
    const name =
      /at (?:async )?(?:Module\.)?(acquireMemoryExistingNativeStageTransition|releaseMemoryExistingNativeStageTransition|acquireMemoryNativeStageTailDispatch|releaseMemoryNativeStageTailDispatch|acquireMemoryNativeStageCache|releaseMemoryNativeStageCache) \([^\n]*\/criteria-revision\/store\.mjs:\d+/.exec(
        stack
      )?.[1];
    if (
      name &&
      actualStoreBoundary(stack, name) &&
      descriptors.backend?.value === backend &&
      descriptors.token?.value &&
      descriptors.invocation?.value
    ) {
      const inputs = seen.get(name) ?? new WeakSet();
      seen.set(name, inputs);
      if (!inputs.has(value)) {
        inputs.add(value);
        calls.push({
          name,
          backend,
          token: descriptors.token.value,
          invocation: descriptors.invocation.value,
        });
      }
    }
    return descriptors;
  };
  return {
    calls,
    restore() {
      Object.getOwnPropertyDescriptors = original;
    },
  };
}
export function assertCompleted16Locks(
  calls,
  kinds = ['ExistingNativeStageTransition', 'NativeStageTailDispatch', 'NativeStageCache']
) {
  assert.deepEqual(
    calls.map(({ name }) => name),
    kinds.flatMap((kind) => ['acquireMemory' + kind, 'releaseMemory' + kind])
  );
  for (let i = 0; i < calls.length; i += 2) {
    assert.equal(calls[i].token, calls[i + 1].token);
    assert.equal(calls[i].invocation, calls[i + 1].invocation);
    assert.equal(calls[i].backend, calls[i + 1].backend);
  }
  assert.equal(
    new Set(calls.filter((_, i) => i % 2 === 0).map((v) => v.invocation)).size,
    kinds.length
  );
}

export async function qualifyCompleted16ActorControls({
  t,
  originalContext,
  snapshots,
  captureFiles,
}) {
  const { moveState } = await import('../../task-tracker/lib/move-state/move-state-core.mjs');
  const { createRevisionMemory } =
    await import('../../task-tracker/lib/criteria-revision/store.mjs');
  const selected = snapshots.get(16);
  for (const boundary of [
    'acquireMemoryNativeStageCache',
    'persistMemoryNativeStageCache',
    'writeMemoryNativeStageCache',
    'completeMemoryNativeStageCache',
  ]) {
    for (const [kind, envKey, changed] of [
      [
        'provider',
        'AI_TASK_MANAGER_APP_NAME',
        selected.nativeStageRecords.at(-1).header.original.actor.identity.provider === 'claude'
          ? 'codex'
          : 'claude',
      ],
      ['sid', 'AI_TASK_MANAGER_SESSION_ID', 'changed-completed16-sid'],
      [
        'executor',
        'AI_TASK_MANAGER_PROJECT_DIR',
        selected.observation.executor.worktree + '/changed-root',
      ],
    ]) {
      await t.test(`current ${kind} drift at ${boundary} stops checkpoint progress`, async () => {
        const backend = createRevisionMemory(selected),
          beforeFiles = captureFiles();
        if (kind === 'provider') {
          const words = await import('../../task-tracker/word-counter.mjs');
          const actor = selected.nativeStageRecords.at(-1).header.original.actor.identity;
          assert.equal(
            words.aiAppName(),
            actor.provider,
            'current actual actor matches captured source before control'
          );
          assert.notEqual(
            changed,
            actor.provider,
            'provider mutation must actually change the native provider'
          );
        }
        const previous = process.env[envKey],
          original = Object.getOwnPropertyDescriptors;
        let fired = 0,
          landed,
          effects;
        Object.getOwnPropertyDescriptors = (value) => {
          const descriptors = original(value);
          if (
            !fired &&
            descriptors.backend?.value === backend &&
            actualStoreBoundary(new Error().stack, boundary)
          ) {
            fired++;
            landed = backend.snapshot;
            effects = backend.effects;
            process.env[envKey] = changed;
          }
          return descriptors;
        };
        let result;
        try {
          result = await moveState({ ...originalContext, revisionBackend: backend });
        } finally {
          Object.getOwnPropertyDescriptors = original;
          if (previous === undefined) delete process.env[envKey];
          else process.env[envKey] = previous;
        }
        assert.equal(fired, 1, 'actual current cache boundary was observed');
        assertResumeResult(result, unverifiedPartial());
        assert.deepEqual(
          backend.snapshot,
          landed,
          'no checkpoint mutation following current authority drift'
        );
        assert.deepEqual(backend.effects, effects, 'no audit or next operation after refusal');
        assert.deepEqual(captureFiles(), beforeFiles);
      });
    }
  }
}

export async function qualifyCompleted16CursorControls({
  t,
  originalContext,
  snapshots,
  captureFiles,
}) {
  const { moveState } = await import('../../task-tracker/lib/move-state/move-state-core.mjs');
  const { createRevisionMemory } =
    await import('../../task-tracker/lib/criteria-revision/store.mjs');
  const selected = snapshots.get(16),
    completed = await expectedCompleted16Tail(selected);
  for (const [kind, trigger, change] of [
    [
      'skip dispatch completion',
      'native-stage-tail-dispatch-intent-write',
      (steps) => {
        steps[16].readback = structuredClone(
          completed.nativeStageRecords.at(-1).steps[16].readback
        );
      },
    ],
    [
      'revert dispatch intent',
      'native-stage-tail-dispatch-intent-write',
      (steps) => {
        steps.pop();
      },
    ],
    [
      'repeat completed dispatch boundary',
      'native-stage-tail-dispatch-readback',
      (steps) => {
        steps[16].readback = null;
      },
    ],
  ]) {
    await t.test(`ordered cursor refuses ${kind}`, async () => {
      const backend = createRevisionMemory(selected),
        beforeFiles = captureFiles(),
        original = globalThis.structuredClone;
      let fired = 0,
        expected,
        effects;
      globalThis.structuredClone = (value, ...args) => {
        if (
          !fired &&
          backend.effects.at(-1) === trigger &&
          value?.nativeStageRecords &&
          /at clone \([^\n]*\/criteria-revision\/store\.mjs:\d+/.test(new Error().stack)
        ) {
          fired++;
          change(value.nativeStageRecords.at(-1).steps);
          expected = original(value);
          effects = backend.effects;
        }
        return original(value, ...args);
      };
      let result;
      try {
        result = await moveState({ ...originalContext, revisionBackend: backend });
      } finally {
        globalThis.structuredClone = original;
      }
      assert.equal(fired, 1, 'actual private landed journal drift observed');
      assertResumeResult(result, unverifiedPartial());
      assert.deepEqual(backend.snapshot, expected);
      assert.deepEqual(
        backend.effects,
        effects,
        'cursor refused the next operation and audited reads'
      );
      assert.deepEqual(captureFiles(), beforeFiles);
    });
  }
}

export const completed16Task2AuditTrace = Object.freeze([
  ...Array(3).fill('authority-read'),
  'page-read',
  'native-history-readback',
  'native-proof-record-readback',
  'authority-read',
  'native-history-readback',
  ...Array(13).fill('authority-read'),
  'native-stage-existing-transition-read',
  ...resumedStageOperations,
  ...Array(2).fill('authority-read'),
  'page-read',
  'native-history-readback',
  ...Array(496).fill('authority-read'),
  'native-proof-record-readback',
  'authority-read',
]);

export async function qualifyCompleted16Variant(options) {
  const { t, originalContext, snapshots, captureFiles, variant } = options;
  const { moveState } = await import('../../task-tracker/lib/move-state/move-state-core.mjs');
  const { createRevisionMemory } =
    await import('../../task-tracker/lib/criteria-revision/store.mjs');
  if (variant.when === 'control' && variant.suffix === 'task3-final-sites') {
    const { qualifyCompleted16FinalSites } =
      await import('./native-stage-completed16-report-controls.mjs');
    await qualifyCompleted16FinalSites(options);
    return;
  }
  if (variant.when === 'control' && variant.suffix === 'task3-late') {
    const { qualifyCompleted16LateReports } =
      await import('./native-stage-completed16-report-controls.mjs');
    await qualifyCompleted16LateReports(options);
    return;
  }
  if (variant.when === 'control' && variant.suffix === 'task3') {
    const { qualifyCompleted16Reporting } =
      await import('./native-stage-completed16-report-controls.mjs');
    await qualifyCompleted16Reporting(options);
    return;
  }
  if (variant.when === 'control' && variant.suffix === 'task2') {
    const selected = snapshots.get(16),
      backend = createRevisionMemory(selected);
    const beforeFiles = captureFiles(),
      locks = observeCompleted16Locks(backend);
    let result;
    try {
      result = await moveState({ ...originalContext, revisionBackend: backend });
    } finally {
      locks.restore();
    }
    assertResumeResult(result, unverifiedPartial());
    assert.deepEqual(backend.snapshot, await expectedCompleted16Tail(selected));
    assert.deepEqual(
      backend.effects.filter((name) => !fixedAudits.has(name)),
      ['native-stage-existing-transition-read', ...resumedStageOperations]
    );
    assertCompleted16Locks(locks.calls);
    assert.deepEqual(captureFiles(), beforeFiles);
    assert.deepEqual(
      backend.effects,
      completed16Task2AuditTrace,
      'complete read and owned-operation audit sequence is independently pinned'
    );
    t.diagnostic('completed16 audited trace: ' + JSON.stringify(backend.effects));
    await qualifyCompleted16ActorControls(options);
    await qualifyCompleted16CursorControls(options);
    await qualifyCompleted16EntryControls(options);
    return;
  }
  assert.fail('unimplemented completed16 fixture variant: ' + JSON.stringify(variant));
}

export async function qualifyCompleted16EntryControls(options) {
  const { t, originalContext, snapshots, captureFiles } = options;
  const core = await import('../../task-tracker/lib/move-state/move-state-core.mjs');
  const store = await import('../../task-tracker/lib/criteria-revision/store.mjs');
  const { AsyncResource } = await import('node:async_hooks');
  await qualifyCompleted16OriginalCall(options);
  await t.test(
    'actual reader and tail inputs reject copies, outside scope and expiration',
    async () => {
      const backend = store.createRevisionMemory(snapshots.get(16)),
        beforeFiles = captureFiles();
      const outside = new AsyncResource('completed16-outside-stage-scope');
      const original = Object.getOwnPropertyDescriptors,
        probes = [],
        saved = [];
      let probing = false;
      Object.getOwnPropertyDescriptors = (value) => {
        const fields = original(value),
          stack = new Error().stack;
        if (
          !probing &&
          fields.backend?.value === backend &&
          fields.capability?.value &&
          fields.invocation?.value
        ) {
          const reader = actualStoreBoundary(stack, 'acquireMemoryExistingNativeStageTransition'),
            dispatch = actualStoreBoundary(stack, 'acquireMemoryNativeStageTailDispatch'),
            cache = actualStoreBoundary(stack, 'acquireMemoryNativeStageCache');
          if ((reader || dispatch || cache) && !saved.some((v) => v.input === value)) {
            probing = true;
            const input = value,
              invocation = fields.invocation.value;
            saved.push({ input, kind: reader ? 'read' : dispatch ? 'dispatch' : 'cache' });
            if (reader) {
              probes.push(
                outside.runInAsyncScope(() =>
                  assert.rejects(store.readMemoryExistingNativeStageTransition(input))
                )
              );
              probes.push(
                assert.rejects(
                  store.readMemoryExistingNativeStageTransition({
                    ...input,
                    invocation: { ...invocation },
                  })
                )
              );
            } else if (dispatch) {
              probes.push(
                outside.runInAsyncScope(() =>
                  assert.rejects(store.completeMemoryNativeStageTailDispatch(input))
                )
              );
              probes.push(
                assert.rejects(
                  store.completeMemoryNativeStageTailDispatch({
                    ...input,
                    invocation: { ...invocation },
                  })
                )
              );
            } else {
              probes.push(
                outside.runInAsyncScope(() =>
                  assert.rejects(store.writeMemoryNativeStageCache(input))
                )
              );
              probes.push(
                assert.rejects(
                  store.writeMemoryNativeStageCache({ ...input, invocation: { ...invocation } })
                )
              );
            }
            probing = false;
          }
        }
        return fields;
      };
      let result;
      try {
        result = await core.moveState({ ...originalContext, revisionBackend: backend });
        await Promise.all(probes);
      } finally {
        Object.getOwnPropertyDescriptors = original;
        outside.emitDestroy();
      }
      assert.deepEqual(
        saved.map((v) => v.kind),
        ['read', 'dispatch', 'cache']
      );
      const { verifiedCompleted16Partial } =
        await import('./native-stage-completed16-report-controls.mjs');
      assertResumeResult(result, verifiedCompleted16Partial(snapshots.get(16)));
      const effects = backend.effects;
      for (const { input, kind } of saved) {
        if (kind === 'read')
          await assert.rejects(store.readMemoryExistingNativeStageTransition(input));
        else if (kind === 'dispatch')
          await assert.rejects(store.completeMemoryNativeStageTailDispatch(input));
        else await assert.rejects(store.writeMemoryNativeStageCache(input));
      }
      assert.deepEqual(
        backend.effects,
        effects,
        'copied, outside-scope and expired calls produce no audited effect'
      );
      assert.deepEqual(backend.snapshot, await expectedCompleted16Tail(snapshots.get(16)));
      assert.deepEqual(captureFiles(), beforeFiles);
    }
  );
}
