// @story #1854
import path from 'node:path';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { exactKeys, revisionError, hashRevisionValue } from './schema.mjs';
const equal = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const hash = /^sha256:[0-9a-f]{64}$/;
export function validatePlanApprovalPayload(payload) {
  exactKeys(
    payload,
    [
      'schema',
      'revisionId',
      'semanticContractDigest',
      'contractEpoch',
      'sourceBindings',
      'provenance',
    ],
    'plan-approval-binding'
  );
  if (
    payload.schema !== 'aitm.plan-approval-binding/v1' ||
    (payload.revisionId !== null &&
      (typeof payload.revisionId !== 'string' || !payload.revisionId)) ||
    !hash.test(payload.semanticContractDigest) ||
    (payload.contractEpoch !== null &&
      (!Number.isSafeInteger(payload.contractEpoch) || payload.contractEpoch < 1))
  )
    revisionError('plan-approval-binding');
  if (!Array.isArray(payload.sourceBindings) || payload.sourceBindings.length !== 3)
    revisionError('plan-approval-source-binding');
  const names = new Set();
  for (const source of payload.sourceBindings) {
    exactKeys(source, ['identity', 'hash'], 'plan-approval-source-binding');
    if (
      !['user-story', 'story-intent', 'linked-plan'].includes(source.identity) ||
      names.has(source.identity) ||
      !hash.test(source.hash)
    )
      revisionError('plan-approval-source-binding');
    names.add(source.identity);
  }
  exactKeys(
    payload.provenance,
    ['mode', 'authorityReference', 'auditReference'],
    'plan-approval-provenance'
  );
  if (
    !['human', 'full-auto'].includes(payload.provenance.mode) ||
    ['authorityReference', 'auditReference'].some(
      (key) => typeof payload.provenance[key] !== 'string' || !payload.provenance[key].trim()
    )
  )
    revisionError('plan-approval-provenance');
  return payload;
}
export function validateRevisionPlanApproval(payload, observation) {
  validatePlanApprovalPayload(payload);
  const current = observation.observation,
    p = observation.effectiveProposal;
  if (
    observation.status !== 'applied' ||
    !p ||
    p.mode === 'abort' ||
    current.revisionId !== p.after.revisionId ||
    payload.revisionId !== p.after.revisionId ||
    payload.semanticContractDigest !== p.after.semanticContractDigest ||
    payload.contractEpoch !== (current.contract?.value.contractEpoch ?? null) ||
    !equal(
      payload.sourceBindings,
      observation.planSourceBindings ?? current.protectedSourceBindings
    )
  )
    revisionError('plan-approval-binding');
  if (observation.approvalEnvelope) {
    const e = observation.approvalEnvelope;
    if (
      e.repository !== current.repository ||
      e.issue !== current.issue ||
      e.authority.epoch !== current.contract?.value.authorityEpoch ||
      e.authority.grantId !== current.contract?.value.coordinatorGrantId ||
      !equal(e.payload, payload)
    )
      revisionError('plan-approval-authority-binding');
  }
  return true;
}
export function planSourceBindings(resolved, governedPlan) {
  return [
    { identity: 'user-story', hash: 'sha256:' + resolved.binding.storyDigest },
    { identity: 'story-intent', hash: 'sha256:' + resolved.binding.storyIntentDigest },
    { identity: 'linked-plan', hash: hashRevisionValue(governedPlan) },
  ];
}

