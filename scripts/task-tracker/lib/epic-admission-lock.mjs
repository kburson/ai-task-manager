// @story #1872
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID, createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  lstatSync,
  readdirSync,
  openSync,
  closeSync,
  fstatSync,
  constants,
  unlinkSync,
  rmdirSync,
} from 'node:fs';
import path from 'node:path';
import { hostname } from 'node:os';
import { discoverRankWaveCommonDir } from './epic-rank-wave-bindings.mjs';

const contexts = new AsyncLocalStorage();
const active = new WeakSet();
export function currentEpicAdmissionLock() {
  return contexts.getStore();
}
export class EpicAdmissionLockError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}
export function admissionLockPath({ projectDir, epic } = {}) {
  if (!Number.isSafeInteger(Number(epic)) || Number(epic) <= 0)
    throw new TypeError('admission-lock: epic');
  return path.join(
    discoverRankWaveCommonDir(projectDir),
    'aitm-admission',
    `epic-${Number(epic)}.lock`
  );
}
function processStatus(value) {
  if (value.host !== hostname()) return 'foreign';
  try {
    process.kill(value.pid, 0);
    return 'live';
  } catch (error) {
    return error.code === 'ESRCH' ? 'dead' : 'unknown';
  }
}
function identity(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino) };
}
function inspectLock({ projectDir, epic }, operation) {
  const lock = admissionLockPath({ projectDir, epic });
  const base = { schema: 'aitm.epic-admission-lock/v1', epic: Number(epic), path: lock };
  let fd;
  try {
    const namespace = lstatSync(path.dirname(lock));
    if (!namespace.isDirectory() || namespace.isSymbolicLink())
      return operation({ ...base, status: 'unknown' });
    const directory = lstatSync(lock);
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      readdirSync(lock).join() !== 'holder.json'
    )
      return operation({ ...base, status: 'unknown' });
    fd = openSync(path.join(lock, 'holder.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
    const file = fstatSync(fd);
    if (!file.isFile()) return operation({ ...base, status: 'unknown' });
    const bytes = readFileSync(fd, 'utf8');
    const value = JSON.parse(bytes);
    if (
      !Number.isSafeInteger(value.pid) ||
      value.pid <= 0 ||
      typeof value.host !== 'string' ||
      !value.host ||
      typeof value.token !== 'string' ||
      !value.token
    )
      return operation({ ...base, status: 'unknown' });
    const observation = {
      ...base,
      status: processStatus(value),
      holder: value,
      identity: {
        directory: identity(directory),
        file: identity(file),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    };
    return operation(observation, fd);
  } catch (error) {
    if (error.code === 'ENOENT') return operation({ ...base, status: 'absent' });
    return operation({ ...base, status: 'unknown' });
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
export function inspectEpicAdmissionLock(args) {
  return inspectLock(args, (observation) => observation);
}
export function releaseEpicAdmissionLock({ projectDir, epic, observation }) {
  return inspectLock({ projectDir, epic }, (current, fd) => {
    const refusal = { status: 'blocked', code: 'admission-lock-recovery-unverified' };
    if (current.status !== 'dead' || !isDeepStrictEqual(current, observation)) return refusal;
    const file = path.join(current.path, 'holder.json');
    // Retain the original read-only descriptor through the effect. Equal
    // bytes on a replacement inode are not the observed ownership evidence.
    try {
      if (
        !isDeepStrictEqual(identity(lstatSync(current.path)), current.identity.directory) ||
        !isDeepStrictEqual(identity(lstatSync(file)), identity(fstatSync(fd))) ||
        processStatus(current.holder) !== 'dead'
      )
        return refusal;
      unlinkSync(file);
      rmdirSync(current.path);
      return { status: 'released', epic: Number(epic), holder: current.holder };
    } catch {
      return refusal;
    }
  });
}

export function assertEpicAdmissionLock({ projectDir, epic, context } = {}) {
  if (
    !context ||
    contexts.getStore() !== context ||
    !active.has(context) ||
    context.path !== admissionLockPath({ projectDir, epic })
  ) {
    throw new EpicAdmissionLockError(
      'admission-lock-context',
      'exact current parent lock context required'
    );
  }
  return context;
}
function holder(lock) {
  try {
    if (!lstatSync(lock).isDirectory() || lstatSync(lock).isSymbolicLink()) return null;
    const value = JSON.parse(readFileSync(path.join(lock, 'holder.json'), 'utf8'));
    return Number.isSafeInteger(value.pid) &&
      value.pid > 0 &&
      typeof value.token === 'string' &&
      value.token &&
      typeof value.host === 'string' &&
      value.host
      ? value
      : null;
  } catch {
    return null;
  }
}
export async function withEpicAdmissionLock(
  { projectDir, epic, context, timeoutMs = 5000 } = {},
  operation
) {
  if (
    typeof operation !== 'function' ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 0 ||
    timeoutMs > 60000
  ) {
    throw new TypeError('admission-lock: operation or timeout');
  }
  if (context) {
    assertEpicAdmissionLock({ projectDir, epic, context });
    return operation(context);
  }
  const lock = admissionLockPath({ projectDir, epic });
  mkdirSync(path.dirname(lock), { recursive: true });
  if (lstatSync(path.dirname(lock)).isSymbolicLink())
    throw new EpicAdmissionLockError('admission-lock-unknown', 'symlink namespace');
  const started = Date.now();
  let unknownSince = null;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const current = holder(lock);
      unknownSince = current ? null : (unknownSince ?? Date.now());
      if (!current && Date.now() - unknownSince >= Math.min(100, timeoutMs)) {
        throw new EpicAdmissionLockError(
          'admission-lock-unknown',
          'unknown ownership; no eviction'
        );
      }
      if (!current && Date.now() - started >= timeoutMs)
        throw new EpicAdmissionLockError(
          'admission-lock-unknown',
          'unknown ownership; no eviction'
        );
      if (Date.now() - started >= timeoutMs)
        throw new EpicAdmissionLockError(
          'admission-lock-timeout',
          'parent admission already held; no eviction'
        );
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  const token = randomUUID();
  const claim = Object.freeze({ path: lock, epic: Number(epic), token });
  let value, failure;
  try {
    writeFileSync(
      path.join(lock, 'holder.json'),
      JSON.stringify({
        pid: process.pid,
        host: hostname(),
        token,
        createdAt: new Date().toISOString(),
      }),
      { flag: 'wx' }
    );
    active.add(claim);
    value = await contexts.run(claim, () => operation(claim));
  } catch (error) {
    failure = error;
  } finally {
    active.delete(claim);
    const current = holder(lock);
    if (current?.token === token && current.pid === process.pid && current.host === hostname())
      rmSync(lock, { recursive: true });
    else
      failure = new EpicAdmissionLockError(
        'admission-lock-ownership-changed',
        'preserving unverified lock'
      );
  }
  if (failure) throw failure;
  return value;
}
