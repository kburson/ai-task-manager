import { inspectLinkedInitializationRecoveries } from './runtime-activation-admission.mjs';
import { randomUUID } from 'node:crypto';
import {
  emptyRuntimeDigest,
  validEmptyOperationId,
  validEmptyRuntimeControl,
} from './runtime-empty-record.mjs';
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
  assertRuntimeStoreRecords,
  readRuntimeActivationRoot,
  assertRuntimeStoragePath,
  RuntimeRootError,
} from './runtime-storage.mjs';
import {
  withRuntimeWriterLease,
  assertRecoveryOwner,
  observeLocalRuntimeOwner,
  withRuntimeBootstrapCoordinator,
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
  const activation = readRuntimeActivationRoot({
    projectRoot: layout.mainRoot,
    mainRoot: layout.mainRoot,
  });
  const main = {
    ...activation,
    transactionId: activation.activation.id,
    planDigest: activation.activation.digest,
  };
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
  const original = { roots: main.originalRoots };
  if (original.roots.includes(layout.projectRoot) || exists(file))
    fail('RUNTIME_CONTROL_INVALID', 'Protected root history proves this is not a fresh worktree');
  const legacyTargets = [path.join(layout.projectRoot, '.db', 'aitm')];
  const legacyNames = [
    'task-tracker-state.json',
    'task-tracker-queue.json',
    'task-fleet.json',
    'occupancy.json',
    'orchestrator.lock',
    'closed-bindings.json',
    'state',
    'fleet',
    'sessions',
    'gates',
    'locks',
    'app',
    'cache',
    'draft-branch',
    'action-capture',
  ];
  for (const directory of ['.claude', '.ai-task-manager'])
    for (const name of legacyNames)
      legacyTargets.push(path.join(layout.projectRoot, directory, name));
  for (const target of legacyTargets) {
    assertRuntimeStoragePath(target, layout.projectRoot, 'RUNTIME_INITIALIZATION_REFUSED');
    if (exists(target))
      fail(
        'RUNTIME_INITIALIZATION_REFUSED',
        'Durable legacy evidence requires explicit reconciliation'
      );
  }
  if (main.activation.kind === 'empty-initialization') {
    if (exists(layout.localRuntimeRoot))
      fail(
        'RUNTIME_CONTROL_INVALID',
        'Local runtime residue requires recovery; protected history is never fresh authority: ' +
          file
      );
    const value = {
      schema: 'aitm.runtime-initialization-plan/v2',
      id: runtimeInitializationId(layout.projectRoot),
      operationId: randomUUID(),
      projectRoot: layout.projectRoot,
      mainRoot: layout.mainRoot,
      gitDir: identity.gitDir,
      commonDir: identity.commonDir,
      activation: main.activation,
      sourcePolicy: 'empty-local-no-volatile-inherit',
      records: INITIAL_RUNTIME_RECORDS,
    };
    return { ...value, digest: runtimeInitializationDigest(value) };
  }
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
    (plan.schema === 'aitm.runtime-initialization-plan/v2'
      ? runtimeInitializationDigest(observed.main.activation) !==
        runtimeInitializationDigest(plan.activation)
      : observed.main.transactionId !== plan.mainTransactionId ||
        observed.main.planDigest !== plan.mainPlanDigest) ||
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
  const control =
    plan.schema === 'aitm.runtime-initialization-plan/v2'
      ? {
          schema: 'aitm.runtime-control/v2',
          status: 'prepared',
          projectRoot: plan.projectRoot,
          mainRoot: plan.mainRoot,
          activation: plan.activation,
          initialization: { id: plan.id, operationId: plan.operationId, digest: plan.digest },
        }
      : {
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
  await adapters.fault?.('after-initialization-control');
  if (!journal.recoveryReceipt) assertRuntimeReadable(plan);
  return { status: 'complete', initializationId: plan.id, journal: file };
}
export async function applyRuntimeInitialization({ plan, approvedPlanDigest, adapters = {} }) {
  if (!validRuntimeInitializationPlan(plan) || plan.digest !== approvedPlanDigest)
    fail('RUNTIME_MIGRATION_APPROVAL_REQUIRED', 'Exact initialization plan required');
  return withRuntimeWriterLease(
    { projectRoot: plan.projectRoot, mainRoot: plan.mainRoot, adapters },
    async () => {
      const fresh = planRuntimeInitialization(plan);
      const { digest: _freshDigest, ...freshContents } = fresh;
      if (plan.schema === 'aitm.runtime-initialization-plan/v2')
        freshContents.operationId = plan.operationId;
      if (
        (plan.schema === 'aitm.runtime-initialization-plan/v2'
          ? runtimeInitializationDigest(freshContents)
          : fresh.digest) !== plan.digest
      )
        fail('RUNTIME_MIGRATION_PLAN_CHANGED', 'Initialization plan changed');
      const layout = assertCurrent(plan);
      const file = journalPath(layout);
      const owner = observeMigrationIdentity(adapters);
      const journal = {
        schema:
          plan.schema === 'aitm.runtime-initialization-plan/v2'
            ? 'aitm.runtime-initialization/v2'
            : 'aitm.runtime-initialization/v1',
        status: 'prepared',
        plan,
        owner,
        ...(plan.schema === 'aitm.runtime-initialization-plan/v2' ? { ownerHistory: [owner] } : {}),
      };
      mkdirSync(path.dirname(file), { recursive: true });
      writeMigrationRecordExclusive(file, journal);
      await adapters.fault?.('after-initialization-claim');
      if (plan.schema === 'aitm.runtime-initialization-plan/v2')
        return withRuntimeBootstrapCoordinator(
          {
            projectRoot: plan.projectRoot,
            mainRoot: plan.mainRoot,
            transactionId: plan.operationId,
            approvedPlanDigest: plan.digest,
            adapters,
          },
          async () => {
            assertCurrent(plan);
            return publish(journal, layout, adapters);
          }
        );
      return publish(journal, layout, adapters);
    }
  );
}
export async function resumeRuntimeInitialization({
  projectRoot,
  mainRoot,
  approvedPlanDigest,
  operationId,
  observedDigest,
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
  if (journal.schema === 'aitm.runtime-initialization/v2')
    return resumeLinkedEmpty({
      projectRoot,
      mainRoot,
      operationId,
      observedDigest,
      approvedPlanDigest,
      adapters,
    });
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
    const result = await withRuntimeInitializationRecovery(
      { layout, journal, adapters },
      async (owned) => {
        if (
          journal.status === 'complete' &&
          exists(layout.controlPath) &&
          readMigrationRecord(layout.controlPath).status === 'active'
        ) {
          return { status: 'complete', initializationId: journal.plan.id };
        }
        return publish(owned, layout, adapters);
      }
    );
    assertRuntimeReadable({ projectRoot, mainRoot });
    return result;
  });
}

