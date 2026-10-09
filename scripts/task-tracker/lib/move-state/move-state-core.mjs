import { assertNativeRuntimeRootAdaptersAbsent } from '../runtime-storage.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  assertRevisionStageHostEffect,
  isMemoryStageEffectScope,
} from '../criteria-revision/transport-quarantine.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateGovernedLinkedPlan } from '../governed-plan-policy.mjs';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { resolveMutationTarget } from '../mutation-context.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { GH_API_TIMEOUT_MS } from '../process-timeouts.mjs';
import {
  withRevisionConsumer,
  readNativeRevisionStageBody,
  assertNativeRevisionStageScope,
  assertNativeStageEntryFrame,
  assertNativeStageSentinelFrame,
  RevisionPolicyError,
} from '../criteria-revision/policy.mjs';
// INTERNAL — the state-movement saga core (#755/#756). Extracted from
// scripts/gh/move-state.mjs's __mutationBlock so exactly one code path owns the
// ordered saga. Returns a result object; the HOST maps result.exit to
// process.exit. This function never calls process.exit and never prints usage.
import { runGuardExecution as defaultRunGuardExecution } from './guard-execution.mjs';
import {
  runStatusWrite as defaultRunStatusWrite,
  stampEntryMarkers as defaultStampEntryMarkers,
  readNativeEntryRequest,
  STATUS_OPTION_QUERY,
  STATUS_MARKER_CONSISTENCY_EXIT,
  readOriginalNativeBoardStatus,
  assertOriginalNativeBoardInvocation,
  assertOriginalNativeBoardRequest,
  assertOriginalNativeBoardResult,
  readOriginalNativeBoardFailure,
  assertOriginalNativeCompensationInvocation,
  assertOriginalNativeCompensationRecordingInput,
  assertOriginalNativeCompensationReturn,
  rollbackRecordedState as defaultRollbackRecordedState,
  assertBoardMarkerConsistent as defaultAssertBoardMarkerConsistent,
} from './github-mutation.mjs';
import { emitPhasePairRows as defaultEmitPhasePairRows } from './audit-timing.mjs';
import {
  runPostCommitTail as defaultRunPostCommitTail,
  DEFAULT_TAIL_STEPS,
} from './post-commit-tail.mjs';
import * as nativeTailCache from './cache-unpark.mjs';
import * as nativeTailAudit from './audit-timing.mjs';
import * as nativeCacheSession from '../../session-state.mjs';
import * as nativeCacheWords from '../../word-counter.mjs';
import { getProjectDir as nativeCacheRoot } from '../../paths.mjs';
const originalTailDispatch = nativeTailCache.dispatchOnEnterActions;
import { writeMoveCompleteMarker, readMoveCompleteMarker, isMoveComplete } from './sentinel.mjs';
import {
  parseEntryMarkers as parseGrammarEntryMarkers,
  serializeEntryMarker,
} from '../stage-entry-grammar.mjs';
import {
  createTransitionId as defaultCreateTransitionId,
  repairTransitionCommit as defaultRepairTransitionCommit,
  writeTransitionCommit as defaultWriteTransitionCommit,
} from './transition-commit.mjs';
import { getStageVisitCount } from '../stage-entry-markers.mjs';
import { parseTimingRows } from '../timing-ladder.mjs';
import { PHASE_EVENTS } from '../../phase-events.mjs';
import { resolveTailProfile } from './tail-profiles.mjs';
import { resolveReviewAuthority } from '../human-reviewer-audit.mjs';
import {
  PLAN_TRANSITION_AUTHORITY_EXIT,
  verifyPlanTransitionAuthorityScope as defaultVerifyPlanTransitionAuthorityScope,
  writePlanTransitionAuthority as defaultWritePlanTransitionAuthority,
} from '../plan-transition-authority.mjs';

// A timing row whose event closes a phase: any canonical `<state>:complete`
// slug (`refine:completed`, `test:passed`, `review:approved`, `issue:closed`)
// or the demote substitute. emitPhasePairRows writes the departing stage's
// completion row and the target's `enter` row under ONE shared timestamp, so
// the exit row is detectable as a completion-class row carrying the target
// entry row's ts.
const COMPLETE_EVENT_RE = /(?::completed|:passed|:approved|:closed)$|^demoted$/;

// Read the board's completion state WITHOUT mutating it (#756 idempotent
// replay). Returns the five signals isMoveComplete needs. Conservative by
// construction: any read that fails or a sentinel that does not already name
// the target short-circuits to "not complete", so the saga re-runs — and every
// saga step is itself idempotent, so an under-report only costs a redundant
// (harmless) pass; only an OVER-report would skip a real move, which the
// sentinel-first gate below prevents.
const nativeFirstVisitProbes = new WeakMap();

export async function defaultProbeCompletion(ctx) {
  const { issueArg, stateArg, cfg, SKIP_NETWORK } = ctx;
  const notComplete = {
    sentinelState: '',
    statusState: '',
    entryMarkerPresent: false,
    exitRowPresent: false,
    entryRowPresent: false,
    transitionId: null,
    recoverablePartial: false,
  };
  if (SKIP_NETWORK) return notComplete;

  // One read: the verified live body. An identity mutate is a pure read on
  // issue-body-mutate's no-op path (issue-body-mutate.mjs §36-38) and clobbers
  // no invariant marker (output === base).
  let nativeBodyRead = false;
  const fetchBody =
    ctx._fetchBody ||
    (async () => {
      const nativeBody = readNativeRevisionStageBody({
        repository: cfg.repo,
        issue: issueArg,
        projectDir: ctx.projectDir,
      });
      if (nativeBody !== null) {
        nativeBodyRead = true;
        return nativeBody;
      }
      const { mutateIssueBody } = await import('../issue-body-mutate.mjs');
      const res = await mutateIssueBody({
        issueNumber: issueArg,
        repo: cfg.repo,
        mutate: (base) => base,
      });
      return res?.body ?? '';
    });

  let body = '';
  try {
    body = await fetchBody();
    // The async reader yields even when its exact memory source is immediate.
    // Recheck original held scope and bytes before parsing or qualifying it.
    if (
      nativeBodyRead &&
      readNativeRevisionStageBody({
        repository: cfg.repo,
        issue: issueArg,
        projectDir: ctx.projectDir,
      }) !== body
    )
      throw new RevisionPolicyError({
        status: 'indeterminate',
        code: 'revision-authority-unavailable',
        noAutomaticRemediation: { reason: 'authority-investigation-required' },
      });
  } catch (error) {
    if (error instanceof RevisionPolicyError) throw error;
    return notComplete;
  }

  const sentinelMarker = readMoveCompleteMarker(body);
  const sentinelState = sentinelMarker?.state ?? '';
  const allEntries = parseGrammarEntryMarkers(body);
  const entries = allEntries.filter((entry) => entry.state === stateArg);
  const selectedEntry = entries.at(-1) ?? null;
  const latestEntry = allEntries.at(-1) ?? null;
  const hasRecoveryCandidate = Boolean(selectedEntry?.move && latestEntry === selectedEntry);
  if (sentinelState !== stateArg && !hasRecoveryCandidate) {
    const result = { ...notComplete, sentinelState };
    // Only this actual first-visit branch has a complete native body read and
    // needs no Status/timing read. Copies/failed fallback do not inherit it.
    if (nativeBodyRead && entries.length === 0)
      nativeFirstVisitProbes.set(
        result,
        Object.freeze({
          body,
          repository: cfg.repo,
          issue: Number(issueArg),
          projectDir: ctx.projectDir,
        })
      );
    return result;
  }

  const resolveLiveStateName = ctx.resolveLiveStateName || (async () => '');
  let statusState = '';
  try {
    statusState = (await resolveLiveStateName(issueArg)) || '';
  } catch {
    statusState = '';
  }

  // A sentinel that already claims the target must identify the same move as
  // the latest target entry. A sentinel for an older state is expected after
  // Status succeeds but before the final sentinel write; the transition-bound
  // entry and timing pair below are the recovery authority for that shape.
  const identityConsistent =
    sentinelState !== stateArg ||
    !sentinelMarker?.move ||
    !selectedEntry?.move ||
    sentinelMarker.move === selectedEntry.move;
  const entryMarkerPresent = getStageVisitCount(body, stateArg) > 0 && identityConsistent;

  const fetchTimingBody =
    ctx._fetchTimingBody ||
    (async () => {
      const { bodyOf, readTimingCommentBody } = await import('../../gh-timing-comment.mjs');
      return bodyOf(await readTimingCommentBody({ issueNumber: issueArg, repo: cfg.repo }));
    });
  let timingBody = '';
  try {
    timingBody = await fetchTimingBody();
  } catch {
    timingBody = '';
  }
  const transitionMarker = selectedEntry?.move
    ? `<!-- aitm-transition move="${selectedEntry.move}" -->`
    : null;
  const transitionTimingBody = transitionMarker
    ? timingBody
        .split('\n')
        .filter((line) => line.includes(transitionMarker))
        .join('\n')
    : '';
  const rows = parseTimingRows(transitionTimingBody);
  const enterEvent = PHASE_EVENTS[stateArg]?.enter?.event;
  const entryRows = enterEvent ? rows.filter((r) => r.event === enterEvent) : [];
  const entryRowPresent = entryRows.length > 0;
  const entryTs = entryRowPresent ? entryRows[entryRows.length - 1].ts : null;
  const exitRowPresent =
    entryTs != null &&
    rows.some(
      (r) =>
        r.ts === entryTs && (COMPLETE_EVENT_RE.test(r.event) || r.event === `demoted:${stateArg}`)
    );
  const recoverablePartial = Boolean(
    sentinelState !== stateArg &&
    statusState === stateArg &&
    selectedEntry?.move &&
    latestEntry === selectedEntry &&
    entryMarkerPresent &&
    exitRowPresent &&
    entryRowPresent
  );
  const transitionId =
    sentinelState === stateArg && identityConsistent
      ? (sentinelMarker?.move ?? selectedEntry?.move ?? null)
      : recoverablePartial
        ? selectedEntry.move
        : null;

  return {
    sentinelState,
    statusState,
    entryMarkerPresent,
    exitRowPresent,
    entryRowPresent,
    transitionId,
    recoverablePartial,
    visitMarker: selectedEntry
      ? serializeEntryMarker({
          state: selectedEntry.state,
          visit: selectedEntry.visit,
          ts: selectedEntry.ts,
          move: selectedEntry.move,
        })
      : null,
    sentinelMarker: sentinelMarker?.match ?? null,
  };
}

// Write the aitm-move-complete sentinel and re-read-verify it landed at target
// (#756, closes #752). Runs AFTER runStatusWrite returned exit:null, so a
// failure here means "board moved, completion not yet stamped — re-run to
// converge"; it never reports success on an unconfirmed sentinel write.
//
// Routes through mutateIssueBody: the write fetches a fresh base, upserts the
// sentinel as a `mutate(base) → next` closure (so no invariant marker is
// clobbered), and returns the VERIFIED live body — the re-read is the same
// round-trip, not a second one. Verification reads that returned body.
export async function defaultWriteSentinel(ctx) {
  if (isMemoryStageEffectScope()) assertNativeStageSentinelContext(ctx);
  else assertRevisionStageHostEffect();
  const { issueArg, stateArg, transitionId, cfg, SKIP_NETWORK } = ctx;
  // Offline/test mode writes nothing to the board (runStatusWrite likewise
  // short-circuits under SKIP_NETWORK). With no board write there is no
  // sentinel to stamp or verify, so report verified and let the saga proceed.
  if (SKIP_NETWORK) return { verified: true, transitionId };
  const ts = new Date().toISOString();
  const mutateBody =
    ctx._mutateBody ||
    (async ({ mutate }) => {
      const { mutateIssueBody } = await import('../issue-body-mutate.mjs');
      const input = { issueNumber: issueArg, repo: cfg.repo, mutate };
      if (!isMemoryStageEffectScope()) return mutateIssueBody(input);
      assertNativeStageSentinelContext(ctx);
      const record = nativeStagePreparation.getStore();
      if (record.sentinelInput) throw preparationRefusal('sentinel-reentrant');
      nativeSentinelRequests.set(input, {
        ctx,
        ts,
        descriptors: Object.getOwnPropertyDescriptors(input),
      });
      record.sentinelInput = input;
      try {
        return await mutateIssueBody(input);
      } finally {
        record.sentinelInput = null;
        nativeSentinelRequests.delete(input);
      }
    });
  const res = await mutateBody({
    mutate: (base) => writeMoveCompleteMarker(base, stateArg, ts, transitionId),
  });
  if (isMemoryStageEffectScope()) {
    assertNativeStageSentinelContext(ctx);
    const record = nativeStagePreparation.getStore();
    const journal = record.backend.snapshot.nativeStageRecords.at(-1);
    if (
      journal.steps.length !== 15 ||
      journal.steps[14].readback === null ||
      journal.steps[14].readback.resource.response.stdout !==
        JSON.stringify({ body: record.backend.observation.body.bytes })
    )
      throw preparationRefusal('sentinel-completion-readback');
  }
  const verified = readMoveCompleteMarker(res?.body ?? '');
  if (verified?.state === stateArg && (!transitionId || verified.move === transitionId)) {
    return {
      verified: true,
      transitionId: verified.move,
      sentinelMarker: verified.match,
      ts: verified.ts,
    };
  }
  process.stderr.write(
    `⛔ #${issueArg} → ${stateArg}: board moved but aitm-move-complete sentinel did NOT ` +
      `confirm on re-read. Move is NOT stamped complete; re-run to converge.\n`
  );
  return { verified: false, exit: 7 };
}

// Only the actual native allocation site records current transition identity.
// A copied string/context is not that original invocation.
const nativeTransitionOrigins = new WeakMap();
function nativeTransitionRefusal() {
  throw new RevisionPolicyError({
    status: 'indeterminate',
    code: 'revision-authority-unavailable',
    noAutomaticRemediation: { reason: 'authority-investigation-required' },
  });
}
function nativeTransitionScope(ctx) {
  return {
    repository: ctx.cfg?.repo,
    issue: String(ctx.issueArg),
    source: ctx.resolvedFromState,
    target: ctx.stateArg,
  };
}
function assertNativeTransitionContext(ctx, requireOriginal = false) {
  try {
    const field = Object.getOwnPropertyDescriptor(ctx, 'transitionId');
    for (let parent = Object.getPrototypeOf(ctx); parent; parent = Object.getPrototypeOf(parent))
      if (Object.getOwnPropertyDescriptor(parent, 'transitionId')) nativeTransitionRefusal();
    if (field && (!Object.hasOwn(field, 'value') || !field.writable)) nativeTransitionRefusal();
    if (!field || field.value === undefined) {
      if (requireOriginal) nativeTransitionRefusal();
      return;
    }
    const original = nativeTransitionOrigins.get(ctx),
      scope = nativeTransitionScope(ctx);
    if (
      !original ||
      field.value !== original.id ||
      Object.keys(scope).some((key) => scope[key] !== original.scope[key])
    )
      nativeTransitionRefusal();
  } catch (error) {
    if (error?.code === 'revision-authority-unavailable') throw error;
    nativeTransitionRefusal();
  }
}

// The atomic move saga. All body/timing evidence is made durable BEFORE the
// authoritative Status write, and the aitm-move-complete sentinel is written
// LAST of all — so a crash anywhere leaves a safely re-runnable partial state
// and "the move is complete" has a single verifiable definition (sentinel.mjs).
export async function moveState(ctx) {
  return withRevisionConsumer(
    {
      repository: ctx.cfg?.repo,
      issue: ctx.issueArg,
      activity: 'stage-write',
      backend: ctx.revisionBackend,
      projectDir: ctx.projectDir,
    },
    (capability) => {
      // Only the actual private memory admission supplies this capability.
      // Caller guard/step overrides must not run before its unavoidable fence.
      if (capability) assertNativeTransitionContext(ctx);
      if (
        capability &&
        (ctx.actor !== undefined ||
          ctx.runGuardExecution !== undefined ||
          Object.keys(ctx).some((key) => key.startsWith('_') && ctx[key] !== undefined))
      )
        throw new RevisionPolicyError({
          status: 'indeterminate',
          code: 'revision-authority-unavailable',
          noAutomaticRemediation: { reason: 'authority-investigation-required' },
        });
      return moveStateAdmitted(ctx, capability);
    }
  );
}

async function moveStateAdmitted(ctx, capability = null) {
  const { name: tailProfile } = resolveTailProfile(ctx.tailProfile);
  ctx.tailProfile = tailProfile;
  ctx.reviewAuthority = resolveReviewAuthority(ctx.reviewAuthority);

  const runGuardExecution =
    ctx.runGuardExecution ?? ctx._runGuardExecution ?? defaultRunGuardExecution;
  const probeCompletion = ctx._probeCompletion || defaultProbeCompletion;
  const emitPhasePairRows = ctx._emitPhasePairRows || defaultEmitPhasePairRows;
  const stampEntryMarkers = ctx._stampEntryMarkers || defaultStampEntryMarkers;
  const runStatusWrite = ctx._runStatusWrite || defaultRunStatusWrite;
  const writeSentinel = ctx._writeSentinel || defaultWriteSentinel;
  const runPostCommitTail = ctx._runPostCommitTail || defaultRunPostCommitTail;
  const createTransitionId = ctx._createTransitionId || defaultCreateTransitionId;
  const writePlanTransitionAuthority =
    ctx._writePlanTransitionAuthority || defaultWritePlanTransitionAuthority;
  const verifyPlanTransitionAuthorityScope =
    ctx._verifyPlanTransitionAuthorityScope || defaultVerifyPlanTransitionAuthorityScope;
  const writeTransitionCommit = ctx._writeTransitionCommit || defaultWriteTransitionCommit;
  const repairTransitionCommit = ctx._repairTransitionCommit || defaultRepairTransitionCommit;
  const rollbackRecordedState = ctx._rollbackRecordedState || defaultRollbackRecordedState;
  const assertBoardMarkerConsistent =
    ctx._assertBoardMarkerConsistent || defaultAssertBoardMarkerConsistent;

  // The guard decision, authority record, entry marker, sentinel, and commit
  // provenance all describe one move. Allocate their shared identity before
  // the guard so the successful decision can be captured without re-querying
  // policy at write time.
  if (capability) {
    assertNativeTransitionContext(ctx);
    if (ctx.transitionId === undefined) {
      ctx.transitionId = defaultCreateTransitionId();
      nativeTransitionOrigins.set(ctx, { id: ctx.transitionId, scope: nativeTransitionScope(ctx) });
    }
    assertNativeTransitionContext(ctx, true);
  } else ctx.transitionId = ctx.transitionId || createTransitionId();

  const guard = await runGuardExecution(ctx);
  if (
    capability &&
    guard.nativeEvaluation?.guardResult.ok === true &&
    guard.nativeEvaluation.ownershipReads?.decision.kind === 'owned-by-session' &&
    guard.nativeEvaluation.assignmentReads?.reads.length
  ) {
    return prepareNativeStageAtBoundary(ctx, capability, guard.nativeEvaluation);
  }
  if (guard.exit !== null && guard.exit !== undefined) {
    return {
      exit: guard.exit,
      itemId: '',
      tail: { failures: [] },
      phase: 'guard',
      sentinelPresent: false,
      boardMoved: false,
    };
  }

  // Idempotent replay (#756): if the sentinel + board + evidence already show
  // this exact move fully landed, do NOT rewrite any board element. The tail
  // still runs — every tail step is idempotent, and re-running it reconciles
  // dependents/fields that a crash between Status and tail may have skipped.
  const probe = await probeCompletion(ctx);
  if (probe.transitionId) ctx.transitionId = probe.transitionId;
  if (isMoveComplete({ ...probe, target: ctx.stateArg })) {
    if (ctx.repairOnly === true) {
      return {
        exit: null,
        itemId: '',
        noop: true,
        tail: { failures: [] },
        phase: 'noop',
        sentinelPresent: true,
        boardMoved: true,
        warnings: [],
      };
    }
    ctx.transitionEvidence = {
      visitMarker: probe.visitMarker ?? null,
      sentinelMarker: probe.sentinelMarker ?? null,
    };
    ctx.repairTransitionCommit = repairTransitionCommit;
    ctx.transitionCommitRepairRequested = true;
    const tail = await runPostCommitTail(ctx);
    return {
      exit: null,
      itemId: '',
      alreadyComplete: true,
      tail,
      phase: 'complete',
      sentinelPresent: true,
      boardMoved: true,
      warnings: [],
    };
  }
  const repairAfterStatus = ctx.repairOnly === true && probe.recoverablePartial === true;
  if (ctx.repairOnly === true && !repairAfterStatus) {
    return {
      exit: null,
      itemId: '',
      noop: true,
      tail: { failures: [] },
      phase: 'noop',
      sentinelPresent: false,
      boardMoved: true,
      warnings: [],
    };
  }

  if (ctx.resolvedFromState === 'plan' && ctx.stateArg === 'develop') {
    try {
      ctx.planTransitionAuthority = await writePlanTransitionAuthority(ctx);
      if (ctx.planTransitionAuthority?.verified !== true) {
        throw new Error('plan-transition-authority:readback-unverified');
      }
      await verifyPlanTransitionAuthorityScope(ctx);
    } catch (error) {
      process.stderr.write(
        `⛔ #${ctx.issueArg} plan→develop authority was not durably verified: ${error.message}\n`
      );
      return {
        exit: PLAN_TRANSITION_AUTHORITY_EXIT,
        itemId: '',
        tail: { failures: [] },
        phase: 'authority',
        sentinelPresent: false,
        boardMoved: false,
      };
    }
  }

  // Pre-Status evidence: exit-flush the departing row + entry row, then the
  // entry markers. Both are individually idempotent and re-read-verified.
  if (!repairAfterStatus) await emitPhasePairRows(ctx);
  return continueMoveStateAfterPhases(ctx, probe, repairAfterStatus, {
    stampEntryMarkers,
    runStatusWrite,
    writeSentinel,
    runPostCommitTail,
    writeTransitionCommit,
    rollbackRecordedState,
    assertBoardMarkerConsistent,
  });
}

// One remainder for the native saga. Selection and admission stay with the
// original caller; this private function creates no execution authority.
async function continueMoveStateAfterPhases(
  ctx,
  probe,
  repairAfterStatus,
  {
    stampEntryMarkers,
    runStatusWrite,
    writeSentinel,
    runPostCommitTail,
    writeTransitionCommit,
    rollbackRecordedState,
    assertBoardMarkerConsistent,
  }
) {
  // #741 — stampEntryMarkers advances `aitm-last-known-state` to the target
  // stage and returns the stage it pointed at BEFORE (the board's confirmed
  // stage). Captured so a failed board write below can compensate.
  let stampResult = repairAfterStatus
    ? { priorState: ctx.stateArg, visitMarker: probe.visitMarker ?? null }
    : null;
  if (!repairAfterStatus) {
    try {
      stampResult = await stampEntryMarkers(ctx);
      if (isMemoryStageEffectScope())
        await retainNativeEntryResult(ctx, stampResult, stampEntryMarkers);
    } catch (error) {
      if (
        ctx.resolvedFromState === 'plan' &&
        ctx.stateArg === 'develop' &&
        String(error?.message || '').startsWith('plan-transition-authority:')
      ) {
        process.stderr.write(
          `⛔ #${ctx.issueArg} plan→develop authority changed before entry stamping: ${error.message}\n`
        );
        return {
          exit: PLAN_TRANSITION_AUTHORITY_EXIT,
          itemId: '',
          tail: { failures: [] },
          phase: 'authority',
          sentinelPresent: false,
          boardMoved: false,
        };
      }
      throw error;
    }
  }
  const priorState = stampResult?.priorState ?? null;

  // Status is the LAST authoritative board write (#711 fail-closed verify).
  const writeResult = repairAfterStatus
    ? { itemId: ctx.itemIdOverride ?? ctx.itemId ?? '', exit: null }
    : await runStatusWrite(ctx);
  if (writeResult.exit !== null) {
    // #741 — the board write failed/did-not-confirm but stampEntryMarkers has
    // already advanced the authoritative marker to the target. Roll the marker
    // back to `priorState` so the failure leaves marker == board (both at the
    // prior stage) instead of marker-ahead-of-board drift. The non-zero exit is
    // preserved (loud). Gated on `priorState` so the offline/DI paths that stub
    // stampEntryMarkers (returning undefined) are unaffected (#170/AC4).
    let rolledBack = false;
    if (priorState != null) {
      try {
        const rb = await rollbackRecordedState(ctx, priorState);
        rolledBack = rb?.rolledBack ?? false;
      } catch (err) {
        process.stderr.write(
          `[move-state] #${ctx.issueArg}: last-known-state rollback to ${priorState} ` +
            `FAILED after board-write failure: ${err.message}\n`
        );
      }
    }
    return {
      exit: writeResult.exit,
      itemId: writeResult.itemId,
      tail: { failures: [] },
      phase: 'status',
      sentinelPresent: false,
      boardMoved: false,
      rolledBack,
    };
  }
  assignNativeBoardItem(ctx, writeResult);

  // The sentinel is written only after Status verified at target; a failure
  // here means "board moved, completion not yet stamped — re-run to converge."
  const sentinel = await writeSentinel(ctx);
  if (isMemoryStageEffectScope()) retainNativeSentinelResult(ctx, sentinel, writeSentinel);
  if (!sentinel.verified) {
    return {
      exit: sentinel.exit ?? 7,
      itemId: writeResult.itemId,
      tail: { failures: [] },
      phase: 'sentinel',
      sentinelPresent: false,
      boardMoved: true,
    };
  }

  if (isMemoryStageEffectScope()) assignNativeTransitionEvidence(ctx, stampResult, sentinel);
  else {
    assertRevisionStageHostEffect();
    ctx.transitionEvidence = {
      visitMarker: stampResult?.visitMarker ?? null,
      sentinelMarker: sentinel?.sentinelMarker ?? null,
    };
  }

  // #741 — success-path post-condition: the board is confirmed at target and the
  // sentinel verified, so the authoritative `aitm-last-known-state` marker MUST
  // also read the target. Assert board == marker; a mismatch means a regression
  // re-opened the drift gap and is surfaced (non-zero), never swallowed. Gated
  // on `priorState` so the offline/DI stub paths (undefined) stay unaffected.
  if (priorState != null) {
    const consistency = isMemoryStageEffectScope()
      ? await runNativeStageConsistency(ctx, ctx.stateArg, assertBoardMarkerConsistent)
      : await assertBoardMarkerConsistent(ctx, ctx.stateArg);
    if (isMemoryStageEffectScope()) assertNativeConsistencyReturn(ctx, consistency);
    if (!consistency.consistent) {
      process.stderr.write(
        `⛔ #${ctx.issueArg} → ${ctx.stateArg}: board confirmed at target but ` +
          `aitm-last-known-state marker reads "${consistency.recorded}". ` +
          `Board/marker consistency post-condition FAILED.\n`
      );
      return {
        exit: consistency.exit ?? 8,
        itemId: writeResult.itemId,
        tail: { failures: [] },
        phase: 'consistency',
        sentinelPresent: true,
        boardMoved: true,
      };
    }
  }

  // Private scope presence routes errors only; it is never an admission result.
  const nativeCommentScope = nativeStagePreparation.getStore();
  if (isMemoryStageEffectScope()) assertNativeStageTransitionContext(ctx);
  else assertRevisionStageHostEffect();
  const warnings = [];
  try {
    if (isMemoryStageEffectScope())
      await runNativeStageTransitionCommit(ctx, writeTransitionCommit);
    else ctx.transitionCommit = await writeTransitionCommit(ctx, ctx.transitionEvidence);
  } catch (error) {
    if (nativeCommentScope) throw error;
    warnings.push({ code: 'commit-provenance-missing', message: error.message });
    process.stderr.write(
      `[move-state:warn] #${ctx.issueArg}: transition commit provenance missing: ${error.message}\n`
    );
  }

  const tail = isMemoryStageEffectScope()
    ? await runNativeStageTail(ctx, runPostCommitTail)
    : await runPostCommitTail(ctx);
  return {
    exit: null,
    itemId: writeResult.itemId,
    tail,
    phase: 'complete',
    sentinelPresent: true,
    boardMoved: true,
    warnings,
  };
}

