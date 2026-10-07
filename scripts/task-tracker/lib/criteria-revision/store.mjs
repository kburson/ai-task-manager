import { validateNativeStageJournal, nativeStageTimingPages } from './stage-execution.mjs';
import { readNativeChecklistOperation } from '../../verbs/check.mjs';
import { reconstructHistoricalPlanSource } from '../story-intent-source.mjs';
import { withMemoryTransportQuarantine } from './transport-quarantine.mjs';
import { validateNativeSourceJournal } from './source-correction.mjs';
import { readNativeSourceWrite } from './policy.mjs';
import { validateNativeProofJournal } from './proof-execution.mjs';
import { readNativeVerifierExecution } from '../evidence-runner.mjs';
import { observeRevision } from './engine.mjs';
import { validateMemoryPlanWrite, readCurrentMemoryPlanApproval } from './plan-approval.mjs';
import { appendCapsule } from '../github-records/capsule-chain.mjs';
import { parseAitmRecord } from '../github-records/record-envelope.mjs';
import {
  canonicalRecords,
  assertCanonicalAuthority,
  canonicalPrefixVectors,
  sameRevisionObservation,
} from './canonical.mjs';
import { deriveResourceVector, readRevisionDefinitions, hashSemanticContract } from './proposal.mjs';
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
import { registerRevisionDomain, atomicRevisionJson, domainStorage } from './domain.mjs';
import { withRevisionInterlock, assertRevisionCapability } from './interlock.mjs';
import { publishAdmission, observeAdmission, readAdmission, validPendingSource } from './admission.mjs';
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
// Closed fixture read data. Native readers still validate every response and
// derive all semantic results; retaining JSON cannot issue execution authority.
// Shape-only historical DATA validation. No memory construction, original-read
// branding, current eligibility, callbacks, or returned readiness is provided.
export function assertNativeLifecycleSourceData(input) {
  canonicalRecordJson(input);
  exactKeys(input, ['source', 'observation'], 'lifecycle-source-input');
  validateRevisionObservation(input.observation);
  validateLifecycleSources(input.source, input.observation);
}

