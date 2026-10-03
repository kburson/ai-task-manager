// @story #1857
// Production legacy readers are closed by family; trust is a separate plan decision.
import { readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { classifyRuntimeRecord } from './runtime-record-catalog.mjs';
import { classifyCaptureRecord } from './runtime-capture-catalog.mjs';
import { assertRuntimeStoragePath, RuntimeRootError } from './runtime-storage.mjs';
import { validateReadyForPlanMigrationJournal } from './ready-for-plan-migration.mjs';

function readExact(file, root) {
  assertRuntimeStoragePath(file, root, 'RUNTIME_CONTROL_INVALID');
  if (!lstatSync(file).isFile())
    throw new RuntimeRootError(
      'RUNTIME_CONTROL_INVALID',
      'Migration source must be a regular file'
    );
  return readFileSync(file);
}

function pendingIdentity({ root, source, relative }) {
  const match = relative.match(/^sessions\/([A-Za-z0-9._-]+)\/pending-ask\.json$/);
  if (!match) return undefined;
  try {
    const pending = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(readExact(source, root))
    );
    if (typeof pending.actor !== 'string' || !/^v1:[a-f0-9]{64}$/.test(pending.actor))
      return undefined;
    const name = pending.actor.slice(3) + '.json';
    const bytes = readExact(path.join(path.dirname(source), 'timing', name), root);
    const actorRelative = 'sessions/' + match[1] + '/timing/' + name;
    if (
      !classifyRuntimeRecord({ relative: actorRelative, kind: 'volatile-runtime' }).validate(bytes)
    )
      return undefined;
    const actor = JSON.parse(bytes);
    return { provider: actor.provider, sid: actor.sid };
  } catch {
    return undefined;
  }
}

export function classifyKnownLegacyRuntimeRecord(input) {
  let { relative, kind } = input;
  const { source, root } = input;
  if (kind === 'legacy-durable' && relative === 'ready-for-plan-migration.json') {
    return {
      family: 'ready-for-plan-journal',
      scope: 'shared',
      destination: 'migrations/ready-for-plan-migration.json',
      validate: (bytes) => {
        try {
          if (!Buffer.isBuffer(bytes)) return false;
          validateReadyForPlanMigrationJournal(
            JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
          );
          return true;
        } catch {
          return false;
        }
      },
    };
  }
  if (kind === 'legacy-root') {
    relative =
      {
        'task-tracker-state.json': 'state/task-tracker-state.json',
        'task-tracker-queue.json': 'state/task-tracker-queue.json',
        'task-fleet.json': 'fleet/task-fleet.json',
        'occupancy.json': 'fleet/occupancy.json',
        'orchestrator.lock': 'fleet/orchestrator.lock',
        'closed-bindings.json': 'fleet/closed-bindings.json',
      }[relative] || relative;
    kind = 'volatile-runtime';
  }
  if (kind !== 'volatile-runtime') return null;
  const record = classifyRuntimeRecord({
    relative,
    kind,
    actorIdentity: pendingIdentity({ ...input, relative }),
  });
  if (record) return record;
  return classifyCaptureRecord({
    relative,
    readSibling: (name) => {
      if (!['intent.json', 'outcome.json'].includes(name))
        throw new RuntimeRootError(
          'RUNTIME_CONTROL_INVALID',
          'Unsupported capture metadata sibling'
        );
      return readExact(path.join(path.dirname(source), name), root);
    },
  });
}
