<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a898b40001f156594e900dd6220e154e"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-12-1915-completed16-original-session-resumption.md"
artifact_commit: "ac0102de3893e84c1c64401ea04822cd91dd0e81"
artifact_blob: "1fcf3cb2254c4db1a5e4c74b2f4e516660c4768e"
artifact_digest: "sha256:9be27c5baac14c76c879634f7a96bb0e2005d6a8124d3b608bd827f7ecd62ff7"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:cf1653e9abbe048eeffc90dd438151cd4a03a3c4aa54a57c608043311a47b9be"
  identity_source: "declared"
started_at: "2026-10-12T13:29:08.271Z"
submitted_at: "2026-10-12T13:31:00.164Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Accepted as an implementation plan for the bounded completed16 increment. I read the entire plan, its referenced approved specification and approval record, and the relevant current production and fixture implementations. I found no required correctness, scope, custody, or verification-plan changes. This accepts preparation for later authorized implementation; it does not attest that the proposed APIs exist or that implementation, RED/GREEN qualification, lifecycle approval, or delivery has occurred.

### Reviewed artifacts and provenance

- Plan: docs/superpowers/plans/2026-10-12-1915-completed16-original-session-resumption.md, SHA-256 9be27c5baac14c76c879634f7a96bb0e2005d6a8124d3b608bd827f7ecd62ff7. This exactly matches this generated response's protected artifact digest.
- Approved specification: docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md, independently computed SHA-256 55d540975484f12c61c37d6488964d6104b2fb73eb074bcbe90edb5439e963ac. It matches the exact design approval in docs/reviews/1915-completed16-plan-20261012/design-human-approval.md. The older pending-status paragraph in the unchanged specification is superseded for this planning purpose by that explicit exact-digest approval record; no specification edit is needed for this review.
- Reviewer is the actual distinct Codex Astra session assigned gpt-6-astra with high effort. Its own provider-native turn_context record reports model gpt-6-astra and effort high. The package join used this reviewer's canonical current CODEX_THREAD_ID, selected directly in this process, with host codex/provider openai. No other participant handle or identity environment value was injected or copied.
- Hooks remain disabled. The ordinary CLI join correctly refused incomplete runtime identity with APR_IDENTITY_REQUIRED. The subsequent successful join used the selected global package's exported command engine with explicit manual declared identity, unchanged process environment/cwd/stdout/stderr, and the exact invitation. Provider-native local turn evidence corroborates the actual model/effort, but does not upgrade the protocol's declared identity to hook attestation. The protected authority_assurance: unavailable and identity_source: declared fields are retained exactly. This is normal-mode manual same-provider review, not no-commit/test evidence.
- I issued no Git commands, changed no reviewed artifact or source/test file, performed no lifecycle mutation, and wrote only this exact generated reviewer response. Package join/submit own their protocol scratch transitions.

### Specification-to-plan assessment

1. Admission and authority remain narrow. Task 1 introduces a one-use actual moveState-call object and separately branded resume/read custody after the existing policy, source, guard and capability checks. It keeps completed1–15 admission-only, refuses non-test or changed onEnter actions before the new read, and binds retained actor identity to fresh provider/session/executor. The new exported assertions are comparison-only; historical journal DATA cannot register live authority. A private saga context avoids modifying the captured caller. This directly addresses the current moveState/evaluateOriginalNativeStageRestart and tryNativeStageOriginalEntry boundaries, where source inspection confirms admission-only behavior and final unchanged-snapshot checks.

2. The existing-comment route avoids replay. Current transition-commit.mjs writeTransitionCommit performs create before read and retains actual creation/read membership; current store readMemoryNativeStageTransition requires a pending step16 plus live nativeTransitionCreates. The plan correctly adds a distinct genuine GET/parser route and private result custody instead of repurposing either function with restored historical membership. Task 1's envelope/census/whole-resource comparison matches the approved memory-only contract and preserves the completed step16 readback. It explicitly excludes POST, step16 persistence, and production transport activation. The new audit label distinguishes the read from the existing mutating step16 readback.

3. The scope and lock plan matches the existing execution topology. runPostCommitTail selects its native behavior through isMemoryStageEffectScope and rethrows native tail errors; a missing stage quarantine would reach the host branch. The plan therefore requires both runMemoryContext(activity stage-write) and withMemoryStageEffectQuarantine, with positive scope checks before reader/tail/transport boundaries. Store dispatch uses the timing resource lock; cache uses the activeTask checkpoint lock. Releasing the existing-read timing lock before dispatch, then dispatch before cache, avoids recursive acquisition while keeping comparison evidence under the shared revision interlock. The current original-tail leaf finally blocks delete leaf membership, so the explicit separate lifetime through reporting/final policy is necessary and is specified.

4. Original17/18 continuation is genuinely testable. Task 2 reuses DEFAULT_TAIL_STEPS and existing original dispatch/cache programs and return comparisons. It requires complete snapshot/trace assertions in addition to the eight-operation subsequence. The ordered invocation-bound cursor addresses equal snapshots at distinct dispatch boundaries; an unordered accepted-snapshot collection cannot satisfy the plan. Current store operation runs failBefore, performs its callback, records the effect, then runs failAfter. The prescribed cursor updates inside genuine operation boundaries and exact before/after fault expectations preserve landed mutations when failAfter throws. The plan does not promise restart recovery for those newly interrupted states.

