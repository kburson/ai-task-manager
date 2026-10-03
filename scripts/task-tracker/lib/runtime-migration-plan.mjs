// @story #1857
// Read-only planning precedes fenced application. No automatic legacy import.
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { classifyKnownLegacyRuntimeRecord } from './runtime-migration-catalog.mjs';
import {
  resolveRuntimeRoot,
  runtimeStoragePaths,
  assertRuntimeStoragePath,
} from './runtime-storage.mjs';

export function runtimeMigrationDigest(value) {
  const stable = (item) => {
    if (Array.isArray(item)) return item.map(stable);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, stable(item[key])])
      );
    return item;
  };
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(stable(value)));
  return 'sha256:' + createHash('sha256').update(bytes).digest('hex');
}

const FAMILY_SCOPES = Object.freeze({
  state: 'local',
  queue: 'local',
  sessions: 'local',
  gates: 'local',
  'issue-locks': 'local',
  'verifier-cache': 'local',
  'provider-mirror': 'local',
  'draft-branch-journal': 'local',
  'test-sandbox': 'local',
  fleet: 'shared',
  occupancy: 'shared',
  'closed-bindings': 'shared',
  'orchestrator-lock': 'shared',
  'hook-idempotency': 'shared',
  'action-capture': 'shared',
  'ready-for-plan-journal': 'shared',
});

