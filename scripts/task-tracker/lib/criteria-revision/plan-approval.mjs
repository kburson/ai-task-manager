import { isGovernedPlanObservation } from '../governed-plan-policy.mjs';
// @story #1854
import path from 'node:path';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import {
  exactKeys,
  revisionError,
  hashRevisionValue,
  validatePlanApprovalPayload,
} from './schema.mjs';
const equal = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
export { validatePlanApprovalPayload } from './schema.mjs';
export function validateRevisionPlanApproval(payload, observation) {
  validatePlanApprovalPayload(payload);
  const current = observation.observation,
    p = observation.effectiveProposal,
    contract = observation.currentContract ?? p?.after;
  if (
    !['applied', 'aborted'].includes(observation.status) ||
    !p ||
    p.mode === 'abort' ||
    current.revisionId !== contract.revisionId ||
    payload.revisionId !== contract.revisionId ||
    payload.semanticContractDigest !== contract.semanticContractDigest ||
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
export { planSourceBindings } from '../story-intent-source.mjs';

import { observeRevision } from './engine.mjs';
import {
  assertRevisionMemory,
  withMemoryInterlock,
  assertMemoryCapability,
  readMemoryAuthority,
  memoryNow,
  readMemoryPlanning,
  readMemoryPlanJournal,
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
import {
  resolveContractSource,
  resolveContractSourceFromRecord,
} from '../github-records/contract-source.mjs';
import { parseIssueDirectory } from '../github-records/issue-directory.mjs';
import { deriveCriteriaAuthorityHistory } from './reducer.mjs';
import { renderContractProjectionRecord } from '../github-records/contract-write.mjs';
import {
  renderDeliveryContract,
  validateDeliveryContract,
} from '../github-records/delivery-contract.mjs';
import { buildPlanApprovalAuditComment } from '../plan-approval-audit.mjs';
import { upsertPlanApprovedMarker, parsePlanApprovedMarker } from '../markers.mjs';
import {
  upsertEpicOrchestrationPlan,
  verifyEpicOrchestrationPlan,
} from '../epic-orchestration-plan.mjs';
import { stampBodyVersion, parseBodyVersion } from '../body-version.mjs';
import { stampEntryMarker } from '../stage-entry-markers.mjs';
import { parseEntryMarkers } from '../stage-entry-grammar.mjs';
import {
  resolveStoryIntentSource,
  reconstructHistoricalPlanSource,
  planSourceBindings,
} from '../story-intent-source.mjs';
import { validateGovernedLinkedPlan } from '../governed-plan-policy.mjs';
import { hashBytes } from './schema.mjs';
import { deriveResourceVector } from './proposal.mjs';
import { expectedResourceVector } from './records.mjs';
const sessions = new WeakMap();
function session(token) {
  const held = sessions.get(token);
  if (!held?.live) revisionError('plan-completion-capability');
  assertMemoryCapability(held.backend, held.capability, held.context);
  return held;
}
export function memoryPlanSession(token) {
  const held = session(token);
  return { reapproval: held.current.criteriaAuthority !== null, checklistBody: held.checklistBody };
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
  return { context: held.context, journal: held.journal, capability: held.capability };
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
  const observed = await observeRevision({ context, deps: backend });
  if (expectedObservation && !sameCollectedObservation(expectedObservation, observed))
    revisionError('plan-observation-drift');
  const journal = readMemoryPlanJournal(backend, context),
    before = resumePlanState(observed, journal);
  if (!['empty', 'applied', 'aborted'].includes(before.status))
    return { status: 'revision-approval-refused', code: before.status };
  if (o.stage !== 'plan' && !(o.stage === 'develop' && before.criteriaAuthority))
    return { status: 'wrong-state' };
  return withMemoryInterlock(backend, context, async (capability) => {
    if (!equal(readMemoryPlanning(backend, context), planning))
      revisionError('planning-snapshot-drift');
    if (!equal(readMemoryPlanJournal(backend, context), journal))
      revisionError('plan-journal-drift');
    const current = resumePlanState(await observeRevision({ context, deps: backend }), journal);
    if (
      !equal(current.resourceVector, before.resourceVector) ||
      !sameRevisionObservation(current.observation, before.observation) ||
      !['empty', 'applied', 'aborted'].includes(current.status)
    )
      revisionError('plan-authority-drift');
    const fresh = readMemoryAuthority(backend, context);
    if (fresh.sourceKind === 'canonical-contract')
      assertCanonicalAuthority(fresh, memoryNow(backend), 'plan-approve');
    const source = await planningSource(journal?.before ?? fresh);
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
        journal,
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
          fetchIssueBody: async () =>
            (journal?.before ?? readMemoryAuthority(backend, context)).body.bytes,
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
function resumePlanState(current, journal) {
  if (!journal) return current;
  const chain = current.chain;
  if (
    !chain ||
    chain.head !== journal.revisionEventHead ||
    !['empty', 'applied', 'aborted'].includes(chain.status)
  )
    revisionError('plan-journal-chain');
  if (
    ['applied', 'aborted'].includes(chain.status) &&
    current.status === 'pending-native-plan' &&
    equal(current.nativePlanJournal, journal)
  )
    return { ...current, status: chain.status, observation: journal.before };
  if (chain.status === 'applied') {
    const vector = deriveResourceVector(journal.before);
    vector.revisionEventHead = chain.head;
    if (
      chain.effective.proposal.mode === 'abort' ||
      !equal(vector, expectedResourceVector(chain.effective.proposal, chain.head))
    )
      revisionError('plan-journal-base');
  } else if (journal.before.revision !== 0 || journal.before.revisionId !== null)
    revisionError('plan-journal-base');
  return { ...current, status: chain.status, observation: journal.before };
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
  const actual = readMemoryAuthority(backend, context),
    before = held.journal?.before ?? actual;
  observeFresh(before.body.bytes);
  if (!equal(before.body, held.current.observation.body)) revisionError('plan-authority-drift');
  const source = await planningSource(before),
    ts = held.journal
      ? (held.journal.record.envelope?.createdAt ?? held.journal.record.createdAt)
      : memoryNow(backend);
  const existing = held.journal
    ? null
    : await readCurrentMemoryPlanApproval({
        backend,
        context,
        projectDir: held.projectDir,
      });
  if (existing) {
    if (backend.snapshot.pendingSource) {
      const retained = backend.snapshot.nativePlanRecords?.at(-1);
      if (
        !retained ||
        !equal(retained.after, actual) ||
        (retained.record.recordId ?? retained.record.envelope?.recordId) !== existing.recordId
      )
        revisionError('native-source-completion-retained-plan');
      held.journal = retained;
      held.completed = {
        before: retained.before,
        after: retained.after,
        audit: retained.audit,
        record: retained.record,
      };
      await persistMemoryPlanApproval({ backend, token, ...held.completed });
    }
    return {
      status: 'already-approved',
      recordId: existing.recordId,
      mode: existing.payload.provenance.mode,
    };
  }
  if (before.sourceKind === 'canonical-contract')
    assertCanonicalAuthority(actual, memoryNow(backend), 'plan-approve');
  const payload = {
    schema: 'aitm.plan-approval-binding/v1',
    revisionId:
      (held.current.currentContract ?? held.current.criteriaAuthority?.proposal.after)
        ?.revisionId ?? null,
    semanticContractDigest:
      (held.current.currentContract ?? held.current.criteriaAuthority?.proposal.after)
        ?.semanticContractDigest ?? baselinePlanDigest(source.contract),
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
  const journal = {
    schema: 'aitm.memory-plan-journal/v1',
    ...held.completed,
    planning: { ...held.planning, bodyHash: hashBytes(before.body.bytes) },
    comments: held.journal?.comments ?? backend.comments,
    revisionEventHead: held.current.chain.head,
  };
  if (governedPlan.observation) {
    if (
      !isGovernedPlanObservation(governedPlan, {
        body: before.body.bytes,
        projectDir: held.projectDir,
      })
    )
      revisionError('plan-source-native-read');
    const { projectDir, key, path: sourcePath, text, contentSha256 } = governedPlan.observation;
    journal.sourceRead = {
      schema: 'aitm.native-plan-source-read/v1',
      bodyHash: hashBytes(before.body.bytes),
      projectDir,
      key,
      path: sourcePath,
      text,
      contentSha256,
    };
  }
  if (held.journal && !equal(held.journal, journal)) revisionError('plan-journal-targets');
  held.journal = journal;
  await persistMemoryPlanApproval({ backend, token, ...held.completed });
  if (!equal(readMemoryAuthority(backend, context), after)) revisionError('plan-readback');
  return { status: 'approved', recordId, ts, mode: requestedMode };
}

function criteriaProposal(chain) {
  const { terminals } = deriveCriteriaAuthorityHistory(chain.events);
  const id = terminals.at(-1)?.authorityEventId;
  if (!id) return null;
  const terminal = chain.events.find((event) => event.eventId === id);
  return (
    chain.events.find((event) => event.eventId === terminal.predecessorEventId)?.proposal ?? null
  );
}

export function currentPlanExtension({ observation, chain, backend }) {
  if (!['applied', 'aborted'].includes(chain.status)) return null;
  const p = criteriaProposal(chain);
  if (!p) return null;
  const before =
    p.authority.kind === 'canonical-contract'
      ? canonicalAfterObservation(p)
      : structuredClone(p.archive.observation);
  if (p.authority.kind === 'legacy-body')
    before.body = {
      bytes: p.writeSet.find((w) => w.resource === 'issue-body').afterBytes,
      version: parseBodyVersion(p.writeSet.find((w) => w.resource === 'issue-body').afterBytes),
    };
  return derivePlanExtension({ observation, chain, backend, before, currentContract: p.after });
}

function derivePlanExtension({
  observation,
  chain,
  backend,
  before,
  currentContract,
  planningSnapshot,
  auditComments = backend.comments,
  historicalSource = null,
}) {
  const p = criteriaProposal(chain);
  if (!p) revisionError('plan-criteria-authority');
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
  const projectDir = observation.executor.worktree;
  let resolved, sourceBindings;
  if (historicalSource) ({ resolved, sourceBindings } = historicalSource);
  else {
    const governedPlan = validateGovernedLinkedPlan({ body: observation.body.bytes, projectDir });
    resolved = resolveStoryIntentSource({ body: observation.body.bytes, projectDir, governedPlan });
    if (!governedPlan.ok || !resolved.ok) revisionError('plan-approval-source-binding');
    sourceBindings = planSourceBindings(resolved, governedPlan);
  }
  validateRevisionPlanApproval(payload, {
    status: chain.status,
    observation: { ...observation, revisionId: p.after.revisionId },
    effectiveProposal: p,
    currentContract,
    planSourceBindings: sourceBindings,
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
    auditComments.filter((c) => c.body === audit).length !== 1
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
  const { ready, planning } = currentPlanningBinding(
    backend,
    observation,
    resolved.binding,
    planningSnapshot
  );
  return approvalAfter(before, record, resolved.binding, {
    forecastRecordId: ready,
    trunkSha: marker.trunkSha ?? null,
    epicChildren: planning.epicChildren,
  });
}

function currentPlanningBinding(backend, observation, binding, planningSnapshot) {
  const body = observation.body.bytes,
    marker = parsePlanApprovedMarker(body);
  if (
    !marker ||
    ['storyDigest', 'storyIntentDigest', 'storyIntentSource'].some(
      (key) => marker[key] !== binding[key]
    )
  )
    revisionError('plan-approval-source-projection');
  const ready =
    new RegExp(
      '<!--\\s*aitm-estimation-forecast-ready\\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\\s*-->',
      'i'
    ).exec(body)?.[1] ?? null;
  const planning =
    planningSnapshot ??
    readMemoryPlanning(backend, {
      repository: observation.repository,
      issue: observation.issue,
    });
  if (
    planning.bodyHash !== hashBytes(body) ||
    planning.repository !== observation.repository ||
    planning.issue !== observation.issue
  )
    revisionError('plan-approval-planning-binding');
  if (
    (marker.forecastRecordId ?? null) !== ready ||
    (Number.isInteger(planning.cfg.estimationRubricIssue) &&
      planning.cfg.estimationRubricIssue > 0 &&
      ready === null)
  )
    revisionError('plan-approval-forecast');
  const requiredTrunk =
    parseEntryMarkers(body).some((e) => e.state === 'ready-for-plan') ||
    planning.epicChildren.length > 0;
  if (
    (marker.trunkSha ?? null) !== (requiredTrunk ? planning.trunkSha : null) ||
    (requiredTrunk && !planning.trunkSha)
  )
    revisionError('plan-approval-trunk');
  if (
    planning.epicChildren.length &&
    !verifyEpicOrchestrationPlan(body, {
      children: planning.epicChildren,
      trunkSha: planning.trunkSha,
    }).ok
  )
    revisionError('plan-approval-children');
  return { ready, planning };
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
  if (readMemoryPlanJournal(backend, context)) return null;
  const state = await observeRevision({ context, deps: backend });
  if (['applied', 'aborted'].includes(state.status) && state.criteriaAuthority) {
    if (state.currentContract) {
      if (!state.nativeHistoryApproved) return null;
      if (state.observation.sourceKind === 'canonical-contract') {
        const o = state.observation;
        const source = await planningSource(o);
        const policy = validateGovernedLinkedPlan({
          body: o.body.bytes,
          projectDir: o.executor.worktree,
        });
        const resolved = resolveStoryIntentSource({
          body: o.body.bytes,
          projectDir: o.executor.worktree,
          governedPlan: policy,
        });
        if (!policy.ok || !resolved.ok) revisionError('plan-approval-source-binding');
        return validateNativePlanObservation({
          o,
          backend,
          source,
          resolved,
          sourceBindings: planSourceBindings(resolved, policy),
          now: memoryNow(backend),
          comments: backend.comments,
          criteriaState: state,
        });
      }
      if (state.observation.sourceKind !== 'legacy-body') revisionError('source-plan-kind');
      const markers = [...state.observation.body.bytes.matchAll(legacyBindingRE)];
      if (markers.length !== 1) revisionError('source-plan-binding');
      return JSON.parse(markers[0][1]);
    }
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
  if (state.status !== 'empty' && !(state.status === 'aborted' && !state.criteriaAuthority))
    return null;
  const o = state.observation;
  if (o.sourceKind !== 'canonical-contract') return null;
  const source = await planningSource(o);
  const policy = validateGovernedLinkedPlan({
    body: o.body.bytes,
    projectDir: projectDir || o.executor.worktree,
  });
  const resolved = resolveStoryIntentSource({
    body: o.body.bytes,
    projectDir: projectDir || o.executor.worktree,
    governedPlan: policy,
  });
  if (!policy.ok || !resolved.ok) revisionError('plan-approval-source-binding');
  return validateNativePlanObservation({
    o,
    backend,
    source,
    resolved,
    sourceBindings: planSourceBindings(resolved, policy),
    now: memoryNow(backend),
    comments: backend.comments,
  });
}

function validateNativePlanObservation({
  o,
  backend,
  source,
  resolved,
  sourceBindings,
  now,
  comments,
  planningSnapshot,
  criteriaState = null,
}) {
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

  assertCanonicalAuthority(o, now, 'plan-approve');
  const body = o.body.bytes;
  if (!resolved.ok) revisionError('plan-approval-source-binding');
  const payload = e.payload,
    marker = parsePlanApprovedMarker(body);
  if (criteriaState) {
    validateRevisionPlanApproval(payload, {
      status: criteriaState.status,
      observation: o,
      effectiveProposal: criteriaState.criteriaAuthority.proposal,
      currentContract: criteriaState.currentContract,
      planSourceBindings: sourceBindings,
      approvalEnvelope: e,
    });
  }
  if (
    (!criteriaState &&
      (payload.revisionId !== null ||
        payload.semanticContractDigest !== baselinePlanDigest(source.contract))) ||
    e.authority.actor !== o.grant.coordinator.actor ||
    payload.contractEpoch !== o.contract.value.contractEpoch ||
    !equal(payload.sourceBindings, sourceBindings) ||
    e.authority.epoch !== o.grant.epoch ||
    e.authority.grantId !== o.grant.identity ||
    !o.contract.value.acceptedRecordIds.includes(e.recordId) ||
    !marker ||
    marker.ts !== e.createdAt ||
    marker.mode !== payload.provenance.mode
  )
    revisionError('plan-approval-binding');
  const proofs = o.proofRecords.filter((r) => r.identity === e.recordId);
  if (
    !equal(proofs, [
      {
        kind: 'plan-approval',
        identity: e.recordId,
        bytes: o.capsule.bytes,
        criterionIdentity: null,
      },
    ]) ||
    body.split(renderDeliveryContract({ contract: o.contract.value }).markdown).length !== 2
  )
    revisionError('plan-approval-projection');
  currentPlanningBinding(backend, o, resolved.binding, planningSnapshot);
  const audit =
    payload.provenance.mode === 'full-auto'
      ? buildPlanApprovalAuditComment({ issueNumber: o.issue, ts: e.createdAt })
      : `Plan approval recorded by ${o.executor.adapter}:${o.executor.sessionId} at ${e.createdAt}.`;
  if (
    comments.filter((c) => c.body === audit).length !== 1 ||
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

// Reconstruct a retained native completion against its exact predecessor. This
// validates data; it issues neither a checks token nor write authority.
function retainedCanonicalPlanningSource(observation) {
  const directory = parseIssueDirectory({ issueBody: observation.body.bytes });
  if (!directory) revisionError('plan-contract-source');
  const body = renderContractProjectionRecord({
    repository: observation.repository,
    issue: observation.issue,
    contract: observation.contract.value,
    actor: observation.grant.coordinator.actor,
  });
  const record = {
    ...parseAitmRecord({
      commentNodeId: directory.singletons['delivery-contract'],
      body,
      expectedRepository: observation.repository,
      expectedIssue: observation.issue,
    }),
    body,
  };
  return resolveContractSourceFromRecord({
    repository: observation.repository,
    issue: observation.issue,
    issueBody: observation.body.bytes,
    record,
  });
}

function reconstructBaselinePlanRecord({ journal, expected, backend, pending }) {
  if (
    journal.before.sourceKind !== 'canonical-contract' ||
    !sameRevisionObservation(journal.before, expected)
  )
    revisionError('native-baseline-predecessor');
  const record = journal.record,
    envelope = record.envelope;
  if (
    !envelope ||
    envelope.predecessor !== journal.before.capsule.head ||
    envelope.authority.actor !== journal.before.grant.coordinator.actor ||
    envelope.authority.epoch !== journal.before.grant.epoch ||
    envelope.authority.grantId !== journal.before.grant.identity
  )
    revisionError('native-baseline-authority');
  assertCanonicalAuthority(journal.before, envelope.createdAt, 'plan-approve');
  let resolved, sourceBindings;
  if (journal.sourceRead)
    ({ resolved, sourceBindings } = reconstructHistoricalPlanSource({
      sourceRead: journal.sourceRead,
      body: journal.before.body.bytes,
      projectDir: journal.before.executor.worktree,
    }));
  else {
    const policy = validateGovernedLinkedPlan({
      body: journal.before.body.bytes,
      projectDir: journal.before.executor.worktree,
    });
    resolved = resolveStoryIntentSource({
      body: journal.before.body.bytes,
      projectDir: journal.before.executor.worktree,
      governedPlan: policy,
    });
    if (!policy.ok || !resolved.ok) revisionError('plan-approval-source-binding');
    sourceBindings = planSourceBindings(resolved, policy);
  }
  const comments = [
    ...journal.comments,
    { id: 'memory-plan-audit-' + record.recordId, body: journal.audit },
  ];
  if (
    (pending ? journal.comments : comments).some(
      (c) => !backend.comments.some((actual) => equal(c, actual))
    )
  )
    revisionError('native-plan-comments');
  const planningSnapshot = { ...journal.planning, bodyHash: hashBytes(journal.after.body.bytes) };
  validateNativePlanObservation({
    o: journal.after,
    backend,
    source: retainedCanonicalPlanningSource(journal.after),
    resolved,
    sourceBindings,
    now: envelope.createdAt,
    comments: pending ? comments : backend.comments,
    planningSnapshot,
  });
  const marker = parsePlanApprovedMarker(journal.after.body.bytes);
  const { ready, planning } = currentPlanningBinding(
    backend,
    journal.after,
    resolved.binding,
    planningSnapshot
  );
  const derived = approvalAfter(journal.before, record, resolved.binding, {
    forecastRecordId: ready,
    trunkSha: marker.trunkSha ?? null,
    epicChildren: planning.epicChildren,
  });
  if (
    !sameRevisionObservation(derived, journal.after) ||
    record.bytes !== journal.after.capsule.bytes ||
    hashBytes(journal.audit) !== envelope.payload.provenance.auditReference
  )
    revisionError('native-baseline-effect');
  return derived;
}

export function reconstructNativePlanRecord({
  journal,
  expected,
  currentContract,
  chain,
  backend,
  pending = false,
}) {
  if (
    journal.revisionEventHead !== chain.head ||
    !sameRevisionObservation(journal.before, expected) ||
    journal.planning.bodyHash !== hashBytes(journal.before.body.bytes)
  )
    revisionError('native-plan-predecessor');
  const authority = deriveCriteriaAuthorityHistory(chain.events);
  if (!authority.terminals.at(-1)?.authorityEventId)
    return reconstructBaselinePlanRecord({ journal, expected, backend, pending });
  const expectedComments = [
    ...journal.comments,
    { id: 'memory-plan-audit-' + journal.record.recordId, body: journal.audit },
  ];
  if (
    (pending ? journal.comments : expectedComments).some(
      (c) => !backend.comments.some((actual) => equal(c, actual))
    )
  )
    revisionError('native-plan-comments');
  const historicalSource = journal.sourceRead
    ? reconstructHistoricalPlanSource({
        sourceRead: journal.sourceRead,
        body: journal.before.body.bytes,
        projectDir: journal.before.executor.worktree,
      })
    : null;
  const derived = derivePlanExtension({
    historicalSource,
    observation: journal.after,
    chain,
    backend,
    before: journal.before,
    currentContract,
    planningSnapshot: { ...journal.planning, bodyHash: hashBytes(journal.after.body.bytes) },
    auditComments: pending ? expectedComments : backend.comments,
  });
  if (!derived || !sameRevisionObservation(derived, journal.after))
    revisionError('native-plan-effect');
  const legacyRecord =
    journal.after.sourceKind === 'legacy-body'
      ? JSON.parse([...journal.after.body.bytes.matchAll(legacyBindingRE)][0][1])
      : null;
  if (legacyRecord && !equal(legacyRecord, journal.record)) revisionError('native-plan-record');
  if (
    hashBytes(journal.audit) !==
    (journal.record.envelope?.payload ?? journal.record.payload).provenance.auditReference
  )
    revisionError('native-plan-audit');
  return structuredClone(derived);
}