// R83 read-only preparation. Fixed runtime rendezvous and earliest-effect
// denial barriers are installed; effect release remains unavailable.
const nativeStagePreparation = new AsyncLocalStorage();
const nativeStagePreparations = new WeakMap();
const nativeStageIntents = new WeakMap();
const nativeStagePartialInputs = new WeakMap();
// No-return comparison of the actual lexical reporting call. A copied tuple,
// even with the same holder, has no membership and cannot select the backend.
export function assertNativeStagePartialHolder(input) {
  const record = nativeStagePartialInputs.get(input);
  if (
    !record ||
    nativeStagePreparations.get(record.identity) !== record ||
    !record.cancelled ||
    !record.header ||
    record.partialInput !== input
  )
    throw preparationRefusal('original-partial-report-input');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const expected = {
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    holder: record.identity,
  };
  if (
    Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(descriptors).length !== 4 ||
    Object.keys(expected).some(
      (key) =>
        !descriptors[key] ||
        !Object.hasOwn(descriptors[key], 'value') ||
        !descriptors[key].enumerable ||
        descriptors[key].value !== expected[key]
    )
  )
    throw preparationRefusal('original-partial-report-input');
  assertNativeRevisionStageScope({
    backend: record.backend,
    capability: record.capability,
    repository: record.context.repository,
    issue: record.context.issue,
    projectDir: record.context.executor.worktree,
  });
  record.assertMemoryCapability(record.backend, record.capability, record.context);
  const journal = record.backend.snapshot.nativeStageRecords.at(-1);
  if (!journal || canonicalRecordJson(journal.header) !== canonicalRecordJson(record.header))
    throw preparationRefusal('original-partial-report-header');
}

function preparationRefusal(reason) {
  const error = new RevisionPolicyError({
    status: 'indeterminate',
    code: 'revision-authority-unavailable',
    noAutomaticRemediation: { reason: 'authority-investigation-required' },
  });
  error.preparationReason = reason;
  return error;
}
function readFixedStageLocal(file, root) {
  const target = resolveMutationTarget(file, root, root);
  if (target.physical !== target.lexical) throw preparationRefusal('complete-original-local');
  let entry;
  try {
    entry = lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!entry.isFile() || entry.isSymbolicLink())
    throw preparationRefusal('complete-original-local');
  return { bytes: readFileSync(file, 'utf8') };
}
function checkOriginalLocalSources(record) {
  if (!record.originalLocal) return;
  for (const [key, file] of Object.entries(record.localPaths)) {
    if (
      canonicalRecordJson(readFixedStageLocal(file, record.context.executor.worktree)) !==
      canonicalRecordJson(record.originalLocal[key])
    )
      throw preparationRefusal('complete-original-local');
  }
  for (const file of record.legacyAbsences) {
    if (readFixedStageLocal(file, record.context.executor.worktree) !== null)
      throw preparationRefusal('complete-original-local');
  }
}
function checkOriginalFieldSources(record) {
  if (!record.originalFields) return;
  for (const source of Object.values(record.originalFields)) {
    for (const read of source.reads) {
      if (read.error !== null) throw preparationRefusal('complete-original-fields');
      const target = resolveMutationTarget(
        read.path,
        path.dirname(read.path),
        path.dirname(read.path)
      );
      if (target.physical !== target.lexical) throw preparationRefusal('complete-original-fields');
      let entry;
      try {
        entry = lstatSync(read.path);
      } catch (error) {
        if (error.code === 'ENOENT' && read.exists === false && read.bytes === null) continue;
        throw preparationRefusal('complete-original-fields');
      }
      if (
        read.exists === false ||
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        typeof read.bytes !== 'string' ||
        readFileSync(read.path, 'utf8') !== read.bytes
      )
        throw preparationRefusal('complete-original-fields');
    }
  }
}
// Current filesystem/native context validation, never historical execution.
// Retained source bytes are compared to actual native reads after late awaits.
function checkOriginalStageSources(record) {
  if (
    canonicalRecordJson({
      githubActor: process.env.GITHUB_ACTOR ?? null,
      user: process.env.USER ?? null,
    }) !== canonicalRecordJson(record.actorEnvironment)
  )
    throw preparationRefusal('complete-original-current-sources');
  try {
    assertNativeRuntimeRootAdaptersAbsent();
    const { evaluation, context, source } = record;
    const root = context.executor.worktree;
    for (const selected of evaluation.localReads.configuration.sources) {
      const sourceRoot = selected.role === 'user' ? homedir() : root;
      const read = (file) => readFixedStageLocal(file, sourceRoot);
      const current = read(selected.currentPath);
      if ((current !== null) !== selected.currentExists) throw new TypeError();
      const actual =
        selected.selectedPath === selected.currentPath ? current : read(selected.selectedPath);
      if (
        (actual !== null) !== selected.selectedExists ||
        (actual?.bytes ?? null) !== selected.bytes ||
        selected.error !== null
      )
        throw new TypeError();
    }
    const session = evaluation.localReads.session.source;
    const sessionBytes = readFixedStageLocal(session.path, root);
    if (
      (sessionBytes !== null) !== session.exists ||
      (sessionBytes?.bytes ?? null) !== session.bytes ||
      session.error !== null
    )
      throw new TypeError();
    if (
      record.nativeRoots.projectDir() !== root ||
      process.cwd() !== root ||
      record.nativeRoots.currentSessionId() !== record.actorIdentity.sid ||
      record.nativeRoots.aiAppName() !== record.actorIdentity.provider
    )
      throw new TypeError();
    const linked = validateGovernedLinkedPlan({ body: record.originalBody, projectDir: root });
    if (!linked.ok || canonicalRecordJson(linked) !== record.originalLinked) throw new TypeError();
    // Check the exact consumed byte prefix, not a recount or a whole-file
    // snapshot. Ordinary later append-only transcript growth remains valid.
    const actualTranscriptPath = record.nativeRoots.jsonlPath(record.actorIdentity.sid);
    for (const kind of ['word', 'activity']) {
      const captured = source[kind];
      const actualPath = actualTranscriptPath;
      if (
        !captured ||
        actualPath !== captured.path ||
        actualPath !== source.resolutions[kind] ||
        captured.provider !== record.actorIdentity.provider ||
        captured.sid !== record.actorIdentity.sid ||
        !Number.isSafeInteger(captured.byteLength) ||
        captured.byteLength < 0
      )
        throw new TypeError();
      const target = resolveMutationTarget(
        actualPath,
        path.dirname(actualPath),
        path.dirname(actualPath)
      );
      const stat = lstatSync(actualPath);
      if (target.physical !== target.lexical || !stat.isFile() || stat.isSymbolicLink())
        throw new TypeError();
      const bytes = readFileSync(actualPath);
      if (
        bytes.length < captured.byteLength ||
        createHash('sha256').update(bytes.subarray(0, captured.byteLength)).digest('hex') !==
          captured.sha256
      )
        throw new TypeError();
    }
    // Fixed read-only Git commands revalidate original captured native leaves.
    // No caller request/mapper can choose a command, cwd or source.
    const git = (args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 15000 });
    // A single synchronous source check compares both original HEAD facts to
    // the same fresh native read. Nothing survives this call or an await.
    const currentHead = git(['rev-parse', 'HEAD']);
    for (const group of evaluation.guardReads)
      for (const entry of group) {
        const data = entry.data;
        if (entry.invocation.guardId === 'develop-exit-code-complete') {
          for (const item of data.reads) {
            let args;
            if (item.kind === 'root') args = ['rev-parse', '--show-toplevel'];
            else if (item.kind === 'files' && /^[0-9a-f]{7,40}$/i.test(item.sha))
              args = ['show', '--name-only', '--pretty=format:', item.sha];
            else if (item.kind === 'dirty') args = ['status', '--porcelain'];
            else throw new TypeError();
            if (
              item.cwd !== root ||
              item.exitCode !== 0 ||
              item.stderr !== '' ||
              git(args) !== item.stdout
            )
              throw new TypeError();
          }
          if (
            data.ancestry.identity.worktreePath !== root ||
            data.ancestry.identity.worktreeBranch !== context.executor.branch ||
            git(['rev-parse', '--abbrev-ref', 'HEAD']).trim() !== context.executor.branch
          )
            throw new TypeError();
          for (const item of data.ancestry.reads) {
            if (
              item.cwd !== root ||
              item.exitCode !== 0 ||
              item.stderr !== '' ||
              item.descendant !== context.executor.branch ||
              !/^[0-9a-f]{7,40}$/i.test(item.ancestor) ||
              git(['merge-base', '--is-ancestor', item.ancestor, item.descendant]) !== item.stdout
            )
              throw new TypeError();
          }
        } else if (entry.invocation.guardId === 'develop-exit-receipt') {
          if (
            data.head.cwd !== root ||
            data.head.exitCode !== 0 ||
            data.head.stderr !== '' ||
            currentHead !== data.head.stdout
          )
            throw new TypeError();
        } else if (entry.invocation.guardId === 'develop-exit-commit-trail-head') {
          // The first positive stage frontier is the actual literal-HEAD path.
          if (
            data.attribution !== null ||
            data.reads.length !== 1 ||
            data.reads[0].kind !== 'head' ||
            data.reads[0].cwd !== root ||
            data.reads[0].exitCode !== 0 ||
            data.reads[0].stderr !== '' ||
            currentHead !== data.reads[0].stdout
          )
            throw new TypeError();
        } else throw new TypeError();
      }
  } catch {
    throw preparationRefusal('complete-original-current-sources');
  }
}
function assertOriginalEntryContext(record) {
  const compare = (value, original) => {
    if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
      throw preparationRefusal('original-entry-context');
    const current = Object.getOwnPropertyDescriptors(value);
    if (
      Reflect.ownKeys(current).length !== Reflect.ownKeys(original).length ||
      Reflect.ownKeys(current).some((key) => {
        const a = current[key],
          b = original[key];
        return (
          !b ||
          !Object.hasOwn(a, 'value') ||
          !Object.hasOwn(b, 'value') ||
          a.value !== b.value ||
          a.enumerable !== b.enumerable ||
          a.configurable !== b.configurable ||
          a.writable !== b.writable
        );
      })
    )
      throw preparationRefusal('original-entry-context');
  };
  // Original descriptors remain immutable. Only the one actual native result
  // assignment can add/replace itemId after a completed Board14 readback.
  const contextDescriptors = record.assignedBoardItemDescriptor
    ? { ...record.originalContextDescriptors, itemId: record.assignedBoardItemDescriptor }
    : record.originalContextDescriptors;
  const evidenceDescriptors = record.transitionEvidenceDescriptor
    ? { ...contextDescriptors, transitionEvidence: record.transitionEvidenceDescriptor }
    : contextDescriptors;
  const commitDescriptors = record.transitionCommitDescriptor
    ? { ...evidenceDescriptors, transitionCommit: record.transitionCommitDescriptor }
    : evidenceDescriptors;
  compare(record.sagaContext, commitDescriptors);
  if (record.transitionEvidenceDescriptor) {
    if (Object.getPrototypeOf(record.transitionEvidenceDescriptor.value) !== Object.prototype)
      throw preparationRefusal('original-transition-evidence');
    compare(record.transitionEvidenceDescriptor.value, record.transitionEvidenceValueDescriptors);
  }
  compare(record.originalContextDescriptors.cfg.value, record.originalConfigDescriptors);
}
function checkPreparation(record) {
  if (!record || nativeStagePreparations.get(record.identity) !== record || record.cancelled)
    throw preparationRefusal('original-preparation');
  assertOriginalEntryContext(record);
  assertNativeReturnedResultsUnchanged(record);
  assertNativeRevisionStageScope({
    backend: record.backend,
    capability: record.capability,
    repository: record.context.repository,
    issue: record.context.issue,
    projectDir: record.context.executor.worktree,
  });
  record.assertMemoryCapability(record.backend, record.capability, record.context);
  const body = record.backend.observation.body.bytes;
  const compensationCurrent = record.compInvocation && record.compCustodyReady;
  if (compensationCurrent)
    record.compStore.assertMemoryNativeCompensationCurrent({
      backend: record.backend,
      token: record.stageToken,
      invocation: record.compInvocation,
    });
  if (
    ![
      record.originalBody,
      ...(record.entryAfterBody ? [record.entryAfterBody] : []),
      ...(record.sentinelAfterBody ? [record.sentinelAfterBody] : []),
      ...(record.compAfterBody ? [record.compAfterBody] : []),
    ].includes(body) ||
    (!compensationCurrent &&
      ![
        record.originalSnapshot,
        record.firstIntentSnapshot,
        ...(record.actorPrefixes ?? []),
        ...(record.timingPrefixes ?? []),
        ...(record.cursorPrefixes ?? []),
        ...(record.checkpointPrefixes ?? []),
        ...(record.removalPrefixes ?? []),
        ...(record.entryPrefixes ?? []),
        ...(record.boardPrefixes ?? []),
        ...(record.sentinelPrefixes ?? []),
        ...(record.transitionCommentPrefixes ?? []),
        ...(record.tailPrefixes ?? []),
        ...(record.cachePrefixes ?? []),
      ].includes(canonicalRecordJson(record.backend.snapshot)))
  )
    throw preparationRefusal('current-authority-drift');
  assertNativeTransitionContext(record.sagaContext, true);
  checkOriginalFieldSources(record);
  checkOriginalLocalSources(record);
  if (record.outerContext) record.assertOuterContext(record.outerContext);
}

// A comparison-only reader of a live, lexical saga token. Detached DATA cannot
// recreate membership; no callable ports/context/capability leave this module.
export function readNativeStageIntent(token, backend) {
  const record = nativeStageIntents.get(token);
  if (!record || record.backend !== backend) throw preparationRefusal('original-stage-intent');
  checkPreparation(record);
  checkOriginalStageSources(record);
  return structuredClone({ header: record.header });
}

