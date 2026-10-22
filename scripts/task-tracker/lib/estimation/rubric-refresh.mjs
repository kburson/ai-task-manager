// @story #2039 #2062
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { createHash } from 'node:crypto';
import {
  validateLocalSelection,
  localEstimationMode,
  retainLocalEstimateInputs,
} from './local-runtime.mjs';
import { createLocalDerivedRecord, validateLocalEvidence } from './local-evidence.mjs';
import { createBootstrapRubric, updateEstimationRubric } from './rubric-model.mjs';
import { validateEstimationRubric } from './rubric-record.mjs';
import { runLogicalRecordClaim } from './record-claim.mjs';

function fail(category) {
  throw new Error(`rubric-refresh:${category}`);
}
function cohortIds(rubric) {
  return rubric.cohort.map((item) => item.outcomeRecordId).sort();
}
function sameCohort(rubric, outcomes) {
  const current = cohortIds(rubric);
  const incoming = outcomes.map((outcome) => outcome.recordId).sort();
  return current.length === incoming.length && current.every((id, index) => id === incoming[index]);
}

function validateLineage(records) {
  const byId = new Map();
  const successors = new Map();
  const roots = [];
  for (const record of records) {
    const { envelope } = record;
    if (byId.has(envelope.recordId)) fail('lineage');
    byId.set(envelope.recordId, record);
  }
  for (const record of records) {
    const { envelope } = record;
    const predecessor = envelope.payload.predecessorRecordId;
    if (envelope.predecessor !== predecessor || envelope.supersedes !== predecessor)
      fail('lineage');
    if (envelope.payload.version === 1) {
      if (predecessor !== null) fail('lineage');
      roots.push(record);
      continue;
    }
    const prior = byId.get(predecessor);
    if (!prior || prior.envelope.payload.version !== envelope.payload.version - 1) fail('lineage');
    const children = successors.get(predecessor) ?? [];
    children.push(record);
    successors.set(predecessor, children);
  }
  if (roots.length !== 1) fail('lineage');
  if ([...successors.values()].some((children) => children.length !== 1)) fail('lineage');
  const visited = new Set();
  let cursor = roots[0];
  while (cursor) {
    const id = cursor.envelope.recordId;
    if (visited.has(id)) fail('lineage');
    visited.add(id);
    cursor = successors.get(id)?.[0] ?? null;
  }
  if (visited.size !== records.length) fail('lineage');
}

function selectLatest(records) {
  if (!Array.isArray(records)) fail('records');
  if (records.length === 0) return null;
  const valid = records
    .map((record) => {
      if (record?.envelope?.recordType !== 'estimation-rubric') fail('record-type');
      validateEstimationRubric(record.envelope.payload);
      return record;
    })
    .sort(
      (left, right) =>
        right.envelope.payload.version - left.envelope.payload.version ||
        right.envelope.payload.generatedAt.localeCompare(left.envelope.payload.generatedAt)
    );
  const maximumVersion = valid[0].envelope.payload.version;
  if (valid.filter((record) => record.envelope.payload.version === maximumVersion).length > 1)
    fail('conflicting-latest');
  validateLineage(valid);
  return valid[0];
}

async function loadOrRefreshRubricUnlocked({ cfg, rubricIssueNumber, through, deps }) {
  if (!cfg?.repo || !Number.isInteger(rubricIssueNumber) || rubricIssueNumber < 0) fail('input');
  if (rubricIssueNumber === 0)
    return {
      status: 'unconfigured',
      rubric: createBootstrapRubric({ generatedAt: through }),
      recordId: null,
      commentNodeId: null,
    };
  if (
    typeof deps.listRubricRecords !== 'function' ||
    typeof deps.listEligibleOutcomes !== 'function'
  )
    fail('dependencies');
  const latest = selectLatest(
    await deps.listRubricRecords({ repository: cfg.repo, issue: rubricIssueNumber, through })
  );
  const previous = latest?.envelope.payload ?? createBootstrapRubric({ generatedAt: through });
  const discoveredOutcomes = await deps.listEligibleOutcomes({ through, cohort: previous.cohort });
  if (!Array.isArray(discoveredOutcomes)) fail('outcomes');
  const outcomes = [...discoveredOutcomes]
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.recordId.localeCompare(right.recordId)
    )
    .slice(-50);
  if (latest && sameCohort(previous, outcomes))
    return {
      status: 'current',
      rubric: previous,
      recordId: latest.envelope.recordId,
      commentNodeId: latest.commentNodeId,
    };
  if (typeof deps.writeRubric !== 'function') fail('dependencies');

  const payload =
    outcomes.length === 0
      ? previous
      : updateEstimationRubric({ previous, outcomes, generatedAt: through });
  payload.predecessorRecordId = latest?.envelope.recordId ?? null;
  validateEstimationRubric(payload);
  const written = await deps.writeRubric({
    repository: cfg.repo,
    issue: rubricIssueNumber,
    payload,
    predecessorRecordId: latest?.envelope.recordId ?? null,
  });
  if (written?.envelope?.recordType !== 'estimation-rubric') fail('write-readback');
  validateEstimationRubric(written.envelope.payload);
  if (
    written.envelope.predecessor !== (latest?.envelope.recordId ?? null) ||
    written.envelope.supersedes !== (latest?.envelope.recordId ?? null) ||
    written.envelope.payload.predecessorRecordId !== (latest?.envelope.recordId ?? null)
  )
    fail('write-readback');
  if (!sameCohort(written.envelope.payload, outcomes)) fail('write-readback');
  return {
    status: latest ? 'refreshed' : 'bootstrapped',
    rubric: written.envelope.payload,
    recordId: written.envelope.recordId,
    commentNodeId: written.commentNodeId,
  };
}

