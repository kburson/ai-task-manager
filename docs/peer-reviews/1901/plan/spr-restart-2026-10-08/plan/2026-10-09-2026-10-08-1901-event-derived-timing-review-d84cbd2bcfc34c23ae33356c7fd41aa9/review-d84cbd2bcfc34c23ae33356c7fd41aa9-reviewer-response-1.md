<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-d84cbd2bcfc34c23ae33356c7fd41aa9"
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
  session_fingerprint: "sha256:19685058e4c340cdc0bdd0c9d96ee9ce7088fdd6bc6aa0d4d2eff767a83173b4"
  identity_source: "runtime"
started_at: "2026-10-09T01:32:08.926Z"
submitted_at: "2026-10-09T01:36:16.612Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Decision: revisions-requested. The plan carries forward the accepted bounded-observation, immutable-source, protected-byte, atomic-pair, three-attempt convergence, shared-activation and guarded-repair contracts well. The eight-task decomposition is broadly sound. Three planning gaps need resolution before hydration: the claimed existing SessionTime wall-span seam differs from current source behavior; core model-dispatch adapters remain unassigned despite strict ownership; and required historical fixtures/root verification bindings are incomplete.

This independent review covered the complete 452-line plan, complete 317-line specification including XPR clarifications, and current repository source. Plan SHA-256: `87cbab9c19ad2bdb00ec5b26a671dbbbc3ff9792fd115a9410e931fafd71a82e`, matching the sealed response. Specification SHA-256: `6e6e0aae4f1764850701f4f0be0b4593dfde8f1b84e968652b6cdf7b7bcd958f`, matching the accepted-spec reference. These are file-byte checks, not Git-history verification; no reviewer Git command was executed.

Source inspection covered lexical/actor codecs, engagement and ladder calculations, publication/read-back, runtime flush and queue handling, lifecycle emitters, scalar/board projection, outcome building and runtime selection, source-successor validation, historical backfill and comment-store pagination. Existing test paths listed in the plan were checked for existence; proposed new paths appropriately do not exist yet. No implementation tests or live timing mutations were run. Native join succeeded in this fresh review; the interrupted approval attempt was not treated as a join or decision. Trusted hooks refused the generic Python writer and the host's apply_patch payload before execution. The exact response was authored using the literal document heredoc route explicitly supported by `artifact-write-policy.mjs`, without changing hooks, bindings or identity. Protected frontmatter remains unchanged for package-owned submission.

## Findings

### R1-F001 — Resolve the SessionTime source mismatch before fixing its implementation contract

Severity: high. Required.

Plan locations: Global Constraints; `projectEventScalars` in Contracts shared across tasks; Task 5 Files and first verification bullet (lines 297–313). The plan states that SessionTime retains a separate existing wall-span function and remains unchanged. The accepted specification likewise requires independent wall-span SessionTime and forbids substituting summed actor effort.

Current source does not provide that behavior at the production board seam. `scripts/gh/log-issue-time.mjs:90–104`, `timingFieldProjection`, sets `sessionTime` from `rollup.totalActiveMin` and its seconds from `rollup.totalActiveSec`. `scripts/task-tracker/timing-rollup.mjs:305–337` derives those actor totals from `deriveActorEngagement(...).engagedMs`, a sum of actor intervals. `scripts/task-tracker/heal-backlog.mjs:176` also maps SessionTime to `totals.totalActiveMin`. Two observed overlapping actor intervals can therefore make SessionTime equal summed effort rather than wall span. The plan names no separate wall-span implementation and fixes neither a session scalar nor its endpoint/availability rules.

A generic test named independent SessionTime does not resolve this discrepancy. An implementer must choose between preserving the existing mapping, contradicting the accepted requirement, and inventing a wall-span policy while the plan calls it unchanged. That affects authoritative board values.

Required resolution: identify an actual authoritative wall-span implementation and its call path if one exists, or explicitly document the baseline discrepancy and define the intended calculation. Specify its observed start/end or interval-union policy, gaps, incomplete/mixed/protected histories, seconds/minutes fields and model dispatch. Assign the implementation and all board/maintenance mappings to owners. If resolution changes the accepted specification rather than supplying missing implementation detail, amend and re-review the contract before execution. Add executable cases with overlapping actors, interruption and incomplete event-derived effort to prove SessionTime remains independently defined, Engaged remains summed effort, and the board codec is unchanged.

### R1-F002 — Complete the concrete adapter ownership and model-dispatch map before hydration

Severity: high. Required.

Plan locations: Parallel waves and estimates ownership paragraph; Task 2 Files; Task 5 Files/outcome bullets; Task 7 dependency sweep. The ownership rule requires unlisted shared files to be routed to a declared owner, but several already identifiable required adapters have no owner or delivery decision. Deferring them to a Task 7 sweep leaves foundational decisions unresolved until after Tasks 3–5 integrate.

