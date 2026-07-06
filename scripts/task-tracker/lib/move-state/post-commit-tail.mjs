// INTERNAL — library module for the state-movement boundary (#714).
//
// Post-commit tail sequencer extracted from `scripts/gh/move-state.mjs`
// `__mutationBlock`. Everything AFTER the authoritative `runStatusWrite` (which
// commits the board Status field and returns a host-honored `exit`) is
// best-effort: the documented contract is that a failure surfaces on stderr and
// NEVER rolls back the already-committed board move.
//
// The pre-#714 code ran each of those steps as a bare `await`. A throw in any
// one of them unwound through `withIssueLock` (which re-throws anything that is
// not an `IssueLockError`) to the top level, so the process exited NON-ZERO even
// though the board move had already committed. Downstream, close.mjs saw that
// non-zero status and could print its "Issue left OPEN" split-brain guard for a
// board that was, in fact, Done — a FALSE split-brain.
//
// This sequencer wraps each tail step in its own try/catch: a throw is logged to
// stderr (naming the step) and execution CONTINUES to the next step. The call
// ORDER is byte-identical to the pre-#714 sequence (the #535/#516 timeline-row
// ordering guarantee is load-bearing). `runStatusWrite` and its exit-honor stay
// OUTSIDE this tail in the host — they remain authoritative.
//
// The step list is injectable (`steps` argument) so the isolation behavior can
// be unit-driven with a throwing step double without spawning `gh` or the
// network. Production passes the frozen `DEFAULT_TAIL_STEPS`.

import { stampEntryMarkers } from './github-mutation.mjs';
import { emitPhasePairRows, emitFullAutoReviewAudit, emitOutOfBandAudit } from './audit-timing.mjs';
import {
  dispatchOnEnterActions,
  refreshKanbanStateCache,
  unparkDoneDependents,
  syncTrackerState,
  syncEventFields,
  endTaskTracking,
} from './cache-unpark.mjs';

// The canonical post-commit tail, in the exact order the pre-#714 mutation
// block invoked it. Each entry is `{ name, fn }` where `fn(ctx)` is the
// best-effort step. Order is load-bearing (#535/#516) — do NOT reorder.
export const DEFAULT_TAIL_STEPS = Object.freeze([
  { name: 'stampEntryMarkers', fn: stampEntryMarkers },
  { name: 'dispatchOnEnterActions', fn: dispatchOnEnterActions },
  { name: 'refreshKanbanStateCache', fn: refreshKanbanStateCache },
  { name: 'emitPhasePairRows', fn: emitPhasePairRows },
  { name: 'emitFullAutoReviewAudit', fn: emitFullAutoReviewAudit },
  { name: 'unparkDoneDependents', fn: unparkDoneDependents },
  { name: 'emitOutOfBandAudit', fn: emitOutOfBandAudit },
  { name: 'syncTrackerState', fn: syncTrackerState },
  { name: 'syncEventFields', fn: syncEventFields },
  { name: 'endTaskTracking', fn: endTaskTracking },
]);

// Run the post-commit tail. Each step is best-effort: a throw is caught, logged
// to stderr (naming the step), recorded in the returned `failures` array, and
// execution continues. Returns `{ failures }` where `failures` is an ordered
// list of `{ name, error }` for the steps that threw (empty on a clean run).
//
// The returned shape lets the host (or a test) inspect WHICH steps failed
// without any failure ever changing control flow or the process exit code — the
// core #714 invariant: once the board write has committed, no tail throw may
// report the committed move as a failure.
export async function runPostCommitTail(ctx, steps = DEFAULT_TAIL_STEPS) {
  const failures = [];
  for (const step of steps) {
    try {
      // Support both async and sync step fns (syncTrackerState / endTaskTracking
      // are synchronous in the original block). `await` on a non-promise is a
      // no-op, so a single path handles both.
      await step.fn(ctx);
    } catch (err) {
      failures.push({ name: step.name, error: err });
      const msg = (err && err.message) || String(err);
      process.stderr.write(`[move-state] ${step.name} failed post-commit: ${msg}\n`);
    }
  }
  return { failures };
}
