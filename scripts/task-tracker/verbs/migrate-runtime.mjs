// @story #1857
// This registered bootstrap never constructs ordinary binding/runtime context.
import { configPath } from '../paths.mjs';
import { loadConfig } from '../config.mjs';
import { reconcileRuntimeMigrationTiming } from '../lib/runtime-migration-timing.mjs';
import { readdirSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseRuntimeMigrationInvocation,
  classifyRuntimeMigrationInvocation,
} from '../lib/runtime-migration-admission.mjs';
import {
  resolveRuntimeRoot,
  runtimeStoragePaths,
  assertRuntimeStoragePath,
  RuntimeRootError,
} from '../lib/runtime-storage.mjs';
import { planRuntimeMigration } from '../lib/runtime-migration-plan.mjs';
import {
  readRuntimePlanInput,
  acknowledgeRuntimeLegacyPlan,
} from '../lib/runtime-migration-input.mjs';
import { observeRuntimeWriterCensus } from '../lib/runtime-writer-census.mjs';
import {
  observeMigrationIdentity,
  observeLocalRuntimeOwner,
  inspectRuntimeFence,
  inspectRuntimeCoordinator,
  inspectRuntimeWriterLeases,
  recoverRuntimeCoordinator,
  recoverRuntimeWriterLease,
} from '../lib/runtime-migration-lock.mjs';
import {
  inspectRuntimeOperationLock,
  recoverRuntimeOperationLock,
} from '../lib/runtime-migration-lock.mjs';
import {
  planRuntimeInitialization,
  applyRuntimeInitialization,
  resumeRuntimeInitialization,
} from '../lib/runtime-initialize.mjs';
import { validRuntimeInitializationPlan } from '../lib/runtime-initialization-record.mjs';
import {
  applyRuntimeMigration,
  resumeRuntimeMigration,
  readRuntimeMigrationStatus,
  readRuntimeMigrationSnapshot,
} from '../lib/runtime-migration-apply.mjs';

import { inspectRuntimeBatch, resumeRuntimeBatch } from '../lib/runtime-batch.mjs';

const fail = (code, message) => {
  throw new RuntimeRootError(code, message);
};
const registeredRouter = fileURLToPath(new URL('../../../bin/aitm.mjs', import.meta.url));