import { observeRevision } from './engine.mjs';
import {
  assertRevisionMemory,
  withMemoryInterlock,
  assertMemoryCapability,
  readMemoryAuthority,
  memoryNow,
  readMemoryPlanning,
  persistMemoryPlanApproval,
} from './store.mjs';
import {
  canonicalRecordId,
  assertCanonicalAuthority,
  canonicalAfterObservation,
  sameRevisionObservation,
} from './canonical.mjs';
import {
  createAitmRecordEnvelope,
  renderAitmRecord,
  parseAitmRecord,
} from '../github-records/record-envelope.mjs';
import { resolveContractSource } from '../github-records/contract-source.mjs';
import { renderContractProjectionRecord } from '../github-records/contract-write.mjs';
import {
  renderDeliveryContract,
  validateDeliveryContract,
} from '../github-records/delivery-contract.mjs';
import { buildPlanApprovalAuditComment } from '../plan-approval-audit.mjs';
import { upsertPlanApprovedMarker, parsePlanApprovedMarker } from '../markers.mjs';
import { upsertEpicOrchestrationPlan } from '../epic-orchestration-plan.mjs';
import { stampBodyVersion, parseBodyVersion } from '../body-version.mjs';
import { stampEntryMarker } from '../stage-entry-markers.mjs';
import { parseEntryMarkers } from '../stage-entry-grammar.mjs';
import { resolveStoryIntentSource } from '../story-intent-source.mjs';
import { validateGovernedLinkedPlan } from '../governed-plan-policy.mjs';
import { hashBytes } from './schema.mjs';
const sessions = new WeakMap();
function session(token) {
  const held = sessions.get(token);
  if (!held?.live) revisionError('plan-completion-capability');
  assertMemoryCapability(held.backend, held.capability, held.context);
  return held;
}
export function memoryPlanSession(token) {
  const held = session(token);
  return { reapproval: held.current.status === 'applied', checklistBody: held.checklistBody };
}
export function validateMemoryPlanWrite(token, { backend, before, after, audit, record }) {
  const held = session(token);
  if (!equal(readMemoryPlanning(backend, held.context), held.planning))
    revisionError('planning-snapshot-drift');
  if (
    held.backend !== backend ||
    !held.completed ||
    !equal(held.completed, { before, after, audit, record })
  )
    revisionError('plan-completion-capability');
  return held.context;
}
async function planningSource(o) {
  const source = await resolveContractSource({
    repository: o.repository,
    issue: o.issue,
    issueBody: o.body.bytes,
    readContractRecord: async ({ commentNodeId }) => {
      if (!o.contract) revisionError('plan-contract-source');
      const body = renderContractProjectionRecord({
        repository: o.repository,
        issue: o.issue,
        contract: o.contract.value,
        actor: o.grant.coordinator.actor,
      });
      return {
        ...parseAitmRecord({
          commentNodeId,
          body,
          expectedRepository: o.repository,
          expectedIssue: o.issue,
        }),
        body,
      };
    },
  });
  if ((source.sourceKind === 'github-records/v1') !== (o.sourceKind === 'canonical-contract'))
    revisionError('plan-contract-source');
  return source;
}
export async function runMemoryPlanApproval({
  issueNumber,
  cfg,
  projectDir,
  repairFromEvidence = false,
  backend,
  env = process.env,
  expectedObservation,
}) {
  assertRevisionMemory(backend);
  const o = backend.observation,
    context = { repository: cfg.repo, issue: Number(issueNumber), executor: o.executor };
  if (repairFromEvidence)
    return {
      status: 'evidence-repair-refused',
      message: 'Current revision approval requires fresh normal planning checks.',
    };
  readMemoryAuthority(backend, context);
  if (path.resolve(projectDir ?? o.executor.worktree) !== path.resolve(o.executor.worktree))
    revisionError('planning-source-root');
  projectDir = o.executor.worktree;
  const planning = readMemoryPlanning(backend, context);
  if (!equal(planning.cfg, cfg)) revisionError('planning-config-mismatch');
  const { runPlanApprove } = await import('../../verbs/plan-approve.mjs');
  const before = await observeRevision({ context, deps: backend });
  if (expectedObservation && !sameCollectedObservation(expectedObservation, before))
    revisionError('plan-observation-drift');
  if (!['empty', 'applied'].includes(before.status))
    return { status: 'revision-approval-refused', code: before.status };
  if (o.stage !== 'plan' && !(o.stage === 'develop' && before.status === 'applied'))
    return { status: 'wrong-state' };
  return withMemoryInterlock(backend, context, async (capability) => {
    if (!equal(readMemoryPlanning(backend, context), planning))
      revisionError('planning-snapshot-drift');
    const current = await observeRevision({ context, deps: backend });
    if (
      !equal(current.resourceVector, before.resourceVector) ||
      !sameRevisionObservation(current.observation, before.observation) ||
      !['empty', 'applied'].includes(current.status)
    )
      revisionError('plan-authority-drift');
    const fresh = readMemoryAuthority(backend, context);
    if (fresh.sourceKind === 'canonical-contract')
      assertCanonicalAuthority(fresh, memoryNow(backend), 'plan-approve');
    const source = await planningSource(fresh);
    const checklistBody = [
      '## Acceptance Criteria',
      ...source.contract.acceptanceCriteria.map((x) => '- [ ] ' + x.declaration),
      '## Verification Commands',
      ...source.contract.verificationCommands.map((x) => '- [ ] `' + x.command + '`'),
    ].join('\n');
    const token = Object.freeze({}),
      held = {
        backend,
        capability,
        context,
        current,
        source,
        planning,
        checklistBody,
        projectDir: projectDir || process.cwd(),
        live: true,
        completed: null,
      };
    sessions.set(token, held);
    try {
      return await runPlanApprove({
        issueNumber,
        cfg,
        projectDir: held.projectDir,
        deps: {
          revisionPlanToken: token,
          env,
          getBoardState: async () => readMemoryAuthority(backend, context).stage,
          fetchIssueBody: async () => readMemoryAuthority(backend, context).body.bytes,
          fetchEpicChildren: async () => readMemoryPlanning(backend, context).epicChildren,
          resolveTrunkSha: async () => {
            const sha = readMemoryPlanning(backend, context).trunkSha;
            if (!sha) revisionError('memory-trunk-provenance-unavailable');
            return sha;
          },
        },
      });
    } finally {
      held.live = false;
    }
  });
}
function projectedContract(contract, recordId) {
  const next = structuredClone(contract);
  next.revision++;
  next.acceptedRecordIds = [...new Set([...next.acceptedRecordIds, recordId])].sort();
  next.projectionHash = renderDeliveryContract({ contract: next }).projectionHash;
  validateDeliveryContract(next);
  return next;
}
const legacyBindingRE = new RegExp('<!-- aitm-plan-approval-binding\\n([\\s\\S]*?)\\n-->', 'g');
function bindingMarker(record) {
  return (
    '<!-- aitm-plan-approval-binding\n' +
    canonicalRecordJson(record).replaceAll('--', '-\\u002d') +
    '\n-->'
  );
}
function approvalAfter(
  before,
  record,
  binding,
  { forecastRecordId = null, trunkSha = null, epicChildren = [] } = {}
) {
  const after = structuredClone(before),
    payload = record.envelope?.payload ?? record.payload,
    ts = record.envelope?.createdAt ?? record.createdAt;
  let body = before.body.bytes.replace(legacyBindingRE, '');
  if (before.sourceKind === 'canonical-contract') {
    const contract = projectedContract(before.contract.value, record.recordId);
    body = body.replace(
      renderDeliveryContract({ contract: before.contract.value }).markdown,
      renderDeliveryContract({ contract }).markdown
    );
    after.contract = { value: contract, bytes: canonicalRecordJson(contract) };
    after.proofRecords.push({
      kind: 'plan-approval',
      identity: record.recordId,
      bytes: record.bytes,
      criterionIdentity: null,
    });
    after.canonicalArchive.records.push({ recordId: record.recordId, bytes: record.bytes });
    after.capsule = { head: record.recordId, bytes: record.bytes };
  } else body = body.trimEnd() + '\n\n' + bindingMarker(record) + '\n';
  if (before.stage === 'plan' && !parseEntryMarkers(body).some((e) => e.state === 'plan'))
    body = stampEntryMarker(body, 'plan', ts);
  body = upsertPlanApprovedMarker(body, ts, {
    ...binding,
    forecastRecordId,
    trunkSha,
    mode: payload.provenance.mode,
  });
  if (epicChildren.length)
    body = upsertEpicOrchestrationPlan(body, { children: epicChildren, trunkSha });
  after.body = {
    bytes: stampBodyVersion(body, before.body.version + 1),
    version: before.body.version + 1,
  };
  return after;
}
export async function finishMemoryPlanApproval(
  token,
  { resolved, governedPlan, binding, forecastRecordId, trunkSha, requestedMode, observeFresh }
) {
  const held = session(token),
    { backend, context } = held;
  const before = readMemoryAuthority(backend, context);
  observeFresh(before.body.bytes);
  if (!equal(before.body, held.current.observation.body)) revisionError('plan-authority-drift');
  const source = await planningSource(before),
    ts = memoryNow(backend);
  const existing = await readCurrentMemoryPlanApproval({
    backend,
    context,
    projectDir: held.projectDir,
  });
  if (existing)
    return {
      status: 'already-approved',
      recordId: existing.recordId,
      mode: existing.payload.provenance.mode,
    };
  if (before.sourceKind === 'canonical-contract')
    assertCanonicalAuthority(before, ts, 'plan-approve');
  const payload = {
    schema: 'aitm.plan-approval-binding/v1',
    revisionId: held.current.effectiveProposal?.after.revisionId ?? null,
    semanticContractDigest:
      held.current.effectiveProposal?.after.semanticContractDigest ??
      baselinePlanDigest(source.contract),
    contractEpoch: before.contract?.value.contractEpoch ?? null,
    sourceBindings: planSourceBindings(resolved, governedPlan),
    provenance: {
      mode: requestedMode,
      authorityReference: context.executor.adapter + ':' + context.executor.sessionId,
      auditReference: '',
    },
  };
  const audit =
    requestedMode === 'full-auto'
      ? buildPlanApprovalAuditComment({ issueNumber: context.issue, ts })
      : `Plan approval recorded by ${context.executor.adapter}:${context.executor.sessionId} at ${ts}.`;
  payload.provenance.auditReference = hashBytes(audit);
  validatePlanApprovalPayload(payload);
  const recordId = canonicalRecordId(
    canonicalRecordJson([context.repository, context.issue, payload, ts])
  );
  let record;
  if (before.sourceKind === 'canonical-contract') {
    const envelope = createAitmRecordEnvelope({
      repository: context.repository,
      issue: context.issue,
      recordType: 'plan-approval',
      payload,
      recordId,
      predecessor: before.capsule.head,
      actor: before.grant.coordinator.actor,
      epoch: before.grant.epoch,
      grantId: before.grant.identity,
      createdAt: ts,
    });
    record = {
      recordId,
      envelope,
      bytes: renderAitmRecord({ envelope, visibleMarkdown: 'AITM current Plan approval.\n' }),
    };
  } else
    record = {
      schema: 'aitm.legacy-plan-approval/v1',
      recordId,
      repository: context.repository,
      issue: context.issue,
      createdAt: ts,
      executor: structuredClone(context.executor),
      payload,
    };
  const after = approvalAfter(before, record, binding, {
    forecastRecordId,
    trunkSha,
    epicChildren: held.planning.epicChildren,
  });
  held.completed = { before, after, audit, record };
  await persistMemoryPlanApproval({ backend, token, ...held.completed });
  if (!equal(readMemoryAuthority(backend, context), after)) revisionError('plan-readback');
  return { status: 'approved', recordId, ts, mode: requestedMode };
}

