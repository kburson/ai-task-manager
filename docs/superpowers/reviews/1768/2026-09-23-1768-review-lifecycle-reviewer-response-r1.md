# Manual peer review: Claude reviewer response, round 1

- Issue: #1768
- Reviewer: Claude Opus 5
- Reviewed artifact: `docs/superpowers/specs/2026-09-22-1768-review-lifecycle-design.md`, version 3 at `59e63f591045c839b35a155e6d33f322b8fd1e03`
- Source: reviewer-authored response copied from the local draft below; no `ai-peer-review` submission or acceptance occurred
- Original draft: `docs/peer-reviews/spec/2026-09-23-2026-09-22-1768-review-lifecycle-design-review-80c813f0f96ca4e89434a7012676243b/review-80c813f0f96ca4e89434a7012676243b-reviewer-response-1.md`

## Summary

The design is coherent at the level of intent. Its central bet — capture ideas
cheaply, defer hosted review until the issue number exists, and keep JIT
discovery from being frozen by an earlier ratified plan — is the right shape,
and Decision 7 plus AC7 defend it explicitly. The provenance model (exact path,
version, commit; digest acceptance for issue-resident content) is the correct
authority primitive, and the honesty constraints around capability degradation
(§Review ownership, AC8) are stated with the right force: an unavailable SPR/XPR
is never reported as passed.

What the document does not yet do is specify the behavior an implementer has to
write. Three areas are under-determined to the point of being unimplementable
without inventing policy: the ordering of epic hydration relative to child
Refine (§Plan review and epic hydration), the evaluator and failure semantics of
the risk rubric (§Specification review in Refine), and the identity primitives
the receipts depend on (`issue revision`, artifact `version` authority). Two of
these are not merely vague — as written they describe loops or deadlocks that
will occur on the normal path, not in edge cases.

I checked the repository claims the design leans on. `brainstorm` is already an
alias of `discover` (`scripts/task-tracker/verbs/help-data.mjs:851`), and the
WBS `Source-plan` family is real and consumed by the coverage guard
(`scripts/task-tracker/lib/decomposition-wbs-coverage.mjs`). Decision 6's
promise to add no new per-child provenance fields is therefore consistent with
what exists today. I did not find a contradiction between the spec's account of
current AITM contracts and the code.

Scope note: I reviewed this as a design specification, against internal
consistency, implementability, and stated ACs. I did not evaluate whether the
overall lifecycle is the right product decision; the Status-and-scope section
fences that appropriately.

## Findings

### Finding 1 — Hydration SAR and child Refine are ordered such that the aggregate review may never converge (blocking)

§Plan review and epic hydration states that each hydrated child "moves from
Backlog through Refine to Ready for Planning," that an aggregate hydration SAR
"compares the complete child inventory to the exact ratified master plan" and
checks "story and AC meaning, and R4P readiness," and that the receipt records
"a digest of each reviewed child body at that moment." It then states: "Before
epic Plan exit, AITM rechecks the inventory and body digests. A changed child
body or inventory requires another aggregate SAR; unrelated issue metadata does
not."

The document never fixes when the aggregate SAR runs relative to the children's
Refine passes. Both readings fail:

- If the aggregate SAR runs at hydration time (before the children are refined),
  it cannot check "R4P readiness," because no child is in R4P yet. Worse, every
  child body is then guaranteed to change afterwards — §Specification review in
  Refine defines Refine as the stage that "updates the issue's user story,
  scope, ACs, labels, priority, size, and estimate." Those are body changes, not
  "unrelated issue metadata." So the recheck before epic Plan exit fires for
  every child, every time, forcing a second aggregate SAR whose own receipt is
  then stale the moment any child is touched again.
- If the aggregate SAR runs after all children reach R4P, the text "drives
  governed child creation and hydration. Each new child moves ... to Ready for
  Planning" followed by "An aggregate hydration SAR compares the complete child
  inventory" is merely ambiguous rather than wrong — but then the design must
  say that hydration does not conclude until every child is in R4P, and must say
  what happens when refining child 5 reveals that child 2's boundary was wrong.