export async function verbMigrateRuntime(argv) {
  const parsed = parseRuntimeMigrationInvocation(argv);
  if (!parsed) fail('RUNTIME_MIGRATION_USAGE', 'Unsupported migrate-runtime arguments');
  const identity = resolveRuntimeRoot();
  const roots = { projectRoot: identity.projectRoot, mainRoot: identity.mainRoot };
  const request = classifyRuntimeMigrationInvocation({
    argv,
    executable: process.argv[1],
    physicalRoots: roots,
  });
  if (!request)
    fail(
      'RUNTIME_MIGRATION_ADMISSION_REFUSED',
      'Registered physical bootstrap executable and roots are required'
    );
  const layout = runtimeStoragePaths(roots);
  let owner;
  try {
    owner = observeMigrationIdentity({});
  } catch (error) {
    if (!['plan', 'status', 'initialize-plan', 'batch-status'].includes(request.mode)) throw error;
  }
  let observedInput = null;
  const adapters = {
    identity: () => owner,
    observeOwner: observeLocalRuntimeOwner,
    writerCensus: (input) => {
      if (input) observedInput = input;
      if (!observedInput)
        return {
          complete: false,
          writers: [],
          claims: [],
          unknown: [{ reason: 'source-census-unavailable' }],
        };
      return observeRuntimeWriterCensus({ ...observedInput, owner: owner || {}, registeredRouter });
    },
  };
  if (request.mode === 'batch-status')
    return inspectRuntimeBatch({ ...roots, operationId: request.operationId });
  if (request.mode === 'batch-resume')
    return resumeRuntimeBatch({
      ...roots,
      operationId: request.operationId,
      observedDigest: request.expectedDigest,
      adapters,
    });
  if (request.mode === 'recover-coordinator')
    return recoverRuntimeCoordinator({ ...roots, ...request, adapters });
  if (request.mode === 'recover-writer')
    return recoverRuntimeWriterLease({ ...roots, ...request, adapters });
  if (request.mode === 'recover-operation')
    return recoverRuntimeOperationLock({ ...roots, ...request, adapters });
  if (request.mode === 'initialize-plan') return planRuntimeInitialization(roots);
  if (request.mode === 'initialize-resume')
    return resumeRuntimeInitialization({
      ...roots,
      approvedPlanDigest: request.approvedPlanDigest,
      adapters,
    });
  if (request.mode === 'initialize-apply') {
    let plan;
    try {
      if (!lstatSync(request.planFile).isFile()) throw new Error('not a regular plan');
      plan = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(request.planFile))
      );
    } catch {
      fail('RUNTIME_MIGRATION_APPROVAL_REQUIRED', 'Unreadable initialization plan artifact');
    }
    if (
      !validRuntimeInitializationPlan(plan) ||
      plan.digest !== request.approvedPlanDigest ||
      plan.projectRoot !== roots.projectRoot ||
      plan.mainRoot !== roots.mainRoot
    )
      fail(
        'RUNTIME_MIGRATION_APPROVAL_REQUIRED',
        'Exact initialization plan and physical roots must agree'
      );
    return applyRuntimeInitialization({
      plan,
      approvedPlanDigest: request.approvedPlanDigest,
      adapters,
    });
  }
  if (request.mode === 'plan') {
    if (!request.trustPlanFile) return planRuntimeMigration({ ...roots, adapters });
    const observedPlan = readRuntimePlanInput({
      ...roots,
      file: request.trustPlanFile,
      approvedPlanDigest: request.approvedPlanDigest,
    });
    return acknowledgeRuntimeLegacyPlan({
      ...roots,
      observedPlan,
      approvedPlanDigest: request.approvedPlanDigest,
      adapters,
    });
  }
  if (request.mode === 'status') {
    if (request.transactionId)
      return readRuntimeMigrationStatus({ ...roots, transactionId: request.transactionId });
    assertRuntimeStoragePath(
      layout.migrationRoot,
      layout.sharedRuntimeRoot,
      'RUNTIME_CONTROL_INVALID'
    );
    let names;
    try {
      names = readdirSync(layout.migrationRoot);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      names = [];
    }
    const transactions = [];
    const recoveryJournals = [];
    const operationLocks = [];
    for (const name of names.sort()) {
      const entry = assertRuntimeStoragePath(
        path.join(layout.migrationRoot, name),
        layout.sharedRuntimeRoot,
        'RUNTIME_CONTROL_INVALID'
      );
      if (['writers', 'fence.json', 'coordinator.lock'].includes(name)) continue;
      if (name === 'operation-locks') {
        if (!lstatSync(entry).isDirectory())
          fail('RUNTIME_CONTROL_INVALID', 'Operation lock container is not a directory');
        for (const recordKey of readdirSync(entry).sort()) {
          if (!/^[a-f0-9]{64}$/.test(recordKey))
            fail('RUNTIME_CONTROL_INVALID', 'Unknown operation lock key');
          const directory = assertRuntimeStoragePath(
            path.join(entry, recordKey),
            layout.sharedRuntimeRoot,
            'RUNTIME_CONTROL_INVALID'
          );
          if (!lstatSync(directory).isDirectory())
            fail('RUNTIME_CONTROL_INVALID', 'Operation lock entry is not a directory');
          const entries = readdirSync(directory).sort();
          if (
            entries.some((file) => !['coordinator.lock', 'coordinator-recoveries'].includes(file))
          )
            fail('RUNTIME_CONTROL_INVALID', 'Unresolved operation publication artifact');
          operationLocks.push({
            recordKey,
            ...inspectRuntimeOperationLock({ ...roots, recordKey }),
            recoveryStatus: entries.includes('coordinator-recoveries')
              ? 'requires-exact-recovery-validation'
              : 'none',
          });
        }
        continue;
      }
      if (['writer-recoveries', 'coordinator-recoveries'].includes(name)) {
        if (!lstatSync(entry).isDirectory())
          fail('RUNTIME_CONTROL_INVALID', 'Recovery container is not a directory');
        recoveryJournals.push({
          name,
          status: 'requires-exact-recovery-validation',
          entries: readdirSync(entry).sort(),
        });
        continue;
      }
      if (!name.startsWith('migration-'))
        fail('RUNTIME_CONTROL_INVALID', 'Unknown migration directory entry');
      transactions.push(await readRuntimeMigrationStatus({ ...roots, transactionId: name }));
    }
    return {
      schema: 'aitm.runtime-bootstrap-status/v1',
      ...roots,
      transactions,
      operationLocks,
      fence: inspectRuntimeFence(roots),
      coordinator: inspectRuntimeCoordinator(roots),
      writers: inspectRuntimeWriterLeases(roots),
      recoveryJournals,
    };
  }
  let plan;
  if (request.mode === 'apply') {
    plan = readRuntimePlanInput({
      ...roots,
      file: request.planFile,
      approvedPlanDigest: request.approvedPlanDigest,
    });
    if (request.transactionId !== 'migration-' + request.approvedPlanDigest.slice(7, 39))
      fail(
        'RUNTIME_MIGRATION_APPROVAL_REQUIRED',
        'Transaction identity must derive from the exact approved plan'
      );
  } else {
    plan = readRuntimeMigrationSnapshot({ ...roots, transactionId: request.transactionId }).plan;
    if (plan.digest !== request.approvedPlanDigest)
      fail(
        'RUNTIME_MIGRATION_APPROVAL_REQUIRED',
        'Approved digest differs from the protected transaction'
      );
  }
  observedInput = { ...roots, roots: layout.registeredRoots, files: plan.files, owner };
  adapters.publishTiming = (record) =>
    reconcileRuntimeMigrationTiming({
      ...record,
      repository: loadConfig({ projectPath: configPath(roots.projectRoot) }).repo,
    });
  adapters.trustLegacy = ({ source, digest, root, family }) =>
    plan.files.some(
      (file) =>
        file.source === source &&
        file.digest === digest &&
        file.root === root &&
        file.family === family &&
        file.trust === 'explicit-operator-trust'
    )
      ? 'explicit-operator-trust'
      : 'unresolved';
  return request.mode === 'apply'
    ? applyRuntimeMigration({ plan, approvedPlanDigest: request.approvedPlanDigest, adapters })
    : resumeRuntimeMigration({
        ...roots,
        transactionId: request.transactionId,
        approvedPlanDigest: request.approvedPlanDigest,
        adapters,
      });
}
