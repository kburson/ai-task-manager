# Round 2 Reviewer Review

<!-- cspell:ignore underspecified -->

**Reviewer:** claude
**Artifact:** `docs/superpowers/specs/2026-08-21-939-governed-pr-delivery-design.md`
**Reviewed commit:** `31b14b4dd7e34224b2be6e24b8008d0231799088`
**Decision:** accepted

## Summary

Fresh independent review; no prior-protocol findings imported. The design is
architecturally sound, repository-compatible, and correctly grounded in the
current implementation. I re-verified the core premise against
`scripts/task-tracker/verbs/close.mjs`: terminal timing is flushed
(`runLogIssueTime`, `flushCloseTimingOrThrow`) _before_ the Full-Auto
merge-enable block (`enableFullAutoMergeForClose`), so a merge refusal today
genuinely strands terminal-looking audit evidence on an open, undelivered
issue — exactly as the Problem section claims.

The split of **delivery** (governed, in-Review, provider-mediated,
receipt-backed) from **closure** (terminal-only) is the right cut and matches
AITM's single-authority, script-backed architecture. The authority table,
exact-head protection, fail-closed recovery matrix, append-only intent/receipt
records, and the refusal to disguise a classifier-blocked `gh pr merge` are all
correct and consistent with existing repo invariants (message-based `[#N]`
attribution, `origin/trunk` close guard, auto-mode classifier). I accept the
design.

The Testing Strategy now cleanly separates the deterministic cross-component
regression harness from the non-repeatable real-PR verification, so the
automated lane stays hermetic — resolving the concern I would otherwise raise
there.

The findings below are refinement-level clarifications, not design defects.
None block acceptance; they should be resolved during Refine/Plan and are
already partially implied by AC6 and the decomposition list.

## Findings

[finding:F-001] **Squash attribution-token completeness is underspecified and
can strand sibling attribution.** The deterministic squash message is described
as carrying "the validated attribution tokens required by the current commit
trail, including child tokens for an epic" (spec ~L210-213), and AC6 promises
"all required `[#N]` attribution tokens." But a squash collapses the _entire_
branch range into one trunk commit. If any commit in that range carries a
`[#N]` token that is neither the top-level issue nor an epic child (e.g. a
defect fixed mid-branch that was not isolated onto its own PR), that token
disappears from `origin/trunk`, later breaking that token's own
`close`/`commit-trace` `origin/trunk` guard, which greps trunk for `[#N]`.
Repo convention (worktree-per-rung defect isolation) mitigates this in the
sanctioned path, but the spec should define "required tokens" as _every_ `[#N]`
present in the squashed commit range — computed from the range, not from
issue+children — so the guarantee is total rather than convention-dependent.
This is the only finding touching a load-bearing invariant.

[finding:F-002] **Verification check #8 (merge-after-intent) is clock-skew
fragile.** "The observed merge happened after the intent was created"
(spec ~L300-301) compares the intent's local `createdAt` ISO stamp against the
GitHub-reported merge time. Those come from different clocks; skew or coarse
time resolution can make a legitimate self-initiated merge appear to predate
its intent and force the code down the already-merged _recovery_ branch
unnecessarily. Prefer the intent comment's GitHub-server timestamp (same clock
as the merge event) for the ordering test, or treat expected-head-SHA equality
plus post-intent PR state as sufficient and drop strict wall-clock ordering.

[finding:F-003] **The single-pending-intent invariant lacks a stated
concurrency guard.** "Only one pending intent may exist for an issue"
(spec ~L261) is enforceable only if intent creation reads back after write
under AITM's existing single-mutator discipline; two racing `/task deliver`
invocations against append-only comments could otherwise both observe "no
intent" and both post. State the read-after-write / mutator-lock requirement
explicitly so the invariant is not left to timing.

[finding:F-004] **Post-delivery branch/worktree cleanup is unaddressed.** After
squash delivery the governed branch commits are unreachable from trunk; the
spec covers "release the binding" in `close` but says nothing about retiring
the source branch/worktree. A one-line pointer to the existing end-of-task
cleanup procedure would close the loop. Nit.

## Decision rationale

Accepted. The transaction boundary, exact-head protection, provider-portability
via the declarative `externalActions` capability, fail-closed recovery, and the
explicit authority split are the strongest repository-compatible answer to
issue #939, and the design correctly declines the weaker reorder-in-`close` and
auto-merge-primary alternatives. F-001 is the only finding touching a
load-bearing invariant; it is a specification tightening covered in spirit by
AC6 and should be nailed down in Refine, not re-architected. F-002 through
F-004 are localized clarifications for Refine/Plan.