export function currentPlanExtension({ observation, chain, backend }) {
  if (chain.status !== 'applied' || chain.effective.proposal.mode === 'abort') return null;
  const p = chain.effective.proposal;
  const before =
    p.authority.kind === 'canonical-contract'
      ? canonicalAfterObservation(p)
      : structuredClone(p.archive.observation);
  if (p.authority.kind === 'legacy-body')
    before.body = {
      bytes: p.writeSet.find((w) => w.resource === 'issue-body').afterBytes,
      version: parseBodyVersion(p.writeSet.find((w) => w.resource === 'issue-body').afterBytes),
    };
  let record, payload, ts;
  if (observation.sourceKind === 'canonical-contract') {
    const added = observation.canonicalArchive.records.filter(
      (r) => !before.canonicalArchive.records.some((b) => b.recordId === r.recordId)
    );
    if (added.length !== 1) return null;
    const r = added[0],
      parsed = parseAitmRecord({
        commentNodeId: r.recordId,
        body: r.bytes,
        expectedRepository: observation.repository,
        expectedIssue: observation.issue,
      });
    if (parsed.envelope.recordType !== 'plan-approval') return null;
    record = { ...r, envelope: parsed.envelope };
    payload = record.envelope.payload;
    ts = record.envelope.createdAt;
    assertCanonicalAuthority(observation, memoryNow(backend), 'plan-approve');
    if (
      record.envelope.predecessor !== before.capsule.head ||
      record.envelope.authority.actor !== observation.grant.coordinator.actor ||
      record.envelope.authority.epoch !== observation.grant.epoch ||
      record.envelope.authority.grantId !== observation.grant.identity ||
      renderAitmRecord({
        envelope: record.envelope,
        visibleMarkdown: 'AITM current Plan approval.\n',
      }) !== record.bytes
    )
      revisionError('plan-approval-authority-binding');
  } else {
    const markers = [...observation.body.bytes.matchAll(legacyBindingRE)];
    if (markers.length !== 1) return null;
    record = JSON.parse(markers[0][1]);
    exactKeys(
      record,
      ['schema', 'recordId', 'repository', 'issue', 'createdAt', 'executor', 'payload'],
      'legacy-plan-approval'
    );
    if (
      record.schema !== 'aitm.legacy-plan-approval/v1' ||
      record.repository !== observation.repository ||
      record.issue !== observation.issue ||
      !equal(record.executor, observation.executor)
    )
      revisionError('plan-approval-authority-binding');
    payload = record.payload;
    ts = record.createdAt;
  }
  if (
    !Number.isFinite(Date.parse(ts)) ||
    new Date(ts).toISOString() !== ts ||
    Date.parse(ts) > Date.now()
  )
    revisionError('plan-approval-time');
  const projectDir = observation.executor.worktree,
    governedPlan = validateGovernedLinkedPlan({ body: observation.body.bytes, projectDir }),
    resolved = resolveStoryIntentSource({ body: observation.body.bytes, projectDir, governedPlan });
  if (!governedPlan.ok || !resolved.ok) revisionError('plan-approval-source-binding');
  validateRevisionPlanApproval(payload, {
    status: 'applied',
    observation: { ...observation, revisionId: p.after.revisionId },
    effectiveProposal: p,
    planSourceBindings: planSourceBindings(resolved, governedPlan),
    ...(record.envelope ? { approvalEnvelope: record.envelope } : {}),
  });
  if (
    payload.provenance.authorityReference !==
    observation.executor.adapter + ':' + observation.executor.sessionId
  )
    revisionError('plan-approval-provenance');
  const audit =
    payload.provenance.mode === 'full-auto'
      ? buildPlanApprovalAuditComment({ issueNumber: observation.issue, ts })
      : `Plan approval recorded by ${observation.executor.adapter}:${observation.executor.sessionId} at ${ts}.`;
  if (
    hashBytes(audit) !== payload.provenance.auditReference ||
    backend.comments.filter((c) => c.body === audit).length !== 1
  )
    revisionError('plan-approval-audit');
  if (
    record.recordId !==
    canonicalRecordId(canonicalRecordJson([observation.repository, observation.issue, payload, ts]))
  )
    revisionError('plan-approval-identity');
  const marker = parsePlanApprovedMarker(observation.body.bytes);
  if (!marker || marker.ts !== ts || marker.mode !== payload.provenance.mode)
    revisionError('plan-approval-projection');
  const ready =
    new RegExp(
      '<!--\\s*aitm-estimation-forecast-ready\\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\\s*-->',
      'i'
    ).exec(before.body.bytes)?.[1] ?? null;
  if (marker.forecastRecordId !== ready && !(marker.forecastRecordId == null && ready === null))
    revisionError('plan-approval-forecast');
  const planning = readMemoryPlanning(backend, {
    repository: observation.repository,
    issue: observation.issue,
  });
  if (
    Number.isInteger(planning.cfg.estimationRubricIssue) &&
    planning.cfg.estimationRubricIssue > 0 &&
    ready === null
  )
    revisionError('plan-approval-forecast');
  if (marker.trunkSha && marker.trunkSha !== planning.trunkSha)
    revisionError('plan-approval-trunk');
  return approvalAfter(before, record, resolved.binding, {
    forecastRecordId: ready,
    trunkSha: marker.trunkSha ?? null,
    epicChildren: planning.epicChildren,
  });
}

