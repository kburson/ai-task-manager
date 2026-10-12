Claude Code review (Opus, high effort) of `d6ac272615974682b231d4512c1adbbbf937bfac` after required CI passed.

Verdict: **changes required; not ready to merge**.

Blocking finding:

- `close.mjs` did not consume the typed waived review authority used by delivery. A valid waiver could therefore authorize and merge delivery, then fail governed close because close still required ordinary passed-review evidence.

Additional hardening requested:

- Centralize strict typed-authority validation so malformed waiver objects and inconsistent review-receipt SHAs cannot bypass the accepted-head contract.
- Preserve and compare the workflow-exception revision in the durable `review:waived` handoff, with backward-compatible parsing for already-issued legacy rows.
- Fail distinctly when the Timing Log authority source is ambiguous.
- Correct the wrong-head test so it reaches the intended predicate.
- Exercise the real workflow-boundary path and the close/no-commit consumers, not only mocked delivery orchestration.

The issue was returned to Develop and these findings are being addressed before CI and Claude review are repeated.
