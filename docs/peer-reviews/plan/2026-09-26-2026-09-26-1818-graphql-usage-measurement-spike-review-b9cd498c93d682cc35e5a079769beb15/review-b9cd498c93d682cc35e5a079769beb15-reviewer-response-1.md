<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b9cd498c93d682cc35e5a079769beb15"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md"
artifact_commit: "a6d4f5aa6ea772619f04faf6075fe7262494eb3a"
artifact_blob: "a56b0e6cd9aa4875938faa2d0c43f7ed475cf6f3"
artifact_digest: "sha256:84f4c197a7f3250cae55e47e553862724e574292f4ec9d066511e60542b39845"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:3a1cd530e39a6373b7da2e38bb82b90fbdaecb8ad3128115642a08d9088cc3a3"
  identity_source: "declared"
started_at: "2026-09-26T17:46:39.896Z"
submitted_at: "2026-09-26T17:51:38.341Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revisions requested. The five-child decomposition, the baseline completion gate,
the single-root reporting contract, and the action-capture regression paths are
now sound and verifiable. The remaining defects are coverage gaps between the
ratified spec and the plan's owning tasks: the shared `gql()` wrapper — the
spec's first-named in-scope call site and the only realistic cost-augmentation
point for CLI-routed traffic — is named in no child's delivery boundary; four
spec-required report outputs have no owning task or acceptance criterion; the
no-extra-API-call and local-only context-resolution invariants are unowned; and
`action-capture.mjs` classification work is split across two children.

Reviewed the sealed plan at a6d4f5aa6ea772619f04faf6075fe7262494eb3a against
`docs/superpowers/specs/2026-09-25-1818-graphql-usage-measurement-spike-design.md`.
Verified by reading `scripts/gh/lib/github-projects.mjs`,
`scripts/gh/lib/gh-client.mjs`, `scripts/reports/generate-value-report.mjs`,
`package.json` scripts, `scripts/tests/tools/audit-test-layout.mjs`,
`scripts/task-tracker/lib/test-lanes.mjs`,
`scripts/task-tracker/lib/story-tag-header.mjs`, and
`scripts/maintenance/lint-no-system-tmp.mjs`, and by confirming the existence of
every path the plan's Verification Commands name. Read-only search only: no
tests were run, no Git command was run, and the artifact was not edited.
Protocol mode is `normal`; authority assurance is `unavailable`.

Checked and found no defect in three areas worth recording so the author does
not re-litigate them: the proposed test paths all satisfy the canonical-lane
gate (`parseCanonicalTestPath` requires only a slash-bearing relative path under
`scripts/tests/<lane>/`, with no source-mirroring rule); `npm run lint`,
`npm run format:check`, and both named action-capture suites exist exactly as
written; and `R4P` is live repository vocabulary, not retired.

## Findings

1. **R1-F001 [P1] - Name the shared `gql()` wrapper in a child's delivery boundary.**

   Task 3 lines 272-276 enumerate `scripts/task-tracker/lib/action-capture.mjs`,
   `scripts/task-tracker/action-capture-bin/gh`, "AITM CLI/bootstrap entry
   points", and "direct HTTP GraphQL adapters such as value-report helpers".
   `scripts/gh/lib/github-projects.mjs` appears in no task's file list, and the
   strings `github-projects` and `gql` appear nowhere in the plan. Task 1's
   boundary is inventory and schemas; Task 3's Interface refers only to
   generic "known Node query builders".

   That file is the concrete builder. Its `gql()` (line 55) issues
   `gh(['api', 'graphql', '--input', '-'], { input: payload })` through
   `ghClient.execFile('gh', …)`, so the payload reaches `gh` on stdin and PATH
   resolves the binary. Two consequences follow. First, the spec names this
   wrapper first in its scope list and assigns query-cost augmentation to
   "known Node request builders with compatibility fixtures", because the shim
   alone "does not rewrite arbitrary shell query text"; `gql()` is therefore the
   only place a collision-free `rateLimit { cost }` alias can be added and
   stripped for the wrapper carrying the bulk of AITM GraphQL traffic. Second,
   the spec's private-observation-context contract — builder passes context, shim
   owns the single record, builder strips its private alias — has two endpoints,
   and only one of them (the shim) is currently owned. A child implementer
   working strictly to Task 3's "Modify or create" list would ship the shim and
   the `generate-value-report.mjs` HTTP adapter (verified: direct
   `fetch('https://api.github.com/graphql', …)` at line 156) while leaving
   `gql()` at explicit unavailable cost, satisfying every written checkbox and
   still producing a baseline with no exact point data on the dominant path.

   Add `scripts/gh/lib/github-projects.mjs` to Task 3's modify list, assign the
   `gql()` augmentation and private-observation-context handoff to that child
   explicitly, and state whether `scripts/gh/lib/gh-client.mjs` is touched.
   Require a compatibility fixture for the stdin `--input -` shape specifically,
   since the payload is not argv and the shim's extraction path differs.

