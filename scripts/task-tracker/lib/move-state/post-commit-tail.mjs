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

import { emitFullAutoReviewAudit, emitOutOfBandAudit } from './audit-timing.mjs';
import {
  dispatchOnEnterActions,
  refreshKanbanStateCache,
  unparkDoneDependents,
  syncTrackerState,
  syncEventFields,
  endTaskTracking,
} from './cache-unpark.mjs';
import { selectTailSteps } from './tail-profiles.mjs';
import { repairTransitionCommit } from './transition-commit.mjs';

// The canonical post-commit tail, in the exact order the pre-#714 mutation
// block invoked it. Each entry is `{ name, scope, fn }` where `fn(ctx)` is the
// best-effort step. Order is load-bearing (#535/#516) — do NOT reorder.
//
// #756: `stampEntryMarkers` and `emitPhasePairRows` moved OUT of this tail into
// the atomic core (move-state-core.mjs), where they run BEFORE the Status write
// so all entry evidence is durable before the board flips.
export const DEFAULT_TAIL_STEPS = Object.freeze([
  { name: 'dispatchOnEnterActions', scope: 'project', fn: dispatchOnEnterActions },
  { name: 'refreshKanbanStateCache', scope: 'project', fn: refreshKanbanStateCache },
  { name: 'emitFullAutoReviewAudit', scope: 'issue', fn: emitFullAutoReviewAudit },
  { name: 'unparkDoneDependents', scope: 'project', fn: unparkDoneDependents },
  { name: 'emitOutOfBandAudit', scope: 'issue', fn: emitOutOfBandAudit },
  { name: 'syncTrackerState', scope: 'session', fn: syncTrackerState },
  { name: 'syncEventFields', scope: 'issue', fn: syncEventFields },
  { name: 'endTaskTracking', scope: 'session', fn: endTaskTracking },
]);

// Run the post-commit tail. Each step is best-effort: a throw is caught, logged
// to stderr (naming the step), recorded in the returned `failures` array, and
// execution continues. Returns `{ failures }` where `failures` is an ordered
// list of `{ name, error }` for the steps that threw (empty on a clean run).
//
// The returned shape lets the host (or a test) inspect WHICH steps failed
// without any failure ever changing control flow or the process exit code — the
// core #714 invariant: once the board write has committed, no tail throw may
// report the committed move as a failure. `total` is the count of steps
// attempted, so the §9 readout can render an honest `N/M best-effort steps ok`
// even when a custom step list is injected (tests).
export async function runPostCommitTail(ctx, steps = DEFAULT_TAIL_STEPS) {
  const failures = [];
  const replayRepairStep = {
    name: 'repairTransitionCommit',
    scope: 'issue',
    fn: (stepCtx) => (stepCtx.repairTransitionCommit || repairTransitionCommit)(stepCtx),
  };
  const eligibleSteps = ctx.transitionCommitRepairRequested ? [replayRepairStep, ...steps] : steps;
  const selectedSteps = selectTailSteps(eligibleSteps, ctx.tailProfile);
  for (const step of selectedSteps) {
    try {
      // Support both async and sync step fns (syncTrackerState / endTaskTracking
      // are synchronous in the original block). `await` on a non-promise is a
      // no-op, so a single path handles both.
      await step.fn(ctx);
    } catch (err) {
      failures.push({ name: step.name, error: err });
      // #716 — a STRUCTURED diagnostic (step name + child exit code, benign
      // audit lines filtered out, explicit no-detail fallback) rather than an
      // arbitrary trailing stderr line. The `[move-state:warn]` level tag marks
      // this as a non-failure-of-the-move warning: the board move already
      // committed (#714), so a consumer must never treat this line as THE
      // failure reason for the move itself.
      process.stderr.write(
        `[move-state:warn] ${formatTailStepFailure({ name: step.name, error: err })}\n`
      );
    }
  }
  return { failures, total: selectedSteps.length };
}

// #716 — informational / benign stderr lines that a tail step may emit and that
// must NEVER be selected as a failure reason. The full-auto human-reviewer-audit
// note (audit-timing.mjs) and any `[move-state:warn]` level-tagged line are
// non-failure output by construction.
const BENIGN_STDERR_LINE = /^\s*(\[move-state:warn\]|\[human-reviewer-audit(?::info)?\])/;

// #716 — format a tail-step failure into a structured diagnostic. Reads the
// child exit code from `error.code` (numeric, promisify(execFile) convention) or
// `error.status` (spawn convention), filters benign informational lines out of
// the stderr detail, and falls back to an explicit `child exited <N> with no
// error detail` when a non-zero child carries no usable detail. A plain (non-
// child) Error throw with no exit code is reported as `<step> failed: <message>`.
//
// Pure + exported so the "which step + exit code, never a benign line" contract
// is testable without spawning a real process.
export function formatTailStepFailure({ name, error } = {}) {
  const err = error || {};
  const exitCode =
    typeof err.code === 'number' ? err.code : typeof err.status === 'number' ? err.status : null;

  // Collect usable stderr detail, dropping benign informational lines so they
  // can never become the surfaced reason.
  const detail = String(err.stderr || '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0 && !BENIGN_STDERR_LINE.test(l))
    .join('; ')
    .trim();

  if (exitCode !== null) {
    if (detail) return `${name} exited ${exitCode}: ${detail}`;
    // AC3 — explicit fallback instead of an empty / misleading message.
    return `${name}: child exited ${exitCode} with no error detail`;
  }

  // Not a child-process failure (plain throw): name the step + the message,
  // never fabricating an exit code.
  const msg = (err && err.message) || String(err);
  if (msg && msg.trim().length > 0) return `${name} failed: ${msg}`;
  return `${name} failed with no error detail`;
}