function validateLifecycleSources(value, observation) {
  const fail = () => revisionError('lifecycle-source');
  const keys = (object, fields) => {
    try { exactKeys(object, fields); } catch { fail(); }
  };
  keys(value, ['schema', 'repository', 'issue', 'bodyHash', 'remote']);
  if (value.schema !== 'aitm.memory-lifecycle/v1' || value.repository !== observation.repository ||
      value.issue !== observation.issue || value.bodyHash !== hashBytes(observation.body.bytes)) fail();
  keys(value.remote, ['dependencies', 'assignments', 'parent', 'children', 'comments', 'disposition',
    ...(Object.hasOwn(value.remote, 'identity') ? ['identity'] : []),
    ...(Object.hasOwn(value.remote, 'timing') ? ['timing'] : []),
    ...(Object.hasOwn(value.remote, 'stageComments') ? ['stageComments'] : []),
    ...(Object.hasOwn(value.remote, 'stageItem') ? ['stageItem'] : []),
    ...(Object.hasOwn(value.remote, 'stageStatus') ? ['stageStatus'] : [])]);
  if (Object.hasOwn(value.remote, 'stageStatus')) {
    const source = value.remote.stageStatus;
    keys(source, ['schema', 'reads']);
    if (source.schema !== 'aitm.native-stage-status-source/v1' || !Array.isArray(source.reads) ||
        source.reads.length < 1 || source.reads.length > 3) fail();
    const [owner, repo] = observation.repository.split('/');
    for (const [index, pair] of source.reads.entries()) {
      keys(pair, ['attempt', 'request', 'response']); keys(pair.request, ['query', 'variables']);
      keys(pair.request.variables, ['owner', 'repo', 'issue']); keys(pair.response, ['stdout', 'stderr', 'exitCode']);
      if (pair.attempt !== index + 1 || typeof pair.request.query !== 'string' || !pair.request.query ||
          pair.request.variables.owner !== owner || pair.request.variables.repo !== repo ||
          pair.request.variables.issue !== observation.issue || typeof pair.response.stdout !== 'string' ||
          typeof pair.response.stderr !== 'string' || !(pair.response.exitCode === null || Number.isSafeInteger(pair.response.exitCode))) fail();
    }
    // Query equality/parse/consumption belongs to fixed native replay; this
    // constructor establishes only closed DATA, never original read custody.
  }
  if (Object.hasOwn(value.remote, 'stageComments')) {
    const pair = value.remote.stageComments;
    keys(pair, ['request', 'response']); keys(pair.request, ['file', 'args']);
    keys(pair.response, ['stdout', 'stderr', 'exitCode']);
    if (pair.request.file !== 'gh' || canonicalRecordJson(pair.request.args) !== canonicalRecordJson([
      'api', '--paginate', '--slurp', `repos/${observation.repository}/issues/${observation.issue}/comments`]) ||
        typeof pair.response.stdout !== 'string' || typeof pair.response.stderr !== 'string' ||
        !Number.isInteger(pair.response.exitCode)) fail();
  }
  if (Object.hasOwn(value.remote, 'identity')) {
    const identity = value.remote.identity;
    keys(identity, ['request', 'response']);
    keys(identity.request, ['file', 'args']);
    keys(identity.response, ['stdout', 'stderr', 'exitCode']);
    if (identity.request.file !== 'gh' || canonicalRecordJson(identity.request.args) !==
        canonicalRecordJson(['api', 'user', '--jq', '.login']) ||
        typeof identity.response.stdout !== 'string' || typeof identity.response.stderr !== 'string' ||
        !Number.isInteger(identity.response.exitCode)) fail();
  }
  keys(value.remote.assignments, ['pages', 'final']);
  keys(value.remote.children, ['pages', 'identities', 'membership', 'fields']);
  keys(value.remote.comments, ['commit', 'workflow']);
  const [owner, repo] = observation.repository.split('/');
  const native = { owner, repo, issue: observation.issue };
  const pairs = (entries, fields, fixed) => {
    if (!Array.isArray(entries)) fail();
    const seen = new Set();
    for (const entry of entries) {
      keys(entry, ['request', 'response']);
      keys(entry.request, fields);
      for (const [key, expected] of Object.entries(fixed)) if (entry.request[key] !== expected) fail();
      for (const key of ['cursor', 'after']) if (Object.hasOwn(entry.request, key) &&
          entry.request[key] !== null && (typeof entry.request[key] !== 'string' || !entry.request[key])) fail();
      if (Object.hasOwn(entry.request, 'item') &&
          (typeof entry.request.item !== 'string' || !entry.request.item)) fail();
      const identity = canonicalRecordJson(entry.request);
      if (seen.has(identity)) fail();
      seen.add(identity);
      if (entry.response === null || typeof entry.response !== 'object') fail();
    }
  };
  pairs(value.remote.dependencies, ['repo', 'issueNumber', 'includeBlocking'],
    { repo: observation.repository, issueNumber: observation.issue, includeBlocking: false });
  pairs(value.remote.assignments.pages, ['owner', 'repo', 'issue', 'cursor'], native);
  pairs(value.remote.assignments.final, ['owner', 'repo', 'issue', 'item'], native);
  pairs(value.remote.parent, ['owner', 'repo', 'issue'], native);
  for (const name of ['pages', 'identities', 'membership'])
    pairs(value.remote.children[name], ['owner', 'repo', 'issue', 'after'], native);
  pairs(value.remote.children.fields, ['item', 'after'], {});
  pairs(value.remote.comments.commit, ['repo', 'issueNumber'],
    { repo: observation.repository, issueNumber: observation.issue });
  pairs(value.remote.comments.workflow, ['owner', 'name', 'issue', 'after'],
    { owner, name: repo, issue: observation.issue });
  pairs(value.remote.disposition, ['owner', 'repo', 'issue'], native);
  // Query-specific closure only. Missing/null values remain native reader
  // refusals; this boundary never derives a guard decision or read capability.
  const shape = (data, spec) => {
    if (data === null) return;
    if (typeof spec === 'string') {
      if (typeof data !== spec || (spec === 'number' && !Number.isFinite(data))) fail();
      return;
    }
    if (Array.isArray(spec)) {
      if (!Array.isArray(data)) fail();
      for (const item of data) shape(item, spec[0]);
      return;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail();
    for (const key of Object.keys(data)) {
      if (!Object.hasOwn(spec, key)) fail();
      shape(data[key], spec[key]);
    }
  };
  const page = { hasNextPage: 'boolean', endCursor: 'string' };
  const shortPage = { hasNextPage: 'boolean' };
  const connection = (node, pageInfo = page) => ({ nodes: [node], pageInfo });
  const issueResponse = issue => ({ repository: { issue } });
  const field = { number: 'number', name: 'string', field: { id: 'string', name: 'string' } };
  const projectItem = pageInfo => ({ id: 'string', project: { id: 'string' }, fieldValues: connection(field, pageInfo) });
  const applyShape = (entries, spec) => {
    for (const entry of entries) shape(entry.response, spec);
  };
  if (Object.hasOwn(value.remote, 'stageItem')) {
    const item = value.remote.stageItem;
    keys(item, ['membership', 'fields', 'final']);
    pairs(item.membership, ['owner', 'repo', 'issue', 'after'], native);
    pairs(item.fields, ['item', 'after'], {}); pairs(item.final, ['item'], {});
    const content = { __typename: 'string', id: 'string', number: 'number', repository: { nameWithOwner: 'string' } };
    const stageField = { __typename: 'string', id: 'string', field: { id: 'string', name: 'string' },
      name: 'string', optionId: 'string', number: 'number', text: 'string', date: 'string' };
    const stageFields = { nodes: [stageField], totalCount: 'number', pageInfo: page };
    const member = { id: 'string', project: { id: 'string' }, content, fieldValues: stageFields };
    applyShape(item.membership, { repository: { nameWithOwner: 'string', issue: { number: 'number',
      projectItems: { nodes: [member], totalCount: 'number', pageInfo: page } } } });
    applyShape(item.fields, { node: member });
    applyShape(item.final, { node: { id: 'string', project: { id: 'string' }, content, fieldValueByName: stageField } });
  }
  // gh issue view --json blockedBy retains the CLI's actual issue metadata.
  // CLI selection: https://github.com/cli/cli/blob/trunk/api/query_builder.go
  applyShape(value.remote.dependencies, { blockedBy: {
    ...connection({ id: 'string', number: 'number', title: 'string', url: 'string', state: 'string',
      repository: { nameWithOwner: 'string' } }), totalCount: 'number',
  } });
  const assignees = { nodes: [{ login: 'string' }] };
  const assignmentItem = { id: 'string', project: { id: 'string' }, fieldValueByName: { name: 'string' } };
  applyShape(value.remote.assignments.pages, issueResponse({ assignees, projectItems: connection(assignmentItem) }));
  applyShape(value.remote.assignments.final, { ...issueResponse({ assignees }),
    node: { project: { id: 'string' }, fieldValueByName: { name: 'string' } } });
  applyShape(value.remote.parent, issueResponse({ parent: { number: 'number' } }));
  applyShape(value.remote.children.pages, issueResponse({ subIssues: {
    ...connection({ id: 'string', number: 'number', title: 'string', state: 'string', stateReason: 'string', body: 'string',
      labels: connection({ name: 'string' }, shortPage), projectItems: connection(projectItem(shortPage), shortPage) }),
    totalCount: 'number',
  } }));
  applyShape(value.remote.children.identities, issueResponse({ subIssues: {
    ...connection({ id: 'string', number: 'number' }), totalCount: 'number',
  } }));
  applyShape(value.remote.children.membership, issueResponse({ projectItems: connection(projectItem(page)) }));
  applyShape(value.remote.children.fields, { node: { fieldValues: connection(field) } });
  applyShape(value.remote.disposition, issueResponse({ projectItems: { nodes: [{ project: { id: 'string' },
    fieldValues: { nodes: [{ number: 'number', date: 'string', text: 'string', name: 'string', field: { id: 'string' } }] },
  }] } }));
  // Native gh comment JSON includes these metadata fields; do not strip them
  // into a normalized decision before the actual native comment reader runs.
  applyShape(value.remote.comments.commit, [{ id: 'string', body: 'string', author: { login: 'string', id: 'string', name: 'string' },
    authorAssociation: 'string', createdAt: 'string', includesCreatedEdit: 'boolean', isMinimized: 'boolean',
    minimizedReason: 'string', reactionGroups: [{ content: 'string', users: { totalCount: 'number' } }],
    url: 'string', viewerDidAuthor: 'boolean',
  }]);
  const subject = { number: 'number', repository: { nameWithOwner: 'string' } };
  const workflowResponse = { data: issueResponse({ ...subject, comments: connection({ __typename: 'string', id: 'string',
    body: 'string', author: { login: 'string' }, createdAt: 'string', updatedAt: 'string', issue: subject }) }), errors: [] };
  if (Object.hasOwn(value.remote, 'timing')) {
    const timing = value.remote.timing;
    keys(timing, ['legacy', 'pages']);
    keys(timing.legacy, ['request', 'response']);
    keys(timing.legacy.request, ['file', 'args']);
    keys(timing.legacy.response, ['stdout', 'stderr', 'exitCode']);
    if (timing.legacy.request.file !== 'gh' || canonicalRecordJson(timing.legacy.request.args) !==
        canonicalRecordJson(['issue', 'view', String(observation.issue), '-R', observation.repository, '--json', 'comments']) ||
        typeof timing.legacy.response.stdout !== 'string' || typeof timing.legacy.response.stderr !== 'string' ||
        !Number.isInteger(timing.legacy.response.exitCode)) fail();
    pairs(timing.pages, ['owner', 'name', 'issue', 'after'], { owner, name: repo, issue: observation.issue });
    applyShape(timing.pages, { data: { repository: { nameWithOwner: 'string', issue: { number: 'number', comments: {
      nodes: [{ id: 'string', body: 'string' }], totalCount: 'number', pageInfo: page,
    } } } }, errors: [] });
    for (const pair of timing.pages) if (Object.hasOwn(pair.response, 'errors') &&
        (!Array.isArray(pair.response.errors) || pair.response.errors.length)) fail();
  }
  for (const entry of value.remote.comments.workflow) {
    // A partial GraphQL result cannot become a complete source observation.
    if (Object.hasOwn(entry.response, 'errors') &&
        (!Array.isArray(entry.response.errors) || entry.response.errors.length)) fail();
    shape(entry.response, workflowResponse);
  }
}

// Constructor coherence only. Original capture and stage chronology must later
// derive these bytes independently; no constructor value grants an effect.
function validateNativeStageResources(value, observation, comments) {
  try {
    exactKeys(value, ['schema', 'comments', 'membership', 'local']);
    if (value.schema !== 'aitm.native-stage-resources/v1' || !Array.isArray(value.comments)) throw new TypeError();
    // ONE closed comment-resource qualifier also feeds the native timing
    // census. Raw resource bytes remain untouched; page data grants nothing.
    const pages = nativeStageTimingPages({ repository: observation.repository, issue: observation.issue, comments: value.comments });
    const retained = new Map(pages.flatMap(page => page.response.data.repository.issue.comments.nodes)
      .map(entry => [entry.id, entry.body]));
    if (!Array.isArray(comments) || comments.some(comment => !retained.has(comment.id) || retained.get(comment.id) !== comment.body))
      throw new TypeError();
    exactKeys(value.membership, ['projectId', 'itemId', 'bytes']);
    const { projectId, itemId, bytes } = value.membership;
    if (typeof projectId !== 'string' || !projectId || typeof itemId !== 'string' || !itemId || typeof bytes !== 'string')
      throw new TypeError();
    const item = JSON.parse(bytes);
    canonicalRecordJson(item);
    if (item?.id !== itemId || item.project?.id !== projectId || item.content?.number !== observation.issue ||
        item.content?.repository?.nameWithOwner !== observation.repository) throw new TypeError();
    const fields = item.fieldValues;
    if (!Array.isArray(fields?.nodes) || fields.totalCount !== fields.nodes.length || fields.pageInfo?.hasNextPage !== false ||
        !(fields.pageInfo.endCursor === null || typeof fields.pageInfo.endCursor === 'string')) throw new TypeError();
    const fieldIds = new Set();
    for (const field of fields.nodes) {
      if (typeof field?.field?.id !== 'string' || !field.field.id || fieldIds.has(field.field.id)) throw new TypeError();
      fieldIds.add(field.field.id);
    }
    exactKeys(value.local, ['activeTask', 'actorTiming', 'actorFlush', 'wordCursor', 'trackerState', 'queue']);
    for (const resource of Object.values(value.local)) {
      if (resource === null) continue;
      exactKeys(resource, ['bytes']);
      if (typeof resource.bytes !== 'string') throw new TypeError();
    }
  } catch { revisionError('native-stage-resources'); }
}

export function createRevisionMemory(input) {
  canonicalRecordJson(input);
  exactKeys(input, [
    'observation',
    'comments',
    'hostMessages',
    ...(Object.hasOwn(input, 'planning') ? ['planning'] : []),
    ...(Object.hasOwn(input, 'planJournal') ? ['planJournal'] : []),
    ...(Object.hasOwn(input, 'nativeProofRecords') ? ['nativeProofRecords'] : []),
    ...(Object.hasOwn(input, 'nativePlanRecords') ? ['nativePlanRecords'] : []),
    ...(Object.hasOwn(input, 'nativeSourceRecords') ? ['nativeSourceRecords'] : []),
    ...(Object.hasOwn(input, 'nativeOrder') ? ['nativeOrder'] : []),
    ...(Object.hasOwn(input, 'pendingSource') ? ['pendingSource'] : []),
    ...(Object.hasOwn(input, 'lifecycleSources') ? ['lifecycleSources'] : []),
    ...(Object.hasOwn(input, 'nativeStageResources') ? ['nativeStageResources'] : []),
    ...(Object.hasOwn(input, 'nativeStageRecords') ? ['nativeStageRecords'] : []),
  ]);
  if (input.nativeStageResources !== undefined) validateNativeStageResources(input.nativeStageResources, input.observation, input.comments);
  if (input.planning !== undefined) validatePlanningSnapshot(input.planning);
  if (input.planJournal != null) validatePlanJournal(input.planJournal);
  if (input.nativeProofRecords !== undefined) {
    if (!Array.isArray(input.nativeProofRecords)) revisionError('native-proof-records');
    input.nativeProofRecords.forEach(validateNativeProofJournal);
  }
  if (input.nativePlanRecords !== undefined) {
    if (!Array.isArray(input.nativePlanRecords)) revisionError('native-plan-records');
    input.nativePlanRecords.forEach(validatePlanJournal);
  }
  if (input.nativeSourceRecords !== undefined) {
    if (!Array.isArray(input.nativeSourceRecords)) revisionError('native-source-records');
    input.nativeSourceRecords.forEach(validateNativeSourceJournal);
  }
  if (input.nativeStageRecords !== undefined) {
    if (!Array.isArray(input.nativeStageRecords) || !input.nativeStageResources) revisionError('native-stage-records');
    input.nativeStageRecords.forEach(validateNativeStageJournal);
  }
  validateNativeOrder(input);
  if (input.lifecycleSources !== undefined) {
    // A retained stage keeps its original read data immutable after its own
    // body projection. This establishes constructor coherence only; the async
    // ordered fold must independently prove that original cursor and prefix.
    const latest = input.nativeOrder?.at(-1);
    const stage = latest?.kind === 'stage'
      ? input.nativeStageRecords.find(journal => journal.header.id === latest.id) : null;
    if (stage) {
      const original = stage.header.original.observation;
      validateRevisionObservation(original);
      if (original.repository !== input.observation.repository || original.issue !== input.observation.issue ||
          canonicalRecordJson(stage.header.guardCapture.lifecycleSources) !== canonicalRecordJson(input.lifecycleSources))
        revisionError('lifecycle-source');
      validateLifecycleSources(input.lifecycleSources, original);
    } else validateLifecycleSources(input.lifecycleSources, input.observation);
  }
  const latestFileSource = (input.nativeSourceRecords ?? []).findLast(j => j.operation.schema === 'aitm.native-linked-plan-edit/v1');
  if (latestFileSource && !input.pendingSource) {
    const sourceIndex = input.nativeOrder.findIndex(ref => ref.id === latestFileSource.id);
    const next = input.nativeOrder[sourceIndex + 1];
    const retainedPlan = next?.kind === 'plan' && (input.nativePlanRecords ?? []).find(j => hashBytes(canonicalRecordJson(j)) === next.id);
    if (!retainedPlan || !sameRevisionObservation(retainedPlan.before, latestFileSource.after) ||
        (input.planJournal && hashBytes(canonicalRecordJson(input.planJournal)) === next.id))
      revisionError('native-source-pending-missing');
  }
  if (!validPendingSource(input.pendingSource ?? null)) revisionError('native-source-pending');
  if (input.pendingSource && !(input.nativeSourceRecords ?? []).some(j =>
      canonicalRecordJson(sourcePendingProjection(j)) === canonicalRecordJson(input.pendingSource)))
    revisionError('native-source-pending-binding');
  validateRevisionObservation(input.observation);
  if (!Array.isArray(input.comments) || !Array.isArray(input.hostMessages))
    revisionError('memory-input');
  const m = {
    ...clone(input),
    nativeProofRecords: clone(input.nativeProofRecords ?? []),
    nativePlanRecords: clone(input.nativePlanRecords ?? []),
    nativeSourceRecords: clone(input.nativeSourceRecords ?? []),
    nativeStageRecords: clone(input.nativeStageRecords ?? []),
    nativeOrder: clone(input.nativeOrder ?? []),
    pendingSource: clone(input.pendingSource ?? null),
    effects: [],
    failBefore: null,
    failAfter: null,
    pageSize: 100,
    pageFault: null,
    lifecycleTransition: false,
    nativeActorResourceLock: null,
    nativeTimingResourceLock: null,
    nativeCursorResourceLock: null,
    nativeBodyResourceLock: null,
    nativeBoardResourceLock: null,
    nativeCheckpointResourceLocks: { activeTask: null, actorTiming: null, trackerState: null },
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
  if (m.pendingSource) {
    const j = m.nativeSourceRecords.find(j => j.id === m.pendingSource.journalId);
    const historical = reconstructHistoricalPlanSource({ sourceRead: j.sourceRead, body: j.before.body.bytes,
      projectDir: j.before.executor.worktree });
    atomicRevisionJson(path.join(domainStorage(m.domain), 'admission', `${m.observation.issue}.json`), {
      schema: 'aitm.revision-admission/v2', repository: m.observation.repository, issue: m.observation.issue,
      domain: m.domain, generation: 1, eventHead: j.revisionEventHead, revision: j.before.revision,
      revisionId: j.before.revisionId, contractDigest: j.currentContract.semanticContractDigest,
      sourceBindings: j.before.protectedSourceBindings, planApproval: null,
      localPlan: { body: j.before.body.bytes, key: j.sourceRead.key, path: j.sourceRead.path,
        contentSha256: j.sourceRead.contentSha256, source: historical.resolved.source, location: historical.resolved.location },
      pendingSource: m.pendingSource, state: 'deny', dirty: false,
    }, m.ports);
  }
  const backend = {
    get snapshot() {
      return clone({
        observation: m.observation,
        ...(m.lifecycleSources ? { lifecycleSources: m.lifecycleSources } : {}),
        ...(m.nativeStageResources ? { nativeStageResources: m.nativeStageResources } : {}),
        comments: m.comments,
        hostMessages: m.hostMessages,
        ...(m.planning ? { planning: m.planning } : {}),
        ...(m.planJournal ? { planJournal: m.planJournal } : {}),
        ...(m.nativeProofRecords.length ? { nativeProofRecords: m.nativeProofRecords } : {}),
        ...(m.nativePlanRecords.length ? { nativePlanRecords: m.nativePlanRecords } : {}),
        ...(m.nativeSourceRecords.length ? { nativeSourceRecords: m.nativeSourceRecords } : {}),
        ...(m.nativeStageRecords.length ? { nativeStageRecords: m.nativeStageRecords } : {}),
        ...(m.nativeOrder.length ? { nativeOrder: m.nativeOrder } : {}),
        ...(m.pendingSource ? { pendingSource: m.pendingSource } : {}),
      });
    },
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
    capability => withMemoryTransportQuarantine(() => fn(capability)),
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

function validatePlanJournal(j) {
  exactKeys(
    j,
    ['schema', 'before', 'after', 'audit', 'record', 'planning', 'comments', 'revisionEventHead',
      ...(Object.hasOwn(j, 'sourceRead') ? ['sourceRead'] : [])],
    'plan-journal'
  );
  if (
    j.schema !== 'aitm.memory-plan-journal/v1' ||
    typeof j.audit !== 'string' ||
    !Array.isArray(j.comments)
  )
    revisionError('plan-journal');
  validateRevisionObservation(j.before);
  validateRevisionObservation(j.after);
  validatePlanningSnapshot(j.planning);
  if (Object.hasOwn(j, 'sourceRead')) reconstructHistoricalPlanSource({ sourceRead: j.sourceRead,
    body: j.before.body.bytes, projectDir: j.before.executor.worktree });
}
function planTargets(j) {
  const targets = [],
    o = clone(j.before),
    comments = clone(j.comments);
  targets.push({ step: null, observation: clone(o), comments: clone(comments) });
  comments.push({ id: 'memory-plan-audit-' + j.record.recordId, body: j.audit });
  targets.push({ step: 'plan-audit', observation: clone(o), comments: clone(comments) });
  if (o.sourceKind === 'canonical-contract') {
    o.canonicalArchive = clone(j.after.canonicalArchive);
    o.capsule = clone(j.after.capsule);
    targets.push({ step: 'plan-capsule', observation: clone(o), comments: clone(comments) });
    o.contract = clone(j.after.contract);
    targets.push({ step: 'plan-contract', observation: clone(o), comments: clone(comments) });
    o.proofRecords = clone(j.after.proofRecords);
    targets.push({ step: 'plan-proof', observation: clone(o), comments: clone(comments) });
  }
  o.body = clone(j.after.body);
  targets.push({ step: 'plan-body', observation: clone(o), comments: clone(comments) });
  return targets;
}
export function readMemoryPlanJournal(backend, context) {
  const m = memory(backend),
    j = m.planJournal;
  if (!j) return null;
  validatePlanJournal(j);
  const o = readMemoryAuthority(backend, context),
    planning = readMemoryPlanning(backend, context);
  if (
    !planTargets(j).some(
      (t) =>
        sameRevisionObservation(t.observation, o) &&
        canonicalRecordJson(t.comments) === canonicalRecordJson(m.comments)
    )
  )
    revisionError('plan-journal-prefix');
  if (
    canonicalRecordJson({ ...planning, bodyHash: j.planning.bodyHash }) !==
    canonicalRecordJson(j.planning)
  )
    revisionError('plan-journal-planning-drift');
  if (j.planning.bodyHash !== hashBytes(j.before.body.bytes))
    revisionError('plan-journal-planning-drift');
  if (o.sourceKind === 'canonical-contract') {
    assertCanonicalAuthority(o, memoryNow(backend), 'plan-approve');
    assertCanonicalAuthority(j.before, memoryNow(backend), 'plan-approve');
  }
  return clone(j);
}
export async function persistMemoryPlanApproval({ backend, token, before, after, audit, record }) {
  const { context, journal, capability } = validateMemoryPlanWrite(token, {
      backend,
      before,
      after,
      audit,
      record,
    }),
    m = memory(backend);
  if (!m.planJournal && sameRevisionObservation(m.observation, after) &&
      canonicalRecordJson(m.nativePlanRecords.at(-1)) === canonicalRecordJson(journal)) {
    await completePendingSourcePlan(backend, context, capability, journal);
    return;
  }
  if (!m.planJournal && !sameRevisionObservation(m.observation, before))
    revisionError('plan-before');
  if (!m.planJournal)
    operation(m, 'plan-journal-write', () => {
      m.planJournal = clone(journal);
      return true;
    });
  operation(m, 'plan-journal-readback', () => {
    if (canonicalRecordJson(m.planJournal) !== canonicalRecordJson(journal))
      revisionError('plan-journal-drift');
    return true;
  });
  readMemoryPlanJournal(backend, context);
  const targets = planTargets(journal);
  let prefix = targets.findIndex(
    (t) =>
      sameRevisionObservation(t.observation, m.observation) &&
      canonicalRecordJson(t.comments) === canonicalRecordJson(m.comments)
  );
  for (let i = 1; i < targets.length; i++) {
    const target = targets[i],
      step = target.step;
    if (i > prefix) {
      if (step === 'plan-capsule')
        await appendCapsule({
          repository: context.repository,
          issue: context.issue,
          expectedHeadRecordId: before.capsule.head,
          candidate: {
            envelope: record.envelope,
            visibleMarkdown: 'AITM current Plan approval.\n',
          },
          deps: {
            listIssueComments: async () => canonicalRecords(m.observation),
            createIssueComment: async ({ body }) =>
              operation(m, step + '-write', () => {
                if (body !== record.bytes) revisionError('plan-record-bytes');
                m.observation = clone(target.observation);
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
      else
        operation(m, step + '-write', () => {
          m.observation = clone(target.observation);
          m.comments = clone(target.comments);
          if (step === 'plan-body') m.planning.bodyHash = hashBytes(after.body.bytes);
          return true;
        });
      prefix = i;
    }
    operation(m, step + '-readback', () => {
      if (
        !planTargets(journal)
          .slice(i)
          .some(
            (t) =>
              sameRevisionObservation(t.observation, m.observation) &&
              canonicalRecordJson(t.comments) === canonicalRecordJson(m.comments)
          )
      )
        revisionError('plan-readback');
      return true;
    });
  }
  operation(m, 'plan-readback', () => {
    if (!sameRevisionObservation(m.observation, after)) revisionError('plan-readback');
    return true;
  });
  operation(m, 'native-plan-record-write', () => {
    const id = hashBytes(canonicalRecordJson(journal));
    const existing = m.nativePlanRecords.find(j => hashBytes(canonicalRecordJson(j)) === id);
    if (!existing) {
      appendNativeReference(m, 'plan', id, journal.revisionEventHead);
      m.nativePlanRecords.push(clone(journal));
    }
    validateNativeOrder(m);
    return true;
  });
  operation(m, 'native-plan-record-readback', () => {
    if (canonicalRecordJson(m.nativePlanRecords.at(-1)) !== canonicalRecordJson(journal))
      revisionError('native-plan-record-readback');
    validateNativeOrder(m);
    return true;
  });
  operation(m, 'plan-journal-clear', () => { m.planJournal = null; return true; });
  await completePendingSourcePlan(backend, context, capability, journal);
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

export function readMemoryNativeProofRecords(backend) {
  const m = memory(backend);
  return operation(m, 'native-proof-record-readback', () => m.nativeProofRecords.map(validateNativeProofJournal));
}

// Only an actual, still-live runner token can publish the durable record.
// Snapshot readers independently reconstruct its full native effect later.
export async function persistMemoryNativeProof({ backend, capability, context, executionToken, journal }) {
  assertMemoryCapability(backend, capability, context);
  let readExecution = readNativeVerifierExecution;
  if (journal?.execution?.schema === 'aitm.native-checkbox-operation/v1') readExecution = readNativeChecklistOperation;
  else if (journal?.execution?.schema === 'aitm.native-develop-final-execution/v1') {
    // The executable's guidance imports the state catalog. Load its private
    // token reader only here, after normal module initialization has completed.
    ({ readNativeDevelopExecution: readExecution } = await import('../../verify-develop.mjs'));
    assertMemoryCapability(backend, capability, context);
  }
  const execution = readExecution(executionToken);
  const m = memory(backend);
  validateNativeProofJournal(journal);
  if (canonicalRecordJson(execution) !== canonicalRecordJson(journal.execution) ||
      !sameRevisionObservation(m.observation, journal.before) ||
      !sameRevisionObservation(execution.scope.observation, m.observation) ||
      context.repository !== execution.binding.repository || context.issue !== execution.binding.issue ||
      canonicalRecordJson(context.executor) !== canonicalRecordJson(execution.scope.executor))
    revisionError('native-proof-write-authority');
  if (m.nativeProofRecords.some(r => r.id === journal.id)) revisionError('native-proof-duplicate');
  operation(m, 'native-proof-journal-write', () => {
    appendNativeReference(m, 'proof', journal.id, journal.revisionEventHead);
    m.nativeProofRecords.push(clone(journal));
    validateNativeOrder(m);
    return true;
  });
  operation(m, 'native-proof-journal-readback', () => {
    if (canonicalRecordJson(m.nativeProofRecords.at(-1)) !== canonicalRecordJson(journal)) revisionError('native-proof-journal-readback');
    validateNativeProofJournal(m.nativeProofRecords.at(-1));
    return true;
  });
  return clone(journal);
}

// This index preserves execution order; it is never a substitute for the native
// validators that reconstruct each record's effect and source authority.
function validateNativeOrder(value) {
  const plans = value.nativePlanRecords ?? [], proofs = value.nativeProofRecords ?? [], sources = value.nativeSourceRecords ?? [], stages = value.nativeStageRecords ?? [];
  if (value.nativeOrder === undefined) {
    if (plans.length || sources.length || stages.length) revisionError('native-order-missing');
    return; // Historical no-source proof snapshots retain their strict old reader.
  }
  if (!Array.isArray(value.nativeOrder)) revisionError('native-order');
  const expected = new Map([
    ...plans.map(j => [hashBytes(canonicalRecordJson(j)), { kind: 'plan', head: j.revisionEventHead }]),
    ...proofs.map(j => [j.id, { kind: 'proof', head: j.revisionEventHead }]),
    ...sources.map(j => [j.id, { kind: 'source', head: j.revisionEventHead }]),
    ...stages.map(j => [j.header.id, { kind: 'stage', head: j.header.revisionEventHead }]),
  ]);
  if (expected.size !== plans.length + proofs.length + sources.length + stages.length || value.nativeOrder.length !== expected.size)
    revisionError('native-order-membership');
  let predecessor = null;
  for (const ref of value.nativeOrder) {
    exactKeys(ref, ['kind', 'id', 'revisionEventHead', 'predecessor'], 'native-order-reference');
    const record = expected.get(ref.id);
    if (!record || record.kind !== ref.kind || record.head !== ref.revisionEventHead || ref.predecessor !== predecessor)
      revisionError('native-order-reference');
    expected.delete(ref.id);
    predecessor = ref.id;
  }
}
function appendNativeReference(m, kind, id, revisionEventHead) {
  // Never manufacture historical order for older unindexed records.
  validateNativeOrder(m);
  m.nativeOrder.push({ kind, id, revisionEventHead, predecessor: m.nativeOrder.at(-1)?.id ?? null });
}

export function readMemoryNativeHistory(backend) {
  const m = memory(backend);
  validateNativeOrder(m);
  return operation(m, 'native-history-readback', () => ({ plans: m.nativePlanRecords, proofs: m.nativeProofRecords, sources: m.nativeSourceRecords, ...(m.nativeStageRecords.length ? { stages: m.nativeStageRecords } : {}), order: m.nativeOrder }));
}
export function persistMemoryNativeSource({ backend, capability, context, token, journal }) {
  assertMemoryCapability(backend, capability, context);
  const sealed = readNativeSourceWrite(token), m = memory(backend);
  if (sealed.backend !== backend || sealed.capability !== capability ||
      canonicalRecordJson(sealed.journal) !== canonicalRecordJson(journal) ||
      !sameRevisionObservation(m.observation, journal.before)) revisionError('native-source-write-authority');
  validateNativeSourceJournal(journal);
  if (m.nativeOrder.at(-1)?.id !== journal.predecessor) revisionError('native-source-order');
  operation(m, 'native-source-journal-write', () => {
    appendNativeReference(m, 'source', journal.id, journal.revisionEventHead);
    m.nativeSourceRecords.push(clone(journal));
    if (journal.operation.schema === 'aitm.native-linked-plan-edit/v1') m.pendingSource = sourcePendingProjection(journal);
    validateNativeOrder(m);
    return true;
  });
  operation(m, 'native-source-journal-readback', () => {
    if (canonicalRecordJson(m.nativeSourceRecords.at(-1)) !== canonicalRecordJson(journal))
      revisionError('native-source-journal-readback');
    validateNativeOrder(m);
    return true;
  });
  return clone(journal);
}

function sourcePendingProjection(journal) {
  if (journal.operation.schema !== 'aitm.native-linked-plan-edit/v1') return null;
  return { schema: 'aitm.native-source-pending/v1', journalId: journal.id,
    revisionEventHead: journal.revisionEventHead, predecessor: journal.predecessor,
    sourcePath: journal.operation.path, beforeContentSha256: journal.operation.beforeContentSha256,
    afterContentSha256: journal.operation.afterContentSha256 };
}
export function readMemorySourceProjection(token, capability, ports) {
  const held = readNativeSourceWrite(token), m = memory(held.backend);
  if (held.capability !== capability || m.ports !== ports ||
      !m.nativeSourceRecords.some(j => canonicalRecordJson(j) === canonicalRecordJson(held.journal)) ||
      canonicalRecordJson(m.pendingSource) !== canonicalRecordJson(sourcePendingProjection(held.journal)))
    revisionError('native-source-pending-authority');
  return clone(m.pendingSource);
}
const sourceCompletions = new WeakMap();
export function readMemorySourceCompletion(receipt, capability, ports) {
  const held = sourceCompletions.get(receipt);
  if (!held?.live || held.capability !== capability || memory(held.backend).ports !== ports)
    revisionError('native-source-completion-authority');
  assertMemoryCapability(held.backend, capability, held.context);
  return clone(held.pendingSource);
}
async function completePendingSourcePlan(backend, context, capability, journal) {
  const m = memory(backend);
  assertMemoryCapability(backend, capability, context);
  if (!m.pendingSource) return;
  const pending = clone(m.pendingSource), source = m.nativeSourceRecords.find(j => j.id === pending.journalId);
  const planId = hashBytes(canonicalRecordJson(journal)), ref = m.nativeOrder.at(-1);
  if (m.planJournal || !source || canonicalRecordJson(sourcePendingProjection(source)) !== canonicalRecordJson(pending) ||
      ref?.kind !== 'plan' || ref.id !== planId || ref.predecessor !== source.id ||
      ref.revisionEventHead !== pending.revisionEventHead ||
      canonicalRecordJson(m.nativePlanRecords.at(-1)) !== canonicalRecordJson(journal) ||
      !sameRevisionObservation(journal.before, source.after) || !sameRevisionObservation(m.observation, journal.after))
    revisionError('native-source-completion-order');
  // The current collector and native Plan reader independently replay the retained
  // sequence and freshly resolve the actual file. Neither a serialized ready bit
  // nor the historical source snapshot may issue this transient completion receipt.
  const receipt = Object.freeze({}), held = { live: true, backend, context, capability, pendingSource: pending };
  sourceCompletions.set(receipt, held);
  const prior = readAdmission(context, m.ports);
  try {
    await observeMemoryAdmission(backend, context, capability, receipt);
    await publishAdmission({ capability, observation: { issue: context.issue }, state: 'deny', completion: receipt }, m.ports);
    operation(m, 'native-source-completion-write', () => { m.pendingSource = null; return true; });
    operation(m, 'native-source-completion-readback', () => {
      const cleared = readAdmission(context, m.ports);
      if (cleared.state !== 'deny' || cleared.pendingSource !== null ||
          m.pendingSource !== null || m.planJournal || !sameRevisionObservation(m.observation, journal.after))
        revisionError('native-source-completion-readback');
      return true;
    });
    const observation = await observeMemoryAdmission(backend, context, capability);
    checkpoint(m, 'native-source-completion-allow', 'failBefore');
    const entry = await publishAdmission({ capability, observation, state: 'allow' }, m.ports);
    m.effects.push('native-source-completion-allow');
    checkpoint(m, 'native-source-completion-allow', 'failAfter');
    operation(m, 'native-source-completion-admission-readback', () => {
      if (canonicalRecordJson(readAdmission(context, m.ports)) !== canonicalRecordJson(entry))
        revisionError('native-source-completion-admission-readback');
      return true;
    });
  } catch (error) {
    m.pendingSource = pending;
    const current = readAdmission(context, m.ports);
    if (current.generation === Number.MAX_SAFE_INTEGER) revisionError('admission-generation-exhausted');
    // Restore only the previously validated deny association/projection. This
    // cannot produce allow and stays inside the same held private backend ports.
    atomicRevisionJson(path.join(domainStorage(m.domain), 'admission', `${context.issue}.json`),
      { ...prior, generation: current.generation + 1, state: 'deny', pendingSource: pending }, m.ports);
    if (canonicalRecordJson(readAdmission(context, m.ports).pendingSource) !== canonicalRecordJson(pending))
      revisionError('native-source-pending-restore');
    throw error;
  } finally { held.live = false; }
}
export async function publishMemorySourcePending({ backend, capability, context, token }) {
  const m = memory(backend);
  assertMemoryCapability(backend, capability, context);
  readMemorySourceProjection(token, capability, m.ports);
  const entry = await publishAdmission({ capability, observation: { issue: context.issue }, state: 'deny', sourceToken: token }, m.ports);
  operation(m, 'native-source-pending-readback', () => {
    if (canonicalRecordJson(readAdmission(context, m.ports).pendingSource) !== canonicalRecordJson(m.pendingSource))
      revisionError('native-source-pending-readback');
    return true;
  });
  return entry;
}

async function observeMemoryAdmission(backend, context, capability, completion) {
  const m = memory(backend);
  assertMemoryCapability(backend, capability, context);
  const state = await observeRevision({ context, deps: backend });
  if (!['empty', 'applied'].includes(state.status)) revisionError('memory-admission-authority');
  const plan = state.status === 'applied' ? await readCurrentMemoryPlanApproval({ backend, context }) : null;
  if (state.status === 'applied' && !plan) revisionError('memory-admission-approval');
  const contractDigest = state.status === 'empty'
    ? hashSemanticContract(readRevisionDefinitions(state.observation))
    : (state.currentContract ?? state.effectiveProposal.after).semanticContractDigest;
  return observeAdmission({ capability, context, completion, observe: () => ({ observation: state.observation,
    authority: { complete: true, pending: false, chain: state.status === 'empty' ? 'empty' : 'verified',
      head: state.chain.head, baselineAllowed: state.status === 'empty', contractDigest, planApproval: plan?.payload ?? null } }) }, m.ports);
}
export async function refreshMemoryAdmission(input) {
  exactKeys(input, ['backend', 'context'], 'memory-admission-input');
  const { backend, context } = input;
  exactKeys(context, ['repository', 'issue', 'executor'], 'memory-admission-context');
  const m = memory(backend);
  readMemoryAuthority(backend, context);
  return withMemoryInterlock(backend, context, async capability => {
    if (m.pendingSource) return publishMemoryDeny(backend, capability, context);
    try {
      const observation = await observeMemoryAdmission(backend, context, capability);
      return await publishAdmission({ capability, observation, state: 'allow' }, m.ports);
    } catch {
      return publishMemoryDeny(backend, capability, context);
    }
  });
}

// The only initial stage publication accepts an unreturned token from the
// actual suspended native saga. No supplied journal/header/result is accepted.
export async function persistMemoryNativeStage(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token'], 'native-stage-input');
  const { backend, capability, context, token } = input;
  assertMemoryCapability(backend, capability, context);
  const { readNativeStageIntent } = await import('../move-state/move-state-core.mjs');
  const current = () => {
    assertMemoryCapability(backend, capability, context);
    return readNativeStageIntent(token, backend);
  };
  const intent = current(), m = memory(backend);
  if (m.nativeStageRecords.length || m.planJournal || m.pendingSource) revisionError('native-stage-write-authority');
  const snapshot = canonicalRecordJson(backend.snapshot);
  const stable = () => {
    const value = current();
    if (canonicalRecordJson(value) !== canonicalRecordJson(intent) || canonicalRecordJson(backend.snapshot) !== snapshot)
      revisionError('native-stage-write-drift');
  };
  const state = await observeRevision({ context, deps: backend }); stable();
  if (!['applied', 'aborted'].includes(state.status)) revisionError('native-stage-write-authority');
  const history = readMemoryNativeHistory(backend);
  const { reconstructNativeHistory } = await import('./source-correction.mjs'); stable();
  const prior = await reconstructNativeHistory({ history, chain: state.chain, backend, observation: m.observation }); stable();
  if (prior?.status !== 'complete' || prior.approved !== true) revisionError('native-stage-write-predecessor');
  const { reconstructNativeStageHeader } = await import('./stage-execution.mjs'); stable();
  const original = await reconstructNativeStageHeader({ header: intent.header, cursor: prior.observation,
    currentContract: prior.currentContract, planning: prior.planning, proofs: history.proofs, chain: state.chain,
    predecessor: history.order.at(-1)?.id ?? null, retained: m.comments }); stable();
  const journal = { schema: 'aitm.native-stage/v1', header: intent.header, steps: [{ ordinal: 1,
    kind: 'actor-journal-prepare', previous: intent.header.id,
    intent: { journalBytes: original.actorJournalBytes }, readback: null }] };
  validateNativeStageJournal(journal);
  validateNativeStageResources(original.resources, m.observation, m.comments);
  if (m.nativeStageResources && canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(original.resources))
    revisionError('native-stage-current-resources');
  operation(m, 'native-stage-journal-write', () => {
    stable();
    appendNativeReference(m, 'stage', journal.header.id, journal.header.revisionEventHead);
    m.nativeStageRecords.push(clone(journal));
    m.nativeStageResources = clone(original.resources);
    validateNativeOrder(m);
    return true;
  });
  operation(m, 'native-stage-journal-readback', () => {
    current();
    if (canonicalRecordJson(m.nativeStageRecords.at(-1)) !== canonicalRecordJson(journal) ||
        canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(original.resources))
      revisionError('native-stage-journal-readback');
    validateNativeOrder(m); validateNativeStageJournal(m.nativeStageRecords.at(-1));
    return true;
  });
}

// Fixed actor resource serialization under the already-held strict interlock.
// These functions accept only the private saga token and exact native invocation.
async function stageActorAuthority(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation'], 'native-stage-actor-input');
  const { backend, capability, context, token, invocation } = input;
  assertMemoryCapability(backend, capability, context);
  const { readNativeStageActorIntent } = await import('../move-state/move-state-core.mjs');
  assertMemoryCapability(backend, capability, context);
  const intent = readNativeStageActorIntent(token, backend, invocation);
  const m = memory(backend), journal = m.nativeStageRecords.at(-1);
  validateNativeOrder(m); validateNativeStageJournal(journal);
  if (journal.header.id !== intent.header.id || canonicalRecordJson(journal.header) !== canonicalRecordJson(intent.header))
    revisionError('native-stage-actor-authority');
  return { m, journal, current: () => {
    assertMemoryCapability(backend, capability, context);
    readNativeStageActorIntent(token, backend, invocation);
  } };
}
export async function acquireMemoryNativeStageActor(input) {
  const { m, current } = await stageActorAuthority(input); current();
  if (m.nativeActorResourceLock !== null) revisionError('native-stage-actor-lock-conflict');
  m.nativeActorResourceLock = { token: input.token, invocation: input.invocation };
  try {
    const bytes = m.nativeStageResources.local.actorFlush?.bytes ?? null;
    return bytes === null ? null : JSON.parse(bytes);
  } catch (error) { m.nativeActorResourceLock = null; throw error; }
}
export async function writeMemoryNativeStageActor(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation', 'record'], 'native-stage-actor-write-input');
  const { record, ...authority } = input;
  const { m, journal, current } = await stageActorAuthority(authority); current();
  if (m.nativeActorResourceLock?.token !== input.token || m.nativeActorResourceLock?.invocation !== input.invocation)
    revisionError('native-stage-actor-lock');
  const bytes = JSON.stringify(record, null, 2) + '\n';
  if (bytes !== journal.steps[0].intent.journalBytes) revisionError('native-stage-actor-record');
  operation(m, 'native-stage-actor-effect-write', () => {
    current();
    const before = m.nativeStageResources.local.actorFlush;
    if (before !== null && before.bytes !== bytes) revisionError('native-stage-actor-conflict');
    m.nativeStageResources.local.actorFlush = { bytes };
    return true;
  });
  operation(m, 'native-stage-actor-effect-readback', () => {
    current();
    const actual = m.nativeStageResources.local.actorFlush;
    if (actual?.bytes !== bytes) revisionError('native-stage-actor-readback');
    journal.steps[0].readback = { file: journal.header.original.actor.capture.journalFile, bytes: actual.bytes };
    validateNativeStageJournal(journal);
    return true;
  });
}
export function releaseMemoryNativeStageActor({ backend, token, invocation }) {
  const m = memory(backend);
  if (m.nativeActorResourceLock?.token !== token || m.nativeActorResourceLock?.invocation !== invocation)
    revisionError('native-stage-actor-lock');
  m.nativeActorResourceLock = null;
}

// Fixed timing-resource serialization; the unreturned original token and native
// post invocation are mandatory, and no host lock or caller port is selected.
async function stageTimingAuthority(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation'], 'native-stage-timing-input');
  const { backend, capability, context, token, invocation } = input;
  assertMemoryCapability(backend, capability, context);
  const { readNativeStageTimingIntent } = await import('../move-state/move-state-core.mjs');
  assertMemoryCapability(backend, capability, context);
  const intent = readNativeStageTimingIntent(token, backend, invocation);
  const m = memory(backend), journal = m.nativeStageRecords.at(-1);
  validateNativeOrder(m); validateNativeStageJournal(journal);
  if (canonicalRecordJson(journal.header) !== canonicalRecordJson(intent.header)) revisionError('native-stage-timing-authority');
  return { m, journal, ordinal: intent.ordinal, current: () => {
    assertMemoryCapability(backend, capability, context); readNativeStageTimingIntent(token, backend, invocation);
  } };
}
function timingLock(m, input) {
  if (m.nativeTimingResourceLock?.token !== input.token || m.nativeTimingResourceLock?.invocation !== input.invocation)
    revisionError('native-stage-timing-lock');
}
export async function acquireMemoryNativeStageTiming(input) {
  const { m, current } = await stageTimingAuthority(input); current();
  if (m.nativeTimingResourceLock !== null) revisionError('native-stage-timing-lock-conflict');
  m.nativeTimingResourceLock = { token: input.token, invocation: input.invocation };
}
export function releaseMemoryNativeStageTiming(input) {
  exactKeys(input, ['backend', 'token', 'invocation'], 'native-stage-timing-release-input');
  const m = memory(input.backend); timingLock(m, input); m.nativeTimingResourceLock = null;
}
async function deriveTimingStep(journal, steps) {
  const codec = await import('./stage-execution.mjs');
  return steps.length === 2 ? codec.reconstructNativeStageActorTiming({ header: journal.header, first: steps[0], step: steps[1] }) :
    codec.reconstructNativeStagePhaseTiming({ header: journal.header, steps });
}
function timingOperation(ordinal, suffix) {
  if (![2, 11, 12].includes(ordinal)) revisionError('native-stage-timing-ordinal');
  return ordinal === 2 ? `native-stage-timing-${suffix}` : `native-stage-phase-${ordinal}-${suffix}`;
}
export async function persistMemoryNativeStageTiming(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation', 'step'], 'native-stage-timing-persist-input');
  const { step, ...authority } = input;
  const { m, journal, ordinal, current } = await stageTimingAuthority(authority); current(); timingLock(m, input);
  if (![2, 11, 12].includes(ordinal) || journal.steps.length !== ordinal - 1 ||
      journal.steps.at(-1).readback === null || step.ordinal !== ordinal || step.readback !== null)
    revisionError('native-stage-timing-prefix');
  const derived = await deriveTimingStep(journal, [...journal.steps, step]);
  current(); timingLock(m, input);
  if (canonicalRecordJson(derived.beforeResources) !== canonicalRecordJson(m.nativeStageResources)) revisionError('native-stage-timing-prefix');
  operation(m, timingOperation(ordinal, 'intent-write'), () => { current(); journal.steps.push(clone(step)); return true; });
  operation(m, timingOperation(ordinal, 'intent-readback'), () => {
    current(); validateNativeStageJournal(journal);
    if (canonicalRecordJson(journal.steps[ordinal - 1]) !== canonicalRecordJson(step)) revisionError('native-stage-timing-intent-readback');
    return true;
  });
}
export async function writeMemoryNativeStageTiming(input) {
  const { m, journal, ordinal, current } = await stageTimingAuthority(input); current(); timingLock(m, input);
  if (journal.steps.length !== ordinal) revisionError('native-stage-timing-prefix');
  const derived = await deriveTimingStep(journal, journal.steps);
  current(); timingLock(m, input);
  operation(m, timingOperation(ordinal, 'effect-write'), () => {
    current();
    if (canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.beforeResources)) revisionError('native-stage-timing-effect-prefix');
    m.nativeStageResources = clone(derived.afterResources);
    validateNativeStageResources(m.nativeStageResources, m.observation, m.comments);
    return true;
  });
}
export async function completeMemoryNativeStageTiming(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation', 'readback'], 'native-stage-timing-readback-input');
  const { readback, ...authority } = input;
  const { m, journal, ordinal, current } = await stageTimingAuthority(authority); current(); timingLock(m, input);
  if (journal.steps.length !== ordinal) revisionError('native-stage-timing-prefix');
  const steps = [...journal.steps]; steps[ordinal - 1] = { ...steps[ordinal - 1], readback };
  const derived = await deriveTimingStep(journal, steps);
  current(); timingLock(m, input);
  operation(m, timingOperation(ordinal, 'effect-readback'), () => {
    current();
    if (canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.afterResources)) revisionError('native-stage-timing-readback');
    journal.steps[ordinal - 1].readback = clone(readback); validateNativeStageJournal(journal); return true;
  });
}

// One fixed backend cursor resource lock, reachable only from the original
// lexical runtime commit invocation. No host lock or callback is selected.
async function stageCursorAuthority(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation'], 'native-stage-cursor-input');
  const { backend, capability, context, token, invocation } = input;
  assertMemoryCapability(backend, capability, context);
  const { readNativeStageCursorIntent } = await import('../move-state/move-state-core.mjs');
  assertMemoryCapability(backend, capability, context);
  const intent = readNativeStageCursorIntent(token, backend, invocation);
  const m = memory(backend), journal = m.nativeStageRecords.at(-1);
  validateNativeOrder(m); validateNativeStageJournal(journal);
  if (canonicalRecordJson(journal.header) !== canonicalRecordJson(intent.header)) revisionError('native-stage-cursor-authority');
  return { m, journal, current: () => {
    assertMemoryCapability(backend, capability, context); readNativeStageCursorIntent(token, backend, invocation);
  } };
}
function cursorLock(m, input) {
  if (m.nativeCursorResourceLock?.token !== input.token || m.nativeCursorResourceLock?.invocation !== input.invocation)
    revisionError('native-stage-cursor-lock');
}
export async function acquireMemoryNativeStageCursor(input) {
  const { m, current } = await stageCursorAuthority(input); current();
  if (m.nativeCursorResourceLock !== null) revisionError('native-stage-cursor-lock-conflict');
  m.nativeCursorResourceLock = { token: input.token, invocation: input.invocation };
}
export function releaseMemoryNativeStageCursor(input) {
  exactKeys(input, ['backend', 'token', 'invocation'], 'native-stage-cursor-release-input');
  const m = memory(input.backend); cursorLock(m, input); m.nativeCursorResourceLock = null;
}
export async function persistMemoryNativeStageCursor(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation', 'step'], 'native-stage-cursor-persist-input');
  const { step, ...authority } = input;
  const { m, journal, current } = await stageCursorAuthority(authority); current(); cursorLock(m, input);
  if (journal.steps.length !== 2 || journal.steps[1].readback === null || step.readback !== null)
    revisionError('native-stage-cursor-prefix');
  const { reconstructNativeStageActorCursor } = await import('./stage-execution.mjs'); current();
  const derived = await reconstructNativeStageActorCursor({ header: journal.header, first: journal.steps[0], second: journal.steps[1], step });
  current(); cursorLock(m, input);
  if (canonicalRecordJson(derived.beforeResources) !== canonicalRecordJson(m.nativeStageResources)) revisionError('native-stage-cursor-prefix');
  operation(m, 'native-stage-cursor-intent-write', () => { current(); journal.steps.push(clone(step)); return true; });
  operation(m, 'native-stage-cursor-intent-readback', () => {
    current(); validateNativeStageJournal(journal);
    if (canonicalRecordJson(journal.steps[2]) !== canonicalRecordJson(step)) revisionError('native-stage-cursor-intent-readback');
    return true;
  });
}
export async function writeMemoryNativeStageCursor(input) {
  const { m, journal, current } = await stageCursorAuthority(input); current(); cursorLock(m, input);
  const { reconstructNativeStageActorCursor } = await import('./stage-execution.mjs'); current();
  const derived = await reconstructNativeStageActorCursor({ header: journal.header, first: journal.steps[0], second: journal.steps[1], step: journal.steps[2] });
  current(); cursorLock(m, input);
  operation(m, 'native-stage-cursor-effect-write', () => {
    current();
    if (canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.beforeResources)) revisionError('native-stage-cursor-effect-prefix');
    m.nativeStageResources = clone(derived.afterResources);
    validateNativeStageResources(m.nativeStageResources, m.observation, m.comments);
    return true;
  });
}
export async function completeMemoryNativeStageCursor(input) {
  const { m, journal, current } = await stageCursorAuthority(input); current(); cursorLock(m, input);
  const { reconstructNativeStageActorCursor } = await import('./stage-execution.mjs'); current();
  const intent = journal.steps[2].intent;
  const step = { ...journal.steps[2], readback: { file: intent.file, bytes: intent.bytes } };
  const derived = await reconstructNativeStageActorCursor({ header: journal.header, first: journal.steps[0], second: journal.steps[1], step });
  current(); cursorLock(m, input);
  operation(m, 'native-stage-cursor-effect-readback', () => {
    current();
    if (canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.afterResources)) revisionError('native-stage-cursor-readback');
    journal.steps[2].readback = clone(step.readback); validateNativeStageJournal(journal); return true;
  });
}

// Fixed actor checkpoint resources only. The original private program selects
// the ordinal; caller objects cannot select a path, resource, or operation.
async function stageCheckpointAuthority(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation'], 'native-stage-checkpoint-input');
  const { backend, capability, context, token, invocation } = input;
  assertMemoryCapability(backend, capability, context);
  const { readNativeStageCheckpointIntent } = await import('../move-state/move-state-core.mjs');
  assertMemoryCapability(backend, capability, context);
  const intent = readNativeStageCheckpointIntent(token, backend, invocation);
  const m = memory(backend), journal = m.nativeStageRecords.at(-1);
  validateNativeOrder(m); validateNativeStageJournal(journal);
  const key = [4, 5, 6, 8, 9, 10].includes(intent.ordinal) ?
    ['activeTask', 'actorTiming', 'trackerState'][intent.ordinal < 7 ? intent.ordinal - 4 : intent.ordinal - 8] : null;
  if (!key || canonicalRecordJson(journal.header) !== canonicalRecordJson(intent.header)) revisionError('native-stage-checkpoint-authority');
  return { m, journal, key, ordinal: intent.ordinal, current: () => {
    assertMemoryCapability(backend, capability, context);
    if (readNativeStageCheckpointIntent(token, backend, invocation).ordinal !== intent.ordinal) revisionError('native-stage-checkpoint-order');
  } };
}
function checkpointLock(m, input, key) {
  const lock = m.nativeCheckpointResourceLocks[key];
  if (lock?.token !== input.token || lock?.invocation !== input.invocation) revisionError('native-stage-checkpoint-lock');
}
export async function acquireMemoryNativeStageCheckpoint(input) {
  const { m, key, current } = await stageCheckpointAuthority(input); current();
  if (m.nativeCheckpointResourceLocks[key] !== null) revisionError('native-stage-checkpoint-lock-conflict');
  m.nativeCheckpointResourceLocks[key] = { token: input.token, invocation: input.invocation };
}
export function releaseMemoryNativeStageCheckpoint(input) {
  exactKeys(input, ['backend', 'token', 'invocation'], 'native-stage-checkpoint-release-input');
  const m = memory(input.backend);
  const keys = Object.keys(m.nativeCheckpointResourceLocks).filter(key =>
    m.nativeCheckpointResourceLocks[key]?.token === input.token && m.nativeCheckpointResourceLocks[key]?.invocation === input.invocation);
  if (keys.length !== 1) revisionError('native-stage-checkpoint-lock');
  m.nativeCheckpointResourceLocks[keys[0]] = null;
}
export async function persistMemoryNativeStageCheckpoint(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation', 'step'], 'native-stage-checkpoint-persist-input');
  const { step, ...authority } = input;
  const { m, journal, key, ordinal, current } = await stageCheckpointAuthority(authority); current(); checkpointLock(m, input, key);
  if (journal.steps.length !== ordinal - 1 || journal.steps.at(-1).readback === null || step.readback !== null || step.ordinal !== ordinal)
    revisionError('native-stage-checkpoint-prefix');
  const { reconstructNativeStageCheckpointSteps } = await import('./stage-execution.mjs'); current();
  const derived = await reconstructNativeStageCheckpointSteps({ header: journal.header, steps: [...journal.steps, step] });
  current(); checkpointLock(m, input, key);
  if (canonicalRecordJson(derived.beforeResources) !== canonicalRecordJson(m.nativeStageResources)) revisionError('native-stage-checkpoint-prefix');
  operation(m, `native-stage-${ordinal >= 8 ? 'actor-final-' : ''}${step.kind}-intent-write`, () => { current(); journal.steps.push(clone(step)); return true; });
  operation(m, `native-stage-${ordinal >= 8 ? 'actor-final-' : ''}${step.kind}-intent-readback`, () => {
    current(); validateNativeStageJournal(journal);
    if (canonicalRecordJson(journal.steps[ordinal - 1]) !== canonicalRecordJson(step)) revisionError('native-stage-checkpoint-intent-readback');
    return true;
  });
}
export async function writeMemoryNativeStageCheckpoint(input) {
  const { m, journal, key, ordinal, current } = await stageCheckpointAuthority(input); current(); checkpointLock(m, input, key);
  if (journal.steps.length !== ordinal || journal.steps.at(-1).readback !== null) revisionError('native-stage-checkpoint-prefix');
  const { reconstructNativeStageCheckpointSteps } = await import('./stage-execution.mjs'); current();
  const derived = await reconstructNativeStageCheckpointSteps({ header: journal.header, steps: journal.steps });
  current(); checkpointLock(m, input, key);
  operation(m, `native-stage-${ordinal >= 8 ? 'actor-final-' : ''}${journal.steps.at(-1).kind}-effect-write`, () => {
    current();
    if (canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.beforeResources)) revisionError('native-stage-checkpoint-effect-prefix');
    m.nativeStageResources = clone(derived.afterResources);
    validateNativeStageResources(m.nativeStageResources, m.observation, m.comments);
    return true;
  });
}
export async function completeMemoryNativeStageCheckpoint(input) {
  const { m, journal, key, ordinal, current } = await stageCheckpointAuthority(input); current(); checkpointLock(m, input, key);
  if (journal.steps.length !== ordinal || journal.steps.at(-1).readback !== null) revisionError('native-stage-checkpoint-prefix');
  const { reconstructNativeStageCheckpointSteps } = await import('./stage-execution.mjs'); current();
  const intent = journal.steps.at(-1).intent, readback = { file: intent.file, bytes: intent.bytes };
  const steps = clone(journal.steps); steps.at(-1).readback = readback;
  const derived = await reconstructNativeStageCheckpointSteps({ header: journal.header, steps });
  current(); checkpointLock(m, input, key);
  operation(m, `native-stage-${ordinal >= 8 ? 'actor-final-' : ''}${journal.steps.at(-1).kind}-effect-readback`, () => {
    current();
    if (canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.afterResources)) revisionError('native-stage-checkpoint-readback');
    journal.steps.at(-1).readback = clone(readback); validateNativeStageJournal(journal); return true;
  });
}

async function stageActorRemovalAuthority(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation'], 'native-stage-removal-input');
  const { backend, capability, context, token, invocation } = input;
  assertMemoryCapability(backend, capability, context);
  const { readNativeStageActorRemovalIntent } = await import('../move-state/move-state-core.mjs');
  assertMemoryCapability(backend, capability, context);
  const original = readNativeStageActorRemovalIntent(token, backend, invocation);
  const m = memory(backend), journal = m.nativeStageRecords.at(-1);
  validateNativeOrder(m); validateNativeStageJournal(journal);
  if (canonicalRecordJson(journal.header) !== canonicalRecordJson(original.header) ||
      m.nativeActorResourceLock?.token !== token || m.nativeActorResourceLock?.invocation !== invocation)
    revisionError('native-stage-removal-authority');
  return { m, journal, current: () => {
    assertMemoryCapability(backend, capability, context); readNativeStageActorRemovalIntent(token, backend, invocation);
    if (m.nativeActorResourceLock?.token !== token || m.nativeActorResourceLock?.invocation !== invocation)
      revisionError('native-stage-actor-lock');
  } };
}
export async function persistMemoryNativeStageActorRemoval(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation', 'step'], 'native-stage-removal-persist-input');
  const { step, ...authority } = input;
  const { m, journal, current } = await stageActorRemovalAuthority(authority); current();
  if (journal.steps.length !== 6 || journal.steps[5].readback === null || step.readback !== null)
    revisionError('native-stage-removal-prefix');
  const { reconstructNativeStageActorRemoval } = await import('./stage-execution.mjs'); current();
  const derived = await reconstructNativeStageActorRemoval({ header: journal.header, steps: [...journal.steps, step] }); current();
  if (canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.beforeResources)) revisionError('native-stage-removal-prefix');
  operation(m, 'native-stage-removal-intent-write', () => { current(); journal.steps.push(clone(step)); return true; });
  operation(m, 'native-stage-removal-intent-readback', () => {
    current(); validateNativeStageJournal(journal);
    if (canonicalRecordJson(journal.steps[6]) !== canonicalRecordJson(step)) revisionError('native-stage-removal-intent-readback');
    return true;
  });
}
export async function writeMemoryNativeStageActorRemoval(input) {
  const { m, journal, current } = await stageActorRemovalAuthority(input); current();
  if (journal.steps.length !== 7 || journal.steps[6].readback !== null) revisionError('native-stage-removal-prefix');
  const { reconstructNativeStageActorRemoval } = await import('./stage-execution.mjs'); current();
  const derived = await reconstructNativeStageActorRemoval({ header: journal.header, steps: journal.steps }); current();
  operation(m, 'native-stage-removal-effect-write', () => {
    current();
    if (canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.beforeResources)) revisionError('native-stage-removal-effect-prefix');
    m.nativeStageResources.local.actorFlush = null;
    if (canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.afterResources)) revisionError('native-stage-removal-effect-vector');
    return true;
  });
}
export async function completeMemoryNativeStageActorRemoval(input) {
  const { m, journal, current } = await stageActorRemovalAuthority(input); current();
  if (journal.steps.length !== 7 || journal.steps[6].readback !== null) revisionError('native-stage-removal-prefix');
  const { reconstructNativeStageActorRemoval } = await import('./stage-execution.mjs'); current();
  const readback = { file: journal.steps[6].intent.file, bytes: null };
  const steps = clone(journal.steps); steps[6].readback = readback;
  const derived = await reconstructNativeStageActorRemoval({ header: journal.header, steps }); current();
  operation(m, 'native-stage-removal-effect-readback', () => {
    current();
    if (canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.afterResources)) revisionError('native-stage-removal-readback');
    journal.steps[6].readback = clone(readback); validateNativeStageJournal(journal); return true;
  });
}


