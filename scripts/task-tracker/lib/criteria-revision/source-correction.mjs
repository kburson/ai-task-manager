import { linkedPlanReference, linkedPlanReferenceRange } from '../decomposition-policy.mjs';
import { setUserStory, buildUserStoryLines } from '../user-story-author.mjs';
// @story #1855
// Reconstruction of exact native legacy source corrections. These functions
// validate evidence and deterministic effects; none issues execution authority.
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { applyIssueBodyOperation, parseIssueBodyOperation } from '../../verbs/issue-body.mjs';
import { validateGovernedLinkedPlan } from '../governed-plan-policy.mjs';
import {
  resolveStoryIntentSource,
  reconstructHistoricalPlanSource,
} from '../story-intent-source.mjs';
import { reconstructNativePlanRecord, planSourceBindings } from './plan-approval.mjs';
import {
  deriveLegacySourceRetirement,
  hashSemanticContract,
  projectCollectedRevisionObservation,
} from './proposal.mjs';
import { exactKeys, hashBytes, revisionError, validateRevisionObservation } from './schema.mjs';
import { stampBodyVersion } from '../body-version.mjs';
import { stripBodyVersion } from '../versioned-issue-write.mjs';
const equal = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
function scopeSpan(body, heading = 'Scope') {
  const headings = [...body.matchAll(new RegExp('^## ' + heading + '\\r?$', 'gm'))];
  if (headings.length !== 1) revisionError('source-scope-heading');
  const start = headings[0].index + headings[0][0].length;
  const next = /^## /gm;
  next.lastIndex = start;
  const end = next.exec(body)?.index ?? body.length;
  const bytes = body.slice(start, end);
  if (!bytes.trim()) revisionError('source-scope-empty');
  return { start, end, bytes };
}
function resolvedSources(body, projectDir) {
  const plan = validateGovernedLinkedPlan({ body, projectDir });
  const story = resolveStoryIntentSource({ body, projectDir, governedPlan: plan });
  if (!plan.ok || !story.ok) revisionError('source-native-resolver');
  return { bindings: planSourceBindings(story, plan), story, plan };
}
function intentSpan(body, resolved) {
  const { story, plan } = resolved;
  const lines = body.split('\n'),
    range = story.range;
  if (
    story.source !== 'deep-dive' ||
    story.location.path !== null ||
    plan.observation != null ||
    !Number.isInteger(range?.start) ||
    !Number.isInteger(range?.end) ||
    range.start < 1 ||
    range.end < range.start ||
    range.end > lines.length
  )
    revisionError('source-intent-range');
  const offset = (line) => lines.slice(0, line).join('\n').length + (line < lines.length ? 1 : 0);
  const start = offset(range.start),
    end = offset(range.end);
  return { start, end, bytes: body.slice(start, end) };
}
// Pure deterministic data; callers cannot obtain native write authority here.
export function deriveLinkedPlanEdit({ tool, path, input, beforeText }) {
  if (typeof path !== 'string' || typeof beforeText !== 'string')
    revisionError('source-file-input');
  let afterText;
  if (tool === 'Edit') {
    exactKeys(input, ['old_string', 'new_string', 'replace_all'], 'source-file-edit');
    if (
      typeof input.old_string !== 'string' ||
      !input.old_string ||
      typeof input.new_string !== 'string' ||
      input.replace_all !== false ||
      beforeText.split(input.old_string).length !== 2
    )
      revisionError('source-file-edit');
    afterText = beforeText.replace(input.old_string, () => input.new_string);
    // Two pre-tool checks can observe the same file-before prefix. A second
    // actual Edit must find no old match, rather than extend the sealed effect.
    if (afterText.includes(input.old_string)) revisionError('source-file-repeatable-edit');
  } else if (tool === 'Write') {
    exactKeys(input, ['content'], 'source-file-write');
    if (typeof input.content !== 'string') revisionError('source-file-write');
    afterText = input.content;
  } else revisionError('source-file-tool');
  if (beforeText === afterText) revisionError('source-file-no-change');
  return {
    operation: {
      schema: 'aitm.native-linked-plan-edit/v1',
      tool,
      path,
      input,
      beforeContentSha256: hashBytes(beforeText).slice(7),
      afterContentSha256: hashBytes(afterText).slice(7),
    },
    afterText,
  };
}
export function deriveNativeSourceJournal({
  before,
  currentContract,
  operation,
  revisionEventHead,
  predecessor,
  session,
  sourceRead,
  sourceReads,
}) {
  validateRevisionObservation(before);
  const story = operation?.schema === 'aitm.native-user-story-operation/v1';
  const linked = operation?.schema === 'aitm.native-linked-plan-edit/v1';
  if (story) {
    exactKeys(operation, ['schema', 'story'], 'source-story-operation');
    exactKeys(operation.story, ['asA', 'iWant', 'soThat'], 'source-story-input');
    buildUserStoryLines(operation.story);
  } else if (!linked) parseIssueBodyOperation(operation);
  exactKeys(session, ['sessionId', 'projectDir', 'branch', 'entryStartTs'], 'source-session');
  if (
    before.sourceKind !== 'legacy-body' ||
    !predecessor ||
    (!story && !linked && operation.expectedVersion !== before.body.version) ||
    session.sessionId !== before.executor.sessionId ||
    session.projectDir !== before.executor.worktree ||
    session.branch !== before.executor.branch ||
    !Number.isFinite(Date.parse(session.entryStartTs))
  )
    revisionError('source-native-authority');
  const changed = linked
    ? before.body.bytes
    : story
      ? setUserStory(before.body.bytes, operation.story)
      : applyIssueBodyOperation(before.body.bytes, operation);
  let resolvedBefore, resolvedAfter;
  if (linked) {
    if (sourceReads !== undefined) revisionError('source-unexpected-file-reads');
    exactKeys(
      operation,
      ['schema', 'tool', 'path', 'input', 'beforeContentSha256', 'afterContentSha256'],
      'source-file-operation'
    );
    const prior = reconstructHistoricalPlanSource({
      sourceRead,
      body: before.body.bytes,
      projectDir: session.projectDir,
    });
    if (sourceRead.path !== operation.path) revisionError('source-file-reference');
    const derived = deriveLinkedPlanEdit({ ...operation, beforeText: sourceRead.text });
    if (!equal(derived.operation, operation)) revisionError('source-file-operation');
    const next = reconstructHistoricalPlanSource({
      sourceRead: {
        ...sourceRead,
        text: derived.afterText,
        contentSha256: operation.afterContentSha256,
      },
      body: before.body.bytes,
      projectDir: session.projectDir,
    });
    resolvedBefore = { bindings: prior.sourceBindings, story: prior.resolved };
    resolvedAfter = { bindings: next.sourceBindings, story: next.resolved };
  } else {
    if (sourceRead !== undefined) revisionError('source-unexpected-file-read');
    if (sourceReads !== undefined) {
      exactKeys(sourceReads, ['before', 'after'], 'native-source-reads');
      const prior = reconstructHistoricalPlanSource({
        sourceRead: sourceReads.before,
        body: before.body.bytes,
        projectDir: session.projectDir,
      });
      const next = reconstructHistoricalPlanSource({
        sourceRead: sourceReads.after,
        body: changed,
        projectDir: session.projectDir,
      });
      resolvedBefore = {
        bindings: prior.sourceBindings,
        story: prior.resolved,
        plan: { observation: sourceReads.before },
      };
      resolvedAfter = {
        bindings: next.sourceBindings,
        story: next.resolved,
        plan: { observation: sourceReads.after },
      };
    } else {
      resolvedBefore = resolvedSources(before.body.bytes, session.projectDir);
      resolvedAfter = resolvedSources(changed, session.projectDir);
    }
  }
  const scopeChanged = scopeSpan(before.body.bytes).bytes !== scopeSpan(changed).bytes;
  const pointerChanged = !equal(
    linkedPlanReference(before.body.bytes),
    linkedPlanReference(changed)
  );
  const kind = linked
    ? 'linked-file'
    : story
      ? 'story'
      : scopeChanged
        ? 'scope'
        : pointerChanged
          ? 'linked-reference'
          : 'intent';
  const span = (body, resolved) => {
    if (kind === 'linked-reference') {
      const range = linkedPlanReferenceRange(body);
      if (!range) revisionError('source-reference-range');
      return { ...range, bytes: body.slice(range.start, range.end) };
    }
    return kind === 'intent'
      ? intentSpan(body, resolved)
      : scopeSpan(body, story ? 'User Story' : 'Scope');
  };
  const prior = linked ? null : span(before.body.bytes, resolvedBefore);
  const next = linked ? null : span(changed, resolvedAfter);
  if (kind === 'linked-reference' && (!sourceReads || prior.reference.key !== next.reference.key))
    revisionError('source-reference-key');
  const controls = (body) => [...body.matchAll(/<!--[\s\S]*?-->/g)].map((m) => m[0]);
  if (!equal(controls(before.body.bytes), controls(changed))) revisionError('source-control-delta');
  if (
    !linked &&
    (prior.bytes === next.bytes ||
      before.body.bytes.slice(0, prior.start) !== changed.slice(0, next.start) ||
      before.body.bytes.slice(prior.end) !== changed.slice(next.end))
  )
    revisionError('source-scope-only');
  const scope = before.protectedSourceBindings.filter((b) => b.identity === 'scope');
  const actualScope = scopeSpan(before.body.bytes);
  if (scope.length !== 1 || scope[0].hash !== hashBytes(actualScope.bytes.trim()))
    revisionError('source-scope-binding');
  let bindings = before.protectedSourceBindings.map((b) =>
    kind === 'scope' && b.identity === 'scope' ? { ...b, hash: hashBytes(next.bytes.trim()) } : b
  );
  const sourceInputs = { before: resolvedBefore.bindings, after: resolvedAfter.bindings };
  if (kind === 'scope' && !equal(sourceInputs.before, sourceInputs.after))
    revisionError('source-other-resolver-drift');
  if (kind !== 'scope') {
    // Original archives may predate complete source vectors. Verify every
    // existing native binding and add only actual resolved current sources.
    for (const priorBinding of sourceInputs.before) {
      const existing = bindings.find((b) => b.identity === priorBinding.identity);
      if (existing && !equal(existing, priorBinding))
        revisionError('source-planning-binding-drift');
    }
    bindings = [
      ...bindings.filter(
        (b) => !sourceInputs.after.some((source) => source.identity === b.identity)
      ),
      ...sourceInputs.after,
    ];
  }
  const retired = deriveLegacySourceRetirement({
    observation: {
      ...before,
      body: { ...before.body, bytes: changed },
      revision: currentContract.revision,
      revisionId: currentContract.revisionId,
    },
    definitions: currentContract.definitions,
    sourceBindings: bindings,
  });
  const after = structuredClone(before);
  after.body = {
    bytes: stampBodyVersion(stripBodyVersion(retired.body), before.body.version + 1),
    version: before.body.version + 1,
  };
  after.protectedSourceBindings = bindings;
  const contract = {
    ...structuredClone(currentContract),
    definitions: retired.definitions,
    semanticContractDigest: hashSemanticContract(retired.definitions),
  };
  const record = {
    schema: 'aitm.native-source-journal/v1',
    before,
    after,
    currentContract,
    contract,
    operation,
    revisionEventHead,
    predecessor,
    session,
    sourceInputs,
    invalidation: retired.invalidation,
    ...(linked ? { sourceRead } : {}),
    ...(sourceReads ? { sourceReads } : {}),
  };
  return { ...record, id: hashBytes(canonicalRecordJson(record)) };
}
export function validateNativeSourceJournal(journal) {
  exactKeys(
    journal,
    [
      'schema',
      'before',
      'after',
      'currentContract',
      'contract',
      'operation',
      'revisionEventHead',
      'predecessor',
      'session',
      'sourceInputs',
      'invalidation',
      'id',
      ...(Object.hasOwn(journal, 'sourceRead') ? ['sourceRead'] : []),
      ...(Object.hasOwn(journal, 'sourceReads') ? ['sourceReads'] : []),
    ],
    'native-source-journal'
  );
  const derived = deriveNativeSourceJournal(journal);
  if (!equal(derived, journal)) revisionError('native-source-journal-coherence');
  return journal;
}

