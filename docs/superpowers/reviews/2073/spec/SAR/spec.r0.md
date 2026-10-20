# #2073: Reduce refinement GraphQL traffic before continuing #2039

Status: Draft for independent review. No implementation or review approval is claimed.

Tracking story: https://github.com/kburson/ai-task-manager/issues/2073

Source checkout inspected: `955fa3336850c84015404567ecad7e245582a828`.

## Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** refine stories using bounded, targeted GitHub reads while preserving native authority checks
- **Need:** repeated complete-authority collections and unnecessary nested child queries consume the shared GraphQL allowance
- **Value or failure prevented:** keep subsequent delivery work available without unnecessary quota exhaustion or weakened admission

## Decision and delivery boundary

Deliver one standalone solo prerequisite outside #2039. Extract narrow optimizations from #2049, #2066 and #2050, implement them in the existing execution paths, and retain the broader cache architecture under #2039. This story does not depend on completion of those children or require moving #2039 into Develop.

The user authorized story creation and this draft specification. A different chat will independently review the specification and perform subsequent planning and implementation through the normal lifecycle. This document grants no review approval or gate exception. The four-hour scope target must be validated during Refine using local evidence, with a maximum of five hours only for a documented integration complication. If the exact patch does not fit, reduce or split the scope before implementation.

## Evidence and limits

Source evidence is retained in:

- `docs/superpowers/reviews/2039/refinement/2026-10-20-2039-authority-query-attribution.md`
- `docs/superpowers/reviews/2039/refinement/graphql-usage-2026-10-20.md`
- `docs/superpowers/plans/2026-10-20-2039-refined-wave-plan.md`, Tasks 28, 23 and 31

A completed first-refinement invocation for #2060 recorded 507 CLI observations, 336 known points and 171 observations with unknown costs. Estimation projection and configured project-membership query families contributed 324 known points. A separate measured leaf query consumed 27 points despite zero children because the document selected nested child/project/field connections before checking issue kind. Those are measured baseline observations, not predicted savings. CLI observations can hide multiple HTTP requests, and point costs from opaque commands remain unknown.

The inspected source explains the amplification:

- `scripts/task-tracker/lib/decomposition-hook-authority.mjs` includes the nested sub-issue graph in its initial query; only later does it branch on `parseIssueKind(node.body)`.
- `scripts/task-tracker/lib/decomposition-field-writer.mjs` invokes `readEstimateWriterAuthority` independently for Estimate, Size and body-field effect observations.
- `scripts/task-tracker/lib/estimate-writer-publication.mjs` checkpoints all business effects; its authority reader resolves configured membership and collects the complete decomposition authority.
- `scripts/task-tracker/lib/decomposition-publication.mjs` runs these checkpoints before individual effects, multiplying complete collections.

The runtime caller chain must be verified against the execution checkout before edits. Shared query-template fingerprints identify shapes, not an exact recorded stack for every call.

## Required behavior

### 1. Collect the child graph only when admission needs it

Make the first hook observation exclude nested child project/field enumeration. Collect the current issue identity, authoritative body/kind, current assignment, configured project authority and other information already required for admission. Use a shallow child-presence/count observation if needed to distinguish a structurally childless issue from one that requires child checks.

Only omit the detailed graph when fresh evidence establishes that the current admission decision does not depend on children. Do not infer this from an old local classification, a title, missing connection data or an assumed default kind. Epics and other cases requiring child authority must still collect the complete necessary graph with the existing completeness and refusal semantics. Ambiguous identity, kind or structure must retain the full safe path or refuse; they must never produce a permissive leaf shortcut.

Retain the existing bounded pagination, duplicate/missing identity checks, configured membership checks, deadlines, response limits, forecast checks and local plan provenance verification. If observations are collected in phases, validate identity and relevant body/context continuity across phases. Changed evidence must refuse or restart through an explicitly bounded native route. Do not add unbounded retries. Multi-request GitHub reads are not atomic; do not claim this optimization supplies transactional isolation.

Acceptance for the leaf fixture: no dispatched document selects nested child project memberships or child field values. Parent/epic fixtures still exercise their required child checks and reject incomplete children or changed dependencies.

### 2. Observe concrete field effects without recollecting all authority

Keep complete authority collection at the existing proposal, ownership and publication authorization boundaries. Optimize the concrete observations that answer only these questions: what are this configured item's Estimate and Size, and what Estimate/Size values are in this issue's field block?

Use the already-authorized exact repository, issue, project and item identities. Observe only the necessary current resource content and identity. A target read must reject absent, foreign, duplicate, inaccessible or malformed target evidence. Preserve explicit unset/null semantics; a missing resource or malformed response must not become an unset field. Continue comparing the actual effect digest with the expected before/intended/permitted digests through the native writer protocol.

Estimate and Size may share one project-field observation within a single explicitly scoped checkpoint. A body-field observation may share a current body read within that same checkpoint. Do not persist or reuse these observations across commands, checkpoints, effect applications or recovery attempts. Invalidate relevant observations after attempted writes, including failed/uncertain writes, and after relevant drift. Post-write confirmation must observe the actual resource afresh. If precise invalidation is difficult, prefer narrow fresh reads over introducing a general cache.

Preserve native publication manifests, operation IDs, context ownership, genuine before-value records, pending/unknown outcomes, retry reconciliation and refusal behavior. Preserve complete checks that authorize writes; targeted read-back does not replace authorization. Do not use this story to simplify or bypass those checks.