export function readNativeStageActorIntent(token, backend, invocation) {
  const record = nativeStageIntents.get(token);
  if (
    !record ||
    record.backend !== backend ||
    record.stageToken !== token ||
    record.actorInvocation !== invocation ||
    invocation.file !== record.journalFile ||
    invocation.candidate !== record.candidate ||
    canonicalRecordJson(invocation.identity) !== canonicalRecordJson(record.actorIdentity)
  )
    throw preparationRefusal('original-actor-invocation');
  record.assertActorInvocation(invocation);
  return readNativeStageIntent(token, backend);
}
export async function beginNativeStageActorPreparation(input) {
  const record = nativeStagePreparation.getStore();
  if (!record || !record.stageToken || record.actorInvocation)
    throw preparationRefusal('original-actor-invocation');
  checkPreparation(record);
  checkOriginalStageSources(record);
  const { assertNativeActorJournalInvocation } = await import('../../runtime.mjs');
  checkPreparation(record);
  checkOriginalStageSources(record);
  assertNativeActorJournalInvocation(input);
  if (
    input.file !== record.journalFile ||
    input.candidate !== record.candidate ||
    canonicalRecordJson(input.identity) !== canonicalRecordJson(record.actorIdentity)
  )
    throw preparationRefusal('original-actor-invocation');
  const store = await import('../criteria-revision/store.mjs');
  checkPreparation(record);
  checkOriginalStageSources(record);
  record.assertActorInvocation = assertNativeActorJournalInvocation;
  record.actorInvocation = input;
  record.actorStore = store;
  let acquired = false;
  try {
    const existing = await store.acquireMemoryNativeStageActor({
      backend: record.backend,
      capability: record.capability,
      context: record.context,
      token: record.stageToken,
      invocation: input,
    });
    acquired = true;
    readNativeStageActorIntent(record.stageToken, record.backend, input);
    return existing;
  } catch (error) {
    if (acquired)
      store.releaseMemoryNativeStageActor({
        backend: record.backend,
        token: record.stageToken,
        invocation: input,
      });
    record.actorInvocation = null;
    throw error;
  }
}
export async function writeNativeStageActorPreparation(input, derivedRecord) {
  const record = nativeStagePreparation.getStore();
  if (!record) throw preparationRefusal('original-actor-invocation');
  readNativeStageActorIntent(record.stageToken, record.backend, input);
  await record.actorStore.writeMemoryNativeStageActor({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: input,
    record: derivedRecord,
  });
  readNativeStageActorIntent(record.stageToken, record.backend, input);
}
export function endNativeStageActorPreparation(input) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.actorInvocation !== input)
    throw preparationRefusal('original-actor-invocation');
  try {
    record.actorStore.releaseMemoryNativeStageActor({
      backend: record.backend,
      token: record.stageToken,
      invocation: input,
    });
  } finally {
    record.actorInvocation = null;
  }
}
export async function beginNativeStageActorRemoval(input) {
  const record = nativeStagePreparation.getStore();
  if (!record?.stageToken || record.actorInvocation || record.removing)
    throw preparationRefusal('original-actor-removal');
  readNativeStageIntent(record.stageToken, record.backend);
  const { assertNativeActorJournalInvocation } = await import('../../runtime.mjs');
  readNativeStageIntent(record.stageToken, record.backend);
  assertNativeActorJournalInvocation(input);
  const journal = record.backend.snapshot.nativeStageRecords.at(-1);
  if (
    input.file !== record.journalFile ||
    input.candidate !== record.candidate ||
    canonicalRecordJson(input.identity) !== canonicalRecordJson(record.actorIdentity) ||
    journal.steps.length !== 6 ||
    journal.steps[5].readback === null
  )
    throw preparationRefusal('actor-removal-prefix');
  const store = await import('../criteria-revision/store.mjs');
  readNativeStageIntent(record.stageToken, record.backend);
  assertNativeActorJournalInvocation(input);
  record.actorInvocation = input;
  record.actorStore = store;
  record.removing = true;
  let acquired = false;
  try {
    const existing = await store.acquireMemoryNativeStageActor({
      backend: record.backend,
      capability: record.capability,
      context: record.context,
      token: record.stageToken,
      invocation: input,
    });
    acquired = true;
    readNativeStageActorIntent(record.stageToken, record.backend, input);
    const current = record.backend.snapshot;
    if (
      current.nativeStageRecords.at(-1).steps.length !== 6 ||
      current.nativeStageResources.local.actorFlush?.bytes !== journal.steps[0].intent.journalBytes
    )
      throw preparationRefusal('actor-removal-prefix');
    return existing;
  } catch (error) {
    if (acquired)
      store.releaseMemoryNativeStageActor({
        backend: record.backend,
        token: record.stageToken,
        invocation: input,
      });
    record.actorInvocation = null;
    record.removing = false;
    throw error;
  }
}
export function endNativeStageActorRemoval(input) {
  const record = nativeStagePreparation.getStore();
  if (!record?.removing || record.actorInvocation !== input)
    throw preparationRefusal('original-actor-removal');
  try {
    record.actorStore.releaseMemoryNativeStageActor({
      backend: record.backend,
      token: record.stageToken,
      invocation: input,
    });
  } finally {
    record.actorInvocation = null;
    record.removing = false;
  }
}
export function readNativeStageActorRemovalIntent(token, backend, invocation) {
  const record = nativeStageIntents.get(token);
  if (!record?.removing) throw preparationRefusal('original-actor-removal');
  return readNativeStageActorIntent(token, backend, invocation);
}
export async function persistNativeStageActorRemoval(input) {
  const record = nativeStagePreparation.getStore();
  if (!record) throw preparationRefusal('original-actor-removal');
  readNativeStageActorRemovalIntent(record.stageToken, record.backend, input);
  const { reconstructNativeStageActorRemoval } =
    await import('../criteria-revision/stage-execution.mjs');
  readNativeStageActorRemovalIntent(record.stageToken, record.backend, input);
  const snapshot = record.backend.snapshot,
    journal = snapshot.nativeStageRecords.at(-1);
  const journalBytes = journal.steps[0].intent.journalBytes;
  const step = {
    ordinal: 7,
    kind: 'actor-journal-remove',
    previous: hashNativeStep(journal.steps[5]),
    intent: {
      file: record.journalFile,
      journalDigest: JSON.parse(journalBytes).digest,
      journalBytes,
    },
    readback: null,
  };
  const derived = await reconstructNativeStageActorRemoval({
    header: record.header,
    steps: [...journal.steps, step],
  });
  readNativeStageActorRemovalIntent(record.stageToken, record.backend, input);
  if (canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot))
    throw preparationRefusal('actor-removal-prefix');
  const intended = structuredClone(snapshot);
  intended.nativeStageRecords.at(-1).steps.push(structuredClone(step));
  const effected = structuredClone(intended);
  effected.nativeStageResources = structuredClone(derived.afterResources);
  const completed = structuredClone(effected);
  completed.nativeStageRecords.at(-1).steps[6].readback = { file: record.journalFile, bytes: null };
  record.removalPrefixes = [intended, effected, completed].map(canonicalRecordJson);
  await record.actorStore.persistMemoryNativeStageActorRemoval({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: input,
    step,
  });
  readNativeStageActorRemovalIntent(record.stageToken, record.backend, input);
}
export async function writeNativeStageActorRemoval(input) {
  const record = nativeStagePreparation.getStore();
  if (!record) throw preparationRefusal('original-actor-removal');
  readNativeStageActorRemovalIntent(record.stageToken, record.backend, input);
  await record.actorStore.writeMemoryNativeStageActorRemoval({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: input,
  });
  readNativeStageActorRemovalIntent(record.stageToken, record.backend, input);
}
export async function completeNativeStageActorRemoval(input) {
  const record = nativeStagePreparation.getStore();
  if (!record) throw preparationRefusal('original-actor-removal');
  readNativeStageActorRemovalIntent(record.stageToken, record.backend, input);
  await record.actorStore.completeMemoryNativeStageActorRemoval({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: input,
  });
  readNativeStageActorRemovalIntent(record.stageToken, record.backend, input);
}
export async function beginNativeStageActorPublication(input) {
  const record = nativeStagePreparation.getStore();
  if (!record?.stageToken || record.publishInput)
    throw preparationRefusal('original-actor-publication');
  readNativeStageIntent(record.stageToken, record.backend);
  const { assertNativeActorJournalInvocation } = await import('../../runtime.mjs');
  readNativeStageIntent(record.stageToken, record.backend);
  assertNativeActorJournalInvocation(input);
  if (
    input.candidate !== record.candidate ||
    input.file !== record.journalFile ||
    record.backend.snapshot.nativeStageRecords.at(-1).steps[0].readback === null
  )
    throw preparationRefusal('original-actor-publication');
  record.publishInput = input;
}
export function endNativeStageActorPublication(input) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.publishInput !== input)
    throw preparationRefusal('original-actor-publication');
  record.publishInput = null;
}
export async function beginNativeStageActorCommit(input) {
  const record = nativeStagePreparation.getStore();
  if (!record?.stageToken || record.commitJournal)
    throw preparationRefusal('original-actor-commit');
  readNativeStageIntent(record.stageToken, record.backend);
  const { assertNativeActorJournalInvocation } = await import('../../runtime.mjs');
  readNativeStageIntent(record.stageToken, record.backend);
  assertNativeActorJournalInvocation(input);
  const journal = record.backend.snapshot.nativeStageRecords.at(-1);
  if (
    input.candidate !== record.candidate ||
    input.file !== record.journalFile ||
    journal.steps.length !== 2 ||
    journal.steps[1].readback === null
  )
    throw preparationRefusal('actor-commit-prefix');
  record.commitJournal = input;
}
export function endNativeStageActorCommit(input) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.commitJournal !== input) throw preparationRefusal('original-actor-commit');
  record.commitJournal = null;
}
export async function beginNativeStageActorCommitInvocation(input) {
  const record = nativeStagePreparation.getStore();
  if (!record?.commitJournal || record.commitInvocation)
    throw preparationRefusal('original-actor-commit');
  readNativeStageIntent(record.stageToken, record.backend);
  const { assertNativeActorCommitInvocation } = await import('../../runtime.mjs');
  readNativeStageIntent(record.stageToken, record.backend);
  assertNativeActorCommitInvocation(input, record.commitJournal);
  if (
    input.markerPath !== record.localPaths.wordCursor ||
    input.statePath !== record.source.statePath ||
    canonicalRecordJson(input.identity) !== canonicalRecordJson(record.actorIdentity) ||
    canonicalRecordJson(input.payload) !== canonicalRecordJson(record.candidate)
  )
    throw preparationRefusal('original-actor-commit');
  const { validateWordCursor } = await import('../../word-counter.mjs');
  readNativeStageIntent(record.stageToken, record.backend);
  assertNativeActorCommitInvocation(input, record.commitJournal);
  record.assertCommitInvocation = assertNativeActorCommitInvocation;
  record.validateCursor = validateWordCursor;
  record.commitInvocation = input;
}
export function endNativeStageActorCommitInvocation(input) {
  const record = nativeStagePreparation.getStore();
  if (record?.commitInvocation === input) record.commitInvocation = null;
}
export function readNativeStageCursorIntent(token, backend, invocation) {
  const record = nativeStageIntents.get(token);
  if (
    !record ||
    record.backend !== backend ||
    record.commitInvocation !== invocation ||
    !record.commitJournal
  )
    throw preparationRefusal('original-cursor-invocation');
  record.assertCommitInvocation(invocation, record.commitJournal);
  return readNativeStageIntent(token, backend);
}
export function readNativeStageActorCursor(invocation) {
  const record = nativeStagePreparation.getStore();
  if (!record) throw preparationRefusal('original-cursor-invocation');
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  const current = record.backend.snapshot.nativeStageResources.local.wordCursor;
  return current === null
    ? { line: 0, words: 0, wordsFull: 0, task: null }
    : structuredClone(record.validateCursor(JSON.parse(current.bytes), record.actorIdentity));
}
export async function beginNativeStageActorCursor(invocation) {
  const record = nativeStagePreparation.getStore();
  if (!record) throw preparationRefusal('original-cursor-invocation');
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  if (!record.candidate.cursor || record.cursorLocked)
    throw preparationRefusal('actor-cursor-prefix');
  const store = await import('../criteria-revision/store.mjs');
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  record.cursorStore = store;
  await store.acquireMemoryNativeStageCursor({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation,
  });
  record.cursorLocked = true;
  try {
    readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
    const snapshot = record.backend.snapshot,
      journal = snapshot.nativeStageRecords.at(-1);
    if (journal.steps.length !== 2 || journal.steps[1].readback === null)
      throw preparationRefusal('actor-cursor-prefix');
    const observed = readNativeStageActorCursor(invocation);
    if (
      canonicalRecordJson({
        line: observed.line,
        words: observed.words,
        wordsFull: observed.wordsFull,
      }) !== canonicalRecordJson(record.candidate.cursor.before)
    )
      throw preparationRefusal('actor-cursor-prefix');
    return {
      file: record.localPaths.wordCursor,
      beforeBytes: snapshot.nativeStageResources.local.wordCursor?.bytes ?? null,
      identity: structuredClone(record.actorIdentity),
      ...record.candidate.cursor.after,
      task: record.candidate.issue,
    };
  } catch (error) {
    endNativeStageActorCursor(invocation);
    throw error;
  }
}
export function endNativeStageActorCursor(invocation) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.commitInvocation !== invocation || !record.cursorLocked)
    throw preparationRefusal('original-cursor-invocation');
  try {
    record.cursorStore.releaseMemoryNativeStageCursor({
      backend: record.backend,
      token: record.stageToken,
      invocation,
    });
  } finally {
    record.cursorLocked = false;
  }
}
export async function persistNativeStageActorCursor(invocation, intent) {
  const record = nativeStagePreparation.getStore();
  if (!record?.cursorLocked) throw preparationRefusal('original-cursor-invocation');
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  const { assertNativeStageCursorWrite } = await import('../../word-counter.mjs');
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  assertNativeStageCursorWrite(invocation, intent);
  const { reconstructNativeStageActorCursor } =
    await import('../criteria-revision/stage-execution.mjs');
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  assertNativeStageCursorWrite(invocation, intent);
  const snapshot = record.backend.snapshot,
    journal = snapshot.nativeStageRecords.at(-1);
  const step = {
    ordinal: 3,
    kind: 'actor-cursor',
    previous: hashNativeStep(journal.steps[1]),
    intent,
    readback: null,
  };
  const derived = await reconstructNativeStageActorCursor({
    header: record.header,
    first: journal.steps[0],
    second: journal.steps[1],
    step,
  });
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  assertNativeStageCursorWrite(invocation, intent);
  if (canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot))
    throw preparationRefusal('actor-cursor-prefix');
  const intended = structuredClone(snapshot);
  intended.nativeStageRecords.at(-1).steps.push(structuredClone(step));
  const effected = structuredClone(intended);
  effected.nativeStageResources = structuredClone(derived.afterResources);
  const completed = structuredClone(effected);
  completed.nativeStageRecords.at(-1).steps[2].readback = {
    file: intent.file,
    bytes: intent.bytes,
  };
  record.cursorPrefixes = [intended, effected, completed].map(canonicalRecordJson);
  await record.cursorStore.persistMemoryNativeStageCursor({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation,
    step,
  });
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
}
export async function writeNativeStageActorCursor(invocation) {
  const record = nativeStagePreparation.getStore();
  if (!record?.cursorLocked) throw preparationRefusal('original-cursor-invocation');
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  await record.cursorStore.writeMemoryNativeStageCursor({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation,
  });
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
}
export async function completeNativeStageActorCursor(invocation) {
  const record = nativeStagePreparation.getStore();
  if (!record?.cursorLocked) throw preparationRefusal('original-cursor-invocation');
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  await record.cursorStore.completeMemoryNativeStageCursor({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation,
  });
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
}
export async function beginNativeStageActorCheckpoint(invocation) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.checkpoint) throw preparationRefusal('original-checkpoint-invocation');
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  const runtime = await import('../../runtime.mjs');
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  const state = await import('../../state.mjs');
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  const codec = await import('../criteria-revision/stage-execution.mjs');
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  const snapshot = record.backend.snapshot,
    journal = snapshot.nativeStageRecords.at(-1);
  if (journal.steps.length !== 3 || journal.steps[2].readback === null)
    throw preparationRefusal('actor-checkpoint-prefix');
  const stateBytes = await codec.deriveNativeStageCheckpointState({
    header: record.header,
    first: journal.steps[0],
    second: journal.steps[1],
  });
  readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
  if (
    canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot) ||
    runtime.readNativeActorCheckpointInput(invocation, record.commitJournal) !== stateBytes
  )
    throw preparationRefusal('original-checkpoint-input');
  record.checkpoint = {
    stateBytes,
    readInput: runtime.readNativeActorCheckpointInput,
    invocation,
    kind: 'actor-checkpoint',
    offset: 0,
    assertOperation: state.assertNativeStageCheckpointOperation,
    index: 0,
    locked: false,
  };
  return {
    stateBytes,
    statePath: record.source.statePath,
    identity: structuredClone(record.actorIdentity),
  };
}
export async function beginNativeStageActorFinal(invocation) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.checkpoint || !record.outerContext)
    throw preparationRefusal('original-actor-final');
  readNativeStageIntent(record.stageToken, record.backend);
  const runtime = await import('../../runtime.mjs');
  readNativeStageIntent(record.stageToken, record.backend);
  const state = await import('../../state.mjs');
  readNativeStageIntent(record.stageToken, record.backend);
  const codec = await import('../criteria-revision/stage-execution.mjs');
  readNativeStageIntent(record.stageToken, record.backend);
  const snapshot = record.backend.snapshot,
    journal = snapshot.nativeStageRecords.at(-1);
  if (journal.steps.length !== 7 || journal.steps[6].readback === null)
    throw preparationRefusal('actor-final-prefix');
  const stateBytes = await codec.deriveNativeStageActorFinalState({
    header: record.header,
    steps: journal.steps,
  });
  readNativeStageIntent(record.stageToken, record.backend);
  if (
    canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot) ||
    runtime.readNativeActorFinalInput(invocation, record.outerContext, record.candidate) !==
      stateBytes
  )
    throw preparationRefusal('original-actor-final-input');
  record.checkpoint = {
    stateBytes,
    readInput: runtime.readNativeActorFinalInput,
    invocation,
    kind: 'actor-final',
    offset: 4,
    assertOperation: state.assertNativeStageCheckpointOperation,
    index: 0,
    locked: false,
  };
  return {
    stateBytes,
    statePath: record.source.statePath,
    identity: structuredClone(record.actorIdentity),
  };
}
export function endNativeStageActorCheckpoint(invocation) {
  const record = nativeStagePreparation.getStore();
  if (record?.checkpoint?.invocation === invocation) record.checkpoint = null;
}
function checkpointRecordWithIntent(invocation) {
  const record = nativeStagePreparation.getStore();
  if (!record?.checkpoint || record.checkpoint.invocation !== invocation)
    throw preparationRefusal('original-checkpoint-invocation');
  let bytes, intent;
  if (record.checkpoint.kind === 'actor-final') {
    intent = readNativeStageIntent(record.stageToken, record.backend);
    bytes = record.checkpoint.readInput(invocation, record.outerContext, record.candidate);
  } else {
    intent = readNativeStageCursorIntent(record.stageToken, record.backend, invocation);
    bytes = record.checkpoint.readInput(invocation, record.commitJournal);
  }
  if (bytes !== record.checkpoint.stateBytes) throw preparationRefusal('original-checkpoint-input');
  return { record, intent };
}
function checkpointRecord(invocation) {
  return checkpointRecordWithIntent(invocation).record;
}
export function assertNativeStageCheckpointCurrent(invocation) {
  checkpointRecord(invocation);
}
function checkpointOperation(invocation, operation, kind, index) {
  const record = checkpointRecord(invocation),
    checkpoint = record.checkpoint;
  checkpoint.assertOperation(invocation, operation);
  if (operation.kind !== kind || checkpoint.index !== index)
    throw preparationRefusal('actor-checkpoint-order');
  if (
    (operation.projDir !== undefined && operation.projDir !== record.context.executor.worktree) ||
    (operation.sid !== undefined && operation.sid !== record.actorIdentity.sid) ||
    (operation.identity !== undefined &&
      canonicalRecordJson(operation.identity) !== canonicalRecordJson(record.actorIdentity))
  )
    throw preparationRefusal('actor-checkpoint-scope');
  checkpoint.index++;
  return record;
}
export function checkNativeStageCheckpointDirectory(invocation, operation) {
  const record = checkpointOperation(invocation, operation, 'mkdir', 0);
  if (operation.directory !== path.dirname(record.source.statePath))
    throw preparationRefusal('actor-checkpoint-path');
}
export function readNativeStageCheckpointActor(invocation, operation) {
  const record = checkpointOperation(invocation, operation, 'read-actor', 1);
  return record.backend.snapshot.nativeStageResources.local.actorTiming?.bytes ?? null;
}
export function readNativeStageCheckpointBinding(invocation, operation) {
  const record = checkpointOperation(invocation, operation, 'read-binding', 2);
  return record.backend.snapshot.nativeStageResources.local.activeTask?.bytes ?? null;
}
export function readNativeStageCheckpointShared(invocation, operation) {
  const record = checkpointOperation(invocation, operation, 'read-shared', 5);
  const journal = record.backend.snapshot.nativeStageRecords.at(-1);
  if (
    operation.file !== record.source.statePath ||
    journal.steps.length !== 5 + record.checkpoint.offset ||
    journal.steps.at(-1).readback === null
  )
    throw preparationRefusal('actor-checkpoint-prefix');
  return record.backend.snapshot.nativeStageResources.local.trackerState?.bytes ?? null;
}
async function beginCheckpointLeaf(invocation, operation, kind, index, ordinal, key) {
  const record = checkpointOperation(invocation, operation, kind, index),
    checkpoint = record.checkpoint;
  if (checkpoint.locked) throw preparationRefusal('actor-checkpoint-lock');
  ordinal += checkpoint.offset;
  const store = await import('../criteria-revision/store.mjs');
  checkpointRecord(invocation);
  const journal = record.backend.snapshot.nativeStageRecords.at(-1);
  if (journal.steps.length !== ordinal - 1 || journal.steps.at(-1).readback === null)
    throw preparationRefusal('actor-checkpoint-prefix');
  checkpoint.ordinal = ordinal;
  checkpoint.key = key;
  checkpoint.operation = operation;
  checkpoint.store = store;
  await store.acquireMemoryNativeStageCheckpoint({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation,
  });
  checkpoint.locked = true;
  try {
    checkpointRecord(invocation);
    checkpoint.assertOperation(invocation, operation);
    return {
      invocation: checkpoint.kind,
      stateBytes: checkpoint.stateBytes,
      beforeBytes: record.backend.snapshot.nativeStageResources.local[key]?.bytes ?? null,
      file: record.localPaths[key],
      identity: structuredClone(record.actorIdentity),
    };
  } catch (error) {
    endNativeStageCheckpointLeaf(invocation);
    throw error;
  }
}
export async function beginNativeStageCheckpointSession(invocation, operation) {
  return await beginCheckpointLeaf(invocation, operation, 'set-binding', 3, 4, 'activeTask');
}
// Input gate without a return value before the original actor record construction. It
// neither advances the state program nor acquires a resource lock.
export function assertNativeStageActorStateInput(invocation, operation) {
  const record = checkpointRecord(invocation),
    checkpoint = record.checkpoint;
  checkpoint.assertOperation(invocation, operation);
  // Only the actual yielded operation is accepted. Close its data before any
  // nested input access; supplied accessors cannot run even on that identity.
  canonicalRecordJson(operation);
  if (
    Object.getPrototypeOf(operation) !== Object.prototype ||
    Object.keys(operation).sort().join(',') !== 'identity,kind,projDir,state' ||
    operation.kind !== 'write-actor' ||
    checkpoint.index !== 4 ||
    checkpoint.locked ||
    operation.projDir !== record.context.executor.worktree ||
    canonicalRecordJson(operation.identity) !== canonicalRecordJson(record.actorIdentity)
  )
    throw preparationRefusal('actor-checkpoint-scope');
}
export async function beginNativeStageCheckpointActor(invocation, operation) {
  return await beginCheckpointLeaf(invocation, operation, 'write-actor', 4, 5, 'actorTiming');
}
export async function beginNativeStageCheckpointShared(invocation, operation) {
  return await beginCheckpointLeaf(invocation, operation, 'write-shared', 6, 6, 'trackerState');
}
export function endNativeStageCheckpointLeaf(invocation) {
  const record = nativeStagePreparation.getStore(),
    checkpoint = record?.checkpoint;
  if (!checkpoint?.locked || checkpoint.invocation !== invocation)
    throw preparationRefusal('original-checkpoint-invocation');
  try {
    checkpoint.store.releaseMemoryNativeStageCheckpoint({
      backend: record.backend,
      token: record.stageToken,
      invocation,
    });
  } finally {
    checkpoint.locked = false;
    checkpoint.operation = null;
  }
}
export function readNativeStageCheckpointIntent(token, backend, invocation) {
  const record = nativeStageIntents.get(token);
  if (!record || record.backend !== backend)
    throw preparationRefusal('original-checkpoint-invocation');
  const checked = checkpointRecordWithIntent(invocation);
  if (record !== checked.record || !record.checkpoint.operation)
    throw preparationRefusal('original-checkpoint-invocation');
  record.checkpoint.assertOperation(invocation, record.checkpoint.operation);
  return { ...checked.intent, ordinal: record.checkpoint.ordinal };
}
export async function persistNativeStageCheckpoint(invocation, intent) {
  const record = checkpointRecord(invocation),
    checkpoint = record.checkpoint;
  if (!checkpoint.locked) throw preparationRefusal('actor-checkpoint-lock');
  let assertWrite;
  if (checkpoint.key === 'activeTask')
    ({ assertNativeStageSessionWrite: assertWrite } = await import('../../session-state.mjs'));
  else if (checkpoint.key === 'actorTiming')
    ({ assertNativeStageActorStateWrite: assertWrite } = await import('../actor-timing-state.mjs'));
  else ({ assertNativeStageTrackerWrite: assertWrite } = await import('../../state.mjs'));
  checkpointRecord(invocation);
  assertWrite(invocation, intent);
  const { reconstructNativeStageCheckpointSteps } =
    await import('../criteria-revision/stage-execution.mjs');
  checkpointRecord(invocation);
  assertWrite(invocation, intent);
  const snapshot = record.backend.snapshot,
    journal = snapshot.nativeStageRecords.at(-1);
  const step = {
    ordinal: checkpoint.ordinal,
    kind: ['local-session', 'local-actor', 'local-tracker'][
      checkpoint.ordinal - 4 - checkpoint.offset
    ],
    previous: hashNativeStep(journal.steps.at(-1)),
    intent,
    readback: null,
  };
  const derived = await reconstructNativeStageCheckpointSteps({
    header: record.header,
    steps: [...journal.steps, step],
  });
  checkpointRecord(invocation);
  assertWrite(invocation, intent);
  if (canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot))
    throw preparationRefusal('actor-checkpoint-prefix');
  const intended = structuredClone(snapshot);
  intended.nativeStageRecords.at(-1).steps.push(structuredClone(step));
  const effected = structuredClone(intended);
  effected.nativeStageResources = structuredClone(derived.afterResources);
  const completed = structuredClone(effected);
  completed.nativeStageRecords.at(-1).steps.at(-1).readback = {
    file: intent.file,
    bytes: intent.bytes,
  };
  record.checkpointPrefixes = [
    ...(record.checkpointPrefixes ?? []),
    ...[intended, effected, completed].map(canonicalRecordJson),
  ];
  await checkpoint.store.persistMemoryNativeStageCheckpoint({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation,
    step,
  });
  checkpointRecord(invocation);
}
export async function writeNativeStageCheckpoint(invocation) {
  const record = checkpointRecord(invocation);
  if (!record.checkpoint.locked) throw preparationRefusal('actor-checkpoint-lock');
  await record.checkpoint.store.writeMemoryNativeStageCheckpoint({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation,
  });
  checkpointRecord(invocation);
}
export async function completeNativeStageCheckpoint(invocation) {
  const record = checkpointRecord(invocation);
  if (!record.checkpoint.locked) throw preparationRefusal('actor-checkpoint-lock');
  await record.checkpoint.store.completeMemoryNativeStageCheckpoint({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation,
  });
  checkpointRecord(invocation);
}
export function readNativeStageTimingIntent(token, backend, invocation) {
  const record = nativeStageIntents.get(token);
  if (!record || record.backend !== backend || record.timingInput !== invocation)
    throw preparationRefusal('original-timing-invocation');
  if (record.timingPhase) {
    const facts = record.assertTimingInvocation(invocation, record.sagaContext);
    if (canonicalRecordJson(facts) !== canonicalRecordJson(record.timingPhase))
      throw preparationRefusal('original-phase-invocation');
  } else {
    if (!record.publishInput) throw preparationRefusal('original-timing-invocation');
    record.assertTimingInvocation(invocation, record.publishInput);
  }
  return { ...readNativeStageIntent(token, backend), ordinal: record.timingOrdinal };
}
export async function beginNativeStageTiming(input) {
  const record = nativeStagePreparation.getStore();
  if (!record?.stageToken || record.timingInput)
    throw preparationRefusal('original-timing-invocation');
  readNativeStageIntent(record.stageToken, record.backend);
  if (record.publishInput) {
    const { assertNativeActorTimingInvocation } = await import('../../runtime.mjs');
    readNativeStageIntent(record.stageToken, record.backend);
    assertNativeActorTimingInvocation(input, record.publishInput);
    record.assertTimingInvocation = assertNativeActorTimingInvocation;
    record.timingPhase = null;
  } else {
    const { readNativePhaseTimingInput } = await import('./audit-timing.mjs');
    readNativeStageIntent(record.stageToken, record.backend);
    const facts = readNativePhaseTimingInput(input, record.sagaContext);
    const steps = record.backend.snapshot.nativeStageRecords.at(-1).steps;
    if (
      ![10, 11].includes(steps.length) ||
      steps.at(-1).readback === null ||
      facts.phase !== (steps.length === 10 ? 'develop:complete' : 'test:enter') ||
      (steps.length === 11 &&
        (facts.ts !== steps[10].intent.ts || facts.offsetMin !== steps[10].intent.offsetMin))
    )
      throw preparationRefusal('original-phase-prefix');
    record.assertTimingInvocation = readNativePhaseTimingInput;
    record.timingPhase = facts;
  }
  record.timingOrdinal = record.timingPhase
    ? record.backend.snapshot.nativeStageRecords.at(-1).steps.length + 1
    : 2;
  const store = await import('../criteria-revision/store.mjs');
  readNativeStageIntent(record.stageToken, record.backend);
  record.timingInput = input;
  record.timingStore = store;
  try {
    await store.acquireMemoryNativeStageTiming({
      backend: record.backend,
      capability: record.capability,
      context: record.context,
      token: record.stageToken,
      invocation: input,
    });
    record.timingLocked = true;
    readNativeStageTimingIntent(record.stageToken, record.backend, input);
  } catch (error) {
    if (record.timingLocked)
      store.releaseMemoryNativeStageTiming({
        backend: record.backend,
        token: record.stageToken,
        invocation: input,
      });
    record.timingLocked = false;
    record.timingInput = null;
    throw error;
  }
}
export function endNativeStageTiming(input) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.timingInput !== input)
    throw preparationRefusal('original-timing-invocation');
  try {
    record.timingStore.releaseMemoryNativeStageTiming({
      backend: record.backend,
      token: record.stageToken,
      invocation: input,
    });
  } finally {
    record.timingInput = null;
    record.timingLocked = false;
    record.timingRead = null;
    record.timingPhase = null;
  }
}
export async function readNativeStageExecutionTimingPages({ repo, issueNumber }) {
  const record = nativeStagePreparation.getStore();
  if (!record?.timingInput) return null;
  readNativeStageTimingIntent(record.stageToken, record.backend, record.timingInput);
  const issue = Number(String(issueNumber).replace(/^#/, ''));
  if (repo !== record.context.repository || issue !== record.context.issue)
    throw preparationRefusal('timing-source-scope');
  const { nativeStageTimingPages } = await import('../criteria-revision/stage-execution.mjs');
  readNativeStageTimingIntent(record.stageToken, record.backend, record.timingInput);
  return nativeStageTimingPages({
    repository: repo,
    issue,
    comments: record.backend.snapshot.nativeStageResources.comments,
  });
}
// Fixed legacy request DATA from the independently current memory census.
export async function readNativeStageExecutionTimingComments({ repo, issueNumber }) {
  const pages = await readNativeStageExecutionTimingPages({ repo, issueNumber });
  if (pages === null) return null;
  const record = nativeStagePreparation.getStore();
  readNativeStageTimingIntent(record.stageToken, record.backend, record.timingInput);
  const comments = record.backend.snapshot.nativeStageResources.comments.map((entry) => {
    const raw = JSON.parse(entry.bytes);
    return {
      id: entry.nodeId,
      body: raw.body,
      url: `https://github.com/${repo}/issues/${record.context.issue}#issuecomment-${entry.id}`,
    };
  });
  return {
    request: {
      file: 'gh',
      args: ['issue', 'view', String(record.context.issue), '-R', repo, '--json', 'comments'],
    },
    response: { stdout: JSON.stringify({ comments }), stderr: '', exitCode: 0 },
  };
}
export async function noteNativeStageTimingRead(input, result) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.timingInput !== input)
    throw preparationRefusal('original-timing-invocation');
  readNativeStageTimingIntent(record.stageToken, record.backend, input);
  const { readNativeTimingSourceData } = await import('../../gh-timing-comment.mjs');
  readNativeStageTimingIntent(record.stageToken, record.backend, input);
  const captured = readNativeTimingSourceData(result);
  const pages = await readNativeStageExecutionTimingPages({
    repo: input.repo,
    issueNumber: input.issueNumber,
  });
  readNativeStageTimingIntent(record.stageToken, record.backend, input);
  if (
    !captured ||
    captured.kind !== 'canonical' ||
    !['absent', 'found'].includes(result.status) ||
    canonicalRecordJson(captured.reads) !== canonicalRecordJson(pages)
  )
    throw preparationRefusal('timing-source-readback');
  record.timingRead = { result, captured };
}
export async function prepareNativeStageTiming(input, existing, updated) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.timingInput !== input || record.timingRead?.result.source !== existing)
    throw preparationRefusal('timing-source-original');
  readNativeStageTimingIntent(record.stageToken, record.backend, input);
  const codec = await import('../criteria-revision/stage-execution.mjs');
  readNativeStageTimingIntent(record.stageToken, record.backend, input);
  const snapshot = record.backend.snapshot,
    journal = snapshot.nativeStageRecords.at(-1),
    previous = journal.steps.at(-1);
  const ordinal = record.timingOrdinal;
  if (journal.steps.length !== ordinal - 1 || previous.readback === null)
    throw preparationRefusal('timing-intent-prefix');
  let step, derived;
  if (record.timingPhase) {
    const original = journal.steps[1].intent;
    if (!existing || existing.commentNodeId !== original.nodeId)
      throw preparationRefusal('phase-timing-source');
    step = {
      ordinal,
      kind: 'phase-timing',
      previous: hashNativeStep(previous),
      intent: {
        ...record.timingPhase,
        row: input.row,
        commentId: original.commentId,
        nodeId: original.nodeId,
        beforeBody: existing.body,
        afterBody: updated,
      },
      readback: null,
    };
    derived = await codec.reconstructNativeStagePhaseTiming({
      header: record.header,
      steps: [...journal.steps, step],
    });
  } else {
    const allocation = codec.nativeStageTimingAllocation(record.header);
    if ((existing?.body ?? null) !== allocation.beforeBody)
      throw preparationRefusal('timing-intent-prefix');
    step = {
      ordinal: 2,
      kind: 'actor-timing',
      previous: hashNativeStep(previous),
      intent: { row: input.row, ...allocation, afterBody: updated },
      readback: null,
    };
    derived = await codec.reconstructNativeStageActorTiming({
      header: record.header,
      first: previous,
      step,
    });
  }
  readNativeStageTimingIntent(record.stageToken, record.backend, input);
  if (
    canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot) ||
    canonicalRecordJson(snapshot.nativeStageResources) !==
      canonicalRecordJson(derived.beforeResources)
  )
    throw preparationRefusal('timing-intent-prefix');
  const intended = structuredClone(snapshot);
  intended.nativeStageRecords.at(-1).steps.push(structuredClone(step));
  const effected = structuredClone(intended);
  effected.nativeStageResources = structuredClone(derived.afterResources);
  const completed = structuredClone(effected);
  completed.nativeStageRecords.at(-1).steps.at(-1).readback = {
    source: derived.source,
    pages: derived.pages,
  };
  record.timingPrefixes = [
    ...(record.timingPrefixes ?? []),
    ...[intended, effected, completed].map(canonicalRecordJson),
  ];
  await record.timingStore.persistMemoryNativeStageTiming({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: input,
    step,
  });
  readNativeStageTimingIntent(record.stageToken, record.backend, input);
}
function hashNativeStep(step) {
  return 'sha256:' + createHash('sha256').update(canonicalRecordJson(step)).digest('hex');
}
export async function writeNativeStageTimingComment({ repo, issueNumber, commentId, body }) {
  const record = nativeStagePreparation.getStore();
  if (!record?.timingInput) return null;
  readNativeStageTimingIntent(record.stageToken, record.backend, record.timingInput);
  const step = record.backend.snapshot.nativeStageRecords.at(-1).steps[record.timingOrdinal - 1];
  if (
    !step ||
    repo !== record.context.repository ||
    body !== step.intent.afterBody ||
    (step.intent.beforeBody === null
      ? Number(issueNumber) !== record.context.issue || commentId !== null
      : commentId !== step.intent.nodeId || issueNumber !== null)
  )
    throw preparationRefusal('timing-effect-intent');
  await record.timingStore.writeMemoryNativeStageTiming({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: record.timingInput,
  });
  readNativeStageTimingIntent(record.stageToken, record.backend, record.timingInput);
  return {
    url: `https://github.com/${repo}/issues/${record.context.issue}#issuecomment-${step.intent.commentId}`,
  };
}
export async function completeNativeStageTiming(input) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.timingInput !== input || record.timingRead?.result.status !== 'found')
    throw preparationRefusal('timing-source-readback');
  readNativeStageTimingIntent(record.stageToken, record.backend, input);
  await record.timingStore.completeMemoryNativeStageTiming({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: input,
    readback: { source: record.timingRead.result.source, pages: record.timingRead.captured.reads },
  });
  readNativeStageTimingIntent(record.stageToken, record.backend, input);
}

