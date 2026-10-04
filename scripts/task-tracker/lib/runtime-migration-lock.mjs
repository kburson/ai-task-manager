// @story #1857
// Coordination primitives only; live writers adopt them during the coupled cutover.
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  linkSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
  lstatSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import { detectProvider } from '../../providers/index.mjs';
import { resolveSessionId, FALLBACK_SESSION_ID } from './session-id.mjs';
import {
  runtimeStoragePaths,
  assertRuntimeStoragePath,
  RuntimeRootError,
} from './runtime-storage.mjs';

const processToken = randomUUID();
const sameOwner = (a, b) =>
  ['provider', 'sid', 'pid', 'processToken', 'host'].every((key) => a?.[key] === b?.[key]);
const fail = (code, message) => {
  throw new RuntimeRootError(code, message);
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validOwner = (value) =>
  isObject(value) &&
  ['provider', 'sid', 'processToken'].every(
    (key) => typeof value[key] === 'string' && value[key]
  ) &&
  value.sid !== FALLBACK_SESSION_ID &&
  (value.host === undefined || (typeof value.host === 'string' && value.host.length > 0)) &&
  Number.isSafeInteger(value.pid) &&
  value.pid > 0;

function identity(adapters) {
  const value = adapters.identity
    ? adapters.identity()
    : {
        provider: detectProvider({ env: process.env }).name,
        sid: resolveSessionId(),
        pid: process.pid,
        processToken,
        host: hostname(),
      };
  if (!validOwner(value)) {
    fail(
      'RUNTIME_MIGRATION_IDENTITY_REQUIRED',
      'A genuine process and provider session are required'
    );
  }
  return {
    provider: value.provider,
    sid: value.sid,
    pid: value.pid,
    processToken: value.processToken,
    ...(value.host === undefined ? {} : { host: value.host }),
  };
}

function syncDirectory(directory) {
  const fd = openSync(directory, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function publishExclusiveJson(file, value) {
  const prepared = file + '.' + randomUUID() + '.pending';
  const fd = openSync(prepared, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value) + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    linkSync(prepared, file);
    syncDirectory(path.dirname(file));
  } finally {
    unlinkSync(prepared);
  }
}

function claimCoordinatorRecovery(directory, previous, owner, adapters) {
  let previousReceipt = null;
  for (let generation = 0; generation < 10000; generation++) {
    const receipt = path.join(
      directory,
      previous.digest.slice(7) + '-' + String(generation).padStart(6, '0') + '.json'
    );
    assertRuntimeStoragePath(receipt, directory, 'RUNTIME_CONTROL_INVALID');
    const earlier = readRecord(receipt, true);
    if (earlier) {
      if (
        earlier.schema !== 'aitm.runtime-coordinator-recovery/v1' ||
        earlier.phase !== 'prepared' ||
        earlier.previous?.digest !== previous.digest ||
        !validOwner(earlier.owner) ||
        earlier.previousReceipt !== previousReceipt
      )
        fail('RUNTIME_MIGRATION_CONFLICT', 'Recovery history is changed or already complete');
      assertRecoveryOwner(earlier.owner, {
        ...adapters,
        observeOwner: adapters.observeOwner || observeLocalRuntimeOwner,
      });
      previousReceipt = receipt;
      continue;
    }
    const evidence = {
      schema: 'aitm.runtime-coordinator-recovery/v1',
      phase: 'prepared',
      previous,
      owner,
      previousReceipt,
      observedAt: new Date().toISOString(),
    };
    try {
      publishExclusiveJson(receipt, evidence);
    } catch (error) {
      if (error.code === 'EEXIST')
        fail('RUNTIME_MIGRATION_BUSY', 'Another recovery claimed this exact coordinator');
      throw error;
    }
    return { receipt, evidence };
  }
  fail('RUNTIME_CONTROL_INVALID', 'Recovery history exceeds supported bound');
}

function locations(input) {
  const layout = runtimeStoragePaths(input);
  const base = layout.migrationRoot;
  const paths = {
    base,
    lock: path.join(base, 'coordinator.lock'),
    fence: path.join(base, 'fence.json'),
    writers: path.join(base, 'writers'),
  };
  for (const target of Object.values(paths))
    assertRuntimeStoragePath(target, layout.sharedRuntimeRoot, 'RUNTIME_CONTROL_INVALID');
  return {
    ...paths,
    registeredRoots: layout.registeredRoots,
    coordinatorContext: {
      transactionId: input.transactionId ?? null,
      planDigest: input.approvedPlanDigest ?? null,
    },
  };
}

function operationLocations(input) {
  if (typeof input.recordKey !== 'string' || !/^[a-f0-9]{64}$/.test(input.recordKey))
    fail('RUNTIME_CONTROL_INVALID', 'Operation recovery requires an exact record key');
  const common = locations(input);
  const base = path.join(common.base, 'operation-locks', input.recordKey);
  assertRuntimeStoragePath(base, common.base, 'RUNTIME_CONTROL_INVALID');
  return {
    ...common,
    base,
    lock: path.join(base, 'coordinator.lock'),
    coordinatorContext: { transactionId: null, planDigest: null },
  };
}

export function inspectRuntimeOperationLock(input) {
  return coordinatorSnapshot(operationLocations(input));
}

export function recoverRuntimeOperationLock(input) {
  return recoverCoordinatorAt(input, operationLocations(input));
}

function atomicJson(file, value) {
  const temporary = file + '.' + randomUUID() + '.pending';
  const fd = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value) + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, file);
  const dir = openSync(path.dirname(file), 'r');
  try {
    fsyncSync(dir);
  } finally {
    closeSync(dir);
  }
}

