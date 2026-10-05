// cspell:ignore boottime
// Internal revision-domain primitives. No production route enables this module.
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

export function revisionFailure(code) {
  throw new Error(code);
}
export function normalizeRepository(repository) {
  if (typeof repository !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repository))
    revisionFailure('domain-repository');
  return repository.toLowerCase();
}
function inspect(worktree) {
  const git = (...args) =>
    execFileSync('git', ['-C', worktree, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const origin = git('remote', 'get-url', 'origin');
  const match = /(?:github\.com[/:])([^/]+\/[^/]+?)(?:\.git)?$/.exec(origin);
  if (!match) revisionFailure('domain-repository-unavailable');
  let bootId;
  if (process.platform === 'linux')
    bootId = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  else if (process.platform === 'darwin')
    bootId = execFileSync('sysctl', ['-n', 'kern.boottime'], { encoding: 'utf8' }).trim();
  else revisionFailure('domain-host-unsupported');
  return {
    repository: normalizeRepository(match[1]),
    commonDirectory: fs.realpathSync(
      git('rev-parse', '--path-format=absolute', '--git-common-dir')
    ),
    hostId: `host-${createHash('sha256').update(os.hostname()).digest('hex')}`,
    bootId,
  };
}
export function revisionRuntime(ports = {}) {
  return {
    fs,
    configRoot: path.join(os.homedir(), '.ai-task-manager', 'criteria-revision-domains'),
    worktree: process.cwd(),
    inspect,
    pid: process.pid,
    nonce: randomUUID,
    liveness(pid) {
      try {
        process.kill(pid, 0);
        return 'alive';
      } catch (e) {
        return e.code === 'ESRCH' ? 'dead' : e.code === 'EPERM' ? 'alive' : 'unknown';
      }
    },
    observePending: () => null,
    ...ports,
  };
}
export function domainStorage(domain) {
  return path.join(
    domain.commonDirectory,
    'aitm',
    'criteria-revision',
    createHash('sha256').update(domain.repository).digest('hex')
  );
}
function registrationPath(repository, p) {
  return path.join(p.configRoot, createHash('sha256').update(repository).digest('hex') + '.json');
}
function readRegistration(repository, p) {
  try {
    const d = JSON.parse(p.fs.readFileSync(registrationPath(repository, p), 'utf8'));
    if (
      d.schema !== 'aitm.revision-domain/v1' ||
      d.repository !== repository ||
      Object.keys(d).sort().join(',') !== 'bootId,commonDirectory,epoch,hostId,repository,schema' ||
      ![d.bootId, d.commonDirectory, d.epoch, d.hostId].every(
        (x) => typeof x === 'string' && x.length > 0
      )
    )
      revisionFailure('domain-corrupt');
    return d;
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
export function atomicRevisionJson(file, value, p) {
  p.fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.' + p.nonce() + '.tmp';
  let failure;
  try {
    p.fs.writeFileSync(temp, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 });
    p.fs.renameSync(temp, file);
  } catch (error) {
    failure = error;
  }
  try {
    p.fs.unlinkSync(temp);
  } catch (error) {
    if (error.code !== 'ENOENT' && !failure) failure = error;
  }
  if (failure) throw failure;
}
function pendingRefusal(d, p) {
  const pending = p.observePending(d);
  if (pending === true) revisionFailure('domain-pending');
  if (pending !== false) revisionFailure('domain-pending-unknown');
}
export function registerRevisionDomain(
  { repository, commonDir, host, quiescenceConfirmed },
  ports = {}
) {
  const p = revisionRuntime(ports),
    repo = normalizeRepository(repository),
    actual = p.inspect(p.worktree);
  if (quiescenceConfirmed !== true) revisionFailure('quiescence-required');
  if (
    actual.repository !== repo ||
    p.fs.realpathSync(commonDir) !== actual.commonDirectory ||
    host !== actual.hostId
  )
    revisionFailure('domain-runtime-mismatch');
  p.fs.mkdirSync(p.configRoot, { recursive: true, mode: 0o700 });
  const guard = registrationPath(repo, p) + '.lock';
  try {
    p.fs.mkdirSync(guard, { mode: 0o700 });
  } catch (e) {
    if (e.code === 'EEXIST') revisionFailure('domain-registration-held');
    throw e;
  }
  try {
    const old = readRegistration(repo, p);
    if (old && (old.hostId !== actual.hostId || old.commonDirectory !== actual.commonDirectory))
      revisionFailure('domain-mismatch');
    const d = {
      schema: 'aitm.revision-domain/v1',
      repository: repo,
      hostId: actual.hostId,
      commonDirectory: actual.commonDirectory,
      bootId: actual.bootId,
      epoch: p.nonce(),
    };
    atomicRevisionJson(registrationPath(repo, p), d, p);
    return Object.freeze(d);
  } finally {
    p.fs.rmdirSync(guard);
  }
}
export function resolveRevisionDomain(context, ports = {}) {
  const p = revisionRuntime(ports),
    repo = normalizeRepository(context.repository),
    d = readRegistration(repo, p);
  if (!d) return null;
  const actual = p.inspect(p.worktree);
  if (context.enabled === false) {
    pendingRefusal(d, p);
    revisionFailure('domain-disable-requires-registration');
  }
  if (
    actual.repository !== repo ||
    actual.hostId !== d.hostId ||
    actual.commonDirectory !== d.commonDirectory
  ) {
    pendingRefusal(d, p);
    revisionFailure('domain-mismatch');
  }
  if (actual.bootId !== d.bootId) revisionFailure('domain-restart');
  if (context.domain && JSON.stringify(context.domain) !== JSON.stringify(d))
    revisionFailure('domain-mismatch');
  return Object.freeze(d);
}
