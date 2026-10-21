// @story #2039 #2045
// cspell:ignore HJKMNP
// Structural local evidence never grants lifecycle or publication authority.
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import {
  createRecordId,
  hashRecordPayload,
  parseAitmRecord,
  renderAitmRecord,
  assertNoSecretRecordData,
} from '../github-records/record-envelope.mjs';
import { assertNoCredentialValues } from '../github-records/record-secret-policy.mjs';
import { validateEstimationRubric } from './rubric-record.mjs';
import { validateEstimationOutcome, isIncompleteOutcome } from './outcome-record.mjs';
export { importLocalEvidence } from './local-evidence-store.mjs';
const id = (v) => typeof v === 'string' && /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(v);
const digest = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const token = (v) =>
  typeof v === 'string' && v.length > 0 && v.length <= 512 && !/[\s\p{Cc}]/u.test(v);
const instant = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) &&
  new Date(v).toISOString() === v;
const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fail(reason, cause) {
  throw Object.assign(new Error('Local evidence unavailable: ' + reason, { cause }), {
    code: 'LOCAL_EVIDENCE_UNAVAILABLE',
    reason,
  });
}
function exact(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    fail('shape');
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function copyBytes(value) {
  if (!(value instanceof Uint8Array)) fail('bytes');
  const result = Buffer.from(value);
  new TextDecoder('utf-8', { fatal: true }).decode(result);
  return result;
}
function policy(value) {
  exact(value, ['modelVersion', 'policyVersion']);
  if (!token(value.modelVersion) || !token(value.policyVersion)) fail('model-policy');
}
function scope(host, repository) {
  if (
    typeof host !== 'string' ||
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host) ||
    typeof repository !== 'string' ||
    !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repository) ||
    repository.split('/').some((p) => p === '.' || p === '..')
  )
    fail('scope');
}
function derivedRecord(record) {
  exact(record, [
    'schema',
    'recordId',
    'recordType',
    'repository',
    'issue',
    'createdAt',
    'predecessor',
    'supersedes',
    'payload',
    'payloadHash',
    'modelPolicy',
  ]);
  if (
    record.schema !== 'aitm.local-derived-record/v1' ||
    !id(record.recordId) ||
    !instant(record.createdAt) ||
    !Number.isSafeInteger(record.issue) ||
    record.issue <= 0 ||
    !['estimation-rubric', 'estimation-outcome'].includes(record.recordType)
  )
    fail('derived-record');
  scope('github.com', record.repository);
  policy(record.modelPolicy);
  for (const link of [record.predecessor, record.supersedes])
    if (link !== null && (!id(link) || link === record.recordId)) fail('derived-link');
  assertNoSecretRecordData(record.payload);
  assertNoCredentialValues(record);
  if (record.payloadHash !== hashRecordPayload(record.payload)) fail('record-payload-hash');
  if (record.recordType === 'estimation-rubric') validateEstimationRubric(record.payload);
  else validateEstimationOutcome(record.payload, { expectedIssue: record.issue });
  return record;
}
/** Construct only the explicit local wrapper, never an AITM cloud authority envelope. */
export function createLocalDerivedRecord({
  recordId = createRecordId(),
  recordType,
  repository,
  issue,
  createdAt = new Date().toISOString(),
  predecessor = null,
  supersedes = null,
  payload,
  modelPolicy,
} = {}) {
  try {
    return freeze(
      derivedRecord(
        JSON.parse(
          canonicalRecordJson({
            schema: 'aitm.local-derived-record/v1',
            recordId,
            recordType,
            repository,
            issue,
            createdAt,
            predecessor,
            supersedes,
            payload,
            payloadHash: hashRecordPayload(payload),
            modelPolicy,
          })
        )
      )
    );
  } catch (cause) {
    if (cause.code === 'LOCAL_EVIDENCE_UNAVAILABLE') throw cause;
    fail('derived-record', cause);
  }
}
function validateManifest(m, planBytes) {
  exact(m, [
    'schema',
    'canonicalizationVersion',
    'host',
    'repository',
    'issue',
    'configuration',
    'plan',
    'refine',
    'modelPolicy',
    'inputs',
  ]);
  if (
    m.schema !== 'aitm.local-estimation-evidence/v1' ||
    m.canonicalizationVersion !== 'aitm.canonical-json/v1' ||
    !Number.isSafeInteger(m.issue) ||
    m.issue <= 0
  )
    fail('manifest');
  scope(m.host, m.repository);
  policy(m.modelPolicy);
  exact(m.configuration, ['estimationRubricIssue']);
  if (
    !Number.isSafeInteger(m.configuration.estimationRubricIssue) ||
    m.configuration.estimationRubricIssue < 0
  )
    fail('configuration');
  exact(m.plan, ['path', 'section', 'commit', 'digest']);
  if (
    !token(m.plan.path) ||
    m.plan.path.startsWith('/') ||
    m.plan.path.includes('\\') ||
    m.plan.path.split('/').some((p) => !p || p === '.' || p === '..') ||
    typeof m.plan.section !== 'string' ||
    !m.plan.section.trim() ||
    /[\r\n\p{Cc}]/u.test(m.plan.section) ||
    !/^[a-f0-9]{40}$/.test(m.plan.commit) ||
    !digest(m.plan.digest) ||
    hash(planBytes) !== m.plan.digest
  )
    fail('plan');
  exact(m.refine, ['size', 'humanHours', 'source']);
  exact(m.refine.source, ['kind', 'id', 'digest']);
  if (
    !['XS', 'S', 'M', 'L', 'XL'].includes(m.refine.size) ||
    typeof m.refine.humanHours !== 'number' ||
    !Number.isFinite(m.refine.humanHours) ||
    m.refine.humanHours <= 0 ||
    !token(m.refine.source.kind) ||
    !token(m.refine.source.id) ||
    !digest(m.refine.source.digest)
  )
    fail('refine');
  if (!Array.isArray(m.inputs)) fail('inputs');
}
function readInput(index, payloads, manifest) {
  exact(index, [
    'recordId',
    'recordType',
    'schema',
    'payloadDigest',
    'payloadPath',
    'predecessorRecordId',
    'supersedesRecordId',
    'provenance',
    'sourceCommentId',
    'observedAt',
    'importedAt',
  ]);
  if (
    !id(index.recordId) ||
    !['estimation-rubric', 'estimation-outcome'].includes(index.recordType) ||
    !digest(index.payloadDigest) ||
    index.payloadPath !== 'payloads/' + index.payloadDigest + '.json'
  )
    fail('input-reference');
  for (const value of [index.observedAt, index.importedAt])
    if (value !== null && !instant(value)) fail('provenance-time');
  if (!['observed-cloud', 'imported-local', 'derived-local'].includes(index.provenance))
    fail('provenance');
  if (index.provenance === 'observed-cloud') {
    if (!token(index.sourceCommentId) || !instant(index.observedAt)) fail('observed-source');
  } else if (
    index.sourceCommentId !== null ||
    (index.provenance === 'imported-local' && !instant(index.importedAt)) ||
    (index.provenance === 'derived-local' && index.observedAt !== null)
  )
    fail('local-source');
  const raw = copyBytes(payloads.get(index.payloadPath));
  if (raw.length > 256 * 1024 || hash(raw) !== index.payloadDigest) fail('input-hash');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  const record = JSON.parse(text);
  if (text !== canonicalRecordJson(record)) fail('input-encoding');
  if (
    record.schema !== index.schema ||
    record.recordId !== index.recordId ||
    record.recordType !== index.recordType ||
    record.repository !== manifest.repository ||
    record.predecessor !== index.predecessorRecordId ||
    record.supersedes !== index.supersedesRecordId
  )
    fail('input-correlation');
  if (index.provenance === 'derived-local') derivedRecord(record);
  else {
    if (record.schema !== 'aitm.record/v1') fail('envelope-schema');
    // Rendering reuses complete native envelope validation and never creates a grant.
    const body = renderAitmRecord({ envelope: record });
    if (index.provenance === 'observed-cloud')
      parseAitmRecord({
        body,
        commentNodeId: index.sourceCommentId,
        expectedRepository: manifest.repository,
        expectedIssue: record.issue,
      });
  }
  return { descriptor: index, record, raw };
}
function lineage(records, manifest) {
  const byId = new Map(records.map((r) => [r.record.recordId, r]));
  const superseded = new Set();
  const successors = new Map();
  for (const item of records) {
    const r = item.record;
    for (const link of new Set([r.predecessor, r.supersedes].filter((v) => v !== null))) {
      const prior = byId.get(link)?.record;
      if (!prior || prior.issue !== r.issue || prior.recordType !== r.recordType)
        fail('missing-or-mismatched-ancestor');
    }
    if (r.supersedes !== null) {
      if (successors.has(r.supersedes)) fail('fork');
      successors.set(r.supersedes, r.recordId);
      superseded.add(r.supersedes);
    }
  }
  const visiting = new Set(),
    visited = new Set();
  function visit(item) {
    const r = item.record;
    if (visiting.has(r.recordId)) fail('cycle');
    if (visited.has(r.recordId)) return;
    visiting.add(r.recordId);
    for (const link of new Set([r.predecessor, r.supersedes].filter((v) => v !== null)))
      visit(byId.get(link));
    visiting.delete(r.recordId);
    visited.add(r.recordId);
  }
  for (const item of records) visit(item);
  const rubrics = records.filter((r) => r.record.recordType === 'estimation-rubric');
  for (const { record: r } of rubrics) {
    const p = r.payload;
    const previous = p.predecessorRecordId;
    if (
      r.issue !== manifest.configuration.estimationRubricIssue ||
      r.predecessor !== previous ||
      r.supersedes !== previous ||
      (p.version === 1
        ? previous !== null
        : byId.get(previous)?.record.payload.version !== p.version - 1)
    )
      fail('rubric-lineage');
    for (const source of p.cohort) {
      const outcome = byId.get(source.outcomeRecordId)?.record;
      if (
        !outcome ||
        outcome.recordType !== 'estimation-outcome' ||
        outcome.issue !== source.issue ||
        isIncompleteOutcome(outcome.payload)
      )
        fail('rubric-cohort');
    }
  }
  const activeRubrics = rubrics.filter((r) => !superseded.has(r.record.recordId));
  if (
    manifest.configuration.estimationRubricIssue === 0
      ? rubrics.length !== 0
      : activeRubrics.length !== 1
  )
    fail('active-rubric');
  const activeOutcomes = records.filter(
    (r) => r.record.recordType === 'estimation-outcome' && !superseded.has(r.record.recordId)
  );
  const issues = new Set();
  for (const { record: r } of activeOutcomes) {
    if (issues.has(r.issue)) fail('ambiguous-outcome');
    issues.add(r.issue);
    if (isIncompleteOutcome(r.payload)) fail('outcome-timing-incomplete');
  }
  return { activeRubric: activeRubrics[0] ?? null, activeOutcomes };
}
/** Exact retained bytes and lineage only; callers separately compare current selection/configuration. */
export function validateLocalEvidence(bundle) {
  try {
    exact(bundle, ['manifest', 'payloads', 'planBytes']);
    if (!(bundle.payloads instanceof Map)) fail('payload-map');
    const manifest = JSON.parse(canonicalRecordJson(bundle.manifest));
    const planBytes = copyBytes(bundle.planBytes);
    validateManifest(manifest, planBytes);
    const payloads = new Map();
    const records = [];
    const seen = new Map();
    for (const descriptor of manifest.inputs) {
      const item = readInput(descriptor, bundle.payloads, manifest);
      const prior = seen.get(item.record.recordId);
      if (prior) {
        if (!same(prior.descriptor, item.descriptor) || !prior.raw.equals(item.raw))
          fail('conflicting-record-id');
        continue;
      }
      seen.set(item.record.recordId, item);
      records.push(item);
      payloads.set(descriptor.payloadPath, Buffer.from(item.raw));
    }
    if (
      bundle.payloads.size !== payloads.size ||
      [...bundle.payloads.keys()].some((k) => !payloads.has(k))
    )
      fail('unreferenced-payload');
    const active = lineage(records, manifest);
    for (const item of records) {
      freeze(item.descriptor);
      freeze(item.record);
    }
    return {
      manifest: freeze(manifest),
      manifestDigest: hash(Buffer.from(canonicalRecordJson(manifest))),
      planBytes,
      payloads,
      records,
      ...active,
    };
  } catch (cause) {
    if (cause.code === 'LOCAL_EVIDENCE_UNAVAILABLE') throw cause;
    fail('record-or-bytes', cause);
  }
}