// These comparisons select only the original default remainder and lexical
// stamp/invariant request chain. They return no context, token or effect ports.
export function assertNativeStageEntryContext(ctx) {
  const record = nativeStagePreparation.getStore();
  if (
    !record ||
    record.sagaContext !== ctx ||
    !record.entryActive ||
    !record.stageToken ||
    nativeStageIntents.get(record.stageToken) !== record
  )
    throw preparationRefusal('original-entry-context');
  checkPreparation(record);
  checkOriginalStageSources(record);
  const journal = record.backend.snapshot.nativeStageRecords.at(-1);
  if (![12, 13].includes(journal.steps.length) || journal.steps[11].readback === null)
    throw preparationRefusal('entry-phase-prefix');
}
export function assertNativeStageEntryInput(input) {
  const record = nativeStagePreparation.getStore();
  assertNativeStageEntryContext(record?.sagaContext);
  readNativeEntryRequest(input, record.sagaContext);
  if (record.entryInput && record.entryInput !== input)
    throw preparationRefusal('original-entry-input');
  record.entryInput = input;
}
function entryRecord(input) {
  const record = nativeStagePreparation.getStore();
  assertNativeStageEntryContext(record?.sagaContext);
  if (!record.entryInput || record.entryWrapped !== input)
    throw preparationRefusal('original-entry-wrapper');
  record.assertEntryWrapper(input, record.entryInput);
  readNativeEntryRequest(record.entryInput, record.sagaContext);
  return record;
}
export function readNativeStageBodyIntent(token, backend, input) {
  const activeRecord = nativeStagePreparation.getStore();
  const record =
    input && activeRecord?.sentinelWrapped === input ? sentinelRecord(input) : entryRecord(input);
  if (record.stageToken !== token || record.backend !== backend)
    throw preparationRefusal('original-entry-token');
  return structuredClone({ header: record.header });
}
export async function beginNativeStageEntryWrite(input) {
  const record = nativeStagePreparation.getStore();
  assertNativeStageEntryContext(record?.sagaContext);
  const { assertOriginalStageEntryWrapper } = await import('../issue-body-mutate.mjs');
  assertNativeStageEntryContext(record.sagaContext);
  assertOriginalStageEntryWrapper(input, record.entryInput);
  if (record.entryWrapped) throw preparationRefusal('entry-reentrant');
  record.entryWrapped = input;
  record.assertEntryWrapper = assertOriginalStageEntryWrapper;
  const store = await import('../criteria-revision/store.mjs');
  entryRecord(input);
  record.entryStore = store;
  let acquired = false;
  try {
    await store.acquireMemoryNativeStageBody({
      backend: record.backend,
      capability: record.capability,
      context: record.context,
      token: record.stageToken,
      invocation: input,
    });
    acquired = true;
    entryRecord(input);
  } catch (error) {
    if (acquired)
      store.releaseMemoryNativeStageBody({
        backend: record.backend,
        token: record.stageToken,
        invocation: input,
      });
    record.entryWrapped = null;
    throw error;
  }
}
export function endNativeStageEntryWrite(input) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.entryWrapped !== input) throw preparationRefusal('original-entry-wrapper');
  record.entryStore.releaseMemoryNativeStageBody({
    backend: record.backend,
    token: record.stageToken,
    invocation: input,
  });
  record.entryWrapped = null;
  record.entryInput = null;
}
export async function fetchNativeStageEntryBody(input) {
  const record = entryRecord(input);
  if (record.backend.snapshot.nativeStageRecords.at(-1).steps.length === 13) {
    const bytes = await record.entryStore.completeMemoryNativeStageBody({
      backend: record.backend,
      capability: record.capability,
      context: record.context,
      token: record.stageToken,
      invocation: input,
    });
    entryRecord(input);
    return bytes;
  }
  return record.backend.observation.body.bytes;
}
export async function pushNativeStageEntryBody(input, bytes) {
  const record = entryRecord(input);
  assertNativeStageEntryDelta(input, record.backend.observation.body.bytes, bytes);
  await record.entryStore.writeMemoryNativeStageBody({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: input,
  });
  entryRecord(input);
}
export function assertNativeStageEntryDelta(input, before, after) {
  const record = entryRecord(input);
  record.entryStore.assertMemoryNativeStageBodyIntent({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: input,
  });
  const snapshot = record.backend.snapshot,
    journal = snapshot.nativeStageRecords.at(-1);
  const step = journal.steps[12];
  if (
    !record.entryCodec ||
    before !== record.header.original.observation.body.bytes ||
    before !== snapshot.observation.body.bytes ||
    step.readback !== null ||
    canonicalRecordJson(step.intent) !==
      canonicalRecordJson(readNativeEntryRequest(record.entryInput, record.sagaContext))
  )
    throw preparationRefusal('entry-persisted-before');
  const derived = record.entryCodec.reconstructNativeStageBodyStep({
    repository: record.context.repository,
    issue: record.context.issue,
    transitionId: record.header.intent.transitionId,
    body: before,
    ordinal: 13,
    previous: hashNativeStep(journal.steps[11]),
    step,
  });
  if (derived.afterBody !== after) throw preparationRefusal('entry-persisted-delta');
}
export async function prepareNativeStageEntryBody(input, before, bytes) {
  const record = entryRecord(input);
  const codec = await import('../criteria-revision/stage-execution.mjs');
  entryRecord(input);
  record.entryCodec = codec;
  const snapshot = record.backend.snapshot,
    journal = snapshot.nativeStageRecords.at(-1);
  if (journal.steps.length !== 12 || journal.steps[11].readback === null)
    throw preparationRefusal('entry-before-prefix');
  const step = {
    ordinal: 13,
    kind: 'entry-body',
    previous: hashNativeStep(journal.steps[11]),
    intent: readNativeEntryRequest(record.entryInput, record.sagaContext),
    readback: null,
  };
  const derived = await codec.reconstructNativeStageEntryBody({
    header: record.header,
    steps: [...journal.steps, step],
  });
  entryRecord(input);
  if (
    before !== derived.beforeBody.bytes ||
    bytes !== derived.afterBody.bytes ||
    canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot) ||
    canonicalRecordJson(snapshot.observation.body) !== canonicalRecordJson(derived.beforeBody) ||
    canonicalRecordJson(snapshot.nativeStageResources) !== canonicalRecordJson(derived.resources)
  )
    throw preparationRefusal('entry-derived-body');
  const intended = structuredClone(snapshot);
  intended.nativeStageRecords.at(-1).steps.push(structuredClone(step));
  const effected = structuredClone(intended);
  effected.observation.body = structuredClone(derived.afterBody);
  const completed = structuredClone(effected);
  const { ghFetchArgs } = await import('../versioned-issue-write.mjs');
  entryRecord(input);
  const args = ghFetchArgs(record.context.repository, record.context.issue);
  completed.nativeStageRecords.at(-1).steps[12].readback = {
    request: { file: 'gh', args },
    response: { stdout: bytes + '\n', stderr: '', exitCode: 0 },
    resource: {
      request: { file: 'gh', args: args.slice(0, -2) },
      response: { stdout: JSON.stringify({ body: bytes }), stderr: '', exitCode: 0 },
    },
  };
  record.entryAfterBody = bytes;
  record.entryPrefixes = [intended, effected, completed].map(canonicalRecordJson);
  const authority = {
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: input,
  };
  await record.entryStore.persistMemoryNativeStageBody({ ...authority, step });
  entryRecord(input);
  assertNativeStageEntryDelta(input, before, bytes);
}

// Private custody of actual default saga returns. These helpers are never
// exported and cannot register a caller-supplied result through a public root.
function nativeResultDescriptors(result, keys) {
  if (!result || Object.getPrototypeOf(result) !== Object.prototype)
    throw preparationRefusal('original-native-result');
  const descriptors = Object.getOwnPropertyDescriptors(result);
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return (
        !descriptor ||
        !Object.hasOwn(descriptor, 'value') ||
        !descriptor.enumerable ||
        !descriptor.writable ||
        !descriptor.configurable ||
        (!['string', 'number', 'boolean'].includes(typeof descriptor.value) &&
          descriptor.value !== null)
      );
    })
  )
    throw preparationRefusal('original-native-result');
  canonicalRecordJson(result);
  return descriptors;
}
function compareNativeResult(result, expected, original) {
  const descriptors = nativeResultDescriptors(result, Object.keys(expected));
  if (
    Object.keys(expected).some(
      (key) =>
        descriptors[key].value !== expected[key] ||
        (original && descriptors[key].value !== original[key].value)
    )
  )
    throw preparationRefusal('original-native-result');
  return descriptors;
}
function assertNativeReturnedResultsUnchanged(record) {
  if (record.transitionCommentReturned) {
    const retained = record.transitionCommentReturned;
    record.transitionCommentCode.assertOriginalNativeTransitionResult(
      retained.input,
      record.sagaContext,
      retained.result
    );
    if (canonicalRecordJson(retained.result) !== retained.bytes)
      throw preparationRefusal('original-transition-result');
  }
  for (const read of [record.transitionCreateRead, record.transitionCommentRead]) {
    if (!read) continue;
    assertNativeTransitionRequestUnchanged(read);
  }
  for (const retained of [
    record.entryReturned,
    record.sentinelReturned,
    record.consistencyReturned,
  ]) {
    if (!retained) continue;
    const expected = Object.fromEntries(
      Object.entries(retained.descriptors).map(([key, descriptor]) => [key, descriptor.value])
    );
    compareNativeResult(retained.result, expected, retained.descriptors);
  }
  if (record.consistencyRead) {
    const read = record.consistencyRead;
    if (canonicalRecordJson(read.request) !== read.bytes)
      throw preparationRefusal('original-consistency-request');
    compareNativeResult(read.response, { stdout: read.descriptors.stdout.value }, read.descriptors);
  }
}
// Only the lexical default consistency invocation can select this fixed read.
function nativeConsistencyRecord(input) {
  const record = nativeStagePreparation.getStore();
  if (!record || !input || record.consistencyInput !== input)
    throw preparationRefusal('original-consistency-input');
  assertNativeStageSentinelContext(record.sagaContext);
  if (!record.entryReturned || !record.sentinelReturned || !record.transitionEvidenceDescriptor)
    throw preparationRefusal('original-consistency-prefix');
  const facts = originalStageResultFacts(record, true);
  compareNativeResult(record.entryReturned.result, facts.entry, record.entryReturned.descriptors);
  compareNativeResult(
    record.sentinelReturned.result,
    facts.sentinel,
    record.sentinelReturned.descriptors
  );
  return record;
}
export function assertNativeStageConsistencyInput(input, ctx, expectedStage) {
  const record = nativeConsistencyRecord(input);
  if (ctx !== record.sagaContext || expectedStage !== record.header.intent.target)
    throw preparationRefusal('original-consistency-context');
}
export function readNativeStageConsistencyBody(input, request) {
  const record = nativeConsistencyRecord(input);
  if (record.consistencyRead) throw preparationRefusal('original-consistency-reentrant');
  const bytes = canonicalRecordJson(request);
  const expected = {
    file: 'gh',
    args: [
      'issue',
      'view',
      record.originalContextDescriptors.issueArg.value,
      '-R',
      record.originalConfigDescriptors.repo.value,
      '--json',
      'body',
    ],
    options: { timeout: GH_API_TIMEOUT_MS },
  };
  if (bytes !== canonicalRecordJson(expected))
    throw preparationRefusal('original-consistency-request');
  // The branded backend getter clones live private observation; never reuse step15 stdout.
  const response = { stdout: JSON.stringify({ body: record.backend.observation.body.bytes }) };
  record.consistencyRead = {
    request,
    bytes,
    response,
    descriptors: nativeResultDescriptors(response, ['stdout']),
  };
  return response;
}
export function assertNativeStageConsistencyResponse(input, request, response) {
  const record = nativeConsistencyRecord(input);
  const read = record.consistencyRead;
  if (
    !read ||
    request !== read.request ||
    response !== read.response ||
    canonicalRecordJson(request) !== read.bytes
  )
    throw preparationRefusal('original-consistency-response');
  compareNativeResult(
    response,
    { stdout: JSON.stringify({ body: record.backend.observation.body.bytes }) },
    read.descriptors
  );
}
function nativeConsistencyFacts(record) {
  const recorded = record.readOriginalEntryState(record.backend.observation.body.bytes).state;
  const expected = record.header.intent.target;
  const consistent = recorded === expected;
  return {
    consistent,
    recorded,
    expected,
    exit: consistent ? null : STATUS_MARKER_CONSISTENCY_EXIT,
  };
}
function assertNativeConsistencyReturn(ctx, result) {
  assertNativeStageSentinelContext(ctx);
  const record = nativeStagePreparation.getStore();
  if (!record.consistencyReturned || record.consistencyReturned.result !== result)
    throw preparationRefusal('original-consistency-result');
  originalStageResultFacts(record, true);
  compareNativeResult(
    result,
    nativeConsistencyFacts(record),
    record.consistencyReturned.descriptors
  );
  compareNativeResult(
    record.consistencyRead.response,
    { stdout: JSON.stringify({ body: record.backend.observation.body.bytes }) },
    record.consistencyRead.descriptors
  );
}
async function runNativeStageConsistency(ctx, expectedStage, originalFunction) {
  assertNativeStageSentinelContext(ctx);
  const record = nativeStagePreparation.getStore();
  if (
    originalFunction !== defaultAssertBoardMarkerConsistent ||
    record.consistencyInput ||
    record.consistencyReturned ||
    record.consistencyRead ||
    expectedStage !== record.header.intent.target
  )
    throw preparationRefusal('original-consistency-invocation');
  const input = Object.freeze({});
  record.consistencyInput = input;
  try {
    assertNativeStageConsistencyInput(input, ctx, expectedStage);
    const result = await originalFunction(ctx, expectedStage, input);
    assertNativeStageConsistencyInput(input, ctx, expectedStage);
    if (!record.consistencyRead) throw preparationRefusal('original-consistency-read');
    assertNativeStageConsistencyResponse(
      input,
      record.consistencyRead.request,
      record.consistencyRead.response
    );
    const descriptors = compareNativeResult(result, nativeConsistencyFacts(record));
    record.consistencyReturned = { result, descriptors };
    assertNativeConsistencyReturn(ctx, result);
    return result;
  } finally {
    record.consistencyInput = null;
  }
}

