// @story #1857
// Recovery ownership is independent of cooperative writer admission.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { assertRuntimeStoragePath, RuntimeRootError } from './runtime-storage.mjs';
import {
  assertRecoveryOwner,
  observeLocalRuntimeOwner,
  readMigrationRecord,
  writeMigrationRecord,
  writeMigrationRecordExclusive,
  isRuntimeMigrationOwner,
  observeMigrationIdentity,
} from './runtime-migration-lock.mjs';
import { runtimeInitializationDigest } from './runtime-initialization-record.mjs';
const fail = (code, message) => {
  throw new RuntimeRootError(code, message);
};
const sameOwner = (left, right) =>
  ['provider', 'sid', 'pid', 'processToken', 'host'].every((key) => left?.[key] === right?.[key]);

export async function withRuntimeInitializationRecovery({ layout, journal, adapters }, operation) {
  const observeOwner = adapters.observeOwner || observeLocalRuntimeOwner;
  const directory = path.join(
    layout.sharedRuntimeRoot,
    'initialization-recoveries',
    journal.plan.id
  );
  assertRuntimeStoragePath(directory, layout.sharedRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
  mkdirSync(directory, { recursive: true });
  let previousReceipt = null;
  for (let generation = 0; generation < 10000; generation++) {
    const receipt = path.join(directory, String(generation).padStart(6, '0') + '.json');
    assertRuntimeStoragePath(receipt, directory, 'RUNTIME_CONTROL_INVALID');
    const earlier = readMigrationRecord(receipt, true);
    if (earlier !== undefined) {
      if (
        !earlier ||
        earlier.schema !== 'aitm.runtime-initialization-recovery/v1' ||
        !['active', 'released', 'complete'].includes(earlier.phase) ||
        earlier.planDigest !== journal.plan.digest ||
        !isRuntimeMigrationOwner(earlier.owner) ||
        earlier.previousReceipt !== previousReceipt ||
        !/^sha256:[a-f0-9]{64}$/.test(earlier.previousJournalDigest)
      )
        fail('RUNTIME_CONTROL_INVALID', 'Initialization recovery history is malformed');
      if (earlier.phase === 'complete') {
        if (journal.status === 'complete' && journal.recoveryReceipt === receipt)
          return operation(journal);
        fail('RUNTIME_MIGRATION_CONFLICT', 'Completed initialization claim disagrees with journal');
      }
      if (earlier.phase === 'active') {
        const observed = observeOwner(earlier.owner);
        if (observed?.status !== 'dead' || !sameOwner(observed.identity, earlier.owner))
          fail(
            'RUNTIME_MIGRATION_BUSY',
            'Another live or unconfirmed initialization recovery owns publication'
          );
      }
      previousReceipt = receipt;
      continue;
    }
    const owner = previousReceipt
      ? observeMigrationIdentity(adapters)
      : assertRecoveryOwner(journal.owner, { ...adapters, observeOwner });
    const evidence = {
      schema: 'aitm.runtime-initialization-recovery/v1',
      phase: 'active',
      owner,
      planDigest: journal.plan.digest,
      previousReceipt,
      previousJournalDigest: runtimeInitializationDigest(journal),
    };
    try {
      writeMigrationRecordExclusive(receipt, evidence);
    } catch (error) {
      if (error.code === 'EEXIST')
        fail('RUNTIME_MIGRATION_BUSY', 'Another recovery claimed initialization');
      throw error;
    }
    const finish = (phase) => {
      const current = readMigrationRecord(receipt);
      if (runtimeInitializationDigest(current) !== runtimeInitializationDigest(evidence))
        fail('RUNTIME_MIGRATION_CONFLICT', 'Initialization recovery ownership changed');
      writeMigrationRecord(receipt, { ...evidence, phase, endedAt: new Date().toISOString() });
    };
    try {
      await adapters.fault?.('after-initialization-recovery-claim', { receipt });
      const journalFile = path.join(
        layout.sharedRuntimeRoot,
        'initializations',
        journal.plan.id + '.json'
      );
      assertRuntimeStoragePath(journalFile, layout.sharedRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
      if (
        runtimeInitializationDigest(readMigrationRecord(journalFile)) !==
        evidence.previousJournalDigest
      )
        fail(
          'RUNTIME_MIGRATION_CONFLICT',
          'Initialization journal changed before recovery ownership publication'
        );
      const owned = { ...journal, owner, recoveryReceipt: receipt };
      writeMigrationRecord(journalFile, owned);
      const result = await operation(owned);
      finish('complete');
      return result;
    } catch (error) {
      finish('released');
      throw error;
    }
  }
  fail('RUNTIME_CONTROL_INVALID', 'Initialization recovery history exceeds supported bound');
}
