<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-da039aa4a46ce3e709317ba191785610"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-01-1857-remaining-work-decomposition.md"
artifact_commit: "6c55d59caece92bd65ad09ec4fd83bfbdb791319"
artifact_blob: "a8f7544c0f6d0f020c8decd37c4179c525180ef3"
artifact_digest: "sha256:67f3a31fb5098ecd7ce967a900d0c16667acdc2c087323ef88d63b49af61bd13"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:4806451eb8f9f79569370dea56fa791c86423d6ffdbdd1614c3aa946c253343d"
  identity_source: "runtime"
started_at: "2026-10-02T05:50:07.302Z"
submitted_at: "2026-10-02T05:59:00.357Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the revised artifact (commit 6c55d59c, digest sha256:67f3a31f…) against my four round-1 findings, the adopted optional suggestion and author response 1. All four findings are resolved. The revision adds no new inconsistencies.

Here is how each item was resolved:

1. **Baseline identity.** "Authority, baseline and preservation" now names three distinct identities: the historical source-bearing base e52c8152, the initial plan/round-1 artifact commit 0445849c, and a future tested candidate SHA. It explicitly disclaims either historical identity as current HEAD. The provenance table relabels e52c8152 as "Last source-bearing commit before decomposition" and adds a 0445849c row. Hydration step 2 re-reads HEAD, index and worktree and keeps the three identities distinct. C5 binds receipts to "the freshly read tested candidate SHA". Resolved.
2. **C3/C4 start and acceptance dependencies.** The child-graph rows now give separate Start and Acceptance/integration clauses for C3 and C4. The "Parallel opportunities" paragraph states the same gates. The new **Frozen start contracts** paragraph lists what each start gate freezes, requires source snapshot/digest and contract-test ownership, and pauses dependent work when a contract changes. That makes "frozen" auditable rather than informal. C4's start now requires both C3 grammar and C1 bootstrap/recovery descriptors, which matches its migration-required forwarding scope. Separate component reviews with combined usable-cleanup acceptance remove the circularity risk. Resolved.
3. **C1 file ownership.** The C1 **Files** list now matches its ownership paragraph. It includes runtime-storage, the runtime-migration facade, input, initialization record/recovery and `scripts/task-tracker/verbs/migrate-runtime.mjs`. C2 names the six catalog/census/timing modules explicitly. The shared surfaces (`command-surface/{catalog,routing}.mjs`, `verbs/help-data.mjs`, `bin/aitm.mjs`, `bin/cli.mjs`) are now named, with a single editor and per-child hunks recorded at Plan time. C2's provider/installer dependency is redirected to C4 ownership. Resolved.
4. **Test paths and shadow copy.** C1, C3 and C4 verification lists use exact `scripts/tests/...` paths, and the new tests are labeled proposed. The new **Collection boundary (C1–C5)** paragraph mandates canonical `discoverTestFiles` plus lane selection. It excludes `.scratch/` and stable-image copies from collection and from the candidate census, and names the exact transaction test file to extend. It also keeps installed images as a separate C5 operational inventory, so the exclusion cannot hide an execution surface. Resolved.

Optional suggestion 3 (full-unit cost attribution) was adopted as the **Full-unit verification allocation** paragraph. Repair and repeat runs are attributed to the causing child, unresolved cases go to epic triage, and receipts are not double-counted. That is adequate.

I verified the newly cited paths (read-only, no Git). All of these exist:

- `scripts/task-tracker/verbs/migrate-runtime.mjs`
- `scripts/task-tracker/verbs/help-data.mjs`
- `scripts/task-tracker/lib/discover-test-files.mjs`, which exports `discoverTestFiles` at line 104
- `scripts/run-tests-lanes.mjs`
- `bin/cli.mjs`
- `scripts/tests/unit/providers/registry.test.mjs`
- `scripts/tests/unit/providers/parity.test.mjs`
- `scripts/tests/unit/package/install-contract.test.mjs`
- `scripts/tests/integration/package/install-health.test.mjs`

The proposed cleanup tests and the `cleanup-*` modules are correctly absent and labeled proposed. The round-1 checks remain valid: the six C1 integration tests exist under `scripts/tests/integration/task-tracker/lib/`, `saveState` still publishes multiple records, and `verifyObservedIntegration` is exported.

This acceptance covers the decomposition structure only. As the plan itself states, it is not SAR acceptance, lifecycle Plan approval, hydration authority, a current-head test result or operational admission.

## Findings

None.

## Required changes

None.

## Optional suggestions

None.

## Decision

accepted
