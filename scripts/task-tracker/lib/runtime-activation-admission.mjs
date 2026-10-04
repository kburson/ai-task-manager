// @story #1861
// Read admission uses caller-supplied physical/path primitives, avoiding a storage cycle.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  validRuntimeInitializationJournal,
  runtimeInitializationDigest,
} from './runtime-initialization-record.mjs';
import {
  emptyRuntimeKeys,
  validEmptyRuntimeOwner,
  validEmptyOperationId,
  validEmptyDigest,
  validEmptyRuntimeJournal,
  validEmptyRuntimeControl,
  emptyRuntimeDigest,
} from './runtime-empty-record.mjs';
const exists = (file) => {
  try {
    return lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
function read(file, base, { assertPath, fail }) {
  assertPath(file, base, 'RUNTIME_CONTROL_INVALID');
  const stat = exists(file);
  if (!stat?.isFile())
    fail('RUNTIME_CONTROL_INVALID', 'Protected activation proof is missing: ' + file);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file)));
  } catch {
    fail('RUNTIME_CONTROL_INVALID', 'Protected activation proof is unreadable: ' + file);
  }
}
export function assertRuntimeEmptyAdmission(layout, primitives) {
  const { assertPath, fail } = primitives;
  const directory = assertPath(
    path.join(layout.sharedRuntimeRoot, 'empty-initializations'),
    layout.sharedRuntimeRoot,
    'RUNTIME_CONTROL_INVALID'
  );
  const stat = exists(directory);
  if (!stat) return;
  if (!stat.isDirectory())
    fail('RUNTIME_CONTROL_INVALID', 'Empty activation history must be a protected directory');
  const names = readdirSync(directory);
  if (!names.length)
    fail('RUNTIME_CONTROL_INVALID', 'Unbound empty activation ancestors require exact recovery');
  for (const id of names) {
    if (!validEmptyOperationId(id))
      fail('RUNTIME_CONTROL_INVALID', 'Unknown empty activation history');
    const operation = assertPath(
      path.join(directory, id),
      layout.sharedRuntimeRoot,
      'RUNTIME_CONTROL_INVALID'
    );
    if (
      !exists(operation)?.isDirectory() ||
      readdirSync(operation).sort().join(',') !== 'journal.json'
    )
      fail(
        'RUNTIME_CONTROL_INVALID',
        'Unbound empty activation artifact requires exact recovery: ' + operation
      );
    const journal = read(
      path.join(operation, 'journal.json'),
      layout.sharedRuntimeRoot,
      primitives
    );
    if (
      !validEmptyRuntimeJournal(journal) ||
      journal.plan.operationId !== id ||
      journal.plan.mainRoot !== layout.mainRoot
    )
      fail('RUNTIME_CONTROL_INVALID', 'Malformed empty activation journal');
    if (journal.status !== 'complete')
      fail(
        'RUNTIME_TRANSACTION_INCOMPLETE',
        'Empty activation publication requires registered status and exact resume'
      );
    const control = exists(layout.sharedControlPath)
      ? read(layout.sharedControlPath, layout.sharedRuntimeRoot, primitives)
      : null;
    if (control?.schema === 'aitm.runtime-control/v2' && control.activation?.id === id) {
      if (!validEmptyRuntimeControl(control) || control.activation.digest !== journal.plan.digest)
        fail('RUNTIME_CONTROL_INVALID', 'Empty activation control contradicts its journal');
      if (control.status !== 'active')
        fail(
          'RUNTIME_TRANSACTION_INCOMPLETE',
          'Empty journal completed before active control; use exact resume'
        );
    } else if (!control)
      fail('RUNTIME_CONTROL_INVALID', 'Complete empty authority has lost its main control');
  }
}