// Original native entry intent and fixed memory effect protocol. Readback
// custody is process-private and cannot be reconstructed from snapshot data.
const nativeBodyIntentReads = new WeakSet();
async function stageBodyAuthority(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation'], 'native-stage-body-input');
  const { backend, capability, context, token, invocation } = input;
  assertMemoryCapability(backend, capability, context);
  const { readNativeStageBodyIntent } = await import('../move-state/move-state-core.mjs');
  assertMemoryCapability(backend, capability, context);
  const intent = readNativeStageBodyIntent(token, backend, invocation);
  const m = memory(backend), journal = m.nativeStageRecords.at(-1);
  validateNativeOrder(m); validateNativeStageJournal(journal);
  if (canonicalRecordJson(journal.header) !== canonicalRecordJson(intent.header)) revisionError('native-stage-body-authority');
  return { m, journal, current: () => {
    assertMemoryCapability(backend, capability, context);
    readNativeStageBodyIntent(token, backend, invocation);
  } };
}
function bodyLock(m, input) {
  if (m.nativeBodyResourceLock?.token !== input.token || m.nativeBodyResourceLock?.invocation !== input.invocation)
    revisionError('native-stage-body-lock');
}
export async function acquireMemoryNativeStageBody(input) {
  const { m, current } = await stageBodyAuthority(input); current();
  if (m.nativeBodyResourceLock !== null) revisionError('native-stage-body-lock-conflict');
  m.nativeBodyResourceLock = { token: input.token, invocation: input.invocation };
}
export function releaseMemoryNativeStageBody(input) {
  exactKeys(input, ['backend', 'token', 'invocation'], 'native-stage-body-release-input');
  const m = memory(input.backend); bodyLock(m, input); m.nativeBodyResourceLock = null;
}
export async function persistMemoryNativeStageBody(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation', 'step'], 'native-stage-body-persist-input');
  const { step, ...authority } = input;
  const { m, journal, current } = await stageBodyAuthority(authority); current(); bodyLock(m, input);
  if (journal.steps.length !== 12 || journal.steps[11].readback === null || step.readback !== null)
    revisionError('native-stage-body-prefix');
  const { reconstructNativeStageEntryBody } = await import('./stage-execution.mjs'); current();
  const derived = await reconstructNativeStageEntryBody({ header: journal.header, steps: [...journal.steps, step] });
  current(); bodyLock(m, input);
  if (canonicalRecordJson(m.observation.body) !== canonicalRecordJson(derived.beforeBody) ||
      canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.resources)) revisionError('native-stage-body-before');
  operation(m, 'native-stage-body-intent-write', () => {
    current(); bodyLock(m, input); journal.steps.push(clone(step)); return true;
  });
  operation(m, 'native-stage-body-intent-readback', () => {
    current(); bodyLock(m, input); validateNativeStageJournal(journal);
    if (canonicalRecordJson(journal.steps[12]) !== canonicalRecordJson(step) ||
        canonicalRecordJson(m.observation.body) !== canonicalRecordJson(derived.beforeBody) ||
        canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.resources)) revisionError('native-stage-body-intent-readback');
    nativeBodyIntentReads.add(journal.steps[12]); return true;
  });
}
// Returnless original readback-membership comparison; neither a snapshot nor
// caller step can enter the private set or substitute for fresh core checks.
export function assertMemoryNativeStageBodyIntent(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation'], 'native-stage-body-input');
  assertMemoryCapability(input.backend, input.capability, input.context);
  const m = memory(input.backend); bodyLock(m, input);
  const journal = m.nativeStageRecords.at(-1); validateNativeOrder(m); validateNativeStageJournal(journal);
  if (journal.steps.length !== 13 || journal.steps[12].readback !== null ||
      !nativeBodyIntentReads.has(journal.steps[12])) revisionError('native-stage-body-intent-unread');
}