function baselinePlanDigest(contract) {
  return hashRevisionValue(
    ['acceptanceCriteria', 'verificationCommands', 'definitionOfDone'].map((kind) => ({
      kind,
      definitions: contract[kind].map(({ checked: _checked, ...definition }) => definition),
    }))
  );
}
export async function readCurrentMemoryPlanApproval({ backend, context, projectDir }) {
  assertRevisionMemory(backend);
  const state = await observeRevision({ context, deps: backend });
  if (state.status === 'applied') {
    const expected = currentPlanExtension({
      observation: state.observation,
      chain: state.chain,
      backend,
    });
    if (!expected) return null;
    const o = state.observation;
    if (o.sourceKind === 'canonical-contract') {
      const e = parseAitmRecord({
        commentNodeId: o.capsule.head,
        body: o.capsule.bytes,
        expectedRepository: o.repository,
        expectedIssue: o.issue,
      }).envelope;
      return { recordId: e.recordId, payload: e.payload };
    }
    return JSON.parse([...o.body.bytes.matchAll(legacyBindingRE)][0][1]);
  }
  if (state.status !== 'empty') return null;
  const o = state.observation;
  if (o.sourceKind !== 'canonical-contract') return null;
  const e = parseAitmRecord({
    commentNodeId: o.capsule.head,
    body: o.capsule.bytes,
    expectedRepository: o.repository,
    expectedIssue: o.issue,
  }).envelope;
  if (e.recordType !== 'plan-approval') return null;
  if (
    e.recordId !==
      canonicalRecordId(canonicalRecordJson([o.repository, o.issue, e.payload, e.createdAt])) ||
    renderAitmRecord({ envelope: e, visibleMarkdown: 'AITM current Plan approval.\n' }) !==
      o.capsule.bytes
  )
    revisionError('plan-approval-identity');

  assertCanonicalAuthority(o, memoryNow(backend), 'plan-approve');
  const source = await planningSource(o),
    body = o.body.bytes;
  const policy = validateGovernedLinkedPlan({
      body,
      projectDir: projectDir || o.executor.worktree,
    }),
    resolved = resolveStoryIntentSource({
      body,
      projectDir: projectDir || o.executor.worktree,
      governedPlan: policy,
    });
  if (!policy.ok || !resolved.ok) revisionError('plan-approval-source-binding');
  const payload = e.payload,
    marker = parsePlanApprovedMarker(body);
  if (
    payload.revisionId !== null ||
    payload.semanticContractDigest !== baselinePlanDigest(source.contract) ||
    payload.contractEpoch !== o.contract.value.contractEpoch ||
    !equal(payload.sourceBindings, planSourceBindings(resolved, policy)) ||
    e.authority.epoch !== o.grant.epoch ||
    e.authority.grantId !== o.grant.identity ||
    !o.contract.value.acceptedRecordIds.includes(e.recordId) ||
    !marker ||
    marker.ts !== e.createdAt ||
    marker.mode !== payload.provenance.mode
  )
    revisionError('plan-approval-binding');
  const audit =
    payload.provenance.mode === 'full-auto'
      ? buildPlanApprovalAuditComment({ issueNumber: o.issue, ts: e.createdAt })
      : `Plan approval recorded by ${o.executor.adapter}:${o.executor.sessionId} at ${e.createdAt}.`;
  if (
    backend.comments.filter((c) => c.body === audit).length !== 1 ||
    payload.provenance.auditReference !== hashBytes(audit) ||
    payload.provenance.authorityReference !== o.executor.adapter + ':' + o.executor.sessionId
  )
    revisionError('plan-approval-provenance');
  return { recordId: e.recordId, payload };
}

