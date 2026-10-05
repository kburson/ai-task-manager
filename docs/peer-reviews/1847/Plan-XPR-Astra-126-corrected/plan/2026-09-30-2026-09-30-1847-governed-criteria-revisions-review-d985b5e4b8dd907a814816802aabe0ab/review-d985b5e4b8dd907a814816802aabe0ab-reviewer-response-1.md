<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-d985b5e4b8dd907a814816802aabe0ab"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md"
artifact_commit: "30e59a7699695c1a9e4bf3b364f6861c2a144743"
artifact_blob: "cce6215e70af825eddcb9891b4427b1766e59f6b"
artifact_digest: "sha256:62b70494e616d29e1a15fee50b51d308093d869de3883f8989011bd8bd4da244"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:7773058b89daee9d32d62e82ba08182c0e688cf3cb2dc951876ad76219342188"
  identity_source: "runtime"
started_at: "2026-09-30T15:59:55.339Z"
submitted_at: "2026-09-30T16:01:36.035Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the plan against the spec at
`docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md`
(Interface, Authorization, Stage boundaries, Semantic identity, Durable log,
Application transaction, Recovery, Consumer integration, Explain, and Verification
sections). I also checked that the named baseline paths exist in the worktree at
the reviewed commit.

Every baseline path the plan names exists. That includes `issue-body-mutate.mjs`,
`versioned-issue-write.mjs`, `issue-body-push.mjs`, `issue-mutator-lock.mjs`,
`repository-adapter.mjs`, the `github-records/` modules (`contract-write`,
`capsule-chain`, `delivery-contract`, `record-envelope`, `projection-repair`,
`lifecycle-transition`, `singleton-initializer`), `verbs/adopt-github-records.mjs`,
`activity-guard.mjs`, `source-edit-gate.mjs`, `plan-approved-guard.mjs`, the named
verbs, `scripts/gh/move-state.mjs`, `bin/aitm-registry.mjs`,
`skill/shared/router.md`, the two existing regression tests in Task 3, and the
Refine evidence report.

The plan is well structured. The sequence 1→6 respects real dependencies, the
estimates add up to the 48h decomposition input, and the spec's hard rules are
carried into Global constraints: raw-message authorization, the 60,000-byte
ceiling, no rollback of retired proof, the bounded Develop reapproval, and the
Test/Review limitation. The acceptance-coverage table maps sensibly.

Three problems are material. One test placement will fail an existing
repository gate. Canonical recovery has no owning file in the task that
introduces canonical writes. Task 5's concrete file list leaves out consumer
entry points that the plan's own inventory and the spec require. There is also
one smaller traceability gap.

## Findings

