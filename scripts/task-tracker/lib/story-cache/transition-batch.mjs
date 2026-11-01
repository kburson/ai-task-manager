// @story #2068
// Internal transition boundary. Public writer activation belongs to #2071.
import { createHash } from 'node:crypto';
import { canonicalRecordJson as json } from '../github-records/canonical-json.mjs';
import { runGuardExecution } from '../move-state/guard-execution.mjs';
import { writeMoveCompleteMarker } from '../move-state/sentinel.mjs';
import { stampEntryMarker, getStageVisitCount } from '../stage-entry-markers.mjs';
import { readLastKnownState, writeLastKnownState } from '../../gh-timing-comment.mjs';
import { resolveRuntimeRoot } from '../runtime-storage.mjs';
import { resolveSessionId } from '../session-id.mjs';
import { withIssueLock, currentIssueLockOwner } from '../../issue-mutator-lock.mjs';
import { assertStoryWriter } from './writer-claim.mjs';
import { storyIdentityKey, validateManifest } from './manifest.mjs';
import { storyCachePath, isNativeStoryStore } from './store.mjs';
import { freezeStoryBatch } from './batch.mjs';
import { freezeBodyTemplate, materializeBodyTemplate } from './body-template.mjs';
import { compareSnapshots } from './snapshot-compare.mjs';
import { confirmResourceEffect } from './provider-adapters.mjs';
import { checkpointResource, hydrateJournalSnapshot, validateRecoveryJournal } from './journal.mjs';
import { validateCompletionReceipt } from './completion-receipt.mjs';
import { nativePlanAuthorityValidator } from '../plan-transition-native.mjs';
import { readNativePlanGuardAdmission } from '../plan-native-guard-execution.mjs';
const clone = (value) => JSON.parse(json(value));
const same = (a, b) => json(a) === json(b);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const nativeBoundaries = new WeakMap();
// @story #2069 — no constructor or serializable token grants native journal access.
export async function readNativeTransitionBoundary(boundary, { phase } = {}) {
  const read = nativeBoundaries.get(boundary);
  if (!read) refuse('native-boundary');
  return read(phase);
}
/** Open local staging after completion. Immutable store generations retain the original journal.
 * This grants no publication authority: the next transition still takes a fresh bounded snapshot.
 */