Acceptance for field-effect fixtures: scalar/body effect observation does not invoke the full estimation projection, complete decomposition collector or repeated membership resolver merely to read a concrete value. Actual runtime entrypoints must use the changed adapters; an unused optimized helper is insufficient.

### 3. Make the reduction measurable and regression-tested offline

Add `scripts/tests/integration/task-tracker/lib/refinement-traffic-budget.integration.test.mjs` as the proposed focused verifier. Reuse the existing native decomposition fixtures where suitable. Drive the production refinement/admission orchestration with injected provider transports; do not replace the orchestration with a mocked calculator or substitute authority success values.

Retain a reproducible pre-change baseline using the same logical fixture, resource population and workflow boundaries. Capture separate dispatch and query-family counts for the baseline and optimized paths. Declare allowed families and ceilings independently in fixture data before running the optimized workflow; the implementation must not derive its allowance from the requests it just emitted. Verify the assertion rejects one injected extra request and an unclassified request.

Minimum cases:

1. Fresh childless issue: no nested child project/field query; legitimate required checks remain.
2. Epic/parent: required child graph is read and existing child readiness/dependency refusals remain effective.
3. Incomplete pagination, identity mismatch, duplicate membership, malformed field data and ambiguous classification refuse safely.
4. Estimate and Size observations share no more than one concrete project read per checkpoint where they observe the same resource; body fields do not trigger an estimation projection.
5. Relevant writes, external changes and uncertain write outcomes do not allow stale confirmation from a prior checkpoint.
6. Existing pending-operation and confirmed-effect recovery semantics remain compatible; already confirmed effects are not blindly replayed.
7. The actual optimized route has fewer provider dispatches than the retained baseline and satisfies the independently specified query-family ceilings.

Count CLI observations and underlying transport requests separately when both layers are observable. Record operation family, checkpoint/phase, target identity, outcome and returned cost where available. Retain explicit unknown costs. Record serialized payload byte counts where the fixture/transport exposes them, identifying decoded or serialized sizes rather than claiming compressed wire coverage. This story need not build a general HTTP tracing system.

The focused verifier must produce a retained machine-readable or textual baseline/optimized report. Commit the report, relevant fixtures and review collateral when the future implementation session completes its ordinary review. No tests have been run or passed by creating this specification.

## Validation and activation

Implement in this order: leaf admission, targeted field observations, integrated budget proof. Make each optimization active in the public workflow before counting its benefit toward subsequent work. A helper-only foundation deferred until #2039 cache activation does not meet this specification.

Start with offline failing regression fixtures. Run the focused verifier and relevant existing decomposition/recovery tests after implementation, then the checks required by the native lifecycle. Do not disable guards, invent evidence markers or use repeated live transitions as a test loop.

After offline checks pass, allow at most one bounded instrumented live comparison of the changed workflow. Record its declared call boundary before dispatch. If quota or a safe comparable transition is unavailable, retain the offline proof and explicitly state that live savings remain unverified. A live observation must not be represented as an A/B comparison unless the baseline is actually comparable. Use existing native usage capture for any live commands; do not expose credentials in evidence.

Success means the real leaf and field-effect paths dispatch fewer unnecessary requests while the specified authority/refusal behavior remains intact. There is no promised percentage reduction and no requirement to eliminate all GraphQL use.

## Extraction ledger and source-story ownership

| Source | Portion owned by #2073 | Scope remaining under #2039 |
| --- | --- | --- |
| #2049, Task 28 | Conditional child-graph loading for the existing hook/admission path | Working/published cache views, Explain integration and broader guard routing |
| #2066, Task 23 | Target-specific observations and bounded checkpoint sharing for existing refinement field effects | Frozen cached resource publication, conflict semantics and recovery |
| #2050, Task 31 | Current-path offline traffic baseline, query-family ceilings and regression failure proof | Whole-transition cache budgets and complete cache integration fixtures |

These portions are newly delineated extractions, not evidence that the existing child scopes already permit independent delivery. Review their exact boundaries before implementation. Subsequent plans for the source children must reuse this implementation rather than reproduce it. #2039 should consume #2073 as a prerequisite before bulk refinement resumes.

The creation of this specification does not itself edit the source stories, their reviewed plans, or native dependency edges. Publish those boundary/dependency updates through the governed workflow in consolidated per-issue updates at the appropriate state transition. Do not reparent or close the three source children as part of this solo story.

## Size boundary and exclusions

Provisional four-hour allocation: 0.75h leaf admission, 1.25h field observations, 1h regression/measurement, 1h review/integration. Validate this allocation during Refine without querying historical cloud tasks for estimation. The allocation is not an approved estimate; portions extracted from separately estimated stories still incur shared integration work. A fifth hour needs a concrete integration justification. Work exceeding that maximum requires a revised split, not hidden slippage.

Excluded: durable story cache, edit history/version schemes, ownership registry or handoff redesign, timing log changes, forecast schema changes, publication saga redesign, broad authority caching, global production request limiter, HTTP telemetry overhaul, readiness-cap repairs, gate exceptions, and implementation of the remaining #2039 children.

## Review handoff

The receiving session should read #2073 and this exact draft, verify source drift, review the safety of conditional child loading and concrete read-back, and challenge the four-hour estimate before producing its implementation plan. Keep independent review output, author responses and accepted artifact references with the ordinary committed collateral. No reviewer/model is selected by this draft. Planning and implementation remain for the separate session requested by the user.
