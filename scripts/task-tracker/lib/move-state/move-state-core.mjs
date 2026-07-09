// INTERNAL — the state-movement saga core (#755/#756). Extracted from
// scripts/gh/move-state.mjs's __mutationBlock so exactly one code path owns the
// ordered saga. Returns a result object; the HOST maps result.exit to
// process.exit. This function never calls process.exit and never prints usage.
import { runGuardExecution as defaultRunGuardExecution } from './guard-execution.mjs';
import {
  runStatusWrite as defaultRunStatusWrite,
  stampEntryMarkers as defaultStampEntryMarkers,
} from './github-mutation.mjs';
import { emitPhasePairRows as defaultEmitPhasePairRows } from './audit-timing.mjs';
import { runPostCommitTail as defaultRunPostCommitTail } from './post-commit-tail.mjs';
import { writeMoveCompleteMarker, readMoveCompleteState, isMoveComplete } from './sentinel.mjs';
import { getStageVisitCount } from '../stage-entry-markers.mjs';
import { parseTimingRows } from '../timing-ladder.mjs';
import { PHASE_EVENTS } from '../../phase-events.mjs';

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
export async function defaultProbeCompletion(ctx) {
  const { issueArg, stateArg, cfg, SKIP_NETWORK } = ctx;
  const notComplete = {
    sentinelState: '',
    statusState: '',
    entryMarkerPresent: false,
    exitRowPresent: false,
    entryRowPresent: false,
  };
  if (SKIP_NETWORK) return notComplete;

  // One read: the verified live body. An identity mutate is a pure read on
  // issue-body-mutate's no-op path (issue-body-mutate.mjs §36-38) and clobbers
  // no invariant marker (output === base).
  const fetchBody =
    ctx._fetchBody ||
    (async () => {
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
  } catch {
    return notComplete;
  }

  const sentinelState = readMoveCompleteState(body);
  // The sentinel is the LAST write of a complete move; if it does not already
  // name the target the move is definitively incomplete — skip the board read.
  if (sentinelState !== stateArg) return { ...notComplete, sentinelState };

  const resolveLiveStateName = ctx.resolveLiveStateName || (async () => '');
  let statusState = '';
  try {
    statusState = (await resolveLiveStateName(issueArg)) || '';
  } catch {
    statusState = '';
  }

  const entryMarkerPresent = getStageVisitCount(body, stateArg) > 0;

  const rows = parseTimingRows(body);
  const enterEvent = PHASE_EVENTS[stateArg]?.enter?.event;
  const entryRows = enterEvent ? rows.filter((r) => r.event === enterEvent) : [];
  const entryRowPresent = entryRows.length > 0;
  const entryTs = entryRowPresent ? entryRows[entryRows.length - 1].ts : null;
  const exitRowPresent =
    entryTs != null && rows.some((r) => r.ts === entryTs && COMPLETE_EVENT_RE.test(r.event));

  return { sentinelState, statusState, entryMarkerPresent, exitRowPresent, entryRowPresent };
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
  const { issueArg, stateArg, cfg, SKIP_NETWORK } = ctx;
  // Offline/test mode writes nothing to the board (runStatusWrite likewise
  // short-circuits under SKIP_NETWORK). With no board write there is no
  // sentinel to stamp or verify, so report verified and let the saga proceed.
  if (SKIP_NETWORK) return { verified: true };
  const ts = new Date().toISOString();
  const mutateBody =
    ctx._mutateBody ||
    (async ({ mutate }) => {
      const { mutateIssueBody } = await import('../issue-body-mutate.mjs');
      return mutateIssueBody({ issueNumber: issueArg, repo: cfg.repo, mutate });
    });
  const res = await mutateBody({ mutate: (base) => writeMoveCompleteMarker(base, stateArg, ts) });
  if (readMoveCompleteState(res?.body ?? '') === stateArg) return { verified: true };
  process.stderr.write(
    `⛔ #${issueArg} → ${stateArg}: board moved but aitm-move-complete sentinel did NOT ` +
      `confirm on re-read. Move is NOT stamped complete; re-run to converge.\n`
  );
  return { verified: false, exit: 7 };
}

// The atomic move saga. All body/timing evidence is made durable BEFORE the
// authoritative Status write, and the aitm-move-complete sentinel is written
// LAST of all — so a crash anywhere leaves a safely re-runnable partial state
// and "the move is complete" has a single verifiable definition (sentinel.mjs).
export async function moveState(ctx) {
  const runGuardExecution = ctx._runGuardExecution || defaultRunGuardExecution;
  const probeCompletion = ctx._probeCompletion || defaultProbeCompletion;
  const emitPhasePairRows = ctx._emitPhasePairRows || defaultEmitPhasePairRows;
  const stampEntryMarkers = ctx._stampEntryMarkers || defaultStampEntryMarkers;
  const runStatusWrite = ctx._runStatusWrite || defaultRunStatusWrite;
  const writeSentinel = ctx._writeSentinel || defaultWriteSentinel;
  const runPostCommitTail = ctx._runPostCommitTail || defaultRunPostCommitTail;

  const guard = await runGuardExecution(ctx);
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
  if (isMoveComplete({ ...probe, target: ctx.stateArg })) {
    const tail = await runPostCommitTail(ctx);
    return {
      exit: null,
      itemId: '',
      alreadyComplete: true,
      tail,
      phase: 'complete',
      sentinelPresent: true,
      boardMoved: true,
    };
  }

  // Pre-Status evidence: exit-flush the departing row + entry row, then the
  // entry markers. Both are individually idempotent and re-read-verified.
  await emitPhasePairRows(ctx);
  await stampEntryMarkers(ctx);

  // Status is the LAST authoritative board write (#711 fail-closed verify).
  const writeResult = await runStatusWrite(ctx);
  if (writeResult.exit !== null) {
    return {
      exit: writeResult.exit,
      itemId: writeResult.itemId,
      tail: { failures: [] },
      phase: 'status',
      sentinelPresent: false,
      boardMoved: false,
    };
  }
  ctx.itemId = writeResult.itemId;

  // The sentinel is written only after Status verified at target; a failure
  // here means "board moved, completion not yet stamped — re-run to converge."
  const sentinel = await writeSentinel(ctx);
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

  const tail = await runPostCommitTail(ctx);
  return {
    exit: null,
    itemId: writeResult.itemId,
    tail,
    phase: 'complete',
    sentinelPresent: true,
    boardMoved: true,
  };
}
