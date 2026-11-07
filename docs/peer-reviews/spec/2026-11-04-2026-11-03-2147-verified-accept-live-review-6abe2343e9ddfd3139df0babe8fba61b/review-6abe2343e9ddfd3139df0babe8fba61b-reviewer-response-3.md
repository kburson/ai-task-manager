<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-6abe2343e9ddfd3139df0babe8fba61b"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-11-03-2147-verified-accept-live.md"
artifact_commit: "5efdcee9781fe991385c11a58e2f7a803df1b6d3"
artifact_blob: "fe712b02b75d6985caf5f5a7054df1bfe4fdbce9"
artifact_digest: "sha256:b9400ef3f6914ceeec962ed8a9acc3f9122205bc649d93dc841171eb0c44bc09"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:f957e4725e9e2a0220e7d142b4f9332ff88575fe26c1f39d91860881519bfbe5"
  identity_source: "declared"
started_at: "2026-11-05T02:49:39.443Z"
submitted_at: "2026-11-05T04:25:07.033Z"
finding_ids: ["R3-F001","R3-F002","R3-F003","R3-F004","R3-F005"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the plan `docs/superpowers/plans/2026-11-03-2147-verified-accept-live.md` (artifact commit `5efdcee9781fe991385c11a58e2f7a803df1b6d3`) against the accepted spec, revision `714c3c519b30c52cfd435e924e6ebe49594f61eb` per the phase-01 manifest. As supplemental evidence only, I checked that the files the plan references exist, the `package.json` scripts it invokes, and the preserved working-tree test `scripts/tests/integration/task-tracker/reconcile-accept-live.test.mjs`. I edited nothing except this pending response.

The plan's intent, global constraints and review focus fit the spec's Write and readback section. It keeps the issue lock, the canonical body writer and the failure-comment path. It rechecks preconditions on fresh bases, including three-way rebase. It verifies board, marker and visit before publishing the cache or audit. It reports a confirmed write with failed readback as partial, and it keeps provider traffic local and fail-closed. Every referenced test file and helper exists.

The plan does not yet bind the spec's Audit and recovery contract to concrete verification. The author's turn-1 response deferred exactly this to the plan phase ("The plan phase will bind the new recovery qualification to concrete verification work"), so it is the main gap (R3-F001). Two execution problems would also stop a faithful implementer. The test-first step cannot produce red evidence in a worktree that already holds the preserved implementation (R3-F002). The verification commands also run both full regression lanes during Develop, against the repository's Develop-phase verification contract (R3-F003). R3-F004 and R3-F005 are clarity suggestions.

Process note: no Git command was run this turn. The genuine reviewer actor was bound through ordinary AITM Start for #2147. The protected `session_fingerprint` identifies this session, and this response contains no raw provider handle.

## Findings

### R3-F001 — The spec's recovery and audit qualifications are not planned

The accepted spec's Qualification section requires two items the plan does not mention:

1. Qualify the partial-result continuation through ordinary Pause and Start after authoritative reads recover, checking that it refreshes the cache without an additional visit or audit.
2. Qualify audit failure, ambiguous acknowledgement and conflicting evidence separately.

The plan's Steps 1-2 list only rejected-write, dropped-write, post-confirmation stale-readback, fresh-base conflict and preservation cases. Its verification commands add no case for either item. The preserved integration test makes this concrete. It drives `aitm start` only to bind the fixture session before the accept-live call, and it contains no Pause and Start continuation after a partial result. It has audit-overlap, audit-drift and audit-prose cases, but nothing that names the "audit attempt fails or loses its acknowledgement, primary evidence re-verified, exit 0 with no audit, cache published" case the spec makes normative. An implementer following the plan as written can finish Task 1 with the spec's newest contract untested. That is exactly the gap the author's turn-1 verification note said would be closed here.

The plan needs explicit steps and assertions for these two items. For the continuation: after a partial exit, recover the reads, run `aitm pause` and `aitm start <N> --role agent` through the public entry in the same fixture root, then assert that the session `kanbanState` equals the recorded state, the stage-visit count is unchanged, and no `aitm-reconciled` audit was appended. For the audit: cover a failed audit write that re-verifies to success with no audit, an ambiguous acknowledgement (one `audit.write` and no retry), and a conflict seen during the audit attempt that stays partial even when a later read appears restored. These should be separate cases from the existing overlap and drift ones.

### R3-F002 — Test-first red evidence cannot be produced as written

Step 1 says to "Execute them on the unchanged production source" and retain the failing assertions. The Files list says to "Add" `reconcile-accept-live.test.mjs` and to replace the accept-live snapshot write. In this worktree, both the test file and the replacement already exist as the preserved uncommitted implementation, which the author's turn-1 response ties to accepted patch `79142974beeb57dae02e61dbe99b44a64b99f349a13ed17da5531a98a0dc8a31`. Running Step 1 here exercises changed source, so the required red evidence cannot be produced. An implementer must either guess or quietly skip the red step.

The plan must state where the red run happens and how the preserved patch relates to Task 1. For example: run the new tests against the base-commit production source in an isolated checkout, keep the failing output, then apply or adopt the preserved patch and show green. Alternatively, if the preserved patch is to be discarded and re-derived, say so. It should also say which preserved tests are kept, and which are new for R3-F001.

### R3-F003 — Verification runs both full regression lanes in Develop

Step 4 and the Verification Commands run `npm test` (`run-tests.mjs --lane fast`) and `npm run test:slow` (`--lane slow`) before committing. Together these are the full regression. The repository's Develop-Phase Verification Contract in `CLAUDE.md` says full regression runs only at the Test stage in an isolated worktree. In Develop, `node scripts/task-tracker/verify-develop.mjs` (lint fix, format, changed and new test files) runs before every commit. As written, the plan has the implementer violate that contract and spend two full-suite runs in Develop.

Split the commands by stage. Develop should use the targeted `node --test` files plus `node scripts/task-tracker/verify-develop.mjs` before each commit. The `npm test` / `npm run test:slow` lanes should move to the Test-stage verification, alongside `npm run lint` and `npm run format:check` if they are kept there.

## Required changes

1. R3-F001: Add explicit steps, assertions and verification commands for the Pause and Start partial-result continuation (cache refreshed, no extra visit, no audit). Add separate cases for audit-write failure with successful re-verification, ambiguous audit acknowledgement with a single attempt, and a latched audit-time conflict.
2. R3-F002: State where and against which source the red run happens, given that the preserved implementation and test already exist in the worktree. Define how the preserved patch (`79142974…`) is adopted or discarded, and which of its tests are kept.
3. R3-F003: Replace the Develop-stage full-lane runs with the targeted tests plus `node scripts/task-tracker/verify-develop.mjs`, and move `npm test` and `npm run test:slow` to the Test stage.

## Optional suggestions

### R3-F004 — Define "B1"

Step 3 says "Implement B1". The plan never defines B1, and the spec labels #2149 as "companion B2". Add one phrase identifying B1 as this #2147 leaf, or replace the label with plain words, so the scope cannot be misread as #2149's.

### R3-F005 — Name the unit fixtures and the legacy demotion regression

The Files list says to "Update existing stateful reconcile unit fixtures" without naming them. List the exact files, which is likely at least the three unit suites in the verification commands, so the scope can be checked. The spec also explicitly preserves demotion invalidation for the retired `validate` source and the legacy `development` destination. Name a regression case for each, so "mixed modern and legacy representations" in the review focus maps to a concrete assertion. If the author adopts the spec-phase optional suggestions R2-F001 and R2-F002, add the continuation's seeding-warning handling to the R3-F001 cases as well.

## Decision

revisions-requested