// Fixed memory-only effect, selected solely by original lexical invocation.
// This cannot fall through to a host transport or accept arbitrary after bytes.
export async function writeMemoryNativeStageBody(input) {
  const { m, journal, current } = await stageBodyAuthority(input); current();
  assertMemoryNativeStageBodyIntent(input);
  const { reconstructNativeStageEntryBody } = await import('./stage-execution.mjs'); current();
  const derived = await reconstructNativeStageEntryBody({ header: journal.header, steps: journal.steps });
  current(); assertMemoryNativeStageBodyIntent(input);
  operation(m, 'native-stage-body-effect-write', () => {
    current(); assertMemoryNativeStageBodyIntent(input);
    if (canonicalRecordJson(m.observation.body) !== canonicalRecordJson(derived.beforeBody) ||
        canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.resources)) revisionError('native-stage-body-effect-prefix');
    m.observation.body = clone(derived.afterBody); validateRevisionObservation(m.observation); return true;
  });
}
export async function completeMemoryNativeStageBody(input) {
  const { m, journal, current } = await stageBodyAuthority(input); current();
  assertMemoryNativeStageBodyIntent(input);
  const { ghFetchArgs } = await import('../versioned-issue-write.mjs'); current();
  const args = ghFetchArgs(journal.header.scope.repository, journal.header.scope.issue);
  // Independent current resource reads preserve CLI framing and exact JSON data.
  const readback = {
    request: { file: 'gh', args }, response: { stdout: m.observation.body.bytes + '\n', stderr: '', exitCode: 0 },
    resource: { request: { file: 'gh', args: args.slice(0, -2) },
      response: { stdout: JSON.stringify({ body: m.observation.body.bytes }), stderr: '', exitCode: 0 } },
  };
  const { reconstructNativeStageEntryBody } = await import('./stage-execution.mjs'); current();
  const steps = [...journal.steps]; steps[12] = { ...steps[12], readback };
  const derived = await reconstructNativeStageEntryBody({ header: journal.header, steps });
  current(); assertMemoryNativeStageBodyIntent(input);
  operation(m, 'native-stage-body-effect-readback', () => {
    current(); assertMemoryNativeStageBodyIntent(input);
    if (canonicalRecordJson(m.observation.body) !== canonicalRecordJson(derived.afterBody) ||
        canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.resources) ||
        derived.readbackBody !== m.observation.body.bytes) revisionError('native-stage-body-effect-readback');
    journal.steps[12].readback = clone(readback); validateNativeStageJournal(journal); return true;
  });
  return readback.response.stdout;
}


