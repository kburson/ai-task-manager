import { validateMemoryPlanWrite } from './plan-approval.mjs';
import { appendCapsule } from '../github-records/capsule-chain.mjs';
import { parseAitmRecord } from '../github-records/record-envelope.mjs';
import {
  canonicalRecords,
  assertCanonicalAuthority,
  canonicalPrefixVectors,
} from './canonical.mjs';
import { deriveResourceVector } from './proposal.mjs';
import { hashBytes } from './schema.mjs';
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
  exactKeys(input, [
    'observation',
    'comments',
    'hostMessages',
    ...(Object.hasOwn(input, 'planning') ? ['planning'] : []),
  ]);
  if (input.planning !== undefined) validatePlanningSnapshot(input.planning);
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
    replacePlanning(value) {
      validatePlanningSnapshot(value);
      m.planning = clone(value);
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

export function memoryNow(backend) {
  memory(backend);
  return new Date().toISOString();
}
export async function writeMemoryCanonical({ backend, capability, context, proposal, write }) {
  assertMemoryCapability(backend, capability, context);
  const m = memory(backend),
    o = m.observation;
  const chain = await readRevisionChain({ context, transport: backend });
  if (
    chain.status !== 'pending' ||
    canonicalRecordJson(chain.effective?.proposal) !== canonicalRecordJson(proposal)
  )
    revisionError('canonical-effective-event');
  if (
    !proposal.writeSet.some(
      (planned) => canonicalRecordJson(planned) === canonicalRecordJson(write)
    )
  )
    revisionError('canonical-write-plan');
  assertCanonicalAuthority(o, memoryNow(backend));
  const vector = { ...deriveResourceVector(o), revisionEventHead: null };
  const prefixes = canonicalPrefixVectors(proposal, null);
  const prefix = prefixes.findLastIndex(
    (candidate) => canonicalRecordJson(candidate) === canonicalRecordJson(vector)
  );
  const ordinal = proposal.writeSet
    .filter((item) => item.resource !== 'revision-record')
    .findIndex((item) => canonicalRecordJson(item) === canonicalRecordJson(write));
  if (prefix < ordinal || prefix < 0) revisionError('canonical-write-order');
  if (write.resource === 'capsule') {
    const existing = o.canonicalArchive.records.find((r) => r.recordId === write.recordId);
    if (existing) {
      if (existing.bytes !== write.afterBytes) revisionError('canonical-capsule-conflict');
      return;
    }
    if (hashBytes(o.capsule.bytes) !== write.beforeHash) revisionError('canonical-capsule-before');
    checkpoint(m, 'capsule-write', 'failBefore');
    const parsed = parseAitmRecord({
      commentNodeId: write.recordId,
      body: write.afterBytes,
      expectedRepository: context.repository,
      expectedIssue: context.issue,
    });
    await appendCapsule({
      repository: context.repository,
      issue: context.issue,
      expectedHeadRecordId: o.capsule.head,
      candidate: {
        envelope: parsed.envelope,
        visibleMarkdown: 'AITM criteria contract amendment.\n',
      },
      deps: {
        listIssueComments: async () => canonicalRecords(o),
        createIssueComment: async ({ body }) => {
          if (body !== write.afterBytes) revisionError('canonical-capsule-bytes');
          o.canonicalArchive.records.push({ recordId: write.recordId, bytes: body });
          o.capsule = { head: write.recordId, bytes: body };
          m.effects.push('capsule-write');
          return { commentNodeId: write.recordId };
        },
        readBackComment: async () => ({
          ...parseAitmRecord({
            commentNodeId: write.recordId,
            body: o.capsule.bytes,
            expectedRepository: context.repository,
            expectedIssue: context.issue,
          }),
          body: o.capsule.bytes,
        }),
      },
    });
    checkpoint(m, 'capsule-write', 'failAfter');
    operation(m, 'capsule-readback', () => {
      if (o.capsule.bytes !== write.afterBytes) revisionError('canonical-capsule-readback');
      return true;
    });
    return;
  }
  const field =
    write.resource === 'delivery-contract'
      ? 'contract'
      : write.resource === 'proof-projection'
        ? 'proof'
        : null;
  if (!field) revisionError('canonical-write-resource');
  const bytes = () =>
    field === 'contract'
      ? o.contract.bytes
      : canonicalRecordJson({
          proofRecords: o.proofRecords,
          criterionBindings: o.criterionBindings,
        });
  if (hashBytes(bytes()) === write.afterHash) return;
  if (hashBytes(bytes()) !== write.beforeHash) revisionError('canonical-projection-before');
  operation(m, field + '-write', () => {
    if (field === 'contract')
      o.contract = { value: JSON.parse(write.afterBytes), bytes: write.afterBytes };
    else Object.assign(o, JSON.parse(write.afterBytes));
    return true;
  });
  operation(m, field + '-readback', () => {
    if (hashBytes(bytes()) !== write.afterHash) revisionError('canonical-projection-readback');
    return true;
  });
}

export async function persistMemoryPlanApproval({ backend, token, before, after, audit, record }) {
  const context = validateMemoryPlanWrite(token, { backend, before, after, audit, record }),
    m = memory(backend);
  if (canonicalRecordJson(m.observation) !== canonicalRecordJson(before))
    revisionError('plan-before');
  operation(m, 'plan-audit-write', () => {
    m.comments.push({ id: 'memory-plan-audit-' + record.recordId, body: audit });
    return true;
  });
  if (before.sourceKind === 'canonical-contract') {
    assertCanonicalAuthority(before, memoryNow(backend), 'plan-approve');
    await appendCapsule({
      repository: context.repository,
      issue: context.issue,
      expectedHeadRecordId: before.capsule.head,
      candidate: { envelope: record.envelope, visibleMarkdown: 'AITM current Plan approval.\n' },
      deps: {
        listIssueComments: async () => canonicalRecords(m.observation),
        createIssueComment: async ({ body }) =>
          operation(m, 'plan-capsule-write', () => {
            if (body !== record.bytes) revisionError('plan-record-bytes');
            m.observation.canonicalArchive.records.push({ recordId: record.recordId, bytes: body });
            m.observation.capsule = { head: record.recordId, bytes: body };
            return { commentNodeId: record.recordId };
          }),
        readBackComment: async () => ({
          ...parseAitmRecord({
            commentNodeId: record.recordId,
            body: m.observation.capsule.bytes,
            expectedRepository: context.repository,
            expectedIssue: context.issue,
          }),
          body: m.observation.capsule.bytes,
        }),
      },
    });
    operation(m, 'plan-contract-write', () => {
      m.observation.contract = clone(after.contract);
      return true;
    });
    operation(m, 'plan-proof-write', () => {
      m.observation.proofRecords = clone(after.proofRecords);
      return true;
    });
  }
  operation(m, 'plan-body-write', () => {
    m.observation.body = clone(after.body);
    m.planning.bodyHash = hashBytes(after.body.bytes);
    return true;
  });
  operation(m, 'plan-readback', () => {
    if (canonicalRecordJson(m.observation) !== canonicalRecordJson(after))
      revisionError('plan-readback');
    return true;
  });
}

function validatePlanningSnapshot(value) {
  canonicalRecordJson(value);
  exactKeys(
    value,
    ['schema', 'repository', 'issue', 'bodyHash', 'epicChildren', 'trunkSha', 'cfg'],
    'planning-snapshot'
  );
  if (
    value.schema !== 'aitm.memory-planning/v1' ||
    value.cfg === null ||
    typeof value.cfg !== 'object' ||
    Array.isArray(value.cfg) ||
    value.cfg.repo !== value.repository ||
    typeof value.repository !== 'string' ||
    !Number.isSafeInteger(value.issue) ||
    !/^sha256:[0-9a-f]{64}$/.test(value.bodyHash) ||
    !Array.isArray(value.epicChildren) ||
    (value.trunkSha !== null && !/^[0-9a-f]{40}$/.test(value.trunkSha))
  )
    revisionError('planning-snapshot');
  for (const child of value.epicChildren) {
    exactKeys(child, ['number', 'rank', 'blockedBy', 'state', 'closeReason'], 'planning-child');
    if (
      !Number.isSafeInteger(child.number) ||
      child.number <= 0 ||
      !Number.isFinite(child.rank) ||
      !Array.isArray(child.blockedBy) ||
      child.blockedBy.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      !['open', 'closed'].includes(child.state) ||
      ![null, 'completed', 'not_planned'].includes(child.closeReason)
    )
      revisionError('planning-child');
  }
}
export function readMemoryPlanning(backend, context) {
  const m = memory(backend),
    value = m.planning;
  if (!value) revisionError('planning-snapshot-unavailable');
  validatePlanningSnapshot(value);
  if (
    value.repository !== context.repository ||
    value.issue !== context.issue ||
    value.bodyHash !== hashBytes(m.observation.body.bytes)
  )
    revisionError('planning-snapshot-stale');
  return clone(value);
}