function originalStageResultFacts(record, includeSentinel = false) {
  const journal = record.backend.snapshot.nativeStageRecords.at(-1);
  if (
    includeSentinel
      ? journal.steps.length !== 15 || journal.steps[14].readback === null
      : journal.steps.length !== 13
  )
    throw preparationRefusal('original-native-result-prefix');
  return originalStageResultFactsFromJournal(record, journal, includeSentinel);
}
function originalStageResultFactsFromJournal(record, journal, includeSentinel) {
  const entry = journal.steps[12];
  if (!record.entryCodec || !record.readOriginalEntryState || !entry || entry.readback === null)
    throw preparationRefusal('original-native-result-prefix');
  const entryBody = record.entryCodec.reconstructNativeStageBodyStep({
    repository: record.context.repository,
    issue: record.context.issue,
    transitionId: record.header.intent.transitionId,
    body: record.header.original.observation.body.bytes,
    ordinal: 13,
    previous: hashNativeStep(journal.steps[11]),
    step: entry,
  });
  if (
    entryBody.afterBody !== record.entryAfterBody ||
    entryBody.readbackBody !== entryBody.afterBody
  )
    throw preparationRefusal('original-native-result-body');
  const entryFacts = {
    priorState: record.readOriginalEntryState(record.header.original.observation.body.bytes).state,
    visitMarker: serializeEntryMarker({
      state: record.header.intent.target,
      visit: entry.intent.visit,
      ts: entry.intent.entryTs,
      move: record.header.intent.transitionId,
    }),
    visit: entry.intent.visit,
    ts: entry.intent.entryTs,
    transitionId: record.header.intent.transitionId,
  };
  if (!includeSentinel) return { entry: entryFacts };
  const step = journal.steps[14];
  const sentinelBody = record.entryCodec.reconstructNativeStageBodyStep({
    repository: record.context.repository,
    issue: record.context.issue,
    transitionId: record.header.intent.transitionId,
    body: entryBody.afterBody,
    ordinal: 15,
    previous: hashNativeStep(journal.steps[13]),
    step,
  });
  if (
    sentinelBody.afterBody !== record.backend.observation.body.bytes ||
    sentinelBody.readbackBody !== sentinelBody.afterBody ||
    sentinelBody.afterBody !== record.sentinelAfterBody
  )
    throw preparationRefusal('original-native-result-body');
  const marker = readMoveCompleteMarker(sentinelBody.afterBody);
  if (
    marker?.state !== record.header.intent.target ||
    marker.move !== record.header.intent.transitionId ||
    marker.ts !== step.intent.ts
  )
    throw preparationRefusal('original-native-result-marker');
  return {
    entry: entryFacts,
    sentinel: {
      verified: true,
      transitionId: marker.move,
      sentinelMarker: marker.match,
      ts: marker.ts,
    },
  };
}
async function retainNativeEntryResult(ctx, result, originalFunction) {
  assertNativeStageEntryContext(ctx);
  const record = nativeStagePreparation.getStore();
  if (originalFunction !== defaultStampEntryMarkers || record.entryReturned)
    throw preparationRefusal('original-entry-result');
  const descriptors = nativeResultDescriptors(result, [
    'priorState',
    'visitMarker',
    'visit',
    'ts',
    'transitionId',
  ]);
  const { readLastKnownState } = await import('../../gh-timing-comment.mjs');
  assertNativeStageEntryContext(ctx);
  record.readOriginalEntryState = readLastKnownState;
  const facts = originalStageResultFacts(record);
  compareNativeResult(result, facts.entry, descriptors);
  record.entryReturned = { result, descriptors };
}
function retainNativeSentinelResult(ctx, result, originalFunction) {
  assertNativeStageSentinelContext(ctx);
  const record = nativeStagePreparation.getStore();
  if (originalFunction !== defaultWriteSentinel || !record.entryReturned || record.sentinelReturned)
    throw preparationRefusal('original-sentinel-result');
  // Preserve the actual original native unsuccessful return. This DATA path
  // registers no successful result and cannot reach evidence assignment.
  if (
    result &&
    Object.getPrototypeOf(result) === Object.prototype &&
    Object.getOwnPropertyDescriptor(result, 'verified')?.value === false
  ) {
    compareNativeResult(result, { verified: false, exit: 7 });
    return;
  }
  const facts = originalStageResultFacts(record, true);
  compareNativeResult(record.entryReturned.result, facts.entry, record.entryReturned.descriptors);
  const descriptors = compareNativeResult(result, facts.sentinel);
  record.sentinelReturned = { result, descriptors };
}
function assignNativeTransitionEvidence(ctx, entry, sentinel) {
  assertNativeStageSentinelContext(ctx);
  const record = nativeStagePreparation.getStore();
  if (
    record.entryReturned?.result !== entry ||
    record.sentinelReturned?.result !== sentinel ||
    record.transitionEvidenceDescriptor ||
    Object.hasOwn(record.originalContextDescriptors, 'transitionEvidence')
  )
    throw preparationRefusal('original-transition-evidence');
  const facts = originalStageResultFacts(record, true);
  compareNativeResult(entry, facts.entry, record.entryReturned.descriptors);
  compareNativeResult(sentinel, facts.sentinel, record.sentinelReturned.descriptors);
  const evidence = {
    visitMarker: facts.entry.visitMarker,
    sentinelMarker: facts.sentinel.sentinelMarker,
  };
  Object.defineProperty(ctx, 'transitionEvidence', {
    value: evidence,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  record.transitionEvidenceDescriptor = Object.freeze(
    Object.getOwnPropertyDescriptor(ctx, 'transitionEvidence')
  );
  record.transitionEvidenceValueDescriptors = Object.freeze(
    Object.getOwnPropertyDescriptors(evidence)
  );
  checkPreparation(record);
  checkOriginalStageSources(record);
}

// Only the original post-consistency call below creates this opaque invocation.
// Restored journals and the early alreadyComplete/repair branch cannot recreate it.
function assertNativeStageTransitionContext(ctx) {
  const record = nativeStagePreparation.getStore();
  if (
    !record ||
    record.sagaContext !== ctx ||
    !record.entryActive ||
    !record.stageToken ||
    nativeStageIntents.get(record.stageToken) !== record ||
    !record.assignedBoardItemDescriptor ||
    !record.entryReturned ||
    !record.sentinelReturned ||
    !record.transitionEvidenceDescriptor ||
    !record.consistencyReturned ||
    !record.consistencyRead
  )
    throw preparationRefusal('original-transition-context');
  checkPreparation(record);
  checkOriginalStageSources(record);
  assertOriginalNativeBoardResult(record.boardResult, ctx);
  const currentJournal = record.backend.snapshot.nativeStageRecords.at(-1);
  // Tail records remain independently bound to full current snapshots; compare
  // original body/comment custody against its unchanged complete16 prefix.
  const journal =
    record.tailInput && [17, 18].includes(currentJournal.steps.length)
      ? { ...currentJournal, steps: currentJournal.steps.slice(0, 16) }
      : currentJournal;
  if (journal.steps.length === 15) {
    if (journal.steps[14].readback === null) throw preparationRefusal('transition-sentinel-prefix');
  } else if (journal.steps.length === 16) {
    if (
      !record.transitionCommentBefore ||
      !record.transitionCommentStep ||
      canonicalRecordJson(journal.steps.slice(0, 15)) !==
        canonicalRecordJson(record.transitionCommentBefore.nativeStageRecords.at(-1).steps) ||
      canonicalRecordJson(journal.steps[15].intent) !==
        canonicalRecordJson(record.transitionCommentStep.intent) ||
      journal.steps[15].previous !== record.transitionCommentStep.previous ||
      journal.steps[15].kind !== 'transition-comment' ||
      journal.steps[15].ordinal !== 16
    )
      throw preparationRefusal('transition-exact-prefix');
  } else throw preparationRefusal('transition-exact-prefix');
  if (
    journal.steps[13].readback === null ||
    journal.steps[13].outcome?.kind !== 'confirmed' ||
    record.boardResult.exit !== null ||
    record.boardResult.itemId !== record.header.intent.itemId ||
    ctx.itemId !== record.boardResult.itemId ||
    ctx.SKIP_NETWORK ||
    '_mutateBody' in ctx
  )
    throw preparationRefusal('transition-board-prefix');
  // Preserve exact original held body; current body is separately checked against complete15/16.
  assertNativeStageSentinelFrame({
    backend: record.backend,
    capability: record.capability,
    repository: record.context.repository,
    issue: record.context.issue,
    projectDir: record.context.executor.worktree,
    originalObservation: JSON.parse(record.originalSnapshot).observation,
  });
  const facts = originalStageResultFactsFromJournal(
    record,
    { ...journal, steps: journal.steps.slice(0, 15) },
    true
  );
  compareNativeResult(record.entryReturned.result, facts.entry, record.entryReturned.descriptors);
  compareNativeResult(
    record.sentinelReturned.result,
    facts.sentinel,
    record.sentinelReturned.descriptors
  );
  const consistency = nativeConsistencyFacts(record);
  compareNativeResult(
    record.consistencyReturned.result,
    consistency,
    record.consistencyReturned.descriptors
  );
  compareNativeResult(
    record.consistencyRead.response,
    { stdout: JSON.stringify({ body: record.backend.observation.body.bytes }) },
    record.consistencyRead.descriptors
  );
  if (!consistency.consistent) throw preparationRefusal('transition-consistency-prefix');
  return record;
}
function nativeTransitionCommentRecord(input) {
  const record = nativeStagePreparation.getStore();
  if (!record || !input || record.transitionCommentInput !== input)
    throw preparationRefusal('original-transition-input');
  assertNativeStageTransitionContext(record.sagaContext);
  return record;
}
export function assertNativeStageTransitionInput(input, ctx, evidence) {
  const record = nativeTransitionCommentRecord(input);
  if (ctx !== record.sagaContext || evidence !== record.transitionEvidenceDescriptor.value)
    throw preparationRefusal('original-transition-input');
}
export function readNativeStageTransitionIntent(token, backend, input, context) {
  const record = nativeTransitionCommentRecord(input);
  if (token !== record.stageToken || backend !== record.backend || context !== record.context)
    throw preparationRefusal('original-transition-token');
  return structuredClone({ header: record.header });
}
function transitionAuthority(record, input) {
  return {
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: input,
  };
}
function retainNativeTransitionRequest(request, expected) {
  if (
    !request ||
    Object.getPrototypeOf(request) !== Object.prototype ||
    canonicalRecordJson(request) !== canonicalRecordJson(expected)
  )
    throw preparationRefusal('original-transition-request');
  return {
    request,
    bytes: canonicalRecordJson(request),
    descriptors: Object.getOwnPropertyDescriptors(request),
  };
}
function assertNativeTransitionRequestUnchanged(retained) {
  const descriptors = Object.getOwnPropertyDescriptors(retained.request),
    original = retained.descriptors;
  if (
    Object.getPrototypeOf(retained.request) !== Object.prototype ||
    Reflect.ownKeys(descriptors).length !== Reflect.ownKeys(original).length ||
    Reflect.ownKeys(descriptors).some((key) => {
      const a = descriptors[key],
        b = original[key];
      return (
        !b ||
        !Object.hasOwn(a, 'value') ||
        a.value !== b.value ||
        a.enumerable !== b.enumerable ||
        a.writable !== b.writable ||
        a.configurable !== b.configurable
      );
    }) ||
    canonicalRecordJson(retained.request) !== retained.bytes
  )
    throw preparationRefusal('original-transition-request');
}
export async function createNativeStageTransitionComment(input, request) {
  const record = nativeTransitionCommentRecord(input),
    derived = record.transitionCommentDerived;
  if (!derived || record.transitionCreateRead) throw preparationRefusal('transition-create-prefix');
  const expected = {
    file: 'gh',
    args: [
      'api',
      `repos/${record.context.repository}/issues/${record.context.issue}/comments`,
      '--method',
      'POST',
      '-f',
      `body=${derived.commentBody}`,
    ],
    options: { timeout: 15000 },
  };
  record.transitionCreateRead = retainNativeTransitionRequest(request, expected);
  const response = await record.transitionCommentStore.writeMemoryNativeStageTransition(
    transitionAuthority(record, input)
  );
  nativeTransitionCommentRecord(input);
  assertNativeStageTransitionCreateResponse(input, request, response);
  return response;
}
export function assertNativeStageTransitionCreateResponse(input, request, response) {
  const record = nativeTransitionCommentRecord(input),
    retained = record.transitionCreateRead;
  if (!retained || retained.request !== request)
    throw preparationRefusal('transition-create-response');
  assertNativeTransitionRequestUnchanged(retained);
  record.transitionCommentStore.assertMemoryNativeStageTransitionCreateResponse(
    transitionAuthority(record, input),
    response
  );
}
export async function readNativeStageTransitionComment(input, request) {
  const record = nativeTransitionCommentRecord(input),
    derived = record.transitionCommentDerived;
  if (!derived || !record.transitionCreateRead || record.transitionCommentRead)
    throw preparationRefusal('transition-read-prefix');
  const expected = {
    file: 'gh',
    args: ['api', `repos/${record.context.repository}/issues/comments/${derived.intent.commentId}`],
    options: { timeout: 15000 },
  };
  record.transitionCommentRead = retainNativeTransitionRequest(request, expected);
  const response = await record.transitionCommentStore.readMemoryNativeStageTransition(
    transitionAuthority(record, input)
  );
  nativeTransitionCommentRecord(input);
  assertNativeStageTransitionReadResponse(input, request, response);
  return response;
}
export function assertNativeStageTransitionReadResponse(input, request, response) {
  const record = nativeTransitionCommentRecord(input),
    retained = record.transitionCommentRead;
  if (!retained || retained.request !== request)
    throw preparationRefusal('transition-read-response');
  assertNativeTransitionRequestUnchanged(retained);
  record.transitionCommentStore.assertMemoryNativeStageTransitionReadResponse(
    transitionAuthority(record, input),
    response
  );
}
async function runNativeStageTransitionCommit(ctx, originalFunction) {
  const record = assertNativeStageTransitionContext(ctx);
  if (
    originalFunction !== defaultWriteTransitionCommit ||
    record.transitionCommentInput ||
    record.transitionCommentReturned ||
    Object.hasOwn(record.originalContextDescriptors, 'transitionCommit') ||
    Object.hasOwn(record.originalContextDescriptors, 'deps')
  )
    throw preparationRefusal('original-transition-invocation');
  const input = Object.freeze({});
  record.transitionCommentInput = input;
  let acquired = false;
  try {
    const store = await import('../criteria-revision/store.mjs');
    nativeTransitionCommentRecord(input);
    record.transitionCommentStore = store;
    const codec = await import('../criteria-revision/stage-execution.mjs');
    nativeTransitionCommentRecord(input);
    const code = await import('./transition-commit.mjs');
    nativeTransitionCommentRecord(input);
    record.transitionCommentCode = code;
    await store.acquireMemoryNativeStageTransition(transitionAuthority(record, input));
    acquired = true;
    nativeTransitionCommentRecord(input);
    const before = record.backend.snapshot,
      journal = before.nativeStageRecords.at(-1);
    if (journal.steps.length !== 15 || journal.steps[14].readback === null)
      throw preparationRefusal('transition-before-prefix');
    const derived = await codec.deriveRecordedNativeTransitionComment({
      header: record.header,
      steps: journal.steps,
    });
    nativeTransitionCommentRecord(input);
    if (
      canonicalRecordJson(before) !== canonicalRecordJson(record.backend.snapshot) ||
      canonicalRecordJson(before.nativeStageResources) !==
        canonicalRecordJson(derived.beforeResources) ||
      canonicalRecordJson(before.observation.body) !== canonicalRecordJson(derived.body) ||
      before.observation.stage !== derived.stage
    )
      throw preparationRefusal('transition-original-before');
    const step = {
      ordinal: 16,
      kind: 'transition-comment',
      previous: hashNativeStep(journal.steps[14]),
      intent: structuredClone(derived.intent),
      readback: null,
    };
    const intended = structuredClone(before);
    intended.nativeStageRecords.at(-1).steps.push(structuredClone(step));
    const effected = structuredClone(intended);
    effected.nativeStageResources = structuredClone(derived.afterResources);
    const completed = structuredClone(effected);
    const response = { stdout: derived.intent.commentBytes, stderr: '', exitCode: 0 };
    completed.nativeStageRecords.at(-1).steps[15].readback = {
      create: {
        request: {
          file: 'gh',
          args: [
            'api',
            `repos/${record.context.repository}/issues/${record.context.issue}/comments`,
            '--method',
            'POST',
            '-f',
            `body=${derived.commentBody}`,
          ],
        },
        response: structuredClone(response),
      },
      read: {
        request: {
          file: 'gh',
          args: [
            'api',
            `repos/${record.context.repository}/issues/comments/${derived.intent.commentId}`,
          ],
        },
        response: structuredClone(response),
      },
      census: structuredClone(derived.afterResources.comments),
    };
    record.transitionCommentBefore = before;
    record.transitionCommentStep = step;
    record.transitionCommentDerived = derived;
    record.transitionCommentPrefixes = [intended, effected, completed].map(canonicalRecordJson);
    await store.persistMemoryNativeStageTransition({ ...transitionAuthority(record, input), step });
    nativeTransitionCommentRecord(input);
    const result = await originalFunction(ctx, record.transitionEvidenceDescriptor.value, input);
    nativeTransitionCommentRecord(input);
    code.assertOriginalNativeTransitionResult(input, ctx, result);
    const actual = await codec.reconstructNativeStageTransitionComment({
      header: record.header,
      steps: record.backend.snapshot.nativeStageRecords.at(-1).steps,
    });
    nativeTransitionCommentRecord(input);
    code.assertOriginalNativeTransitionResult(input, ctx, result);
    const expected = {
      verified: true,
      commentId: actual.intent.commentId,
      record: actual.intent.record,
      body: actual.commentBody,
    };
    if (
      !actual.complete ||
      canonicalRecordJson(result) !== canonicalRecordJson(expected) ||
      canonicalRecordJson(record.backend.snapshot) !== canonicalRecordJson(completed)
    )
      throw preparationRefusal('transition-completed-result');
    record.transitionCommentReturned = { input, result, bytes: canonicalRecordJson(result) };
    Object.defineProperty(ctx, 'transitionCommit', {
      value: result,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    record.transitionCommitDescriptor = Object.freeze(
      Object.getOwnPropertyDescriptor(ctx, 'transitionCommit')
    );
    nativeTransitionCommentRecord(input);
    return result;
  } finally {
    if (acquired)
      record.transitionCommentStore.releaseMemoryNativeStageTransition({
        backend: record.backend,
        token: record.stageToken,
        invocation: input,
      });
    record.transitionCommentInput = null;
  }
}

// The only registration site is the actual default sentinel writer above.
const nativeSentinelRequests = new WeakMap();
function sentinelRequest(input, record) {
  const original = nativeSentinelRequests.get(input);
  if (!original || original.ctx !== record.sagaContext || record.sentinelInput !== input)
    throw preparationRefusal('original-sentinel-input');
  const descriptors = Object.getOwnPropertyDescriptors(input),
    expected = original.descriptors;
  if (
    Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(descriptors).length !== 3 ||
    Reflect.ownKeys(descriptors).some((key) => {
      const a = descriptors[key],
        b = expected[key];
      return (
        !b ||
        !Object.hasOwn(a, 'value') ||
        a.value !== b.value ||
        a.enumerable !== b.enumerable ||
        a.writable !== b.writable ||
        a.configurable !== b.configurable
      );
    })
  )
    throw preparationRefusal('original-sentinel-input');
  return { ts: original.ts };
}
export function assertNativeStageSentinelContext(ctx) {
  const record = nativeStagePreparation.getStore();
  if (
    !record ||
    record.sagaContext !== ctx ||
    !record.entryActive ||
    !record.stageToken ||
    nativeStageIntents.get(record.stageToken) !== record ||
    !record.assignedBoardItemDescriptor
  )
    throw preparationRefusal('original-sentinel-context');
  checkPreparation(record);
  checkOriginalStageSources(record);
  assertOriginalNativeBoardResult(record.boardResult, ctx);
  const journal = record.backend.snapshot.nativeStageRecords.at(-1),
    board = journal.steps[13];
  if (
    ![14, 15].includes(journal.steps.length) ||
    !board ||
    board.readback === null ||
    board.outcome?.kind !== 'confirmed' ||
    record.boardResult.exit !== null ||
    record.boardResult.itemId !== record.header.intent.itemId ||
    ctx.itemId !== record.boardResult.itemId ||
    ctx.SKIP_NETWORK ||
    '_mutateBody' in ctx
  )
    throw preparationRefusal('sentinel-board-prefix');
  assertNativeStageSentinelFrame({
    backend: record.backend,
    capability: record.capability,
    repository: record.context.repository,
    issue: record.context.issue,
    projectDir: record.context.executor.worktree,
    originalObservation: JSON.parse(record.originalSnapshot).observation,
  });
}
function sentinelRecord(input) {
  const record = nativeStagePreparation.getStore();
  assertNativeStageSentinelContext(record?.sagaContext);
  if (!input || record.sentinelWrapped !== input || !record.sentinelInput)
    throw preparationRefusal('original-sentinel-wrapper');
  record.assertSentinelWrapper(input, record.sentinelInput);
  sentinelRequest(record.sentinelInput, record);
  return record;
}
export function assertNativeStageBodyInput(input) {
  const record = nativeStagePreparation.getStore();
  if (input && nativeSentinelRequests.has(input)) {
    assertNativeStageSentinelContext(record?.sagaContext);
    sentinelRequest(input, record);
    return;
  }
  assertNativeStageEntryInput(input);
}
export async function beginNativeStageBodyWrite(input) {
  const record = nativeStagePreparation.getStore();
  if (!record?.sentinelInput) return beginNativeStageEntryWrite(input);
  assertNativeStageSentinelContext(record.sagaContext);
  const { assertOriginalStageEntryWrapper } = await import('../issue-body-mutate.mjs');
  assertNativeStageSentinelContext(record.sagaContext);
  assertOriginalStageEntryWrapper(input, record.sentinelInput);
  sentinelRequest(record.sentinelInput, record);
  if (record.sentinelWrapped) throw preparationRefusal('sentinel-reentrant');
  record.sentinelWrapped = input;
  record.assertSentinelWrapper = assertOriginalStageEntryWrapper;
  let acquired = false;
  try {
    const store = await import('../criteria-revision/store.mjs');
    sentinelRecord(input);
    record.sentinelStore = store;
    await store.acquireMemoryNativeStageBody({
      backend: record.backend,
      capability: record.capability,
      context: record.context,
      token: record.stageToken,
      invocation: input,
    });
    acquired = true;
    sentinelRecord(input);
  } catch (error) {
    if (acquired)
      record.sentinelStore.releaseMemoryNativeStageBody({
        backend: record.backend,
        token: record.stageToken,
        invocation: input,
      });
    record.sentinelWrapped = null;
    throw error;
  }
}
export function endNativeStageBodyWrite(input) {
  const record = nativeStagePreparation.getStore();
  if (!input || record?.sentinelWrapped !== input) return endNativeStageEntryWrite(input);
  record.sentinelStore.releaseMemoryNativeStageBody({
    backend: record.backend,
    token: record.stageToken,
    invocation: input,
  });
  record.sentinelWrapped = null;
}
export async function fetchNativeStageBody(input) {
  const record = nativeStagePreparation.getStore();
  if (!input || record?.sentinelWrapped !== input) return fetchNativeStageEntryBody(input);
  sentinelRecord(input);
  if (record.backend.snapshot.nativeStageRecords.at(-1).steps.length === 15) {
    const bytes = await record.sentinelStore.completeMemoryNativeStageSentinel({
      backend: record.backend,
      capability: record.capability,
      context: record.context,
      token: record.stageToken,
      invocation: input,
    });
    sentinelRecord(input);
    return bytes;
  }
  return record.backend.observation.body.bytes;
}
export function readNativeStageSentinelIntent(token, backend, input, context) {
  const record = sentinelRecord(input);
  if (record.stageToken !== token || record.backend !== backend || record.context !== context)
    throw preparationRefusal('original-sentinel-token');
  return structuredClone({ header: record.header });
}
export function assertNativeStageBodyDelta(input, before, after) {
  const record = nativeStagePreparation.getStore();
  if (input && record?.entryWrapped === input) {
    assertNativeStageEntryFrame(input, before);
    assertNativeStageEntryDelta(input, before, after);
    return;
  }
  if (input && record?.sentinelWrapped === input) {
    assertNativeStageSentinelDelta(input, before, after);
    return;
  }
  throw preparationRefusal('original-body-wrapper');
}
export function assertNativeStageSentinelDelta(input, before, after) {
  const record = sentinelRecord(input);
  record.sentinelStore.assertMemoryNativeStageSentinelIntent({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: input,
  });
  const snapshot = record.backend.snapshot,
    journal = snapshot.nativeStageRecords.at(-1),
    step = journal.steps[14];
  if (
    !record.sentinelCodec ||
    journal.steps.length !== 15 ||
    step.readback !== null ||
    before !== snapshot.observation.body.bytes ||
    canonicalRecordJson(step.intent) !==
      canonicalRecordJson(sentinelRequest(record.sentinelInput, record))
  )
    throw preparationRefusal('sentinel-persisted-before');
  const common = {
    repository: record.context.repository,
    issue: record.context.issue,
    transitionId: record.header.intent.transitionId,
  };
  const entry = record.sentinelCodec.reconstructNativeStageBodyStep({
    ...common,
    body: record.header.original.observation.body.bytes,
    ordinal: 13,
    previous: hashNativeStep(journal.steps[11]),
    step: journal.steps[12],
  });
  if (before !== entry.afterBody) throw preparationRefusal('sentinel-original-before');
  const derived = record.sentinelCodec.reconstructNativeStageBodyStep({
    ...common,
    body: before,
    ordinal: 15,
    previous: hashNativeStep(journal.steps[13]),
    step,
  });
  if (derived.afterBody !== after) throw preparationRefusal('sentinel-persisted-delta');
}
export async function prepareNativeStageBody(input, before, bytes) {
  const record = nativeStagePreparation.getStore();
  if (!input || record?.sentinelWrapped !== input)
    return prepareNativeStageEntryBody(input, before, bytes);
  sentinelRecord(input);
  const codec = await import('../criteria-revision/stage-execution.mjs');
  sentinelRecord(input);
  record.sentinelCodec = codec;
  const snapshot = record.backend.snapshot,
    journal = snapshot.nativeStageRecords.at(-1);
  if (
    journal.steps.length !== 14 ||
    journal.steps[13].readback === null ||
    journal.steps[13].outcome.kind !== 'confirmed'
  )
    throw preparationRefusal('sentinel-before-prefix');
  const step = {
    ordinal: 15,
    kind: 'sentinel-body',
    previous: hashNativeStep(journal.steps[13]),
    intent: sentinelRequest(record.sentinelInput, record),
    readback: null,
  };
  const derived = await codec.reconstructNativeStageSentinel({
    header: record.header,
    steps: [...journal.steps, step],
  });
  sentinelRecord(input);
  if (
    before !== derived.beforeBody.bytes ||
    bytes !== derived.afterBody.bytes ||
    canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot) ||
    canonicalRecordJson(snapshot.observation.body) !== canonicalRecordJson(derived.beforeBody) ||
    snapshot.observation.stage !== derived.stage ||
    canonicalRecordJson(snapshot.nativeStageResources) !== canonicalRecordJson(derived.resources)
  )
    throw preparationRefusal('sentinel-derived-body');
  const { ghFetchArgs } = await import('../versioned-issue-write.mjs');
  sentinelRecord(input);
  if (canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot))
    throw preparationRefusal('sentinel-current-prefix');
  const intended = structuredClone(snapshot);
  intended.nativeStageRecords.at(-1).steps.push(structuredClone(step));
  const effected = structuredClone(intended);
  effected.observation.body = structuredClone(derived.afterBody);
  const completed = structuredClone(effected),
    args = ghFetchArgs(record.context.repository, record.context.issue);
  completed.nativeStageRecords.at(-1).steps[14].readback = {
    request: { file: 'gh', args },
    response: { stdout: bytes + '\n', stderr: '', exitCode: 0 },
    resource: {
      request: { file: 'gh', args: args.slice(0, -2) },
      response: { stdout: JSON.stringify({ body: bytes }), stderr: '', exitCode: 0 },
    },
  };
  record.sentinelAfterBody = bytes;
  record.sentinelPrefixes = [intended, effected, completed].map(canonicalRecordJson);
  await record.sentinelStore.persistMemoryNativeStageSentinel({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: input,
    step,
  });
  sentinelRecord(input);
  assertNativeStageSentinelDelta(input, before, bytes);
}
export async function pushNativeStageBody(input, bytes) {
  const record = nativeStagePreparation.getStore();
  if (!input || record?.sentinelWrapped !== input) return pushNativeStageEntryBody(input, bytes);
  sentinelRecord(input);
  assertNativeStageSentinelDelta(input, record.backend.observation.body.bytes, bytes);
  await record.sentinelStore.writeMemoryNativeStageSentinel({
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: input,
  });
  sentinelRecord(input);
}

// Board14 uses the original native loop's lexical invocation and requests.
// These comparisons expose no token, context, callback or transport port.
export function assertNativeStageBoardContext(ctx) {
  const record = nativeStagePreparation.getStore();
  if (
    !record ||
    record.sagaContext !== ctx ||
    !record.entryActive ||
    !record.stageToken ||
    nativeStageIntents.get(record.stageToken) !== record
  )
    throw preparationRefusal('original-board-context');
  checkPreparation(record);
  checkOriginalStageSources(record);
  const journal = record.backend.snapshot.nativeStageRecords.at(-1);
  if (
    ![13, 14].includes(journal.steps.length) ||
    journal.steps[12].readback === null ||
    ['itemIdOverride', 'readBackStatusOptionId'].some((key) => Object.hasOwn(ctx, key)) ||
    ctx.SKIP_NETWORK ||
    ctx.optionId !== record.header.intent.targetOptionId
  )
    throw preparationRefusal('board-entry-prefix');
}
function boardRecord(invocation) {
  const record = nativeStagePreparation.getStore();
  assertNativeStageBoardContext(record?.sagaContext);
  if (!invocation || record.boardInvocation !== invocation)
    throw preparationRefusal('original-board-invocation');
  assertOriginalNativeBoardInvocation(invocation, record.sagaContext);
  return record;
}
export function readNativeStageBoardIntent(token, backend, invocation) {
  const record = boardRecord(invocation);
  if (record.stageToken !== token || record.backend !== backend)
    throw preparationRefusal('original-board-token');
  return structuredClone({ header: record.header });
}
function boardAuthority(record) {
  return {
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: record.boardInvocation,
  };
}
function boardPrefixes(record, snapshots) {
  record.boardPrefixes = [...(record.boardPrefixes ?? []), ...snapshots.map(canonicalRecordJson)];
}
export async function beginNativeStageBoard(ctx, invocation) {
  assertNativeStageBoardContext(ctx);
  const record = nativeStagePreparation.getStore();
  assertOriginalNativeBoardInvocation(invocation, ctx);
  if (record.boardInvocation) throw preparationRefusal('board-reentrant');
  const projects = await import('../../../gh/lib/github-projects.mjs');
  assertNativeStageBoardContext(ctx);
  assertOriginalNativeBoardInvocation(invocation, ctx);
  if (ctx.gh !== projects.gh || ctx.projectItemForIssue !== projects.projectItemForIssue)
    throw preparationRefusal('original-board-functions');
  // Initial supported frontier is one genuine retained membership. Do not
  // reorder or manufacture configured-only data for the native first20/10 reads.
  const members = record.header.original.membership.reads.membership.flatMap(
    (pair) => pair.response.repository.issue.projectItems.nodes
  );
  if (
    members.length !== 1 ||
    members[0].id !== record.header.intent.itemId ||
    typeof members[0].content.id !== 'string' ||
    !members[0].content.id
  )
    throw preparationRefusal('board-membership-topology');
  const store = await import('../criteria-revision/store.mjs');
  assertNativeStageBoardContext(ctx);
  assertOriginalNativeBoardInvocation(invocation, ctx);
  const codec = await import('../criteria-revision/stage-execution.mjs');
  assertNativeStageBoardContext(ctx);
  assertOriginalNativeBoardInvocation(invocation, ctx);
  record.boardInvocation = invocation;
  record.boardStore = store;
  record.boardCodec = codec;
  let acquired = false;
  try {
    await store.acquireMemoryNativeStageBoard(boardAuthority(record));
    acquired = true;
    boardRecord(invocation);
    const snapshot = record.backend.snapshot,
      journal = snapshot.nativeStageRecords.at(-1),
      h = record.header.intent;
    if (journal.steps.length !== 13) throw preparationRefusal('board-original-prefix');
    const step = {
      ordinal: 14,
      kind: 'board-status',
      previous: hashNativeStep(journal.steps[12]),
      intent: {
        projectId: h.projectId,
        itemId: h.itemId,
        fieldId: h.statusFieldId,
        optionId: h.targetOptionId,
      },
      attempts: [],
      outcome: null,
      readback: null,
    };
    const derived = await codec.reconstructNativeStageBoard({
      header: record.header,
      steps: [...journal.steps, step],
    });
    boardRecord(invocation);
    if (
      canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot) ||
      canonicalRecordJson(snapshot.nativeStageResources) !==
        canonicalRecordJson(derived.beforeResources) ||
      snapshot.observation.stage !== derived.beforeStage
    )
      throw preparationRefusal('board-original-resource');
    record.boardDerived = derived;
    const intended = structuredClone(snapshot);
    intended.nativeStageRecords.at(-1).steps.push(step);
    boardPrefixes(record, [intended]);
    await store.persistMemoryNativeStageBoard({ ...boardAuthority(record), step });
    boardRecord(invocation);
  } catch (error) {
    if (acquired)
      store.releaseMemoryNativeStageBoard({
        backend: record.backend,
        token: record.stageToken,
        invocation,
      });
    record.boardInvocation = null;
    throw error;
  }
}
export function endNativeStageBoard(ctx, invocation) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.sagaContext !== ctx || record.boardInvocation !== invocation)
    throw preparationRefusal('original-board-invocation');
  record.boardStore.releaseMemoryNativeStageBoard({
    backend: record.backend,
    token: record.stageToken,
    invocation,
  });
  record.statusSourceSelection = null;
  record.boardInvocation = null;
}
function originalBoardRequest(input, kind) {
  const record = nativeStagePreparation.getStore();
  boardRecord(record?.boardInvocation);
  assertOriginalNativeBoardRequest(input, record.boardInvocation, kind);
  return record;
}
function originalStatusPair(record, number) {
  const source = record.header.guardCapture.lifecycleSources.remote.stageStatus;
  if (!source) return null;
  const [owner, repo] = record.context.repository.split('/');
  const pair = source.reads[number - 1];
  if (
    !pair ||
    pair.attempt !== number ||
    canonicalRecordJson(pair.request) !==
      canonicalRecordJson({
        query: STATUS_OPTION_QUERY,
        variables: { owner, repo, issue: record.context.issue },
      }) ||
    canonicalRecordJson(source) !==
      canonicalRecordJson(record.backend.snapshot.lifecycleSources.remote.stageStatus)
  )
    throw preparationRefusal('board-status-source');
  return pair;
}
export function readNativeStageStatusSourceResponse(input, returned) {
  const record = nativeStagePreparation.getStore();
  if (!record?.header) throw preparationRefusal('original-board-status-source');
  if (!Object.hasOwn(record.header.guardCapture.lifecycleSources.remote, 'stageStatus'))
    return null;
  originalBoardRequest(input, 'status');
  const selected = record.statusSourceSelection;
  if (
    !selected ||
    selected.input !== input ||
    selected.output !== returned ||
    canonicalRecordJson(returned) !==
      canonicalRecordJson(originalStatusPair(record, selected.number).response)
  )
    throw preparationRefusal('original-board-status-source');
  return structuredClone(returned);
}
export function readNativeStageBoardStatusFacts(token, backend, invocation) {
  const record = boardRecord(invocation),
    selected = record.statusSourceSelection;
  if (record.stageToken !== token || record.backend !== backend || !selected)
    throw preparationRefusal('original-board-status-custody');
  readNativeStageStatusSourceResponse(selected.input, selected.output);
  return readOriginalNativeBoardStatus(selected.input, invocation);
}
export async function recordNativeStageBoardStatusSource(input) {
  const record = originalBoardRequest(input, 'status'),
    selected = record.statusSourceSelection;
  if (!selected || selected.input !== input)
    throw preparationRefusal('original-board-status-custody');
  const facts = readNativeStageBoardStatusFacts(
    record.stageToken,
    record.backend,
    record.boardInvocation
  );
  const snapshot = record.backend.snapshot;
  const source = await record.boardCodec.deriveRecordedStageStatusSource({
    observation: record.header.original.observation,
    lifecycleSources: record.header.guardCapture.lifecycleSources,
    projectId: record.header.intent.projectId,
  });
  originalBoardRequest(input, 'status');
  const pair = source.reads[selected.number - 1];
  if (
    canonicalRecordJson(facts) !==
      canonicalRecordJson({ transport: pair.transport, ...pair.derivation }) ||
    canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot)
  )
    throw preparationRefusal('board-status-custody-drift');
  const observed = structuredClone(snapshot),
    attempt = observed.nativeStageRecords.at(-1).steps[13].attempts.at(-1);
  if (
    attempt.number !== selected.number ||
    attempt.write?.kind !== 'returned' ||
    attempt.read !== null ||
    attempt.after !== null
  )
    throw preparationRefusal('board-status-prefix');
  attempt.read = { request: pair.request, ...facts };
  attempt.after = {
    stage: snapshot.observation.stage,
    membership: structuredClone(snapshot.nativeStageResources.membership),
  };
  await record.boardCodec.reconstructNativeStageBoard({
    header: record.header,
    steps: observed.nativeStageRecords.at(-1).steps,
  });
  originalBoardRequest(input, 'status');
  readNativeStageBoardStatusFacts(record.stageToken, record.backend, record.boardInvocation);
  boardPrefixes(record, [observed]);
  try {
    await record.boardStore.recordMemoryNativeStageBoardStatusSource(boardAuthority(record));
    originalBoardRequest(input, 'status');
    readNativeStageBoardStatusFacts(record.stageToken, record.backend, record.boardInvocation);
  } finally {
    record.statusSourceSelection = null;
  }
}
export async function readNativeStageBoardItem(input) {
  const record = originalBoardRequest(input, 'item');
  if (
    input.repo !== record.context.repository ||
    input.projectId !== record.header.intent.projectId ||
    Number(input.issueNumber) !== record.context.issue
  )
    throw preparationRefusal('board-item-subject');
  const data = await record.boardStore.readMemoryNativeStageBoardItem(boardAuthority(record));
  originalBoardRequest(input, 'item');
  return data;
}
export async function writeNativeStageBoardRequest(input, options) {
  const record = originalBoardRequest(input, 'write');
  const descriptors = Object.getOwnPropertyDescriptors(options);
  if (
    Object.getPrototypeOf(options) !== Object.prototype ||
    Reflect.ownKeys(descriptors).length !== 0
  )
    throw preparationRefusal('board-write-options');
  const snapshot = record.backend.snapshot,
    step = snapshot.nativeStageRecords.at(-1).steps[13];
  if (
    step.outcome !== null ||
    step.readback !== null ||
    step.attempts.length >= 3 ||
    (step.attempts.length && step.attempts.at(-1).after === null)
  )
    throw preparationRefusal('board-attempt-prefix');
  originalStatusPair(record, step.attempts.length + 1);
  const attempt = {
    number: step.attempts.length + 1,
    request: { file: 'gh', args: [...input] },
    before: {
      stage: snapshot.observation.stage,
      membership: structuredClone(snapshot.nativeStageResources.membership),
    },
    write: null,
    read: null,
    after: null,
  };
  const intended = structuredClone(snapshot);
  intended.nativeStageRecords.at(-1).steps[13].attempts.push(attempt);
  const derived = await record.boardCodec.reconstructNativeStageBoard({
    header: record.header,
    steps: intended.nativeStageRecords.at(-1).steps,
  });
  originalBoardRequest(input, 'write');
  if (canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot))
    throw preparationRefusal('board-attempt-current');
  const effected = structuredClone(intended);
  effected.observation.stage = derived.afterStage;
  effected.nativeStageResources = structuredClone(derived.afterResources);
  const returned = structuredClone(effected);
  returned.nativeStageRecords.at(-1).steps[13].attempts.at(-1).write = {
    kind: 'returned',
    stdout: '',
  };
  boardPrefixes(record, [intended, effected, returned]);
  await record.boardStore.persistMemoryNativeStageBoardAttempt({
    ...boardAuthority(record),
    attempt,
  });
  originalBoardRequest(input, 'write');
  const result = await record.boardStore.writeMemoryNativeStageBoard(boardAuthority(record));
  originalBoardRequest(input, 'write');
  return result;
}
export async function readNativeStageBoardStatus(input) {
  const record = originalBoardRequest(input, 'status');
  if (input.cfg !== record.sagaContext.cfg || Number(input.issueNumber) !== record.context.issue)
    throw preparationRefusal('board-status-subject');
  const snapshot = record.backend.snapshot;
  const data = await record.boardStore.readMemoryNativeStageBoardStatus(boardAuthority(record));
  originalBoardRequest(input, 'status');
  if (canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot))
    throw preparationRefusal('board-status-current');
  if (Object.hasOwn(record.header.guardCapture.lifecycleSources.remote, 'stageStatus')) {
    const attempt = snapshot.nativeStageRecords.at(-1).steps[13].attempts.at(-1);
    if (
      !attempt ||
      canonicalRecordJson(data) !==
        canonicalRecordJson(originalStatusPair(record, attempt.number).response)
    )
      throw preparationRefusal('board-status-source');
    record.statusSourceSelection = { input, output: data, number: attempt.number };
    return data;
  }
  const { STATUS_OPTION_QUERY } = await import('./github-mutation.mjs');
  originalBoardRequest(input, 'status');
  const [owner, repo] = record.context.repository.split('/');
  const observed = structuredClone(snapshot),
    attempt = observed.nativeStageRecords.at(-1).steps[13].attempts.at(-1);
  if (!attempt || attempt.write?.kind !== 'returned' || attempt.read !== null)
    throw preparationRefusal('board-status-prefix');
  attempt.read = {
    kind: 'returned',
    request: {
      query: STATUS_OPTION_QUERY,
      variables: { owner, repo, issue: record.context.issue },
    },
    response: data,
  };
  attempt.after = {
    stage: snapshot.observation.stage,
    membership: structuredClone(snapshot.nativeStageResources.membership),
  };
  await record.boardCodec.reconstructNativeStageBoard({
    header: record.header,
    steps: observed.nativeStageRecords.at(-1).steps,
  });
  originalBoardRequest(input, 'status');
  boardPrefixes(record, [observed]);
  await record.boardStore.recordMemoryNativeStageBoardStatus(boardAuthority(record));
  originalBoardRequest(input, 'status');
  return data;
}
export async function completeNativeStageBoard(ctx, invocation, result) {
  const record = boardRecord(invocation);
  assertOriginalNativeBoardResult(result, ctx);
  const snapshot = record.backend.snapshot,
    step = snapshot.nativeStageRecords.at(-1).steps[13];
  if (result.itemId !== record.header.intent.itemId || ![null, 7].includes(result.exit))
    throw preparationRefusal('board-original-result');
  const outcome = {
    kind: result.exit === null ? 'confirmed' : 'unconfirmed',
    attempt: step.attempts.length,
    exit: result.exit,
  };
  const observed = structuredClone(snapshot);
  observed.nativeStageRecords.at(-1).steps[13].outcome = outcome;
  const completed = structuredClone(observed);
  if (result.exit === null)
    completed.nativeStageRecords.at(-1).steps[13].readback = {
      attempt: step.attempts.length,
      stage: snapshot.observation.stage,
      membership: structuredClone(snapshot.nativeStageResources.membership),
    };
  await record.boardCodec.reconstructNativeStageBoard({
    header: record.header,
    steps: completed.nativeStageRecords.at(-1).steps,
  });
  boardRecord(invocation);
  assertOriginalNativeBoardResult(result, ctx);
  boardPrefixes(record, [observed, completed]);
  await record.boardStore.completeMemoryNativeStageBoard({ ...boardAuthority(record), outcome });
  boardRecord(invocation);
  assertOriginalNativeBoardResult(result, ctx);
  if (result.exit === null) record.boardResult = result;
  else record.compBoardResult = result;
}