function assertSentinelStoreInput(input, keys) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype) revisionError('native-stage-sentinel-input');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key =>
      !descriptors[key] || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable))
    revisionError('native-stage-sentinel-input');
}
// Private closure over the original descriptor/value snapshot. Rechecking it
// never reads an accessor; callers cannot replace authority while an await yields.
function sentinelStoreInputContinuity(input, keys) {
  assertSentinelStoreInput(input, keys);
  const original = Object.getOwnPropertyDescriptors(input);
  const context = original.context.value;
  const contextBytes = () => {
    try {
      if (!context || Object.getPrototypeOf(context) !== Object.prototype) throw new TypeError();
      return canonicalRecordJson(context);
    } catch { revisionError('native-stage-sentinel-context'); }
  };
  const originalContextBytes = contextBytes();
  return () => {
    assertSentinelStoreInput(input, keys);
    const actual = Object.getOwnPropertyDescriptors(input);
    if (keys.some(key => {
      const a = actual[key], b = original[key];
      return a.value !== b.value || a.enumerable !== b.enumerable ||
        a.configurable !== b.configurable || a.writable !== b.writable;
    })) revisionError('native-stage-sentinel-input-changed');
    if (contextBytes() !== originalContextBytes) revisionError('native-stage-sentinel-context-changed');
  };
}
const nativeSentinelIntentReads = new WeakSet();
async function stageSentinelAuthority(input) {
  const unchanged = sentinelStoreInputContinuity(input, ['backend', 'capability', 'context', 'token', 'invocation']);
  const { backend, capability, context, token, invocation } = input;
  assertMemoryCapability(backend, capability, context);
  const { readNativeStageSentinelIntent } = await import('../move-state/move-state-core.mjs');
  unchanged(); assertMemoryCapability(backend, capability, context);
  const intent = readNativeStageSentinelIntent(token, backend, invocation, context);
  const m = memory(backend), journal = m.nativeStageRecords.at(-1);
  validateNativeOrder(m); validateNativeStageJournal(journal);
  if (canonicalRecordJson(journal.header) !== canonicalRecordJson(intent.header)) revisionError('native-stage-sentinel-authority');
  return { m, journal, current: () => {
    unchanged();
    assertMemoryCapability(backend, capability, context);
    readNativeStageSentinelIntent(token, backend, invocation, context);
    validateNativeOrder(m); validateNativeStageJournal(journal); bodyLock(m, input);
    if (m.nativeStageRecords.at(-1) !== journal || canonicalRecordJson(journal.header) !== canonicalRecordJson(intent.header))
      revisionError('native-stage-sentinel-authority');
  } };
}
export async function persistMemoryNativeStageSentinel(input) {
  const unchanged = sentinelStoreInputContinuity(input, ['backend', 'capability', 'context', 'token', 'invocation', 'step']);
  const { step: suppliedStep, ...authority } = input;
  const step = JSON.parse(canonicalRecordJson(suppliedStep));
  const { m, journal, current: currentAuthority } = await stageSentinelAuthority(authority);
  const current = () => { unchanged(); currentAuthority(); };
  current(); bodyLock(m, input);
  if (journal.steps.length !== 14 || journal.steps[13].readback === null || step.readback !== null)
    revisionError('native-stage-sentinel-prefix');
  const { reconstructNativeStageSentinel } = await import('./stage-execution.mjs'); current();
  const derived = await reconstructNativeStageSentinel({ header: journal.header, steps: [...journal.steps, step] });
  current(); bodyLock(m, input);
  if (canonicalRecordJson(m.observation.body) !== canonicalRecordJson(derived.beforeBody) ||
      m.observation.stage !== derived.stage ||
        canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.resources)) revisionError('native-stage-sentinel-before');
  operation(m, 'native-stage-sentinel-intent-write', () => {
    current(); bodyLock(m, input); journal.steps.push(clone(step)); return true;
  });
  operation(m, 'native-stage-sentinel-intent-readback', () => {
    current(); bodyLock(m, input); validateNativeStageJournal(journal);
    if (canonicalRecordJson(journal.steps[14]) !== canonicalRecordJson(step) ||
        canonicalRecordJson(m.observation.body) !== canonicalRecordJson(derived.beforeBody) ||
        m.observation.stage !== derived.stage ||
        canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.resources)) revisionError('native-stage-sentinel-intent-readback');
    nativeSentinelIntentReads.add(journal.steps[14]); return true;
  });
}
// Returnless original readback-membership comparison; neither a snapshot nor
// caller step can enter the private set or substitute for fresh core checks.
export function assertMemoryNativeStageSentinelIntent(input) {
  const unchanged = sentinelStoreInputContinuity(input, ['backend', 'capability', 'context', 'token', 'invocation']);
  unchanged();
  assertMemoryCapability(input.backend, input.capability, input.context);
  const m = memory(input.backend); bodyLock(m, input);
  const journal = m.nativeStageRecords.at(-1); validateNativeOrder(m); validateNativeStageJournal(journal);
  if (journal.steps.length !== 15 || journal.steps[14].readback !== null ||
      !nativeSentinelIntentReads.has(journal.steps[14])) revisionError('native-stage-sentinel-intent-unread');
}