export function readRuntimeMainActivation(layout, primitives) {
  const { assertPath, fail, physicalIdentity, readV1Control, assertRecords, assertBatch } =
    primitives;
  assertRuntimeEmptyAdmission(layout, primitives);
  assertBatch(layout);
  const controlFile = assertPath(
    layout.sharedControlPath,
    layout.sharedRuntimeRoot,
    'RUNTIME_CONTROL_INVALID'
  );
  if (!exists(controlFile)) {
    if (exists(layout.sharedRuntimeRoot))
      fail(
        'RUNTIME_CONTROL_INVALID',
        'Main runtime residue or partial loss requires protected recovery'
      );
    fail(
      'RUNTIME_MIGRATION_REQUIRED',
      'Explicit main runtime migration or empty initialization required'
    );
  }
  const control = read(controlFile, layout.sharedRuntimeRoot, primitives);
  let activation, originalRoots, originalRootIdentities;
  if (control?.schema === 'aitm.runtime-control/v2') {
    if (
      !validEmptyRuntimeControl(control) ||
      control.projectRoot !== layout.mainRoot ||
      control.mainRoot !== layout.mainRoot
    )
      fail('RUNTIME_CONTROL_INVALID', 'Main empty control identity is invalid');
    if (control.status !== 'active')
      fail('RUNTIME_TRANSACTION_INCOMPLETE', 'Main empty activation requires exact recovery');
    const file = path.join(
      layout.sharedRuntimeRoot,
      'empty-initializations',
      control.activation.id,
      'journal.json'
    );
    const journal = read(file, layout.sharedRuntimeRoot, primitives);
    if (
      !validEmptyRuntimeJournal(journal) ||
      journal.plan.mainRoot !== layout.mainRoot ||
      journal.plan.operationId !== control.activation.id ||
      journal.plan.digest !== control.activation.digest
    )
      fail('RUNTIME_CONTROL_INVALID', 'Main empty activation journal disagrees with control');
    if (journal.status !== 'complete')
      fail('RUNTIME_TRANSACTION_INCOMPLETE', 'Main empty activation journal is unfinished');
    for (const [key, relative] of Object.entries({
      runtime: '',
      migrations: 'migrations',
      'empty-initializations': 'empty-initializations',
      operation: path.join('empty-initializations', journal.plan.operationId),
    })) {
      const file = assertPath(
        path.join(layout.sharedRuntimeRoot, relative),
        layout.sharedRuntimeRoot,
        'RUNTIME_CONTROL_INVALID'
      );
      const stat = exists(file);
      if (
        !stat?.isDirectory() ||
        emptyRuntimeDigest({ dev: stat.dev, ino: stat.ino, mode: stat.mode }) !==
          emptyRuntimeDigest(journal.ancestors[key])
      )
        fail('RUNTIME_CONTROL_INVALID', 'Main empty ancestor identity is changed');
    }
    activation = control.activation;
    originalRoots = journal.plan.originalRoots;
    originalRootIdentities = [journal.plan.mainIdentity];
  } else {
    const legacy = readV1Control(
      controlFile,
      layout.mainRoot,
      layout.mainRoot,
      layout.sharedRuntimeRoot
    );
    const directory = path.join(layout.migrationRoot, legacy.transactionId);
    const manifest = read(path.join(directory, 'manifest.json'), layout.migrationRoot, primitives);
    if (
      manifest.schema !== 'aitm.runtime-migration/v1' ||
      manifest.transactionId !== legacy.transactionId ||
      manifest.planDigest !== legacy.planDigest ||
      !Array.isArray(manifest.roots) ||
      !manifest.roots.includes(layout.mainRoot)
    )
      fail('RUNTIME_CONTROL_INVALID', 'Main migration activation proof is invalid');
    if (manifest.status !== 'complete')
      fail('RUNTIME_TRANSACTION_INCOMPLETE', 'Main migration publication is incomplete');
    const bootstrap = read(
      path.join(directory, 'bootstrap.json'),
      layout.migrationRoot,
      primitives
    );
    const plan = bootstrap.plan;
    if (
      !plan ||
      bootstrap.schema !== 'aitm.runtime-bootstrap/v1' ||
      plan.schema !== 'aitm.runtime-migration-plan/v1' ||
      plan.digest !== legacy.planDigest ||
      !Array.isArray(plan.rootIdentities)
    )
      fail('RUNTIME_CONTROL_INVALID', 'Main migration physical proof is missing');
    const { digest, ...payload } = plan;
    if (
      emptyRuntimeDigest(payload) !== digest ||
      emptyRuntimeDigest(plan.roots) !== emptyRuntimeDigest(manifest.roots)
    )
      fail('RUNTIME_CONTROL_INVALID', 'Main migration approved proof changed');
    activation = { kind: 'migration', id: legacy.transactionId, digest: legacy.planDigest };
    originalRoots = manifest.roots;
    originalRootIdentities = plan.rootIdentities;
  }
  for (const root of originalRoots) {
    const expected = originalRootIdentities.find((identity) => identity.projectRoot === root);
    if (!expected || emptyRuntimeDigest(physicalIdentity(root)) !== emptyRuntimeDigest(expected))
      fail('RUNTIME_CONTROL_INVALID', 'Original activation physical identity changed: ' + root);
  }
  assertRecords(layout);
  return {
    schema: 'aitm.runtime-activation-observation/v1',
    mainRoot: layout.mainRoot,
    activation,
    originalRoots,
    originalRootIdentities,
  };
}

