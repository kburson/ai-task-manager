// @story #1857
// Exact durable owner plus a whole-operation lease; never a legacy path fallback.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { withRuntimeOperationLock } from './runtime-migration-lock.mjs';
import { lstatSync, readFileSync, mkdirSync } from 'node:fs';
import {
  resolveRuntimeRoot,
  assertRuntimeReadable,
  assertRuntimeStoragePath,
  RuntimeRootError,
} from './runtime-storage.mjs';
import {
  withRuntimeWriterLease,
  withRuntimeWriterLeaseSync,
  withRuntimeStoreLockSync,
  inspectRuntimeFence,
  hasRuntimeWriterLease,
  writeMigrationRecord,
} from './runtime-migration-lock.mjs';
import { classifyRuntimeRecord } from './runtime-record-catalog.mjs';
import { classifyCaptureRecord } from './runtime-capture-catalog.mjs';

export function runtimeDescriptor(target, roots, actorIdentity, proposedSibling) {
  const store = path.join(roots.projectRoot, '.ai-task-manager', 'runtime', 'store');
  const relative = path.relative(store, path.resolve(target)).split(path.sep).join('/');
  return (
    classifyRuntimeRecord({ relative, kind: 'volatile-runtime', actorIdentity }) ||
    classifyCaptureRecord({
      relative,
      readSibling: (name) => {
        const sibling = path.join(path.dirname(target), name);
        assertRuntimeStoragePath(sibling, store);
        if (proposedSibling) return proposedSibling(sibling);
        if (!lstatSync(sibling).isFile())
          throw new RuntimeRootError(
            'RUNTIME_STATE_CORRUPT',
            'Capture sibling is not a regular file'
          );
        return readFileSync(sibling);
      },
    })
  );
}

export function runtimeWriterRootsForPath(target) {
  if (typeof target !== 'string')
    throw new RuntimeRootError('RUNTIME_OVERRIDE_UNSAFE', 'Runtime target must be a path');
  const absolute = path.resolve(target);
  const anchor = path.sep + ['.ai-task-manager', 'runtime', 'store', ''].join(path.sep);
  const index = absolute.lastIndexOf(anchor);
  if (index < 0)
    throw new RuntimeRootError(
      'RUNTIME_OVERRIDE_UNSAFE',
      'Runtime writes require the exact durable store owner'
    );
  const expected = absolute.slice(0, index);
  const identity = resolveRuntimeRoot({ cwd: expected, env: {} });
  if (identity.projectRoot !== expected)
    throw new RuntimeRootError(
      'ROOT_IDENTITY_MISMATCH',
      'Runtime store is not owned by the selected physical worktree'
    );
  const roots = { projectRoot: identity.projectRoot, mainRoot: identity.mainRoot };
  assertRuntimeStoragePath(absolute, path.join(expected, '.ai-task-manager', 'runtime', 'store'));
  return roots;
}

function assertRecordReadable(roots) {
  if (inspectRuntimeFence(roots) && !hasRuntimeWriterLease(roots))
    throw new RuntimeRootError(
      'RUNTIME_TRANSACTION_INCOMPLETE',
      'Ordinary authority reads are fenced until the durable transaction is reconciled'
    );
  assertRuntimeReadable(roots);
}