// Fixed memory-only effect, selected solely by original lexical invocation.
// This cannot fall through to a host transport or accept arbitrary after bytes.
export async function writeMemoryNativeStageSentinel(input) {
  const { m, journal, current } = await stageSentinelAuthority(input); current();
  assertMemoryNativeStageSentinelIntent(input);
  const { reconstructNativeStageSentinel } = await import('./stage-execution.mjs'); current();
  const derived = await reconstructNativeStageSentinel({ header: journal.header, steps: journal.steps });
  current(); assertMemoryNativeStageSentinelIntent(input);
  operation(m, 'native-stage-sentinel-effect-write', () => {
    current(); assertMemoryNativeStageSentinelIntent(input);
    if (canonicalRecordJson(m.observation.body) !== canonicalRecordJson(derived.beforeBody) ||
        m.observation.stage !== derived.stage ||
        canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.resources)) revisionError('native-stage-sentinel-effect-prefix');
    m.observation.body = clone(derived.afterBody); validateRevisionObservation(m.observation); return true;
  });
}
export async function completeMemoryNativeStageSentinel(input) {
  const { m, journal, current } = await stageSentinelAuthority(input); current();
  assertMemoryNativeStageSentinelIntent(input);
  const { ghFetchArgs } = await import('../versioned-issue-write.mjs'); current();
  const args = ghFetchArgs(journal.header.scope.repository, journal.header.scope.issue);
  // Independent current resource reads preserve CLI framing and exact JSON data.
  const readback = {
    request: { file: 'gh', args }, response: { stdout: m.observation.body.bytes + '\n', stderr: '', exitCode: 0 },
    resource: { request: { file: 'gh', args: args.slice(0, -2) },
      response: { stdout: JSON.stringify({ body: m.observation.body.bytes }), stderr: '', exitCode: 0 } },
  };
  const { reconstructNativeStageSentinel } = await import('./stage-execution.mjs'); current();
  const steps = [...journal.steps]; steps[14] = { ...steps[14], readback };
  const derived = await reconstructNativeStageSentinel({ header: journal.header, steps });
  current(); assertMemoryNativeStageSentinelIntent(input);
  operation(m, 'native-stage-sentinel-effect-readback', () => {
    current(); assertMemoryNativeStageSentinelIntent(input);
    if (canonicalRecordJson(m.observation.body) !== canonicalRecordJson(derived.afterBody) ||
        m.observation.stage !== derived.stage ||
        canonicalRecordJson(m.nativeStageResources) !== canonicalRecordJson(derived.resources) ||
        derived.readbackBody !== m.observation.body.bytes) revisionError('native-stage-sentinel-effect-readback');
    journal.steps[14].readback = clone(readback); validateNativeStageJournal(journal); return true;
  });
  return readback.response.stdout;
}