export function readNativeStageBoardFailure(token, backend, invocation) {
  const record = boardRecord(invocation);
  if (record.stageToken !== token || record.backend !== backend || !record.boardFailure)
    throw preparationRefusal('original-board-failure');
  return readOriginalNativeBoardFailure(
    record.boardFailure.input,
    invocation,
    record.boardFailure.error
  );
}
export async function recordNativeStageBoardFailure(input, error) {
  const record = originalBoardRequest(input, 'write');
  const facts = readOriginalNativeBoardFailure(input, record.boardInvocation, error);
  const snapshot = record.backend.snapshot,
    step = snapshot.nativeStageRecords.at(-1).steps[13],
    attempt = step.attempts.at(-1);
  // A returned stdout is an immutable observed fact. A later interruption does
  // not rewrite it as a thrown remote write or invent a successful outcome.
  if (
    !attempt ||
    attempt.write !== null ||
    attempt.read !== null ||
    attempt.after !== null ||
    step.outcome !== null
  )
    return;
  if (record.boardFailure) throw preparationRefusal('board-failure-reentrant');
  record.boardFailure = { input, error };
  try {
    const recorded = structuredClone(snapshot);
    recorded.nativeStageRecords.at(-1).steps[13].attempts.at(-1).write = facts;
    const completed = structuredClone(recorded);
    completed.nativeStageRecords.at(-1).steps[13].outcome = {
      kind: 'exception',
      attempt: step.attempts.length,
      exit: null,
    };
    await record.boardCodec.reconstructNativeStageBoard({
      header: record.header,
      steps: completed.nativeStageRecords.at(-1).steps,
    });
    originalBoardRequest(input, 'write');
    readOriginalNativeBoardFailure(input, record.boardInvocation, error);
    if (canonicalRecordJson(snapshot) !== canonicalRecordJson(record.backend.snapshot))
      throw preparationRefusal('board-failure-current');
    boardPrefixes(record, [recorded, completed]);
    await record.boardStore.recordMemoryNativeStageBoardFailure(boardAuthority(record));
    originalBoardRequest(input, 'write');
    readOriginalNativeBoardFailure(input, record.boardInvocation, error);
  } finally {
    record.boardFailure = null;
  }
}

function assignNativeBoardItem(ctx, result) {
  const record = nativeStagePreparation.getStore();
  if (record) {
    assertNativeStageBoardContext(ctx);
    assertOriginalNativeBoardResult(result, ctx);
    const step = record.backend.snapshot.nativeStageRecords.at(-1).steps[13];
    if (
      record.boardResult !== result ||
      result.exit !== null ||
      step?.readback === null ||
      step?.outcome?.kind !== 'confirmed' ||
      result.itemId !== record.header.intent.itemId
    )
      throw preparationRefusal('board-result-assignment');
  }
  ctx.itemId = result.itemId;
  if (record) {
    record.assignedBoardItemDescriptor = Object.freeze(
      Object.getOwnPropertyDescriptor(ctx, 'itemId')
    );
    checkPreparation(record);
    checkOriginalStageSources(record);
  }
}

export async function beginNativeStageActorOuter(context) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.outerContext) throw preparationRefusal('original-actor-outer');
  checkPreparation(record);
  const runtime = await import('../../runtime.mjs');
  checkPreparation(record);
  runtime.assertNativeActorOuterContext(context);
  record.outerContext = context;
  record.assertOuterContext = runtime.assertNativeActorOuterContext;
  record.assertCandidateContext = runtime.assertNativeActorCandidateContext;
}
export function endNativeStageActorOuter(context) {
  const record = nativeStagePreparation.getStore();
  if (record?.outerContext === context) record.outerContext = null;
}

export function assertNativeStageActorReadBoundary({ projectDir, journalFile, identity, pending }) {
  const record = nativeStagePreparation.getStore();
  if (!record) return;
  checkPreparation(record);
  if (
    projectDir !== record.context.executor.worktree ||
    journalFile !== record.journalFile ||
    canonicalRecordJson(identity) !== canonicalRecordJson(record.actorIdentity) ||
    pending !== null
  )
    throw preparationRefusal('actor-journal-not-absent');
}
export async function suspendNativeStageActorCandidate(candidate) {
  const record = nativeStagePreparation.getStore();
  if (!record) return;
  checkPreparation(record);
  const { readActorFlushSourceData } = await import('../../runtime.mjs');
  checkPreparation(record);
  if (!record.outerContext) throw preparationRefusal('original-actor-outer');
  record.assertCandidateContext(candidate, record.outerContext);
  const source = readActorFlushSourceData(candidate);
  if (
    !source ||
    source.projectDir !== record.context.executor.worktree ||
    source.journalFile !== record.journalFile ||
    source.skipNetwork ||
    canonicalRecordJson(source.identity) !== canonicalRecordJson(record.actorIdentity) ||
    source.candidate.issue !== `#${record.context.issue}` ||
    record.candidate
  )
    throw preparationRefusal('original-actor-candidate');
  if (
    !source.timing ||
    source.timing.issue !== `#${record.context.issue}` ||
    canonicalRecordJson(source.timing.source) !== canonicalRecordJson(record.timing.legacy)
  ) {
    record.candidateFailure = preparationRefusal('complete-original-timing');
    throw record.candidateFailure;
  }
  record.candidate = candidate;
  record.source = source;
  record.ready({ kind: 'candidate' });
  await record.gate;
  checkPreparation(record);
  checkOriginalStageSources(record);
  if (!record.stageToken || nativeStageIntents.get(record.stageToken) !== record)
    throw preparationRefusal('durable-stage-intent-unavailable');
}

