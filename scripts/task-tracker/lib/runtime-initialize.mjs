// @story #1857
import { withRuntimeInitializationRecovery } from './runtime-initialization-recovery.mjs';
// Explicit new-worktree initialization never imports volatile state or edits migration roots.
import {
  lstatSync,
  readFileSync,
  mkdirSync,
  openSync,
  readdirSync,
  fsyncSync,
  closeSync,
  renameSync,
} from 'node:fs';
import path from 'node:path';
import {
  runtimeStoragePaths,
  resolveRuntimeRoot,
  assertRuntimeReadable,
  assertRuntimeStoragePath,
  RuntimeRootError,
} from './runtime-storage.mjs';
import {
  withRuntimeWriterLease,
  observeMigrationIdentity,
  writeMigrationRecord,
  writeMigrationRecordExclusive,
  readMigrationRecord,
} from './runtime-migration-lock.mjs';
import {
  runtimeInitializationId,
  runtimeInitializationDigest,
  INITIAL_RUNTIME_RECORDS,
  validRuntimeInitializationPlan,
  validRuntimeInitializationJournal,
} from './runtime-initialization-record.mjs';

const fail = (code, message) => {
  throw new RuntimeRootError(code, message);
};
function exists(file) {
  try {
    lstatSync(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
function journalPath(layout) {
  const file = path.join(
    layout.sharedRuntimeRoot,
    'initializations',
    runtimeInitializationId(layout.projectRoot) + '.json'
  );
  return assertRuntimeStoragePath(file, layout.sharedRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
}
function observe(input) {
  const layout = runtimeStoragePaths(input);
  if (layout.projectRoot === layout.mainRoot)
    fail(
      'RUNTIME_INITIALIZATION_REFUSED',
      'Main authority requires migration or canonical reconciliation'
    );
  const main = assertRuntimeReadable({ projectRoot: layout.mainRoot, mainRoot: layout.mainRoot });
  const identity = resolveRuntimeRoot({ cwd: layout.projectRoot, env: {} }).worktreeIdentity;
  return { layout, main, identity };
}
export function planRuntimeInitialization(input) {
  const { layout, main, identity } = observe(input);
  const file = journalPath(layout);
  for (const target of [layout.controlPath, layout.localRoot]) {
    assertRuntimeStoragePath(target, layout.localRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
    if (exists(target))
      fail(
        'RUNTIME_CONTROL_INVALID',
        'Existing local authority requires recovery, never empty initialization'
      );
  }
  const original = readMigrationRecord(
    path.join(layout.migrationRoot, main.transactionId, 'manifest.json')
  );
  if (original.roots.includes(layout.projectRoot) || exists(file))
    fail('RUNTIME_CONTROL_INVALID', 'Protected root history proves this is not a fresh worktree');
  const plan = {
    schema: 'aitm.runtime-initialization-plan/v1',
    id: runtimeInitializationId(layout.projectRoot),
    projectRoot: layout.projectRoot,
    mainRoot: layout.mainRoot,
    gitDir: identity.gitDir,
    commonDir: identity.commonDir,
    mainTransactionId: main.transactionId,
    mainPlanDigest: main.planDigest,
    sourcePolicy: 'empty-local-no-volatile-inherit',
    records: INITIAL_RUNTIME_RECORDS,
  };
  return { ...plan, digest: runtimeInitializationDigest(plan) };
}
function assertCurrent(plan) {
  const observed = observe(plan);
  if (
    observed.main.transactionId !== plan.mainTransactionId ||
    observed.main.planDigest !== plan.mainPlanDigest ||
    observed.identity.gitDir !== plan.gitDir ||
    observed.identity.commonDir !== plan.commonDir
  )
    fail(
      'RUNTIME_MIGRATION_PLAN_CHANGED',
      'Initialization main generation or physical root changed'
    );
  return observed.layout;
}
function verifyTree(base, records) {
  const seen = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory)) {
      const file = assertRuntimeStoragePath(
        path.join(directory, name),
        base,
        'RUNTIME_MIGRATION_CONFLICT'
      );
      const stat = lstatSync(file);
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile()) seen.push(path.relative(base, file));
      else fail('RUNTIME_MIGRATION_CONFLICT', 'Unexpected initialization file shape');
    }
  };
  walk(base);
  if (JSON.stringify(seen.sort()) !== JSON.stringify(Object.keys(records).sort()))
    fail('RUNTIME_MIGRATION_CONFLICT', 'Initialization contains unplanned records');
}

async function publish(journal, layout, adapters) {
  const { plan } = journal;
  const file = journalPath(layout);
  const stage = path.join(layout.localRuntimeRoot, 'initialization-' + plan.id);
  const control = {
    schema: 'aitm.runtime-control/v1',
    status: 'prepared',
    projectRoot: plan.projectRoot,
    mainRoot: plan.mainRoot,
    transactionId: plan.mainTransactionId,
    planDigest: plan.mainPlanDigest,
    initializationId: plan.id,
    initializationDigest: plan.digest,
  };
  assertRuntimeStoragePath(stage, layout.localRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
  assertRuntimeStoragePath(layout.controlPath, layout.localRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
  assertRuntimeStoragePath(layout.localRoot, layout.localRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
  if (exists(layout.controlPath)) {
    const existing = readMigrationRecord(layout.controlPath);
    if (JSON.stringify(existing) !== JSON.stringify(control))
      fail('RUNTIME_MIGRATION_CONFLICT', 'Initialization control ownership changed');
  }
  if (!exists(layout.localRoot)) {
    mkdirSync(stage, { recursive: true });
    for (const [relative, bytes] of Object.entries(plan.records)) {
      const target = assertRuntimeStoragePath(
        path.join(stage, relative),
        stage,
        'RUNTIME_CONTROL_INVALID'
      );
      if (!exists(target)) {
        mkdirSync(path.dirname(target), { recursive: true });
        writeMigrationRecordExclusive(target, JSON.parse(bytes));
      }
      if (readFileSync(target, 'utf8') !== bytes)
        fail('RUNTIME_MIGRATION_CONFLICT', 'Initialization staging bytes changed');
    }
    verifyTree(stage, plan.records);
    writeMigrationRecord(layout.controlPath, control);
    await adapters.fault?.('after-initialization-stage');
    renameSync(stage, layout.localRoot);
    const fd = openSync(layout.localRuntimeRoot, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
  verifyTree(layout.localRoot, plan.records);
  for (const [relative, bytes] of Object.entries(plan.records)) {
    const target = assertRuntimeStoragePath(
      path.join(layout.localRoot, relative),
      layout.localRoot,
      'RUNTIME_CONTROL_INVALID'
    );
    if (readFileSync(target, 'utf8') !== bytes)
      fail('RUNTIME_MIGRATION_CONFLICT', 'Initialization published bytes changed');
  }
  await adapters.fault?.('after-initialization-publish');
  writeMigrationRecord(file, { ...journal, status: 'complete' });
  await adapters.fault?.('after-initialization-journal');
  writeMigrationRecord(layout.controlPath, { ...control, status: 'active' });
  assertRuntimeReadable(plan);
  return { status: 'complete', initializationId: plan.id, journal: file };
}
export async function applyRuntimeInitialization({ plan, approvedPlanDigest, adapters = {} }) {
  if (!validRuntimeInitializationPlan(plan) || plan.digest !== approvedPlanDigest)
    fail('RUNTIME_MIGRATION_APPROVAL_REQUIRED', 'Exact initialization plan required');
  return withRuntimeWriterLease(
    { projectRoot: plan.projectRoot, mainRoot: plan.mainRoot, adapters },
    async () => {
      const fresh = planRuntimeInitialization(plan);
      if (fresh.digest !== plan.digest)
        fail('RUNTIME_MIGRATION_PLAN_CHANGED', 'Initialization plan changed');
      const layout = assertCurrent(plan);
      const file = journalPath(layout);
      const journal = {
        schema: 'aitm.runtime-initialization/v1',
        status: 'prepared',
        plan,
        owner: observeMigrationIdentity(adapters),
      };
      mkdirSync(path.dirname(file), { recursive: true });
      writeMigrationRecordExclusive(file, journal);
      await adapters.fault?.('after-initialization-claim');
      return publish(journal, layout, adapters);
    }
  );
}
export async function resumeRuntimeInitialization({
  projectRoot,
  mainRoot,
  approvedPlanDigest,
  adapters = {},
}) {
  const layout = runtimeStoragePaths({ projectRoot, mainRoot });
  const journal = readMigrationRecord(journalPath(layout));
  if (
    !validRuntimeInitializationJournal(journal) ||
    journal.plan.digest !== approvedPlanDigest ||
    journal.plan.projectRoot !== projectRoot ||
    journal.plan.mainRoot !== mainRoot
  )
    fail('RUNTIME_CONTROL_INVALID', 'Initialization journal identity mismatch');
  assertCurrent(journal.plan);
  return withRuntimeWriterLease({ projectRoot, mainRoot, adapters }, async () => {
    if (
      journal.status === 'complete' &&
      !journal.recoveryReceipt &&
      exists(layout.controlPath) &&
      readMigrationRecord(layout.controlPath).status === 'active'
    ) {
      assertRuntimeReadable({ projectRoot, mainRoot });
      return { status: 'complete', initializationId: journal.plan.id };
    }
    return withRuntimeInitializationRecovery({ layout, journal, adapters }, async (owned) => {
      if (
        journal.status === 'complete' &&
        exists(layout.controlPath) &&
        readMigrationRecord(layout.controlPath).status === 'active'
      ) {
        assertRuntimeReadable({ projectRoot, mainRoot });
        return { status: 'complete', initializationId: journal.plan.id };
      }
      return publish(owned, layout, adapters);
    });
  });
}