// Fixed Board14 memory resource protocol; no host transport fallback exists.
const nativeBoardIntentReads = new WeakSet();
const nativeBoardAttemptReads = new WeakSet();
async function stageBoardAuthority(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation'], 'native-stage-board-input');
  // This common five-field input refuses accessors before reading authority values.
  // Original lexical callers supply only these plain own data properties.
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(descriptors).length !== 5 ||
      Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' ||
        !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable))
    revisionError('native-stage-board-input');
  const { backend, capability, context, token, invocation } = input;
  assertMemoryCapability(backend, capability, context);
  const { readNativeStageBoardIntent } = await import('../move-state/move-state-core.mjs');
  assertMemoryCapability(backend, capability, context);
  const original = readNativeStageBoardIntent(token, backend, invocation);
  const m = memory(backend), journal = m.nativeStageRecords.at(-1);
  validateNativeOrder(m); validateNativeStageJournal(journal);
  if (canonicalRecordJson(journal.header) !== canonicalRecordJson(original.header)) revisionError('native-stage-board-authority');
  return { m, journal, current: () => {
    assertMemoryCapability(backend, capability, context);
    readNativeStageBoardIntent(token, backend, invocation);
  } };
}
function boardLock(m, input) {
  if (m.nativeBoardResourceLock?.token !== input.token || m.nativeBoardResourceLock?.invocation !== input.invocation)
    revisionError('native-stage-board-lock');
}
async function boardDerived(journal, current, steps = journal.steps) {
  const { reconstructNativeStageBoard } = await import('./stage-execution.mjs'); current();
  const derived = await reconstructNativeStageBoard({ header: journal.header, steps }); current(); return derived;
}
function boardVector(m, derived) {
  if (canonicalRecordJson(m.observation.body) !== canonicalRecordJson(derived.body)) revisionError('native-stage-board-body');
  const before = derived.beforeRecognized && m.observation.stage === derived.beforeStage &&
    canonicalRecordJson(m.nativeStageResources) === canonicalRecordJson(derived.beforeResources);
  const after = derived.afterRecognized && m.observation.stage === derived.afterStage &&
    canonicalRecordJson(m.nativeStageResources) === canonicalRecordJson(derived.afterResources);
  if (!before && !after) revisionError('native-stage-board-vector');
}
function boardIntent(m, journal, input) {
  boardLock(m, input);
  if (journal.steps.length !== 14 || !nativeBoardIntentReads.has(journal.steps[13]) || journal.steps[13].readback !== null)
    revisionError('native-stage-board-intent-unread');
  return journal.steps[13];
}
export async function acquireMemoryNativeStageBoard(input) {
  const { m, current } = await stageBoardAuthority(input); current();
  if (m.nativeBoardResourceLock !== null) revisionError('native-stage-board-lock-conflict');
  m.nativeBoardResourceLock = { token: input.token, invocation: input.invocation };
}
export function releaseMemoryNativeStageBoard(input) {
  exactKeys(input, ['backend', 'token', 'invocation'], 'native-stage-board-release-input');
  const m = memory(input.backend); boardLock(m, input); m.nativeBoardResourceLock = null;
}
export async function persistMemoryNativeStageBoard(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation', 'step'], 'native-stage-board-persist-input');
  const { step, ...authority } = input;
  const { m, journal, current } = await stageBoardAuthority(authority); current(); boardLock(m, input);
  if (journal.steps.length !== 13 || journal.steps[12].readback === null || step.attempts.length ||
      step.outcome !== null || step.readback !== null) revisionError('native-stage-board-intent-prefix');
  const derived = await boardDerived(journal, current, [...journal.steps, step]); current(); boardLock(m, input); boardVector(m, derived);
  operation(m, 'native-stage-board-intent-write', () => { current(); boardLock(m, input); boardVector(m, derived); journal.steps.push(clone(step)); return true; });
  operation(m, 'native-stage-board-intent-readback', () => {
    current(); boardLock(m, input); boardVector(m, derived); validateNativeStageJournal(journal);
    if (canonicalRecordJson(journal.steps[13]) !== canonicalRecordJson(step)) revisionError('native-stage-board-intent-readback');
    nativeBoardIntentReads.add(journal.steps[13]); return true;
  });
}
// The native query sees its original first20 ordering. The initial supported
// topology has exactly one independently captured item; no configured-only
// projection is manufactured from a larger or partial source.
function boardMembers(journal, m) {
  const original = journal.header.original.membership.reads.membership.flatMap(pair => pair.response.repository.issue.projectItems.nodes);
  const item = JSON.parse(m.nativeStageResources.membership.bytes);
  if (original.length !== 1 || original[0].id !== item.id || !item.content.id || item.content.id !== original[0].content.id)
    revisionError('native-stage-board-topology');
  return [item];
}
export async function readMemoryNativeStageBoardItem(input) {
  const { m, journal, current } = await stageBoardAuthority(input); current(); boardIntent(m, journal, input);
  const derived = await boardDerived(journal, current); current(); boardVector(m, derived);
  const members = boardMembers(journal, m);
  return clone({ repository: { issue: { id: members[0].content.id,
    projectItems: { nodes: members.slice(0, 20).map(item => ({ id: item.id, project: clone(item.project) })) } } } });
}
async function recordedBoardStatusPair(m, journal, current, number) {
  const source = journal.header.guardCapture.lifecycleSources.remote.stageStatus;
  if (!source || canonicalRecordJson(source) !== canonicalRecordJson(m.lifecycleSources.remote.stageStatus))
    revisionError('native-stage-board-status-source');
  const { deriveRecordedStageStatusSource } = await import('./stage-execution.mjs'); current();
  const data = await deriveRecordedStageStatusSource({ observation: journal.header.original.observation,
    lifecycleSources: journal.header.guardCapture.lifecycleSources, projectId: journal.header.intent.projectId }); current();
  const pair = data.reads[number - 1];
  if (!pair || pair.attempt !== number || canonicalRecordJson(source) !== canonicalRecordJson(m.lifecycleSources.remote.stageStatus))
    revisionError('native-stage-board-status-source');
  return pair;
}
export async function persistMemoryNativeStageBoardAttempt(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation', 'attempt'], 'native-stage-board-attempt-input');
  const { attempt, ...authority } = input;
  const { m, journal, current } = await stageBoardAuthority(authority); current();
  const step = boardIntent(m, journal, input);
  if (Object.hasOwn(journal.header.guardCapture.lifecycleSources.remote, 'stageStatus')) {
    await recordedBoardStatusPair(m, journal, current, attempt.number); current(); boardIntent(m, journal, input);
  }
  if (step.outcome !== null || attempt.write !== null || attempt.read !== null || attempt.after !== null ||
      canonicalRecordJson(attempt.before) !== canonicalRecordJson({ stage: m.observation.stage, membership: m.nativeStageResources.membership }))
    revisionError('native-stage-board-attempt-before');
  const steps = clone(journal.steps); steps[13].attempts.push(clone(attempt));
  const derived = await boardDerived(journal, current, steps); current(); boardIntent(m, journal, input); boardVector(m, derived);
  operation(m, 'native-stage-board-attempt-intent-write', () => {
    current(); boardIntent(m, journal, input); boardVector(m, derived); step.attempts.push(clone(attempt)); return true;
  });
  operation(m, 'native-stage-board-attempt-intent-readback', () => {
    current(); boardIntent(m, journal, input); boardVector(m, derived);
    if (canonicalRecordJson(step.attempts.at(-1)) !== canonicalRecordJson(attempt)) revisionError('native-stage-board-attempt-readback');
    nativeBoardAttemptReads.add(step.attempts.at(-1)); return true;
  });
}
export async function writeMemoryNativeStageBoard(input) {
  const { m, journal, current } = await stageBoardAuthority(input); current();
  const step = boardIntent(m, journal, input), attempt = step.attempts.at(-1);
  if (!attempt || !nativeBoardAttemptReads.has(attempt) || attempt.write !== null || attempt.read !== null || attempt.after !== null)
    revisionError('native-stage-board-attempt-unread');
  const derived = await boardDerived(journal, current); current(); boardIntent(m, journal, input); boardVector(m, derived);
  operation(m, 'native-stage-board-effect-write', () => {
    current(); boardIntent(m, journal, input); boardVector(m, derived);
    if (canonicalRecordJson(attempt.before) !== canonicalRecordJson({ stage: m.observation.stage, membership: m.nativeStageResources.membership }))
      revisionError('native-stage-board-effect-before');
    m.nativeStageResources = clone(derived.afterResources); m.observation.stage = derived.afterStage;
    validateNativeStageResources(m.nativeStageResources, m.observation, m.comments); validateRevisionObservation(m.observation); return true;
  });
  operation(m, 'native-stage-board-write-return', () => {
    current(); boardIntent(m, journal, input); boardVector(m, derived);
    attempt.write = { kind: 'returned', stdout: '' }; return true;
  });
  return '';
}
function boardStatusData(journal, m) {
  return { repository: { issue: { projectItems: { nodes: boardMembers(journal, m).slice(0, 10).map(item => {
    const status = item.fieldValues.nodes.find(field => field.field.name === 'Status');
    return { project: clone(item.project), fieldValueByName: status ? { optionId: status.optionId } : null };
  }) } } } };
}
export async function readMemoryNativeStageBoardStatus(input) {
  const { m, journal, current } = await stageBoardAuthority(input); current();
  const step = boardIntent(m, journal, input), attempt = step.attempts.at(-1);
  if (!attempt || attempt.write?.kind !== 'returned' || attempt.read !== null) revisionError('native-stage-board-status-prefix');
  const derived = await boardDerived(journal, current); current(); boardIntent(m, journal, input); boardVector(m, derived);
  if (Object.hasOwn(journal.header.guardCapture.lifecycleSources.remote, 'stageStatus')) {
    const pair = await recordedBoardStatusPair(m, journal, current, attempt.number);
    current(); boardIntent(m, journal, input); boardVector(m, derived);
    return clone(pair.transport);
  }
  return clone(boardStatusData(journal, m));
}
export async function recordMemoryNativeStageBoardStatus(input) {
  const { m, journal, current } = await stageBoardAuthority(input); current();
  const step = boardIntent(m, journal, input), attempt = step.attempts.at(-1);
  if (!attempt || attempt.write?.kind !== 'returned' || attempt.read !== null || attempt.after !== null)
    revisionError('native-stage-board-status-prefix');
  const { STATUS_OPTION_QUERY } = await import('../move-state/github-mutation.mjs'); current();
  const [owner, repo] = journal.header.scope.repository.split('/');
  const read = { kind: 'returned', request: { query: STATUS_OPTION_QUERY, variables: { owner, repo, issue: journal.header.scope.issue } },
    response: boardStatusData(journal, m) };
  const after = { stage: m.observation.stage, membership: clone(m.nativeStageResources.membership) };
  const steps = clone(journal.steps); Object.assign(steps[13].attempts.at(-1), { read, after });
  const derived = await boardDerived(journal, current, steps); current(); boardIntent(m, journal, input); boardVector(m, derived);
  operation(m, 'native-stage-board-attempt-readback', () => {
    current(); boardIntent(m, journal, input); boardVector(m, derived);
    if (canonicalRecordJson(read.response) !== canonicalRecordJson(boardStatusData(journal, m)) ||
        canonicalRecordJson(after) !== canonicalRecordJson({ stage: m.observation.stage, membership: m.nativeStageResources.membership }))
      revisionError('native-stage-board-status-drift');
    attempt.read = clone(read); attempt.after = clone(after); return true;
  });
}
export async function recordMemoryNativeStageBoardStatusSource(input) {
  const { m, journal, current } = await stageBoardAuthority(input); current();
  const step = boardIntent(m, journal, input), attempt = step.attempts.at(-1);
  if (!attempt || attempt.write?.kind !== 'returned' || attempt.read !== null || attempt.after !== null)
    revisionError('native-stage-board-status-prefix');
  const pair = await recordedBoardStatusPair(m, journal, current, attempt.number); current();
  const { readNativeStageBoardStatusFacts } = await import('../move-state/move-state-core.mjs'); current();
  const facts = readNativeStageBoardStatusFacts(input.token, input.backend, input.invocation);
  const expected = { transport: pair.transport, ...pair.derivation };
  if (canonicalRecordJson(facts) !== canonicalRecordJson(expected)) revisionError('native-stage-board-status-custody');
  const read = { request: pair.request, ...facts };
  const after = { stage: m.observation.stage, membership: clone(m.nativeStageResources.membership) };
  const steps = clone(journal.steps); Object.assign(steps[13].attempts.at(-1), { read, after });
  const derived = await boardDerived(journal, current, steps); current(); boardIntent(m, journal, input); boardVector(m, derived);
  const unchanged = () => {
    current(); boardIntent(m, journal, input); boardVector(m, derived);
    if (canonicalRecordJson(readNativeStageBoardStatusFacts(input.token, input.backend, input.invocation)) !== canonicalRecordJson(expected) ||
        canonicalRecordJson(after) !== canonicalRecordJson({ stage: m.observation.stage, membership: m.nativeStageResources.membership }))
      revisionError('native-stage-board-status-drift');
  };
  operation(m, 'native-stage-board-attempt-readback', () => {
    unchanged(); attempt.read = clone(read); attempt.after = clone(after); return true;
  });
  operation(m, 'native-stage-board-source-readback', () => {
    unchanged(); validateNativeStageJournal(journal);
    if (canonicalRecordJson(attempt.read) !== canonicalRecordJson(read) || canonicalRecordJson(attempt.after) !== canonicalRecordJson(after))
      revisionError('native-stage-board-status-readback');
    return true;
  });
}
export async function completeMemoryNativeStageBoard(input) {
  exactKeys(input, ['backend', 'capability', 'context', 'token', 'invocation', 'outcome'], 'native-stage-board-complete-input');
  const { outcome, ...authority } = input;
  const { m, journal, current } = await stageBoardAuthority(authority); current();
  const step = boardIntent(m, journal, input);
  if (step.outcome !== null) revisionError('native-stage-board-outcome-prefix');
  const readback = outcome.kind === 'confirmed' ? { attempt: step.attempts.length, stage: m.observation.stage,
    membership: clone(m.nativeStageResources.membership) } : null;
  const steps = clone(journal.steps); Object.assign(steps[13], { outcome, readback });
  const derived = await boardDerived(journal, current, steps); current(); boardIntent(m, journal, input); boardVector(m, derived);
  operation(m, 'native-stage-board-outcome-write', () => { current(); boardIntent(m, journal, input); boardVector(m, derived); step.outcome = clone(outcome); return true; });
  if (readback !== null) operation(m, 'native-stage-board-effect-readback', () => {
    current(); boardIntent(m, journal, input); boardVector(m, derived); step.readback = clone(readback); validateNativeStageJournal(journal); return true;
  });
}