function readRecord(file, optional = false) {
  try {
    if (!lstatSync(file).isFile())
      fail('RUNTIME_CONTROL_INVALID', 'Coordination record must be a regular file');
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (optional && error.code === 'ENOENT') return undefined;
    if (error instanceof RuntimeRootError) throw error;
    fail('RUNTIME_CONTROL_INVALID', 'Unreadable runtime coordination record');
  }
}

function coordinatorDigest(value) {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function coordinatorSnapshot(paths) {
  assertRuntimeStoragePath(paths.lock, paths.base, 'RUNTIME_CONTROL_INVALID');
  let stat;
  try {
    stat = lstatSync(paths.lock);
  } catch (error) {
    if (error.code === 'ENOENT') return { status: 'absent' };
    throw error;
  }
  if (stat.isDirectory())
    return { status: 'legacy-directory', identity: { dev: stat.dev, ino: stat.ino } };
  if (!stat.isFile())
    fail('RUNTIME_CONTROL_INVALID', 'Coordinator must be a regular protected record');
  const bytes = readFileSync(paths.lock);
  let record;
  try {
    record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('RUNTIME_CONTROL_INVALID', 'Unreadable coordinator record');
  }
  if (
    !isObject(record) ||
    record.schema !== 'aitm.runtime-coordinator/v1' ||
    !validOwner(record.owner) ||
    Object.keys(record).sort().join(',') !== 'owner,planDigest,schema,transactionId' ||
    !(
      (record.transactionId === null && record.planDigest === null) ||
      (typeof record.transactionId === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9-]{0,95}$/.test(record.transactionId) &&
        typeof record.planDigest === 'string' &&
        /^sha256:[a-f0-9]{64}$/.test(record.planDigest))
    )
  )
    fail('RUNTIME_CONTROL_INVALID', 'Unsupported coordinator record');
  const identity = { dev: stat.dev, ino: stat.ino };
  const original = bytes.toString('utf8');
  return {
    status: 'owned',
    identity,
    record,
    bytes: original,
    digest: coordinatorDigest({ identity, bytes: original }),
  };
}

