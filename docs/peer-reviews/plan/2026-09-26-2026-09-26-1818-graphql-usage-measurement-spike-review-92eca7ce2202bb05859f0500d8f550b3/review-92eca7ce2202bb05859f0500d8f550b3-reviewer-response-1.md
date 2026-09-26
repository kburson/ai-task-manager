<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-92eca7ce2202bb05859f0500d8f550b3"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md"
artifact_commit: "cd5b43e494129cab7cf6a196b7204bcd89dcd207"
artifact_blob: "95d311386e5ab8fb184a7877fb202a0514b9777c"
artifact_digest: "sha256:4577ecb7b7362841470ebaa382993852a0161effb88a41d8a98aa1eb4e95fdeb"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:cd918182f9a46461b0e6b12fd197f51635a0c1147cff068b271eab0573fe60ac"
  identity_source: "runtime"
started_at: "2026-09-26T17:16:28.221Z"
submitted_at: "2026-09-26T17:19:37.682Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Round 1 SAR requests revisions. The five-child decomposition is reasonable,
but baseline acceptance and reporting gates are weaker than the ratified spec,
the collection/storage ordering lacks an independently deliverable boundary,
and the existing action-capture regression command is incorrect.

Reviewed the sealed plan at cd5b43e494129cab7cf6a196b7204bcd89dcd207 against
docs/superpowers/specs/2026-09-25-1818-graphql-usage-measurement-spike-design.md.
Inspected the CLI bootstrap, action-capture exports, package scripts, test lane
definitions, and existing action-capture test paths. No tests or Git commands
were run and the artifact was not edited. Protocol mode is normal; authority
assurance is unavailable.

## Findings

1. **R1-F001 [P1] - Preserve baseline completion and the minimum concurrency sample.**

   Plan lines 79-81 allow the parent baseline checkbox to be satisfied by an
   explanation that measurement remains preliminary. Task 5 lines 339-342
   requires only a declared overlap interval; it omits the spec's overlapping
   60-minute collector window and observed AITM traffic from both enrolled,
   permitted worktrees. Task 5 then proceeds to parent reconciliation/Review
   without a separate evidence-completion gate. A short overlap or an explanation
   that the baseline is pending could satisfy these written steps.

   The spec's Reporting and baseline section requires the 60-minute minimum,
   and AC6 explicitly says the evidence deliverable is incomplete until the
   baseline exists. Preliminary reporting is an honest intermediate outcome,
   not a replacement for completed evidence. A valid volume baseline may still
   report that total-point ranking was not achieved.

   Require the completed real creation-to-planning workflow and minimum sample
   for decision-grade handoff. Keep missing, short, or inadequately covered
   measurement pending/preliminary without claiming the parent evidence is
   complete or ranking affected groups. Assign Task 5 preflight ownership for
   predeclared candidate groups and comparable volume/point signals. Require
   actual measured durations and the spec's matched-workload comparison
   procedure in its runbook. Verify the completion gate with short-window,
   missing-workflow, and sufficient-volume/insufficient-points cases.

2. **R1-F002 [P1] - Enforce root exclusion and coverage gaps as reporting gates.**

   Task 4 lines 292-305 reads supplied usage "roots" and reports root mismatches,
   but never requires one canonical aggregation root or excludes foreign-root
   observations. It says opaque/uncovered/gap limitations are separately
   disclosed alongside the 100% cost gate. Disclosure alone permits an
   implementation to rank all its known recorded rows despite a relevant gap,
   or to aggregate separate clones and merely print a warning.

   The spec's Reporting and baseline section requires one canonical common-root
   ID and exclusion of foreign-root observations. Decision sufficiency requires
   no relevant hidden attempts, uncovered paths, or enrollment/collection gaps
   for total-point ranking. These acceptance conditions must survive child
   hydration; they are not merely optional reporting language.

   Pin the single-root contract, out-of-root participant classification, and
   foreign-record exclusion. Explicitly fail total-point ranking for any
   relevant hidden/unknown/uncovered/gap condition even when every recorded row
   has a known cost. Add fixtures for a foreign root and 100% known recorded
   costs with a denied participant or uncovered relevant path. Assert that
   neither produces a complete total-point ranking. Permit volume fallback
   only with adequate coverage and comparability; otherwise report preliminary.