// The error DATA comes only from the actual still-live lexical throw. A public
// caller cannot supply fields, replace returned stdout, or complete a board.
export async function recordMemoryNativeStageBoardFailure(input) {
  const { m, journal, current } = await stageBoardAuthority(input); current();
  const step = boardIntent(m, journal, input), attempt = step.attempts.at(-1);
  if (!attempt || attempt.write !== null || attempt.read !== null || attempt.after !== null || step.outcome !== null ||
      !nativeBoardAttemptReads.has(attempt)) revisionError('native-stage-board-failure-prefix');
  const { readNativeStageBoardFailure } = await import('../move-state/move-state-core.mjs'); current();
  const facts = readNativeStageBoardFailure(input.token, input.backend, input.invocation);
  const unchangedFailure = () => {
    assertMemoryCapability(input.backend, input.capability, input.context);
    boardIntent(m, journal, input);
    if (canonicalRecordJson(readNativeStageBoardFailure(input.token, input.backend, input.invocation)) !== canonicalRecordJson(facts))
      revisionError('native-stage-board-failure-drift');
  };
  const outcome = { kind: 'exception', attempt: step.attempts.length, exit: null };
  const steps = clone(journal.steps); steps[13].attempts.at(-1).write = clone(facts); steps[13].outcome = outcome;
  const derived = await boardDerived(journal, unchangedFailure, steps); unchangedFailure(); boardVector(m, derived);
  operation(m, 'native-stage-board-exception-write', () => {
    unchangedFailure(); boardVector(m, derived); attempt.write = clone(facts); return true;
  });
  operation(m, 'native-stage-board-exception-readback', () => {
    unchangedFailure(); boardVector(m, derived);
    if (canonicalRecordJson(attempt.write) !== canonicalRecordJson(facts) || attempt.read !== null || attempt.after !== null)
      revisionError('native-stage-board-failure-readback');
    return true;
  });
  operation(m, 'native-stage-board-exception-outcome-write', () => {
    unchangedFailure(); boardVector(m, derived); step.outcome = clone(outcome); return true;
  });
  operation(m, 'native-stage-board-exception-outcome-readback', () => {
    unchangedFailure(); boardVector(m, derived); validateNativeStageJournal(journal);
    if (canonicalRecordJson(step.outcome) !== canonicalRecordJson(outcome) || step.readback !== null)
      revisionError('native-stage-board-failure-outcome');
    return true;
  });
}
