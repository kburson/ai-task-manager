import { SqliteWorkLeaseStore, WorkLeaseError, openProjectDatabase } from '@kburson/aitm-ledger';
import { hostname } from 'node:os';

import { configPath, getProjectDir } from '../../paths.mjs';
import { resolveProjectDatabasePath } from '../ledger/project-database-path.mjs';
import { ensureLedgerProjectIdentity } from '../ledger/project-identity.mjs';
import { HttpWorkLeaseStore } from './http-store.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(message) {
  throw new WorkLeaseError('invalid-request', message);
}

function projectIdentity(config, { required = true } = {}) {
  const identity = config?.ledgerProjectId;
  if (identity == null || identity === '') {
    if (required) invalid('persisted ledger project identity is required');
    return null;
  }
  if (typeof identity !== 'string' || !UUID_PATTERN.test(identity)) {
    invalid('persisted ledger project identity is required');
  }
  if (
    typeof config?.projectId === 'string' &&
    config.projectId !== '' &&
    config.projectId === identity
  ) {
    invalid('ledger project identity must differ from the GitHub Projects identity');
  }
  return identity;
}

function exposeProjectIdentity(store, identity) {
  if (!store || (typeof store !== 'object' && typeof store !== 'function')) {
    invalid('work-lease provider did not return a store');
  }
  if (store.projectId != null && store.projectId !== identity) {
    invalid('work-lease store project identity differs from authority identity');
  }
  if (store.projectId == null) {
    try {
      Object.defineProperty(store, 'projectId', {
        value: identity,
        enumerable: true,
        configurable: false,
        writable: false,
      });
    } catch {
      invalid('work-lease store cannot expose its project identity');
    }
  }
  return store;
}

function isLocalHolderLive(holder) {
  if (holder?.hostId !== hostname()) return null;
  try {
    process.kill(holder.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    return null;
  }
}

export function createWorkLeaseProvider({
  config,
  createLocalStore,
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs,
  setTimeoutImpl,
  clearTimeoutImpl,
  AbortControllerImpl,
  projectDir,
  resolveDatabasePath = resolveProjectDatabasePath,
  openDatabase = openProjectDatabase,
  ensureProjectIdentity = ensureLedgerProjectIdentity,
  LocalStore = SqliteWorkLeaseStore,
  resolveConfigPath = configPath,
  isHolderLive,
} = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    invalid('task-tracker configuration is required');
  }
  if (
    config.workLease != null &&
    (typeof config.workLease !== 'object' || Array.isArray(config.workLease))
  ) {
    invalid('work-lease configuration must be an object');
  }
  const authority = config.workLease?.authority ?? 'local';
  if (!['local', 'remote'].includes(authority)) {
    invalid('work-lease authority must be local or remote');
  }

  if (authority === 'local') {
    const configuredProjectId = projectIdentity(config, { required: false });
    if (createLocalStore !== undefined) {
      if (typeof createLocalStore !== 'function') {
        invalid('local lease authority factory must be a function');
      }
      const store = createLocalStore({ projectId: configuredProjectId, config });
      const identity =
        configuredProjectId ??
        projectIdentity({ ...config, ledgerProjectId: store?.projectId }, { required: true });
      return exposeProjectIdentity(store, identity);
    }
    if (
      typeof resolveDatabasePath !== 'function' ||
      typeof openDatabase !== 'function' ||
      typeof ensureProjectIdentity !== 'function' ||
      typeof LocalStore !== 'function' ||
      typeof resolveConfigPath !== 'function'
    ) {
      invalid('local lease authority dependencies are unavailable');
    }
    const localProjectDir = projectDir ?? getProjectDir(env);
    const databasePath = resolveDatabasePath(localProjectDir);
    const db = openDatabase({
      databasePath,
      expectedLedgerProjectId: configuredProjectId ?? undefined,
    });
    try {
      const identity = ensureProjectIdentity({
        db,
        configPath: resolveConfigPath(localProjectDir),
      });
      projectIdentity({ ...config, ledgerProjectId: identity });
      if (configuredProjectId && identity !== configuredProjectId) {
        invalid('local lease project identity differs from persisted configuration');
      }
      return exposeProjectIdentity(
        new LocalStore({ db, isHolderLive: isHolderLive ?? isLocalHolderLive }),
        identity
      );
    } catch (error) {
      try {
        db.close();
      } catch {
        // Preserve the authority initialization failure.
      }
      throw error;
    }
  }

  const ledgerProjectId = projectIdentity(config);
  const remoteProjectId = config.workLease?.projectId;
  if (typeof remoteProjectId !== 'string' || remoteProjectId.trim() === '') {
    invalid('remote lease project identity is required');
  }
  if (remoteProjectId !== ledgerProjectId) {
    invalid('remote lease project identity differs from the persisted ledger identity');
  }

  return new HttpWorkLeaseStore({
    endpoint: config.workLease.endpoint,
    projectId: remoteProjectId,
    tokenEnv: config.workLease.tokenEnv ?? 'AITM_LEASE_AUTH_TOKEN',
    env,
    fetchImpl,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(setTimeoutImpl === undefined ? {} : { setTimeoutImpl }),
    ...(clearTimeoutImpl === undefined ? {} : { clearTimeoutImpl }),
    ...(AbortControllerImpl === undefined ? {} : { AbortControllerImpl }),
  });
}

export const selectWorkLeaseProvider = createWorkLeaseProvider;
