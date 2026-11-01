// @story #2068 — a planned estimate and a later inflation audit can share one comment.
import {
  collectDecompositionCommentProposals,
  previewInflationCommentProposals,
  createDecompositionRuntime,
} from './decomposition-authority.mjs';
import {
  canonicalDecompositionJson,
  decompositionInputDigest,
} from './decomposition-assessment.mjs';
import { estimateEffectDigest, publishEstimateRevision } from './decomposition-publication.mjs';
import { readRegisteredEstimateEffect } from './decomposition-writer-registry.mjs';
import {
  estimateOperationId,
  intendedPublishedRevisionInput,
  readEstimateBeforeRecord,
  resolveEstimateWriterSubject,
} from './estimate-writer-publication.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { gh } from '../../gh/lib/github-projects.mjs';
import { currentSessionId } from '../word-counter.mjs';
import { getActiveTask } from '../session-state.mjs';
import { occupancyPath } from '../paths.mjs';
import { readForecastReadyRecordId } from './estimation/plan-estimate-authority.mjs';
import { maskFencedCodeBlocksPreservingOffsets } from './markers.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { observeNativeBinding } from './native-binding-proof.mjs';
import { readOccupancy } from './occupancy.mjs';
import { readPhysicalRuntimeIdentity } from './runtime-storage.mjs';
import { isBindingRecordClosed, readClosedBindingLedger } from './worktree-binding-lifecycle.mjs';
import { hasUnsupportedGitEnvironment } from './mutation-context.mjs';
import { fetchAssignmentSnapshot, singletonOwner } from './assignment-snapshot.mjs';
import { checkAssigneeMatch } from './assignee-guard.mjs';

const writerId = 'inflate-estimate';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest = /^[0-9a-f]{64}$/;
const same = (left, right) =>
  canonicalDecompositionJson(left) === canonicalDecompositionJson(right);
function requireProof(ok, reason) {
  if (!ok) throw new Error('inflate-estimate:reconciliation-' + reason);
}

async function readInflationActor({ subject, cfg, projectDir }) {
  requireProof(!hasUnsupportedGitEnvironment(), 'actor-environment');
  const cwd = process.cwd(),
    sid = currentSessionId();
  requireProof(cwd === projectDir, 'actor-root');
  const initial = observeNativeBinding({ cwd, sessionId: sid });
  const [assignment, state] = await Promise.all([
    fetchAssignmentSnapshot({ issueNumber: subject.issue, cfg }),
    gh(['api', 'repos/' + subject.repository + '/issues/' + subject.issue, '--jq', '.state']),
  ]);
  const owner = await checkAssigneeMatch({
    issueNumber: subject.issue,
    cfg,
    deps: { fetchSnapshot: async () => assignment },
  });
  const binding = observeNativeBinding({ cwd, sessionId: sid });
  requireProof(same(initial, binding), 'actor-changed');
  const { mainRoot } = readPhysicalRuntimeIdentity(cwd);
  const claim = readOccupancy(occupancyPath(mainRoot))[String(subject.issue)];
  const record = getActiveTask(sid, cwd);
  return {
    sid,
    root: binding.root,
    issue: binding.issue,
    state: binding.state,
    branch: binding.branch,
    head: binding.sourceHead,
    entryStartTs: binding.entryStartTs,
    generation: binding.bindingGenerationId,
    closed:
      !record?.entryStartTs ||
      isBindingRecordClosed({ record, sessionId: sid, ledger: readClosedBindingLedger(mainRoot) }),
    claimSid: claim?.sid,
    claimRoot: claim?.worktreePath,
    claimIssue: claim?.issue,
    claimGeneration: claim?.bindingGenerationId,
    provider: claim?.provider,
    owners: assignment.assignees,
    boardState: assignment.state,
    login: owner.currentUser,
    open: state.trim() === 'open',
  };
}

export function validateAuditRequest(request) {
  requireProof(
    same(Object.keys(request).sort(), ['currentInput', 'issueNumber', 'reconcileAudit']) &&
      Number.isSafeInteger(request.issueNumber) &&
      request.issueNumber > 0 &&
      typeof request.reconcileAudit === 'string' &&
      uuid.test(request.reconcileAudit) &&
      typeof request.currentInput === 'string' &&
      digest.test(request.currentInput),
    'arguments'
  );
}

