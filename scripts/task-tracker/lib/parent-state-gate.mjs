// Parent-state read-failure fail-closed decision (#513).
//
// `scripts/gh/create-issue.mjs` enforces the #247 Done-parent invariant before
// creating a sub-issue: a Done epic must not grow new children. It reads the
// parent epic's board state and refuses creation when the epic is Done. The read
// used to be wrapped in a `try { … } catch { parentState = null; /* fail open */ }`
// and the refusal only fired when `parentState != null`, so a FAILED read was
// indistinguishable from "state unknowable": the gate was skipped and the
// sub-issue was created without ever verifying the invariant. That is fail-OPEN —
// the create-issue sibling of the #510 close-gate / #511 move-state fail-opens.
//
// Map (readFailed, override) to a fail-closed decision so create-issue.mjs refuses
// to create the sub-issue when the parent state could not be read.
//
//   readFailed — whether the `readParentStatus(...)` call threw.
//   override   — whether `AITM_SKIP_PARENT_STATE_GATE=1` (the explicit
//                internal/testing escape) is set.
//
//   → { failClosed: true,  exitCode: 2, message }  read failed and not overridden:
//                                                   refuse creation, exit non-zero
//                                                   BEFORE any `gh issue create`.
//   → { failClosed: false }                         read succeeded, or override is
//                                                   set — continue (the existing
//                                                   Done-state refusal still applies
//                                                   to a successful read).
//
// Pure + total over its inputs so it can be exercised without spawning a process
// or hitting the network.
export function decideParentStateReadFailure({ readFailed, override } = {}) {
  if (!readFailed) return { failClosed: false };
  if (override) return { failClosed: false };
  return {
    failClosed: true,
    exitCode: 2,
    message:
      `cannot read parent epic state to enforce the Done-parent invariant — refusing to ` +
      `create the sub-issue fail-closed. A failed parent-state read must not be treated as ` +
      `"state unknown / allow" (which would let a Done epic grow new children). Re-run once ` +
      `GitHub is reachable, or set AITM_SKIP_PARENT_STATE_GATE=1 to override.`,
  };
}