This is the highest-cost gap in the document. The aggregate SAR is the gate on
epic Plan exit (AC6), so a non-converging definition of it blocks every epic.

Required: state the ordering explicitly, and define the digest baseline as being
taken at the moment the aggregate SAR accepts (post-Refine), not at hydration.
State what a child body change after an accepted aggregate receipt costs — a
full re-run, or an incremental re-check scoped to the changed children.

### Finding 2 — Master-plan revision before epic Plan exit creates a re-review cycle with no stated termination (blocking)

§Artifact versions and provenance: "Before epic Plan exit, a changed master plan
also requires reconciliation of child source fields and the aggregate mapping."
Child source fields are `Source-plan`, `Source-plan-commit`, and
`Source-plan-section` (Decision 6), which live in the child body. Reconciling
them therefore changes every child body, which by §Plan review and epic
hydration "requires another aggregate SAR."

If that aggregate SAR produces a finding that is best fixed in the master plan,
the plan's version increments, which again requires reconciliation of child
source fields, which again changes every child body. The document describes the
cycle but never bounds it.

Required: either declare `Source-plan-commit` reconciliation exempt from the
body-digest recheck (it is provenance bookkeeping, not semantic content, which
is the same distinction the design already draws for "unrelated issue
metadata"), or state an explicit convergence rule and round limit.

### Finding 3 — The risk rubric has no named evaluator, and "unknown blocks" makes that omission a deadlock (blocking)

§Specification review in Refine calls the assessment "deterministic" and
versions the rubric at `v1`, then lists six signals. Three of them are not
mechanically decidable from the artifact:

- "multiple subsystems/providers" — requires a judgment about subsystem
  boundaries;
- "repeated material SAR findings" — requires a materiality judgment over round
  history;
- "security/privacy or irreversible data/migration impact" — requires reading
  intent, not syntax.

The document then states: "Unknown signal values also block selection rather
than defaulting to low risk." Combined with "Full-Auto selects the review path
without a per-story human prompt" (§Review ownership), an unattended run that
cannot resolve any one of six judgment signals halts with no defined operator
affordance.

Required: name who or what produces each signal value (author declaration in
frontmatter, the SAR agent's structured output, or a deterministic scan), and
define the Full-Auto behavior on an unresolvable signal. Blocking is a defensible
choice — the honesty constraints elsewhere in this design argue for it — but it
has to be a stated, surfaced block with a recorded reason, not an implicit stall.

### Finding 4 — The capability ceiling is fixed at preflight but consumed after SAR, and mid-flight loss of `ai-peer-review` is undefined (blocking)

§Specification review in Refine: "With `ai-peer-review` healthy at review
preflight, low risk ends at SAR, moderate risk adds SPR, and high risk adds SPR
then XPR. When it is not installed or cannot be used at preflight, the available
path is SAR."

Preflight precedes SAR; the risk score is computed after SAR. So the ceiling is
latched before the score that consumes it exists. If the package is healthy at
preflight and unavailable when SPR would actually start, the design's own rules
give a contradiction: the ceiling says SPR/XPR is available, the runtime says it
is not, and §Review ownership says the issue "does not advance ... on an
unaccepted artifact." The issue is then stuck in Refine with no SAR-only
fallback, because the SAR-only fallback is conditioned on preflight state that
has already passed.

Required: state whether the ceiling is re-evaluated at the moment each hosted
round is attempted, and what a healthy-then-lost package produces — a recorded
block, or a documented downgrade to SAR-only with the degradation recorded
(which AC8 would then need to permit explicitly).

### Finding 5 — `issue revision` is not a primitive GitHub exposes (blocking)

§Plan review and epic hydration: "The Deep-Dive receipt identifies the exact
issue number, reviewed Deep-Dive section digest, issue revision, and digest of
the issue scope, AC, verifier, and dependency fields plus estimate."

GitHub issues have no monotonic revision counter. The nearest available values
are `updatedAt`, which advances on label, assignee, and comment activity — the
very "unrelated issue metadata" this design deliberately wants to ignore — and
the body content itself, which the field digests already cover.

Required: define `issue revision` concretely, or remove it. The enumerated field
digests already provide the change detection the sentence is reaching for, and
they have the correct sensitivity; `updatedAt` does not.

### Finding 6 — Artifact `version` has no stated authority relationship to commit, and no violation behavior (blocking)

§Artifact versions and provenance: "Every committed change to an artifact's
bytes increments its version by exactly one" and "A review round identifies the
exact committed artifact path, version, and Git commit." AC4 restates the rule.

Three things are unstated:

1. Which field is authoritative when they disagree. A commit identifies bytes
   exactly; a version does not. If a fixup commit reuses version N, two distinct
   commits claim version N, and a receipt naming "version N" is ambiguous while
   a receipt naming the commit is not.
2. What detects a violation. The rule is expressed as an obligation on the
   author with no guard named, in a design whose whole premise is that
   provenance must be mechanically checkable rather than asserted.
3. What happens on violation — refuse the review round, refuse the state
   transition, or record and continue.

Required: declare the commit authoritative and the version a human-readable
ordinal, state where the monotonicity check runs, and state the failure mode.

## Required changes

1. Fix the hydration ordering (Finding 1). State whether the aggregate SAR runs
   before or after the children's Refine passes, and take the child body digest
   baseline at aggregate-SAR acceptance rather than at hydration.
2. Bound the master-plan revision cycle (Finding 2). Exempt `Source-plan*`
   reconciliation from the semantic body-digest recheck, or state an explicit
   convergence rule.
3. Name the risk-signal evaluator and define Full-Auto behavior on an
   unresolvable signal (Finding 3).
4. Define capability-ceiling re-evaluation and the healthy-then-lost path
   (Finding 4).
5. Define or remove `issue revision` (Finding 5).
6. Declare commit-versus-version authority, the monotonicity guard's location,
   and the violation behavior (Finding 6).

## Optional suggestions

1. Reconsider the rubric weights (§Specification review in Refine). With weights
   {3, 3, 3, 1, 1, 1} and bands 0-1 / 2 / 3+, a score of exactly 2 is reachable
   only by combining exactly two of the three low-weight signals and none of the
   high-weight ones; any single high-weight signal jumps straight to SPR-then-XPR.
   The SPR-only tier is therefore a narrow accident of the arithmetic rather than
   a designed band. If SPR-only is meant to be a common outcome, the weights or
   the bands need adjusting.
2. Specify where the `/task new` operation ID lives (§Brainstorming and issue
   creation, step 1). "Put the operation ID in the creation payload" has to
   resolve to a concrete location — a body marker, which this repository governs
   through `preflight-issue.mjs` and the body-invariant marker set, or a label.
   A new body marker in particular needs to be declared as an invariant, or
   `mutateIssueBody` will treat its later loss as unremarkable.
3. Note search-index latency in the reconciliation path (same section). "Zero or
   multiple matches refuse another create until reconciled" is the safe rule, but
   GitHub's issue search is eventually consistent, so a zero-match result shortly
   after a lost response is not evidence of non-creation. The refuse-and-require-
   reconciliation outcome is correct; the document should say that this path is
   expected to be hit by ordinary indexing lag, not only by genuine failure, so
   implementers do not treat it as rare.
4. Bind the bytes that the pre-issue self-review covered (§Brainstorming and
   issue creation). Decision 1 makes the Superpowers self-review sufficient for a
   Backlog stub, but the self-reviewed artifact is an unversioned scratch save
   and version 1 is only stamped later at promotion. Nothing records which bytes
   were self-reviewed. A digest recorded in the idea record would close this at
   negligible cost.
5. Add acceptance criteria for two behaviors the body treats as normative but
   the AC list omits: the review-attempt limit (one initial governed attempt plus
   at most one recovery, §Review ownership) and Decision 6's commitment to add no
   new per-child provenance fields. As written, neither is independently
   verifiable at acceptance time.

## Decision

revisions-requested
