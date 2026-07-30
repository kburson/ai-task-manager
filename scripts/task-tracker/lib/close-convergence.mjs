// Close-convergence decision (#425).
//
// The project-board Status field and the GitHub open/closed state are
// decoupled: `/task close` moves the board item to Done via move-state.mjs but
// does NOT itself `gh issue close` the primary issue — convergence is delegated
// to GitHub Projects' auto-close workflow. When that workflow does not fire
// (disabled, race, transient blip) the board reads Done while the issue stays
// OPEN, and the old short-circuit — which treated board=Done as a no-op — would
// strand the issue OPEN forever (observed live on #171; #424 showed the
// board-move and issue-close steps are non-atomic).
//
// This pure helper maps the two observed signals to an action so close.mjs can
// converge instead of no-op:
//
//   boardState  — board Status slug ('done' | other | null/unknown)
//   issueClosed — GitHub issue state (true=CLOSED | false=OPEN | null=unknown)
//   recoveryPhase — durable unauthorized-close phase, when present
//
//   → { action: 'aberration', resume: true } pending durable recovery; resume it
//   → { action: 'noop',        boardDrift }  issue verifiably CLOSED; boardDrift
//                                            true when the board has NOT caught
//                                            up to Done (converge the board).
//   → { action: 'close-issue' }              board=Done but issue still OPEN —
//                                            the auto-close workflow did not
//                                            fire; close the primary explicitly.
//   → { action: 'proceed' }                  issue OPEN and board not Done, OR
//                                            issueClosed unknown — run the full
//                                            close pipeline.
//
// #708 — PR closing references ("Closes #N") auto-close an issue out-of-band, so
// the board reads Done / issue CLOSED and every subsequent `/task close` hits the
// `noop` branch — which skips the timing flush, lifecycle-box ticking, and audit
// rows. There was no sanctioned way to replay the full atomic close from Done.
// `repair` (set by `/task close --repair <N>`) forces `proceed` BEFORE the
// noop/close-issue branches so the full pipeline runs regardless of board/issue

import { derivePersistedReviewAuthority } from './review-authority.mjs';
// state. The pipeline is safe to replay: `gh issue close` no-ops on an
// already-closed issue and `runMoveStateDone` Done→Done is swallowed as benign
// (#385). When `repair` is falsy the noop/close-issue branches are unchanged.
export function decideCloseConvergence(input = {}) {
  const {
    boardState,
    issueClosed,
    stateReason,
    nonLifecycleBoxesAllTicked,
    recoveryPhase,
    repair,
  } = input;
  if (repair) return { action: 'proceed', repair: true };
  if (['intent', 'reopened', 'review', 'timing'].includes(recoveryPhase)) {
    return { action: 'aberration', resume: true };
  }
  const boardDone = boardState === 'done';
  if (issueClosed === true) {
    // #925 — preserve the legacy closed/noop decision until a caller opts into
    // the richer close snapshot. This additive boundary lets runtime and tests
    // migrate independently without interpreting a missing stateReason as an
    // actual GitHub null reason.
    const hasExpandedSignals =
      Object.prototype.hasOwnProperty.call(input, 'stateReason') ||
      Object.prototype.hasOwnProperty.call(input, 'nonLifecycleBoxesAllTicked');
    if (!hasExpandedSignals) return { action: 'noop', boardDrift: !boardDone };

    const normalizedReason =
      typeof stateReason === 'string' ? stateReason.trim().toLowerCase() : null;
    if (normalizedReason !== 'completed') return { action: 'dead' };
    if (boardDone) return { action: 'noop', boardDrift: false };
    return nonLifecycleBoxesAllTicked ? { action: 'finalize' } : { action: 'aberration' };
  }
  if (issueClosed === false && boardDone) return { action: 'close-issue' };
  return { action: 'proceed' };
}

// Board-move-failure swallow-vs-surface decision (#435).
//
// `close` closes the issue on GitHub, then calls `runMoveStateDone`. It used to
// surface an error + non-zero exit whenever `!moveResult.ok && !moveResult.benign`.
// `classifyMoveStateBenign` (runtime.mjs) already swallows the `done → done`
// (#385) and `test → test` (#444) illegal-transition self-loops by stderr shape.
// The residual FALSE POSITIVE is a race: the Projects auto-close workflow (or a
// prior converge) can move the board to Done out-of-band between close's
// decision and its move call. The resulting `move-state.mjs` failure does NOT
// always present as a clean `done → done` stderr — so a pure
// stderr-classifier cannot, and must not, be widened to swallow it without also
// masking genuine failures that emit a similar stderr (which would violate the
// "genuine failure still surfaces" requirement).
//
// The disambiguating signal is the board's ACTUAL state AFTER the move attempt,
// re-read by the caller. This pure helper maps (moveResult, post-attempt
// boardState) to the decision:
//
//   moveResult — the structured result from runMoveStateDone
//                ({ ok, benign, status, stderr }).
//   boardState — the board Status slug re-read AFTER the move attempt
//                ('done' | other | null/unknown).
//
//   → { surface: false, reason: 'ok-or-benign' }       move succeeded or was
//                                                       already classified benign.
//   → { surface: false, reason: 'board-already-done' }  move reported failure but
//                                                       the board is verifiably
//                                                       Done — race/no-op; the
//                                                       close succeeded. Swallow.
//   → { surface: true,  reason: 'board-not-done' }      move failed AND the board
//                                                       is NOT Done — a genuine
//                                                       failure. Surface + exit 1.
//
// Pure + exported for tests so the swallow-vs-surface decision can be exercised
// without spawning a real process or hitting the network.
export function decideBoardMoveFailure({ moveResult, boardState } = {}) {
  const mr = moveResult || {};
  if (mr.ok || mr.benign) return { surface: false, reason: 'ok-or-benign' };
  if (boardState === 'done') return { surface: false, reason: 'board-already-done' };
  return { surface: true, reason: 'board-not-done' };
}

