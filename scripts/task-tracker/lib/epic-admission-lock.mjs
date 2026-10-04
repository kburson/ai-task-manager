// @story #1872
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { hostname } from 'node:os';
import { discoverRankWavePhysical } from './epic-rank-wave-bindings.mjs';

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
    discoverRankWavePhysical(projectDir).commonDir,
    'aitm-admission',
    `epic-${Number(epic)}.lock`
  );
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
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const current = holder(lock);
      if (!current && Date.now() - started >= Math.min(100, timeoutMs)) {
        throw new EpicAdmissionLockError(
          'admission-lock-unknown',
          'unknown ownership; no eviction'
        );
      }
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
