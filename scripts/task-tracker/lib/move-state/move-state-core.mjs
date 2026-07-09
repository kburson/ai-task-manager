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
import { writeMoveCompleteMarker, readMoveCompleteState } from './sentinel.mjs';

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
  const { issueArg, stateArg, cfg } = ctx;
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
  const emitPhasePairRows = ctx._emitPhasePairRows || defaultEmitPhasePairRows;
  const stampEntryMarkers = ctx._stampEntryMarkers || defaultStampEntryMarkers;
  const runStatusWrite = ctx._runStatusWrite || defaultRunStatusWrite;
  const writeSentinel = ctx._writeSentinel || defaultWriteSentinel;
  const runPostCommitTail = ctx._runPostCommitTail || defaultRunPostCommitTail;

  const guard = await runGuardExecution(ctx);
  if (guard.exit !== null && guard.exit !== undefined) {
    return { exit: guard.exit, itemId: '', tail: { failures: [] } };
  }

  // Pre-Status evidence: exit-flush the departing row + entry row, then the
  // entry markers. Both are individually idempotent and re-read-verified.
  await emitPhasePairRows(ctx);
  await stampEntryMarkers(ctx);

  // Status is the LAST authoritative board write (#711 fail-closed verify).
  const writeResult = await runStatusWrite(ctx);
  if (writeResult.exit !== null) {
    return { exit: writeResult.exit, itemId: writeResult.itemId, tail: { failures: [] } };
  }
  ctx.itemId = writeResult.itemId;

  // The sentinel is written only after Status verified at target; a failure
  // here means "board moved, completion not yet stamped — re-run to converge."
  const sentinel = await writeSentinel(ctx);
  if (!sentinel.verified) {
    return { exit: sentinel.exit ?? 7, itemId: writeResult.itemId, tail: { failures: [] } };
  }

  const tail = await runPostCommitTail(ctx);
  return { exit: null, itemId: writeResult.itemId, tail };
}
