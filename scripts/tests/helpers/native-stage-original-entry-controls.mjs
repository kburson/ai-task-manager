// @story #1915
// Live original-entry controls consume authentic captured prefixes, never
// constructed execution authority or a replacement transition adapter.
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { moveState } from '../../task-tracker/lib/move-state/move-state-core.mjs';
import { createRevisionMemory } from '../../task-tracker/lib/criteria-revision/store.mjs';
import { tryNativeStageOriginalEntry } from '../../task-tracker/lib/criteria-revision/policy.mjs';

const auditReads = new Set([
  'authority-read',
  'page-read',
  'native-history-readback',
  'native-proof-record-readback',
]);

export async function qualifyOriginalEntryRefusals({
  t,
  originalContext,
  snapshots,
  projectDir,
  captureFiles,
}) {
  const files = captureFiles();
  async function refuse(label, selected, { configure, late, invoke = moveState } = {}) {
    await t.test(label, async () => {
      const backend = createRevisionMemory(selected);
      const retry = {
        ...originalContext,
        cfg: { ...originalContext.cfg },
        plan: { ...originalContext.plan },
        revisionBackend: backend,
      };
      let gets = 0;
      const getter = () => {
        gets++;
        return true;
      };
      configure?.(retry, getter);
      const beforeFiles = captureFiles();
      let result, error;
      try {
        const pending = invoke(retry);
        if (late) queueMicrotask(() => late(retry, getter));
        result = await pending;
      } catch (caught) {
        error = caught;
      }
      assert.equal(gets, 0, 'refuse injected getter before invocation');
      assert.ok(
        error?.code === 'revision-authority-unavailable' ||
          error?.code === 'revision-conflict' ||
          error?.code === 'revision-pending' ||
          (error instanceof TypeError && error.message.startsWith('criteria-revision:')) ||
          (result?.exit === 4 && result.phase !== 'native-stage-resume'),
        `actual original entry must refuse: ${JSON.stringify(result)} / ${error?.message}`
      );
      assert.deepEqual(backend.snapshot, selected, 'refusal retains whole current snapshot');
      assert.deepEqual(
        backend.effects.filter((name) => !auditReads.has(name)),
        [],
        'refusal cannot create owned effects beyond fixed read audits'
      );
      assert.deepEqual(captureFiles(), beforeFiles, 'refusal retains actual physical files');
    });
  }

  const first = snapshots.get(1);
  await refuse('late nested plan accessor is refused before reading it', first, {
    late(retry, getter) {
      Object.defineProperty(retry.plan, 'runGuardPipeline', {
        enumerable: true,
        configurable: true,
        get: getter,
      });
    },
  });
  await refuse('late nested boundary body accessor is refused before reading it', first, {
    configure(retry) {
      retry.boundarySnapshot = { body: { value: undefined } };
    },
    late(retry, getter) {
      Object.defineProperty(retry.boundarySnapshot.body, 'value', {
        enumerable: true,
        configurable: true,
        get: getter,
      });
    },
  });
  await refuse('late context accessor cannot replace original issue identity', first, {
    late(retry, getter) {
      Object.defineProperty(retry, 'issueArg', {
        enumerable: true,
        configurable: true,
        get: getter,
      });
    },
  });
  await refuse('caller transition identity cannot mint an original entry', first, {
    configure(retry) {
      retry.transitionId = first.nativeStageRecords.at(-1).header.intent.transitionId;
    },
  });
  await refuse('direct public policy call lacks private original-entry custody', first, {
    invoke: tryNativeStageOriginalEntry,
  });

  const configFile = path.join(projectDir, '.ai-task-manager', 'task-tracker.json');
  const bytes = readFileSync(configFile, 'utf8');
  try {
    writeFileSync(configFile, bytes + '\n');
    const changedFiles = captureFiles();
    await refuse('current physical configuration bytes must match original capture', first);
    assert.deepEqual(captureFiles(), changedFiles);
  } finally {
    writeFileSync(configFile, bytes);
  }
  assert.deepEqual(captureFiles(), files);

  for (const ordinal of [1, 7, 13, 16]) {
    for (const field of ['readback', 'resources']) {
      const changed = structuredClone(snapshots.get(ordinal));
      if (field === 'readback') changed.nativeStageRecords.at(-1).steps.at(-1).readback = null;
      else changed.nativeStageResources.local.activeTask.bytes += ' ';
      await refuse(`actual restart refuses ${field} drift at completed prefix ${ordinal}`, changed);
    }
  }
}