5. Reporting and finalization have explicit ownership. Current readMemoryNativeStagePartialFacts proves original holder membership and snapshot stability, then derives journal facts; it is not the new resume resource proof. Task 3 specifies separate resume holder membership, full independent history/resource reconstruction, synchronous retained-descriptor checks before audited reads, actual return binding, and no further reporting/final-policy reads once custody is refused. Source-correction.mjs already reconstructs pending17 and both legitimate before/after-cache18 vectors; the plan adds the exact ordered cursor constraint rather than misusing the completed1–16 recognizer. Policy owns discarding a computed verified partial if final comparison refuses, returning a fresh unverified Core DATA value without reading properties of an untrusted thrown object. Existing1–15 exception behavior remains intact.

6. Exact results cannot hide omitted work. The four terminal categories share the approved conservative failure shape with no total field. Task 3/4 require independently checked whole snapshots and complete operation traces, while partial fields describe only prior16 facts. Task 1's temporary unverified checkpoint is explicitly replaced by a verified prior16 positive after Tasks 3/4; it cannot become a permanent shortcut. The first sixteen readbacks, transaction/header/clock, comment identity and physical files are preserved; the activeTask delta is memory-resource bytes only. A fresh report/final-policy refusal cannot reuse an earlier verified result.

### Test and source-grounding assessment

- Inspected the current known-prefix-entry registration and its authentic knownSnapshots capture/1..16 completeness loop in native-stage-continuation-fixture.mjs. The current ordinal16 case expects known-prefix-continuation-unavailable, unchanged snapshot and fixed audit reads only. The planned RED and intentional ordinal16-only expectation transition correspond to actual current assertions.
- Read native-stage-original-entry-controls.mjs. It includes a distinct pre-admission refusal predicate and representative ordinal16 resource/readback cases. The plan keeps it and the whole capture map intact, while placing admitted post-read failures in the new helper with their exact returned-result predicate. This prevents incorrectly calling admission refusal a successful reader-boundary test.
- Read the existing fixture descriptor/structuredClone/AsyncLocalStorage observation patterns, transition result custody controls, cache late-read/config controls, and partial-reporting final source/authority controls. Those patterns support observing genuine in-flight inputs/results without introducing a public production fault hook. The plan correctly requires proof the post-admission observer fired and rejects mutation of an opaque cloned backend.snapshot as evidence of private store drift.
- Read the native-stage known-prefix and cache unit boundaries, including getter-free shape/custody rejection and the cache release checks. The proposed new negative matrix preserves these existing invariants and separately names late substitutions after leaf cleanup, current actor drift, copied/expired tokens, outside-scope execution, skipped/reverted cursor states and final-policy refusal after a computed verified partial.
- Read store failBefore/failAfter setters and operation semantics, original dispatch/cache intent/effect/readback programs, stage-execution reconstruction codecs, source-correction pending history handling, transport quarantine and post-commit-tail. The sixteen interruption cases use actual supported fault setters and the eight real store operation labels.
- Ran a read-only Node inspection of the exact plan/spec bytes, every explicit scripts/tests/...test.mjs path named in the plan, and discoverOriginalCases(). The specification and plan digests match the values above; original static discovery returns 253; all explicitly named test paths exist. The separately documented legacy criteria-revision-transition-recovery.test.mjs does not exist, matching the plan's declared issue-verifier gap.
- Read criteria-revision-transition-profiles.mjs: it discovers actual static registrations, uses the existing 600000 ms per-file budget and bounded workers. The plan requires the complete registration set and discovery inventories, not only the numeric count, and preserves focused/sandbox limits. It also keeps full recovery/vertical verifiers and exact-head Linux/aggregate gates despite their later-repair ownership.

### Verification limits and remaining gates

This review performed source/specification/fixture analysis and read-only digest/discovery/path checks. I did not run integration or implementation tests: the new behavior is not implemented, and these authentic fixtures create files/processes outside the reviewer response boundary. The plan accurately labels future commands as obligations rather than passing receipts. Git source-baseline, live issue state, human lifecycle approval, elapsed-time forecasts and remote CI were not independently re-attested by this reviewer; the response artifact commit/blob are package-sealed metadata, and the plan itself requires source coordinates and lifecycle gates to be revalidated at execution.

The four accepted design-XPR suggestions are substantively carried into Task 1 Step 4, Task 3 Steps 3–4, and the global equality constraints. Existing story ownership, later completed17–24/ambiguous recovery, event-body authorization, the declared verifier repair, remaining completed1–15 work, independent subsequent XPR/deep dive, human plan approval and the selected execution handoff remain required. No additional suggestion is needed to make this implementation plan actionable.

## Findings

None.

## Required changes

None.

## Optional suggestions

None.

## Decision

accepted