import { sameRevisionObservation, canonicalAfterObservation } from './canonical.mjs';
import { parseBodyVersion } from '../body-version.mjs';
import { nativeProofContinuation, projectNativeIndividualProofs } from './proof-execution.mjs';
import { metadataContinuation, sameStableRevisionExecutor } from './consumer-continuation.mjs';
import { reduceRevisionEvents, deriveCriteriaAuthorityHistory } from './reducer.mjs';
function sameCompletedSessionObservation({ observation, expected, chain, planning }) {
  if (
    !planning ||
    !['applied', 'aborted'].includes(chain.status) ||
    observation.sourceKind !== 'legacy-body' ||
    expected.sourceKind !== 'legacy-body' ||
    observation.executor.sessionId === expected.executor.sessionId ||
    !sameStableRevisionExecutor(observation.executor, expected.executor)
  )
    return false;
  // Only the observer session changes. Every original record remains intact;
  // all repository/domain/resource bytes are compared by the existing validator.
  return sameRevisionObservation({ ...observation, executor: expected.executor }, expected);
}
export async function reconstructNativeHistory({
  history,
  chain,
  backend,
  observation,
  pendingPlan = null,
}) {
  // The backend vector does not contain independently current linked-file
  // bytes. Retain the actual native selection across the awaited fold as an
  // additional stability condition; this does not replace semantic replay.
  const sourceInput = { body: observation.body.bytes, projectDir: observation.executor.worktree };
  const originalLinkedSource = canonicalRecordJson(validateGovernedLinkedPlan(sourceInput));
  const originalNativeSources = canonicalRecordJson(backend.snapshot);
  const assertOriginalSources = () => {
    if (canonicalRecordJson(backend.snapshot) !== originalNativeSources)
      revisionError('native-history-await-drift');
  };
  const authorityHistory = deriveCriteriaAuthorityHistory(chain.events);
  if (!equal(authorityHistory.chain, chain)) revisionError('native-history-chain');
  const records = new Map([
    ...history.plans.map((j) => [hashBytes(canonicalRecordJson(j)), { kind: 'plan', journal: j }]),
    ...history.proofs.map((j) => [j.id, { kind: 'proof', journal: j }]),
    ...history.sources.map((j) => [j.id, { kind: 'source', journal: j }]),
    ...(history.stages ?? []).map((j) => [j.header.id, { kind: 'stage', journal: j }]),
  ]);
  if (
    records.size !==
      history.plans.length +
        history.proofs.length +
        history.sources.length +
        (history.stages ?? []).length ||
    records.size !== history.order.length
  )
    revisionError('native-history-membership');
  const groups = new Map();
  let predecessor = null,
    lastIndex = -2;
  for (const ref of history.order) {
    const record = records.get(ref.id);
    if (
      !record ||
      record.kind !== ref.kind ||
      ref.predecessor !== predecessor ||
      (ref.kind === 'stage'
        ? record.journal.header.revisionEventHead
        : record.journal.revisionEventHead) !== ref.revisionEventHead
    )
      revisionError('native-history-reference');
    let group = groups.get(ref.revisionEventHead);
    const index =
      ref.revisionEventHead === null
        ? -1
        : chain.events.findIndex((event) => event.eventId === ref.revisionEventHead);
    if (!group) {
      if (
        index <= lastIndex ||
        (ref.revisionEventHead !== null &&
          !authorityHistory.terminals.some((t) => t.head === ref.revisionEventHead))
      )
        revisionError('native-history-epoch-order');
      group = {
        predecessor,
        history: { plans: [], proofs: [], sources: [], stages: [], order: [] },
      };
      groups.set(ref.revisionEventHead, group);
      lastIndex = index;
    } else if (index !== lastIndex) revisionError('native-history-epoch-order');
    group.history[
      { plan: 'plans', proof: 'proofs', source: 'sources', stage: 'stages' }[ref.kind]
    ].push(record.journal);
    group.history.order.push(ref);
    records.delete(ref.id);
    predecessor = ref.id;
  }
  if (records.size) revisionError('native-history-membership');
  let currentChain = reduceRevisionEvents([]),
    proposal = null;
  let cursor = structuredClone(
    groups.get(null)?.history.plans[0]?.before ??
      chain.events[0]?.proposal.archive.observation ??
      observation
  );
  let currentContract = null,
    approved = false,
    planning = null,
    currentPlanSources = null,
    result = null;
  const completedProofRecords = [];
  const replay = async () => {
    const group = groups.get(currentChain.head);
    const latest = currentChain.head === chain.head;
    if (!group && !(latest && (pendingPlan || currentChain.status === 'aborted'))) return;
    const successor =
      chain.events.slice(currentChain.events.length).find((event) => event.type === 'prepared') ??
      null;
    result = await replayNativeEpoch({
      history: group?.history ?? { plans: [], proofs: [], sources: [], order: [] },
      predecessor: group ? group.predecessor : predecessor,
      chain: currentChain,
      backend,
      observation: latest ? observation : successor?.proposal.archive.observation,
      pendingPlan: latest ? pendingPlan : null,
      successor,
      earlierProofRecords: completedProofRecords,
      initial: { cursor, currentContract, approved, planning, currentPlanSources, proposal },
    });
    assertOriginalSources();
    if (result.status === 'complete') {
      ({ observation: cursor, currentContract, approved, planning, currentPlanSources } = result);
      completedProofRecords.push(...(group?.history.proofs ?? []));
    }
    if (group) groups.delete(currentChain.head);
  };
  await replay();
  assertOriginalSources();
  for (let index = 0; index < chain.events.length; index++) {
    const event = chain.events[index];
    if (event.type === 'prepared') {
      const collected = projectCollectedRevisionObservation({
        observation: cursor,
        chain: currentChain,
        currentContract,
      });
      if (!(
        sameRevisionObservation(event.proposal.archive.observation, collected) ||
        (result?.status === 'complete' &&
          sameCompletedSessionObservation({
            observation: event.proposal.archive.observation,
            expected: collected,
            chain: currentChain,
            planning,
          })) ||
        (proposal &&
          metadataContinuation({
            observation: event.proposal.archive.observation,
            expected: collected,
            proposal: { ...proposal, after: currentContract },
          }))
      ))
        revisionError('native-history-successor-archive');
      const witnesses = projectNativeIndividualProofs({
        observation: collected,
        chain: currentChain,
        completedProofRecords,
      });
      if (Object.hasOwn(event.proposal.archive, 'nativeIndividualProofs')) {
        if (!equal(event.proposal.archive.nativeIndividualProofs, witnesses))
          revisionError('native-history-proof-witness');
      } else if (
        witnesses.some(
          (witness) =>
            !event.proposal.invalidation.some(
              (item) =>
                item.criterionIdentity === witness.criterionIdentity &&
                item.bytesHash === hashBytes(witness.after.proof.bytes) &&
                item.disposition === 'retired'
            )
        )
      )
        revisionError('native-history-proof-witness');
      cursor = event.proposal.archive.observation;
    }
    if (!['applied', 'aborted'].includes(event.type)) continue;
    currentChain = reduceRevisionEvents(chain.events.slice(0, index + 1));
    if (event.type === 'applied') {
      proposal = currentChain.effective.proposal;
      cursor =
        proposal.authority.kind === 'canonical-contract'
          ? canonicalAfterObservation(proposal)
          : structuredClone(proposal.archive.observation);
      if (proposal.authority.kind === 'legacy-body') {
        const bytes = proposal.writeSet.find((w) => w.resource === 'issue-body').afterBytes;
        cursor.body = { bytes, version: parseBodyVersion(bytes) };
      }
      currentContract = proposal.after;
      approved = false;
      planning = null;
      currentPlanSources = null;
    }
    await replay();
    assertOriginalSources();
  }
  if (groups.size) revisionError('native-history-membership');
  if (canonicalRecordJson(validateGovernedLinkedPlan(sourceInput)) !== originalLinkedSource)
    revisionError('native-history-current-source');
  // A pending criteria transaction remains entirely governed by its exact
  // transaction prefix. Historical native records cannot make it current.
  if (chain.status === 'pending') return null;
  return result &&
    currentChain.head === chain.head &&
    (history.order.at(-1)?.revisionEventHead === chain.head ||
      pendingPlan ||
      chain.status === 'aborted')
    ? result
    : null;
}

