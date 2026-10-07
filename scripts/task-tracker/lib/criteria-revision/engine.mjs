import { validateGovernedLinkedPlan } from '../governed-plan-policy.mjs';
import { reconstructNativeHistory } from './source-correction.mjs';
import { deriveCriteriaAuthorityHistory, selectEffectiveRevisionProposalEvents } from './reducer.mjs';
import { nativeProofContinuation, projectNativeIndividualProofs } from './proof-execution.mjs';
import { metadataContinuation } from './consumer-continuation.mjs';
import { currentPlanExtension } from './plan-approval.mjs';
import {
  deriveCanonicalWrites,
  applyCanonicalRevision,
  canonicalPrefixVectors,
  sameRevisionObservation,
  assertCanonicalAuthority,
} from './canonical.mjs';
// @story #1853
// Transaction mutation is confined to the opaque memory backend until Tasks5/6.
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { mutateIssueBody } from '../issue-body-mutate.mjs';
import {
  hashBytes,
  hashRevisionValue,
  exactKeys,
  revisionError,
  validateRevisionObservation,
  validateRevisionRequest,
} from './schema.mjs';
import {
  deriveProposal,
  projectCollectedRevisionObservation,
  deriveResourceVector,
  hashSemanticContract,
  renderApprovalStatement,
} from './proposal.mjs';
import { resolveRevisionAuthorization } from './authorization.mjs';
import {
  createRevisionEvent,
  createTerminalEvent,
  expectedResourceVector,
  renderRevisionEvent,
  revisionRecord,
} from './records.mjs';
import { deriveLegacyWrites, withLegacyWriteCapability } from './legacy.mjs';
import {
  assertRevisionMemory,
  readMemoryAuthority,
  readMemoryNativeHistory,
  readMemoryPlanning,
  readMemoryPlanJournal,
  readMemoryNativeProofRecords,
  readRevisionChain,
  loadMemoryUserMessage,
  withMemoryInterlock,
  publishMemoryDeny,
  appendMemoryEvent,
  assertMemoryCapability,
} from './store.mjs';
const equal = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const refusal = (error) => ({ status: 'refused', code: String(error.message ?? error) });
function boundary(context, deps) {
  assertRevisionMemory(deps);
  exactKeys(context, ['repository', 'issue', 'executor'], 'context-keys');
}
function identities(definitions) {
  return definitions.map((d) => ({
    identity: d.identity,
    section: d.section,
    rootId: d.rootId,
    definitionHash: hashSemanticContract([{ ...d, identity: 'unbound' }]),
  }));
}
function retired(chain) {
  return [
    ...new Set(
      selectEffectiveRevisionProposalEvents(chain.events)
        .flatMap((e) =>
          e.proposal.identityMap
            .filter((m) => !m.afterIdentities.includes(m.beforeIdentity))
            .map((m) => m.beforeIdentity)
        )
    ),
  ];
}
function noResurrection(chain, bytes) {
  for (const event of selectEffectiveRevisionProposalEvents(chain.events)) {
    const p = event.proposal;
    const markers = [
      ...p.archive.observation.body.bytes.matchAll(new RegExp('<!--[\\s\\S]*?-->', 'g')),
    ].map((x) => x[0]);
    const sources = [
      ...p.archive.definitions.flatMap((d) => (d.proof ? [d.proof.bytes] : [])),
      ...p.archive.observation.proofRecords.map((x) => x.bytes),
      ...markers,
    ];
    for (const item of p.invalidation.filter((x) => x.disposition === 'retired')) {
      for (const source of sources.filter((x) => hashBytes(x) === item.bytesHash))
        if (bytes.includes(source)) revisionError('retired-proof-resurrection');
    }
  }
}
function vectorState(observation, chain) {
  if (chain.status === 'empty') return 'empty';
  const p = chain.effective.proposal,
    vector = deriveResourceVector(observation);
  const before = { ...p.archive.resourceVector, revisionEventHead: chain.head };
  const after = expectedResourceVector(p, chain.head);
  if (p.mode !== 'abort' && equal(vector, after)) return 'pending-after';
  if (equal(vector, before)) return 'pending-before';
  if (
    p.authority.kind === 'canonical-contract' &&
    canonicalPrefixVectors(p, chain.head).some((v) => equal(v, vector))
  )
    return 'pending-prefix';
  return 'pending-drift';
}
async function collect(context, deps) {
  boundary(context, deps);
  const observation = readMemoryAuthority(deps, context);
  validateRevisionObservation(observation);
  const chain = await readRevisionChain({ context, transport: deps });
  const authorityId = deriveCriteriaAuthorityHistory(chain.events).terminals.at(-1)?.authorityEventId ?? null;
  const authorityTerminal = chain.events.find(event => event.eventId === authorityId);
  const criteriaAuthority = authorityTerminal ? { eventId: authorityId,
    proposal: chain.events.find(event => event.eventId === authorityTerminal.predecessorEventId).proposal } : null;
  let historyContinuation = null;
  const nativeHistory = readMemoryNativeHistory(deps);
  const historicalRecords = nativeHistory.order.some(ref => ref.revisionEventHead !== chain.head);
  const changedObserver = observation.sourceKind === 'legacy-body' &&
    [...nativeHistory.plans, ...nativeHistory.proofs, ...nativeHistory.sources].some(j => !equal(j.before.executor, observation.executor));
  const historyValidated = nativeHistory.sources.length > 0 || (nativeHistory.stages ?? []).length > 0 || historicalRecords || changedObserver;
  if (historyValidated) {
    const sourceInput = { body: observation.body.bytes, projectDir: observation.executor.worktree };
    const originalLinkedSource = canonicalRecordJson(validateGovernedLinkedPlan(sourceInput));
    const originalNativeSources = canonicalRecordJson(deps.snapshot);
    historyContinuation = await reconstructNativeHistory({ history: nativeHistory, chain, backend: deps, observation, pendingPlan: readMemoryPlanJournal(deps, context) });
    boundary(context, deps);
    if (canonicalRecordJson(deps.snapshot) !== originalNativeSources) revisionError('native-history-await-drift');
    if (canonicalRecordJson(validateGovernedLinkedPlan(sourceInput)) !== originalLinkedSource)
      revisionError('native-history-current-source');
    if (historyContinuation?.planning) {
      // A fully replayed pending stage retains the original planning read data
      // across its own exact body prefix. This historical comparison cannot
      // make a current planning read eligible or grant a pending effect.
      const pendingStage = historyContinuation.status === 'pending-native-stage';
      const actualPlanning = pendingStage ? deps.snapshot.planning : readMemoryPlanning(deps, context);
      const planningBody = pendingStage ? historyContinuation.observation.body.bytes : observation.body.bytes;
      if (!equal(actualPlanning, { ...historyContinuation.planning, bodyHash: hashBytes(planningBody) }))
        revisionError('native-history-planning-drift');
    }
  }
  let approvalExtension = null;
  try {
    if (!historyContinuation) approvalExtension = currentPlanExtension({ observation, chain, backend: deps });
  } catch {
    /* Invalid approval remains authority drift. */
  }
  let nativeContinuation = null;
  const nativeRecords = readMemoryNativeProofRecords(deps);
  if (nativeRecords.length && !historyValidated) {
    if (!approvalExtension || chain.status !== 'applied') revisionError('native-proof-approval-unavailable');
    nativeContinuation = nativeProofContinuation({ observation, expected: approvalExtension,
      proposal: chain.effective.proposal, records: nativeRecords, revisionEventHead: chain.head, chain });
  }
  const approvedAfter = historyContinuation?.status === 'complete' ||
    approvalExtension &&
    (nativeContinuation?.status === 'complete' || equal(deriveResourceVector(observation), deriveResourceVector(approvalExtension)) ||
      (chain.status === 'applied' && metadataContinuation({ observation, expected: approvalExtension, proposal: chain.effective.proposal })));
  observation.revisionRecords = { complete: true, records: chain.events.map(revisionRecord) };
  if (chain.status !== 'empty') {
    const p = chain.effective.proposal;
    const after = p.writeSet.find((w) => w.resource === 'issue-body');
    if (historyContinuation?.status === 'complete' && chain.status === 'aborted') {
      Object.assign(observation, projectCollectedRevisionObservation({ observation, chain, currentContract: historyContinuation.currentContract }));
    } else if (after && (hashBytes(observation.body.bytes) === after.afterHash || approvedAfter)) {
      if (chain.status === 'applied') Object.assign(observation, projectCollectedRevisionObservation({
        observation, chain, currentContract: historyContinuation?.currentContract ?? p.after,
      }));
      else observation.identities = identities(
        (historyContinuation?.currentContract ?? p.after).definitions.map((d) => ({
          ...d,
          sourceBindings: observation.protectedSourceBindings,
        }))
      );
      observation.revision = p.after.revision;
      observation.revisionId = p.after.revisionId;
    } else if (hashBytes(observation.body.bytes) === p.before.bodyHash) {
      observation.identities = p.mode === 'resume' ? null : identities(p.archive.definitions);
      observation.revision = p.archive.observation.revision;
      observation.revisionId = p.archive.observation.revisionId;
    } else {
      observation.identities = null;
      const marker =
        /<!-- aitm-criteria-revision schema="aitm.criteria-revision\/v1" revision="(\d+)" transaction-id="([^\"]+)"/.exec(
          observation.body.bytes
        );
      observation.revision = marker ? Number(marker[1]) : 0;
      observation.revisionId = marker?.[2] ?? null;
    }
    observation.retiredIdentities = retired(chain);
  } else if (
    observation.revision !== 0 ||
    /<!--\s*aitm-criteria-revision\b/.test(observation.body.bytes)
  )
    revisionError('missing-revision-chain');
  validateRevisionObservation(observation);
  const progress = approvedAfter ? (chain.status === 'aborted' ? 'pending-before' : 'pending-after') : vectorState(observation, chain);
  let status = chain.status === 'pending' ? progress : chain.status;
  if (chain.status === 'applied') {
    if (progress !== 'pending-after') status = 'authority-drift';
    else noResurrection(chain, observation.body.bytes);
  }
  if (chain.status === 'aborted' && progress !== 'pending-before') status = 'authority-drift';
  if (nativeContinuation?.status === 'pending') status = 'pending-native-proof';
  if (historyContinuation?.status.startsWith('pending-')) status = historyContinuation.status;
  const nativeIndividualProofs = nativeRecords.length &&
    (nativeContinuation?.status === 'complete' || historyValidated) && !status.startsWith('pending-native-')
    ? projectNativeIndividualProofs({ observation, chain, completedProofRecords: nativeRecords }) : [];
  return {
    status,
    observation,
    chain,
    nativeIndividualProofs,
    resourceVector: deriveResourceVector(observation),
    effectiveProposal: chain.effective?.proposal ?? null,
    criteriaAuthority,
    ...(historyContinuation ? { currentContract: historyContinuation.currentContract, nativeHistoryApproved: historyContinuation.approved } : {}),
    ...(historyContinuation?.status === 'pending-native-proof' ? { nativeProofJournal: historyContinuation.journal } : {}),
    ...(historyContinuation?.status === 'pending-native-source' ? { nativeSourceJournal: historyContinuation.journal } : {}),
    ...(historyContinuation?.status === 'pending-native-plan' ? { nativePlanJournal: historyContinuation.journal } : {}),
    ...(nativeContinuation?.status === 'pending' ? { nativeProofJournal: nativeContinuation.journal } : {}),
  };
}
export async function observeRevision({ context, deps }) {
  try {
    return await collect(context, deps);
  } catch (error) {
    return { status: 'indeterminate', code: String(error.message ?? error) };
  }
}
function deriveWrites(proposal) {
  return proposal.authority.kind === 'legacy-body'
    ? deriveLegacyWrites(proposal)
    : deriveCanonicalWrites({
        proposal,
        contract: proposal.archive.observation.contract.value,
        grant: proposal.archive.observation.grant,
      });
}
function mutable(observation) {
  if (
    !['refine', 'ready-for-plan', 'plan', 'develop'].includes(observation.stage) ||
    observation.issueState !== 'open' ||
    observation.delivery.state !== 'none'
  )
    revisionError('stage-delivery');
}
async function authorize(proposal, authorizationSource, deps) {
  const result = await resolveRevisionAuthorization({
    proposal,
    authorizationSource,
    loadUserMessage: (source) => loadMemoryUserMessage(deps, source),
  });
  if (result.status !== 'verified') revisionError(result.code);
  return result.authority;
}
function eventFor(request, chain, authorizer) {
  return createRevisionEvent({
    request,
    predecessorEventId:
      request.proposal.mode === 'revision'
        ? request.proposal.archive.resourceVector.revisionEventHead
        : chain.head,
    ...(request.proposal.mode === 'revision'
      ? {}
      : { rootEventId: chain.root.eventId, rootProposalDigest: chain.root.proposalDigest }),
    authorizer,
  });
}
function originalUntouched(current) {
  const expected = {
    ...current.chain.root.proposal.archive.resourceVector,
    revisionEventHead: current.chain.head,
  };
  return equal(current.resourceVector, expected);
}
export async function prepareRevision({ context, input, deps }) {
  try {
    boundary(context, deps);
    const keys = ['mode', 'operationId', 'transactionId', 'reason', 'edits'];
    exactKeys(
      input,
      input?.authorizationSource === undefined ? keys : [...keys, 'authorizationSource'],
      'prepare-input'
    );
    const current = await collect(context, deps),
      { chain, observation } = current;
    if (observation.sourceKind === 'canonical-contract') {
      const now = new Date().toISOString();
      assertCanonicalAuthority(observation, now);
      if (input.mode !== 'resume') observation.canonicalArchive.observedAt = now;
    }
    if (input.mode === 'revision' && chain.status === 'pending')
      revisionError('pending-transaction');
    if (input.mode !== 'revision' && chain.status !== 'pending')
      revisionError('recovery-not-pending');
    if (
      input.mode === 'resume' &&
      !['pending-before', 'pending-prefix', 'pending-after'].includes(current.status)
    )
      revisionError('recovery-prefix');
    if (input.mode === 'abort' && !originalUntouched(current)) revisionError('abort-touched');
    const proposal = deriveProposal({
      observation,
      ...(input.mode === 'resume' ? {} : { nativeIndividualProofs: input.mode === 'abort' ? [] : current.nativeIndividualProofs }),
      edits: input.edits,
      reason: input.reason,
      mode: input.mode,
      executor: context.executor,
      operationId: input.operationId,
      transactionId: input.transactionId,
      priorTransaction:
        input.mode === 'revision'
          ? null
          : { transactionId: chain.root.transactionId, eventId: chain.head },
    });
    deriveWrites(proposal);
    if (input.mode === 'forward-repair') noResurrection(chain, proposal.writeSet[0].afterBytes);
    const exact = input.authorizationSource !== undefined;
    const source = input.authorizationSource ?? {
      schema: 'aitm.authorization-source/v1',
      adapter: 'codex-session/v1',
      sessionId: proposal.executor.sessionId,
      messageId: 'x'.repeat(256),
      statementHash: hashBytes(renderApprovalStatement(proposal)),
    };
    const authorizer = exact ? await authorize(proposal, source, deps) : null;
    const request = {
      schema: 'aitm.criteria-revision/v1',
      action: input.mode === 'revision' ? 'apply' : 'recover',
      proposal,
      authorizationSource: source,
    };
    const event = eventFor(request, chain, authorizer),
      rendered = renderRevisionEvent(event);
    const terminal = createTerminalEvent({
      events: [...chain.events, event],
      type: proposal.mode === 'abort' ? 'aborted' : 'applied',
    });
    return {
      status: 'prepared',
      proposal,
      approvalStatement: renderApprovalStatement(proposal),
      rendered,
      size: Buffer.byteLength(rendered, 'utf8'),
      terminalSize: Buffer.byteLength(renderRevisionEvent(terminal), 'utf8'),
      publishable: exact,
      rendering: exact ? 'authorized-exact' : 'non-publishable-preview',
    };
  } catch (error) {
    return refusal(error);
  }
}
function matchRequest(current, request, context) {
  const p = request.proposal,
    chain = current.chain;
  if (!equal(p.executor, context.executor)) revisionError('executor-mismatch');
  mutable(current.observation);
  if (current.observation.sourceKind === 'canonical-contract') {
    const now = new Date().toISOString();
    assertCanonicalAuthority(current.observation, now);
    if (Date.parse(p.archive.observation.canonicalArchive.observedAt) > Date.parse(now))
      revisionError('future-canonical-time');
  }
  if (
    (chain.status === 'applied' || chain.status === 'aborted') &&
    chain.root.transactionId === p.transactionId
  ) {
    if (
      chain.effective.proposal.proposalDigest !== p.proposalDigest ||
      current.status !== chain.status
    )
      revisionError('terminal-not-current');
    return 'terminal';
  }
  if (chain.status === 'pending' && chain.effective.proposal.proposalDigest === p.proposalDigest) {
    if (!['pending-before', 'pending-prefix', 'pending-after'].includes(current.status))
      revisionError('recovery-prefix');
    return 'retry';
  }
  if (p.mode === 'revision') {
    if (chain.status === 'pending') revisionError('pending-transaction');
    if (current.status !== chain.status) revisionError('authority-drift');
    if (!sameRevisionObservation(current.observation, p.archive.observation))
      revisionError('stale-observation');
    if ((!Object.hasOwn(p.archive, 'nativeIndividualProofs') || !equal(p.archive.nativeIndividualProofs, current.nativeIndividualProofs)))
      revisionError('native-individual-authority');
    return 'new';
  }
  if (
    chain.status !== 'pending' ||
    p.priorTransaction.eventId !== chain.head ||
    p.priorTransaction.transactionId !== chain.root.transactionId ||
    p.observedResourceVector !== hashRevisionValue(current.resourceVector) ||
    !sameRevisionObservation(p.archive.observation, current.observation)
  )
    revisionError('stale-recovery-vector');
  if (
    p.mode === 'resume' &&
    !['pending-before', 'pending-prefix', 'pending-after'].includes(current.status)
  )
    revisionError('recovery-prefix');
  if (p.mode === 'abort' && !originalUntouched(current)) revisionError('abort-touched');
  if (p.mode === 'abort' && (!Object.hasOwn(p.archive, 'nativeIndividualProofs') || p.archive.nativeIndividualProofs.length)) revisionError('native-individual-authority');
  if (p.mode === 'forward-repair') {
    if ((!Object.hasOwn(p.archive, 'nativeIndividualProofs') || !equal(p.archive.nativeIndividualProofs, current.nativeIndividualProofs))) revisionError('native-individual-authority');
    noResurrection(chain, p.writeSet[0].afterBytes);
  }
  return 'new';
}
async function execute({ context, request, deps }) {
  try {
    boundary(context, deps);
    validateRevisionRequest(request);
    deriveWrites(request.proposal);
    // Actual host provenance and both complete records are checked pre-lock.
    const authorizer = await authorize(request.proposal, request.authorizationSource, deps);
    const pre = await collect(context, deps),
      admission = matchRequest(pre, request, context);
    const event =
      admission === 'new'
        ? eventFor(request, pre.chain, authorizer)
        : pre.chain.events.find(
            (e) => e.proposalDigest === request.proposal.proposalDigest && e.proposal
          );
    if (!event) revisionError('effective-event');
    renderRevisionEvent(event);
    const pending = pre.chain.events.filter(
      (e) =>
        !['applied', 'aborted'].includes(e.type) ||
        e.transactionId !== request.proposal.transactionId
    );
    renderRevisionEvent(
      createTerminalEvent({
        events: admission === 'new' ? [...pre.chain.events, event] : pending,
        type: request.proposal.mode === 'abort' ? 'aborted' : 'applied',
      })
    );
    return await withMemoryInterlock(deps, context, async (capability) => {
      const actual = await authorize(request.proposal, request.authorizationSource, deps);
      if (!equal(actual, authorizer)) revisionError('authorization-drift');
      let current = await collect(context, deps);
      const route = matchRequest(current, request, context);
      if (route !== admission) revisionError('admission-drift');
      if (route === 'terminal')
        return {
          status: current.chain.status,
          eventId: current.chain.head,
          proposalDigest: request.proposal.proposalDigest,
        };
      await publishMemoryDeny(deps, capability, context);
      if (route === 'new') {
        const concrete = eventFor(request, current.chain, actual);
        if (renderRevisionEvent(concrete) !== renderRevisionEvent(event))
          revisionError('rendering-drift');
        await appendMemoryEvent({ backend: deps, capability, context, event });
        current = await collect(context, deps);
      }
      if (current.chain.effective.proposal.proposalDigest !== request.proposal.proposalDigest)
        revisionError('superseded-operation');
      const p = current.chain.effective.proposal;
      if (p.mode === 'abort') {
        if (!originalUntouched(current)) revisionError('abort-touched');
      } else if (p.authority.kind === 'canonical-contract') {
        await applyCanonicalRevision({ capability, proposal: p, deps });
      } else if (current.status === 'pending-before') {
        assertMemoryCapability(deps, capability, context);
        await withLegacyWriteCapability(
          {
            backend: deps,
            capability,
            context,
            proposal: p,
            before: current.observation.body.bytes,
          },
          async (token) =>
            mutateIssueBody({
              repo: context.repository,
              issueNumber: context.issue,
              mutate: () => p.writeSet.find((w) => w.resource === 'issue-body').afterBytes,
              criteriaRevisionCapability: token,
              deps: { revisionBackend: deps },
              expectedVersion: current.observation.body.version,
            })
        );
      } else if (current.status !== 'pending-after') revisionError('recovery-prefix');
      current = await collect(context, deps);
      if (p.mode === 'abort' ? !originalUntouched(current) : current.status !== 'pending-after')
        revisionError('after-state');
      if (p.mode !== 'abort') noResurrection(current.chain, current.observation.body.bytes);
      assertMemoryCapability(deps, capability, context);
      const terminal = createTerminalEvent({
        events: current.chain.events,
        type: p.mode === 'abort' ? 'aborted' : 'applied',
      });
      await appendMemoryEvent({ backend: deps, capability, context, event: terminal });
      const verified = await collect(context, deps);
      if (verified.status !== terminal.type || verified.chain.head !== terminal.eventId)
        revisionError('terminal-readback');
      return { status: terminal.type, eventId: terminal.eventId, proposalDigest: p.proposalDigest };
    });
  } catch (error) {
    if (String(error.message).startsWith('interrupted:')) throw error;
    return refusal(error);
  }
}
export async function applyRevision(args) {
  if (args?.request?.action !== 'apply')
    return refusal(new Error('criteria-revision:apply-action'));
  return execute(args);
}
export async function recoverRevision(args) {
  return execute(args);
}