3. **R1-F003 [P2] - Resolve storage/enrollment prerequisites in the child order.**

   Task 2 lines 190-207 owns production bootstrap/launcher wiring and requires
   completed observations to be flushed before shell/synchronous parent return.
   Task 3 lines 238-249 depends on Task 2 but owns the writer, common-root
   resolver, reachability probes, enrollment cache, and manifest helpers. Task
   1 supplies record shapes only. No earlier child supplies the working sink or
   enrollment implementation needed for Task 2's production completion gate.

   The spec requires enrollment in the actual permission context and manifest
   context before the measured process tree starts. Task 2 cannot meet its flush
   requirement independently without absorbing Task 3's scope or relying on an
   unspecified temporary sink. This matters because children are expected to
   progress sequentially through their own deep dives and verification.

   Deliver storage/enrollment before production wiring, or explicitly limit
   Task 2 to injected-sink adapter contracts and assign production activation
   and real subprocess persistence verification to Task 3. Name ownership for
   session allocation, inherited context, prelaunch manifest rows, nested
   bootstrap preservation, enrollment refresh, and final connection to storage.
   Define independently verifiable completion for each intermediate child and
   adjust dependencies and estimates as needed.

4. **R1-F004 [P2] - Correct action-capture regression paths and integrated verification.**

   Task 2 line 220 names
   `scripts/tests/unit/task-tracker/lib/action-capture.test.mjs`, which does not
   exist. Existing suites are
   `scripts/tests/integration/task-tracker/lib/action-capture.test.mjs` and
   `scripts/tests/slow/task-tracker/lib/action-capture-integration.test.mjs`.
   This command is supposed to preserve existing regression coverage, not
   introduce a new usage fixture. The spec expressly requires existing
   action-capture regression checks to pass.

   The Task 5 commands do not compensate: package.json defines quality as
   format, lint, and npm test. The test script uses --lane fast, documented in
   scripts/run-tests.mjs as unit only. Repeating lint and format adds no
   integration or slow execution. Thus the final combined bootstrap/writer is
   not covered by the promised action-capture compatibility verification.

   Correct the existing paths, include the relevant slow action-capture suite,
   and name focused usage integration suites to rerun after collection and
   storage are connected at the final integrated head. Focused verification is
   sufficient; no indiscriminate full-suite run is requested. Distinguish
   proposed new test paths from verified existing regression commands.

## Required changes

1. R1-F001: repair parent baseline ACs, Task 5 completion, and handoff conditions.
2. R1-F002: repair Task 4's root and coverage contracts with negative fixtures.
3. R1-F003: resolve child dependencies and activation/verification ownership.
4. R1-F004: repair Task 2 and final integrated regression commands.

Keep the ratified spec unchanged. These are plan-alignment changes. The Astra
author should make all artifact edits and record each disposition in the
generated author response before the next SAR round.

## Optional suggestions

1. The plan names Node.js 26 while package.json supports Node >=24. Clarify that
   26 is the development runtime, if intended, and preserve implementation
   compatibility with the package's supported minimum.
2. Add a compact spec-AC-to-child-verification mapping so bounded report
   snapshots, unique writer incarnations, instrumented-request cost labeling,
   and literal-redacted fingerprints remain traceable through hydration.
3. Align Task 3's storage rationale with the spec: main-worktree .tmp/aitm is
   already shared; Git-common storage is the explicit chosen root outside
   routine cleanup, not a remedy for an inherently unshareable .tmp design.

## Decision

revisions-requested
