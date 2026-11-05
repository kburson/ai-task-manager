<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-cb2d52eb0bf6d07a76faee7525245b87"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-11-05-2161-first-child-epic-convergence.md"
artifact_commit: "ed3d380912acccd481e40b403fdd83a813d94acb"
artifact_blob: "639895e7bd84f09cdef15982e11539e3842e3b14"
artifact_digest: "sha256:d2d9e42820801338305fbd959b2e9d115a3f6f6ee4ac8ee76d144f0eb2cd6b6e"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:3f165d8f1034d2545c4bd50ca079bf13239ba58c1216848c6e46566b01d6d3d0"
  identity_source: "runtime"
started_at: "2026-11-05T15:40:08.384Z"
submitted_at: "2026-11-05T15:54:23.180Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the implementation plan (`docs/superpowers/plans/2026-11-05-2161-first-child-epic-convergence.md`, commit `ed3d380912acccd481e40b403fdd83a813d94acb`, blob `639895e7bd84f09cdef15982e11539e3842e3b14`) against the accepted spec (blob `0a3ebca6595ee80ebdcebf60acd7191b617161c1`) and current source.

**Spec traceability.** Every accepted spec requirement maps to a task:

- The private non-serializable reader, with a zero-child ordinary branch: Task 1, Interfaces.
- The separate `childInventory`, with non-Epic readiness left not-applicable: Global Constraints and Task 1 Step 3.
- `requirePlan:false` at every canonical check, including after the body becomes Epic, plus the already-Epic/no-plan regression (my round-2 optional suggestion 1): Global Constraints, Task 1 Step 4, and Task 2 Steps 1 and 3.
- Prospective parent admission before `ghCreate` and independently before project/link writes, with zero-write foreign/unbound tests: Task 1 Step 4 and Task 2 Step 4.
- Exclusion of #2162: Global Constraints, Task 2 Step 4, and Native Delivery.
- Truthful `kind` status output: Task 2 Step 3.
- Budget and dispatch assertions: Task 1 Step 3.

The plan also resolves my round-2 optional suggestion 2. A prospective create under a parent that is already anomalous (non-Epic with existing children) refuses with a recover-kind-first instruction. The #2157 qualification step orders `kind` recovery before creating tasks 2–4.

**Source anchors.** The plan's references hold up in source:

- `assertGovernedMutationSession` exists at `scripts/task-tracker/verbs/issue-body.mjs:268`. It is a pure state check, so it is a reasonable extraction into a leaf with a compatibility re-export.
- `captureArtifactOperator` exists at `scripts/task-tracker/lib/artifact-execution.mjs:73`. It already validates session id, binding generation, bound issue, worktree path/branch and closed state, so reusing it covers most of the spec's frame requirement without new authority code.
- `scripts/gh/create-issue.mjs` has `ghCreate` at `:250`, called at `:553`, after the existing parent-state gate (`:386-430`) and duplicate-sibling check. That gives a well-defined pre-create insertion point.
- The plan explicitly says the new admission cannot be skipped by the existing `AITM_SKIP_PARENT_STATE_GATE` override. That is the right call.
- The other referenced test and guide paths exist: `epic-metadata.test.mjs`, `coverage-kind.test.mjs`, `package-boundary.test.mjs`, `decomposition-hook-traffic.integration.cases.mjs` and `docs/guides/decomposition-recovery.md`.

**Structure.** Two TDD tasks, each with a RED step, a named commit and verification commands, are appropriate. Review Focus items 1–5 each name the task and test that covers them.

One verification gap remains, and it is small.

## Findings

1. **The verification commands omit the ordinary-guard regression the plan relies on (medium).** Review Focus 5, Task 1 Step 5 and Task 2 Step 5 all require proof that the ordinary hook collector's `non-epic-child` refusal is unchanged. The spec also says to "Preserve the actual existing general guard tests, especially the `non-epic-child` fixture in decomposition hook traffic." That fixture lives in `scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.cases.mjs`. It runs only through `scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.test.mjs` (and `refinement-traffic-budget.integration.test.mjs`). Neither Task 1's nor Task 2's `node --test` command lists that runner. Under this repo's evidence-gated workflow, the VC commands are what get executed and stamped. A collector refactor (Task 1 Step 3 changes the shared private implementation) could therefore pass both tasks' cited verification while regressing the strict guard. It would only be caught in the Test-stage full suite. This is exactly the leak Review Focus 5 is meant to prove absent at Develop time.

## Required changes

1. Add `scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.test.mjs` to Task 1's verification command, since Task 1 is where the collector refactor lands. Also add it to Task 2's command, or to the root VC enrichment in "Verification and Native Delivery". Then the ordinary `non-epic-child` refusal is cited, executed evidence for both commits.

## Optional suggestions

1. **Session identity across subprocesses.** `captureArtifactOperator` resolves the session via `currentSessionId()` → `resolveSessionId({ env: process.env, ... })` (`scripts/task-tracker/word-counter.mjs:121-127`). That function falls back to the truthy `'default-session'` instead of null. The automatic path runs as nested subprocesses (`split-plan` runCreator → `create-issue.mjs` → `project-tether.mjs`), and the prospective and canonical checks run inside them. The integration suite should drive the real subprocess chain and assert two things: the parent's provider session is inherited, and a missing or stripped session env refuses instead of resolving to a `default-session` binding. This turns an implicit environment assumption into a tested contract.
2. **Estimate risk.** 6h / Size M covers several pieces of work: a collector refactor with an exceptional branch and remote-state additions, a new shared leaf, prospective admission across two processes, a fenced multi-effect transaction, `kind` routing, a real-Git integration suite with a synthetic provider fixture, package-boundary accounting and a guide note. The plan's self-review already commits to stopping and replanning if work exceeds the bound. Consider recording 3h-per-task actuals at each commit so the overrun decision is evidence-based rather than retrospective.
3. Task 1 Step 3 says "Add remote state to the real query/fence as needed without requiring it from old ordinary injected snapshots." Make it explicit that the ordinary entry's query shape and dispatch count stay byte-identical. The existing hook-traffic budget tests assert traffic shape, so any change to the shared query also needs a deliberate update there.

## Decision

revisions-requested
