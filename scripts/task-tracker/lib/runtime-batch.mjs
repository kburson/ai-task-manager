// @story #1861
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import {
  runtimeStoragePaths,
  assertRuntimeReadable,
  assertRuntimeStoragePath,
  RuntimeRootError,
} from './runtime-storage.mjs';
import {
  withRuntimeWriterLeaseSync,
  withRuntimeStoreLockSync,
  observeMigrationIdentity,
  assertRecoveryOwner,
  observeLocalRuntimeOwner,
} from './runtime-migration-lock.mjs';
import { runtimeWriterRootsForPath, runtimeDescriptor } from './runtime-writer.mjs';
import {
  runtimeBatchDigest,
  readRuntimeBatchObservation,
  assertRuntimeBatchAdmission,
  validRuntimeBatchJournal,
  runtimeBatchMemberPending,
} from './runtime-batch-admission.mjs';

const fail = (code, message) => {
  throw new RuntimeRootError(code, message);
};
const primitives = { assertPath: (...args) => assertRuntimeStoragePath(...args), fail };
const payload = (bytes) => ({ bytes: bytes.toString('base64'), digest: runtimeBatchDigest(bytes) });
function snapshot(target, base) {
  assertRuntimeStoragePath(target, base);
  try {
    const stat = lstatSync(target);
    if (!stat.isFile()) fail('RUNTIME_BATCH_INVALID', 'Batch member must be a regular file');
    return { ...payload(readFileSync(target)), dev: stat.dev, ino: stat.ino, mode: stat.mode };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
function syncDirectory(directory) {
  const fd = openSync(directory, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function writeJournal(file, journal, adapters) {
  const pending = file + '.pending';
  assertRuntimeStoragePath(pending, path.dirname(file));
  const fd = openSync(pending, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(journal) + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  syncDirectory(path.dirname(file));
  adapters?.faultSync?.('after-batch-journal-stage-' + journal.status, {
    operationId: journal.operationId,
  });
  renameSync(pending, file);
  syncDirectory(path.dirname(file));
}

function publish(member, operationId, index, adapters) {
  const store = path.join(member.projectRoot, '.ai-task-manager/runtime/store');
  assertRuntimeStoragePath(member.target, store);
  if (member.after === null) {
    try {
      unlinkSync(member.target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    syncDirectory(path.dirname(member.target));
    return;
  }
  mkdirSync(path.dirname(member.target), { recursive: true });
  assertRuntimeStoragePath(member.target, store);
  const pending = runtimeBatchMemberPending(member, operationId, index);
  assertRuntimeStoragePath(pending, store);
  try {
    const stat = lstatSync(pending);
    if (!stat.isFile() || runtimeBatchDigest(readFileSync(pending)) !== member.after.digest)
      fail('RUNTIME_BATCH_CONFLICT', 'Pending batch payload changed');
    renameSync(pending, member.target);
    syncDirectory(path.dirname(member.target));
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const fd = openSync(pending, 'wx', 0o600);
  try {
    writeFileSync(fd, Buffer.from(member.after.bytes, 'base64'));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  syncDirectory(path.dirname(member.target));
  adapters?.faultSync?.('after-batch-member-stage-' + index, { operationId });
  renameSync(pending, member.target);
  syncDirectory(path.dirname(member.target));
}
function leased(roots, adapters, operation, index = 0) {
  if (index === roots.length) return withRuntimeStoreLockSync({ ...roots[0], adapters }, operation);
  return withRuntimeWriterLeaseSync({ ...roots[index], adapters }, () =>
    leased(roots, adapters, operation, index + 1)
  );
}
function validateMembers(members) {
  const proposed = new Map(members.map((member) => [member.target, member]));
  for (const member of members) {
    const roots = runtimeWriterRootsForPath(member.target);
    const descriptor = runtimeDescriptor(
      member.target,
      roots,
      member.actorIdentity || undefined,
      (sibling) => {
        if (!proposed.has(sibling)) return readFileSync(sibling);
        const siblingMember = proposed.get(sibling);
        const after = member.after === null ? siblingMember.before : siblingMember.after;
        if (after === null) fail('RUNTIME_STATE_CORRUPT', 'Required capture sibling is deleted');
        return Buffer.from(after.bytes, 'base64');
      }
    );
    const content = member.after || member.before;
    if (
      !descriptor ||
      (descriptor.scope === 'shared' && roots.projectRoot !== roots.mainRoot) ||
      !content ||
      !descriptor.validate(Buffer.from(content.bytes, 'base64'))
    )
      fail(
        'RUNTIME_STATE_CORRUPT',
        'Refusing malformed, unknown or incorrectly scoped batch member'
      );
  }
}
export function writeRuntimeRecordBatch(records, options = {}) {
  if (
    !Array.isArray(records) ||
    !records.length ||
    records.some((record) => !record || (record.bytes !== null && !Buffer.isBuffer(record.bytes)))
  )
    fail('RUNTIME_BATCH_INVALID', 'Batch requires supported synchronous byte payloads or deletion');
  if (
    records.some(
      (record) =>
        typeof record.target !== 'string' ||
        !path.isAbsolute(record.target) ||
        path.resolve(record.target) !== record.target ||
        (record.actorIdentity !== undefined &&
          (record.actorIdentity === null ||
            Object.keys(record.actorIdentity).sort().join(',') !== 'provider,sid' ||
            !['provider', 'sid'].every(
              (key) =>
                typeof record.actorIdentity[key] === 'string' &&
                record.actorIdentity[key].length > 0
            )))
    )
  )
    fail(
      'RUNTIME_BATCH_INVALID',
      'Exact absolute targets and closed actor identities are required'
    );
  const targets = records.map((record) => record.target);
  if (new Set(targets).size !== targets.length)
    fail('RUNTIME_BATCH_INVALID', 'Duplicate batch targets');
  const owners = targets.map(runtimeWriterRootsForPath);
  const mainRoot = owners[0].mainRoot;
  if (owners.some((root) => root.mainRoot !== mainRoot))
    fail('ROOT_IDENTITY_MISMATCH', 'Batch roots must share one physical Git owner');
  const rootPaths = [...new Set([mainRoot, ...owners.map((root) => root.projectRoot)])].sort();
  const roots = rootPaths.map((projectRoot) => ({ projectRoot, mainRoot }));
  for (const root of roots) assertRuntimeReadable(root);
  return leased(roots, options.adapters, () => {
    for (const root of roots) assertRuntimeReadable(root);
    const members = records.map((record, index) => {
      const before = snapshot(
        targets[index],
        path.join(owners[index].projectRoot, '.ai-task-manager/runtime/store')
      );
      if (
        Object.hasOwn(record, 'expectedDigest') &&
        record.expectedDigest !== (before?.digest ?? null)
      )
        fail('RUNTIME_BATCH_CONFLICT', 'Expected prior batch member changed');
      return {
        target: targets[index],
        projectRoot: owners[index].projectRoot,
        actorIdentity: record.actorIdentity || null,
        before,
        after: record.bytes === null ? null : payload(record.bytes),
      };
    });
    validateMembers(members);
    const owner = observeMigrationIdentity(options.adapters || {});
    const operationId = randomUUID();
    const layout = runtimeStoragePaths(roots[0]);
    const directory = assertRuntimeStoragePath(
      path.join(layout.sharedRuntimeRoot, 'batches', operationId),
      layout.sharedRuntimeRoot
    );
    const journal = {
      schema: 'aitm.runtime-batch/v1',
      operationId,
      mainRoot,
      status: 'prepared',
      owner,
      ownerHistory: [owner],
      roots: roots.map((root) => {
        const stat = lstatSync(root.projectRoot);
        const controlFile = runtimeStoragePaths(root).controlPath;
        const bytes = readFileSync(controlFile);
        const control = JSON.parse(bytes);
        return {
          projectRoot: root.projectRoot,
          dev: stat.dev,
          ino: stat.ino,
          controlDigest: runtimeBatchDigest(bytes),
          transactionId: control.transactionId,
          planDigest: control.planDigest,
        };
      }),
      members,
      observations: [],
    };
    if (!validRuntimeBatchJournal(journal))
      fail('RUNTIME_BATCH_INVALID', 'Refusing an unsupported batch journal before publication');
    mkdirSync(directory, { recursive: true });
    syncDirectory(path.dirname(directory));
    const file = path.join(directory, 'journal.json');
    writeJournal(file, journal, options.adapters);
    options.adapters?.faultSync?.('after-batch-journal', { operationId });
    journal.status = 'publishing';
    writeJournal(file, journal, options.adapters);
    for (const [index, member] of members.entries()) {
      publish(member, operationId, index, options.adapters);
      options.adapters?.faultSync?.('after-batch-member-' + index, { operationId });
    }
    journal.status = 'complete';
    writeJournal(file, journal, options.adapters);
    return { operationId, status: journal.status };
  });
}
export function writeRuntimeJsonBatch(records, options) {
  if (!Array.isArray(records))
    fail('RUNTIME_BATCH_INVALID', 'Batch requires an ordered record array');
  return writeRuntimeRecordBatch(
    records.map(({ value, ...record }) => {
      let bytes;
      try {
        const serialized = JSON.stringify(value);
        if (serialized === undefined) throw new Error();
        bytes = Buffer.from(serialized);
      } catch {
        fail('RUNTIME_STATE_CORRUPT', 'Batch publication must be serializable JSON');
      }
      return { ...record, bytes };
    }),
    options
  );
}
export function inspectRuntimeBatch(input) {
  return readRuntimeBatchObservation(runtimeStoragePaths(input), input.operationId, primitives);
}
export function resumeRuntimeBatch(input) {
  const layout = runtimeStoragePaths(input);
  const observed = readRuntimeBatchObservation(layout, input.operationId, primitives);
  if (
    observed.digest !== input.observedDigest &&
    !(
      observed.record.status === 'complete' &&
      !observed.journalArtifact &&
      observed.record.observations.includes(input.observedDigest)
    )
  )
    fail('RUNTIME_BATCH_CONFLICT', 'Batch observation changed');
  if (observed.record.status === 'complete' && !observed.journalArtifact)
    return { operationId: input.operationId, status: 'complete' };
  const owner = assertRecoveryOwner(observed.record.owner, {
    ...input.adapters,
    observeOwner: input.adapters?.observeOwner || observeLocalRuntimeOwner,
  });
  const roots = observed.record.roots.map(({ projectRoot }) => ({
    projectRoot,
    mainRoot: layout.mainRoot,
  }));
  return leased(roots, input.adapters, () => {
    const current = readRuntimeBatchObservation(layout, input.operationId, primitives);
    if (current.digest !== observed.digest)
      fail('RUNTIME_BATCH_CONFLICT', 'Batch changed before recovery claim');
    assertRuntimeBatchAdmission(layout, primitives, { skipOperationId: input.operationId });
    for (const root of current.record.roots) {
      const stat = lstatSync(root.projectRoot);
      const actual = runtimeStoragePaths({
        projectRoot: root.projectRoot,
        mainRoot: layout.mainRoot,
      });
      if (
        stat.dev !== root.dev ||
        stat.ino !== root.ino ||
        runtimeBatchDigest(readFileSync(actual.controlPath)) !== root.controlDigest
      )
        fail('RUNTIME_BATCH_CONFLICT', 'Physical root or control generation changed');
    }
    for (const [index, member] of current.record.members.entries()) {
      const artifact = current.memberArtifacts[index];
      if (
        artifact &&
        (member.after === null ||
          runtimeBatchDigest(Buffer.from(artifact.bytes, 'base64')) !== member.after.digest)
      )
        fail('RUNTIME_BATCH_CONFLICT', 'Pending batch payload changed');
      const actual = snapshot(
        member.target,
        path.join(member.projectRoot, '.ai-task-manager/runtime/store')
      );
      const afterMatches =
        member.after === null ? actual === null : actual?.digest === member.after.digest;
      if (
        (current.record.status === 'complete' && !afterMatches) ||
        (!afterMatches && JSON.stringify(actual) !== JSON.stringify(member.before))
      )
        fail('RUNTIME_BATCH_CONFLICT', 'Batch member changed outside the recorded publication');
    }
    validateMembers(current.record.members);
    if (current.journalArtifact) {
      renameSync(current.journalArtifact.file, current.file);
      syncDirectory(current.directory);
    }
    const journal = current.record;
    if (!journal.observations.includes(observed.digest)) journal.observations.push(observed.digest);
    journal.owner = owner;
    journal.ownerHistory.push(owner);
    const alreadyPublished = journal.status === 'complete';
    journal.status = alreadyPublished ? 'complete' : 'publishing';
    writeJournal(current.file, journal, input.adapters);
    if (!alreadyPublished)
      for (const [index, member] of journal.members.entries())
        publish(member, input.operationId, index, input.adapters);
    journal.status = 'complete';
    writeJournal(current.file, journal, input.adapters);
    return { operationId: input.operationId, status: 'complete' };
  });
}