// Status is a root-derived read observation, never an operation search or ownership claim.
function protectedTree(base, absentAllowed = true) {
  assertRuntimeStoragePath(base, base, 'RUNTIME_CONTROL_INVALID');
  if (!exists(base)) {
    if (absentAllowed) return null;
    fail('RUNTIME_CONTROL_INVALID', 'Protected initialization evidence missing: ' + base);
  }
  const rows = [];
  const walk = (target) => {
    assertRuntimeStoragePath(target, base, 'RUNTIME_CONTROL_INVALID');
    const stat = lstatSync(target),
      relative = path.relative(base, target);
    const identity = { dev: stat.dev, ino: stat.ino, mode: stat.mode };
    if (stat.isDirectory()) {
      rows.push({ path: relative, kind: 'directory', ...identity });
      for (const name of readdirSync(target).sort()) walk(path.join(target, name));
    } else if (stat.isFile())
      rows.push({
        path: relative,
        kind: 'file',
        ...identity,
        digest: emptyRuntimeDigest(readFileSync(target)),
      });
    else fail('RUNTIME_CONTROL_INVALID', 'Uncertain initialization evidence: ' + target);
  };
  try {
    walk(base);
  } catch (error) {
    if (error instanceof RuntimeRootError) throw error;
    fail('RUNTIME_CONTROL_INVALID', 'Unreadable initialization evidence: ' + base);
  }
  return rows;
}
function verifyLinkedPublication(journal, layout) {
  const stage = path.join(layout.localRuntimeRoot, 'initialization-' + journal.plan.id);
  if (!exists(layout.localRuntimeRoot)) return;
  const control = exists(layout.controlPath) ? readMigrationRecord(layout.controlPath) : null;
  if (journal.status === 'complete' && control?.status === 'active') {
    // Main proof and the closed local journal/control are validated independently
    // from a still-active recovery claim, so status remains reachable.
    readRuntimeActivationRoot(journal.plan);
    if (
      !validEmptyRuntimeControl(control) ||
      control.projectRoot !== layout.projectRoot ||
      control.mainRoot !== layout.mainRoot ||
      emptyRuntimeDigest(control.initialization) !==
        emptyRuntimeDigest({
          id: journal.plan.id,
          operationId: journal.plan.operationId,
          digest: journal.plan.digest,
        }) ||
      emptyRuntimeDigest(control.activation) !== emptyRuntimeDigest(journal.plan.activation)
    )
      fail('RUNTIME_CONTROL_INVALID', 'Completed local control contradicts initialization');
    assertRuntimeStoreRecords(layout);
    return;
  }
  if (!lstatSync(layout.localRuntimeRoot).isDirectory())
    fail('RUNTIME_CONTROL_INVALID', 'Local runtime is not a protected directory');
  for (const name of readdirSync(layout.localRuntimeRoot))
    if (!['control.json', 'store', path.basename(stage)].includes(name))
      fail('RUNTIME_MIGRATION_CONFLICT', 'Unbound local initialization artifact: ' + name);
  if (control) {
    const expected = {
      schema: 'aitm.runtime-control/v2',
      status: 'prepared',
      projectRoot: journal.plan.projectRoot,
      mainRoot: journal.plan.mainRoot,
      activation: journal.plan.activation,
      initialization: {
        id: journal.plan.id,
        operationId: journal.plan.operationId,
        digest: journal.plan.digest,
      },
    };
    if (emptyRuntimeDigest(control) !== emptyRuntimeDigest(expected))
      fail(
        'RUNTIME_MIGRATION_CONFLICT',
        'Local initialization control conflicts with original plan'
      );
  }
  if (exists(stage) && exists(layout.localRoot))
    fail('RUNTIME_MIGRATION_CONFLICT', 'Both staged and published initialization stores exist');
  for (const base of [stage, layout.localRoot]) {
    const rows = protectedTree(base);
    if (!rows) continue;
    for (const row of rows) {
      if (row.kind === 'directory') {
        if (!['', 'state'].includes(row.path))
          fail('RUNTIME_MIGRATION_CONFLICT', 'Unplanned initialization directory');
      } else if (
        !Object.hasOwn(journal.plan.records, row.path) ||
        readFileSync(path.join(base, row.path), 'utf8') !== journal.plan.records[row.path]
      )
        fail('RUNTIME_MIGRATION_CONFLICT', 'Conflicting initialization bytes: ' + row.path);
    }
    if (base === layout.localRoot) verifyTree(base, journal.plan.records);
  }
}
export function inspectRuntimeInitialization({ projectRoot, mainRoot, operationId }) {
  const layout = runtimeStoragePaths({ projectRoot, mainRoot });
  if (layout.projectRoot === layout.mainRoot)
    fail('RUNTIME_CONTROL_INVALID', 'Linked status requires the invoking linked root');
  const file = journalPath(layout),
    journal = readMigrationRecord(file);
  if (
    !validRuntimeInitializationJournal(journal) ||
    journal.plan.projectRoot !== layout.projectRoot ||
    journal.plan.mainRoot !== layout.mainRoot
  )
    fail('RUNTIME_CONTROL_INVALID', 'Protected linked initialization journal invalid: ' + file);
  if (
    journal.schema === 'aitm.runtime-initialization/v2' &&
    operationId !== undefined &&
    operationId !== journal.plan.operationId
  )
    fail('RUNTIME_MIGRATION_CONFLICT', 'Requested operation disagrees with invoking root history');
  assertCurrent(journal.plan);
  if (journal.schema === 'aitm.runtime-initialization/v2') verifyLinkedPublication(journal, layout);
  const recovery = path.join(
    layout.sharedRuntimeRoot,
    'initialization-recoveries',
    journal.plan.id
  );
  const claims =
    journal.schema === 'aitm.runtime-initialization/v2'
      ? inspectLinkedInitializationRecoveries(layout, journal, {
          assertPath: assertRuntimeStoragePath,
          fail,
        })
      : null;
  const observation = {
    projectRoot: layout.projectRoot,
    mainRoot: layout.mainRoot,
    identity: resolveRuntimeRoot({ cwd: layout.projectRoot, env: {} }).worktreeIdentity,
    mainControl: protectedTree(layout.sharedControlPath, false),
    journal: protectedTree(file, false),
    local: protectedTree(layout.localRuntimeRoot),
    recovery: protectedTree(recovery),
  };
  return {
    schema: 'aitm.runtime-initialization-observation/v1',
    projectRoot: layout.projectRoot,
    mainRoot: layout.mainRoot,
    initializationId: journal.plan.id,
    operationId: journal.plan.operationId ?? null,
    journal,
    recoveryActive: claims?.active ?? false,
    digest: emptyRuntimeDigest(observation),
  };
}
async function resumeLinkedEmpty(input) {
  const observed = inspectRuntimeInitialization(input);
  const { journal } = observed;
  if (
    !validEmptyOperationId(input.operationId) ||
    input.operationId !== journal.plan.operationId ||
    input.observedDigest !== observed.digest ||
    input.approvedPlanDigest !== journal.plan.digest
  )
    fail(
      'RUNTIME_MIGRATION_CONFLICT',
      'Exact linked operation, observed and approved digests required'
    );
  const layout = assertCurrent(journal.plan);
  const complete = () =>
    journal.status === 'complete' &&
    exists(layout.controlPath) &&
    readMigrationRecord(layout.controlPath).status === 'active';
  if (complete() && !observed.recoveryActive) {
    assertRuntimeReadable(journal.plan);
    return { status: 'complete', initializationId: journal.plan.id };
  }
  assertRecoveryOwner(journal.owner, {
    ...input.adapters,
    observeOwner: input.adapters.observeOwner || observeLocalRuntimeOwner,
  });
  return withRuntimeBootstrapCoordinator(
    {
      projectRoot: layout.projectRoot,
      mainRoot: layout.mainRoot,
      transactionId: input.operationId,
      approvedPlanDigest: input.approvedPlanDigest,
      adapters: input.adapters,
    },
    async () => {
      if (inspectRuntimeInitialization(input).digest !== observed.digest)
        fail('RUNTIME_MIGRATION_CONFLICT', 'Linked initialization changed under exclusion');
      const result = await withRuntimeInitializationRecovery(
        { layout, journal, adapters: input.adapters },
        (owned) =>
          complete()
            ? { status: 'complete', initializationId: journal.plan.id }
            : publish(owned, layout, input.adapters)
      );
      assertRuntimeReadable(journal.plan);
      return result;
    }
  );
}