// Linked recovery proof is observed before ownership and ordinary local admission.
export function inspectLinkedInitializationRecoveries(layout, journal, primitives) {
  const { assertPath, fail } = primitives;
  const directory = assertPath(
    path.join(layout.sharedRuntimeRoot, 'initialization-recoveries', journal.plan.id),
    layout.sharedRuntimeRoot,
    'RUNTIME_CONTROL_INVALID'
  );
  if (!exists(directory)) {
    if (journal.recoveryReceipt || journal.ownerHistory.length !== 1)
      fail('RUNTIME_CONTROL_INVALID', 'Linked owner history has lost its protected recovery proof');
    return { active: false, ownerHistory: journal.ownerHistory };
  }
  if (!exists(directory).isDirectory())
    fail('RUNTIME_CONTROL_INVALID', 'Invalid linked recovery directory');
  const names = readdirSync(directory).sort();
  if (!names.length || names.length > 10000)
    fail('RUNTIME_CONTROL_INVALID', 'Unbound linked recovery ancestors');
  let previousReceipt = null,
    ownerHistory = null,
    latest;
  for (const [index, name] of names.entries()) {
    if (name !== String(index).padStart(6, '0') + '.json')
      fail('RUNTIME_CONTROL_INVALID', 'Unknown or noncontiguous linked recovery artifact');
    const file = path.join(directory, name),
      record = read(file, layout.sharedRuntimeRoot, primitives);
    const keys = [
      'schema',
      'phase',
      'owner',
      'planDigest',
      'previousReceipt',
      'previousJournalDigest',
      'previousJournal',
    ];
    if (record.phase !== 'active') keys.push('endedAt');
    if (
      !emptyRuntimeKeys(record, keys) ||
      record.schema !== 'aitm.runtime-initialization-recovery/v2' ||
      !['active', 'released', 'complete'].includes(record.phase) ||
      !validEmptyRuntimeOwner(record.owner) ||
      record.planDigest !== journal.plan.digest ||
      record.previousReceipt !== previousReceipt ||
      !validRuntimeInitializationJournal(record.previousJournal) ||
      record.previousJournal.schema !== journal.schema ||
      record.previousJournal.plan.digest !== journal.plan.digest ||
      record.previousJournalDigest !== runtimeInitializationDigest(record.previousJournal) ||
      (record.phase !== 'active' &&
        (typeof record.endedAt !== 'string' || !Number.isFinite(Date.parse(record.endedAt))))
    )
      fail('RUNTIME_CONTROL_INVALID', 'Invalid linked recovery predecessor: ' + file);
    if (!ownerHistory) {
      if (
        record.previousJournal.recoveryReceipt ||
        record.previousJournal.ownerHistory.length !== 1
      )
        fail('RUNTIME_CONTROL_INVALID', 'Linked recovery has no original owner proof');
      ownerHistory = record.previousJournal.ownerHistory;
    }
    if (
      emptyRuntimeDigest(record.previousJournal.ownerHistory) !==
        emptyRuntimeDigest(ownerHistory) ||
      record.previousJournal.recoveryReceipt !== (previousReceipt ?? undefined)
    )
      fail('RUNTIME_CONTROL_INVALID', 'Linked recovery owner history contradicts its predecessor');
    if (latest?.phase === 'complete')
      fail('RUNTIME_CONTROL_INVALID', 'Linked recovery follows an already completed claim');
    ownerHistory = [...ownerHistory, record.owner];
    previousReceipt = file;
    latest = record;
  }
  const published =
    emptyRuntimeDigest(journal.ownerHistory) === emptyRuntimeDigest(ownerHistory) &&
    journal.recoveryReceipt === previousReceipt;
  const unclaimed =
    latest.phase === 'active' &&
    runtimeInitializationDigest(journal) === latest.previousJournalDigest;
  if (!published && !unclaimed)
    fail('RUNTIME_CONTROL_INVALID', 'Linked journal owner history has no matching recovery claim');
  if (latest.phase === 'complete' && journal.status !== 'complete')
    fail('RUNTIME_CONTROL_INVALID', 'Completed recovery disagrees with linked journal');
  return { active: latest.phase !== 'complete', ownerHistory };
}

