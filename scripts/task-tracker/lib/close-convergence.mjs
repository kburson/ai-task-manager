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
//
//   → { action: 'noop',        boardDrift }  issue verifiably CLOSED; boardDrift
//                                            true when the board has NOT caught
//                                            up to Done (converge the board).
//   → { action: 'close-issue' }              board=Done but issue still OPEN —
//                                            the auto-close workflow did not
//                                            fire; close the primary explicitly.
//   → { action: 'proceed' }                  issue OPEN and board not Done, OR
//                                            issueClosed unknown — run the full
//                                            close pipeline.
export function decideCloseConvergence({ boardState, issueClosed } = {}) {
  const boardDone = boardState === 'done';
  if (issueClosed === true) return { action: 'noop', boardDrift: !boardDone };
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
//   hasApprovalMarker  — `hasReviewApprovedMarker(closeBody)` on the live body.
//   reviewGateBypassed — the review→done gate was disabled (session/project).
//
// Pure + exported so the suppress-vs-emit decision is testable without the
// network-heavy close transaction.
export function shouldEmitReviewApprovedRow({ hasApprovalMarker, reviewGateBypassed } = {}) {
  return Boolean(hasApprovalMarker) || Boolean(reviewGateBypassed);
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
