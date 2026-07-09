// INTERNAL — the state-movement saga core (#755/#756). Extracted from
// scripts/gh/move-state.mjs's __mutationBlock so exactly one code path owns the
// ordered saga. Returns a result object; the HOST maps result.exit to
// process.exit. This function never calls process.exit and never prints usage.
import { runGuardExecution as defaultRunGuardExecution } from './guard-execution.mjs';
import { runStatusWrite as defaultRunStatusWrite } from './github-mutation.mjs';
import { runPostCommitTail as defaultRunPostCommitTail } from './post-commit-tail.mjs';

export async function moveState(ctx) {
  const runGuardExecution = ctx._runGuardExecution || defaultRunGuardExecution;
  const runStatusWrite = ctx._runStatusWrite || defaultRunStatusWrite;
  const runPostCommitTail = ctx._runPostCommitTail || defaultRunPostCommitTail;

  const guard = await runGuardExecution(ctx);
  if (guard.exit !== null && guard.exit !== undefined) {
    return { exit: guard.exit, itemId: '', tail: { failures: [] } };
  }

  const writeResult = await runStatusWrite(ctx);
  if (writeResult.exit !== null) {
    return { exit: writeResult.exit, itemId: writeResult.itemId, tail: { failures: [] } };
  }
  ctx.itemId = writeResult.itemId;

  const tail = await runPostCommitTail(ctx);
  return { exit: null, itemId: writeResult.itemId, tail };
}