export function readRuntimeJsonRecord(target, { optional = false, actorIdentity } = {}) {
  const roots = runtimeWriterRootsForPath(target);
  assertRecordReadable(roots);
  const descriptor = runtimeDescriptor(target, roots, actorIdentity);
  if (!descriptor || (descriptor.scope === 'shared' && roots.projectRoot !== roots.mainRoot))
    throw new RuntimeRootError(
      'RUNTIME_STATE_CORRUPT',
      'Unknown or incorrectly scoped runtime record'
    );
  let bytes;
  try {
    if (!lstatSync(target).isFile()) throw new Error('not a regular record');
    bytes = readFileSync(target);
  } catch (error) {
    if (optional && error.code === 'ENOENT') {
      assertRecordReadable(roots);
      return null;
    }
    throw new RuntimeRootError('RUNTIME_STATE_CORRUPT', 'Missing or unreadable runtime record');
  }
  if (!descriptor.validate(bytes))
    throw new RuntimeRootError('RUNTIME_STATE_CORRUPT', 'Malformed or unsupported runtime record');
  assertRecordReadable(roots);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function validateRuntimeJsonPublication(target, value, { actorIdentity } = {}) {
  const roots = runtimeWriterRootsForPath(target);
  const descriptor = runtimeDescriptor(target, roots, actorIdentity);
  let bytes;
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('not a JSON value');
    bytes = Buffer.from(serialized);
  } catch {
    throw new RuntimeRootError(
      'RUNTIME_STATE_CORRUPT',
      'Runtime publication must be a serializable supported record'
    );
  }
  if (
    !descriptor ||
    (descriptor.scope === 'shared' && roots.projectRoot !== roots.mainRoot) ||
    !descriptor.validate(bytes)
  )
    throw new RuntimeRootError(
      'RUNTIME_STATE_CORRUPT',
      'Refusing malformed, unknown or incorrectly scoped runtime publication'
    );
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function writeRuntimeJsonRecord(target, value, { actorIdentity } = {}) {
  return withRuntimeRecordLockSync(target, () => {
    const roots = runtimeWriterRootsForPath(target);
    const store = path.join(roots.projectRoot, '.ai-task-manager', 'runtime', 'store');
    const observed = validateRuntimeJsonPublication(target, value, { actorIdentity });
    mkdirSync(path.dirname(target), { recursive: true });
    assertRuntimeStoragePath(target, store);
    writeMigrationRecord(target, observed);
    return observed;
  });
}

export function withRuntimeWriteSync(target, operation) {
  const roots = runtimeWriterRootsForPath(target);
  assertRuntimeReadable(roots);
  return withRuntimeWriterLeaseSync(roots, () => {
    assertRuntimeReadable(roots);
    return operation();
  });
}

export function withRuntimeRecordLockSync(target, operation) {
  const roots = runtimeWriterRootsForPath(target);
  const oldLock = path.resolve(target) + '.lock';
  assertRuntimeStoragePath(
    oldLock,
    path.join(roots.projectRoot, '.ai-task-manager', 'runtime', 'store')
  );
  try {
    lstatSync(oldLock);
    throw new RuntimeRootError(
      'RUNTIME_LOCK_RECOVERY_REQUIRED',
      'Legacy record lock requires explicit recovery; age is not authority'
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return withRuntimeWriteSync(target, () => withRuntimeStoreLockSync(roots, operation));
}

export function runtimeOperationKey(target) {
  const roots = runtimeWriterRootsForPath(target);
  return createHash('sha256')
    .update(JSON.stringify([roots.projectRoot, path.resolve(target)]))
    .digest('hex');
}

export function withRuntimeOperation(target, operation) {
  const roots = runtimeWriterRootsForPath(target);
  // Existing directory locks lack the new protected, atomic owner protocol.
  // Preserve them for an explicit observed recovery; never take them by age.
  try {
    lstatSync(target);
    throw new RuntimeRootError(
      'RUNTIME_LOCK_RECOVERY_REQUIRED',
      'Existing legacy operation lock requires explicit recovery'
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const recordKey = runtimeOperationKey(target);
  return withRuntimeWrite(target, () =>
    withRuntimeOperationLock({ ...roots, recordKey }, operation)
  );
}

export function withRuntimeWrite(target, operation) {
  const roots = runtimeWriterRootsForPath(target);
  assertRuntimeReadable(roots);
  return withRuntimeWriterLease(roots, async () => {
    assertRuntimeReadable(roots);
    return operation();
  });
}

export { writeRuntimeRecordBatch, writeRuntimeJsonBatch } from './runtime-batch.mjs';