1. **Task 2 puts real linked-worktree tests in the unit lane, which the
   repository gate rejects.** Task 2 creates
   `scripts/tests/unit/task-tracker/lib/criteria-revision/interlock.test.mjs`
   (and siblings) and requires "red tests with two real temporary linked
   worktrees sharing one common directory." To build those worktrees the test
   has to spawn `git` (`git worktree add`) or use a project sandbox helper.
   `scripts/tests/unit/meta/unit-lane-purity.test.mjs` (#1413) fails any
   unit-lane file, including its transitive test-tree imports, that trips the
   `git-spawn`, `node-spawn`, or `sandbox` signals. Its stated remedy is "move
   the offending file to `scripts/tests/integration/`, not to widen the
   classifier." As planned, Task 2's Verification Command would either break the
   unit-lane purity gate during full-suite Test or force the implementer to
   weaken the real-worktree requirement. The same risk applies to any Task 5
   unit test that exercises subprocess delegation or real holder liveness. Task
   5's A/B contention case is already under `integration/`, which is correct.

2. **Task 4 has no file ownership for canonical recovery in the shared engine.**
   Task 3 creates `engine.mjs`, `reducer.mjs`, and `store.mjs` with
   `applyRevision` and `recoverRevision`, and wires only the legacy write set
   (`deriveLegacyWrites`). The spec's recovery table has canonical-specific
   states: "Planned amendment capsule exists; contract projection is before",
   "Canonical contract is after; body or other planned projections are before",
   and "Required canonical grant expired, revoked, or replaced". It also fixes
   the canonical write order as capsule → contract projection → other
   projections → body. Task 4 red-tests "capsule-before-projection
   interruption" and exports `applyCanonicalRevision`, but its Files list only
   adds `canonical.mjs` and `plan-approval.mjs` plus github-records and
   Plan-approval modifications. It does not modify `engine.mjs`,
   `reducer.mjs`, or `status` classification. So one of two things happens.
   Either canonical application and resource-vector prefix recovery go through
   a second orchestration path, which contradicts "Later tasks consume named
   interfaces, not copies or divergent implementations". Or the needed engine
   changes are unplanned. In both cases the canonical crash-prefix obligation
   (parent coverage row "Stale/foreign/ambiguous input refusal and exact crash
   recovery") has no owning implementation step.

3. **Task 5's concrete file list leaves out consumer entry points that the
   inventory and spec require.** The spec's consumer table requires promote,
   demote, and lifecycle transition effects to refuse while pending. It also
   requires AC/VC/DoD execution and stamping to refuse pending and to bind to
   the current revision. The plan's inventory names promote, reconcile,
   `dod-stamp`/`check`, evidence-v2 eligibility/subject/runtime-adapter,
   `develop-exit-receipt-guard`, `lifecycle-transition`, and the Review guards.
   Task 5's Files list names only `ac-stamp`, `plan-approve`, `test`,
   `approve`, `demote`, `deliver`, `close`, and `move-state`, then ends with
   "binding/session admission, verification receipt retirement and
   projection/reconciliation entry points identified by the inventory".
   `verbs/promote.mjs`, `verbs/review.mjs`, `verbs/dod-stamp.mjs`,
   `verbs/check.mjs`, `verbs/reconcile.mjs`, and
   `github-records/lifecycle-transition.mjs` all exist and are not named.
   Chokepoint coverage through `issue-mutator-lock.mjs` or
   `versioned-issue-write.mjs` may catch writes. It does not catch the
   read-side binding requirement: dod-stamp/check must bind generated proof to
   the current revision, and Review must reject pre-revision aggregate evidence.
   The plan says "Listing command names alone is not sufficient", but the
   highest-risk task's executable file list is the least concrete. The
   `REVISION_CONSUMER_COVERAGE` loop only proves what it lists. If it is built
   from this partial list, it gives false assurance.

4. **No task owns the spec's six typed Explain outcomes.** The spec (Explain and
   audit behavior) requires the outcomes `criteria-revision-required`,
   `revision-pending`, `revision-conflict`, `revision-authorization-required`,
   `revision-approval-stale`, and `revision-topology-unsupported`, each with a
   registered next action, and forbids advice to bypass marker loss or jump a
   stage. Task 5 says only "exact typed reason and supported action". Task 6
   says "typed Explain mapping". Neither names the six codes, where they are
   registered (the actual Explain/guidance catalog), or a test asserting their
   next actions and the forbidden-advice exclusions. The coverage table assigns
   "Help, Explain, supported recovery" to Tasks 5 and 6 without that
   specificity.

## Required changes

1. Move the real-linked-worktree, sibling-process, and holder-liveness tests for
   Task 2 into `scripts/tests/integration/task-tracker/lib/` (for example
   `criteria-revision-interlock.test.mjs`). Keep only pure logic that uses
   injected fs/process fakes in the unit files. Update Task 2's Files and
   Verification Commands to match. Apply the same rule to any Task 5 test that
   spawns subprocesses or builds a git sandbox.
2. In Task 4, add explicit modifications to `criteria-revision/engine.mjs`,
   `reducer.mjs`, and status classification (or name the Task 3 interface that
   takes a pluggable authority-specific write-set adapter, and state that Task 3
   must ship that seam). Add red tests for each canonical recovery-table row:
   capsule-present/projection-before, contract-after/body-before, and
   grant-expired/replaced leading to `revision-authority-unavailable`. Run them
   through the shared `recoverRevision`.
3. In Task 5, list every consumer file concretely. At minimum add
   `verbs/promote.mjs`, `verbs/review.mjs`, `verbs/dod-stamp.mjs`,
   `verbs/check.mjs`, `verbs/reconcile.mjs`,
   `lib/github-records/lifecycle-transition.mjs`,
   `lib/github-records/projection-repair.mjs`, the evidence-v2 and
   develop-exit-receipt-guard modules, and the exact binding/session-admission
   and verification-receipt-retirement files. Also state that
   `REVISION_CONSUMER_COVERAGE` is checked against the source-walker audit, so
   an unlisted root seam fails `coverage.test.mjs` and a hand-maintained list
   cannot pass.
4. Assign the six spec Explain outcome codes to a named task (Task 5 policy, or
   Task 6 CLI). Name the registration file and add a test asserting each code's
   registered next action and the absence of marker-loss-bypass, stage-jump, or
   old-receipt reconstruction advice.

## Optional suggestions

1. Put the illustrative test snippets in Tasks 1–5 in fenced code blocks. As
   written they are unfenced indented prose inside list items, so Markdown
   rendering and prettier reflow can corrupt them.
2. Task 2's tests should cover the spec rule that domain movement or disabling
   while a revision is pending refuses. Only Scope mentions it today, and Task 6
   `enable` is the only other place it could land.
3. State explicitly that children delivered before Task 5 expose no reachable
   mutation path. Tasks 3 and 4 introduce an internal retirement capability
   before consumer fences exist. This is safe only while no CLI or registered
   action reaches it, and a sentence plus a coverage assertion would make that
   ordering invariant auditable.
4. Task 1 should state which module hosts the opt-in raw host-message
   observation export ("extend the host loader"), because the spec forbids
   letting normalized loader output prove raw equality.

## Decision

revisions-requested
