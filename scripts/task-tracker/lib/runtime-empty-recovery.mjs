// @story #1861
// Filesystem-only protected observations; no ordinary reads or owner sampling.
import { lstatSync, readdirSync, readFileSync, openSync, fsyncSync, closeSync } from 'node:fs';
import path from 'node:path';
import {
  runtimeStoragePaths,
  assertRuntimeStoragePath,
  RuntimeRootError,
} from './runtime-storage.mjs';
import {
  emptyRuntimeDigest,
  validEmptyOperationId,
  validEmptyRuntimeJournal,
  validEmptyCoordinatorProof,
  emptyRuntimeControl,
} from './runtime-empty-record.mjs';
export const emptyFailure = (code, message) => {
  throw new RuntimeRootError(code, message);
};
export function emptyStat(file) {
  try {
    return lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
export const emptyPhysicalIdentity = (stat) => ({ dev: stat.dev, ino: stat.ino, mode: stat.mode });
export function emptySyncDirectory(directory) {
  const fd = openSync(directory, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function emptyPaths({ projectRoot, mainRoot, operationId }) {
  if (!validEmptyOperationId(operationId))
    emptyFailure('RUNTIME_CONTROL_INVALID', 'Exact empty operation UUID required');
  const layout = runtimeStoragePaths({ projectRoot, mainRoot });
  if (layout.projectRoot !== layout.mainRoot)
    emptyFailure('RUNTIME_CONTROL_INVALID', 'Empty operation belongs to the physical main root');
  const paths = {
    ...layout,
    emptyRoot: path.join(layout.sharedRuntimeRoot, 'empty-initializations'),
    operationRoot: path.join(layout.sharedRuntimeRoot, 'empty-initializations', operationId),
    stageRoot: path.join(layout.localRuntimeRoot, 'empty-stage-' + operationId),
  };
  paths.journalPath = path.join(paths.operationRoot, 'journal.json');
  for (const target of [paths.emptyRoot, paths.operationRoot, paths.stageRoot, paths.journalPath])
    assertRuntimeStoragePath(target, layout.sharedRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
  return paths;
}
export function emptyAncestorPaths(paths) {
  return {
    runtime: paths.sharedRuntimeRoot,
    migrations: paths.migrationRoot,
    'empty-initializations': paths.emptyRoot,
    operation: paths.operationRoot,
  };
}
export function emptyReadJson(file) {
  const stat = emptyStat(file);
  if (!stat || !stat.isFile() || stat.isSymbolicLink())
    emptyFailure('RUNTIME_CONTROL_INVALID', 'Protected empty record missing or aliased: ' + file);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file)));
  } catch {
    emptyFailure('RUNTIME_CONTROL_INVALID', 'Unreadable protected empty record: ' + file);
  }
}
export function emptyObserveTree(base) {
  if (!emptyStat(base)) return null;
  const entries = {};
  const walk = (file, relative) => {
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
      emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Unsafe empty publication entry: ' + file);
    entries[relative] = {
      kind: stat.isDirectory() ? 'directory' : 'file',
      identity: emptyPhysicalIdentity(stat),
      digest: stat.isFile() ? emptyRuntimeDigest(readFileSync(file)) : null,
    };
    if (stat.isDirectory())
      for (const name of readdirSync(file).sort())
        walk(path.join(file, name), relative ? relative + '/' + name : name);
  };
  walk(base, '');
  return entries;
}
export function assertEmptyAncestors(paths, journal) {
  for (const [key, file] of Object.entries(emptyAncestorPaths(paths))) {
    assertRuntimeStoragePath(file, paths.mainRoot, 'RUNTIME_MIGRATION_CONFLICT');
    const stat = emptyStat(file);
    if (
      !stat?.isDirectory() ||
      emptyRuntimeDigest(emptyPhysicalIdentity(stat)) !== emptyRuntimeDigest(journal.ancestors[key])
    )
      emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Empty ancestor identity changed: ' + file);
  }
}
function assertNames(directory, names) {
  if (readdirSync(directory).some((name) => !names.includes(name)))
    emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Unbound empty publication sibling: ' + directory);
}
export function assertEmptyConflictSet(paths, journal, { coordinator } = {}) {
  assertEmptyAncestors(paths, journal);
  assertNames(paths.sharedRuntimeRoot, [
    'migrations',
    'empty-initializations',
    path.basename(paths.stageRoot),
    'store',
    'control.json',
  ]);
  assertNames(paths.emptyRoot, [journal.plan.operationId]);
  assertNames(paths.operationRoot, ['journal.json']);
  assertNames(paths.migrationRoot, ['coordinator.lock', 'coordinator-recoveries']);
  const lock = path.join(paths.migrationRoot, 'coordinator.lock');
  if (emptyStat(lock)) {
    const current = emptyReadJson(lock);
    if (
      current.schema !== 'aitm.runtime-coordinator/v1' ||
      current.transactionId !== journal.plan.operationId ||
      current.planDigest !== journal.plan.digest ||
      !coordinator ||
      emptyRuntimeDigest(current) !== emptyRuntimeDigest(coordinator.record)
    )
      emptyFailure(
        'RUNTIME_MIGRATION_CONFLICT',
        'Empty coordinator is not the exact authenticated owner'
      );
  }
  const recoveries = path.join(paths.migrationRoot, 'coordinator-recoveries');
  if (emptyStat(recoveries)) {
    const stat = lstatSync(recoveries);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Unsafe coordinator recovery history');
    const groups = new Map();
    for (const name of readdirSync(recoveries).sort()) {
      const file = path.join(recoveries, name);
      const receipt = emptyReadJson(file);
      if (
        receipt.schema !== 'aitm.runtime-coordinator-recovery/v1' ||
        !['prepared', 'complete'].includes(receipt.phase) ||
        !validEmptyCoordinatorProof(receipt.previous) ||
        receipt.previous.record.transactionId !== journal.plan.operationId ||
        receipt.previous.record.planDigest !== journal.plan.digest
      )
        emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Unbound coordinator recovery history');
      const prefix = receipt.previous.digest.slice(7) + '-';
      const generation = Number(name.slice(prefix.length, -5));
      if (
        !name.startsWith(prefix) ||
        !Number.isSafeInteger(generation) ||
        generation < 0 ||
        name !== prefix + String(generation).padStart(6, '0') + '.json'
      )
        emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Malformed coordinator recovery sequence');
      const earlier = groups.get(receipt.previous.digest) || [];
      if (
        generation !== earlier.length ||
        receipt.previousReceipt !== (earlier.at(-1)?.file || null) ||
        (earlier.length && earlier.at(-1).receipt.phase !== 'prepared')
      )
        emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Coordinator recovery predecessor changed');
      earlier.push({ file, receipt });
      groups.set(receipt.previous.digest, earlier);
    }
    for (const group of groups.values())
      if (group.at(-1).receipt.phase !== 'complete')
        emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Coordinator recovery is unfinished');
  }
  const stage = emptyObserveTree(paths.stageRoot),
    store = emptyObserveTree(paths.localRoot);
  if (stage && store)
    emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Both staged and published empty stores exist');
  const tree = stage || store;
  if (tree && emptyRuntimeDigest(tree) !== emptyRuntimeDigest(journal.stage))
    emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Staged or published physical bytes changed');
  if (!tree && Object.keys(journal.stage).length)
    emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Recorded stage disappeared');
  const control = emptyStat(paths.controlPath) ? emptyReadJson(paths.controlPath) : null;
  if (
    control &&
    ![
      emptyRuntimeControl(journal.plan, 'prepared'),
      ...(journal.status === 'complete' ? [emptyRuntimeControl(journal.plan, 'active')] : []),
    ].some((value) => emptyRuntimeDigest(value) === emptyRuntimeDigest(control))
  )
    emptyFailure('RUNTIME_MIGRATION_CONFLICT', 'Empty control has conflicting bytes');
  if (
    store &&
    (!control ||
      Object.keys(journal.stage).filter((key) => journal.stage[key].kind === 'file').length !== 4)
  )
    emptyFailure(
      'RUNTIME_MIGRATION_CONFLICT',
      'Published empty store has no protected full outcome'
    );
  return { stage, store, control };
}
export function inspectEmptyRuntimeInitialization(input) {
  const paths = emptyPaths(input);
  const journal = emptyReadJson(paths.journalPath);
  if (
    !validEmptyRuntimeJournal(journal) ||
    journal.plan.operationId !== input.operationId ||
    journal.plan.projectRoot !== paths.projectRoot ||
    journal.plan.mainRoot !== paths.mainRoot
  )
    emptyFailure(
      'RUNTIME_CONTROL_INVALID',
      'Empty journal identity mismatch: ' + paths.journalPath
    );
  // Observation includes every byte in the operation and runtime namespaces. It
  // preserves malformed/conflicting trees for the exact pre-replay comparison.
  const protectedTree = emptyObserveTree(paths.sharedRuntimeRoot);
  const value = {
    status: journal.status,
    operationId: journal.plan.operationId,
    journalPath: paths.journalPath,
    journal,
    protectedTree,
  };
  return { ...value, digest: emptyRuntimeDigest(value) };
}