function coordinated(
  paths,
  owner,
  operation,
  { retainOnAsync = false, awaitOperation = false, acquisitionWaitMs = 0, retention } = {}
) {
  mkdirSync(paths.base, { recursive: true });
  const prepared = path.join(paths.base, '.coordinator-owner-' + randomUUID() + '.pending');
  const record = { schema: 'aitm.runtime-coordinator/v1', owner, ...paths.coordinatorContext };
  // Publish a fully fsynced owner with link(2)'s exclusive destination creation.
  // There is no new empty coordinator directory or partially written lock.
  const fd = openSync(prepared, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(record) + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    const deadline = performance.now() + acquisitionWaitMs;
    const sleeper = new Int32Array(new SharedArrayBuffer(4));
    for (;;) {
      try {
        linkSync(prepared, paths.lock);
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (performance.now() >= deadline)
          fail(
            'RUNTIME_MIGRATION_BUSY',
            'Coordinator ownership requires explicit recovery; age is not authority'
          );
        // Wait for exclusive admission only. Never replay a mutation or remove
        // a competing owner; a retained coordinator still requires recovery.
        Atomics.wait(sleeper, 0, 0, 10);
      }
    }
  } finally {
    unlinkSync(prepared);
  }
  syncDirectory(paths.base);
  const original = coordinatorSnapshot(paths);
  const release = () => {
    const current = coordinatorSnapshot(paths);
    if (current.status !== 'owned' || current.digest !== original.digest)
      fail('RUNTIME_MIGRATION_CONFLICT', 'Coordinator ownership changed; preserve for recovery');
    unlinkSync(paths.lock);
    syncDirectory(paths.base);
  };
  let retained = false;
  try {
    const result = operation();
    if (awaitOperation) {
      retained = true;
      return Promise.resolve(result).finally(release);
    }
    if (retainOnAsync && result && typeof result.then === 'function') {
      retained = true;
      fail(
        'RUNTIME_SYNC_WRITER_ASYNC',
        'Synchronous record mutation returned a promise; ownership retained for recovery'
      );
    }
    if (retention?.retained) {
      retained = true;
      fail(
        'RUNTIME_SYNC_WRITER_ASYNC',
        'Nested synchronous mutation retained ownership for recovery'
      );
    }
    return result;
  } catch (error) {
    if (retainOnAsync && error?.code === 'RUNTIME_SYNC_WRITER_ASYNC') retained = true;
    throw error;
  } finally {
    if (!retained && !retention?.retained) release();
  }
}

export function inspectRuntimeCoordinator(input) {
  return coordinatorSnapshot(locations(input));
}

export function observeLocalRuntimeOwner(owner) {
  if (!validOwner(owner) || owner.host !== hostname()) return { status: 'unknown' };
  try {
    process.kill(owner.pid, 0);
    // A live PID, including a reused PID, never proves the recorded owner died.
    return { status: 'live', identity: owner };
  } catch (error) {
    return error.code === 'ESRCH' ? { status: 'dead', identity: owner } : { status: 'unknown' };
  }
}

export function recoverRuntimeCoordinator(input) {
  return recoverCoordinatorAt(input, locations(input));
}

function completeAbsentCoordinatorRecovery(input, paths, owner) {
  if (!/^sha256:[a-f0-9]{64}$/.test(input.expectedDigest || ''))
    fail('RUNTIME_MIGRATION_CONFLICT', 'Exact coordinator recovery digest is required');
  const directory = path.join(paths.base, 'coordinator-recoveries');
  assertRuntimeStoragePath(directory, paths.base, 'RUNTIME_CONTROL_INVALID');
  let names;
  try {
    if (!lstatSync(directory).isDirectory())
      fail('RUNTIME_CONTROL_INVALID', 'Recovery history must be a directory');
    names = readdirSync(directory)
      .filter((name) => name.startsWith(input.expectedDigest.slice(7) + '-'))
      .sort();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    names = [];
  }
  if (!names.length)
    fail(
      'RUNTIME_COORDINATOR_RECOVERY_REQUIRED',
      'Absent coordination has no exact protected recovery proof'
    );
  let previousReceipt = null,
    previous = null,
    latest;
  const observeOwner = input.adapters?.observeOwner || observeLocalRuntimeOwner;
  for (const [generation, name] of names.entries()) {
    const receipt = path.join(directory, name);
    assertRuntimeStoragePath(receipt, directory, 'RUNTIME_CONTROL_INVALID');
    const record = readRecord(receipt);
    const proof = record?.previous;
    let parsed;
    try {
      parsed = JSON.parse(proof?.bytes);
    } catch {
      /* refused below */
    }
    const keys = ['schema', 'phase', 'previous', 'owner', 'previousReceipt', 'observedAt'];
    if (record?.phase === 'complete') keys.push('completedAt');
    if (
      name !==
        input.expectedDigest.slice(7) + '-' + String(generation).padStart(6, '0') + '.json' ||
      !isObject(record) ||
      Object.keys(record).sort().join(',') !== keys.sort().join(',') ||
      record.schema !== 'aitm.runtime-coordinator-recovery/v1' ||
      !['prepared', 'complete'].includes(record.phase) ||
      !validOwner(record.owner) ||
      record.previousReceipt !== previousReceipt ||
      !Number.isFinite(Date.parse(record.observedAt)) ||
      (record.phase === 'complete' && !Number.isFinite(Date.parse(record.completedAt))) ||
      proof?.status !== 'owned' ||
      !isObject(proof.identity) ||
      !['dev', 'ino'].every(
        (key) => Number.isSafeInteger(proof.identity[key]) && proof.identity[key] >= 0
      ) ||
      typeof proof.bytes !== 'string' ||
      proof.digest !== input.expectedDigest ||
      coordinatorDigest({ identity: proof.identity, bytes: proof.bytes }) !== proof.digest ||
      !isObject(parsed) ||
      parsed.schema !== 'aitm.runtime-coordinator/v1' ||
      !validOwner(parsed.owner) ||
      Object.keys(parsed).sort().join(',') !== 'owner,planDigest,schema,transactionId' ||
      JSON.stringify(parsed) !== JSON.stringify(proof.record) ||
      parsed.transactionId !== (input.transactionId ?? null) ||
      parsed.planDigest !== (input.approvedPlanDigest ?? null) ||
      (previous && JSON.stringify(proof) !== JSON.stringify(previous)) ||
      latest?.record.phase === 'complete'
    )
      fail('RUNTIME_MIGRATION_CONFLICT', 'Absent coordinator recovery history changed');
    previous = proof;
    previousReceipt = receipt;
    latest = { receipt, record };
  }
  if (latest.record.phase === 'complete') return { status: 'recovered', receipt: latest.receipt };
  const observed = observeOwner(previous.record.owner);
  if (observed?.status !== 'dead' || !sameOwner(observed.identity, previous.record.owner))
    fail('RUNTIME_MIGRATION_OWNER_UNCONFIRMED', 'Original coordinator death is unconfirmed');
  const { receipt, evidence } = claimCoordinatorRecovery(
    directory,
    previous,
    owner,
    input.adapters || {}
  );
  if (coordinatorSnapshot(paths).status !== 'absent')
    fail(
      'RUNTIME_MIGRATION_CONFLICT',
      'Replacement coordinator appeared; preserve recovery evidence'
    );
  atomicJson(receipt, { ...evidence, phase: 'complete', completedAt: new Date().toISOString() });
  return { status: 'recovered', receipt };
}

