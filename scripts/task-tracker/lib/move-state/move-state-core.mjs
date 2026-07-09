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

// Task 6 (#756) fills this in: write the aitm-move-complete sentinel and
// re-read-verify it landed at target. Until then it is a no-op that reports
// verified so the reordered saga is exercised end-to-end.
export async function defaultWriteSentinel() {
  return { verified: true };
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