// Lag-tolerant pre-close board re-read (#752).
//
// The board slug that `decideBoardMoveFailure` above judges is re-read by close
// AFTER a non-benign move failure. A SINGLE read taken right after a move-state
// child that was SIGTERM-killed mid-tail (its Status write already committed —
// see MOVE_STATE_TIMEOUT_MS, #752) can still observe GitHub Projects
// read-after-write lag and return the stale pre-move column, so the decision
// surfaces a FALSE `Issue left OPEN`. This bounded exponential-backoff re-read
// gives the board a window to converge: it returns the instant a read is 'done',
// and otherwise returns the LAST observed value after `attempts` reads — so a
// GENUINE failure (board never reaches Done) still reads non-done every attempt
// and surfaces exactly as before. Purely additive: it only ever runs on the
// failure path, and the happy path (first read 'done') takes one read, no sleep.
//
//   getIssueBoardState — async (active) => board slug ('done' | other | null).
//   active             — the issue number/handle to re-read.
//   attempts           — max reads (default 4).
//   baseDelayMs        — base backoff; delay before read i (0-indexed) is
//                        baseDelayMs * 2**i (500 → 1000 → 2000ms by default).
//   sleep              — injectable delay (ms => Promise); defaults to setTimeout
//                        so tests drive it without real timers.
export async function resolveBoardStateForClose({
  getIssueBoardState,
  active,
  attempts = 4,
  baseDelayMs = 500,
  sleep,
} = {}) {
  const doSleep = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    last = await getIssueBoardState(active);
    if (last === 'done') return last;
    if (i < attempts - 1) await doSleep(baseDelayMs * 2 ** i);
  }
  return last;
}

// review:approved timing-row emission decision (#655).
//
// The `review:approved` row is an audit record that a human (or full-auto)
// approval happened. close.mjs must NOT emit it on faith — the #652 incident
// was a close that wrote `review:approved` while the `aitm-review-approved`
// marker never persisted on the live body, fabricating evidence of an approval
// that did not occur. Emit the row only when the live body actually carries the
// approval marker, OR the review→done gate was explicitly bypassed (which
// carries its own `aitm-gate-bypassed` audit row, so the bypass is already on
// record). When the gate is active and the marker is absent, suppress the row.
//
//   body               — live issue body; authority is derived from it.
//   reviewGateBypassed — the review→done gate was disabled (session/project).
//
// Pure + exported so the suppress-vs-emit decision is testable without the
// network-heavy close transaction.

export function shouldEmitReviewApprovedRow({ body, reviewGateBypassed } = {}) {
  return Boolean(reviewGateBypassed) || derivePersistedReviewAuthority(body).status === 'current';
}

// Gate-evaluation failure decision (#510).
//
// `verbClose` evaluates every review→done close gate (body fetch, derived-DoD
// stamping, unchecked-checkbox scan, lifecycle assertion, and the
// `runGuards('review','done', …)` registry call) inside one broad try/catch.
// The catch used to only `console.warn('Could not check issue body: …')` and
// fall through to the unconditional terminal `gh issue close` + `clearActive`,
// silently SKIPPING every gate on any transient failure (a `gh` body-fetch
// blip, a `JSON.parse` error, an exception from a guard). That is fail-OPEN: a
// close that should have been refused completes with only a warning.
//
// This pure helper maps the caught error + the `--force` flag to a fail-closed
// decision so close.mjs refuses the close instead of swallowing the error:
//
//   error — the value caught from the gate-eval block.
//   force — whether `--force` was passed (deliberate, audited bypass).
//
//   → { failClosed: true,  exitCode: 3, message }  no --force: refuse the close,
//                                                   exit non-zero BEFORE any
//                                                   mutation, leave local state
//                                                   intact for a re-run.
//   → { failClosed: false }                         --force: the caller already
//                                                   opted into a deliberate
//                                                   gate bypass; continue.
//
// Pure + total over its inputs (a missing `error` yields a generic message) so
// the swallow-vs-fail-closed decision can be exercised without spawning a
// process or hitting the network.
export function decideGateEvalFailure({ error, force } = {}) {
  if (force) return { failClosed: false };
  const detail = (error && error.message) || String(error || 'unknown error');
  return {
    failClosed: true,
    exitCode: 3,
    message:
      `close-gate evaluation failed (${detail}) — refusing to close fail-closed. ` +
      `Local state left intact; re-run \`/task close\` once resolved, or pass \`--force\` to bypass.`,
  };
}