export async function prepareNextTransition({ store, claim, unattemptedBatchId } = {}) {
  const root = resolveRuntimeRoot({ cwd: process.cwd(), env: {} });
  const sid = resolveSessionId();
  const check = () => {
    assertStoryWriter(claim, { worktree: root.projectRoot, sessionId: sid });
    if (
      resolveSessionId() !== sid ||
      resolveRuntimeRoot({ cwd: process.cwd(), env: {} }).projectRoot !== root.projectRoot ||
      store?.cachePath !== claim?.cachePath ||
      !claim?.registryKey
    )
      refuse('local-context');
  };
  check();
  const initial = await store.readGeneration();
  check();
  if (
    !initial ||
    initial.manifest.claimId !== claim.claimId ||
    claim.identityKey !== storyIdentityKey(initial.generation.identity) ||
    store.cachePath !==
      storyCachePath({ projectRoot: root.projectRoot, identity: initial.generation.identity })
  )
    refuse('generation-identity');
  return withIssueLock(
    {
      issue: initial.generation.identity.issueNumber,
      projDir: root.projectRoot,
      sessionId: sid,
      retries: 0,
    },
    async () => {
      const lock = currentIssueLockOwner(initial.generation.identity.issueNumber);
      const locked = () => {
        check();
        if (
          !lock ||
          currentIssueLockOwner(initial.generation.identity.issueNumber) !== lock ||
          lock.sessionId !== sid ||
          lock.projDir !== root.mainRoot
        )
          refuse('native-lock-owner');
      };
      locked();
      const record = await store.readGeneration();
      locked();
      if (
        !record ||
        record.manifest.claimId !== claim.claimId ||
        !same(record.generation.identity, initial.generation.identity)
      )
        refuse('generation-identity');
      const batch = validateRecoveryJournal(record);
      if (!batch) {
        if (unattemptedBatchId !== undefined) refuse('unattempted-batch-missing');
        return record;
      }
      const releasing = unattemptedBatchId !== undefined;
      if (
        releasing &&
        (!isNativeStoryStore(store) ||
          batch.batchId !== unattemptedBatchId ||
          batch.status !== 'prepared' ||
          record.generation.conflicts.length ||
          batch.effects.some((effect) => effect.attempted || effect.outcome !== null))
      )
        refuse('batch-has-attempts-or-conflict');
      if (
        !releasing &&
        (batch.status !== 'complete' ||
          record.generation.conflicts.length ||
          record.generation.dirtyKeys.length)
      )
        refuse('publication-pending');
      const snapshot = hydrateJournalSnapshot(record.generation.baseSnapshot, record.payloads);
      const body = snapshot.resources[`issue:${snapshot.identity.issueNodeId}`].body;
      if (!releasing)
        validateCompletionReceipt(receiptIn(body, batch.transition), {
          transition: batch.transition,
          confirmedEffects: batch.effects.filter((e) => e.kind !== 'issue-update'),
        });
      const generation = clone(record.generation);
      // These working payloads were all confirmed. Keep their immutable bytes, but do not
      // let an older candidate shadow the new published baseline during the next freeze.
      if (!releasing) for (const effect of batch.effects) delete generation.working[effect.key];
      generation.batch = null;
      generation.generation = record.manifest.generation + 1;
      const saved = await store.commitGeneration(
        { generation, claimId: claim.claimId, payloads: record.payloads },
        { expectedGeneration: record.manifest.generation }
      );
      locked();
      const validated = validateManifest(saved.manifest, {
        identity: generation.identity,
        payloads: saved.payloads,
      });
      if (
        saved.manifest.claimId !== claim.claimId ||
        !same(validated.generation, saved.generation) ||
        validated.generation.batch !== null ||
        !same(validated.generation.dirtyKeys, generation.dirtyKeys) ||
        !same(validated.generation.working, generation.working) ||
        !same(validated.generation.timing, generation.timing) ||
        !same(hydrateJournalSnapshot(validated.generation.baseSnapshot, saved.payloads), snapshot)
      )
        refuse('commit-readback');
      return saved;
    }
  );
}
/** Release only the exact durable, entirely unattempted intent; immutable history remains. */
export async function releaseUnattemptedTransition({ store, claim, batchId } = {}) {
  if (typeof batchId !== 'string' || !batchId.startsWith('batch:')) refuse('batch-id');
  return prepareNextTransition({ store, claim, unattemptedBatchId: batchId });
}
function refuse(reason) {
  throw Object.assign(new Error(`Story transition unavailable: ${reason}`), {
    code: 'STORY_TRANSITION_UNAVAILABLE',
    reason,
  });
}
const receiptLine = (receipt) => `<!-- aitm-transition-completion ${json(receipt)} -->`;
function receiptRows(body) {
  const starts = [...body.matchAll(/<!--\s*aitm-transition-completion\b/g)];
  const matches = [...body.matchAll(/^<!-- aitm-transition-completion (.+) -->$/gm)];
  if (starts.length !== matches.length) refuse('completion-receipt-format');
  const rows = matches.map((m) => {
    let receipt;
    try {
      receipt = JSON.parse(m[1]);
    } catch {
      refuse('completion-receipt-format');
    }
    if (typeof receipt?.transition?.id !== 'string' || json(receipt) !== m[1])
      refuse('completion-receipt-format');
    return { raw: m[0], receipt };
  });
  if (new Set(rows.map((r) => r.receipt.transition.id)).size !== rows.length)
    refuse('completion-receipt-count');
  return rows;
}
function receiptIn(body, transition) {
  const selected = receiptRows(body)
    .map((r) => r.receipt)
    .filter((r) => r.transition.id === transition.id);
  if (selected.length !== 1) refuse('completion-receipt-count');
  return selected[0];
}
function checkedSnapshot(value) {
  if (
    value?.complete !== true ||
    !value.resources ||
    Object.values(value.resources).some((r) => typeof r.body !== 'string' || 'payloadPath' in r)
  )
    refuse('complete-snapshot-required');
  const snapshot = clone(value);
  compareSnapshots(snapshot, snapshot);
  return snapshot;
}
function freezeTransition(record, ctx, ports) {
  // First validate ordinary edits with their genuine retained native capabilities.
  // Only this transition boundary generates lifecycle markers afterward.
  const approved = freezeStoryBatch({
    generation: record,
    transition: ctx.transition,
    effects: ctx.effects,
    capabilities: ports.capabilities,
  });
  const batch = clone(approved),
    move = batch.transition;
  if (
    ctx.transitionId !== move.id ||
    ctx.resolvedFromState !== move.from ||
    ctx.stateArg !== move.to ||
    Number(ctx.issueArg) !== record.generation.identity.issueNumber
  )
    refuse('transition-context');
  const status = batch.effects.find((e) => e.key === ctx.statusKey);
  const timing = batch.effects.find(
    (e) => e.candidate?.schema === 'aitm.story-timing-candidate/v1'
  );
  const prerequisites = batch.effects.filter((e) => e.kind !== 'issue-update' && e !== status);
  if (
    !status ||
    status.kind !== 'project-field-update' ||
    status.target.type !== 'SINGLE_SELECT' ||
    status.target.fieldId !== ctx.cfg?.kanbanFieldId ||
    status.candidate.value?.optionId !==
      ctx.cfg?.[
        `kanbanOption${move.to
          .split('-')
          .map((p) => p[0].toUpperCase() + p.slice(1))
          .join('')}`
      ] ||
    prerequisites.some((e) => !status.dependencies.includes(e.key))
  )
    refuse('status-order-or-target');
  const beforeStatus = batch.baseline.fields.find((r) => r.fieldId === status.target.fieldId);
  const fromOption =
    ctx.cfg?.[
      `kanbanOption${move.from
        .split('-')
        .map((p) => p[0].toUpperCase() + p.slice(1))
        .join('')}`
    ];
  if (!fromOption || beforeStatus?.value?.optionId !== fromOption) refuse('status-baseline');
  const source = hydrateJournalSnapshot(batch.baseline, record.payloads);
  const base = source.resources[`issue:${source.identity.issueNodeId}`].body;
  const priorReceipts = receiptRows(base);
  const stagedReceipts = receiptRows(batch.bodyTemplate.body);
  if (
    !same(
      priorReceipts.map((r) => r.raw),
      stagedReceipts.map((r) => r.raw)
    )
  )
    refuse('completion-receipt-preservation');
  if (
    readLastKnownState(base).state !== move.from ||
    getStageVisitCount(base, move.to) + 1 !== move.visit
  )
    refuse('entry-baseline');
  const slots = clone(batch.bodyTemplate.slots);
  let timingKey = timing.key;
  if (timing.kind === 'comment-create') {
    if (slots.some((s) => s.id === 'transition-timing-id')) refuse('reserved-slot');
    slots.push({ id: 'transition-timing-id', kind: 'comment-id', effectKey: timing.key });
    timingKey = 'comment:{{aitm-slot:transition-timing-id}}';
  }
  const receipt = {
    schema: 'aitm.story-transition-completion/v1',
    transition: move,
    timing: {
      key: timingKey,
      resourceDigest: timing.intendedDigest,
      eventIds: timing.candidate.timing.eventIds,
      eventsDigest: timing.candidate.timing.eventsDigest,
    },
    effects: batch.effects
      .filter((e) => e.kind !== 'issue-update' && e !== timing)
      .map((e) => ({ key: e.key, digest: e.intendedDigest })),
  };
  // Native IDs enter a JSON comment. Refuse delimiter/quote injection rather than changing opaque IDs.
  if (/[<>]/.test(json(receipt))) refuse('receipt-token');
  if (stagedReceipts.some((r) => r.receipt.transition.id === move.id))
    refuse('reused-transition-id');
  const ts = timing.candidate.timing.events.find((e) => e.transitionId === move.id)?.timestamp;
  if (!Number.isFinite(Date.parse(ts))) refuse('transition-time');
  const body = writeMoveCompleteMarker(
    writeLastKnownState(
      stampEntryMarker(batch.bodyTemplate.body, move.to, ts, move.id),
      move.to
    ).trimEnd() +
      '\n' +
      receiptLine(receipt),
    move.to,
    ts,
    move.id
  );
  batch.bodyTemplate = freezeBodyTemplate({
    body,
    title: batch.bodyTemplate.title,
    slots,
    effects: batch.effects,
  });
  batch.approvedInputDigests = [
    ...new Set([...batch.approvedInputDigests, hash(json(batch.bodyTemplate))]),
  ].sort();
  const { batchId: ignored, ...intent } = batch;
  void ignored;
  batch.batchId = `batch:${hash(json(intent))}`;
  return batch;
}
/** Execute only an admitted native transition. No legacy compensation or post-body cloud tail. */
export async function runTransitionBatch({ ctx, store, claim, ports } = {}) {
  if (
    !ctx ||
    !store?.readGeneration ||
    !store.commitGeneration ||
    !ports ||
    !Array.isArray(ports.capabilities) ||
    [
      'readSnapshot',
      'apply',
      'observe',
      'validatePreStatus',
      'validateIssue',
      'validateFinal',
    ].some((key) => typeof ports[key] !== 'function')
  )
    refuse('arguments');
  const matchedContext = () => ({
    transition: ctx.transition,
    issueArg: ctx.issueArg,
    transitionId: ctx.transitionId,
    resolvedFromState: ctx.resolvedFromState,
    stateArg: ctx.stateArg,
    statusKey: ctx.statusKey,
    cfg: ctx.cfg,
  });
  let requestedContext;
  try {
    requestedContext = clone(matchedContext());
  } catch {
    refuse('transition-context');
  }
  const checkRequested = () => {
    if (!same(requestedContext, matchedContext())) refuse('transition-context-changed');
  };
  const nativePlanExit =
    requestedContext.transition?.from === 'plan' && requestedContext.transition?.to === 'develop';
  if (nativePlanExit) delete ctx.planTransitionAuthorityInput;
  const guard = nativePlanExit
    ? { exit: null }
    : await (ctx.runGuardExecution ?? ctx._runGuardExecution ?? runGuardExecution)(ctx);
  checkRequested();
  if (guard.exit != null)
    return {
      status: 'blocked',
      exit: guard.exit,
      phase: 'guard',
      sentinelPresent: false,
      boardMoved: false,
      tail: { failures: [] },
    };
  let planAdmission = null;
  const root = resolveRuntimeRoot({ cwd: process.cwd(), env: {} });
  const sid = resolveSessionId(),
    worktree = root.projectRoot;
  if (!claim?.registryKey) refuse('registered-claim-required');
  const assertOwner = () => {
    checkRequested();
    assertStoryWriter(claim, { worktree, sessionId: sid });
    if (
      resolveSessionId() !== sid ||
      resolveRuntimeRoot({ cwd: process.cwd(), env: {} }).projectRoot !== worktree ||
      store.cachePath !== claim.cachePath
    )
      refuse('local-context');
  };
  assertOwner();
  return withIssueLock(
    { issue: Number(ctx.issueArg), projDir: worktree, sessionId: sid, retries: 0 },
    async () => {
      const lock = currentIssueLockOwner(Number(ctx.issueArg));
      const check = () => {
        assertOwner();
        if (
          !lock ||
          currentIssueLockOwner(Number(ctx.issueArg)) !== lock ||
          lock.sessionId !== sid ||
          lock.projDir !== root.mainRoot
        )
          refuse('native-lock-owner');
      };
      check();
      let record = await store.readGeneration();
      check();
      if (!record) refuse('missing-generation');
      const verified = validateManifest(record.manifest, {
        identity: record.generation.identity,
        payloads: record.payloads,
      });
      if (
        !same(record.generation, verified.generation) ||
        record.manifest.claimId !== claim.claimId ||
        claim.identityKey !== storyIdentityKey(record.generation.identity) ||
        store.cachePath !==
          storyCachePath({ projectRoot: worktree, identity: record.generation.identity })
      )
        refuse('generation-identity');
      let generation = clone(record.generation),
        payloads = new Map(record.payloads);
      const persist = async () => {
        check();
        generation.generation = record.manifest.generation + 1;
        const expected = clone(generation);
        const saved = await store.commitGeneration(
          { generation, claimId: claim.claimId, payloads },
          { expectedGeneration: record.manifest.generation }
        );
        check();
        const read = validateManifest(saved.manifest, {
          identity: generation.identity,
          payloads: saved.payloads,
        });
        const withoutPaths = (v) =>
          JSON.parse(json(v), (key, value) => (key === 'payloadPath' ? undefined : value));
        if (
          saved.manifest.claimId !== claim.claimId ||
          !same(read.generation, saved.generation) ||
          !same(withoutPaths(expected), withoutPaths(read.generation))
        )
          refuse('commit-readback');
        record = saved;
        generation = clone(saved.generation);
        payloads = new Map(saved.payloads);
      };
      const validateAtBoundary = async (name, phase, input) => {
        check();
        planAdmission?.checkCurrentTime();
        const boundary = Object.freeze({});
        const batchId = generation.batch?.batchId;
        const publicationGeneration = generation.publicationGeneration;
        nativeBoundaries.set(boundary, async (requestedPhase) => {
          check();
          if (!isNativeStoryStore(store)) refuse('native-store-required');
          if (requestedPhase !== phase) refuse('native-boundary-phase');
          const actual = await store.readGeneration();
          check();
          const batch = validateRecoveryJournal(actual);
          if (
            actual.manifest.claimId !== claim.claimId ||
            batch?.batchId !== batchId ||
            actual.generation.publicationGeneration !== publicationGeneration ||
            !same(batch.transition, ctx.transition)
          )
            refuse('native-boundary-journal');
          return {
            store,
            claim,
            record: actual,
            snapshot: clone(input.snapshot),
            transition: clone(ctx.transition),
            statusKey: ctx.statusKey,
            cfg: clone(ctx.cfg),
            sessionPolicy: planAdmission?.sessionPolicy ? clone(planAdmission.sessionPolicy) : null,
            workflowPolicy: planAdmission?.workflowPolicy ?? null,
            approvalAdmission: planAdmission,
            nativePlanAuthority: ports.nativePlanAuthority,
            phase,
          };
        });
        try {
          if (name === 'runNativeGuards') {
            const result = await runGuardExecution(ctx, boundary);
            if (result.exit == null)
              planAdmission = readNativePlanGuardAdmission(result.nativePlanAdmission, {
                batchId,
                publicationGeneration,
              });
            return result;
          }
          if (nativePlanExit) {
            const mandatory = nativePlanAuthorityValidator(ports.nativePlanAuthority, name);
            const verdict = await mandatory({ ...input, boundary });
            if (verdict?.verified !== true || ports[name] === mandatory) return verdict;
          }
          return await ports[name]({ ...input, boundary });
        } finally {
          nativeBoundaries.delete(boundary);
          check();
        }
      };
      const result = (status, extra = {}) => {
        const complete = status === 'complete';
        return {
          status,
          exit: complete ? null : 7,
          phase: complete ? 'complete' : 'batch',
          sentinelPresent:
            generation.batch?.effects.some(
              (e) => e.kind === 'issue-update' && e.outcome?.state === 'confirmed'
            ) ?? false,
          boardMoved:
            generation.batch?.effects.some(
              (e) => e.key === ctx.statusKey && e.outcome?.state === 'confirmed'
            ) ?? false,
          itemId: generation.identity.projectItemId,
          tail: { failures: [] },
          ...extra,
        };
      };
      const existing = generation.batch;
      const completedReplay =
        existing?.status === 'complete' && same(existing.transition, ctx.transition);
      if (existing && existing.status !== 'complete') {
        validateRecoveryJournal(record);
        if (!same(existing.transition, ctx.transition)) refuse('pending-other-transition');
        if (existing.status !== 'confirmed') return result('pending');
      } else if (existing?.status === 'complete' && same(existing.transition, ctx.transition)) {
        validateRecoveryJournal(record);
        // Revalidate the final vector below; a same-state call never starts another batch.
      } else {
        const frozen = freezeTransition(record, ctx, ports);
        const cloud = checkedSnapshot(await ports.readSnapshot());
        check();
        generation.publicationGeneration = frozen.publicationGeneration;
        generation.batch = { ...frozen, status: 'prepared' };
        const comparison = compareSnapshots(frozen.baseline, cloud);
        if (!comparison.equal) {
          generation.batch.status = 'conflict';
          generation.conflicts.push({
            batchId: frozen.batchId,
            baseline: clone(frozen.baseline),
            working: clone(generation.working),
            current: cloud,
            changes: clone(comparison.changes),
          });
          await persist();
          return result('conflict');
        }
        assertStoryWriter(claim, { worktree, sessionId: sid, assignment: cloud.assignees });
        await persist();
        if (nativePlanExit) {
          const nativeGuard = await validateAtBoundary('runNativeGuards', 'native-guards', {
            ctx,
            record,
            snapshot: cloud,
          });
          if (nativeGuard.exit != null)
            return result('blocked', {
              exit: nativeGuard.exit,
              phase: 'guard',
              guardRefusals: nativeGuard.guardRefusals,
            });
        }
        // @story #2069 — a Plan candidate must be verified before any prerequisite.
        // The prepared journal is durable, but every effect is still unattempted.
        const planExit = ctx.transition.from === 'plan' && ctx.transition.to === 'develop';
        if (planExit && typeof ports.validateFrozenIntent !== 'function')
          refuse('frozen-intent-authority-required');
        if (
          typeof ports.validateFrozenIntent === 'function' &&
          (
            await validateAtBoundary('validateFrozenIntent', 'frozen-intent', {
              ctx,
              record,
              snapshot: cloud,
            })
          )?.verified !== true
        )
          refuse('frozen-intent-authority');
        check();
        for (let index = 0; index < generation.batch.effects.length; index++) {
          planAdmission?.checkCurrentTime();
          let effect = generation.batch.effects[index];
          if (
            effect.attempted ||
            effect.outcome !== null ||
            effect.dependencies.some(
              (key) =>
                generation.batch.effects.find((e) => e.key === key)?.outcome?.state !== 'confirmed'
            )
          )
            refuse('effect-not-ready');
          let dispatch = clone(effect);
          if (
            effect.key === ctx.statusKey &&
            (
              await validateAtBoundary('validatePreStatus', 'pre-status', {
                ctx,
                effects: clone(generation.batch.effects),
                snapshot: cloud,
              })
            )?.verified !== true
          )
            refuse('pre-status-authority');
          check();
          if (effect.kind === 'issue-update') {
            const realized = materializeBodyTemplate({
              template: generation.batch.bodyTemplate,
              expectedDigest: hash(json(generation.batch.bodyTemplate)),
              effects: generation.batch.effects,
            });
            const effects = generation.batch.effects.filter((e) => e.kind !== 'issue-update');
            validateCompletionReceipt(receiptIn(realized.candidate.body, ctx.transition), {
              transition: ctx.transition,
              confirmedEffects: effects,
            });
            if (
              (
                await validateAtBoundary('validateIssue', 'final-body', {
                  ctx,
                  base: hydrateJournalSnapshot(generation.batch.baseline, payloads).resources[
                    effect.key
                  ].body,
                  candidate: realized.candidate,
                  effects: clone(effects),
                  snapshot: cloud,
                })
              )?.verified !== true
            )
              refuse('final-body-authority');
            check();
            generation.batch.realizedIssue = clone(realized);
            dispatch = { ...dispatch, ...clone(realized) };
          }
          planAdmission?.checkCurrentTime();
          const previousBatchStatus = generation.batch.status;
          effect.attempted = true;
          effect.outcome = { state: 'dispatching' };
          generation.batch.status = 'dispatching';
          await persist();
          check();
          try {
            // No await may separate the last expiry check from provider dispatch.
            planAdmission?.checkCurrentTime();
          } catch (error) {
            // The journal was prepared, but no provider request was sent.
            // Retain confirmed predecessors and restore this exact no-send fact.
            const unsent = generation.batch.effects[index];
            unsent.attempted = false;
            unsent.outcome = null;
            generation.batch.status = previousBatchStatus;
            await persist();
            throw error;
          }
          let response, confirmation, reason;
          try {
            response = await ports.apply(clone(dispatch));
          } catch (error) {
            reason = String(error?.code ?? error?.message ?? 'transport-error');
          }
          check();
          try {
            confirmation = confirmResourceEffect(dispatch, response, {
              baseline: generation.baseSnapshot,
            });
          } catch (error) {
            reason ??= String(error.reason ?? error.code ?? 'confirmation-unavailable');
          }
          if (!confirmation) {
            try {
              response = await ports.observe(clone(dispatch));
              check();
              confirmation = confirmResourceEffect(dispatch, response, {
                baseline: generation.baseSnapshot,
              });
            } catch (error) {
              reason = String(error.reason ?? error.code ?? 'observation-unavailable');
            }
          }
          check();
          effect = generation.batch.effects[index];
          if (!confirmation) {
            effect.outcome = { state: 'uncertain', reason: reason ?? 'observation-unavailable' };
            generation.batch.status = 'uncertain';
            await persist();
            return result('uncertain');
          }
          effect.outcome = clone(confirmation.outcome);
          checkpointResource(generation, payloads, dispatch, confirmation);
          generation.batch.status = 'partial';
          await persist();
        }
        generation.batch.status = 'confirmed';
        await persist();
      }
      const current = checkedSnapshot(await ports.readSnapshot());
      check();
      assertStoryWriter(claim, { worktree, sessionId: sid, assignment: current.assignees });
      const expected = hydrateJournalSnapshot(generation.baseSnapshot, payloads);
      const comparison = compareSnapshots(expected, current);
      if (!comparison.equal) {
        // Drift after durable completion is a new observation, not evidence that the
        // earlier transition became incomplete. Preserve its manifest and journal.
        if (completedReplay)
          return result('conflict', { completed: true, changes: comparison.changes });
        generation.batch.status = 'conflict';
        generation.conflicts.push({
          batchId: generation.batch.batchId,
          baseline: expected,
          working: clone(generation.working),
          current,
          changes: clone(comparison.changes),
        });
        await persist();
        return result('conflict');
      }
      const effects = generation.batch.effects.filter((e) => e.kind !== 'issue-update');
      const receipt = receiptIn(
        current.resources[`issue:${generation.identity.issueNodeId}`].body,
        ctx.transition
      );
      validateCompletionReceipt(receipt, { transition: ctx.transition, confirmedEffects: effects });
      if (
        (await ports.validateFinal({ ctx, snapshot: current, receipt, effects: clone(effects) }))
          ?.verified !== true
      )
        refuse('final-authority');
      check();
      if (generation.batch.status !== 'complete') {
        generation.batch.status = 'complete';
        await persist();
      }
      return result('complete');
    }
  );
}