async function replayNativeEpoch({
  history,
  chain,
  backend,
  observation,
  pendingPlan,
  predecessor,
  successor,
  initial,
  earlierProofRecords,
}) {
  const completed = [...earlierProofRecords];
  if (!['empty', 'applied', 'aborted'].includes(chain.status))
    revisionError('native-history-baseline');
  const p = initial.proposal;
  let cursor = initial.cursor,
    currentContract = initial.currentContract,
    approved = initial.approved,
    planning = initial.planning,
    currentPlanSources = initial.currentPlanSources;
  const byId = new Map([
    ...history.plans.map((j) => [hashBytes(canonicalRecordJson(j)), j]),
    ...history.proofs.map((j) => [j.id, j]),
    ...history.sources.map((j) => [j.id, j]),
    ...(history.stages ?? []).map((j) => [j.header.id, j]),
  ]);
  for (let i = 0; i < history.order.length; i++) {
    const ref = history.order[i],
      j = byId.get(ref.id);
    if (
      !j ||
      ref.predecessor !== predecessor ||
      ref.revisionEventHead !== chain.head ||
      (ref.kind === 'stage' ? j.header.revisionEventHead : j.revisionEventHead) !== chain.head
    )
      revisionError('native-history-reference');
    if (ref.kind === 'stage') {
      // Stage origins live in header.original, not a synthesized journal.before.
      // Every earlier record has already been folded into this exact cursor.
      if (
        !approved ||
        !planning ||
        !currentContract ||
        successor ||
        pendingPlan ||
        i !== history.order.length - 1
      )
        revisionError('native-stage-predecessor');
      const { reconstructNativeStageHeader, validateNativeStageJournal } =
        await import('./stage-execution.mjs');
      validateNativeStageJournal(j);
      const original = await reconstructNativeStageHeader({
        header: j.header,
        cursor,
        currentContract,
        planning,
        proofs: completed,
        chain,
        predecessor,
        retained: backend.comments,
      });
      const projected = projectCollectedRevisionObservation({
        observation,
        chain,
        currentContract,
      });
      const afterActor = structuredClone(original.resources);
      afterActor.local.actorFlush = { bytes: original.actorJournalBytes };
      const resources = backend.snapshot.nativeStageResources;
      let exactPrefix =
        equal(resources, afterActor) ||
        (j.steps[0].readback === null && equal(resources, original.resources));
      if (j.steps.length >= 2) {
        const { reconstructNativeStageActorTiming } = await import('./stage-execution.mjs');
        const timing = await reconstructNativeStageActorTiming({
          header: j.header,
          first: j.steps[0],
          step: j.steps[1],
        });
        exactPrefix =
          equal(resources, timing.afterResources) ||
          (j.steps[1].readback === null && equal(resources, timing.beforeResources));
        if (!equal(resources, backend.snapshot.nativeStageResources))
          revisionError('native-stage-current-resources');
      }
      if (j.steps.length >= 3) {
        const { reconstructNativeStageActorCursor } = await import('./stage-execution.mjs');
        const cursorStep = await reconstructNativeStageActorCursor({
          header: j.header,
          first: j.steps[0],
          second: j.steps[1],
          step: j.steps[2],
        });
        exactPrefix =
          equal(resources, cursorStep.afterResources) ||
          (j.steps[2].readback === null && equal(resources, cursorStep.beforeResources));
        if (!equal(resources, backend.snapshot.nativeStageResources))
          revisionError('native-stage-current-resources');
      }
      if (j.steps.length >= 4) {
        const { reconstructNativeStageCheckpointSteps } = await import('./stage-execution.mjs');
        const checkpoint = await reconstructNativeStageCheckpointSteps({
          header: j.header,
          steps: j.steps.slice(0, 6),
        });
        exactPrefix =
          equal(resources, checkpoint.afterResources) ||
          (j.steps.at(-1).readback === null && equal(resources, checkpoint.beforeResources));
        if (!equal(resources, backend.snapshot.nativeStageResources))
          revisionError('native-stage-current-resources');
      }
      if (j.steps.length >= 7) {
        const { reconstructNativeStageActorRemoval } = await import('./stage-execution.mjs');
        const removal = await reconstructNativeStageActorRemoval({
          header: j.header,
          steps: j.steps.slice(0, 7),
        });
        exactPrefix =
          equal(resources, removal.afterResources) ||
          (j.steps[6].readback === null && equal(resources, removal.beforeResources));
        if (!equal(resources, backend.snapshot.nativeStageResources))
          revisionError('native-stage-current-resources');
      }
      if (j.steps.length >= 8) {
        const { reconstructNativeStageCheckpointSteps } = await import('./stage-execution.mjs');
        const finalState = await reconstructNativeStageCheckpointSteps({
          header: j.header,
          steps: j.steps.slice(0, 10),
        });
        exactPrefix =
          equal(resources, finalState.afterResources) ||
          (j.steps.at(-1).readback === null && equal(resources, finalState.beforeResources));
        if (!equal(resources, backend.snapshot.nativeStageResources))
          revisionError('native-stage-current-resources');
      }
      if (j.steps.length >= 11) {
        const { reconstructNativeStagePhaseTiming } = await import('./stage-execution.mjs');
        const phases = await reconstructNativeStagePhaseTiming({
          header: j.header,
          steps: j.steps.slice(0, 12),
        });
        exactPrefix =
          equal(resources, phases.afterResources) ||
          (j.steps.at(-1).readback === null && equal(resources, phases.beforeResources));
        if (!equal(resources, backend.snapshot.nativeStageResources))
          revisionError('native-stage-current-resources');
      }
      const expectedStageObservation = structuredClone(original.observation);
      if (j.steps.length >= 13 && j.steps.length <= 14) {
        const { reconstructNativeStageEntryBody } = await import('./stage-execution.mjs');
        const entry = await reconstructNativeStageEntryBody({
          header: j.header,
          steps: j.steps.slice(0, 13),
        });
        const after = equal(observation.body, entry.afterBody);
        if (
          (!after &&
            (j.steps[12].readback !== null || !equal(observation.body, entry.beforeBody))) ||
          (j.steps.length === 13 && !equal(resources, entry.resources)) ||
          !equal(resources, backend.snapshot.nativeStageResources)
        )
          revisionError('native-stage-entry-prefix');
        if (after) expectedStageObservation.body = structuredClone(entry.afterBody);
      }
      if (j.steps.length === 14) {
        const { reconstructNativeStageBoard } = await import('./stage-execution.mjs');
        const board = await reconstructNativeStageBoard({ header: j.header, steps: j.steps });
        const after =
          board.afterRecognized &&
          equal(resources, board.afterResources) &&
          observation.stage === board.afterStage;
        const before =
          board.beforeRecognized &&
          equal(resources, board.beforeResources) &&
          observation.stage === board.beforeStage;
        if (
          (!after && (!before || board.confirmed)) ||
          !equal(observation.body, board.body) ||
          !equal(resources, backend.snapshot.nativeStageResources)
        )
          revisionError('native-stage-board-prefix');
        exactPrefix = after || before;
        if (after) expectedStageObservation.stage = board.afterStage;
      }
      if (j.steps.length === 15) {
        // The same reconstruction function validates the complete first fourteen steps
        // before deriving this fixed sentinel delta. No current body is used
        // as the origin of its own historical comparison.
        const { reconstructNativeStageSentinel } = await import('./stage-execution.mjs');
        const sentinel = await reconstructNativeStageSentinel({ header: j.header, steps: j.steps });
        const after = equal(observation.body, sentinel.afterBody);
        const before =
          j.steps[14].readback === null && equal(observation.body, sentinel.beforeBody);
        if (
          (!after && !before) ||
          observation.stage !== sentinel.stage ||
          !equal(resources, sentinel.resources) ||
          !equal(resources, backend.snapshot.nativeStageResources)
        )
          revisionError('native-stage-sentinel-prefix');
        exactPrefix = true;
        expectedStageObservation.body = structuredClone(
          after ? sentinel.afterBody : sentinel.beforeBody
        );
        expectedStageObservation.stage = sentinel.stage;
      }
      if (j.steps.length === 16) {
        const { reconstructNativeStageTransitionComment } = await import('./stage-execution.mjs');
        const comment = await reconstructNativeStageTransitionComment({
          header: j.header,
          steps: j.steps,
        });
        const after = equal(resources, comment.afterResources);
        const before = j.steps[15].readback === null && equal(resources, comment.beforeResources);
        if (
          (!after && !before) ||
          !equal(observation.body, comment.body) ||
          observation.stage !== comment.stage ||
          !equal(resources, backend.snapshot.nativeStageResources)
        )
          revisionError('native-stage-transition-prefix');
        exactPrefix = true;
        expectedStageObservation.body = structuredClone(comment.body);
        expectedStageObservation.stage = comment.stage;
      }
      if (j.steps.length === 17) {
        const { reconstructNativeStageTailDispatch } = await import('./stage-execution.mjs');
        const dispatch = await reconstructNativeStageTailDispatch({
          header: j.header,
          steps: j.steps,
        });
        if (
          !equal(resources, dispatch.resources) ||
          !equal(observation.body, dispatch.body) ||
          observation.stage !== dispatch.stage ||
          !equal(resources, backend.snapshot.nativeStageResources)
        )
          revisionError('native-stage-tail-dispatch-prefix');
        exactPrefix = true;
        expectedStageObservation.body = structuredClone(dispatch.body);
        expectedStageObservation.stage = dispatch.stage;
      }
      if (
        !sameRevisionObservation(projected, expectedStageObservation) ||
        !exactPrefix ||
        !equal(
          resolvedSources(observation.body.bytes, observation.executor.worktree).bindings,
          currentPlanSources
        )
      )
        revisionError('native-stage-pending-prefix');
      return {
        status: 'pending-native-stage',
        journal: j,
        observation: cursor,
        currentContract,
        approved: false,
        planning,
        currentPlanSources,
      };
    }
    const proposal = p ? { ...p, after: currentContract } : null;
    const projectedBefore = projectCollectedRevisionObservation({
      observation: j.before,
      chain,
      currentContract,
    });
    const projectedCursor = projectCollectedRevisionObservation({
      observation: cursor,
      chain,
      currentContract,
    });
    if (!(
      sameRevisionObservation(projectedBefore, projectedCursor) ||
      sameCompletedSessionObservation({
        observation: projectedBefore,
        expected: projectedCursor,
        chain,
        planning,
      }) ||
      (proposal &&
        metadataContinuation({ observation: projectedBefore, expected: projectedCursor, proposal }))
    ))
      revisionError('native-history-predecessor');
    cursor = j.before;
    if (ref.kind === 'plan') {
      cursor = reconstructNativePlanRecord({
        journal: j,
        expected: cursor,
        currentContract,
        chain,
        backend,
      });
      approved = true;
      planning = j.planning;
      currentPlanSources = (j.record.envelope?.payload ?? j.record.payload).sourceBindings;
    } else if (ref.kind === 'proof') {
      if (!approved || !proposal) revisionError('native-history-proof-approval');
      nativeProofContinuation({
        observation: j.after,
        expected: cursor,
        proposal,
        records: [j],
        revisionEventHead: chain.head,
        chain,
        earlierProofRecords: completed,
      });
      if (
        !successor &&
        i === history.order.length - 1 &&
        sameRevisionObservation(observation, j.before)
      )
        return { status: 'pending-native-proof', journal: j, currentContract, approved };
      cursor = j.after;
      completed.push(j);
    } else if (ref.kind === 'source') {
      validateNativeSourceJournal(j);
      if (j.predecessor !== predecessor || !equal(j.currentContract, currentContract) || !planning)
        revisionError('native-history-source-predecessor');
      if (
        j.operation.schema === 'aitm.native-linked-plan-edit/v1' &&
        !successor &&
        i === history.order.length - 1
      ) {
        const actual = validateGovernedLinkedPlan({
          body: observation.body.bytes,
          projectDir: observation.executor.worktree,
        });
        const hash = actual.observation?.contentSha256;
        const beforePrefix = sameRevisionObservation(observation, j.before);
        if (
          !actual.ok ||
          actual.observation?.path !== j.operation.path ||
          actual.observation?.key !== j.sourceRead.key ||
          !(
            hash === j.operation.afterContentSha256 ||
            (beforePrefix && hash === j.operation.beforeContentSha256)
          )
        )
          revisionError('native-source-file-prefix');
      }

      if (j.sourceReads && !successor && i === history.order.length - 1) {
        const expected = sameRevisionObservation(observation, j.before)
          ? j.sourceInputs.before
          : j.sourceInputs.after;
        if (
          !equal(
            resolvedSources(observation.body.bytes, observation.executor.worktree).bindings,
            expected
          )
        )
          revisionError('native-source-current-file');
      }

      if (
        !successor &&
        i === history.order.length - 1 &&
        sameRevisionObservation(observation, j.before)
      )
        return { status: 'pending-native-source', journal: j, currentContract, approved: false };
      cursor = j.after;
      currentContract = j.contract;
      approved = false;
    } else revisionError('native-history-kind');
    predecessor = ref.id;
    byId.delete(ref.id);
  }
  if (pendingPlan) {
    const id = hashBytes(canonicalRecordJson(pendingPlan));
    if (history.order.at(-1)?.kind === 'plan' && history.order.at(-1).id === id) {
      if (!sameRevisionObservation(cursor, pendingPlan.after))
        revisionError('native-history-pending-plan');
    } else {
      const expected = projectCollectedRevisionObservation({
        observation: cursor,
        chain,
        currentContract,
      });
      const before = projectCollectedRevisionObservation({
        observation: pendingPlan.before,
        chain,
        currentContract,
      });
      if (!sameRevisionObservation(before, expected)) revisionError('native-history-pending-plan');
      reconstructNativePlanRecord({
        journal: pendingPlan,
        expected: pendingPlan.before,
        currentContract,
        chain,
        backend,
        pending: true,
      });
    }
    // readMemoryPlanJournal independently validates the exact live native prefix.
    return {
      status: 'pending-native-plan',
      journal: pendingPlan,
      observation: pendingPlan.before,
      currentContract,
      approved: false,
      planning: pendingPlan.planning,
    };
  }
  if (successor) {
    const collected = projectCollectedRevisionObservation({
      observation: cursor,
      chain,
      currentContract,
    });
    if (
      byId.size ||
      !(
        sameRevisionObservation(observation, collected) ||
        sameCompletedSessionObservation({ observation, expected: collected, chain, planning }) ||
        (p &&
          metadataContinuation({
            observation,
            expected: collected,
            proposal: { ...p, after: currentContract },
          }))
      )
    )
      revisionError('native-history-successor-archive');
    return {
      status: 'complete',
      observation: cursor,
      currentContract,
      approved,
      planning,
      currentPlanSources,
    };
  }
  const projectedObservation = projectCollectedRevisionObservation({
    observation,
    chain,
    currentContract,
  });
  const projectedCursor = projectCollectedRevisionObservation({
    observation: cursor,
    chain,
    currentContract,
  });
  if (
    byId.size ||
    !(
      sameRevisionObservation(projectedObservation, projectedCursor) ||
      sameCompletedSessionObservation({
        observation: projectedObservation,
        expected: projectedCursor,
        chain,
        planning,
      }) ||
      (p &&
        metadataContinuation({
          observation: projectedObservation,
          expected: projectedCursor,
          proposal: { ...p, after: currentContract },
        }))
    )
  )
    revisionError('native-history-current-authority');
  // Retained history never substitutes for a fresh current native source read.
  if (
    approved &&
    !equal(
      resolvedSources(observation.body.bytes, observation.executor.worktree).bindings,
      currentPlanSources
    )
  )
    revisionError('native-history-current-source');
  return {
    status: 'complete',
    observation: cursor,
    currentContract,
    approved,
    planning,
    currentPlanSources,
  };
}

export function changesNativeSource(body, operation, projectDir) {
  if (operation?.schema === 'aitm.native-user-story-operation/v1')
    return (
      scopeSpan(body, 'User Story').bytes !==
      scopeSpan(setUserStory(body, operation.story), 'User Story').bytes
    );
  const changed = applyIssueBodyOperation(body, operation);
  if (scopeSpan(body).bytes !== scopeSpan(changed).bytes) return true;
  if (!equal(linkedPlanReference(body), linkedPlanReference(changed))) return true;
  const before = resolvedSources(body, projectDir),
    after = resolvedSources(changed, projectDir);
  if (before.story.source !== 'deep-dive' || after.story.source !== 'deep-dive') return false;
  return intentSpan(body, before).bytes !== intentSpan(changed, after).bytes;
}
