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
