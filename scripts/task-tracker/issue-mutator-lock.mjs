// @story #1857
// Issue serialization uses protected operation ownership and whole writer leases.
// Inherited flags are hints only: a live ancestor and exact protected proof are
// required. Legacy locks are preserved for registered recovery, never age-reaped.
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import { issueLockPath } from './paths.mjs';
import { withLock } from './locks.mjs';
import { runtimeWriterRootsForPath, runtimeOperationKey, withRuntimeWrite } from './lib/runtime-writer.mjs';
import { inspectRuntimeOperationLock } from './lib/runtime-migration-lock.mjs';
import { assertRuntimeReadable } from './lib/runtime-storage.mjs';

export const ISSUE_LOCK_STALE_MS = 30 * 60_000; // legacy diagnostic compatibility only
export const ISSUE_LOCK_DEFAULT_RETRY_MS = 500;
export const ISSUE_LOCK_DEFAULT_RETRIES = 1;
export const ISSUE_LOCK_HELD_ENV = 'AITM_ISSUE_LOCK_HELD';
export const ISSUE_LOCK_PROOF_ENV = 'AITM_ISSUE_LOCK_PROOF';
export const THIS_HOST = hostname();
export const PROCESS_START_TOKEN = randomBytes(8).toString('hex');
export { issueLockPath };
const heldContext = new AsyncLocalStorage();

export function issueLockToken(issue) {
  return String(issue).trim().replace(/^#/, '');
}

export function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

function isLiveAncestor(pid) {
  if (!isProcessAlive(pid)) return false;
  let current = process.ppid;
  const visited = new Set();
  for (let depth = 0; depth < 32 && current > 1 && !visited.has(current); depth++) {
    if (current === pid) return true;
    visited.add(current);
    try {
      current = Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(current)],
        { encoding: 'utf8', timeout: 1000 }).trim());
    } catch { return false; }
  }
  return false;
}

function observedProof(proof, { allowOwn = false, projectRoot } = {}) {
  try {
    if (!proof || proof.schema !== 'aitm.issue-lock-proof/v1' ||
        Object.keys(proof).sort().join(',') !== 'digest,issue,projectRoot,recordKey,schema' ||
        !/^[1-9][0-9]*$/.test(proof.issue) || typeof proof.projectRoot !== 'string' ||
        !path.isAbsolute(proof.projectRoot) ||
        (projectRoot && proof.projectRoot !== projectRoot)) return null;
    const file = issueLockPath(proof.issue, proof.projectRoot);
    const roots = runtimeWriterRootsForPath(file);
    assertRuntimeReadable(roots);
    if (runtimeOperationKey(file) !== proof.recordKey) return null;
    const current = inspectRuntimeOperationLock({ ...roots, recordKey: proof.recordKey });
    if (current.status !== 'owned' || current.digest !== proof.digest ||
        current.record.owner.host !== THIS_HOST) return null;
    if (allowOwn ? current.record.owner.pid !== process.pid : !isLiveAncestor(current.record.owner.pid))
      return null;
    return proof;
  } catch { return null; }
}

function inheritedProof(issue, env = process.env, projectRoot) {
  const token = issue == null ? null : issueLockToken(issue);
  try {
    const proof = JSON.parse(env[ISSUE_LOCK_PROOF_ENV] || 'null');
    if (env[ISSUE_LOCK_HELD_ENV] !== proof?.issue || (token && token !== proof.issue)) return null;
    return observedProof(proof, { projectRoot });
  } catch { return null; }
}

export function isIssueLockHeld(issue, env = process.env) {
  const token = issue == null ? null : issueLockToken(issue);
  for (const proof of heldContext.getStore()?.values() || [])
    if ((!token || token === proof.issue) && observedProof(proof, { allowOwn: true })) return true;
  return Boolean(inheritedProof(issue, env));
}

export class IssueLockError extends Error {
  constructor(message, { issue, holder } = {}) {
    super(message);
    this.name = 'IssueLockError';
    this.code = 'EISSUELOCKED';
    this.issue = issue;
    this.holder = holder || null;
  }
}

export function readIssueLockHolder(lockPath) {
  const roots = runtimeWriterRootsForPath(lockPath);
  assertRuntimeReadable(roots);
  try {
    const stat = lstatSync(lockPath);
    if (stat.isDirectory()) {
      const value = JSON.parse(readFileSync(path.join(lockPath, 'holder.json'), 'utf8'));
      return value && typeof value === 'object' ? value : null;
    }
    return null;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const snapshot = inspectRuntimeOperationLock({ ...roots, recordKey: runtimeOperationKey(lockPath) });
  if (snapshot.status !== 'owned') return null;
  return { sessionId: snapshot.record.owner.sid, pid: snapshot.record.owner.pid,
    host: snapshot.record.owner.host, startToken: snapshot.record.owner.processToken,
    acquiredAt: 'unknown', digest: snapshot.digest };
}

// Compatibility export: implicit reclamation is retired. The registered recovery
// command requires exact observed inode/owner/digest and confirmed process death.
export function tryReclaimStale() { return false; }

export async function withIssueLock(opts, fn) {
  const { issue, projDir, timeoutMs = ISSUE_LOCK_DEFAULT_RETRY_MS,
    retries = ISSUE_LOCK_DEFAULT_RETRIES } = opts || {};
  const token = issueLockToken(issue);
  if (!/^[1-9][0-9]*$/.test(token)) throw new Error('withIssueLock: issue is required');
  if (!projDir) throw new Error('withIssueLock: projDir is required');
  const file = issueLockPath(token, projDir);
  const roots = runtimeWriterRootsForPath(file);
  const key = roots.projectRoot + '#' + token;
  const own = heldContext.getStore()?.get(key);
  if ((own && observedProof(own, { allowOwn: true, projectRoot: roots.projectRoot })) ||
      inheritedProof(token, process.env, roots.projectRoot))
    return withRuntimeWrite(file, fn);

  try {
    return await withLock(file, async () => {
      const recordKey = runtimeOperationKey(file);
      const snapshot = inspectRuntimeOperationLock({ ...roots, recordKey });
      const proof = { schema: 'aitm.issue-lock-proof/v1', issue: token,
        projectRoot: roots.projectRoot, recordKey, digest: snapshot.digest };
      if (!observedProof(proof, { allowOwn: true })) throw new Error('Issue operation ownership unavailable');
      const priorFlag = process.env[ISSUE_LOCK_HELD_ENV];
      const priorProof = process.env[ISSUE_LOCK_PROOF_ENV];
      process.env[ISSUE_LOCK_HELD_ENV] = token;
      process.env[ISSUE_LOCK_PROOF_ENV] = JSON.stringify(proof);
      const scope = new Map(heldContext.getStore() || []);
      scope.set(key, proof);
      try { return await heldContext.run(scope, fn); }
      finally {
        if (priorFlag === undefined) delete process.env[ISSUE_LOCK_HELD_ENV];
        else process.env[ISSUE_LOCK_HELD_ENV] = priorFlag;
        if (priorProof === undefined) delete process.env[ISSUE_LOCK_PROOF_ENV];
        else process.env[ISSUE_LOCK_PROOF_ENV] = priorProof;
      }
    }, { timeoutMs: timeoutMs * (retries + 1), retries: 0 });
  } catch (error) {
    if (error.code !== 'RUNTIME_MIGRATION_BUSY') throw error;
    const holder = readIssueLockHolder(file);
    throw new IssueLockError('issue ' + token + ' locked by session ' +
      (holder?.sessionId || 'unknown') + ' (held since ' + (holder?.acquiredAt || 'unknown') + ')',
      { issue, holder });
  }
}