async function prepareNativeStageAtBoundary(ctx, capability, evaluation) {
  let record = null,
    running = null;
  try {
    assertNativeRuntimeRootAdaptersAbsent();
    const probe = await defaultProbeCompletion(ctx);
    const read = nativeFirstVisitProbes.get(probe);
    if (
      !read ||
      read.repository !== ctx.cfg.repo ||
      read.issue !== Number(ctx.issueArg) ||
      read.projectDir !== ctx.projectDir ||
      evaluation.guardInvocations.length === 0
    )
      throw preparationRefusal('complete-original-probe');
    const backend = ctx.revisionBackend;
    const context = {
      repository: ctx.cfg.repo,
      issue: Number(ctx.issueArg),
      executor: backend.observation.executor,
    };
    const checkRead = () => {
      if (readNativeRevisionStageBody({ ...context, projectDir: ctx.projectDir }) !== read.body)
        throw preparationRefusal('probe-authority-drift');
    };
    const { assertMemoryCapability } = await import('../criteria-revision/store.mjs');
    checkRead();
    assertMemoryCapability(backend, capability, context);
    const { currentSessionId, aiAppName, jsonlPath, projectDir } =
      await import('../../word-counter.mjs');
    checkRead();
    const actorIdentity = { provider: aiAppName(), sid: currentSessionId() };
    if (actorIdentity.sid !== context.executor.sessionId) throw preparationRefusal('actor-session');
    const { actorTimingStatePath } = await import('../actor-timing-state.mjs');
    checkRead();
    const { resolveMutationTarget } = await import('../mutation-context.mjs');
    checkRead();
    const { lstatSync } = await import('node:fs');
    checkRead();
    const journalFile = actorTimingStatePath(actorIdentity, ctx.projectDir) + '.flush.json';
    const target = resolveMutationTarget(journalFile, ctx.projectDir, ctx.projectDir);
    if (target.physical !== target.lexical) throw preparationRefusal('actor-journal-physical');
    try {
      lstatSync(journalFile);
      throw preparationRefusal('actor-journal-present');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    assertMemoryCapability(backend, capability, context);
    checkRead();
    const { readCanonicalTimingSource, readTimingCommentBody, readNativeTimingSourceData } =
      await import('../../gh-timing-comment.mjs');
    checkRead();
    const census = await readCanonicalTimingSource({
      repo: context.repository,
      issueNumber: context.issue,
    });
    checkRead();
    const legacyResult = await readTimingCommentBody({
      repo: context.repository,
      issueNumber: context.issue,
    });
    checkRead();
    const canonical = readNativeTimingSourceData(census),
      legacy = readNativeTimingSourceData(legacyResult);
    if (
      !canonical ||
      !legacy ||
      !['absent', 'found'].includes(census.status) ||
      legacyResult.status !== census.status
    )
      throw preparationRefusal('complete-original-timing');
    const legacyComments = JSON.parse(legacy.reads[0].response.stdout).comments;
    const censusComments = canonical.reads.flatMap(
      (pair) => pair.response.data.repository.issue.comments.nodes
    );
    if (
      !Array.isArray(legacyComments) ||
      canonicalRecordJson(legacyComments.map(({ id, body }) => ({ id, body }))) !==
        canonicalRecordJson(censusComments) ||
      (census.status === 'found' && legacyResult.body !== census.source.body)
    )
      throw preparationRefusal('complete-original-timing');
    const timing = { canonical, legacy };
    let ready, cancel, release;
    const readyPromise = new Promise((resolve) => {
      ready = resolve;
    });
    const gate = new Promise((resolve, reject) => {
      release = resolve;
      cancel = reject;
    });
    gate.catch(() => {}); // Cancellation may precede candidate; always join below.
    const identity = Object.freeze({});
    record = {
      identity,
      backend,
      context,
      capability,
      assertMemoryCapability,
      sagaContext: ctx,
      originalBody: read.body,
      originalContextDescriptors: Object.getOwnPropertyDescriptors(ctx),
      originalConfigDescriptors: Object.getOwnPropertyDescriptors(ctx.cfg),
      originalSnapshot: canonicalRecordJson(backend.snapshot),
      actorIdentity,
      journalFile,
      timing,
      actorEnvironment: {
        githubActor: process.env.GITHUB_ACTOR ?? null,
        user: process.env.USER ?? null,
      },
      gate,
      ready,
      cancel,
      release,
      cancelled: false,
      candidate: null,
      source: null,
      evaluation,
      nativeRoots: { currentSessionId, aiAppName, jsonlPath, projectDir },
      originalLinked: canonicalRecordJson(
        validateGovernedLinkedPlan({ body: read.body, projectDir: ctx.projectDir })
      ),
    };
    nativeStagePreparations.set(identity, record);
    running = nativeStagePreparation.run(record, () => defaultEmitPhasePairRows(ctx));
    const settled = running.then(
      () => ({ kind: 'settled' }),
      (error) => ({ kind: 'failed', error })
    );
    const first = await Promise.race([readyPromise, settled]);
    checkPreparation(record);
    if (first.kind !== 'candidate') {
      if (record.candidateFailure) throw record.candidateFailure;
      throw first.error ?? preparationRefusal('actor-candidate-unavailable');
    }
    // The same original emitter is suspended before its first mutation. Read
    // the full native REST resources now; a timing-only or partial census cannot
    // seed the immutable stage header or the independent current resource set.
    try {
      const { readNativeStageCommentCensus, readNativeStageCommentCensusData } =
        await import('./transition-commit.mjs');
      checkPreparation(record);
      const comments = await readNativeStageCommentCensus({
        repository: context.repository,
        issue: context.issue,
        projectDir: ctx.projectDir,
      });
      checkPreparation(record);
      const commentRead = readNativeStageCommentCensusData(comments);
      if (
        !commentRead ||
        canonicalRecordJson(
          comments.map((comment) => ({ id: comment.node_id, body: comment.body }))
        ) !== canonicalRecordJson(censusComments)
      )
        throw preparationRefusal('complete-original-comments');
      record.originalComments = { read: commentRead, comments };
    } catch {
      throw preparationRefusal('complete-original-comments');
    }
    try {
      const { readNativeStageProjectItem, readNativeStageProjectItemData } =
        await import('../../../gh/lib/wave-admission.mjs');
      checkPreparation(record);
      const cfg = evaluation.localReads?.configuration?.value;
      if (
        !cfg ||
        cfg.repo !== context.repository ||
        !cfg.projectId ||
        !cfg.kanbanFieldId ||
        !cfg.kanbanOptionDevelop ||
        !cfg.kanbanOptionTest
      )
        throw preparationRefusal('complete-original-item');
      const input = {
        repo: context.repository,
        issueNumber: context.issue,
        projectId: cfg.projectId,
      };
      const item = await readNativeStageProjectItem(input);
      checkPreparation(record);
      const itemReads = readNativeStageProjectItemData(item);
      const { readNativeStageItemRead } = await import('../criteria-revision/policy.mjs');
      checkPreparation(record);
      const currentItem = await readNativeStageItemRead(input);
      checkPreparation(record);
      const { assertNativeStageSourceItem } =
        await import('../criteria-revision/stage-execution.mjs');
      checkPreparation(record);
      if (
        !itemReads ||
        canonicalRecordJson(currentItem.source) !== canonicalRecordJson(itemReads) ||
        canonicalRecordJson(currentItem.config) !== canonicalRecordJson(cfg) ||
        canonicalRecordJson(currentItem.configuration) !==
          canonicalRecordJson(evaluation.localReads.configuration.sources)
      )
        throw preparationRefusal('complete-original-item');
      assertNativeStageSourceItem({
        config: cfg,
        item,
        assignmentReads: evaluation.assignmentReads,
      });
      record.originalItem = { reads: itemReads, item };
    } catch {
      throw preparationRefusal('complete-original-item');
    }
    try {
      const { loadProjectFieldDefs, loadProjectFieldEvents, readProjectFieldSourceData } =
        await import('../../project-fields.mjs');
      checkPreparation(record);
      const definitions = loadProjectFieldDefs(ctx.projectDir),
        bindings = loadProjectFieldEvents(ctx.projectDir);
      const sources = {
        definitions: readProjectFieldSourceData(definitions),
        bindings: readProjectFieldSourceData(bindings),
      };
      if (
        !Array.isArray(definitions) ||
        !bindings ||
        typeof bindings !== 'object' ||
        Array.isArray(bindings) ||
        Object.values(sources).some(
          (source) => !source || source.directory !== ctx.projectDir || !source.reads.length
        )
      )
        throw preparationRefusal('complete-original-fields');
      record.originalFields = sources;
      checkPreparation(record);
      record.fieldValues = { definitions, bindings };
    } catch {
      throw preparationRefusal('complete-original-fields');
    }
    try {
      const { buildContext } = await import('../../runtime.mjs');
      checkPreparation(record);
      const native = buildContext(['status']);
      if (
        native.projectDir !== ctx.projectDir ||
        native.SKIP_NETWORK ||
        native.statePath !== record.source.statePath ||
        canonicalRecordJson(native.cfg) !==
          canonicalRecordJson(evaluation.localReads.configuration.value)
      )
        throw preparationRefusal('complete-original-local');
      const { activeTaskPath, legacyPathFor } = await import('../../paths.mjs');
      checkPreparation(record);
      const { markerPathFor, validateWordCursor } = await import('../../word-counter.mjs');
      checkPreparation(record);
      const { loadState, deriveRecordedState } = await import('../../state.mjs');
      checkPreparation(record);
      const { validateTimingQueue } = await import('../../queue.mjs');
      checkPreparation(record);
      const { readExactSessionBinding } = await import('../mutation-context.mjs');
      checkPreparation(record);
      record.localPaths = {
        activeTask: activeTaskPath(actorIdentity.sid, ctx.projectDir),
        actorTiming: actorTimingStatePath(actorIdentity, ctx.projectDir),
        actorFlush: journalFile,
        wordCursor: markerPathFor(actorIdentity.sid, ctx.projectDir),
        trackerState: native.statePath,
        queue: native.queuePath,
      };
      const local = Object.fromEntries(
        Object.entries(record.localPaths).map(([key, file]) => [
          key,
          readFixedStageLocal(file, ctx.projectDir),
        ])
      );
      record.legacyAbsences = [];
      // Do not silently project a selected legacy source as absent current data.
      // A legacy-selected local resource needs its distinct read/write prefix.
      for (const key of ['trackerState', 'queue'])
        if (local[key] === null) {
          const legacy = legacyPathFor(record.localPaths[key]);
          if (legacy && legacy !== record.localPaths[key]) {
            if (readFixedStageLocal(legacy, ctx.projectDir) !== null)
              throw preparationRefusal('complete-original-local');
            record.legacyAbsences.push(legacy);
          }
        }
      if (local.actorFlush !== null || local.activeTask === null)
        throw preparationRefusal('complete-original-local');
      if (local.queue !== null) validateTimingQueue(JSON.parse(local.queue.bytes));
      const cursor =
        local.wordCursor === null
          ? { line: 0, words: 0, wordsFull: 0, task: null }
          : validateWordCursor(JSON.parse(local.wordCursor.bytes), actorIdentity);
      const state = deriveRecordedState({
        sharedBytes: local.trackerState?.bytes ?? null,
        identity: actorIdentity,
        actorBytes: local.actorTiming?.bytes ?? null,
        activeBytes: local.activeTask.bytes,
        cursor:
          local.actorTiming === null ? { words: cursor.words, wordsFull: cursor.wordsFull } : null,
      });
      const binding = readExactSessionBinding(ctx.projectDir);
      if (
        !binding ||
        binding.issueNumber !== context.issue ||
        binding.worktreePath !== context.executor.worktree ||
        binding.worktreeBranch !== context.executor.branch ||
        !state.entryStartTs ||
        state.active !== `#${context.issue}` ||
        canonicalRecordJson(loadState(native.statePath)) !== canonicalRecordJson(state) ||
        canonicalRecordJson(record.candidate.previous) !==
          canonicalRecordJson({
            entryStartTs: state.entryStartTs ?? null,
            lastWordMarker: state.lastWordMarker ?? 0,
            lastFullWordMarker: state.lastFullWordMarker ?? 0,
          }) ||
        (record.candidate.cursor &&
          canonicalRecordJson(record.candidate.cursor.before) !==
            canonicalRecordJson({
              line: cursor.line,
              words: cursor.words,
              wordsFull: cursor.wordsFull,
            }))
      )
        throw preparationRefusal('complete-original-local');
      record.originalLocal = local;
      record.originalActorState = {
        state: structuredClone(state),
        marker: { line: cursor.line, words: cursor.words, wordsFull: cursor.wordsFull },
      };
      checkPreparation(record);
    } catch {
      throw preparationRefusal('complete-original-local');
    }
    try {
      const { observeRevision } = await import('../criteria-revision/engine.mjs');
      checkPreparation(record);
      const { readMemoryNativeHistory, readMemoryPlanJournal } =
        await import('../criteria-revision/store.mjs');
      checkPreparation(record);
      const { reconstructNativeHistory } =
        await import('../criteria-revision/source-correction.mjs');
      checkPreparation(record);
      const observed = await observeRevision({ context, deps: backend });
      checkPreparation(record);
      const history = readMemoryNativeHistory(backend);
      if (!history.order.length || readMemoryPlanJournal(backend, context) !== null)
        throw preparationRefusal('complete-original-history');
      const reconstructed = await reconstructNativeHistory({
        history,
        chain: observed.chain,
        backend,
        observation: backend.observation,
      });
      checkPreparation(record);
      if (
        reconstructed?.status !== 'complete' ||
        reconstructed.approved !== true ||
        !reconstructed.planning ||
        !reconstructed.currentContract ||
        canonicalRecordJson(readMemoryNativeHistory(backend)) !== canonicalRecordJson(history)
      )
        throw preparationRefusal('complete-original-history');
      // Retain original records, never a saved ready bit. Header replay must
      // independently fold these same predecessors again before admitting it.
      record.originalHistory = { history, chain: observed.chain };
      const {
        reconstructNativeStageGuardEvidence,
        deriveRecordedStageRemoteResources,
        assertRecordedStageActorCandidate,
        reconstructNativeStageHeader,
      } = await import('../criteria-revision/stage-execution.mjs');
      checkPreparation(record);
      checkOriginalStageSources(record);
      record.originalGuardInput = {
        observation: observed.observation,
        definitions: reconstructed.currentContract.definitions,
        proofs: history.proofs,
        lifecycleSources: backend.snapshot.lifecycleSources,
        sources: {
          schema: 'aitm.native-stage-sources/v1',
          repository: context.repository,
          projectDir: context.executor.worktree,
          homeDir: homedir(),
          sessionId: context.executor.sessionId,
          ...evaluation.localReads,
        },
        invocations: evaluation.guardInvocations,
        gitReads: evaluation.guardReads,
      };
      record.originalGuardEvidence = await reconstructNativeStageGuardEvidence(
        record.originalGuardInput
      );
      checkPreparation(record);
      checkOriginalStageSources(record);
      const cfg = evaluation.localReads.configuration.value;
      const resources = await deriveRecordedStageRemoteResources({
        observation: observed.observation,
        lifecycleSources: record.originalGuardInput.lifecycleSources,
        retained: backend.comments,
        projectId: cfg.projectId,
        kanbanFieldId: cfg.kanbanFieldId,
      });
      checkPreparation(record);
      checkOriginalStageSources(record);
      const actual = {
        comments: record.originalComments.comments.map((comment) => ({
          id: String(comment.id),
          nodeId: comment.node_id,
          bytes: JSON.stringify(comment),
        })),
        membership: {
          projectId: cfg.projectId,
          itemId: record.originalItem.item.id,
          bytes: canonicalRecordJson(record.originalItem.item),
        },
      };
      if (canonicalRecordJson(resources) !== canonicalRecordJson(actual))
        throw preparationRefusal('complete-original-resources');
      record.originalResources = {
        schema: 'aitm.native-stage-resources/v1',
        ...resources,
        local: structuredClone(record.originalLocal),
      };
      const { parseTimingRow, timingTimestampOffsetMin } = await import('../timing-row-reader.mjs');
      checkPreparation(record);
      checkOriginalStageSources(record);
      const offsetMin = timingTimestampOffsetMin(parseTimingRow(record.candidate.row).ts);
      await assertRecordedStageActorCandidate({
        capture: record.source,
        ...record.originalActorState,
        identity: record.actorIdentity,
        offsetMin,
      });
      checkPreparation(record);
      checkOriginalStageSources(record);
      record.originalActor = {
        identity: structuredClone(record.actorIdentity),
        candidateBytes: JSON.stringify(record.candidate),
        capture: structuredClone(record.source),
        offsetMin,
        environment: structuredClone(record.actorEnvironment),
      };
      const { projectCollectedRevisionObservation } =
        await import('../criteria-revision/proposal.mjs');
      checkPreparation(record);
      checkOriginalStageSources(record);
      const cursor = projectCollectedRevisionObservation({
        observation: reconstructed.observation,
        chain: observed.chain,
        currentContract: reconstructed.currentContract,
      });
      if (canonicalRecordJson(cursor) !== canonicalRecordJson(observed.observation))
        throw preparationRefusal('complete-original-header-predecessor');
      const { deriveRecordedTransitionActor } = await import('./transition-commit.mjs');
      checkPreparation(record);
      checkOriginalStageSources(record);
      const { deriveGuardPhasePolicy } = await import('./guard-execution.mjs');
      checkPreparation(record);
      checkOriginalStageSources(record);
      const unsigned = {
        revisionEventHead: observed.chain.head,
        predecessor: history.order.at(-1).id,
        scope: {
          repository: context.repository,
          issue: context.issue,
          domain: cursor.writerDomain,
          executor: cursor.executor,
        },
        intent: {
          source: 'develop',
          target: 'test',
          transitionId: ctx.transitionId,
          actor: deriveRecordedTransitionActor(record.actorEnvironment),
          provider: record.actorIdentity.provider,
          sessionId: record.actorIdentity.sid,
          projectId: cfg.projectId,
          itemId: record.originalItem.item.id,
          statusFieldId: cfg.kanbanFieldId,
          sourceOptionId: cfg.kanbanOptionDevelop,
          targetOptionId: cfg.kanbanOptionTest,
          tailProfile: 'task-owner',
        },
        guardCapture: {
          sources: record.originalGuardInput.sources,
          assignmentReads: evaluation.assignmentReads,
          gitReads: evaluation.guardReads,
          lifecycleSources: record.originalGuardInput.lifecycleSources,
          phasePolicy: deriveGuardPhasePolicy({ fromState: 'develop', toState: 'test' }),
          invocations: evaluation.guardInvocations,
          evaluatedAt: evaluation.evaluatedAt,
        },
        original: {
          observation: cursor,
          timing: record.timing,
          transitionComments: record.originalComments,
          membership: record.originalItem,
          local: record.originalLocal,
          fieldSources: record.originalFields,
          resources: record.originalResources,
          actor: record.originalActor,
        },
      };
      record.header = {
        id: 'sha256:' + createHash('sha256').update(canonicalRecordJson(unsigned)).digest('hex'),
        ...unsigned,
      };
      record.headerValidation = await reconstructNativeStageHeader({
        header: record.header,
        cursor: reconstructed.observation,
        currentContract: reconstructed.currentContract,
        planning: reconstructed.planning,
        proofs: history.proofs,
        chain: observed.chain,
        predecessor: history.order.at(-1).id,
        retained: backend.comments,
      });
      checkPreparation(record);
      checkOriginalStageSources(record);
    } catch (error) {
      if (error.preparationReason === 'complete-original-current-sources') throw error;
      throw preparationRefusal('complete-original-history');
    }
    checkPreparation(record);
    checkOriginalStageSources(record);
    const initialStageJournal = {
      schema: 'aitm.native-stage/v1',
      header: record.header,
      steps: [
        {
          ordinal: 1,
          kind: 'actor-journal-prepare',
          previous: record.header.id,
          intent: { journalBytes: record.headerValidation.actorJournalBytes },
          readback: null,
        },
      ],
    };
    const expected = JSON.parse(record.originalSnapshot);
    // Current resources and immutable origin must be independent, as in the store.
    expected.nativeStageRecords = structuredClone([initialStageJournal]);
    expected.nativeStageResources = structuredClone(record.originalResources);
    expected.nativeOrder.push({
      kind: 'stage',
      id: record.header.id,
      revisionEventHead: record.header.revisionEventHead,
      predecessor: record.header.predecessor,
    });
    // Only the exact sealed first-intent persistence prefix may accompany the
    // still-suspended original invocation. This does not permit any leaf effect.
    record.firstIntentSnapshot = canonicalRecordJson(expected);
    const effected = structuredClone(expected);
    effected.nativeStageResources.local.actorFlush = {
      bytes: record.headerValidation.actorJournalBytes,
    };
    const readback = structuredClone(effected);
    readback.nativeStageRecords[0].steps[0].readback = {
      file: record.journalFile,
      bytes: record.headerValidation.actorJournalBytes,
    };
    record.actorPrefixes = [canonicalRecordJson(effected), canonicalRecordJson(readback)];
    const token = Object.freeze({});
    nativeStageIntents.set(token, record);
    try {
      const { persistMemoryNativeStage } = await import('../criteria-revision/store.mjs');
      checkPreparation(record);
      checkOriginalStageSources(record);
      await persistMemoryNativeStage({
        backend: record.backend,
        capability,
        context: record.context,
        token,
      });
      checkPreparation(record);
      checkOriginalStageSources(record);
      record.stageToken = token;
      record.release();
      await running;
      checkPreparation(record);
      checkOriginalStageSources(record);
      const completed = record.backend.snapshot.nativeStageRecords.at(-1);
      if (
        completed.steps.length === 12 &&
        completed.steps.every((step) => step.readback !== null)
      ) {
        record.entryActive = true;
        try {
          return await nativeStagePreparation.run(record, () =>
            continueMoveStateAfterPhases(ctx, probe, false, {
              stampEntryMarkers: defaultStampEntryMarkers,
              runStatusWrite: defaultRunStatusWrite,
              writeSentinel: defaultWriteSentinel,
              runPostCommitTail: defaultRunPostCommitTail,
              writeTransitionCommit: defaultWriteTransitionCommit,
              rollbackRecordedState: defaultRollbackRecordedState,
              assertBoardMarkerConsistent: defaultAssertBoardMarkerConsistent,
            })
          );
        } finally {
          record.entryActive = false;
        }
      }
    } finally {
      nativeStageIntents.delete(token);
    }
    // Actor journal and timing have fixed leaves. The original emitter catches
    // the following checkpoint refusal; that cannot authorize the next saga step.
    throw preparationRefusal('durable-stage-effect-unavailable');
  } catch (error) {
    // Stop and join the original emitter before taking the final report snapshot;
    // keep its actual private holder alive until reporting and finally finish.
    if (record) {
      record.cancelled = true;
      record.cancel(preparationRefusal('preparation-cancelled'));
      if (running) await running.catch(() => {});
    }
    let partial = {
      itemId: '',
      boardMoved: false,
      sentinelPresent: false,
      transitionCommitPresent: false,
      transitionCommitId: null,
      progressVerified: !record,
    };
    if (record?.header) {
      const input = {
        backend: record.backend,
        capability: record.capability,
        context: record.context,
        holder: record.identity,
      };
      record.partialInput = input;
      nativeStagePartialInputs.set(input, record);
      try {
        const store = await import('../criteria-revision/store.mjs');
        partial = await store.readMemoryNativeStagePartialFacts(input);
      } catch {
        partial.progressVerified = false;
      } finally {
        nativeStagePartialInputs.delete(input);
        record.partialInput = null;
      }
    }
    return {
      exit: 4,
      tail: { failures: [] },
      phase: 'authority',
      ...partial,
      code: 'revision-authority-unavailable',
      preparationReason: error.preparationReason ?? 'native-source-unavailable',
    };
  } finally {
    if (record) {
      record.cancelled = true;
      record.cancel(preparationRefusal('preparation-cancelled'));
      if (running) await running.catch(() => {});
      nativeStagePreparations.delete(record.identity);
    }
  }
}

// @story #1855 — private original tail invocations, never caller-minted ports.
const originalTailInputs = new WeakMap();
const originalTailLeaves = new WeakMap();
function assertTailEntry(value, expected, original) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype)
    throw preparationRefusal('original-tail-steps');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== 3 ||
    ['name', 'scope', 'fn'].some((key) => {
      const a = descriptors[key],
        b = original?.[key];
      return (
        !a ||
        !Object.hasOwn(a, 'value') ||
        !a.enumerable ||
        !a.writable ||
        !a.configurable ||
        a.value !== expected[key] ||
        (b &&
          (a.value !== b.value ||
            a.enumerable !== b.enumerable ||
            a.writable !== b.writable ||
            a.configurable !== b.configurable))
      );
    })
  )
    throw preparationRefusal('original-tail-steps');
  return descriptors;
}
function captureOriginalTailEntries() {
  const expected = [
    ['dispatchOnEnterActions', 'project', nativeTailCache.dispatchOnEnterActions],
    ['refreshKanbanStateCache', 'project', nativeTailCache.refreshKanbanStateCache],
    ['emitFullAutoReviewAudit', 'issue', nativeTailAudit.emitFullAutoReviewAudit],
    ['unparkDoneDependents', 'project', nativeTailCache.unparkDoneDependents],
    ['emitOutOfBandAudit', 'issue', nativeTailAudit.emitOutOfBandAudit],
    ['syncTrackerState', 'session', nativeTailCache.syncTrackerState],
    ['syncEventFields', 'issue', nativeTailCache.syncEventFields],
    ['endTaskTracking', 'session', nativeTailCache.endTaskTracking],
  ];
  if (!Object.isFrozen(DEFAULT_TAIL_STEPS) || DEFAULT_TAIL_STEPS.length !== expected.length)
    throw preparationRefusal('original-tail-steps');
  return expected.map(([name, scope, fn], index) => {
    const value = DEFAULT_TAIL_STEPS[index],
      facts = { name, scope, fn };
    return { value, facts, descriptors: assertTailEntry(value, facts) };
  });
}
function tailCurrent(input, ctx) {
  const record = originalTailInputs.get(input);
  if (!record || record.tailInput !== input || record.sagaContext !== ctx || !record.tailRunning)
    throw preparationRefusal('original-tail-invocation');
  assertNativeStageTransitionContext(ctx);
  const returned = record.transitionCommentReturned;
  if (
    !returned ||
    ctx.transitionCommit !== returned.result ||
    canonicalRecordJson(returned.result) !== returned.bytes
  )
    throw preparationRefusal('original-tail-comment');
  record.transitionCommentCode.assertOriginalNativeTransitionResult(
    returned.input,
    ctx,
    returned.result
  );
  if (
    Object.hasOwn(ctx, 'deps') ||
    Object.hasOwn(ctx, 'transitionCommitRepairRequested') ||
    ctx.tailProfile !== 'task-owner'
  )
    throw preparationRefusal('original-tail-context');
  for (let index = 0; index < record.tailEntries.length; index++) {
    const original = record.tailEntries[index],
      value = DEFAULT_TAIL_STEPS[index];
    if (value !== original.value) throw preparationRefusal('original-tail-steps');
    assertTailEntry(value, original.facts, original.descriptors);
  }
  return record;
}
export function beginNativeStageTailSequence(input, ctx, steps) {
  const record = originalTailInputs.get(input);
  if (!record || record.sagaContext !== ctx || !record.tailCallWindow || record.tailStarted)
    throw preparationRefusal('original-tail-sequence-window');
  record.tailCallWindow = false;
  record.tailStarted = true;
  tailCurrent(input, ctx);
  if (steps !== DEFAULT_TAIL_STEPS) throw preparationRefusal('original-tail-sequence');
}
export function assertNativeStageTailSequenceCurrent(input, ctx, steps) {
  const record = tailCurrent(input, ctx);
  if (!record.tailStarted || steps !== DEFAULT_TAIL_STEPS)
    throw preparationRefusal('original-tail-sequence');
}
function tailLeafCurrent(input, ctx) {
  const leaf = originalTailLeaves.get(input);
  if (!leaf || leaf.ctx !== ctx || leaf.record.tailLeaf !== input)
    throw preparationRefusal('original-tail-leaf');
  tailCurrent(leaf.sequence, ctx);
  return leaf;
}
export function beginNativeStageTailDispatch(input, ctx) {
  const leaf = originalTailLeaves.get(input);
  if (!leaf || leaf.ctx !== ctx || leaf.phase !== 'call')
    throw preparationRefusal('original-tail-dispatch-window');
  leaf.phase = 'running';
  tailLeafCurrent(input, ctx);
}
export function assertNativeStageTailDispatchModule(input, ctx, module) {
  const leaf = tailLeafCurrent(input, ctx);
  if (
    leaf.phase !== 'running' ||
    module !== leaf.record.tailStates ||
    module.STATES !== leaf.states ||
    module.STATES.test !== leaf.target ||
    leaf.target.onEnter !== leaf.actions ||
    !Object.isFrozen(leaf.actions) ||
    leaf.actions.length !== 0
  )
    throw preparationRefusal('original-tail-dispatch-source');
}
export function readNativeStageTailDispatchIntent(token, backend, invocation, context) {
  const leaf = originalTailLeaves.get(invocation);
  if (!leaf) throw preparationRefusal('original-tail-leaf');
  const { record } = leaf;
  tailLeafCurrent(invocation, record.sagaContext);
  if (token !== record.stageToken || backend !== record.backend || context !== record.context)
    throw preparationRefusal('original-tail-token');
  return structuredClone({ header: record.header, returned: leaf.phase === 'returned' });
}
function tailAuthority(record, invocation) {
  return {
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation,
  };
}
export async function runNativeStageTailStep(input, ctx, step) {
  const record = tailCurrent(input, ctx);
  if (
    record.tailNext === 1 &&
    step === DEFAULT_TAIL_STEPS[1] &&
    step.fn === nativeTailCache.refreshKanbanStateCache
  )
    return runNativeStageCache(input, ctx, step);
  if (
    !record.tailStarted ||
    record.tailLeaf ||
    record.tailNext !== 0 ||
    step !== DEFAULT_TAIL_STEPS[0] ||
    step.fn !== originalTailDispatch
  ) {
    // All later original leaves retain their existing fail-closed host fence.
    assertRevisionStageHostEffect();
    throw preparationRefusal('original-tail-order');
  }
  const invocation = Object.freeze({});
  const leaf = {
    record,
    ctx,
    sequence: input,
    phase: 'new',
    states: record.tailStates.STATES,
    target: record.tailStates.STATES.test,
    actions: record.tailStates.STATES.test.onEnter,
  };
  originalTailLeaves.set(invocation, leaf);
  record.tailLeaf = invocation;
  let acquired = false,
    store;
  try {
    store = await import('../criteria-revision/store.mjs');
    tailLeafCurrent(invocation, ctx);
    await store.acquireMemoryNativeStageTailDispatch(tailAuthority(record, invocation));
    acquired = true;
    tailLeafCurrent(invocation, ctx);
    const before = record.backend.snapshot,
      journal = before.nativeStageRecords.at(-1);
    if (journal.steps.length !== 16 || journal.steps.some((step) => step.readback === null))
      throw preparationRefusal('tail-dispatch-before');
    const stepData = {
      ordinal: 17,
      kind: 'tail-dispatch',
      previous: hashNativeStep(journal.steps[15]),
      intent: { target: 'test', actions: [] },
      readback: null,
    };
    const intended = structuredClone(before);
    intended.nativeStageRecords.at(-1).steps.push(structuredClone(stepData));
    const completed = structuredClone(intended);
    completed.nativeStageRecords.at(-1).steps[16].readback = {
      actions: [],
      resources: structuredClone(before.nativeStageResources),
      body: structuredClone(before.observation.body),
      stage: before.observation.stage,
    };
    record.tailPrefixes = [intended, completed].map(canonicalRecordJson);
    await store.persistMemoryNativeStageTailDispatch({
      ...tailAuthority(record, invocation),
      step: stepData,
    });
    tailLeafCurrent(invocation, ctx);
    store.assertMemoryNativeStageTailDispatchIntent(tailAuthority(record, invocation));
    leaf.phase = 'call';
    const result = await originalTailDispatch(ctx, invocation);
    tailLeafCurrent(invocation, ctx);
    nativeTailCache.assertOriginalNativeTailDispatchReturn(invocation, ctx, result);
    if (leaf.phase !== 'running') throw preparationRefusal('original-tail-return');
    leaf.phase = 'returned';
    await store.completeMemoryNativeStageTailDispatch(tailAuthority(record, invocation));
    tailLeafCurrent(invocation, ctx);
    if (canonicalRecordJson(record.backend.snapshot) !== canonicalRecordJson(completed))
      throw preparationRefusal('tail-dispatch-completion');
    record.tailNext = 1;
  } finally {
    if (acquired)
      store.releaseMemoryNativeStageTailDispatch({
        backend: record.backend,
        token: record.stageToken,
        invocation,
      });
    originalTailLeaves.delete(invocation);
    record.tailLeaf = null;
  }
}
async function runNativeStageTail(ctx, originalFunction) {
  const record = assertNativeStageTransitionContext(ctx);
  if (
    originalFunction !== defaultRunPostCommitTail ||
    record.tailInput ||
    record.tailStarted ||
    !record.transitionCommentReturned ||
    record.backend.snapshot.nativeStageRecords.at(-1).steps.length !== 16
  )
    throw preparationRefusal('original-tail-entry');
  const input = Object.freeze({});
  record.tailInput = input;
  record.tailRunning = true;
  record.tailNext = 0;
  record.tailEntries = captureOriginalTailEntries();
  originalTailInputs.set(input, record);
  try {
    tailCurrent(input, ctx);
    const states = await import('../../states/index.mjs');
    tailCurrent(input, ctx);
    if (
      !Object.isFrozen(states.STATES) ||
      !Object.isFrozen(states.STATES.test) ||
      !Object.isFrozen(states.STATES.test.onEnter) ||
      states.STATES.test.onEnter.length !== 0
    )
      throw preparationRefusal('original-tail-dispatch-source');
    record.tailStates = states;
    record.tailCallWindow = true;
    return await originalFunction(ctx, DEFAULT_TAIL_STEPS, input);
  } finally {
    record.tailRunning = false;
    record.tailCallWindow = false;
    originalTailInputs.delete(input);
    record.tailInput = null;
  }
}