// Preserve v1 receipt bytes and approval-only recovery while fencing unfinished claims.
export function inspectMigrationInitializationRecoveries(layout, journal, primitives) {
  const { assertPath, fail } = primitives;
  const directory = assertPath(
    path.join(layout.sharedRuntimeRoot, 'initialization-recoveries', journal.plan.id),
    layout.sharedRuntimeRoot,
    'RUNTIME_CONTROL_INVALID'
  );
  const stat = exists(directory);
  if (!stat) {
    if (journal.recoveryReceipt !== undefined)
      fail('RUNTIME_CONTROL_INVALID', 'Legacy initialization recovery proof is missing');
    return { active: false };
  }
  if (!stat.isDirectory())
    fail('RUNTIME_CONTROL_INVALID', 'Invalid legacy initialization recovery directory');
  const names = readdirSync(directory).sort();
  if (!names.length || names.length > 10000)
    fail('RUNTIME_CONTROL_INVALID', 'Unbound legacy initialization recovery ancestors');
  let previousReceipt = null,
    latest;
  for (const [index, name] of names.entries()) {
    if (name !== String(index).padStart(6, '0') + '.json')
      fail('RUNTIME_CONTROL_INVALID', 'Unknown legacy initialization recovery artifact');
    const file = path.join(directory, name),
      record = read(file, layout.sharedRuntimeRoot, primitives);
    const keys = [
      'schema',
      'phase',
      'owner',
      'planDigest',
      'previousReceipt',
      'previousJournalDigest',
    ];
    if (record?.phase !== 'active') keys.push('endedAt');
    if (
      !emptyRuntimeKeys(record, keys) ||
      record.schema !== 'aitm.runtime-initialization-recovery/v1' ||
      !['active', 'released', 'complete'].includes(record.phase) ||
      !validEmptyRuntimeOwner(record.owner) ||
      record.planDigest !== journal.plan.digest ||
      record.previousReceipt !== previousReceipt ||
      !validEmptyDigest(record.previousJournalDigest) ||
      (record.phase !== 'active' &&
        (typeof record.endedAt !== 'string' || !Number.isFinite(Date.parse(record.endedAt)))) ||
      latest?.phase === 'complete'
    )
      fail('RUNTIME_CONTROL_INVALID', 'Invalid legacy initialization recovery chain');
    previousReceipt = file;
    latest = record;
  }
  const published =
    journal.recoveryReceipt === previousReceipt &&
    emptyRuntimeDigest(journal.owner) === emptyRuntimeDigest(latest.owner);
  const unclaimed =
    latest.phase === 'active' &&
    runtimeInitializationDigest(journal) === latest.previousJournalDigest;
  if (!published && !unclaimed)
    fail('RUNTIME_CONTROL_INVALID', 'Legacy initialization journal disagrees with recovery claim');
  if (latest.phase === 'complete' && journal.status !== 'complete')
    fail('RUNTIME_CONTROL_INVALID', 'Completed legacy recovery disagrees with initialization');
  return { active: latest.phase !== 'complete' };
}
