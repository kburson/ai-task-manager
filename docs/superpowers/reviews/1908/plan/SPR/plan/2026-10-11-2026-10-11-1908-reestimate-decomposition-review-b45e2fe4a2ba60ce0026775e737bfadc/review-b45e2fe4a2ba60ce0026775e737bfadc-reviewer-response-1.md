<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b45e2fe4a2ba60ce0026775e737bfadc"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-11-1908-reestimate-decomposition.md"
artifact_commit: "e3a2168b2d2bd7cbe6f7f5938fae98b33f2b09f9"
artifact_blob: "528271d1a6b39b9dbc70a040c08e458b267ae4ad"
artifact_digest: "sha256:bfcd27815f4d575873b57ebc1b5d4fcb0e3c93473639db5121960e302dcf4ddd"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:12c088e42d7d89f481e75d8d571acbfbe006a31f980a8cde12ace72e3710d43b"
  identity_source: "runtime"
started_at: "2026-10-11T15:09:22.196Z"
submitted_at: "2026-10-11T15:14:50.425Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revisions requested. I read the complete plan and accepted specification and traced the principal publication, continuation, native-hook, kind/split and no-commit completion paths. The overall architecture is feasible: shared policy, independent pending-publication authority, fresh observations, resumable registered effects, and preservation of existing lifecycle/ownership gates are appropriate. However, the closed kernel input cannot carry the data needed for the promised independent complexity signals, the mandatory final writer census is deferred and misses real semantic writers, and no-commit completion enforcement lacks a concrete production boundary and verifier assignment.

The plan SHA-256 is `bfcd27815f4d575873b57ebc1b5d4fcb0e3c93473639db5121960e302dcf4ddd`, matching the generated header. The complete specification SHA-256 is `3aa7382fdb05c1151d95fb0a74745b0ecf610671086db5e22545682e1ac554d4`, matching the accepted-spec pin in the plan. Both were verified with `shasum -a 256`. No Git command was run; the historical source-baseline commit was not independently queried through Git.

## Findings

1. **F1 — High: the closed pure-kernel input omits plan complexity data.** Plan lines 75–81 define the normalized input, with `plan` restricted to `{path, commit, section, digest, availability}` and observations restricted to identities/revisions/digests. There is no selected plan text, parsed task representation, task count, or verification-group count. Nevertheless, Tasks 1/2 require pure `assessDecomposition(input)` to preserve task/group/XL signals and produce their values and thresholds. The actual classifier, `scripts/task-tracker/lib/decomposition-policy.mjs:156–176`, derives those signals by calling `extractPlanTasks(planText)` and counting tasks with commands. A digest identifies bytes but cannot supply those counts. A 23-hour M story with four selected tasks must produce a different mandatory result from a 23-hour M story with one task; the specified identity-only plan object cannot supply that computation. Implementing the contract literally either drops mandatory signals, requires undeclared I/O in the pure kernel, or forces an incompatible schema change after Task 1 lands. The existing Plan-exit adapter also consumes `classification.tasks` for materialized WBS readiness, so the division between classifier inputs and persisted projections must be explicit. This conflicts with the accepted spec's pure-classifier and independent-signal requirements (spec lines 44–52, 63, 132).

2. **F2 — High: the mandatory final adapter census is still future work and misses cancellation/shelving estimate effects.** The accepted spec requires the implementation plan to classify each effectful generic caller and assign its verifier (the final audit paragraphs under “Minimum concrete adapter and verifier map”). Plan line 135, Task 3 Step 4 and Task 7 Step 2 defer that completion until implementation. The omitted entries are substantive: `scripts/task-tracker/verbs/cancel-plan.mjs:72–95` restores body and board estimates from snapshots; `:235–241` clears the planned proposal; `:257–289` restores old body/board/proposal state on failure; and `:295–340` changes body and board before its separately authorized lifecycle transition. Routing only its nested tether/comment helpers through independent publishers cannot establish one operation owner before the first body effect or define cancellation/compensation outcomes. Also, `scripts/task-tracker/lib/shelve-transaction.mjs:46,150–159,228–236` clears Estimate/Size on both board and body through `clearProjectFieldValue` and `ensureIssueFieldDb`; it is neither mapped nor given a source-backed exclusion. The audit must classify clear operations and rollback callers as well as setters. These routes matter when an oversized proposal is retired, an estimate is restored from a Refine snapshot, or an older pending publication must survive recovery. The writer-ID enum and exclusive ownership table do not assign these orchestrators. Deferring their disposition risks incompatible nested operations, stale authority or broken recovery, and leaves Task 3's scope/estimate unsupported by the required complete audit.