export async function loadOrRefreshRubric({
  cfg,
  rubricIssueNumber = cfg?.estimationRubricIssue,
  through = new Date().toISOString(),
  deps = {},
} = {}) {
  if (!cfg?.repo || !Number.isInteger(rubricIssueNumber) || rubricIssueNumber < 0) fail('input');
  if (rubricIssueNumber === 0) {
    return loadOrRefreshRubricUnlocked({ cfg, rubricIssueNumber, through, deps });
  }
  return runLogicalRecordClaim(
    deps,
    { key: `rubric:${cfg.repo}:${rubricIssueNumber}`, issue: rubricIssueNumber },
    () => loadOrRefreshRubricUnlocked({ cfg, rubricIssueNumber, through, deps })
  );
}

const localBytes = (value) => Buffer.from(canonicalRecordJson(value));
const localHash = (raw) => createHash('sha256').update(raw).digest('hex');
function retainedBundle(retained) {
  return {
    manifest: JSON.parse(canonicalRecordJson(retained.manifest)),
    payloads: new Map([...retained.payloads].map(([key, raw]) => [key, Buffer.from(raw)])),
    planBytes: Buffer.from(retained.planBytes),
  };
}
/** Pure candidate only: never a persistence acknowledgement or cloud authority. */
export function deriveLocalRubric(args = {}) {
  const stopped = localEstimationMode(args.mode);
  if (stopped) return stopped;
  try {
    const retained = validateLocalSelection(args);
    const previous = retained.activeRubric.record;
    const outcomes = retained.activeOutcomes
      .map(({ record }) => ({
        recordId: record.recordId,
        createdAt: record.createdAt,
        payload: record.payload,
      }))
      .sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.recordId.localeCompare(b.recordId)
      )
      .slice(-50);
    const bundle = retainedBundle(retained);
    if (sameCohort(previous.payload, outcomes))
      return { status: 'current', record: previous, bundle };
    if (
      typeof args.generatedAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(args.generatedAt) ||
      new Date(args.generatedAt).toISOString() !== args.generatedAt ||
      args.generatedAt < previous.payload.generatedAt ||
      outcomes.some((o) => o.createdAt > args.generatedAt)
    )
      fail('local-generation-time');
    if (
      typeof args.recordId !== 'string' ||
      retained.records.some(({ record }) => record.recordId === args.recordId)
    )
      fail('local-record-id');
    const payload = updateEstimationRubric({
      previous: previous.payload,
      outcomes,
      generatedAt: args.generatedAt,
    });
    payload.predecessorRecordId = previous.recordId;
    const record = createLocalDerivedRecord({
      recordId: args.recordId,
      recordType: 'estimation-rubric',
      repository: retained.manifest.repository,
      issue: retained.manifest.configuration.estimationRubricIssue,
      createdAt: args.generatedAt,
      predecessor: previous.recordId,
      supersedes: previous.recordId,
      payload,
      modelPolicy: retained.manifest.modelPolicy,
    });
    const raw = localBytes(record),
      digest = localHash(raw),
      payloadPath = 'payloads/' + digest + '.json';
    bundle.payloads.set(payloadPath, raw);
    bundle.manifest.inputs.push({
      recordId: record.recordId,
      recordType: record.recordType,
      schema: record.schema,
      payloadDigest: digest,
      payloadPath,
      predecessorRecordId: record.predecessor,
      supersedesRecordId: record.supersedes,
      provenance: 'derived-local',
      sourceCommentId: null,
      observedAt: null,
      importedAt: null,
    });
    validateLocalEvidence(bundle);
    return { status: 'derived', record, bundle };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error.reason || error.message || 'local-rubric-invalid',
    };
  }
}
/** Actual immutable-store import/read-back precedes exposing a usable successor ID. */
export async function refreshLocalRubric(args = {}) {
  const stopped = localEstimationMode(args.mode);
  if (stopped) return stopped;
  const candidate = deriveLocalRubric(args);
  if (candidate.status === 'unavailable') return candidate;
  try {
    const imported = await retainLocalEstimateInputs({
      evidenceStore: args.evidenceStore,
      bundle: candidate.bundle,
    });
    if (imported.status !== 'retained') return imported;
    const evidence = imported.evidence;
    const verified = validateLocalEvidence(evidence);
    if (
      verified.manifestDigest !== imported.manifestDigest ||
      verified.activeRubric.record.recordId !== candidate.record.recordId ||
      canonicalRecordJson(verified.activeRubric.record) !== canonicalRecordJson(candidate.record)
    )
      fail('local-readback');
    return {
      status: candidate.status === 'current' ? 'current' : 'refreshed',
      recordId: candidate.record.recordId,
      record: verified.activeRubric.record,
      manifestDigest: verified.manifestDigest,
      evidence,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error.reason || error.message || 'local-rubric-persistence',
    };
  }
}