function sameCollectedObservation(left, right) {
  if (!left?.observation || !right?.observation) return false;
  const { observation: a, ...leftRest } = left,
    { observation: b, ...rightRest } = right;
  return sameRevisionObservation(a, b) && equal(leftRest, rightRest);
}
export async function approveCurrentRevision({
  context,
  observation,
  planningEvidence,
  provenance,
  deps,
}) {
  assertRevisionMemory(deps);
  canonicalRecordJson({ context, observation, planningEvidence, provenance });
  exactKeys(context, ['repository', 'issue', 'executor'], 'context-keys');
  exactKeys(planningEvidence, ['cfg', 'projectDir'], 'planning-evidence');
  exactKeys(provenance, ['mode'], 'plan-provenance');
  if (
    !['human', 'full-auto'].includes(provenance.mode) ||
    planningEvidence.cfg?.repo !== context.repository ||
    typeof planningEvidence.projectDir !== 'string' ||
    path.resolve(planningEvidence.projectDir) !== path.resolve(context.executor.worktree)
  )
    revisionError('planning-evidence');
  readMemoryAuthority(deps, context);
  const current = await observeRevision({ context, deps });
  if (!sameCollectedObservation(observation, current)) revisionError('plan-observation-drift');
  return runMemoryPlanApproval({
    issueNumber: context.issue,
    cfg: planningEvidence.cfg,
    projectDir: planningEvidence.projectDir,
    backend: deps,
    env: provenance.mode === 'full-auto' ? { TT_FULL_AUTO: '1' } : {},
    expectedObservation: current,
  });
}
