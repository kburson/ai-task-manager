// @story #1861
// Read-only physical inventory shared by explicit runtime bootstrap policies.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  resolveRuntimeRoot,
  runtimeStoragePaths,
  assertRuntimeStoragePath,
} from './runtime-storage.mjs';
import { classifyKnownLegacyRuntimeRecord } from './runtime-migration-catalog.mjs';
import { observeRuntimeWriterCensus } from './runtime-writer-census.mjs';
import { observeMigrationIdentity } from './runtime-migration-lock.mjs';
import { emptyRuntimeDigest } from './runtime-empty-record.mjs';

export const LEGACY_RUNTIME_ROOT_NAMES = Object.freeze([
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
]);
const stat = (file) => {
  try {
    return lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
const entry = (target, value) => ({
  target,
  present: Boolean(value),
  ...(value
    ? {
        kind: value.isSymbolicLink()
          ? 'alias'
          : value.isDirectory()
            ? 'directory'
            : value.isFile()
              ? 'file'
              : 'other',
        dev: value.dev,
        ino: value.ino,
        mode: value.mode,
        ...(value.isFile() ? { digest: emptyRuntimeDigest(readFileSync(target)) } : {}),
      }
    : {}),
});

// Events retain legacy traversal order so migration-v1 policy/digests remain stable.
export function observeRuntimeAuthorityInventory({ projectRoot, mainRoot }) {
  const identity = resolveRuntimeRoot({ cwd: projectRoot, env: {} });
  const layout = runtimeStoragePaths({ projectRoot, mainRoot });
  const roots = [...identity.worktreeIdentity.registeredRoots].sort();
  const rootIdentities = [];
  const rootLayouts = new Map();
  const authority = [];
  const events = [];
  const block = (code, target, detail) =>
    events.push({ kind: 'blocker', value: { code, target, ...(detail ? { detail } : {}) } });
  for (const unavailable of identity.worktreeIdentity.unavailableRoots)
    block('root-unavailable', unavailable);
  const inventory = (directory, root, sourceKind, allowedNames) => {
    const top = stat(directory);
    if (!top) return;
    if (top.isSymbolicLink()) {
      block('source-alias', directory);
      return;
    }
    if (!top.isDirectory()) {
      block('source-shape', directory);
      return;
    }
    const walk = (cursor) => {
      for (const name of readdirSync(cursor).sort()) {
        if (cursor === directory && allowedNames && !allowedNames.includes(name)) continue;
        const file = path.join(cursor, name);
        const selected = lstatSync(file);
        if (selected.isSymbolicLink()) block('source-alias', file);
        else if (selected.isDirectory() && name.endsWith('.lock'))
          block('source-lock-recovery-required', file);
        else if (selected.isDirectory()) walk(file);
        else if (selected.isFile())
          events.push({
            kind: 'source',
            root,
            sourceKind,
            source: file,
            relative: path.relative(directory, file),
          });
        else block('source-shape', file);
      }
    };
    walk(directory);
  };
  for (const root of roots) {
    let selected;
    try {
      selected = resolveRuntimeRoot({ cwd: root, env: {} });
    } catch (error) {
      block('root-unadmittable', root, error.code || 'ROOT_IDENTITY_MISMATCH');
      continue;
    }
    if (selected.mainRoot !== layout.mainRoot) {
      block('root-identity-mismatch', root);
      continue;
    }
    rootIdentities.push({
      projectRoot: selected.projectRoot,
      gitDir: selected.worktreeIdentity.gitDir,
      commonDir: selected.worktreeIdentity.commonDir,
    });
    const rootLayout = runtimeStoragePaths({ projectRoot: root, mainRoot });
    rootLayouts.set(root, rootLayout);
    for (const destination of [rootLayout.controlPath, rootLayout.localRoot]) {
      try {
        assertRuntimeStoragePath(
          destination,
          rootLayout.localRuntimeRoot,
          'RUNTIME_CONTROL_INVALID'
        );
        if (stat(destination)) block('destination-exists', destination);
      } catch (error) {
        block('destination-unsafe', destination, error.code);
      }
    }
    const prefix = path.join(root, '.ai-task-manager', 'runtime');
    try {
      assertRuntimeStoragePath(prefix, root, 'RUNTIME_CONTROL_INVALID');
      authority.push(entry(prefix, stat(prefix)));
    } catch (error) {
      authority.push({ target: prefix, present: true, kind: 'unsafe', code: error.code });
    }
    for (const legacy of [
      { base: path.join(root, '.tmp', 'aitm'), kind: 'volatile-runtime' },
      { base: path.join(root, '.db', 'aitm'), kind: 'legacy-durable' },
      ...['.ai-task-manager', '.claude'].map((directory) => ({
        base: path.join(root, directory),
        kind: 'legacy-root',
        allowedNames: LEGACY_RUNTIME_ROOT_NAMES,
      })),
    ]) {
      try {
        assertRuntimeStoragePath(legacy.base, root, 'RUNTIME_CONTROL_INVALID');
      } catch (error) {
        block('source-alias', legacy.base, error.code);
        authority.push({ target: legacy.base, present: true, kind: 'unsafe', code: error.code });
        continue;
      }
      if (legacy.allowedNames) {
        for (const name of legacy.allowedNames) {
          const target = path.join(legacy.base, name);
          authority.push(entry(target, stat(target)));
        }
      } else authority.push(entry(legacy.base, stat(legacy.base)));
      inventory(legacy.base, root, legacy.kind, legacy.allowedNames);
    }
  }
  return {
    identity,
    layout,
    roots,
    rootIdentities,
    rootLayouts,
    unavailableRoots: [...identity.worktreeIdentity.unavailableRoots],
    authority,
    events,
  };
}
export function observeRuntimeAuthorityRootDrift(observation) {
  const { identity, layout } = observation;
  try {
    const finalIdentity = resolveRuntimeRoot({ cwd: layout.projectRoot, env: {} });
    if (
      emptyRuntimeDigest(finalIdentity.worktreeIdentity) !==
        emptyRuntimeDigest(identity.worktreeIdentity) ||
      finalIdentity.projectRoot !== identity.projectRoot ||
      finalIdentity.mainRoot !== identity.mainRoot
    )
      return [{ code: 'root-census-changed', target: layout.projectRoot }];
  } catch (error) {
    return [
      {
        code: 'root-census-unavailable',
        target: layout.projectRoot,
        detail: error.code || 'ROOT_IDENTITY_MISMATCH',
      },
    ];
  }
  return [];
}
export async function observeRuntimeAuthorityCensus({ projectRoot, mainRoot, adapters = {} }) {
  const observed = observeRuntimeAuthorityInventory({ projectRoot, mainRoot });
  const owner = observeMigrationIdentity(adapters);
  const files = [];
  for (const item of observed.events.filter((event) => event.kind === 'source')) {
    const classified = classifyKnownLegacyRuntimeRecord({
      root: item.root,
      mainRoot,
      source: item.source,
      relative: item.relative,
      kind: item.sourceKind,
    });
    if (classified)
      files.push({
        root: item.root,
        source: item.source,
        family: classified.family,
        digest: emptyRuntimeDigest(readFileSync(item.source)),
      });
  }
  const input = {
    roots: observed.roots,
    files,
    projectRoot: observed.layout.projectRoot,
    mainRoot: observed.layout.mainRoot,
    owner,
  };
  const writerObservation = await (adapters.writerCensus
    ? adapters.writerCensus(input)
    : observeRuntimeWriterCensus(input));
  const blockers = observed.events
    .filter((event) => event.kind === 'blocker')
    .map((event) => event.value);
  blockers.push(...observeRuntimeAuthorityRootDrift(observed));
  for (const item of observed.authority)
    if (item.present) blockers.push({ code: 'authority-present', target: item.target });
  const sameInvoker = (writer) =>
    writer &&
    ['provider', 'sid', 'pid', 'processToken', 'host'].every(
      (key) => owner[key] && writer[key] === owner[key]
    );
  const complete =
    writerObservation &&
    writerObservation.complete === true &&
    Array.isArray(writerObservation.writers) &&
    Array.isArray(writerObservation.claims) &&
    Array.isArray(writerObservation.unknown) &&
    writerObservation.unknown.length === 0;
  if (!complete) blockers.push({ code: 'writer-census-unknown', target: mainRoot });
  else if (
    writerObservation.writers.some((writer) => !sameInvoker(writer)) ||
    writerObservation.claims.some((claim) => !sameInvoker(claim))
  )
    blockers.push({ code: 'writers-active', target: mainRoot });
  // The exact authenticated current process is diagnostic, never a future owner grant.
  const canonicalWriters = complete
    ? {
        ...writerObservation,
        writers: writerObservation.writers.filter((writer) => !sameInvoker(writer)),
        claims: writerObservation.claims.filter((claim) => !sameInvoker(claim)),
      }
    : { complete: false };
  return {
    ...observed,
    mainIdentity: observed.rootIdentities.find(
      (root) => root.projectRoot === observed.layout.mainRoot
    ),
    blockers,
    writerObservation: canonicalWriters,
    diagnosticInvoker: owner,
  };
}
