<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-da039aa4a46ce3e709317ba191785610"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-01-1857-remaining-work-decomposition.md"
artifact_commit: "0445849c27d2fcebd2cf97bff043b0923bd2e648"
artifact_blob: "7352e55f47206f191da8589b522c245f4fe77913"
artifact_digest: "sha256:e60f6e5fbbabe79e9c4ebc4cd85cd9126b8c3a50337986e8a2e179a361c99690"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:a7be6bd4e13c5e5f6a6be7e050c1cf81a9266b169f7df8cce32d245f095de457"
  identity_source: "runtime"
started_at: "2026-10-02T05:49:12.050Z"
submitted_at: "2026-10-02T05:57:21.652Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Addressed all four round-1 findings and the full-unit verification allocation suggestion. Revised only the reviewed decomposition plan and this pending author response. Implementation and issue hydration remain paused. This is a planning correction, not a claim that the runtime candidate passes tests or that operational admission has occurred.

## Finding dispositions

The submitted reviewer response has an empty sealed finding_ids array. The numbered references below map to its four prose findings; no synthetic sealed IDs or protected metadata were added.

1. **Stale baseline identity — addressed.** The authority section and provenance table now distinguish historical source-bearing base e52c8152d7c21f16111fb3746b72dc001e726863 from initial plan/round-1 artifact commit 0445849c27d2fcebd2cf97bff043b0923bd2e648. Neither is presented as continuing current HEAD. Hydration explicitly re-reads HEAD/index/worktree, and C5 binds receipts to the actual tested candidate SHA. Read-only Git inspection confirmed 0445849c changes only this plan, whereas e52c8152 includes estimation runtime code and its timing provenance test.
2. **C3/C4 start versus acceptance dependencies — addressed.** The graph and parallelism section now agree: C3 may begin isolated design/tests alongside C1 after observation/read/journal/recovery contracts freeze; acceptance/integration requires jointly verified C1/C2. C4 may begin before that joint verification only after both C3 grammar and C1 bootstrap/recovery descriptors freeze, with disjoint files and serialized shared edits. C4 acceptance/integration additionally needs the C3 candidate. Component reviews may occur separately; usable cleanup and scenario GREEN require the combined C3/C4 candidate. Added explicit frozen contract contents, snapshot/digest and test ownership requirements, and reopening rules. The current scripts/task-tracker/verbs/migrate-runtime.mjs imports admission, storage, census, initialization, timing and recovery APIs and dispatches the registered bootstrap modes; this source coupling supports freezing C1 forwarding contracts as well as C3 grammar. The future batch contract remains explicitly planned, not an invented existing export.
3. **File ownership mismatch — addressed.** C1's Files list now matches its ownership paragraph: storage, migration facade/input/lock/apply/plan/admission, initialization/record/recovery, writer and exact migrate-runtime handler. C2 explicitly owns runtime-record-catalog, runtime-capture-catalog, runtime-migration-catalog, runtime-process-census, runtime-writer-census and runtime-migration-timing. Read-only inspection verified these modules; runtime-migration-catalog composes record/capture classification and runtime-migration.mjs re-exports migration plan/apply APIs. Shared command-surface catalog/routing, help-data and bin files now have explicit serialized per-child ownership. C4 owns descriptor/installer edits; C2 supplies requirements and verifies the handoff.
4. **Test paths and stable-image shadow copy — addressed.** C1, C3 and C4 verification lists now use exact repository-relative scripts/tests/... paths, with planned additions labeled new/proposed. C2's collection rule explicitly applies to C1–C5, including C5's candidate census. It uses canonical discoverTestFiles({ projectRoot }) and runner lane selection for the candidate scripts/ tree; .scratch and stable-image copies are excluded. The operational installed-image inventory remains separate and required, so this exclusion cannot hide an execution surface from C5.

**Full-unit cost allocation suggestion — adopted.** C1 owns the first complete post-kernel unit run, classification and C1-attributable regression repair/reverification. C2 owns its subsequent adoption/compatibility run and existing consumer/fixture repairs; C5 owns final combined exact-SHA verification. Repeat runs follow causality; unknown attribution is recorded for epic triage. The plan requires explicit run budgets at child Plan gates and reassessment rather than silently consuming C2's 10–16h. Unchanged valid receipts may be reused only where normal gates permit, without counting an execution twice. package.json maps test:unit to scripts/run-tests.mjs --lane unit, and that runner uses canonical discovery/lane assignment; no new runner or execution claim is introduced.

## Changes made

Updated Authority/baseline, Inputs/provenance, child graph, budget allocation, C1 Files/Ownership/Frozen start contracts/Verification, C2 Files/Collection boundary, C3 exact file/test paths, C4 exact test paths, C5 candidate census/SHA receipt requirement, Parallel opportunities and hydration step 2. Historical accepted documents, source/configuration, old reviews and ledgers were not edited.

## Declined changes and rationale

None. All four findings and the useful cost-allocation suggestion were addressed. No implementation, lifecycle approval or acceptance was inferred from this revision.

## Verification

Read the exact sealed round-1 reviewer response and package status/help. Status was author-revision and printed the normal author-submit action for this workspace.

Read-only source checks covered scripts/task-tracker/verbs/migrate-runtime.mjs, the migration facade/catalog and record/capture/process/writer catalog/census exports, scripts/task-tracker/lib/discover-test-files.mjs, scripts/run-tests-lanes.mjs, scripts/run-tests.mjs and package.json. Exact file discovery confirmed the C1 integration tests and C4 existing provider/package tests.

`git diff --check -- docs/superpowers/plans/2026-10-01-1857-remaining-work-decomposition.md` passed. A read-only Node check using canonical discovery found exactly one runtime-migration-transaction.test.mjs at scripts/tests/integration/task-tracker/lib/runtime-migration-transaction.test.mjs and no .scratch paths. It checked 13 distinct scripts/tests/... paths named in the plan; only the three explicitly proposed cleanup tests are absent. No source test suite was executed for this prose-only revision, and no current-head runtime green result is claimed.

Before editing, captured an in-memory digest over unrelated tracked and nonignored untracked file contents and Git index entries. After the plan edit, both matched exactly; the sole staged diff remained the R100 actor-flush-journal unit-to-integration rename. The normal package submit is the only authorized commit mechanism; finalization must wait for actual reviewer acceptance.