// Compensation retains the actual failed board return and lexical recording
// program. Public DATA can neither register an invocation nor select a sink.
export function assertNativeStageCompensationContext(ctx, priorState) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.sagaContext !== ctx || priorState !== 'develop')
    throw preparationRefusal('original-compensation-context');
  checkPreparation(record);
  checkOriginalStageSources(record);
  assertOriginalNativeBoardResult(record.compBoardResult, ctx);
  const journal = record.backend.snapshot.nativeStageRecords.at(-1);
  if (
    record.compBoardResult.exit !== 7 ||
    journal.steps.length !== 14 ||
    journal.steps[13].outcome?.kind !== 'unconfirmed' ||
    journal.steps[13].readback !== null
  )
    throw preparationRefusal('original-compensation-prefix');
}
function compensationRecord(invocation) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.compInvocation !== invocation)
    throw preparationRefusal('original-compensation-invocation');
  assertOriginalNativeCompensationInvocation(invocation, record.sagaContext);
  assertNativeStageCompensationContext(record.sagaContext, 'develop');
  return record;
}
export async function beginNativeStageCompensation(ctx, invocation) {
  const record = nativeStagePreparation.getStore();
  assertNativeStageCompensationContext(ctx, 'develop');
  assertOriginalNativeCompensationInvocation(invocation, ctx);
  if (record.compInvocation || record.backend.snapshot.nativeStageRecords.at(-1).compensation)
    throw preparationRefusal('compensation-reentrant');
  record.compInvocation = invocation;
  try {
    const store = await import('../criteria-revision/store.mjs');
    compensationRecord(invocation);
    const codec = await import('../criteria-revision/stage-execution.mjs');
    compensationRecord(invocation);
    const recording = await import('../state-recording.mjs');
    compensationRecord(invocation);
    record.compStore = store;
    record.compCodec = codec;
    record.compRecordingModule = recording;
    await store.acquireMemoryNativeStageCompensation(compensationAuthority(record));
    record.compCustodyReady = true;
    compensationRecord(invocation);
  } catch (error) {
    if (record.compStore)
      record.compStore.releaseMemoryNativeStageCompensation({
        backend: record.backend,
        token: record.stageToken,
        invocation,
      });
    record.compCustodyReady = false;
    record.compInvocation = null;
    throw error;
  }
}
function compensationAuthority(record) {
  return {
    backend: record.backend,
    capability: record.capability,
    context: record.context,
    token: record.stageToken,
    invocation: record.compInvocation,
  };
}
export function endNativeStageCompensation(ctx, invocation) {
  const record = nativeStagePreparation.getStore();
  if (!record || record.sagaContext !== ctx || record.compInvocation !== invocation)
    throw preparationRefusal('original-compensation-release');
  record.compStore.releaseMemoryNativeStageCompensation({
    backend: record.backend,
    token: record.stageToken,
    invocation,
  });
  record.compCustodyReady = false;
  record.compInvocation = null;
  record.compOperation = null;
}
export async function readNativeStageCompensationBody(ctx, invocation, request) {
  const record = compensationRecord(invocation);
  if (
    record.sagaContext !== ctx ||
    canonicalRecordJson(request) !==
      canonicalRecordJson({
        file: 'gh',
        args: [
          'issue',
          'view',
          String(record.context.issue),
          '-R',
          record.context.repository,
          '--json',
          'body',
        ],
      })
  )
    throw preparationRefusal('original-compensation-read');
  const result = { stdout: JSON.stringify({ body: record.backend.observation.body.bytes }) };
  record.compBodyRead = { result, descriptors: Object.getOwnPropertyDescriptors(result) };
  return result;
}
export function assertNativeStageRecordingInput(input, invocation) {
  const record = compensationRecord(invocation);
  assertOriginalNativeCompensationRecordingInput(input, invocation);
  if (
    input.issueNumber !== String(record.context.issue) ||
    input.repo !== record.context.repository ||
    input.target !== 'develop' ||
    typeof input.body !== 'string' ||
    typeof input.bodyBefore !== 'string'
  )
    throw preparationRefusal('original-compensation-recording');
  return record;
}
export function readNativeStageCompensationIntent(token, backend, invocation) {
  const record = compensationRecord(invocation);
  if (record.stageToken !== token || record.backend !== backend)
    throw preparationRefusal('original-compensation-token');
  return {
    header: structuredClone(record.header),
    compensation: record.compTemplate ? structuredClone(record.compTemplate) : null,
  };
}
export function readNativeStageCompensationOperation(token, backend, invocation) {
  const record = compensationRecord(invocation);
  if (record.stageToken !== token || record.backend !== backend || !record.compOperation)
    throw preparationRefusal('original-compensation-operation');
  record.compRecordingModule.assertOriginalNativeRecordingOperation(
    record.compInput,
    invocation,
    record.compOperation
  );
  return structuredClone(record.compOperation);
}
export function readNativeStageCompensationFailure(token, backend, invocation) {
  const record = compensationRecord(invocation);
  if (record.stageToken !== token || record.backend !== backend || !record.compFailure)
    throw preparationRefusal('original-compensation-failure');
  const { error, bytes } = record.compFailure;
  const facts = nativeCompensationError(error);
  if (canonicalRecordJson(facts) !== bytes)
    throw preparationRefusal('original-compensation-failure-changed');
  return facts;
}
function nativeCompensationError(error) {
  if (!error || Object.getPrototypeOf(error) !== Error.prototype)
    throw preparationRefusal('original-compensation-error');
  const d = Object.getOwnPropertyDescriptors(error);
  if (
    Reflect.ownKeys(d).some((key) => !['stack', 'message', 'name', 'code'].includes(key)) ||
    ['message', 'name', 'code'].some((key) => d[key] && !Object.hasOwn(d[key], 'value')) ||
    typeof d.message?.value !== 'string'
  )
    throw preparationRefusal('original-compensation-error');
  const facts = {
    kind: 'threw',
    name: d.name?.value ?? 'Error',
    message: d.message.value,
    code: d.code?.value ?? null,
  };
  canonicalRecordJson(facts);
  return facts;
}
export async function executeNativeStateRecordingOperation(input, invocation, operation) {
  const record = assertNativeStageRecordingInput(input, invocation);
  record.compRecordingModule.assertOriginalNativeRecordingOperation(input, invocation, operation);
  if (record.compOperation) throw preparationRefusal('compensation-operation-reentrant');
  record.compInput = input;
  record.compOperation = operation;
  try {
    if (operation.kind === 'warn') {
      compensationRecord(invocation);
      process.stderr.write(operation.message + '\n');
      return;
    }
    if (!record.compTemplate) {
      const { readLastKnownState } = await import('../../gh-timing-comment.mjs');
      assertNativeStageRecordingInput(input, invocation);
      const journal = record.backend.snapshot.nativeStageRecords.at(-1);
      record.compTemplate = {
        schema: 'aitm.native-compensation/v1',
        previous: hashNativeStep(journal.steps[13]),
        intent: { priorState: 'develop', stateTs: readLastKnownState(input.body).ts },
        attempts: [],
        readback: null,
        audit: null,
        result: null,
      };
      const derived = await record.compCodec.reconstructNativeStageCompensation({
        header: record.header,
        steps: journal.steps,
        compensation: record.compTemplate,
      });
      assertNativeStageRecordingInput(input, invocation);
      if (derived.beforeBody.bytes !== input.bodyBefore || derived.afterBody.bytes !== input.body)
        throw preparationRefusal('compensation-original-delta');
      record.compAfterBody = derived.afterBody.bytes;
    }
    if (operation.kind === 'write-body') {
      record.compAttemptNumber = (record.compAttemptNumber ?? 0) + 1;
      try {
        await record.compStore.persistMemoryNativeStageCompensation(compensationAuthority(record));
        assertNativeStageRecordingInput(input, invocation);
        await record.compStore.beginMemoryNativeStageCompensationAttempt(
          compensationAuthority(record)
        );
        assertNativeStageRecordingInput(input, invocation);
        await record.compStore.writeMemoryNativeStageCompensation(compensationAuthority(record));
        assertNativeStageRecordingInput(input, invocation);
        await record.compStore.completeMemoryNativeStageCompensation(compensationAuthority(record));
        assertNativeStageRecordingInput(input, invocation);
      } catch (error) {
        compensationRecord(invocation);
        const facts = nativeCompensationError(error);
        record.compFailure = { error, bytes: canonicalRecordJson(facts) };
        try {
          if (record.backend.snapshot.nativeStageRecords.at(-1).compensation) {
            await record.compStore.recordMemoryNativeStageCompensationFailure(
              compensationAuthority(record)
            );
            compensationRecord(invocation);
          } else {
            // A failed original callback before durable intent still happened.
            // Retain its actual failure DATA only; retry must freshly persist/read
            // the unchanged sealed intent before any fixed effect can occur.
            const body = record.backend.observation.body;
            record.compTemplate.attempts.push({
              number: record.compAttemptNumber,
              request: structuredClone(operation),
              before: structuredClone(body),
              write: facts,
              after: structuredClone(body),
            });
          }
        } finally {
          record.compFailure = null;
        }
        throw error;
      }
      return;
    }
    await record.compStore.persistMemoryNativeStageCompensation(compensationAuthority(record));
    assertNativeStageRecordingInput(input, invocation);
    if (operation.kind === 'post-comment') {
      await record.compStore.writeMemoryNativeStageCompensationAudit(compensationAuthority(record));
      assertNativeStageRecordingInput(input, invocation);
      return;
    }
    throw preparationRefusal('compensation-operation-kind');
  } finally {
    record.compOperation = null;
  }
}
export async function completeNativeStateRecording(input, invocation, result) {
  const record = assertNativeStageRecordingInput(input, invocation);
  record.compRecordingModule.assertOriginalNativeRecordingResult(input, invocation, result);
  record.compRecordingResult = result;
  await record.compStore.completeMemoryNativeStageCompensationResult(compensationAuthority(record));
  assertNativeStageRecordingInput(input, invocation);
  record.compRecordingModule.assertOriginalNativeRecordingResult(input, invocation, result);
}
export function readNativeStageCompensationResult(token, backend, invocation) {
  const record = compensationRecord(invocation);
  if (record.stageToken !== token || record.backend !== backend || !record.compRecordingResult)
    throw preparationRefusal('original-compensation-result');
  record.compRecordingModule.assertOriginalNativeRecordingResult(
    record.compInput,
    invocation,
    record.compRecordingResult
  );
  return structuredClone(record.compRecordingResult);
}
export function assertNativeStageCompensationReturn(ctx, invocation, result) {
  assertOriginalNativeCompensationReturn(ctx, invocation, result);
  const record = compensationRecord(invocation);
  record.compRecordingModule.assertOriginalNativeRecordingResult(
    record.compInput,
    invocation,
    record.compRecordingResult
  );
  if (
    record.sagaContext !== ctx ||
    !record.compRecordingResult ||
    result.rolledBack !== (record.compRecordingResult.status === 'ok') ||
    result.priorState !== 'develop' ||
    (record.compRecordingResult.status === 'failed' &&
      result.recording !== record.compRecordingResult)
  )
    throw preparationRefusal('original-compensation-return');
  record.compStore.assertMemoryNativeCompensationCurrent({
    backend: record.backend,
    token: record.stageToken,
    invocation,
  });
}

export function assertNativeStageCompensationBodyReturn(invocation, result) {
  const record = compensationRecord(invocation),
    original = record.compBodyRead;
  if (!original || original.result !== result || Object.getPrototypeOf(result) !== Object.prototype)
    throw preparationRefusal('original-compensation-body-return');
  const descriptors = Object.getOwnPropertyDescriptors(result);
  if (
    Reflect.ownKeys(descriptors).length !== 1 ||
    !Object.hasOwn(descriptors.stdout ?? {}, 'value') ||
    ['value', 'enumerable', 'writable', 'configurable'].some(
      (key) => descriptors.stdout[key] !== original.descriptors.stdout[key]
    )
  )
    throw preparationRefusal('original-compensation-body-return');
}

export function readNativeStageCompensationAttemptNumber(token, backend, invocation) {
  const record = compensationRecord(invocation);
  if (
    record.stageToken !== token ||
    record.backend !== backend ||
    ![1, 2].includes(record.compAttemptNumber) ||
    record.compOperation?.kind !== 'write-body'
  )
    throw preparationRefusal('original-compensation-attempt');
  record.compRecordingModule.assertOriginalNativeRecordingOperation(
    record.compInput,
    invocation,
    record.compOperation
  );
  return record.compAttemptNumber;
}

// #1913 — original cache leaf, lexical operation window and current fixed sinks.
function cacheLeaf(input, ctx) {
  const leaf = tailLeafCurrent(input, ctx);
  if (leaf.kind !== 'cache' || !['new', 'call', 'running', 'returned'].includes(leaf.phase))
    throw preparationRefusal('original-cache-invocation');
  return leaf;
}
export function beginNativeStageTailCache(input, ctx) {
  const leaf = originalTailLeaves.get(input);
  if (!leaf || leaf.kind !== 'cache' || leaf.ctx !== ctx || leaf.phase !== 'call')
    throw preparationRefusal('original-cache-window');
  leaf.phase = 'running';
  cacheLeaf(input, ctx);
}
export function assertNativeStageTailCacheCurrent(input, ctx) {
  cacheLeaf(input, ctx);
}
export function readNativeStageTailCacheIntent(token, backend, input) {
  const leaf = originalTailLeaves.get(input);
  if (!leaf) throw preparationRefusal('original-cache-invocation');
  cacheLeaf(input, leaf.ctx);
  if (leaf.record.stageToken !== token || leaf.record.backend !== backend)
    throw preparationRefusal('original-cache-token');
  return { header: structuredClone(leaf.record.header) };
}
function currentCacheOperation(input) {
  const leaf = originalTailLeaves.get(input);
  if (!leaf) throw preparationRefusal('original-cache-invocation');
  cacheLeaf(input, leaf.ctx);
  if (leaf.phase !== 'running' || !leaf.operation)
    throw preparationRefusal('original-cache-operation');
  nativeTailCache.assertOriginalNativeCacheOperation(input, leaf.ctx, leaf.operation);
  return leaf;
}
export function assertNativeStageTailCacheRead(input) {
  const leaf = currentCacheOperation(input);
  if (!['active', 'set'].includes(leaf.operation.kind))
    throw preparationRefusal('original-cache-read');
}
export function assertNativeStageTailCacheSet(input, operation) {
  const leaf = currentCacheOperation(input);
  if (
    leaf.operation !== operation ||
    operation.kind !== 'set' ||
    operation.sid !== leaf.record.actorIdentity.sid ||
    operation.projectDir !== leaf.record.context.executor.worktree ||
    operation.stateArg !== 'test'
  )
    throw preparationRefusal('original-cache-set');
}
export async function readNativeStageTailCacheSource(input, operation) {
  const leaf = currentCacheOperation(input);
  if (
    leaf.operation !== operation ||
    !['active', 'set'].includes(operation.kind) ||
    operation.sid !== leaf.record.actorIdentity.sid ||
    operation.projectDir !== leaf.record.context.executor.worktree
  )
    throw preparationRefusal('original-cache-read');
  const read = await leaf.store.readMemoryNativeStageCache(tailAuthority(leaf.record, input));
  currentCacheOperation(input);
  return {
    beforeBytes: read.beforeBytes,
    file: leaf.record.localPaths.activeTask,
    sid: operation.sid,
    projectDir: operation.projectDir,
  };
}
export async function executeNativeStageCacheOperation(input, ctx, operation) {
  const leaf = cacheLeaf(input, ctx);
  nativeTailCache.assertOriginalNativeCacheOperation(input, ctx, operation);
  if (leaf.operation) throw preparationRefusal('original-cache-operation-reentry');
  leaf.operation = operation;
  leaf.operations.push(JSON.parse(canonicalRecordJson(operation)));
  try {
    if (operation.kind === 'modules') {
      if (canonicalRecordJson(operation.deps) !== '{}')
        throw preparationRefusal('original-cache-modules');
      const [session, words] = await Promise.all([
        import('../../session-state.mjs'),
        import('../../word-counter.mjs'),
      ]);
      currentCacheOperation(input);
      if (session !== nativeCacheSession || words !== nativeCacheWords)
        throw preparationRefusal('original-cache-modules');
      leaf.modules = { session, words };
      return;
    }
    if (!leaf.modules) throw preparationRefusal('original-cache-modules');
    if (operation.kind === 'sid') {
      const value = leaf.modules.words.currentSessionId();
      currentCacheOperation(input);
      if (value !== leaf.record.actorIdentity.sid)
        throw preparationRefusal('original-cache-identity');
      return value;
    }
    if (operation.kind === 'root') {
      const value = nativeCacheRoot();
      currentCacheOperation(input);
      if (value !== leaf.record.context.executor.worktree)
        throw preparationRefusal('original-cache-root');
      return value;
    }
    if (operation.kind === 'active') {
      const result = await leaf.modules.session.getNativeStageCachedTask(input, operation);
      currentCacheOperation(input);
      leaf.modules.session.assertOriginalNativeCacheRead(input, result);
      return result;
    }
    if (operation.kind === 'set') {
      const result = await leaf.modules.session.setNativeStageKanbanState(input, operation);
      currentCacheOperation(input);
      return result;
    }
    if (operation.kind === 'stderr') {
      process.stderr.write(operation.bytes);
      return;
    }
    throw preparationRefusal('original-cache-operation-kind');
  } finally {
    leaf.operation = null;
  }
}
export function assertNativeStageTailCacheWrite(input, intent) {
  const leaf = currentCacheOperation(input);
  assertNativeStageTailCacheSet(input, leaf.operation);
  if (!leaf.writeIntent) throw preparationRefusal('original-cache-write');
  nativeCacheSession.assertOriginalNativeStageKanbanWrite(input, leaf.writeIntent);
  if (intent !== undefined && canonicalRecordJson(intent) !== canonicalRecordJson(leaf.step.intent))
    throw preparationRefusal('original-cache-write');
}
export async function persistNativeStageTailCache(input, intent) {
  const leaf = currentCacheOperation(input);
  assertNativeStageTailCacheSet(input, leaf.operation);
  nativeCacheSession.assertOriginalNativeStageKanbanWrite(input, intent);
  if (leaf.step) throw preparationRefusal('original-cache-write-reentry');
  leaf.writeIntent = intent;
  const snapshot = leaf.record.backend.snapshot,
    journal = snapshot.nativeStageRecords.at(-1);
  if (journal.steps.length !== 17) throw preparationRefusal('original-cache-prefix');
  const step = {
    ordinal: 18,
    kind: 'tail-cache',
    previous: hashNativeStep(journal.steps[16]),
    intent: {
      file: intent.file,
      sid: leaf.record.actorIdentity.sid,
      beforeBytes: intent.beforeBytes,
      bytes: intent.bytes,
      operations: structuredClone(leaf.operations),
    },
    readback: null,
  };
  const codec = await import('../criteria-revision/stage-execution.mjs');
  currentCacheOperation(input);
  const derived = await codec.reconstructNativeStageTailCache({
    header: leaf.record.header,
    steps: [...journal.steps, step],
  });
  currentCacheOperation(input);
  if (
    canonicalRecordJson(snapshot) !== canonicalRecordJson(leaf.record.backend.snapshot) ||
    canonicalRecordJson(snapshot.nativeStageResources) !==
      canonicalRecordJson(derived.beforeResources)
  )
    throw preparationRefusal('original-cache-before');
  leaf.step = step;
  const intended = structuredClone(snapshot);
  intended.nativeStageRecords.at(-1).steps.push(step);
  const effected = structuredClone(intended);
  effected.nativeStageResources = structuredClone(derived.afterResources);
  const completed = structuredClone(effected);
  completed.nativeStageRecords.at(-1).steps[17].readback = structuredClone(derived.readback);
  leaf.record.cachePrefixes = [intended, effected, completed].map(canonicalRecordJson);
  await leaf.store.persistMemoryNativeStageCache({ ...tailAuthority(leaf.record, input), step });
  currentCacheOperation(input);
}
export async function writeNativeStageTailCache(input) {
  const leaf = currentCacheOperation(input);
  assertNativeStageTailCacheWrite(input);
  await leaf.store.writeMemoryNativeStageCache(tailAuthority(leaf.record, input));
  currentCacheOperation(input);
}
export async function completeNativeStageTailCache(input) {
  const leaf = currentCacheOperation(input);
  assertNativeStageTailCacheWrite(input);
  await leaf.store.completeMemoryNativeStageCache(tailAuthority(leaf.record, input));
  currentCacheOperation(input);
}
async function runNativeStageCache(sequence, ctx, step) {
  const record = tailCurrent(sequence, ctx);
  if (record.tailNext !== 1 || record.tailLeaf || step !== DEFAULT_TAIL_STEPS[1])
    throw preparationRefusal('original-cache-order');
  const input = Object.freeze({});
  const leaf = {
    kind: 'cache',
    record,
    sequence,
    ctx,
    phase: 'new',
    operations: [],
    operation: null,
  };
  originalTailLeaves.set(input, leaf);
  record.tailLeaf = input;
  let acquired = false;
  try {
    cacheLeaf(input, ctx);
    leaf.store = await import('../criteria-revision/store.mjs');
    cacheLeaf(input, ctx);
    await leaf.store.acquireMemoryNativeStageCache(tailAuthority(record, input));
    acquired = true;
    cacheLeaf(input, ctx);
    leaf.phase = 'call';
    const result = await nativeTailCache.refreshKanbanStateCache(ctx, input);
    cacheLeaf(input, ctx);
    nativeTailCache.assertOriginalNativeCacheReturn(input, ctx, result);
    if (
      leaf.phase !== 'running' ||
      record.backend.snapshot.nativeStageRecords.at(-1).steps[17]?.readback == null
    )
      throw preparationRefusal('original-cache-return');
    leaf.phase = 'returned';
    record.tailNext = 2;
  } finally {
    if (acquired)
      leaf.store.releaseMemoryNativeStageCache({
        backend: record.backend,
        token: record.stageToken,
        invocation: input,
      });
    originalTailLeaves.delete(input);
    record.tailLeaf = null;
  }
}

// Comparison at the actual original generator's consumer boundary, after await.
export function assertNativeStageCacheValue(input, ctx, operation, value) {
  const leaf = cacheLeaf(input, ctx);
  nativeTailCache.assertOriginalNativeCacheOperation(input, ctx, operation);
  if (leaf.phase !== 'running') throw preparationRefusal('original-cache-value');
  if (operation.kind === 'active') nativeCacheSession.assertOriginalNativeCacheRead(input, value);
  else if (operation.kind === 'sid' && value !== leaf.record.actorIdentity.sid)
    throw preparationRefusal('original-cache-value');
  else if (operation.kind === 'root' && value !== leaf.record.context.executor.worktree)
    throw preparationRefusal('original-cache-value');
}