2. **R1-F002 [P1] - Own the four missing report outputs.**

   Task 4 lines 336-351 and parent AC5 (lines 73-76) together require volume,
   known points, hourly peaks, operation/stage breakdowns, retries, failures,
   malformed/duplicate data, and coverage limits. The words `latency`,
   `percentile`, `median`, `header`, `budget`, and `read time` appear nowhere in
   the plan. Four spec-required outputs therefore have no owning task bullet and
   no acceptance criterion:

   - mean, median, and high-percentile point cost **and latency** per operation,
     with point percentiles computed from known costs only and sample counts
     shown (spec Reporting bullet 3 and the percentile paragraph);
   - latency statistics that separate HTTP observations from whole-CLI-invocation
     latency — without this the two are silently poolable, which is the same
     category error the plan correctly forbids for HTTP-versus-opaque volume;
   - account-budget context from `x-ratelimit-*` headers without attributing
     other clients' usage to AITM, kept separate per endpoint host and known
     `budgetScopeId` (spec Reporting bullet 5 and the raw-schema paragraph);
   - aggregation file-open count and elapsed read time, which the spec requires
     precisely because the storage model is one file per process incarnation and
     the spike accepts that overhead on condition that it is measured.

   The last one also has a direct bearing on the spike's own conclusions: Task 2
   measures retained bytes and file count, but nothing measures the read-side
   inode cost that the file-per-writer decision incurs.

   Add these to Task 4's bullets and extend parent AC5, or state explicitly in
   the plan that they are deferred and why. Silence leaves them to be discovered
   at parent reconciliation.

3. **R1-F003 [P1] - Own the no-extra-API-call and local-context-resolution invariants.**

   Spec AC4 has two clauses: recording and aggregation "make no extra GitHub
   calls", and no secrets or issue bodies are persisted. Parent AC4 (lines 79-81)
   carries only the second clause plus behavior preservation. The only statement
   of the first is Task 4's Interface prose "They never call GitHub" (line 329) —
   prose in a section the plan itself labels a boundary description, with no
   bullet or fixture asserting it, and nothing at all covering the collection
   side.

   Relatedly, `stateSource`, `contextScope` beyond the bare schema-field mention
   at line 184, and the spec's context rules are unowned: resolve issue number
   and lifecycle state from the current command's known arguments or local state
   only, record `unknown` when no trustworthy state exists, capture context at
   dispatch rather than labeling a cross-issue query with an unrelated active
   issue, mark multi-issue context as such, and never divide its cost among
   issues. These are the rules that keep stage and issue attribution honest, and
   parent AC5 depends on stage breakdowns being trustworthy.

   Extend parent AC4 with the no-extra-calls clause, assign an enforcing test to
   Task 3 (collection) and Task 4 (reporting) — a transport/fetch seam that fails
   the test if any GitHub request is issued during recording or aggregation — and
   give Task 1 or Task 3 explicit bullets for local-only state resolution,
   dispatch-time capture, multi-issue marking, and the no-cost-division rule.

