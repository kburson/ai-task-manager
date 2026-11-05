<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b57970a7c94c1361badac64a34cc751b"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-11-05-2157-timing-reengagement-repair.md"
artifact_commit: "c23dee494bf2bfc2bcf900d58b938ec02fbba54f"
artifact_blob: "f5ef6f4901363ce6b0250006e8a917f09d0acbcb"
artifact_digest: "sha256:fbf8467b6522faa352d6a4c6236029f87e642ca5db04b85bc9e4d5424902953d"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:98faf62d9aab0f6315ac31cb8bd2cee591251bf6085de8cc965d3ae4d2afea79"
  identity_source: "runtime"
started_at: "2026-11-05T13:37:29.051Z"
submitted_at: "2026-11-05T13:49:11.950Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

This is the plan-phase review of `docs/superpowers/plans/2026-11-05-2157-timing-reengagement-repair.md` (commit `c23dee49`), checked against the spec accepted in turn 2 (`53201615`).

**Anchors verified.** Every source anchor and file-map path that should already exist does exist:
- `locks.mjs::withLock`
- `gh-timing-comment.mjs::readCanonicalTimingSource` and `updateTimingComment`
- `lib/artifact-execution.mjs::captureArtifactOperator`
- `lib/agent-review/bootstrap.mjs`
- `verbs/review.mjs::resolveReviewVerificationEvidence`
- `queue.mjs::drain`
- `task-tracker.mjs`, `verbs/help-data.mjs`, `lib/command-surface/catalog.mjs`
- the four named existing unit tests and `install-content.test.mjs`
- `skill/shared/router.md` and `skill/shared/rules/evidence.md`
- `docs/workflows/`, `scripts/tests/fixtures/` and `scripts/tests/integration/task-tracker/lib/`

**Spec coverage.** The plan covers the accepted spec faithfully:
- The 20,000 ms bound uses the existing empty-directory format, with inode/deadline ownership checks and a fix for the failed-reclaim path.
- Contention is handled through the real `postTimingSafely` queue and drain, with no draining under the lock.
- Only `receipt-v1` Test evidence is accepted.
- `normalizedBody` gets a typed refusal.
- Evidence uses the fixed namespace with ignore validation before anything is retained.
- It also folds in all three of my turn-2 optional suggestions: the mutation-timeout reservation (Task 2 Step 6), the install-observer drift and upgrade test (Task 3 Step 4), and the operator-guide text on uncertain results and the residual race (Task 3 Step 5).

**Remaining issue.** The decomposition and estimate are unrealistic for Task 2, and that undercuts the "honest planned estimate" gate the spec itself requires. The other points are optional.

## Findings

1. **Task 2 is too large for one 2-hour task, and its single commit is too coarse.** Task 2 contains:
   - three new production modules: the pure grammar/candidate/digest module, the filesystem evidence leaf, and the native verb wrapper;
   - a compatible extension to the canonical census;
   - three test suites: a pure matrix, filesystem evidence cases including symlink, partial and corrupt artifacts, and a real-Git native integration fixture with session/binding/occupancy, a second registered worktree and ownership drift;
   - a failure-injection matrix of about ten transaction cases.

   All of that lands in one commit (Step 8). For comparison, Task 1 is a single primitive plus one integration suite, also at 2 hours. In this repo, real native fixtures (for example `scripts/tests/fixtures/review-entry-history.mjs` and `current-plan-approval*.mjs`) are substantial on their own. A 6-hour total where a third of the time covers all of this is not an honest estimate. One commit across three modules also means a mid-task failure leaves no reviewable checkpoint. The spec's verification section explicitly calls for an "honest planned estimate", and the self-review admits that 6 hours is an author assessment.
2. **The Develop→Test alternative shape is not named in the pure test matrix.** Task 2 Step 1 names the observed #2147 triple (`demoted:develop`/`resumed`/`develop:started`) and "two original-snapshot candidates". It does not name the authenticated `develop:completed`/`resumed`/`test:started` shared-transition alternative that the spec (line 23) and the predicate (`heal-timing-departure.mjs:288-313`) accept. Nor does it name a mixed selection with one triple of each shape. The stricter removable-row admission ("no actor marker, no trailing metadata") overlaps with `sharedZeroWorkTransition` differently for each shape, so both need explicit coverage.
3. **Exit codes do not separate refusal from uncertainty.** Task 3 uses exit 1 for both authority refusal and postwrite uncertainty. The spec requires uncertain outcomes to be "indicated distinctly", and the right operator action differs: retry with the same digest after uncertainty, versus investigate after a refusal. A typed code in the output satisfies the letter of the spec, but a distinct exit status lets wrappers and agents branch without parsing prose.
4. **Run-together tokens recur.** Examples: "bounded20,000ms", "rows54/55/56", "exits2 for grammar,1", "qualified2147", "Refine4", "Task1". This is cosmetic, but the same issue was fixed in the spec in turn 1.

## Required changes

1. Split Task 2 into at least two committed tasks: (a) the pure grammar/candidate/digest module plus the evidence leaf and their unit suites, and (b) the native wrapper/transaction plus the real-Git integration and failure-injection suites. Each should have its own failing test, implementation, passing run and `[#2157]` commit. Re-derive the total estimate from the resulting task list rather than keeping 6 hours by construction. If the honest figure changes Size (M→L), say so in Plan Metadata.

## Optional suggestions

1. In the pure suite, add explicit cases for the `develop:completed`/`resumed`/`test:started` alternative and for a mixed two-triple selection with one of each shape. Include near misses specific to the shared-transition form: move-ID mismatch, non-whole-second timestamps, and an extra `aitm-transition` marker.
2. Give postwrite uncertainty its own exit status (for example 3), separate from refusal (1) and grammar (2). Assert it in the Task 3 lost-response subprocess test.
3. Have check-only report the elapsed in-lock observation time and the remaining budget. A check that would leave too little budget for the mutation reservation and readback then tells the operator before apply, instead of the apply turning uncertain.
4. Fix the run-together numeric tokens throughout.

## Decision

revisions-requested