- `scripts/task-tracker/lib/estimation/runtime-adapter.mjs:1432–1454` selects complete versus incomplete outcome timing using `deriveActorEngagement` directly, then passes bare `stagesMs` or a source snapshot to the builder. It has no event-model/projection-validity selection. Updating a separate scalar helper and builder does not specify how stale, mixed-segment or protected-remainder event sources select the correct live outcome branch. Assign this caller and its dispatch while keeping old sealed validation on pinned semantics.
- `scripts/task-tracker/lib/timing-row-reader.mjs:132–155`, `readEstimationStageTiming`, is numeric policy inside the nominal lexical leaf. It credits only stage-named events, sums stored `row-sec`, and throws if such a row lacks that marker. Event-model update rows also carry work; partial rows deliberately omit complete `row-sec`; stored seconds need full-projection validation. Task 2 owns the file without a wave-1 engine dependency, while Task 5 must keep lexical implementation stable. Decide whether enabled callers bypass this retained legacy function, policy moves to another module, or a later owner-controlled edit is scheduled. Avoid an implicit lexical-to-engine dependency cycle.
- `scripts/task-tracker/lib/timing-ladder.mjs:68–81` drops model/projection metadata in its reduced rows; `deriveLadder` at lines 92–124 calls old actor calculation and returns unavailable Idle. Task 5 lists its test but does not assign the production module. Specify migration or explicit refusal at its supported enabled call sites and preserve information needed for dispatch.
- `scripts/task-tracker/lib/timing-actor.mjs:39–100` is the strict actor suffix parser used twice by the lexical reader. Task 2 promises tolerant actor/composed suffix handling without assigning this parser or defining its replacement boundary. Assign it or explain how a replacement preserves identity, endpoint and word-cursor validation.

Required resolution: add a source-grounded table mapping these adapters and already-discovered producer/maintenance call sites to one task owner, model behavior, dependency order and focused verifier. Settle which paths retain pinned legacy semantics, which use verified event projections, and which refuse enabled input. Include actual runtime outcome-path tests for stale projection, mixed coverage, protected unknown remainder and known event timing alongside sealed-record reuse. A generic later sweep or unsupported-core-consumer escape is insufficient for the claimed complete workflow.

### R1-F003 — Restore historical regression inputs and explicit root verification bindings

Severity: medium. Required.

Plan locations: Acceptance Criteria, Tasks 6/8 and Hydration handoff. The specification's Acceptance and verification section requires exact #1854, #1851 and #1852 captures with URL/body digest/capture time and asks the implementation plan to freeze commands and reconcile existing vc:1–vc:4 mappings. The plan assigns #1854 captures but never mentions #1851/#1852. It provides useful child commands and AC-to-task links without defining the promised root verification groups or reconciling those VC identities with AC1–AC6.

This can produce a formally complete decomposition that omits two required regression sources or retains obsolete root verification definitions. Broad npm test/test:slow execution does not establish which issue-level verifier proves each criterion.

Required resolution: assign all three captures to a task and name their fixture/provenance destination and verifiers. Treat unavailable required captures explicitly rather than silently substituting synthetic examples. Add an AC-to-VC-to-command mapping for the current root issue, retaining or deliberately superseding vc:1–vc:4 with explicit evidence bindings, and identify child evidence contributing to each root gate. Keep capture and preview read-only; this finding authorizes no historical apply.

## Required changes

1. Resolve R1-F001 with an explicit source-grounded SessionTime contract, implementation ownership and separation tests.
2. Resolve R1-F002 with the concrete adapter/model-dispatch map and actual runtime/legacy compatibility verification before hydration.
3. Resolve R1-F003 with all specified historical fixtures and frozen root AC/VC/command bindings.

Retain the accepted bounded-evidence, protected-source, canonical-activation, queue/journal and non-CAS convergence requirements. Adjust estimates or wave dependencies if ownership resolution adds work. No implementation or live historical writes are requested by this review.

## Optional suggestions

### R1-F004 — Make pending publication outcomes explicit at the legacy wrapper boundary

Task 3 introduces normalized pending/refusal results, whereas current `postTimingSafely` (`lib/timing-post-outcome.mjs:8–12`) treats any non-throwing `postTimingEvent` return as success, and `queue.mjs` draining consumes an item when its handler returns normally. Task 4 already requires honest checkpoint/remote outcomes, so this is clarification rather than an additional blocker: state whether the wrapper throws on remote-pending or every caller checks a discriminated result. Add a regression that a pending non-remote result cannot remove a queue item or freeze terminal evidence. Preserve the separate successful durable-enqueue checkpoint path.

## Decision

revisions-requested
