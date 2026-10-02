// @story #1857
import {
  mkdirSync,
  lstatSync,
  readdirSync,
  readFileSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
} from 'node:fs';
import path from 'node:path';
import { planRuntimeMigration, runtimeMigrationDigest } from './runtime-migration-plan.mjs';
import {
  runtimeStoragePaths,
  assertRuntimeStoragePath,
  assertRuntimeStoreRecords,
  RuntimeRootError,
} from './runtime-storage.mjs';
import {
  fenceRuntimeWriters,
  completeRuntimeFence,
  writeMigrationRecord,
  readMigrationRecord,
  observeMigrationIdentity,
  recoverRuntimeFence,
  assertRecoveryOwner,
  isRuntimeMigrationOwner,
} from './runtime-migration-lock.mjs';

const fail = (code, message) => {
  throw new RuntimeRootError(code, message);
};
const transactionFor = (digest) => 'migration-' + digest.slice(7, 39);
const validTransaction = (value) => new RegExp('^[a-zA-Z0-9][a-zA-Z0-9-]{0,95}$').test(value || '');

function transactionPaths(roots, transactionId) {
  if (!validTransaction(transactionId))
    fail('RUNTIME_CONTROL_INVALID', 'Invalid transaction identity');
  const layout = runtimeStoragePaths(roots);
  const directory = path.join(layout.migrationRoot, transactionId);
  assertRuntimeStoragePath(directory, layout.sharedRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
  return {
    layout,
    directory,
    manifest: path.join(directory, 'manifest.json'),
    plan: path.join(directory, 'approved-plan.json'),
  };
}

function verifyApprovedPlan(plan, digest) {
  const { digest: recorded, ...contents } = plan || {};
  if (
    plan?.schema !== 'aitm.runtime-migration-plan/v1' ||
    digest !== recorded ||
    runtimeMigrationDigest(contents) !== recorded
  ) {
    fail(
      'RUNTIME_MIGRATION_APPROVAL_REQUIRED',
      'Exact approved plan bytes and digest are required'
    );
  }
  if (
    !Array.isArray(plan.blockers) ||
    plan.blockers.length ||
    !Array.isArray(plan.files) ||
    plan.files.some((file) => file.trust !== 'explicit-operator-trust')
  ) {
    fail(
      'RUNTIME_MIGRATION_BLOCKED',
      'Unresolved plan blockers or legacy trust prevent publication'
    );
  }
}

function ensureAbsent(target) {
  try {
    lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  fail('RUNTIME_MIGRATION_CONFLICT', 'Destination already exists: ' + target);
}

function copyExact(source, destination, digest) {
  const bytes = readFileSync(source);
  if (runtimeMigrationDigest(bytes) !== digest)
    fail('RUNTIME_MIGRATION_PLAN_CHANGED', 'Source snapshot changed');
  mkdirSync(path.dirname(destination), { recursive: true });
  const fd = openSync(destination, 'wx', 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (runtimeMigrationDigest(readFileSync(destination)) !== digest)
    fail('RUNTIME_MIGRATION_CONFLICT', 'Staged bytes failed verification');
}

function verifyPublishedFiles(plan) {
  for (const file of plan.files) {
    const layout = runtimeStoragePaths({
      projectRoot: file.destinationRoot,
      mainRoot: plan.mainRoot,
    });
    assertRuntimeStoragePath(file.destination, layout.localRoot, 'RUNTIME_CONTROL_INVALID');
    if (
      !lstatSync(file.destination).isFile() ||
      runtimeMigrationDigest(readFileSync(file.destination)) !== file.digest
    ) {
      fail('RUNTIME_MIGRATION_CONFLICT', 'Published bytes disagree with the approved snapshot');
    }
  }
}

const objectRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const validInstant = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
function validateManifest(manifest, plan, transactionId) {
  const roots = manifest?.roots;
  const published = manifest?.publishedRoots;
  const timing = manifest?.timing;
  if (
    !objectRecord(manifest) ||
    manifest.schema !== 'aitm.runtime-migration/v1' ||
    !['prepared', 'publishing', 'complete'].includes(manifest.status) ||
    manifest.transactionId !== transactionId ||
    manifest.planDigest !== plan.digest ||
    !Array.isArray(roots) ||
    roots.length === 0 ||
    JSON.stringify(roots) !== JSON.stringify(plan.roots) ||
    new Set(roots).size !== roots.length ||
    !Array.isArray(published) ||
    new Set(published).size !== published.length ||
    published.some((root) => !roots.includes(root)) ||
    (manifest.status === 'complete' && published.length !== roots.length) ||
    !isRuntimeMigrationOwner(manifest.owner) ||
    timing?.schema !== 'aitm.runtime-migration-timing/v1' ||
    !Array.isArray(timing.intervals) ||
    timing.intervals.length === 0 ||
    timing.intervals.some(
      (interval) =>
        !objectRecord(interval) ||
        !isRuntimeMigrationOwner(interval.owner) ||
        !validInstant(interval.startedAt) ||
        interval.basis !== 'process-engagement' ||
        (interval.endedAt !== null && !validInstant(interval.endedAt)) ||
        (interval.durationMs !== null &&
          (!Number.isFinite(interval.durationMs) || interval.durationMs < 0)) ||
        (interval.endedAt === null && interval.durationMs !== null) ||
        (interval.endedAt !== null &&
          interval.durationMs !== Date.parse(interval.endedAt) - Date.parse(interval.startedAt))
    ) ||
    !['pending', 'confirmed'].includes(timing.publication?.status) ||
    timing.publication.idempotencyKey !== transactionId + ':engagement'
  )
    fail('RUNTIME_CONTROL_INVALID', 'Malformed transaction journal');
}

function readJournal(paths) {
  const bootstrapFile = path.join(paths.directory, 'bootstrap.json');
  for (const file of [bootstrapFile, paths.plan, paths.manifest])
    assertRuntimeStoragePath(file, paths.layout.sharedRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
  const bootstrap = readMigrationRecord(bootstrapFile);
  if (bootstrap?.schema !== 'aitm.runtime-bootstrap/v1')
    fail('RUNTIME_CONTROL_INVALID', 'Unsupported transaction bootstrap');
  if (!objectRecord(bootstrap.plan) || !objectRecord(bootstrap.manifest))
    fail('RUNTIME_CONTROL_INVALID', 'Malformed transaction bootstrap');
  verifyApprovedPlan(bootstrap.plan, bootstrap.manifest?.planDigest);
  validateManifest(bootstrap.manifest, bootstrap.plan, path.basename(paths.directory));
  if (
    bootstrap.plan.projectRoot !== paths.layout.projectRoot ||
    bootstrap.plan.mainRoot !== paths.layout.mainRoot ||
    bootstrap.manifest.transactionId !== path.basename(paths.directory)
  )
    fail('RUNTIME_CONTROL_INVALID', 'Bootstrap identity mismatch');
  const plan = exists(paths.plan) ? readMigrationRecord(paths.plan) : bootstrap.plan;
  verifyApprovedPlan(plan, bootstrap.plan.digest);
  const manifest = exists(paths.manifest)
    ? readMigrationRecord(paths.manifest)
    : { ...bootstrap.manifest, checkpoint: 'bootstrap-only' };
  validateManifest(manifest, plan, path.basename(paths.directory));
  if (
    manifest.schema !== 'aitm.runtime-migration/v1' ||
    manifest.transactionId !== path.basename(paths.directory) ||
    manifest.planDigest !== plan.digest ||
    JSON.stringify(manifest.roots) !== JSON.stringify(plan.roots)
  ) {
    fail('RUNTIME_CONTROL_INVALID', 'Transaction journal identity is invalid');
  }
  return { plan, manifest };
}

export async function readRuntimeMigrationStatus({ projectRoot, mainRoot, transactionId }) {
  return readJournal(transactionPaths({ projectRoot, mainRoot }, transactionId)).manifest;
}

export async function applyRuntimeMigration({ plan, approvedPlanDigest, adapters = {} }) {
  const startedAt = new Date().toISOString();
  verifyApprovedPlan(plan, approvedPlanDigest);
  const roots = { projectRoot: plan.projectRoot, mainRoot: plan.mainRoot };
  const transactionId = transactionFor(approvedPlanDigest);
  const paths = transactionPaths(roots, transactionId);
  const fresh = await planRuntimeMigration({ ...roots, adapters });
  if (fresh.digest !== plan.digest)
    fail('RUNTIME_MIGRATION_PLAN_CHANGED', 'Fresh inventory differs from approved plan');
  const owner = observeMigrationIdentity(adapters);
  const manifest = {
    schema: 'aitm.runtime-migration/v1',
    transactionId,
    planDigest: approvedPlanDigest,
    roots: plan.roots,
    status: 'prepared',
    owner,
    publishedRoots: [],
    timing: {
      schema: 'aitm.runtime-migration-timing/v1',
      intervals: [
        { owner, startedAt, endedAt: null, durationMs: null, basis: 'process-engagement' },
      ],
      publication: { status: 'pending', idempotencyKey: transactionId + ':engagement' },
    },
  };
  const prepareTransaction = () => {
    ensureAbsent(paths.directory);
    mkdirSync(paths.directory, { recursive: true });
    // One durable record binds exact plan, owner and timing before a fence can exist.
    writeMigrationRecord(path.join(paths.directory, 'bootstrap.json'), {
      schema: 'aitm.runtime-bootstrap/v1',
      plan,
      manifest,
    });
    adapters.faultSync?.('after-bootstrap', { transactionId });
    writeMigrationRecord(paths.plan, plan);
    writeMigrationRecord(paths.manifest, manifest);
  };
  const fenced = await fenceRuntimeWriters({
    ...roots,
    transactionId,
    approvedPlanDigest,
    adapters: { ...adapters, prepareTransaction },
  });
  await adapters.fault?.('after-fence', { transactionId });
  if (fenced.status !== 'quiesced')
    fail('RUNTIME_WRITERS_ACTIVE', 'In-flight writes must drain before snapshot publication');
  const drained = await planRuntimeMigration({ ...roots, adapters });
  if (drained.digest !== plan.digest)
    fail('RUNTIME_MIGRATION_PLAN_CHANGED', 'Fenced source inventory changed');
  return continuePublication({ plan, approvedPlanDigest, adapters, paths, manifest });
}

function exists(file) {
  try {
    lstatSync(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function verifyStore(base, root, plan) {
  const layout = runtimeStoragePaths({ projectRoot: root, mainRoot: plan.mainRoot });
  assertRuntimeStoragePath(base, layout.localRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
  const expected = new Map(
    plan.files
      .filter((file) => file.destinationRoot === root)
      .map((file) => [path.relative(layout.localRoot, file.destination), file.digest])
  );
  const found = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const file = path.join(directory, name);
      const relative = path.relative(base, file);
      const stat = lstatSync(file);
      if (
        stat.isDirectory() &&
        [...expected.keys()].some((key) => key.startsWith(relative + path.sep))
      )
        visit(file);
      else if (
        stat.isFile() &&
        expected.has(relative) &&
        runtimeMigrationDigest(readFileSync(file)) === expected.get(relative)
      )
        found.push(relative);
      else fail('RUNTIME_MIGRATION_CONFLICT', 'Unknown, aliased or changed staged/published bytes');
    }
  };
  visit(base);
  if (found.length !== expected.size)
    fail('RUNTIME_MIGRATION_CONFLICT', 'Incomplete staged/published snapshot');
}

async function publishTiming(manifest, paths, adapters) {
  if (manifest.timing.publication.status === 'confirmed') return;
  try {
    const result = await adapters.publishTiming?.({
      transactionId: manifest.transactionId,
      idempotencyKey: manifest.timing.publication.idempotencyKey,
      intervals: manifest.timing.intervals,
    });
    if (result?.status === 'confirmed') manifest.timing.publication.status = 'confirmed';
    else manifest.timing.publication.reason = 'publication-unconfirmed';
  } catch {
    manifest.timing.publication.reason = 'publication-outcome-unknown';
  }
  writeMigrationRecord(paths.manifest, manifest);
}

async function continuePublication({ plan, approvedPlanDigest, adapters, paths, manifest }) {
  const transactionId = manifest.transactionId;
  const save = () => writeMigrationRecord(paths.manifest, manifest);
  const stages = new Map();
  for (const file of plan.files) {
    assertRuntimeStoragePath(file.source, file.root, 'RUNTIME_CONTROL_INVALID');
    if (
      !lstatSync(file.source).isFile() ||
      runtimeMigrationDigest(readFileSync(file.source)) !== file.digest
    ) {
      fail('RUNTIME_MIGRATION_PLAN_CHANGED', 'Fenced legacy snapshot changed before activation');
    }
  }
  for (const root of plan.roots) {
    const layout = runtimeStoragePaths({ projectRoot: root, mainRoot: plan.mainRoot });
    const stage = path.join(layout.localRuntimeRoot, 'staging', transactionId, 'store');
    assertRuntimeStoragePath(stage, layout.localRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
    if (exists(layout.localRoot)) {
      if (exists(stage))
        fail('RUNTIME_MIGRATION_CONFLICT', 'Both staged and published stores exist');
      verifyStore(layout.localRoot, root, plan);
      continue;
    }
    mkdirSync(stage, { recursive: true });
    for (const file of plan.files.filter((entry) => entry.destinationRoot === root)) {
      const target = path.join(stage, path.relative(layout.localRoot, file.destination));
      assertRuntimeStoragePath(target, stage, 'RUNTIME_CONTROL_INVALID');
      if (!exists(target)) copyExact(file.source, target, file.digest);
    }
    verifyStore(stage, root, plan);
    stages.set(root, stage);
    if (exists(layout.controlPath)) {
      const control = readMigrationRecord(layout.controlPath);
      if (
        control.transactionId !== transactionId ||
        control.planDigest !== approvedPlanDigest ||
        control.projectRoot !== root ||
        control.mainRoot !== plan.mainRoot
      ) {
        fail('RUNTIME_MIGRATION_CONFLICT', 'A different control owns the root');
      }
    }
    writeMigrationRecord(layout.controlPath, {
      schema: 'aitm.runtime-control/v1',
      status: 'prepared',
      projectRoot: root,
      mainRoot: plan.mainRoot,
      transactionId,
      planDigest: approvedPlanDigest,
    });
    await adapters.fault?.('after-root-stage', { root, transactionId });
  }
  manifest.status = 'publishing';
  save();
  for (const root of plan.roots) {
    const layout = runtimeStoragePaths({ projectRoot: root, mainRoot: plan.mainRoot });
    if (stages.has(root)) {
      ensureAbsent(layout.localRoot);
      renameSync(stages.get(root), layout.localRoot);
      const directory = openSync(layout.localRuntimeRoot, 'r');
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
      await adapters.fault?.('after-root-publish', { root, transactionId });
    }
    if (!manifest.publishedRoots.includes(root)) manifest.publishedRoots.push(root);
    save();
  }
  verifyPublishedFiles(plan);
  for (const root of plan.roots)
    assertRuntimeStoreRecords(runtimeStoragePaths({ projectRoot: root, mainRoot: plan.mainRoot }));
  await adapters.fault?.('before-activation', { transactionId });
  for (const root of plan.roots) {
    const layout = runtimeStoragePaths({ projectRoot: root, mainRoot: plan.mainRoot });
    writeMigrationRecord(layout.controlPath, {
      schema: 'aitm.runtime-control/v1',
      status: 'active',
      projectRoot: root,
      mainRoot: plan.mainRoot,
      transactionId,
      planDigest: approvedPlanDigest,
    });
  }
  const interval = manifest.timing.intervals.at(-1);
  interval.endedAt = new Date().toISOString();
  interval.durationMs = Date.parse(interval.endedAt) - Date.parse(interval.startedAt);
  // Publisher/cleanup tail is separate unresolved telemetry until the registered handler closes it.
  manifest.timing.completionTail = { status: 'unresolved', startedAt: interval.endedAt };
  manifest.status = 'complete';
  save();
  await adapters.fault?.('after-manifest-complete', { transactionId });
  await publishTiming(manifest, paths, adapters);
  await adapters.fault?.('after-timing-publish', { transactionId });
  await adapters.fault?.('before-fence-release', { transactionId });
  completeRuntimeFence({
    projectRoot: plan.projectRoot,
    mainRoot: plan.mainRoot,
    transactionId,
    approvedPlanDigest,
    adapters,
  });
  return { status: 'complete', transactionId, timing: manifest.timing };
}

export async function resumeRuntimeMigration({
  projectRoot,
  mainRoot,
  transactionId,
  approvedPlanDigest,
  adapters = {},
}) {
  const startedAt = new Date().toISOString();
  const paths = transactionPaths({ projectRoot, mainRoot }, transactionId);
  const { manifest, plan } = readJournal(paths);
  verifyApprovedPlan(plan, approvedPlanDigest);
  if (manifest.status === 'complete') {
    if (
      JSON.stringify([...manifest.roots].sort()) !==
      JSON.stringify([...paths.layout.registeredRoots].sort())
    )
      fail('RUNTIME_CONTROL_INVALID', 'Completed transaction root census changed');
    for (const root of manifest.roots) {
      const layout = runtimeStoragePaths({ projectRoot: root, mainRoot });
      assertRuntimeStoragePath(
        layout.controlPath,
        layout.localRuntimeRoot,
        'RUNTIME_CONTROL_INVALID'
      );
      const control = readMigrationRecord(layout.controlPath);
      if (
        control?.schema !== 'aitm.runtime-control/v1' ||
        control.status !== 'active' ||
        control.transactionId !== transactionId ||
        control.planDigest !== approvedPlanDigest ||
        control.projectRoot !== root ||
        control.mainRoot !== mainRoot
      )
        fail('RUNTIME_CONTROL_INVALID', 'Completed transaction control identity changed');
    }
    let retainedFence = null;
    try {
      retainedFence = recoverRuntimeFence({
        projectRoot,
        mainRoot,
        transactionId,
        approvedPlanDigest,
        adapters,
      });
    } catch (error) {
      if (error.code !== 'RUNTIME_MIGRATION_FENCE_MISSING') throw error;
    }
    if (retainedFence) {
      manifest.owner = retainedFence.owner;
      writeMigrationRecord(paths.manifest, manifest);
    }
    await publishTiming(manifest, paths, adapters);
    await adapters.fault?.('after-timing-publish', { transactionId });
    await adapters.fault?.('before-fence-release', { transactionId });
    if (retainedFence)
      completeRuntimeFence({ projectRoot, mainRoot, transactionId, approvedPlanDigest, adapters });
    return { status: 'complete', transactionId, timing: manifest.timing };
  }
  const fresh = await planRuntimeMigration({
    projectRoot,
    mainRoot,
    adapters: {
      ...adapters,
      trustLegacy: ({ source, digest }) =>
        plan.files.some((file) => file.source === source && file.digest === digest)
          ? 'explicit-operator-trust'
          : 'unresolved',
    },
  });
  const hardBlockers = fresh.blockers.filter((item) => item.code !== 'destination-exists');
  if (
    hardBlockers.length ||
    JSON.stringify(fresh.files) !== JSON.stringify(plan.files) ||
    JSON.stringify(fresh.roots) !== JSON.stringify(plan.roots) ||
    JSON.stringify(fresh.rootIdentities) !== JSON.stringify(plan.rootIdentities)
  ) {
    fail('RUNTIME_MIGRATION_PLAN_CHANGED', 'Recovery source or root inventory changed');
  }
  let fence;
  try {
    fence = recoverRuntimeFence({
      projectRoot,
      mainRoot,
      transactionId,
      approvedPlanDigest,
      adapters,
    });
  } catch (error) {
    if (error.code !== 'RUNTIME_MIGRATION_FENCE_MISSING') throw error;
    const owner = assertRecoveryOwner(manifest.owner, adapters);
    const acquired = await fenceRuntimeWriters({
      projectRoot,
      mainRoot,
      transactionId,
      approvedPlanDigest,
      adapters,
    });
    fence = { ...acquired.fence, owner };
  }
  writeMigrationRecord(paths.plan, plan);
  delete manifest.checkpoint;
  const quiescence = await fenceRuntimeWriters({
    projectRoot,
    mainRoot,
    transactionId,
    approvedPlanDigest,
    adapters,
  });
  if (quiescence.status !== 'quiesced')
    fail('RUNTIME_WRITERS_ACTIVE', 'Recovery must drain in-flight writers');
  const previous = manifest.timing.intervals.at(-1);
  if (
    previous.owner.processToken !== fence.owner.processToken ||
    previous.owner.pid !== fence.owner.pid
  ) {
    previous.completeness = 'interrupted-end-unknown';
    manifest.timing.intervals.push({
      owner: fence.owner,
      startedAt,
      endedAt: null,
      durationMs: null,
      basis: 'process-engagement',
    });
  }
  manifest.owner = fence.owner;
  writeMigrationRecord(paths.manifest, manifest);
  return continuePublication({ plan, approvedPlanDigest, adapters, paths, manifest });
}