export function intendedInflationInput(initial, proposal, comments, commentId, nextBody) {
  const forecast = initial.sourceObservations.readForecast.value;
  if (!Array.isArray(forecast?.proposals)) return intendedPublishedRevisionInput(initial, proposal);
  const body = initial.sourceObservations.readIssue.value.body;
  const ready = readForecastReadyRecordId(maskFencedCodeBlocksPreservingOffsets(body));
  const published = forecast.recordId && forecast.recordId === ready ? forecast : null;
  const snapshot = comments.map((c) => ({ id: c.node_id ?? String(c.id), body: c.body }));
  const prior = collectDecompositionCommentProposals({
    comments: snapshot,
    subject: initial.input.subject,
    body,
    published,
    board: initial.sourceObservations.readProject.value,
    bodyFields: parseIssueFieldDb(body).values,
  });
  const next = previewInflationCommentProposals({
    comments: snapshot.map((c, i) => (comments[i].id === commentId ? { ...c, body: nextBody } : c)),
    subject: initial.input.subject,
    published,
  });
  if (!prior.available || !next.available)
    throw new Error('inflate-estimate:proposal-preview-unavailable');
  const beforeIds = new Set(prior.proposals.map((p) => p.proposalId));
  const known = forecast.proposals.filter((p) => beforeIds.has(p.proposalId));
  if (!same(known, prior.proposals)) throw new Error('inflate-estimate:proposal-preview-drift');
  let proposals = next.proposals;
  if (known.length !== forecast.proposals.length) {
    // An independently observed proposal may be absent from the comment-read port.
    // Preserve its relative priority; if a new entry's position is unknown, refuse.
    const byId = new Map(next.proposals.map((p) => [p.proposalId, p]));
    if (next.proposals.some((p) => !beforeIds.has(p.proposalId)))
      throw new Error('inflate-estimate:proposal-order-unavailable');
    proposals = forecast.proposals.flatMap((p) =>
      !beforeIds.has(p.proposalId) ? [p] : byId.has(p.proposalId) ? [byId.get(p.proposalId)] : []
    );
  }
  return intendedPublishedRevisionInput(
    {
      ...initial,
      sourceObservations: {
        ...initial.sourceObservations,
        readForecast: {
          ...initial.sourceObservations.readForecast,
          value: { ...forecast, proposals },
        },
      },
    },
    proposal
  );
}

// Only the old, exact comment revision that participated in the forecast can explain this drift.
// Change that one digest in a copy of the live input; every other observation must already equal
// the original intended seal. Both the old and appended comment bytes have independent witnesses.
function verifyAuditDelta(current, before, evidence, comment) {
  const audit = evidence.find((e) => e.id === 'audit');
  const saved = before.effects.find((e) => e.id === 'audit');
  requireProof(
    comment?.node_id &&
      comment.node_id !== String(comment.id) &&
      audit.targetIdentity === 'comment:' + comment.id &&
      saved.targetIdentity === audit.targetIdentity &&
      saved.intendedDigest === audit.intendedDigest,
    'comment-identity'
  );
  const raw = comment.body,
    key = 'Publication operation: ' + before.operationId;
  const cut = raw.lastIndexOf('\n---\n\n### Discovered work — estimate inflation (');
  requireProof(
    cut >= 0 &&
      raw.endsWith('\n' + key + '\n') &&
      raw.split('\n').filter((line) => line === key).length === 1 &&
      estimateEffectDigest(raw) === audit.intendedDigest &&
      estimateEffectDigest(raw.slice(0, cut)) === saved.beforeDigest,
    'audit-bytes'
  );
  const forecast = structuredClone(current.sourceObservations.readForecast.value);
  const matching = forecast?.proposals?.filter(
    (p) =>
      p.proposalId === 'comment:' + comment.node_id + ':planned-estimate' &&
      p.sourceDigest === audit.intendedDigest
  );
  requireProof(matching?.length === 1, 'proposal-identity');
  matching[0].sourceDigest = saved.beforeDigest;
  const inverse = structuredClone(current.input);
  inverse.observations.find((o) => o.resource === 'forecast').digest =
    estimateEffectDigest(forecast);
  requireProof(
    current.inputDigest !== before.intendedInputDigest &&
      decompositionInputDigest(inverse) === before.intendedInputDigest,
    'unrelated-authority-drift'
  );
}

