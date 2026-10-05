// Strict locking is opt-in. Capabilities never cross public request boundaries.
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fork } from 'node:child_process';
import { validateExecutor } from './schema.mjs';
import { isIssueLockHeld, isIssueLockHeldLocally } from '../../issue-mutator-lock.mjs';
import {
  revisionRuntime,
  resolveRevisionDomain,
  domainStorage,
  normalizeRepository,
  revisionFailure,
  atomicRevisionJson,
} from './domain.mjs';
const active = new AsyncLocalStorage(),
  capabilities = new WeakMap();
const holderSchema = 'aitm.revision-lock-holder/v2';
function issues(context) {
  const list = context.issues ?? [context.issue];
  if (!Array.isArray(list) || !list.length || list.some((x) => !Number.isSafeInteger(x) || x < 1))
    revisionFailure('revision-lock-scope');
  return [...new Set(list)].sort((a, b) => a - b);
}
function holderFile(root, issue) {
  return path.join(root, `${issue}.lock`, 'holder.json');
}
function read(p, file) {
  try {
    return p.fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}
function validDelegation(d) {
  return (
    d === null ||
    (d &&
      typeof d.token === 'string' &&
      d.token.length > 0 &&
      (d.state === 'preparing' ||
        (d.state === 'active' && Number.isSafeInteger(d.pid) && d.pid > 0)))
  );
}
function executorsDead(p, h) {
  return (
    p.liveness(h.pid) === 'dead' &&
    (h.delegation === null ||
      (h.delegation.state === 'active' && p.liveness(h.delegation.pid) === 'dead'))
  );
}
function validHolder(h, domain, issue) {
  return (
    h?.schema === holderSchema &&
    h.repository === domain.repository &&
    h.issue === issue &&
    h.hostId === domain.hostId &&
    Number.isSafeInteger(h.pid) &&
    h.pid > 0 &&
    typeof h.invocation === 'string' &&
    h.invocation.length > 0 &&
    validDelegation(h.delegation)
  );
}
function acquire(p, domain, issue, invocation) {
  const root = path.join(domainStorage(domain), 'locks');
  p.fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const lock = path.join(root, `${issue}.lock`),
    gate = lock + '.acquiring';
  // Every acquirer uses this short gate, including orphan recovery. An uncertain gate
  // remains denied; its age cannot authorize removal.
  try {
    p.fs.mkdirSync(gate, { mode: 0o700 });
  } catch (e) {
    if (e.code === 'EEXIST') revisionFailure('revision-lock-held');
    throw e;
  }
  try {
    try {
      p.fs.mkdirSync(lock, { mode: 0o700 });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const before = read(p, holderFile(root, issue));
      let h;
      try {
        h = JSON.parse(before);
      } catch {
        /* Malformed holder remains unknown and is refused below. */
      }
      if (
        !validHolder(h, domain, issue) ||
        !executorsDead(p, h) ||
        read(p, holderFile(root, issue)) !== before
      )
        revisionFailure('revision-lock-held');
      p.fs.unlinkSync(holderFile(root, issue));
      p.fs.rmdirSync(lock);
      p.fs.mkdirSync(lock, { mode: 0o700 });
    }
    const bytes = JSON.stringify({
      schema: holderSchema,
      repository: domain.repository,
      issue,
      hostId: domain.hostId,
      pid: p.pid,
      invocation,
      epoch: domain.epoch,
      delegation: null,
    });
    try {
      p.fs.writeFileSync(holderFile(root, issue), bytes, { flag: 'wx', mode: 0o600 });
    } catch (e) {
      try {
        p.fs.rmdirSync(lock);
      } catch {
        /* Preserve an uncertain partial holder and surface the original write error. */
      }
      throw e;
    }
    return { file: holderFile(root, issue), lock, bytes };
  } finally {
    p.fs.rmdirSync(gate);
  }
}
function release(p, record) {
  if (read(p, record.file) !== record.bytes) return;
  p.fs.unlinkSync(record.file);
  p.fs.rmdirSync(record.lock);
}
function metadata(capability) {
  const m = capabilities.get(capability);
  if (!m || !m.live || active.getStore() !== capability) revisionFailure('revision-capability');
  if (m.poisoned) revisionFailure('revision-delegation-uncertain');
  if (m.delegation) revisionFailure('revision-delegation-held');
  return m;
}
export function assertRevisionCapability(capability, context, ports) {
  const m = metadata(capability);
  if (
    normalizeRepository(context.repository) !== m.domain.repository ||
    issues(context).some((i) => !m.issues.includes(i))
  )
    revisionFailure('revision-lock-scope');
  if (context.executor && JSON.stringify(context.executor) !== JSON.stringify(m.executor))
    revisionFailure('revision-capability-executor');
  if (m.delegated && !process.connected) revisionFailure('revision-capability-disconnected');
  resolveRevisionDomain({ ...context, domain: m.domain }, ports ?? m.ports);
  for (const record of m.records)
    if (read(m.ports, record.file) !== record.bytes) revisionFailure('revision-capability-holder');
  return true;
}
export function revisionCapabilityContext(capability) {
  const m = metadata(capability);
  assertRevisionCapability(
    capability,
    { repository: m.domain.repository, issues: m.issues },
    m.ports
  );
  return {
    repository: m.domain.repository,
    issues: [...m.issues],
    domain: m.domain,
    executor: m.executor,
  };
}
export function assertRevisionIssueLockOrder(capability, issue) {
  const m = metadata(capability);
  const held = (i) => isIssueLockHeldLocally(i) || m.delegatedIssueLocks?.includes(Number(i));
  if (!held(issue) && m.issues.some((i) => i > Number(issue) && held(i)))
    revisionFailure('revision-lock-order');
}
export function revisionDelegatesIssueLock(capability, issue) {
  return metadata(capability).delegatedIssueLocks?.includes(Number(issue)) === true;
}
export async function withRevisionInterlock(context, fn, ports = {}) {
  if (context.capability) {
    assertRevisionCapability(context.capability, context, ports);
    return await fn(context.capability);
  }
  if (isIssueLockHeld()) revisionFailure('revision-lock-order');
  if (active.getStore()) revisionFailure('revision-lock-held');
  const p = revisionRuntime(ports),
    domain = resolveRevisionDomain(context, p);
  if (!domain) revisionFailure('revision-domain-disabled');
  const scope = issues(context);
  validateExecutor(context.executor);
  const records = [],
    capability = Object.freeze({}),
    m = {
      live: true,
      domain,
      issues: scope,
      executor: structuredClone(context.executor),
      ports: p,
      records,
      delegation: null,
    };
  try {
    for (const issue of scope) records.push(acquire(p, domain, issue, p.nonce()));
    capabilities.set(capability, m);
    return await active.run(capability, () => fn(capability));
  } finally {
    m.live = false;
    const lease = m.delegation;
    if (lease) {
      disconnectDelegate(lease);
      // Disconnect revokes future capability use, but a child may already be
      // inside a synchronous filesystem effect. Only actual process exit proves
      // it cannot finish that effect after a newer owner acquires these locks.
      await lease.exited;
    }
    if (!m.poisoned) for (const record of [...records].reverse()) release(p, record);
  }
}
// Publish every issue before granting the child authority. A failed or partial
// publication poisons this frame; neither normal cleanup nor recovery may infer
// the absence of a delegate from an incomplete ownership transition.
function persistDelegation(m, delegation) {
  try {
    for (const record of m.records) {
      if (read(m.ports, record.file) !== record.bytes)
        revisionFailure('revision-capability-holder');
      const holder = { ...JSON.parse(record.bytes), delegation };
      atomicRevisionJson(record.file, holder, m.ports);
      record.bytes = JSON.stringify(holder) + '\n';
    }
  } catch (error) {
    m.poisoned = true;
    throw error;
  }
}
function disconnectDelegate(lease) {
  if (!lease.child.connected) return;
  try {
    lease.child.disconnect();
  } catch (error) {
    // A channel error is not evidence of process death. Retain the lease until
    // its actual child exit; a child with unknown status continues to fence.
    lease.error ??= error;
  }
}
// A trusted parent launches exactly one child and lends its execution authority
// exclusively until that actual child exits. Parent use and siblings refuse.
// No address, bearer token or environment variable can request delegation.
export async function spawnRevisionDelegate(capability, modulePath, args = []) {
  const m = metadata(capability);
  assertRevisionCapability(capability, { repository: m.domain.repository, issues: m.issues });
  if (m.delegated) revisionFailure('revision-delegation-depth');
  const token = m.ports.nonce();
  persistDelegation(m, { state: 'preparing', token });
  let child;
  try {
    child = fork(modulePath, args, {
      cwd: m.executor.worktree,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
  } catch (error) {
    m.poisoned = true;
    throw error;
  }
  const lease = { child, error: null, exited: null };
  m.delegation = lease;
  lease.exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.on('error', (error) => {
      lease.error ??= error;
      // A failed spawn with no PID never launched a process. IPC/send errors
      // after launch cannot release ownership while that process remains live.
      if (!child.pid) resolve({ code: null, signal: null });
    });
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  let sent = false;
  child.on('message', (message) => {
    if (message?.type !== 'aitm-revision-ready' || sent) return;
    sent = true;
    if (!m.live || m.delegation !== lease) {
      disconnectDelegate(lease);
      return;
    }
    try {
      persistDelegation(m, { state: 'active', pid: child.pid, token });
    } catch (error) {
      lease.error ??= error;
      disconnectDelegate(lease);
      return;
    }
    child.send(
      {
        type: 'aitm-revision-delegation/v1',
        pid: child.pid,
        parentPid: process.pid,
        token,
        domain: m.domain,
        issues: m.issues,
        executor: m.executor,
        records: m.records,
        issueLocks: m.issues.filter(isIssueLockHeldLocally),
      },
      (error) => {
        if (error) lease.error ??= error;
      }
    );
  });
  try {
    const outcome = await lease.exited;
    if (lease.error) throw lease.error;
    if (outcome.code !== 0) throw new Error(`revision-delegate-exit:${outcome.code}:${stderr}`);
  } finally {
    // This path runs only after exit (or a proven failed spawn), never merely
    // after disconnect or an IPC error. The parent can then use its scope again.
    if (!m.poisoned) persistDelegation(m, null);
    if (m.delegation === lease) m.delegation = null;
    disconnectDelegate(lease);
  }
}
export async function withRevisionDelegation(context, fn, ports = {}) {
  if (typeof process.send !== 'function' || !process.connected || active.getStore())
    revisionFailure('revision-delegation-unavailable');
  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('revision-delegation-timeout'));
    }, 5000);
    const receive = (m) => {
      if (m?.type === 'aitm-revision-delegation/v1') {
        cleanup();
        resolve(m);
      }
    };
    const disconnect = () => {
      cleanup();
      reject(new Error('revision-delegation-disconnected'));
    };
    function cleanup() {
      clearTimeout(timer);
      process.off('message', receive);
      process.off('disconnect', disconnect);
    }
    process.on('message', receive);
    process.once('disconnect', disconnect);
    process.send({ type: 'aitm-revision-ready' });
  });
  const p = revisionRuntime(ports),
    domain = resolveRevisionDomain(context, p),
    scope = issues(context);
  if (
    message.pid !== process.pid ||
    message.parentPid !== process.ppid ||
    typeof message.token !== 'string' ||
    !message.token ||
    JSON.stringify(message.domain) !== JSON.stringify(domain) ||
    JSON.stringify(message.executor) !== JSON.stringify(context.executor) ||
    scope.some((i) => !message.issues.includes(i))
  )
    revisionFailure('revision-delegation-binding');
  if (message.records.length !== message.issues.length)
    revisionFailure('revision-delegation-holder');
  for (let i = 0; i < message.records.length; i++) {
    const record = message.records[i],
      issue = message.issues[i];
    const file = holderFile(path.join(domainStorage(domain), 'locks'), issue);
    let h;
    try {
      h = JSON.parse(record.bytes);
    } catch {
      /* Malformed delegated holder is refused by the identity check below. */
    }
    if (
      record.file !== file ||
      read(p, file) !== record.bytes ||
      !validHolder(h, domain, issue) ||
      h.pid !== process.ppid ||
      h.delegation?.state !== 'active' ||
      h.delegation.pid !== process.pid ||
      h.delegation.token !== message.token ||
      p.liveness(h.pid) !== 'alive'
    )
      revisionFailure('revision-delegation-holder');
  }
  const capability = Object.freeze({}),
    m = {
      live: true,
      domain,
      issues: message.issues,
      executor: message.executor,
      ports: p,
      records: message.records,
      delegated: true,
      delegatedIssueLocks: message.issueLocks,
    };
  capabilities.set(capability, m);
  try {
    return await active.run(capability, () => fn(capability));
  } finally {
    m.live = false;
    if (process.connected) process.disconnect();
  }
}
