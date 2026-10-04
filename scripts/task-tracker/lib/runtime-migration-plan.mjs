// @story #1857
// Read-only planning precedes fenced application. No automatic legacy import.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { classifyKnownLegacyRuntimeRecord } from './runtime-migration-catalog.mjs';
import { observeRuntimeAuthorityInventory } from './runtime-authority-census.mjs';
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

export async function planRuntimeMigration({ projectRoot, mainRoot, adapters = {} }) {
  const observation = observeRuntimeAuthorityInventory({ projectRoot, mainRoot });
  const { identity, layout, roots, rootIdentities } = observation;
  const blockers = [];
  const files = [];
  const destinations = new Set();
  const block = (code, target, detail) =>
    blockers.push({ code, target, ...(detail ? { detail } : {}) });
  const visit = (source, relative, root, sourceKind) => {
    const rootLayout = observation.rootLayouts.get(root);
    const classified = (adapters.classifyLegacy || classifyKnownLegacyRuntimeRecord)({
      root,
      mainRoot,
      source,
      relative,
      kind: sourceKind,
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
      adapters.trustLegacy?.({ source, digest, root, family: classified.family }) ?? 'unresolved';
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
  };
  for (const event of observation.events) {
    if (event.kind === 'blocker') {
      const { code, target, detail } = event.value;
      block(code, target, detail);
    } else visit(event.source, event.relative, event.root, event.sourceKind);
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