3. **F3 — Medium: no-commit completion is promised but has no explicit enforcement adapter or test.** The accepted spec's issue-kind clarification restricts substantive audit/research/spike publication and no-commit completion evidence; converted epics likewise cannot gain completion admission before materialized readiness. Task 5 names native edit/shell hooks and tests “new scoped document/no-commit deliverables,” but never identifies the remote completion/evidence boundary, its action/capability mapping or owning verifier. This path differs from local file mutation: `scripts/task-tracker/lib/code-complete-gate.mjs:265–371` accepts the audit/research/spike lane using a deliverable marker and returns without commit/dirty-file inspection. `scripts/task-tracker/lib/action-decision/test.mjs` supplies production Test-entry observations, while the plan's concrete continuation integration is start/resume/Explain. The current Bash classifier in `activity-policy.mjs` defaults unmatched commands to `READ_*` at the end of `classifyBash`, and `source-edit-gate.mjs` gates its supported file-edit tools. File-target fixtures therefore do not prove that sanctioned remote evidence/transition operations are recognized scoped-deliverable effects. The plan could implement its listed hook fixtures while leaving this requirement unproved. Identify the existing registry/preflight boundary or dedicated adapter that will enforce fresh admission before those effects and test the actual path. This does not request a blanket ban on Test/Review, diagnostics or legitimate checkpoint/history operations.

## Required changes

1. **For F1:** Separate runtime classifier input from the compact persisted record, or extend the closed input with a validated selected-plan representation sufficient to derive every existing signal. Specify its provenance, digest relationship and absent/unavailable behavior. Keep the kernel pure and records bounded; pin Task 1/2 interfaces before parallel consumers begin. Test equal size/estimate with different task/group structures, selected child sections, and XL/group combinations. Show that the collector supplies the exact structure classified and that persisted digests bind it.
2. **For F2:** Complete the bounded call-site census in this plan before acceptance. Include setters, clear operations, body overrides, proposal retirement and compensation paths. Map cancellation and shelving to an owner, publication/reconciliation policy, injected production seams and exact verifiers, or provide a defensible exclusion consistent with the spec. Existing regression homes include `scripts/tests/unit/task-tracker/lib/r4p-jit-boundaries.test.mjs` and `scripts/tests/integration/task-tracker/lib/shelve-transaction.integration.test.mjs`; use the requested guard/admission suites for composition. Test cancellation from a high Plan estimate to the saved estimate, rollback after body/board effects, high-proposal retirement/restoration, shelving with pending intent, and unknown/partial outcomes. Preserve separately requested lifecycle behavior. Revisit Task 3's estimate/boundary if the census materially expands it; do not defer unresolved scope to Task 7.
3. **For F3:** Add a concrete no-commit publication/completion adapter map with exclusive task ownership. Specify which real command/guard/evidence publisher performs fresh decomposition admission and how typed Explain matches it. Add production-path fixtures for audit/research/spike at 23/24/25, initially oversized and externally changed estimates, pending/unavailable authority, and converted-epic readiness. Assert zero new deliverable/completion effects on refusal while retaining diagnostic reads and preservation of already performed work. Include a command with no local file target so the test cannot prove only Edit/Write interception.

## Optional suggestions

None beyond the required corrections. Retain the explicit cooperative-concurrency limitations and separation of binding from implementation admission.

**Review evidence and limits**

- Read the complete plan and specification, including all seven tasks, wire contracts, adapter tables, accepted-spec clarifications and hydration instructions. Reviewed relevant source in decomposition policy/Plan-exit; inflation, tether, cancellation, shelving, migration and field codecs; adaptive authority/runtime/claims and issue/body locking; typed session/observation/Test-readiness paths; native hooks and target discovery; kind/split and no-commit code-complete paths.
- Source supports reuse of the 16/24 thresholds, selected-plan extraction, canonical main-worktree forecast claim, optimistic body mutation and read-only observation attempt. The plan correctly identifies swallowed inflation errors, hook early returns/cache behavior, wrapper fail-open behavior and prose-waiver admission as integration work. These strengths do not resolve F1–F3.
- This is a plan review, not implementation verification. No live issue mutation, lifecycle transition, fixture creation, reviewed-artifact edit, Git command, commit, push or implementation test suite was performed. An attempted read-only Node probe of existing pure functions was refused by the enabled hook with `[task-tracker] Native hook session has no active issue binding.` It was not retried through another interpreter or bypass; no probe result or test pass is claimed. Findings rest on source inspection and complete contracts. Artifact digests were separately verified by an allowed read-only command.
- Joined the exact invitation using this runtime's identity. The protected header, normal mode and `authority_assurance: unavailable` remain unchanged; no stronger assurance is inferred. The first response patch attempt was refused with `mutation target parsing failed: mutation-targets: empty or invalid patch payload`; the same authorized file was subsequently written using a literal document heredoc subject to the enabled hooks. This response is the only manually edited file. Join/submit scratch transitions are package-owned.

## Decision

revisions-requested