4. **R1-F004 [P2] - Assign `action-capture.mjs` classification to exactly one child.**

   Task 1 lists `scripts/task-tracker/lib/action-capture.mjs` "only where shared
   classification helpers belong" (line 170). Task 3 lists the same file (line
   272) and owns the bullet "Preserve existing action-capture public
   classification behavior while adding safer telemetry-specific classification"
   (line 292). The spec assigns the hardening of the insufficient leading-
   `mutation` regex to telemetry-specific classification. So the helper's home is
   nominally Task 1 while the work that creates it is a Task 3 checkbox, and both
   children declare write access to the same file.

   Two children editing one file is the shared-file hazard this repository
   requires be surfaced before fan-out, and here it is also an ambiguity about
   which child's tests prove the classifier is correct.

   Put the telemetry classifier in Task 1's `graphql-usage/*` library with its own
   tests for comments, selected operations, and unsupported syntax, and reduce
   Task 3's bullet to wiring the Task 1 classifier while asserting that
   action-capture's existing public classification is unchanged. Or keep the work
   in Task 3 and remove `action-capture.mjs` from Task 1's boundary. Either is
   fine; the current split is not.

5. **R1-F005 [P2] - Name how the real creation-to-planning workflow is obtained.**

   Task 5's Interface (lines 384-394) requires at least one real
   creation-to-planning workflow, and its bullet at line 404 forbids creating
   artificial backlog changes solely for traffic generation. Correct on both
   counts, and consistent with the spec. But the plan never says where that real
   workflow comes from. An implementer reaching Task 5 has only two written
   options: wait for unrelated real backlog work to be scheduled during the
   declared overlapping 60-minute window, or manufacture traffic, which is
   prohibited. The completion gate is therefore unschedulable as written, and the
   most likely failure mode is the implementer quietly choosing the second option
   under schedule pressure — which would invalidate the baseline the whole spike
   exists to produce.

   Name the source in the runbook: identify the candidate real workflow at Task 5
   preflight (for example, an already-scheduled backlog issue's own creation and
   hydration through Plan), record that it was independently scheduled, and state
   what happens if no such workflow lands inside the window — preliminary
   baseline and a deferred parent, not synthesized traffic.

## Required changes

1. R1-F001: name `scripts/gh/lib/github-projects.mjs` in Task 3 and assign
   `gql()` augmentation plus the stdin `--input -` compatibility fixture.
2. R1-F002: give the four missing report outputs an owning task bullet and
   extend parent AC5, or record them as explicitly deferred.
3. R1-F003: extend parent AC4 with the no-extra-calls clause, add enforcing
   tests on both the collection and reporting sides, and own the local-only
   context-resolution rules.
4. R1-F004: assign the telemetry classifier and `action-capture.mjs` write
   access to exactly one child.
5. R1-F005: name how Task 5 obtains its real creation-to-planning workflow and
   what happens when none lands in the window.

Keep the ratified spec unchanged; all five are plan-alignment changes. The
author should make every artifact edit and record each disposition in the
generated author response before the next round.

## Optional suggestions

1. Task 1's schema bullet (line 184) enumerates a subset of the spec's raw-event
   table. Naming the remainder — `logicalOperationId`, `pageIndex`,
   `processExitCode` as distinct from a null `httpStatus`, `rateLimit`, endpoint
   host, `budgetScopeId`, and `kind: mixed | unknown` — would stop later children
   from churning a v1 schema they are supposed to consume.
2. Plan Metadata line 99 reads "Parent issue: #1818" in a plan whose subject is
   #1818. #1818 becomes the top-level epic and has no parent; the self-reference
   could mislead hydration.
3. Task 4 line 319 declares a dependency on Task 2 only, but Task 4 also consumes
   Task 1's record schema. Worth correcting, and worth noting that Tasks 3 and 4
   are independently deliverable once Task 2 lands, so "five ordered children"
   forgoes real parallelism between them.
4. Task 5's `git log --oneline -1` (line 435) asserts nothing and cannot fail.
   Replace it with the commit-attribution check that actually gates delivery, or
   drop it.

## Decision

revisions-requested
