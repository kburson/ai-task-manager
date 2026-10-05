// @story #1853
// The collector is read-only and transport-neutral. Mutation is quarantined to
// opaque, module-owned memory stores until the production fences are installed.
import path from 'node:path';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { validateRevisionObservation, exactKeys, revisionError } from './schema.mjs';
import {
  parseRevisionEvent,
  renderRevisionEvent,
  readRevisionEnvelope,
  withRevisionValidation,
} from './records.mjs';
import { reduceRevisionEvents } from './reducer.mjs';
import { registerRevisionDomain } from './domain.mjs';
import { withRevisionInterlock, assertRevisionCapability } from './interlock.mjs';
import { publishAdmission, readAdmission } from './admission.mjs';
const memories = new WeakMap();
const clone = (value) => structuredClone(value);
function memory(backend) {
  const m = memories.get(backend);
  if (!m) revisionError('production-quarantined');
  return m;
}
export function assertRevisionMemory(backend) {
  memory(backend);
  return true;
}
function checkpoint(m, step, when) {
  if (m[when] === step) {
    m[when] = null;
    throw new Error(`interrupted:${when}:${step}`);
  }
}
function operation(m, step, fn) {
  checkpoint(m, step, 'failBefore');
  const value = fn();
  m.effects.push(step);
  checkpoint(m, step, 'failAfter');
  return clone(value);
}
// Complete in-memory filesystem for the real interlock/admission algorithms.
// None of these paths are ever passed to the host filesystem.
function memoryPorts(observation) {
  const files = new Map(),
    dirs = new Set(['/']);
  let serial = 0;
  const error = (code) => Object.assign(new Error(code), { code });
  const fs = {
    mkdirSync(p, o = {}) {
      p = path.resolve(p);
      if (dirs.has(p)) {
        if (!o.recursive) throw error('EEXIST');
        return;
      }
      if (o.recursive) fs.mkdirSync(path.dirname(p), o);
      else if (!dirs.has(path.dirname(p))) throw error('ENOENT');
      dirs.add(p);
    },
    readFileSync(p) {
      p = path.resolve(p);
      if (!files.has(p)) throw error('ENOENT');
      return files.get(p);
    },
    writeFileSync(p, v, o = {}) {
      p = path.resolve(p);
      if (o.flag === 'wx' && files.has(p)) throw error('EEXIST');
      if (!dirs.has(path.dirname(p))) throw error('ENOENT');
      files.set(p, String(v));
    },
    renameSync(a, b) {
      a = path.resolve(a);
      b = path.resolve(b);
      if (!files.has(a)) throw error('ENOENT');
      files.set(b, files.get(a));
      files.delete(a);
    },
    unlinkSync(p) {
      if (!files.delete(path.resolve(p))) throw error('ENOENT');
    },
    rmdirSync(p) {
      p = path.resolve(p);
      if ([...files.keys(), ...dirs].some((x) => x.startsWith(p + '/'))) throw error('ENOTEMPTY');
      if (!dirs.delete(p)) throw error('ENOENT');
    },
    realpathSync: (p) => path.resolve(p),
    readdirSync(p) {
      const start = path.resolve(p) + '/';
      return [
        ...new Set(
          [...files.keys(), ...dirs]
            .filter((x) => x.startsWith(start))
            .map((x) => x.slice(start.length).split('/')[0])
        ),
      ];
    },
  };
  fs.mkdirSync(observation.writerDomain.commonDirectory, { recursive: true });
  return {
    fs,
    configRoot: '/revision-memory-config',
    worktree: observation.executor.worktree,
    inspect: () => ({
      repository: observation.repository.toLowerCase(),
      ...observation.writerDomain,
      bootId: 'memory-boot',
    }),
    pid: 1,
    nonce: () => `memory-${++serial}`,
    liveness: () => 'alive',
    observePending: () => false,
  };
}
export function createRevisionMemory(input) {
  canonicalRecordJson(input);
  exactKeys(input, ['observation', 'comments', 'hostMessages']);
  validateRevisionObservation(input.observation);
  if (!Array.isArray(input.comments) || !Array.isArray(input.hostMessages))
    revisionError('memory-input');
  const m = {
    ...clone(input),
    effects: [],
    failBefore: null,
    failAfter: null,
    pageSize: 100,
    pageFault: null,
    lifecycleTransition: false,
    supportedWriters: true,
  };
  m.ports = memoryPorts(m.observation);
  m.domain = registerRevisionDomain(
    {
      repository: m.observation.repository,
      commonDir: m.observation.writerDomain.commonDirectory,
      host: m.observation.writerDomain.hostId,
      quiescenceConfirmed: true,
    },
    m.ports
  );
  const backend = {
    get observation() {
      return clone(m.observation);
    },
    get comments() {
      return clone(m.comments);
    },
    get effects() {
      return [...m.effects];
    },
    get createdEvents() {
      const records = m.comments
        .map((c) => ({ eventId: readRevisionEnvelope(c.body)?.eventId, bytes: c.body }))
        .filter((r) => r.eventId);
      return records.map((r) => parseRevisionEvent(r.bytes, { records }));
    },
    get admission() {
      return readAdmission(
        { repository: m.observation.repository, issue: m.observation.issue },
        m.ports
      );
    },
    set failBefore(value) {
      if (value !== null && typeof value !== 'string') revisionError('fault-data');
      m.failBefore = value;
    },
    set failAfter(value) {
      if (value !== null && typeof value !== 'string') revisionError('fault-data');
      m.failAfter = value;
    },
    set pageSize(value) {
      if (!Number.isInteger(value) || value < 1) revisionError('page-size');
      m.pageSize = value;
    },
    set pageFault(value) {
      canonicalRecordJson(value);
      m.pageFault = clone(value);
    },
    set lifecycleTransition(value) {
      if (typeof value !== 'boolean') revisionError('transition');
      m.lifecycleTransition = value;
    },
    set supportedWriters(value) {
      if (typeof value !== 'boolean') revisionError('writers');
      m.supportedWriters = value;
    },
    replaceAuthority(value) {
      validateRevisionObservation(value);
      m.observation = clone(value);
    },
    addComment(value) {
      exactKeys(value, ['id', 'body']);
      if (typeof value.id !== 'string' || typeof value.body !== 'string') revisionError('comment');
      m.comments.push(clone(value));
    },
    addHostMessage(value) {
      canonicalRecordJson(value);
      m.hostMessages.push(clone(value));
    },
  };
  memories.set(backend, m);
  return Object.freeze(backend);
}
function pageReader(backend) {
  const m = memory(backend);
  return {
    readCommentPage: async ({ page }) =>
      operation(m, 'page-read', () => {
        const start = (page - 1) * m.pageSize,
          comments = m.comments.slice(start, start + m.pageSize);
        return {
          page,
          totalCount: m.comments.length,
          nextPage: start + comments.length < m.comments.length ? page + 1 : null,
          comments,
          ...(m.pageFault ?? {}),
        };
      }),
  };
}
export async function readRevisionChain({ context, transport }) {
  const reader = memories.has(transport) ? pageReader(transport) : transport;
  if (typeof reader?.readCommentPage !== 'function') revisionError('pagination-unavailable');
  let page = 1,
    total = null;
  const seen = new Set(),
    events = [];
  let count = 0;
  while (true) {
    const result = await reader.readCommentPage({
      repository: context.repository,
      issue: context.issue,
      page,
    });
    exactKeys(result, ['page', 'totalCount', 'nextPage', 'comments'], 'pagination-shape');
    if (
      result.page !== page ||
      !Number.isSafeInteger(result.totalCount) ||
      result.totalCount < 0 ||
      !Array.isArray(result.comments) ||
      (total !== null && result.totalCount !== total)
    )
      revisionError('pagination-incomplete');
    total = result.totalCount;
    for (const comment of result.comments) {
      exactKeys(comment, ['id', 'body'], 'comment-shape');
      if (typeof comment.id !== 'string' || !comment.id || seen.has(comment.id))
        revisionError('duplicate-comment');
      seen.add(comment.id);
      count++;
      const event = readRevisionEnvelope(comment.body);
      if (event) {
        if (event.repository !== context.repository || event.issue !== context.issue)
          revisionError('event-scope');
        events.push({ event, bytes: comment.body });
      }
    }
    if (count > total) revisionError('pagination-count');
    if (result.nextPage === null) {
      if (count !== total) revisionError('pagination-incomplete');
      break;
    }
    if (result.nextPage !== page + 1 || result.comments.length === 0 || count >= total)
      revisionError('pagination-incomplete');
    page = result.nextPage;
  }
  return withRevisionValidation(() => {
    // Enumeration order is not an authority. Reconstruct the unique chain from
    // predecessor identities, detecting disconnected components and forks.
    const byId = new Map(),
      successors = new Map();
    const records = events.map(({ event, bytes }) => ({ eventId: event.eventId, bytes }));
    for (const stored of events) {
      const event = parseRevisionEvent(stored.bytes, { records });
      if (event.authorizer === null) revisionError('non-publishable-event');
      if (byId.has(event.eventId)) revisionError('duplicate-event');
      if (successors.has(event.predecessorEventId)) revisionError('event-fork');
      byId.set(event.eventId, event);
      successors.set(event.predecessorEventId, event);
    }
    const ordered = [];
    let next = successors.get(null);
    while (next) {
      if (ordered.length >= events.length) revisionError('event-cycle');
      ordered.push(next);
      next = successors.get(next.eventId);
    }
    if (ordered.length !== events.length) revisionError('event-chain-incomplete');
    return reduceRevisionEvents(ordered);
  });
}
export function readMemoryAuthority(backend, context) {
  const m = memory(backend);
  return operation(m, 'authority-read', () => {
    const o = m.observation;
    if (
      o.writerDomain.hostId !== m.domain.hostId ||
      o.writerDomain.commonDirectory !== m.domain.commonDirectory ||
      o.repository.toLowerCase() !== m.domain.repository
    )
      revisionError('runtime-domain-drift');
    if (context.repository !== o.repository || context.issue !== o.issue)
      revisionError('authority-scope');
    if (canonicalRecordJson(context.executor) !== canonicalRecordJson(o.executor))
      revisionError('authority-executor');
    if (m.lifecycleTransition || !m.supportedWriters) revisionError('authority-unavailable');
    return o;
  });
}
export function loadMemoryUserMessage(backend, source) {
  const m = memory(backend),
    matches = m.hostMessages.filter(
      (x) => x.id === source.messageId && x.sessionId === source.sessionId
    );
  if (matches.length !== 1) revisionError('host-message-unavailable');
  return clone(matches[0]);
}
export async function withMemoryInterlock(backend, context, fn) {
  const m = memory(backend);
  return withRevisionInterlock(
    { ...context, issues: [context.issue], domain: m.domain },
    fn,
    m.ports
  );
}
export function assertMemoryCapability(backend, capability, context) {
  const m = memory(backend);
  assertRevisionCapability(capability, { ...context, issues: [context.issue] }, m.ports);
}
export async function publishMemoryDeny(backend, capability, context) {
  const m = memory(backend);
  assertMemoryCapability(backend, capability, context);
  const entry = await publishAdmission(
    { capability, observation: { issue: context.issue }, state: 'deny' },
    m.ports
  );
  m.effects.push('admission-deny');
  return entry;
}
export async function appendMemoryEvent({ backend, capability, context, event }) {
  const m = memory(backend);
  assertMemoryCapability(backend, capability, context);
  const bytes = renderRevisionEvent(event),
    chain = await readRevisionChain({ context, transport: backend });
  const found = chain.events.find((x) => x.eventId === event.eventId);
  if (found) {
    if (renderRevisionEvent(found) !== bytes) revisionError('event-retry-bytes');
    return chain;
  }
  if (chain.head !== event.predecessorEventId) revisionError('event-head-drift');
  reduceRevisionEvents([...chain.events, event]);
  operation(m, `event-write:${event.type}`, () => {
    m.comments.push({ id: `memory-comment-${m.comments.length + 1}`, body: bytes });
    return null;
  });
  operation(m, `event-readback:${event.type}`, () => {
    const matches = m.comments.filter((c) => c.body === bytes);
    if (matches.length !== 1) revisionError('event-readback');
    return matches[0];
  });
  const verified = await readRevisionChain({ context, transport: backend });
  if (verified.head !== event.eventId) revisionError('event-readback-head');
  return verified;
}
export function readMemoryBody(backend, step = 'body-read') {
  const m = memory(backend);
  return operation(m, step, () => m.observation.body.bytes);
}
export function writeMemoryBody({ backend, capability, context, before, after, version }) {
  const m = memory(backend);
  assertMemoryCapability(backend, capability, context);
  return operation(m, 'body-write', () => {
    if (m.observation.body.bytes !== before) revisionError('body-conflict');
    m.observation.body = { bytes: after, version };
    return null;
  });
}
