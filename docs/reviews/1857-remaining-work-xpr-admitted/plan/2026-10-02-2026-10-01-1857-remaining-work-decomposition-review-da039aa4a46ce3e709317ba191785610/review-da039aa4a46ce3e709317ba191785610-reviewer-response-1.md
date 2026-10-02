<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-da039aa4a46ce3e709317ba191785610"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-01-1857-remaining-work-decomposition.md"
artifact_commit: "0445849c27d2fcebd2cf97bff043b0923bd2e648"
artifact_blob: "7352e55f47206f191da8589b522c245f4fe77913"
artifact_digest: "sha256:e60f6e5fbbabe79e9c4ebc4cd85cd9126b8c3a50337986e8a2e179a361c99690"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:4806451eb8f9f79569370dea56fa791c86423d6ffdbdd1614c3aa946c253343d"
  identity_source: "runtime"
started_at: "2026-10-02T05:50:07.302Z"
submitted_at: "2026-10-02T05:51:20.543Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The decomposition is sound in structure. Every R1–R9 contract and the actor-timing addendum maps to at least one owning child (C1–C5) in the requirement matrix, inherited committed work (e0429245, e52c8152, 26ccdd57/825b5e34) is credited rather than re-planned, and evidence limits are stated honestly: historical scoped logs are not current-head receipts, no subtraction from the 109-failure unit result, and lease ≠ multi-file atomicity. The C1/C2 joint-release and C3/C4 joint-usability pairings are correctly identified, and C5 cleanly separates technical candidate acceptance from installed deployment, live activation and destructive selections.

I spot-checked factual claims against the WIP checkout (read-only, no Git):

- `scripts/task-tracker/state.mjs:231` `saveState` holds one `withRuntimeRecordLockSync` on the state path while separately validating the global payload and publishing the per-session binding via `setActiveTask`/`clearActiveTask` plus the actor-timing record. That matches the matrix row "R3 multi-record publication — Missing complete crash-safe contract".
- `scripts/task-tracker/lib/delivery-integration-proof.mjs:40` exports `verifyObservedIntegration`, as C3 cites. `cleanup-base-aware.mjs` exists, and no `cleanup-plan`/`cleanup-apply`/`cleanup-git`/`verbs/cleanup` module exists, which is consistent with "R5/R6/R7 Missing".
- C1's named modules exist: runtime-migration-{lock,apply,plan,admission,input,catalog,timing}, runtime-initialize, runtime-initialization-{record,recovery}, runtime-writer and runtime-storage. The C1 integration tests it says to extend exist under `scripts/tests/integration/task-tracker/lib/`.
- Only `skill/shared/SKILL.md` exists under `skill/`, with no `skill/cleanup/`. That is consistent with "R8 Missing capability".
- `package.json` defines `test`, `test:unit`, `test:integration`, `test:slow`, `lint` and `format:check`, so the C2/C5 commands resolve.

Remaining issues are internal consistency and baseline-identity defects. They are small, but they affect scheduling and authority statements that the hydration steps will rely on, so I request revision.

## Findings

1. **Stale baseline identity (Medium, authority/baseline).** "Authority, baseline and preservation" asserts "HEAD e52c8152d7c21f16111fb3746b72dc001e726863" as the actual WIP state, and the provenance table labels e52c8152 "Current committed boundary". This plan was itself committed at 0445849c27d2fcebd2cf97bff043b0923bd2e648 (the reviewed `artifact_commit`), so the stated HEAD is already false for the bytes under review. Hydration step 2 and the C5 exact-SHA receipts both depend on a correct baseline, and the plan elsewhere insists on fresh reads over stale observations. Leaving a known-stale HEAD as an authoritative statement invites a later step to anchor on it.

2. **C4 dependency contradicts the parallelism section (Medium, scheduling).** The child-graph table makes C4 depend on "C3 closed grammar; jointly verified C1/C2 candidate runtime contract". "Parallel opportunities" says "C4 multi-skill ownership work can proceed after C3 grammar is frozen", with no C1/C2 precondition. These two passages disagree on when C4 may start. Possible readings include "start after C3 grammar; acceptance requires the verified C1/C2 contract" and "start only after C1/C2 are jointly verified". The plan does not say which one it means. C4 also owns "runtime bootstrap/recovery forwarding" and "typed migration-required" behavior, which binds directly to C1's migrate-runtime descriptor, so the distinction matters. The same start-versus-acceptance ambiguity applies to C3: the table says it depends on "stable runtime read/journal interfaces; final integration waits C2", and the parallelism section says it may proceed "alongside C1 once observation/journal interfaces are pinned".

3. **C1 Files list omits modules C1's ownership paragraph assigns to it (Low, ownership).** The C1 **Files** line lists runtime-migration-{lock,apply,plan,admission}, runtime-initializ*.mjs and runtime-writer.mjs. **Ownership and handoff** then also assigns C1 runtime-storage.mjs, the migration facade (runtime-migration.mjs), input (runtime-migration-input.mjs) and the migrate-runtime registered handler. Catalog modules (runtime-record-catalog, runtime-capture-catalog, runtime-migration-catalog) and census modules (runtime-process-census, runtime-writer-census) are assigned to C2 only implicitly. The plan relies on a "one editor at a time" discipline, and that only works if each child's file set is unambiguous at Plan time.

4. **Test path shorthand and a shadow copy (Low, verification).** C1 and C3 cite `integration/task-tracker/lib/...`, but the real tests live at `scripts/tests/integration/task-tracker/lib/...`. In addition, `runtime-migration-transaction.test.mjs` exists twice: once at the real path and once under `.scratch/1857-stable-image/source/scripts/tests/...`. The C2 "one collected affected integration batch with full census" and the C5 census need to state that preserved stable-image copies under `.scratch` are excluded from collection and from the census. Otherwise counts can double, or the wrong file can be extended.

## Required changes

1. Restate the baseline as "WIP base e52c8152; this plan committed at 0445849c; re-read HEAD/index at hydration." Do not assert e52c8152 as the current HEAD. Relabel the provenance-table row accordingly (for example, "Last source-bearing commit before decomposition").
2. Make the child dependency table and the "Parallel opportunities" section agree. For C3 and C4, give separate **start** and **acceptance/integration** dependencies, and state explicitly whether C4 may begin before the C1/C2 joint verification.

## Optional suggestions

1. Align C1's **Files** list with its **Ownership and handoff** paragraph: add runtime-storage.mjs, runtime-migration.mjs, runtime-migration-input.mjs and the migrate-runtime handler. Name the catalog/census modules explicitly under C2.
2. Use repository-relative `scripts/tests/integration/...` paths. Add one sentence excluding `.scratch/` stable-image copies from test collection and census.
3. The C1–C5 advisory total (42–66h) is clearly caveated. Consider recording now which child absorbs the cost of re-running the full unit lane after C1 lands, so that C2's 10–16h is not silently consumed by C1-induced breakage.

## Decision

revisions-requested