function recoverCoordinatorAt(input, paths) {
  const owner = identity(input.adapters || {});
  const previous = coordinatorSnapshot(paths);
  if (previous.status === 'absent') return completeAbsentCoordinatorRecovery(input, paths, owner);
  if (previous.status !== 'owned')
    fail(
      'RUNTIME_COORDINATOR_RECOVERY_REQUIRED',
      'Absent or legacy ownerless coordination needs explicit reconciliation; preserve its bytes'
    );
  if (
    previous.digest !== input.expectedDigest ||
    previous.record.transactionId !== (input.transactionId ?? null) ||
    previous.record.planDigest !== (input.approvedPlanDigest ?? null)
  )
    fail(
      'RUNTIME_MIGRATION_CONFLICT',
      'Recovery requires the exact observed coordinator inode, owner and transaction'
    );
  const observed = (input.adapters?.observeOwner || observeLocalRuntimeOwner)(
    previous.record.owner
  );
  if (observed?.status !== 'dead' || !sameOwner(observed.identity, previous.record.owner))
    fail(
      'RUNTIME_MIGRATION_OWNER_UNCONFIRMED',
      'Coordinator death is unconfirmed; live, reused and foreign PIDs cannot authorize recovery'
    );
  const directory = path.join(paths.base, 'coordinator-recoveries');
  assertRuntimeStoragePath(directory, paths.base, 'RUNTIME_CONTROL_INVALID');
  mkdirSync(directory, { recursive: true });
  const { receipt, evidence } = claimCoordinatorRecovery(
    directory,
    previous,
    owner,
    input.adapters || {}
  );
  input.adapters?.faultSync?.('after-recovery-claim', { receipt });
  const current = coordinatorSnapshot(paths);
  if (current.status !== 'owned' || current.digest !== previous.digest)
    fail('RUNTIME_MIGRATION_CONFLICT', 'Coordinator changed during recovery; evidence preserved');
  unlinkSync(paths.lock);
  syncDirectory(paths.base);
  input.adapters?.faultSync?.('after-coordinator-release', { receipt });
  atomicJson(receipt, { ...evidence, phase: 'complete', completedAt: new Date().toISOString() });
  return { status: 'recovered', receipt };
}

function readFence(paths) {
  const value = readRecord(paths.fence, true);
  if (value === undefined) return null;
  if (
    !isObject(value) ||
    value.schema !== 'aitm.runtime-fence/v1' ||
    !validOwner(value.owner) ||
    typeof value.transactionId !== 'string' ||
    typeof value.planDigest !== 'string'
  ) {
    fail('RUNTIME_CONTROL_INVALID', 'Unsupported runtime fence');
  }
  return value;
}

