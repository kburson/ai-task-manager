// @story #1861
import {
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  linkSync,
  unlinkSync,
  renameSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import {
  withRuntimeBootstrapCoordinator,
  writeMigrationRecord,
  assertRecoveryOwner,
  observeLocalRuntimeOwner,
} from './runtime-migration-lock.mjs';
import {
  emptyPaths,
  inspectEmptyRuntimeInitialization,
  assertEmptyAncestors,
  emptyPhysicalIdentity,
  emptyStat,
  emptySyncDirectory,
  emptyObserveTree,
  emptyFailure,
  assertEmptyConflictSet,
} from './runtime-empty-recovery.mjs';
export { inspectEmptyRuntimeInitialization } from './runtime-empty-recovery.mjs';
import { validEmptyRuntimePlan, emptyRuntimeControl } from './runtime-empty-record.mjs';
import { randomUUID } from 'node:crypto';
import { RuntimeRootError, assertRuntimeStoreRecords } from './runtime-storage.mjs';
import { INITIAL_RUNTIME_RECORDS } from './runtime-initialization-record.mjs';
import { observeRuntimeAuthorityCensus } from './runtime-authority-census.mjs';
import {
  emptyRuntimeDigest,
  emptyRuntimeObservationProjection,
  INITIAL_SHARED_RUNTIME_RECORDS,
} from './runtime-empty-record.mjs';
export async function planEmptyRuntimeInitialization({ projectRoot, mainRoot, adapters = {} }) {
  const observation = await observeRuntimeAuthorityCensus({ projectRoot, mainRoot, adapters });
  const blockers = [...observation.blockers];
  if (observation.layout.projectRoot !== observation.layout.mainRoot)
    blockers.push({ code: 'main-only', target: projectRoot });
  if (!observation.mainIdentity)
    blockers.push({ code: 'main-identity-unavailable', target: mainRoot });
  if (blockers.length) {
    const error = new RuntimeRootError(
      'RUNTIME_EMPTY_INIT_REFUSED',
      'Explicit empty initialization requires complete all-root absence and writer proof'
    );
    error.blockers = blockers;
    throw error;
  }
  const projection = emptyRuntimeObservationProjection(observation);
  const plan = {
    schema: 'aitm.runtime-empty-plan/v1',
    operationId: randomUUID(),
    projectRoot: observation.mainIdentity.projectRoot,
    mainRoot: observation.mainIdentity.projectRoot,
    mainIdentity: observation.mainIdentity,
    observation: projection,
    observationDigest: emptyRuntimeDigest(projection),
    originalRoots: [observation.mainIdentity.projectRoot],
    sourcePolicy: 'proven-total-absence-no-inherited-grants',
    records: { ...INITIAL_RUNTIME_RECORDS, ...INITIAL_SHARED_RUNTIME_RECORDS },
  };
  return { ...plan, digest: emptyRuntimeDigest(plan) };
}

async function assertSealedAbsence(plan, adapters, { paths, journal, coordinator } = {}) {
  const observation = await observeRuntimeAuthorityCensus({
    projectRoot: plan.projectRoot,
    mainRoot: plan.mainRoot,
    adapters,
  });
  const projection = emptyRuntimeObservationProjection(observation);
  if (paths) {
    if (journal) assertEmptyConflictSet(paths, journal, { coordinator });
    else {
      if (
        readdirSync(paths.sharedRuntimeRoot).join(',') !== 'migrations' ||
        readdirSync(paths.migrationRoot).join(',') !== 'coordinator.lock'
      )
        emptyFailure(
          'RUNTIME_MIGRATION_PLAN_CHANGED',
          'Unbound entries arrived during empty admission'
        );
      if (
        !coordinator ||
        coordinator.record.transactionId !== plan.operationId ||
        coordinator.record.planDigest !== plan.digest
      )
        emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Bootstrap coordinator context changed');
    }
    const allowed = [paths.sharedRuntimeRoot, paths.controlPath, paths.localRoot];
    projection.authority = projection.authority.map((item) =>
      item.target === paths.sharedRuntimeRoot ? { target: item.target, present: false } : item
    );
    projection.blockers = projection.blockers.filter(
      (item) =>
        !(
          allowed.includes(item.target) &&
          ['authority-present', 'destination-exists'].includes(item.code)
        )
    );
  }
  if (emptyRuntimeDigest(projection) !== plan.observationDigest)
    emptyFailure('RUNTIME_MIGRATION_PLAN_CHANGED', 'All-root empty approval observation changed');
}
function makeDirectory(file) {
  mkdirSync(file, { mode: 0o700 });
  emptySyncDirectory(path.dirname(file));
  return emptyPhysicalIdentity(emptyStat(file));
}
async function firstJournal(paths, journal, adapters) {
  const pending = path.join(paths.operationRoot, 'journal.initial.pending');
  const fd = openSync(pending, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(journal) + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  await adapters.fault?.('after-empty-first-pending');
  linkSync(pending, paths.journalPath);
  emptySyncDirectory(paths.operationRoot);
  unlinkSync(pending);
  emptySyncDirectory(paths.operationRoot);
  await adapters.fault?.('after-empty-first-journal');
}
async function publishEmpty(journal, paths, adapters, coordinator) {
  let owned = journal;
  const save = () => writeMigrationRecord(paths.journalPath, owned);
  assertEmptyConflictSet(paths, owned, { coordinator });
  if (!emptyStat(paths.localRoot)) {
    owned = { ...owned, status: 'publishing' };
    save();
    if (!emptyStat(paths.stageRoot)) {
      makeDirectory(paths.stageRoot);
      owned = { ...owned, stage: emptyObserveTree(paths.stageRoot) };
      save();
    }
    for (const [relative, bytes] of Object.entries(owned.plan.records)) {
      const file = path.join(paths.stageRoot, relative);
      const directory = path.dirname(file);
      if (!emptyStat(directory)) {
        makeDirectory(directory);
        owned = { ...owned, stage: emptyObserveTree(paths.stageRoot) };
        save();
      }
      if (!emptyStat(file)) {
        const fd = openSync(file, 'wx', 0o600);
        try {
          writeFileSync(fd, bytes);
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        emptySyncDirectory(directory);
        owned = { ...owned, stage: emptyObserveTree(paths.stageRoot) };
        save();
      }
      if (readFileSync(file, 'utf8') !== bytes)
        emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Fixed empty stage bytes changed');
      await adapters.fault?.('after-empty-stage-record');
    }
    assertEmptyConflictSet(paths, owned, { coordinator });
    await adapters.fault?.('after-empty-staging');
    await assertSealedAbsence(owned.plan, adapters, { paths, journal: owned, coordinator });
    if (!emptyStat(paths.controlPath))
      writeMigrationRecord(paths.controlPath, emptyRuntimeControl(owned.plan, 'prepared'));
    await adapters.fault?.('after-empty-prepared-control');
    renameSync(paths.stageRoot, paths.localRoot);
    emptySyncDirectory(paths.sharedRuntimeRoot);
    await adapters.fault?.('after-empty-store-rename');
  }
  assertEmptyConflictSet(paths, owned, { coordinator });
  for (const [relative, bytes] of Object.entries(owned.plan.records))
    if (readFileSync(path.join(paths.localRoot, relative), 'utf8') !== bytes)
      emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Fixed published empty bytes changed');
  await assertSealedAbsence(owned.plan, adapters, { paths, journal: owned, coordinator });
  owned = { ...owned, status: 'complete' };
  save();
  await adapters.fault?.('after-empty-complete-journal');
  writeMigrationRecord(paths.controlPath, emptyRuntimeControl(owned.plan, 'active'));
  await adapters.fault?.('after-empty-active-control');
  return { status: 'complete', operationId: owned.plan.operationId, journal: paths.journalPath };
}
export async function applyEmptyRuntimeInitialization({ plan, approvedPlanDigest, adapters = {} }) {
  if (!validEmptyRuntimePlan(plan) || plan.digest !== approvedPlanDigest)
    emptyFailure(
      'RUNTIME_MIGRATION_APPROVAL_REQUIRED',
      'Exact closed empty plan approval required'
    );
  await assertSealedAbsence(plan, adapters);
  const paths = emptyPaths({
    projectRoot: plan.projectRoot,
    mainRoot: plan.mainRoot,
    operationId: plan.operationId,
  });
  mkdirSync(path.dirname(paths.sharedRuntimeRoot), { recursive: true });
  let runtime;
  try {
    runtime = makeDirectory(paths.sharedRuntimeRoot);
  } catch (error) {
    if (error.code === 'EEXIST')
      emptyFailure(
        'RUNTIME_MIGRATION_PLAN_CHANGED',
        'Runtime prefix appeared after the sealed empty observation'
      );
    throw error;
  }
  const migrations = makeDirectory(paths.migrationRoot);
  return withRuntimeBootstrapCoordinator(
    {
      projectRoot: plan.projectRoot,
      mainRoot: plan.mainRoot,
      transactionId: plan.operationId,
      approvedPlanDigest: plan.digest,
      adapters,
    },
    async ({ owner, coordinator }) => {
      await assertSealedAbsence(plan, adapters, { paths, coordinator });
      const emptyRoot = makeDirectory(paths.emptyRoot),
        operation = makeDirectory(paths.operationRoot);
      const journal = {
        schema: 'aitm.runtime-empty-initialization/v1',
        status: 'prepared',
        plan,
        ancestors: { runtime, migrations, 'empty-initializations': emptyRoot, operation },
        stage: {},
        coordinator,
        owner,
        ownerHistory: [owner],
      };
      await firstJournal(paths, journal, adapters);
      return publishEmpty(journal, paths, adapters, coordinator);
    }
  );
}

export async function resumeEmptyRuntimeInitialization({
  projectRoot,
  mainRoot,
  operationId,
  observedDigest,
  approvedPlanDigest,
  adapters = {},
}) {
  const input = { projectRoot, mainRoot, operationId };
  const paths = emptyPaths(input);
  const observed = inspectEmptyRuntimeInitialization(input);
  const journal = observed.journal;
  if (journal.plan.digest !== approvedPlanDigest)
    emptyFailure(
      'RUNTIME_MIGRATION_APPROVAL_REQUIRED',
      'Original exact empty plan approval required'
    );
  if (observed.digest !== observedDigest)
    emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Protected empty observation changed');
  const active = emptyStat(paths.controlPath) && JSON.parse(readFileSync(paths.controlPath));
  if (
    journal.status === 'complete' &&
    emptyRuntimeDigest(active) === emptyRuntimeDigest(emptyRuntimeControl(journal.plan, 'active'))
  ) {
    // Completed retries validate current catalog records; no absence replay or
    // publication overwrites legitimate records written after activation.
    assertEmptyAncestors(paths, journal);
    assertRuntimeStoreRecords(paths);
    return { status: 'complete', operationId, journal: paths.journalPath };
  }
  assertEmptyConflictSet(paths, journal);
  assertRecoveryOwner(journal.owner, {
    ...adapters,
    observeOwner: adapters.observeOwner || observeLocalRuntimeOwner,
  });
  await assertSealedAbsence(journal.plan, adapters, { paths, journal });
  return withRuntimeBootstrapCoordinator(
    { projectRoot, mainRoot, transactionId: operationId, approvedPlanDigest, adapters },
    async ({ owner, coordinator }) => {
      if (
        emptyRuntimeDigest(JSON.parse(readFileSync(paths.journalPath))) !==
        emptyRuntimeDigest(journal)
      )
        emptyFailure(
          'RUNTIME_MIGRATION_CONFLICT',
          'Empty journal changed during recovery admission'
        );
      assertRecoveryOwner(journal.owner, {
        ...adapters,
        observeOwner: adapters.observeOwner || observeLocalRuntimeOwner,
      });
      await assertSealedAbsence(journal.plan, adapters, { paths, journal, coordinator });
      const owned = { ...journal, owner, ownerHistory: [...journal.ownerHistory, owner] };
      writeMigrationRecord(paths.journalPath, owned);
      await adapters.fault?.('after-empty-recovery-claim');
      return publishEmpty(owned, paths, adapters, coordinator);
    }
  );
}
