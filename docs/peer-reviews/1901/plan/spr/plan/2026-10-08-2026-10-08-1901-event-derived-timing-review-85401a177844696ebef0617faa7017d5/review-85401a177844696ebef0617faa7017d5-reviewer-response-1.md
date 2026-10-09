<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-85401a177844696ebef0617faa7017d5"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
artifact_commit: "7d85e386fc54b1fe9f9c42c6550982042152937c"
artifact_blob: "95868c2ba0f0dd7814266d9b8b192d7a21d8dd06"
artifact_digest: "sha256:87cbab9c19ad2bdb00ec5b26a671dbbbc3ff9792fd115a9410e931fafd71a82e"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:a2c9900363eabafbe7bc16e056587f95fb87650ec129c2bb0d1210ab9a0ca20f"
  identity_source: "runtime"
started_at: "2026-10-08T23:25:01.961Z"
submitted_at: null
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Reviewed the complete implementation plan and accepted specification, including all XPR clarifications, against the current repository source. Decision: revisions-requested. The event-allocation, bounded-observation, immutable-source/replay, protected-slice, activation, and maintenance-window requirements are substantially represented. The remaining problems concern an incorrect assumption about the existing SessionTime implementation, incomplete ownership/model-dispatch instructions at actual adapter seams, and omitted required regression/verification mappings. These need resolution before this plan is treated as a complete source for eight independently governed children.

Review scope and evidence: read the full plan and specification; inspected the lexical reader and actor/engagement parsers, publisher and row builders, runtime checkpoint/publication wiring, actor-flush journal, queue, lifecycle emitter, rollup and board-field projection, timing ladder, estimation runtime adapter/builder/source validator/writer, and historical backfill implementation. Used read-only source searches to trace callers and locate existing tests. This is a static implementation-plan review: no implementation tests were run, and no test-pass claim is made. No Git commands, task binding/state mutations, reviewed-artifact changes, or other manual file writes were performed.

The unchanged join succeeded from this native session after approved host execution. Before retrying, direct reads confirmed the owner-only official-exact-session hook receipt and the pinned hook implementation that automatically adds observed model evidence. No identity environment variables were manually set, removed, or replayed. The generated response identifies gpt-6-astra with runtime identity; its protected frontmatter is preserved as generated, including authority_assurance. This review does not upgrade that assurance label.

## Findings

### R1-F001 — Resolve the nonexistent existing SessionTime wall-span seam

**Priority: P1. Location:** plan Global Constraints line 52, shared contracts line 76, and Task 5 lines 295–315. Governing specification: Public scalar projection contract and XPR implementation boundaries.

The plan says the independent SessionTime wall span stays unchanged and that it “remains a separate old wall-span function,” but the inspected production path does not provide that separation. `scripts/gh/log-issue-time.mjs:90–101` maps SessionTime directly from `rollup.totalActiveMin` and `rollup.totalActiveSec`. In the actor branch, `scripts/task-tracker/timing-rollup.mjs:305–335` sets those fields from `deriveActorEngagement(...).engagedMs`, with null when that actor projection is incomplete. `scripts/task-tracker/lib/timing-rows.mjs:413–427` likewise exposes actor effort under totalActiveSec. Those are not independent wall-span results.

This matters precisely in the plan's overlapping-lanes test: changing totalActiveSec to the required event-model sum while retaining the existing board mapping publishes summed actor effort as SessionTime. Simply inventing a new elapsed-span calculation instead is also not “unchanged” behavior. The accepted specification requires an independent wall span, but its characterization of the current implementation is not borne out by this source path. The plan repeats that assumption rather than resolving it.

**Required resolution:** identify and reference an actual authoritative existing SessionTime wall-span implementation if one exists outside this path, and explicitly wire it into the board adapter; otherwise record the source/spec discrepancy and obtain the necessary clarification before claiming preservation. Specify the chosen interval endpoints, interruption treatment, open/pending-history behavior, scalar field names, and model dispatch. Assign the adapter and tests to Task 5. Do not use totalActiveSec as both effort and wall span.

**Acceptance evidence:** an end-to-end `timingFieldProjection`/board-publication fixture with overlapping actor lanes must show Engaged exceeding wall span while SessionTime follows the explicitly agreed independent rule. Add a case where an unrelated actor tail makes an effort dimension incomplete and assert the separately defined SessionTime availability. Pin marker-free behavior and board formatting independently. A test merely titled “independent SessionTime” without a defined expected formula will not resolve this finding.

### R1-F002 — Finish the source-grounded adapter ownership and model-dispatch map before hydration

**Priority: P2. Location:** plan shared contracts and wave ownership at lines 63–96, Task 2, Task 4, Task 5, and Task 7's deferred consumer sweep. Governing specification: lines 189 and 269 require separate old-schema semantics and an enumerated display-sensitive consumer plan.

The task lists leave several already-identifiable seams outside explicit ownership or leave their old/new role undecided:

- `scripts/task-tracker/lib/estimation/runtime-adapter.mjs:1432–1454` chooses complete stage measurements versus incomplete telemetry using `deriveActorEngagement`, or falls back to `readEstimationStageTiming`. This decision happens before the Task 5-owned outcome builder. Updating only that builder and validator does not establish which model the live close measurement used. The runtime adapter is absent from the task file assignments.
- `scripts/task-tracker/lib/timing-row-reader.mjs:132–155` contains `readEstimationStageTiming`, which requires row-sec and sums by the closing event's slug. New partial rows deliberately omit row-sec, and a lifecycle close owns the preceding stage's allocation. This policy-bearing helper is inside Task 2's exclusively owned lexical file, while Task 5 owns accounting. The plan must say whether it remains an explicitly legacy-only entry point, moves, or gains a specific model-aware adapter; a general promise to keep the lexical implementation stable does not settle the boundary.
- `scripts/task-tracker/lib/timing-ladder.mjs:65–82` discards the raw marker/control/projection data when parsing, and `deriveLadder` at lines 92–118 calls the old engagement projection and returns unavailable Idle. Its test is listed under Task 5, but its implementation is not assigned. Name its supported event-model behavior or explicit refusal and the owner rather than relying on a later search to decide.
- `scripts/task-tracker/lib/timing-post-outcome.mjs:3–12` treats every resolved `postTimingEvent` call as `{ok:true}`. Task 3's new admission seam returns structured outcomes including pending/refused publication. Explicitly define the adapter contract: either pending outcomes must throw at the legacy postTimingEvent boundary or this wrapper must interpret them before checkpoint advancement. Task 4's checkpoint requirement is correct, but this actual wrapper is not assigned or named in its verification.

The tolerant actor-parser boundary also deserves an explicit routing choice: `readTimingActor` in `lib/timing-actor.mjs:39–84` rejects any extra suffix after optional row-sec, and the current lexical reader invokes it twice. Task 2 can replace that call path with the new codec or own a compatible change, but the plan should name the chosen route and retained identity/engagement validation rather than leave an unassigned source change to pickup.

These are not requests to implement during planning. They are concrete omissions from a plan that promises single-owner files, fixed interfaces, and complete AC4 delivery. Leaving them to the Task 7 sweep risks discovering a needed accounting adapter after Task 5 is integrated, or silently routing enabled data through old semantics to avoid changing sealed outcome behavior.

**Required resolution:** add a compact consumer/producer matrix naming these entry points, their task owner, input model/control context, legacy versus enabled behavior, and focused verifier. Assign necessary files now or explicitly document that a named replacement makes an old entry point unreachable for event-model input. Keep sealed snapshot validation on its original semantics while making live measurement/model selection explicit. Resolve the policy helper inside the Task 2-owned lexical file without overlapping edits.

**Acceptance evidence:** exercise the real estimation adapter on an enabled partial/protected-remainder log and a stale projection, proving no complete quantitative outcome is produced; retain original sealed-outcome reuse tests. Exercise the real safe-post/journal path when admission resolves pending without remote acknowledgment, proving it either obtains durable enqueue before checkpoint advancement or leaves the checkpoint unchanged. Include actor suffix validation and the ladder's declared enabled-mode behavior, not only mocks of the new projection helper.

### R1-F003 — Restore required historical fixtures and explicit root verification mappings

**Priority: P2. Location:** plan Acceptance Criteria, Task 6, Task 7 Verification Commands, and Task 8. Governing specification: Acceptance and verification lines 166–168.

The accepted specification explicitly requires captured #1851 and #1852 regression inputs in addition to the full #1854 history, each with URL, body digest, and capture time. The plan names only #1854 in Tasks 6 and 8 and does not assign acquisition or coverage of #1851/#1852. Synthetic Unknown/zero/observed examples cannot stand in for those required captured inputs.

The specification also requires extending vc:1–vc:4 and reconciling the issue verification mappings in the implementation plan. The plan supplies useful per-task commands, but no root vc:1–vc:4 mapping or explicit replacement mapping; Task 8's “complete root verification groups” therefore points to undefined groups in this artifact. Additionally, Task 7 says to run the existing sequence tests but its exact command omits the existing `lib/agent-review/validators/timing-log-sequence*.test.mjs` files. This weakens the promised executable child gate for a directly modified validator, even if an eventual root suite might catch the regression.

**Required resolution:** assign captured #1851/#1852/#1854 fixtures and their provenance manifests to a specific task, with acquisition/read-failure handling and no live writes. Add an AC-to-root-verifier table that reconciles the real issue's vc:1–vc:4 with these exact task commands and any new verifier IDs, without inventing existing mappings. Include the actual sequence-validator tests in Task 7's focused command. Reconcile any additional adapter verifiers added for R1-F002 in the same table.

**Acceptance evidence:** the revised plan names all three captured inputs and consuming tests, and every AC/root verifier resolves to a concrete executable command and child owner. The sequence-validator child gate runs its new contract test and existing sequence regressions. Captures and implementation test results remain future work; no historical observations or green results should be claimed during this revision.

## Required changes

1. Resolve R1-F001's source/spec mismatch and define the independent SessionTime adapter contract and numerical regression expectations.
2. Resolve R1-F002 with a complete named adapter/ownership matrix, explicit old/new dispatch, and checkpoint/outcome integration verifiers before child hydration.
3. Resolve R1-F003 by restoring the required captured histories and freezing the root/child executable verification mapping.

Revise only the author-owned plan through the normal author turn, then return this same review session for the next pass. Preserve the accepted specification unless its SessionTime discrepancy requires a separately acknowledged clarification. No implementation, historical apply, or release publication is requested by this review.

## Optional suggestions

None. The observations above are required planning corrections, not requests to broaden the defect into pause policy, runtime storage redesign, or the separately identified old-format zero-literal fix.

## Decision

revisions-requested