function maybeStat(file) {
  try {
    return lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function inventory(directory, blocker, visit, allowedNames = null) {
  const stat = maybeStat(directory);
  if (!stat) return;
  if (stat.isSymbolicLink()) {
    blocker('source-alias', directory);
    return;
  }
  if (!stat.isDirectory()) {
    blocker('source-shape', directory);
    return;
  }
  const walk = (cursor) => {
    for (const name of readdirSync(cursor).sort()) {
      if (cursor === directory && allowedNames && !allowedNames.includes(name)) continue;
      const file = path.join(cursor, name);
      const entry = lstatSync(file);
      if (entry.isSymbolicLink()) blocker('source-alias', file);
      else if (entry.isDirectory() && name.endsWith('.lock'))
        blocker('source-lock-recovery-required', file);
      else if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) visit(file, path.relative(directory, file));
      else blocker('source-shape', file);
    }
  };
  walk(directory);
}

export async function planRuntimeMigration({ projectRoot, mainRoot, adapters = {} }) {
  const identity = resolveRuntimeRoot({ cwd: projectRoot, env: {} });
  const layout = runtimeStoragePaths({ projectRoot, mainRoot });
  const blockers = [];
  const files = [];
  const destinations = new Set();
  const block = (code, target, detail) =>
    blockers.push({ code, target, ...(detail ? { detail } : {}) });
  const roots = [...identity.worktreeIdentity.registeredRoots].sort();
  for (const unavailable of identity.worktreeIdentity.unavailableRoots)
    block('root-unavailable', unavailable);
  const rootIdentities = [];
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
    for (const destination of [rootLayout.controlPath, rootLayout.localRoot]) {
      try {
        assertRuntimeStoragePath(
          destination,
          rootLayout.localRuntimeRoot,
          'RUNTIME_CONTROL_INVALID'
        );
        if (maybeStat(destination)) block('destination-exists', destination);
      } catch (error) {
        block('destination-unsafe', destination, error.code);
      }
    }
    for (const legacy of [
      { base: path.join(root, '.tmp', 'aitm'), kind: 'volatile-runtime' },
      { base: path.join(root, '.db', 'aitm'), kind: 'legacy-durable' },
      ...['.ai-task-manager', '.claude'].map((directory) => ({
        base: path.join(root, directory),
        kind: 'legacy-root',
        allowedNames: [
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
        ],
      })),
    ]) {
      try {
        assertRuntimeStoragePath(legacy.base, root, 'RUNTIME_CONTROL_INVALID');
      } catch (error) {
        block('source-alias', legacy.base, error.code);
        continue;
      }
      inventory(
        legacy.base,
        block,
        (source, relative) => {
          const classified = (adapters.classifyLegacy || classifyKnownLegacyRuntimeRecord)({
            root,
            mainRoot,
            source,
            relative,
            kind: legacy.kind,
          });
          if (
            !classified ||
            typeof classified.destination !== 'string' ||
            typeof classified.validate !== 'function'
          ) {
            block('unknown-source', source);
            return;
          }
          if (
            !Object.hasOwn(FAMILY_SCOPES, classified.family) ||
            FAMILY_SCOPES[classified.family] !== classified.scope
          ) {
            block('unsupported-classification', source);
            return;
          }
          const destinationRoot = classified.scope === 'shared' ? mainRoot : root;
          const store = classified.scope === 'shared' ? layout.sharedRoot : rootLayout.localRoot;
          const destination = path.resolve(store, classified.destination);
          try {
            assertRuntimeStoragePath(destination, store, 'RUNTIME_OVERRIDE_UNSAFE');
          } catch (error) {
            block('destination-unsafe', destination, error.code);
            return;
          }
          if (
            path.isAbsolute(classified.destination) ||
            classified.destination.split(path.sep).includes('..')
          ) {
            block('destination-unsafe', destination);
            return;
          }
          const bytes = readFileSync(source);
          const digest = runtimeMigrationDigest(bytes);
          let supported = false;
          try {
            // Record families own decoding; binary capture payloads must remain byte-exact.
            supported = classified.validate(bytes) === true;
          } catch {
            /* retain unsupported input */
          }
          if (!supported) {
            block('unsupported-schema', source);
            return;
          }
          const trust =
            adapters.trustLegacy?.({ source, digest, root, family: classified.family }) ??
            'unresolved';
          if (trust !== 'explicit-operator-trust') block('legacy-trust-required', source);
          if (destinations.has(destination)) block('ambiguous-source', destination);
          destinations.add(destination);
          files.push({
            source,
            destination,
            root,
            destinationRoot,
            family: classified.family,
            digest,
            size: bytes.length,
            trust,
          });
        },
        legacy.allowedNames
      );
    }
  }
  const census = await adapters.writerCensus?.({
    roots,
    files,
    projectRoot: layout.projectRoot,
    mainRoot: layout.mainRoot,
    owner: adapters.identity?.(),
  });
  try {
    const finalIdentity = resolveRuntimeRoot({ cwd: projectRoot, env: {} });
    if (
      runtimeMigrationDigest(finalIdentity.worktreeIdentity) !==
        runtimeMigrationDigest(identity.worktreeIdentity) ||
      finalIdentity.projectRoot !== identity.projectRoot ||
      finalIdentity.mainRoot !== identity.mainRoot
    )
      block('root-census-changed', projectRoot);
  } catch (error) {
    block('root-census-unavailable', projectRoot, error.code || 'ROOT_IDENTITY_MISMATCH');
  }
  if (
    !census ||
    census.complete !== true ||
    !Array.isArray(census.writers) ||
    !Array.isArray(census.claims)
  ) {
    block('writer-census-unknown', mainRoot);
  } else {
    const owner = adapters.identity?.();
    const same = (candidate) =>
      owner &&
      ['provider', 'sid', 'pid', 'processToken'].every(
        (key) => owner[key] && candidate[key] === owner[key]
      );
    if (
      census.writers.some((writer) => !same(writer)) ||
      census.claims.some(
        (claim) => !owner || claim.provider !== owner.provider || claim.sid !== owner.sid
      )
    ) {
      block('writers-active', mainRoot);
    }
  }
  for (const { projectRoot: root } of rootIdentities) {
    const required = ['state/task-tracker-state.json', 'state/task-tracker-queue.json'];
    if (root === layout.mainRoot) required.push('fleet/task-fleet.json', 'fleet/occupancy.json');
    const store = runtimeStoragePaths({ projectRoot: root, mainRoot: layout.mainRoot }).localRoot;
    for (const relative of required) {
      const target = path.join(store, relative);
      if (!destinations.has(target)) block('required-record-missing', target);
    }
  }
  if (files.length === 0) block('canonical-reconciliation-required', mainRoot);
  const plan = {
    schema: 'aitm.runtime-migration-plan/v1',
    projectRoot: layout.projectRoot,
    mainRoot: layout.mainRoot,
    roots,
    rootIdentities,
    files,
    blockers,
    writerObservation: census ?? { complete: false },
    sourcePolicy: 'explicit-trust-no-fallback',
  };
  return { ...plan, digest: runtimeMigrationDigest(plan) };
}