export async function reconcileInflationAudit(request, cfg, deps, listComments) {
  validateAuditRequest(request);
  const { issueNumber, reconcileAudit: oldId, currentInput } = request;
  const { subject, projectDir } = await resolveEstimateWriterSubject({ cfg, issueNumber, deps });
  let successorId;
  let original;
  let admittedActor;
  const assertActor = async (current) => {
    const a = await (deps.readInflationActor ?? readInflationActor)({ subject, cfg, projectDir });
    requireProof(
      a?.sid &&
        a.sid === a.claimSid &&
        a.root === projectDir &&
        a.root === a.claimRoot &&
        a.issue === '#' + issueNumber &&
        a.claimIssue === issueNumber &&
        a.state === 'develop' &&
        a.boardState === 'develop' &&
        a.branch &&
        a.branch !== 'HEAD' &&
        /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(a.head) &&
        Number.isFinite(Date.parse(a.entryStartTs)) &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          a.generation
        ) &&
        a.generation === a.claimGeneration &&
        a.provider === 'codex' &&
        a.closed === false &&
        a.open === true &&
        a.login &&
        singletonOwner(a.owners) === a.login &&
        readLastKnownState(current.sourceObservations.readIssue.value.body).state === 'develop',
      'actor-authority'
    );
    if (admittedActor) requireProof(same(a, admittedActor), 'actor-changed');
    else admittedActor = structuredClone(a);
  };
  const read = (effect) =>
    readRegisteredEstimateEffect({
      cfg,
      issueNumber,
      publication: original,
      effect,
      collect: () => runtime.collect(subject),
      deps: {
        ...deps,
        plannedEstimate: { listComments: () => listComments({ issueNumber, repo: cfg.repo }) },
      },
    });
  const runtime = createDecompositionRuntime({
    cfg,
    projectDir,
    deps: {
      ...deps.decomposition,
      assertInflationReconciliationActor: assertActor,
      readPublicationEffect: ({ operationId, effect }) => {
        requireProof(operationId === oldId || operationId === successorId, 'unrelated-operation');
        return read(effect);
      },
    },
  });
  const current = await runtime.collect(subject),
    active = current.publication;
  await assertActor(current);
  // An interrupted retry must retain the admitted actor and binding generation, too.
  successorId = estimateOperationId(writerId, {
    reconcileAudit: oldId,
    currentInput,
    actor: admittedActor,
  });
  requireProof(
    current.input.availability.status === 'complete' &&
      current.inputDigest === currentInput &&
      active?.writerId === writerId &&
      same(active.subject, subject),
    'current-authority'
  );
  const replay =
    active.operationId === successorId &&
    active.supersedes?.operationId === oldId &&
    ['pending', 'complete'].includes(active.status);
  requireProof(
    replay || (active.operationId === oldId && active.status === 'pending' && !active.supersedes),
    'predecessor'
  );
  const evidence = replay ? active.supersedes.effects : active.effects;
  requireProof(
    same(
      evidence.map((e) => e.id),
      ['writer-before-values', 'audit', 'size', 'estimate', 'fields', 'authority-context']
    ) && evidence.every((e) => e.status === 'confirmed' && e.intendedDigest === e.observedDigest),
    'effect-shape'
  );
  const body = current.sourceObservations.readIssue.value.body;
  const before = readEstimateBeforeRecord(body);
  const [baseline, audit] = evidence;
  requireProof(
    before &&
      before.operationId === oldId &&
      before.writerId === writerId &&
      same(before.subject, subject) &&
      baseline.intendedDigest === estimateEffectDigest(before) &&
      (replay ||
        (before.intendedInputDigest === active.intendedInputDigest &&
          before.beforeInputDigest === active.beforeInputDigest)) &&
      same(
        before.effects.map((e) => [e.id, e.resource, e.targetIdentity, e.intendedDigest]),
        evidence.slice(1, -1).map((e) => [e.id, e.resource, e.targetIdentity, e.intendedDigest])
      ),
    'before-record'
  );
  requireProof(
    active.proposal.estimate.basis === 'published' &&
      same(active.proposal.estimate, current.input.estimate) &&
      active.proposal.size === current.input.size,
    'business-proposal'
  );
  const fields = parseIssueFieldDb(body).values;
  const project = current.sourceObservations.readProject.value;
  requireProof(
    fields?.estimate === project.estimate && fields?.size === project.size,
    'business-fields'
  );
  const matches = (await listComments({ issueNumber, repo: cfg.repo })).filter(
    (c) => audit.targetIdentity === 'comment:' + c.id
  );
  requireProof(
    matches.length === 1 &&
      matches[0].body.includes('<!-- aitm-refined-estimate: ' + issueNumber + ' -->'),
    'comment-identity'
  );
  verifyAuditDelta(current, before, evidence, matches[0]);
  original = { ...active, operationId: oldId, effects: evidence };
  const effects = [];
  for (const e of evidence) {
    const observed = await read(e);
    requireProof(
      observed.status === 'observed' && observed.digest === e.intendedDigest,
      'confirmed-effect-drift'
    );
    if (e.id === 'authority-context') continue;
    effects.push({
      ...e,
      value: observed.value,
      read: () => read(e),
      apply: () => {
        throw new Error('inflate-estimate:reconciliation-effect-drift');
      },
    });
  }
  // Retain the old before-record verbatim: it seals predecessor identity, before/after digests
  // and descriptors. Only the shared owner's linked publication and assessment may advance.
  return publishEstimateRevision({
    subject,
    operationId: successorId,
    expectedInputDigest: currentInput,
    proposal: active.proposal,
    effects,
    deps: {
      runtime,
      writerId,
      intendedInputDigest: currentInput,
      supersedes: { operationId: oldId, effects: evidence },
    },
  });
}