export function inspectRuntimeFence(input) {
  return readFence(locations(input));
}

function leases(paths) {
  mkdirSync(paths.writers, { recursive: true });
  return readdirSync(paths.writers).map((name) => {
    if (!new RegExp('^[a-f0-9-]+\\.json$').test(name))
      fail('RUNTIME_CONTROL_INVALID', 'Unknown writer lease entry');
    const value = readRecord(path.join(paths.writers, name));
    if (
      !isObject(value) ||
      value.schema !== 'aitm.runtime-writer/v1' ||
      !validOwner(value.owner) ||
      typeof value.projectRoot !== 'string' ||
      !paths.registeredRoots.includes(value.projectRoot) ||
      name !== value.leaseId + '.json'
    ) {
      fail('RUNTIME_CONTROL_INVALID', 'Unsupported writer lease');
    }
    return value;
  });
}

export function inspectRuntimeWriterLeases(input) {
  const paths = locations(input);
  try {
    lstatSync(paths.writers);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return leases(paths).map((record) => {
    const file = path.join(paths.writers, record.leaseId + '.json');
    assertRuntimeStoragePath(file, paths.base, 'RUNTIME_CONTROL_INVALID');
    const stat = lstatSync(file);
    const bytes = readFileSync(file, 'utf8');
    return {
      record,
      bytes,
      identity: { dev: stat.dev, ino: stat.ino },
      digest: coordinatorDigest({ identity: { dev: stat.dev, ino: stat.ino }, bytes }),
    };
  });
}

export function recoverRuntimeWriterLease(input) {
  const paths = locations(input);
  const owner = identity(input.adapters || {});
  if (
    typeof input.leaseId !== 'string' ||
    !/^[a-f0-9-]+$/.test(input.leaseId) ||
    typeof input.expectedDigest !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(input.expectedDigest)
  )
    fail('RUNTIME_MIGRATION_CONFLICT', 'Exact lease identity and observation digest are required');
  return coordinated(paths, owner, () => {
    const directory = path.join(paths.base, 'writer-recoveries');
    const receipt = path.join(
      directory,
      input.leaseId + '-' + input.expectedDigest.slice(7) + '.json'
    );
    assertRuntimeStoragePath(receipt, paths.base, 'RUNTIME_CONTROL_INVALID');
    const earlier = readRecord(receipt, true);
    if (
      earlier &&
      (earlier.schema !== 'aitm.runtime-writer-recovery/v1' ||
        !['prepared', 'complete'].includes(earlier.phase) ||
        earlier.previous?.digest !== input.expectedDigest ||
        earlier.previous?.record?.leaseId !== input.leaseId ||
        !validOwner(earlier.owner))
    )
      fail('RUNTIME_CONTROL_INVALID', 'Writer recovery journal is malformed');
    const previous = inspectRuntimeWriterLeases(input).find(
      (entry) => entry.record.leaseId === input.leaseId
    );
    if (!previous) {
      if (!earlier)
        fail('RUNTIME_MIGRATION_CONFLICT', 'Missing lease has no protected recovery journal');
      if (earlier.phase === 'prepared') {
        assertRecoveryOwner(earlier.owner, {
          ...input.adapters,
          observeOwner: input.adapters?.observeOwner || observeLocalRuntimeOwner,
        });
        writeMigrationRecord(receipt, {
          ...earlier,
          phase: 'complete',
          completedAt: new Date().toISOString(),
        });
      }
      return { status: 'recovered', receipt };
    }
    if (previous.digest !== input.expectedDigest || earlier?.phase === 'complete')
      fail('RUNTIME_MIGRATION_CONFLICT', 'Writer lease changed after observation');
    const observation = (input.adapters?.observeOwner || observeLocalRuntimeOwner)(
      previous.record.owner
    );
    if (observation?.status !== 'dead' || !sameOwner(observation.identity, previous.record.owner))
      fail('RUNTIME_MIGRATION_OWNER_UNCONFIRMED', 'Writer death is unconfirmed');
    if (earlier)
      assertRecoveryOwner(earlier.owner, {
        ...input.adapters,
        observeOwner: input.adapters?.observeOwner || observeLocalRuntimeOwner,
      });
    mkdirSync(directory, { recursive: true });
    const evidence = earlier || {
      schema: 'aitm.runtime-writer-recovery/v1',
      phase: 'prepared',
      previous,
      owner,
    };
    if (!earlier) publishExclusiveJson(receipt, evidence);
    input.adapters?.faultSync?.('after-writer-recovery-claim');
    const current = inspectRuntimeWriterLeases(input).find(
      (entry) => entry.record.leaseId === input.leaseId
    );
    if (current?.digest !== previous.digest)
      fail('RUNTIME_MIGRATION_CONFLICT', 'Writer changed during recovery');
    unlinkSync(path.join(paths.writers, input.leaseId + '.json'));
    syncDirectory(paths.writers);
    input.adapters?.faultSync?.('after-writer-recovery-release');
    atomicJson(receipt, { ...evidence, phase: 'complete', completedAt: new Date().toISOString() });
    return { status: 'recovered', receipt };
  });
}

function acquireWriterLease(input) {
  const owner = identity(input.adapters || {});
  const paths = locations(input);
  const leaseId = randomUUID();
  const file = path.join(paths.writers, leaseId + '.json');
  coordinated(paths, owner, () => {
    if (readFence(paths))
      fail('RUNTIME_TRANSACTION_INCOMPLETE', 'Runtime writers are fenced for migration');
    leases(paths);
    atomicJson(file, {
      schema: 'aitm.runtime-writer/v1',
      leaseId,
      owner,
      projectRoot: input.projectRoot,
    });
  });
  return () =>
    coordinated(
      paths,
      owner,
      () => {
        assertRuntimeStoragePath(file, paths.base, 'RUNTIME_MIGRATION_CONFLICT');
        const lease = readRecord(file);
        if (!isObject(lease) || !sameOwner(lease.owner, owner) || lease.leaseId !== leaseId) {
          fail('RUNTIME_MIGRATION_CONFLICT', 'Writer lease identity changed');
        }
        unlinkSync(file);
      },
      { acquisitionWaitMs: 3_000 }
    );
}

const writerScope = new AsyncLocalStorage();

export function hasRuntimeWriterLease(input) {
  const layout = runtimeStoragePaths(input);
  const held = writerScope.getStore()?.get(layout.projectRoot);
  return Boolean(
    held && held.references > 0 && sameOwner(held.owner, identity(input.adapters || {}))
  );
}

function scopedLease(input) {
  const owner = identity(input.adapters || {});
  const layout = runtimeStoragePaths(input);
  const key = layout.projectRoot;
  const inherited = writerScope.getStore() || new Map();
  let held = inherited.get(key);
  if (!held || held.references === 0 || !sameOwner(held.owner, owner)) {
    held = {
      owner,
      references: 0,
      retained: false,
      release: acquireWriterLease({ ...input, projectRoot: layout.projectRoot }),
    };
  }
  held.references++;
  const scope = new Map(inherited);
  scope.set(key, held);
  return {
    scope,
    retain: () => {
      held.retained = true;
    },
    release: () => {
      held.references--;
      if (held.references === 0 && !held.retained) held.release();
    },
  };
}

export async function withRuntimeWriterLease(input, operation) {
  const lease = scopedLease(input);
  try {
    return await writerScope.run(lease.scope, operation);
  } finally {
    lease.release();
  }
}

export function withRuntimeWriterLeaseSync(input, operation) {
  const lease = scopedLease(input);
  try {
    const result = writerScope.run(lease.scope, operation);
    if (result && typeof result.then === 'function') {
      // Retain authority evidence: an accidentally unawaited writer may still run.
      lease.retain();
      fail(
        'RUNTIME_SYNC_WRITER_ASYNC',
        'Synchronous writer returned a promise; lease retained for recovery'
      );
    }
    return result;
  } catch (error) {
    if (error?.code === 'RUNTIME_SYNC_WRITER_ASYNC') lease.retain();
    throw error;
  } finally {
    lease.release();
  }
}

const mutationScope = new AsyncLocalStorage();
const operationScope = new AsyncLocalStorage();

export function withRuntimeOperationLock(input, operation) {
  if (!hasRuntimeWriterLease(input))
    fail(
      'RUNTIME_MIGRATION_IDENTITY_REQUIRED',
      'Operation lock requires its whole-operation writer lease'
    );
  const owner = identity(input.adapters || {});
  const paths = operationLocations(input);
  const key = paths.lock;
  const inherited = operationScope.getStore() || new Map();
  const held = inherited.get(key);
  if (held) {
    if (!sameOwner(held.owner, owner) || coordinatorSnapshot(paths).digest !== held.digest)
      fail('RUNTIME_MIGRATION_CONFLICT', 'Nested operation ownership changed');
    return operation();
  }
  return coordinated(
    paths,
    owner,
    () => {
      const scope = new Map(inherited);
      scope.set(key, { owner, digest: coordinatorSnapshot(paths).digest });
      return operationScope.run(scope, operation);
    },
    { awaitOperation: true }
  );
}

// Bootstrap shares the store exclusion without manufacturing a writer lease.
export async function withRuntimeBootstrapCoordinator(input, operation) {
  const owner = identity(input.adapters || {});
  const paths = locations(input);
  return coordinated(
    paths,
    owner,
    () => operation({ owner, coordinator: coordinatorSnapshot(paths) }),
    { awaitOperation: true }
  );
}

export function withRuntimeStoreLockSync(input, operation) {
  const layout = runtimeStoragePaths(input);
  const held = writerScope.getStore()?.get(layout.projectRoot);
  const owner = identity(input.adapters || {});
  if (!held || held.references < 1 || !sameOwner(held.owner, owner))
    fail(
      'RUNTIME_MIGRATION_IDENTITY_REQUIRED',
      'Record mutation requires its active whole-operation writer lease'
    );
  const inherited = mutationScope.getStore() || new Map();
  const existing = inherited.get(layout.mainRoot);
  const paths = locations(input);
  const run = (protection) => {
    const retain = () => {
      protection.retained = true;
      protection.lease.retained = true;
      held.retained = true;
    };
    try {
      const result = operation();
      if ((result && typeof result.then === 'function') || protection.retained) {
        retain();
        fail(
          'RUNTIME_SYNC_WRITER_ASYNC',
          'Nested synchronous mutation returned a promise; protection retained'
        );
      }
      return result;
    } catch (error) {
      if (error?.code === 'RUNTIME_SYNC_WRITER_ASYNC') retain();
      throw error;
    }
  };
  if (existing) {
    if (!sameOwner(existing.owner, owner) || coordinatorSnapshot(paths).digest !== existing.digest)
      fail('RUNTIME_MIGRATION_CONFLICT', 'Nested mutation coordinator ownership changed');
    return run(existing);
  }
  const protection = { owner, digest: null, retained: false, lease: held };
  const scope = new Map(inherited);
  scope.set(layout.mainRoot, protection);
  return coordinated(
    paths,
    owner,
    () => {
      protection.digest = coordinatorSnapshot(paths).digest;
      return mutationScope.run(scope, () => run(protection));
    },
    { retainOnAsync: true, retention: protection }
  );
}

export async function fenceRuntimeWriters(input) {
  const { transactionId, approvedPlanDigest, adapters = {} } = input;
  if (
    !new RegExp('^[a-zA-Z0-9][a-zA-Z0-9-]{0,95}$').test(transactionId || '') ||
    !new RegExp('^sha256:[a-f0-9]{64}$').test(approvedPlanDigest || '')
  ) {
    fail(
      'RUNTIME_MIGRATION_APPROVAL_REQUIRED',
      'Exact transaction and approved plan digest are required'
    );
  }
  const owner = identity(adapters);
  const paths = locations(input);
  return coordinated(paths, owner, () => {
    const existing = readFence(paths);
    if (
      existing &&
      (existing.transactionId !== transactionId ||
        existing.planDigest !== approvedPlanDigest ||
        !sameOwner(existing.owner, owner))
    ) {
      fail('RUNTIME_MIGRATION_CONFLICT', 'A different migration owns the durable fence');
    }
    // A production census must observe both current and older uncooperative writers.
    // Absence of an adapter is unknown, never an empty census.
    const census = adapters.writerCensus?.();
    if (
      !census ||
      census.complete !== true ||
      !Array.isArray(census.writers) ||
      !Array.isArray(census.claims)
    ) {
      fail('RUNTIME_WRITER_CENSUS_UNKNOWN', 'Complete writer and claim observation is required');
    }
    const active = leases(paths);
    if (
      census.writers.some(
        (writer) =>
          !sameOwner(writer, owner) &&
          !(writer.cooperative === true && active.some((lease) => sameOwner(lease.owner, writer)))
      ) ||
      census.claims.some((claim) => claim.provider !== owner.provider || claim.sid !== owner.sid)
    ) {
      fail(
        'RUNTIME_WRITERS_ACTIVE',
        'Other live or uncooperative writers and claims block migration'
      );
    }
    const fence = existing || {
      schema: 'aitm.runtime-fence/v1',
      transactionId,
      planDigest: approvedPlanDigest,
      owner,
    };
    if (!existing) {
      adapters.prepareTransaction?.({ owner, transactionId, approvedPlanDigest });
      atomicJson(paths.fence, fence);
    }
    return { status: active.length ? 'draining' : 'quiesced', fence, leases: active };
  });
}

export const writeMigrationRecord = atomicJson;
export const writeMigrationRecordExclusive = publishExclusiveJson;
export const readMigrationRecord = readRecord;
export const observeMigrationIdentity = identity;
export const isRuntimeMigrationOwner = validOwner;

export function completeRuntimeFence(input) {
  const owner = identity(input.adapters || {});
  const paths = locations(input);
  return coordinated(paths, owner, () => {
    const fence = readFence(paths);
    if (
      !fence ||
      fence.transactionId !== input.transactionId ||
      fence.planDigest !== input.approvedPlanDigest ||
      !sameOwner(fence.owner, owner)
    ) {
      fail('RUNTIME_MIGRATION_CONFLICT', 'Only the exact owning migrator can complete its fence');
    }
    const manifestFile = path.join(paths.base, fence.transactionId, 'manifest.json');
    assertRuntimeStoragePath(manifestFile, paths.base, 'RUNTIME_CONTROL_INVALID');
    const manifest = readRecord(manifestFile);
    if (
      manifest.schema !== 'aitm.runtime-migration/v1' ||
      manifest.status !== 'complete' ||
      manifest.transactionId !== fence.transactionId ||
      manifest.planDigest !== fence.planDigest ||
      !Array.isArray(manifest.roots) ||
      manifest.roots.length === 0
    ) {
      fail(
        'RUNTIME_TRANSACTION_INCOMPLETE',
        'All-root publication must complete before releasing the fence'
      );
    }
    if (
      JSON.stringify([...manifest.roots].sort()) !==
      JSON.stringify([...paths.registeredRoots].sort())
    ) {
      fail('RUNTIME_MIGRATION_CONFLICT', 'Worktree census changed before fence release');
    }
    for (const root of manifest.roots) {
      const layout = runtimeStoragePaths({ projectRoot: root, mainRoot: input.mainRoot });
      assertRuntimeStoragePath(
        layout.controlPath,
        layout.localRuntimeRoot,
        'RUNTIME_CONTROL_INVALID'
      );
      const control = readRecord(layout.controlPath);
      if (
        control.schema !== 'aitm.runtime-control/v1' ||
        control.status !== 'active' ||
        control.projectRoot !== root ||
        control.mainRoot !== input.mainRoot ||
        control.transactionId !== fence.transactionId ||
        control.planDigest !== fence.planDigest
      ) {
        fail('RUNTIME_TRANSACTION_INCOMPLETE', 'A participating root is not activated');
      }
    }
    unlinkSync(paths.fence);
  });
}

export function recoverRuntimeFence(input) {
  const owner = identity(input.adapters || {});
  const paths = locations(input);
  return coordinated(paths, owner, () => {
    const fence = readFence(paths);
    if (!fence)
      fail('RUNTIME_MIGRATION_FENCE_MISSING', 'Durable transaction requires fence recovery');
    if (
      fence.transactionId !== input.transactionId ||
      fence.planDigest !== input.approvedPlanDigest
    ) {
      fail('RUNTIME_MIGRATION_CONFLICT', 'Recovery requires the exact durable fence');
    }
    if (!sameOwner(fence.owner, owner)) {
      const observation = input.adapters?.observeOwner?.(fence.owner);
      if (observation?.status !== 'dead' || !sameOwner(observation.identity, fence.owner)) {
        fail(
          'RUNTIME_MIGRATION_OWNER_UNCONFIRMED',
          'Previous owner death is unconfirmed; PID reuse and age cannot authorize recovery'
        );
      }
      fence.previousOwners = [...(fence.previousOwners || []), fence.owner];
      fence.owner = owner;
      atomicJson(paths.fence, fence);
    }
    return fence;
  });
}

export function assertRecoveryOwner(previous, adapters = {}) {
  const owner = identity(adapters);
  if (!sameOwner(previous, owner)) {
    const observation = adapters.observeOwner?.(previous);
    if (
      !validOwner(previous) ||
      observation?.status !== 'dead' ||
      !sameOwner(observation.identity, previous)
    ) {
      fail('RUNTIME_MIGRATION_OWNER_UNCONFIRMED', 'Previous process death is unconfirmed');
    }
  }
  return owner;
}
