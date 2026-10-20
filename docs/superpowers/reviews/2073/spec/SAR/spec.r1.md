# #2073: Reduce refinement GraphQL traffic before continuing #2039

Status: Draft undergoing persistent single-agent review/revision (SAR). No implementation, independent review acceptance or native approval is claimed.

Tracking story: https://github.com/kburson/ai-task-manager/issues/2073

Initial draft source checkout reference: `955fa3336850c84015404567ecad7e245582a828`. SAR checks current local source bytes; its source inventory and hashes are retained with the review. The original reference is not a claim that SAR verified Git state.

## Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** refine stories using bounded, targeted GitHub reads while preserving native authority checks
- **Need:** repeated complete-authority collections and unnecessary nested child queries consume the shared GraphQL allowance
- **Value or failure prevented:** keep subsequent delivery work available without unnecessary quota exhaustion or weakened admission

## Decision and delivery boundary

Deliver one standalone solo prerequisite outside #2039. Extract narrow optimizations from #2049, #2066 and #2050, implement them in the existing execution paths, and retain the broader cache architecture under #2039. This story does not depend on completion of those children or require moving #2039 into Develop.

The user authorized story creation and this specification, then requested persistent native SAR only using `gpt-6-astra` with `high` reasoning effort. The SAR record retains dispatch evidence, reviewed inputs, findings and author dispositions. Single-agent convergence is document readiness, not independent peer approval. Subsequent planning and implementation remain separate governed work; #2039 refinement remains paused. This document grants no review approval or gate exception. The four-hour scope target must be validated during Refine using local evidence, with a maximum of five hours only for a documented integration complication. If the exact patch does not fit, reduce or split the scope before implementation.

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

Make the first hook observation exclude nested child project/field enumeration. Keep current issue node ID, number, repository identity, complete authoritative body, assignment, configured project authority, forecast comments and other existing admission evidence. Include shallow child presence with explicit connection completeness (for example the first child identity and `pageInfo`); missing or malformed connection data is unavailable, never zero children.

The leaf decision must agree with strict classification in `decomposition-authority.mjs:genuineKind`, including fenced-code treatment and valid progress-marker placement. `issue-kind.mjs:parseIssueKind` alone is insufficient because invalid markers also default to code. Preserve genuinely absent markers as ordinary code. Reuse or factor the strict classification without changing the complete collector's policy.

| Fresh evidence | Collection behavior |
| --- | --- |
| Valid non-epic classification, including unmarked code, and complete empty shallow child connection | Omit detailed child graph; retain all other checks. |
| Valid epic, with or without children | Collect required graph; existing readiness decides whether an empty graph is admissible. |
| Non-epic with children | Refuse structural inconsistency for this hook path. Do not collect and ignore children or reinterpret kind. |
| Invalid, duplicate or misplaced kind marker; unknown kind; missing identity or unavailable structure | Refuse unavailable authority. Never use a permissive parser fallback. |

The structural refusal is conservative and specific to this hook snapshot's consumers; other complete-authority collectors retain their semantics.

Use one shared remote and total deadline for all phases. Retain the existing maximum of the initial connection page plus two continuations, duplicate/missing identity checks, configured membership checks, response limits, forecast checks and local plan provenance. Every root/child continuation must echo and validate exact node identity; item-field continuations must validate item, project and issue-content binding. The child graph request repeats root identity/body and obtains a complete bounded child identity inventory alongside its graph. Compare root identity/body with the first phase.

After multi-phase remote collection, perform a bounded root fence: reobserve root identity/body, assignment/viewer, configured membership/item, relevant project fields/status and complete shallow child identity inventory. Compare to the evidence used in collection. Do not add comments or nested child fields to this fence. An initial nonempty presence read is not a complete inventory: use the graph's completed inventory as the comparison baseline. For a non-epic empty inventory, use the initial empty connection.

Any observed identity, body, assignment, membership, relevant field or child-inventory mismatch refuses. No internal automatic retry: a new ordinary invocation starts fresh. Pagination failures refuse. Preserve child label/dependency/field completeness; visible inconsistencies across their pages refuse. Multi-request reads remain non-atomic: the root fence does not detect every concurrent child/comment update, and cannot guarantee freshness after a resource was read.

Acceptance: an unpaginated valid leaf uses one snapshot selecting no nested child project memberships or field values. Parent/epic and paginated fixtures budget the extra phases/fence. Test kind changes, child add/remove, membership/item replacement, assignment/status drift, inconsistent children and incomplete continuations; retain required readiness/dependency refusals.

### 2. Observe concrete field effects without recollecting all authority

Keep complete authority collection at the existing proposal, ownership and publication authorization boundaries. Optimize the concrete observations that answer only these questions: what are this configured item's Estimate and Size, and what Estimate/Size values are in this issue's field block?

Use the already-authorized exact repository, issue, project and item identities from the writer subject; never rediscover a different item during scalar observation. Narrow readers observe values, not capabilities. Preserve complete `runtime.collect`, ownership, lock/context, intent, before-record and final-authority checks that authorize or reconcile effects. Keep `assertDecompositionPublicationOwner` and its installed effect checkpoint.

The target observation contract is:

- Project reads validate the exact `ProjectV2Item`, configured project ID and issue content binding (issue ID, number and repository identity). Deleted, inaccessible, draft, transferred, wrong-type or foreign content refuses. Obtain issue ID from current authorized identity evidence; account for any added preparation read.
- Match configured field IDs, never names. Verify current Estimate/Size definitions belong to the project and have number/single-select types within the same read scope. Removed definitions are unavailable, not unset. Do not assume GraphQL supports filtering connections by ID: use supported identity-bound queries or bounded complete enumeration. Validate definition project association. If this cannot be narrow, retain safe complete reads and make no savings claim for that case.
- A complete valid values connection with no entry for a proven configured field denotes unset (`null`). Present typed scalars must include their selected value property; explicit null is unset only when supported by that type. Missing properties, wrong union types, duplicate identities, missing pages and GraphQL errors refuse. Estimate is null or finite nonnegative number, including zero. Size is null or `XS`, `S`, `M`, `L`, `XL`, with a valid configured option. Do not coerce strings, invalid values or missing resources to null.
- Body reads validate exact issue/repository identity and string body. Require a single well-formed current or supported legacy field block; missing, malformed or multiple authoritative blocks refuse. Apply this strictness to the new field-effect reader without changing unrelated general-parser consumers. Within a valid block only, preserve the existing missing-key-as-unset rule for Estimate and Size. Explicit null also means unset; other values obey the scalar domains. Malformed block-like delimiters must not disappear merely because the permissive parser cannot recognize them.

Keep native effect shapes: scalar Estimate, scalar Size and `{estimate, size}` body values. Their digests remain identical for the same valid values, and must match native genuine before/intended/permitted records. Validation failures never yield a fabricated unset digest.

Sharing is optional and requires an explicit short read scope. The initial before-value batch and **each invocation** of `checkpoint(owner)` are distinct scopes; nested ownership checkpoints are new scopes even with the same owner/operation. The concurrent before-value batch may single-flight the common project read. Close each scope after its reads and before metadata persistence, callbacks such as `beforePublicationEffects`, effect application or another checkpoint. Only consumers within that read-only scope may share its validated project/body observations.

Out-of-scope reads are fresh. Immediate pre-effect reads, post-write confirmation, completed-operation verification, registry reconciliation and each recovery invocation cannot use an earlier scope. Attempted writes invalidate affected pending/completed observations before later reads, including failed/uncertain writes. A shared failure remains unavailable for all its consumers and never persists across scopes. External changes between scopes must be observed; no atomicity is promised between responses inside a scope. Prefer narrow fresh reads if explicit scope management is unreliable; document their separate ceiling and do not claim sharing.

In an unpaginated sharing fixture, Estimate and Size consume one combined project observation per actual checkpoint invocation. One logical observation can require bounded continuation/definition requests; count every dispatch. Do not deduplicate across separate ownership-checkpoint invocations.

Preserve manifests, operation IDs, context ownership, genuine before records, pending/unknown outcomes, retry reconciliation and refusal behavior. The optimization owns the three concrete adapters in `publishFieldEstimateRevision`, including callers in `verbs/refine.mjs`, `apply-reevaluate.mjs` and `decomposition-migration-writer.mjs`. Common checkpoint changes must preserve all `executeEstimateWriter` consumers. Unrelated forecast/comment/assessment effects are outside this optimization. `readRegisteredEstimateEffect` may retain complete predecessor observations; their removal is neither required nor a claimed saving.

Acceptance: concrete scalar/body adapters use identity-bound readers without complete estimation projection, decomposition collection or repeated membership resolution merely to read that value. Surrounding authorization remains complete and counts in the budget. Verify changed/unchanged refine, pending/completed retries, unknown outcomes, confirmed-effect drift, predecessor reconciliation and compatibility of affected shared-writer callers. Confirmed effects must be checked, not blindly replayed.

### 3. Make the reduction measurable and regression-tested offline

Add `scripts/tests/integration/task-tracker/lib/refinement-traffic-budget.integration.test.mjs` as the focused verifier. Reuse fixture data, but retain production orchestration, writer, collector, parsing, ownership and refusals. `scripts/tests/fixtures/refinement-orchestration.mjs` replaces `publishRefinementRevision` and cannot prove this requirement. Unit fixtures replacing complete authority ports or returning one oversized response for every query are not traffic evidence.

Declare separate measured boundaries before execution:

1. Real `evaluateHookDecomposition` admission with its production collector, plus native activity/source-hook and plan-exit routing smoke coverage proving public consumers select this path. Label the measured admission boundary accurately; it excludes launch, binding and timing unless explicitly included.
2. Real `runRefine` changed-field publication through `publishFieldEstimateRevision`, `executeEstimateWriter`, concrete project/body writers and production authority collectors. Measure first entry and Refine completion separately; include promotion when claiming whole-refine savings. If the complete transition cannot run offline without policy-success substitution, name the measured boundary publication, retain real-refine routing proof and mark whole-refinement savings unverified. Do not replace `publishRefinementRevision`, inject authority/admission success or omit internal provider calls while claiming integrated proof.

Use a query-aware stateful transport at the lowest practical provider boundary. It returns only selected content, applies controlled mutations and logs every dispatch. Baseline and optimized runs start with independent identical resource populations. Unknown documents/paths and attempts at real networking fail. Provide local plan/config/lock fixtures without mocked policy verdicts. Distinguish CLI observations from transport requests when both are exposed; opaque CLI calls do not establish HTTP counts.

Before changing production code, retain a runnable baseline: pin the source revision and SHA256 manifest of relevant source, fixtures and config; preserve the external offline driver and deterministic starting population; document exact commands, runtime and boundary. Rerun the locally retained immutable pre-change revision with that same driver in an isolated checkout using a documented offline recipe. Verify its source objects remain available locally at implementation handoff. If extra transport seams are necessary, retain and hash a seam-only overlay and review that it leaves baseline business/control flow intact. A totals table or handwritten request replay is insufficient. Missing source objects or semantic changes to the supposed baseline block reproducibility and savings claims. Never derive historical baseline counts from optimized code.

Define allowed operation families, phase/checkpoint identity, populations and per-family ceilings in versioned fixture data before optimized execution. Classify requests by semantics/shape, not implementation labels alone. Each dispatch must match exactly one allowed family. Unknown or ambiguous shapes fail. Prove each boundary's budget oracle rejects an injected extra request at its ceiling and an unclassified request. Add an independent total-dispatch ceiling. Pagination, fence and failure cases have declared separate ceilings; no allowance derives from the requests just emitted.

Minimum cases:

1. Valid unmarked and explicit non-epic childless issues omit nested child fields while retaining legitimate authority checks.
2. Epics read the required graph/fence and retain child readiness/dependency refusals, including incomplete/empty graphs. Structurally inconsistent non-epics refuse.
3. Incomplete pages, wrong identities, duplicate memberships/fields, missing definitions, wrong union types, malformed/duplicate body blocks and ambiguous kinds refuse. Valid null, zero and legacy/missing-key body values retain declared meanings.
4. Concrete adapters use narrow reads; optional sharing obeys the actual checkpoint scope and pagination budget. Body-field observation alone never causes a projection.
5. Metadata/callback/business writes, nested owner checks, external changes between checkpoints and uncertain outcomes cannot confirm from older scopes. Cover failures both before a write and after provider application.
6. Pending/current and completed retries, confirmed-effect drift and predecessor reconciliation retain manifests and genuine before digests; confirmed effects are not blindly replayed. Cover other consumers affected by common checkpoint changes.
7. Baseline and optimized success cases produce equivalent intended business values, manifests/effects and admission decisions. Safety cases prove specified refusals (including intentional stricter malformed/structural refusals) and no unauthorized business writes. Early failure/unchanged paths cannot win a changed-publication budget.
8. Changed field-publication dispatches are strictly fewer than the rerunnable baseline and below all independent ceilings. Leaf admission proves shape reduction and bounded count, not necessarily fewer requests. Parent phasing may add justified bounded requests. Fixture counts/shape do not establish live cost-point savings.

Record family, checkpoint/phase, target, outcome and returned cost when available. Preserve unknown costs. Label synthetic cost values as synthetic and exclude them from live savings claims. Record payload bytes only at the exposed layer, identifying serialized/decoded sizes rather than compressed wire coverage. No general HTTP tracing system is required.

Retain a baseline/optimized report with provenance, exact boundaries, outcome comparisons, raw classified dispatches, ceilings/counts, coverage/unknowns and regeneration commands. Commit the report and reproducibility fixtures with future implementation review collateral. No product tests or savings measurements have been performed by drafting or reviewing this specification.

## Validation and activation

Implement in this order: leaf admission, targeted field observations, integrated budget proof. Make each optimization active in the public workflow before counting its benefit toward subsequent work. A helper-only foundation deferred until #2039 cache activation does not meet this specification.

Start with offline failing regression fixtures. Run the focused verifier and relevant existing decomposition/recovery tests after implementation, then the checks required by the native lifecycle. Do not disable guards, invent evidence markers or use repeated live transitions as a test loop.

After offline checks pass, allow at most one bounded instrumented live comparison of the changed workflow. Record its declared call boundary before dispatch. If quota or a safe comparable transition is unavailable, retain the offline proof and explicitly state that live savings remain unverified. A live observation must not be represented as an A/B comparison unless the baseline is actually comparable. Use existing native usage capture for any live commands; do not expose credentials in evidence.

Success means the real leaf path avoids unnecessary nested selections and the changed field-publication path dispatches fewer requests over its comparable boundary while authority/refusal behavior remains intact. Account separately for necessary parent/continuation checks; never remove them to meet a budget. There is no promised percentage reduction and no requirement to eliminate all GraphQL use.

## Extraction ledger and source-story ownership

| Source | Portion owned by #2073 | Scope remaining under #2039 |
| --- | --- | --- |
| #2049, Task 28 | Conditional child-graph loading for the existing hook/admission path | Working/published cache views, Explain integration and broader guard routing |
| #2066, Task 23 | Target-specific observations and bounded checkpoint sharing for existing refinement field effects | Frozen cached resource publication, conflict semantics and recovery |
| #2050, Task 31 | Current-path offline traffic baseline, query-family ceilings and regression failure proof | Whole-transition cache budgets and complete cache integration fixtures |

These portions are newly delineated extractions, not evidence that the existing child scopes already permit independent delivery. Review their exact boundaries before implementation. Subsequent plans for the source children must reuse this implementation rather than reproduce it. #2039 should consume #2073 as a prerequisite before bulk refinement resumes.

The creation of this specification does not itself edit the source stories, their reviewed plans, or native dependency edges. Publish those boundary/dependency updates through the governed workflow in consolidated per-issue updates at the appropriate state transition. Do not reparent or close the three source children as part of this solo story.

## Size boundary and exclusions

The owner's provisional four-hour allocation is 0.75h leaf admission, 1.25h field observations, 1h regression/measurement and 1h review/integration. **Local SAR evidence does not validate that allocation.** The four principal modules total 1,184 lines at reviewed source; the 600+ line ownership projection adds nested checkpoint interactions. Strict kind/body parsing, shared callers and predecessor recovery add compatibility work. Existing fixtures do not supply the exact query-aware baseline driver and read-scope seam. These are concrete integration risks, not proof of a replacement estimate.

Before Refine/Plan approval, produce an offline file/call-site/test inventory and justified estimate. Identify existing versus required transport seams, whether sharing is economical versus fresh reads, baseline source retention and existing shared-consumer protection. The budget is supportable only if those seams/fixtures are cheaply reusable without publication-policy redesign. Do not query historical cloud tasks for estimation.

The estimate remains unvalidated until that work is reviewed; SAR convergence does not clear this gate. A fifth hour needs concrete integration justification. If safety and measurement work cannot fit five hours, present a governed split or revised owner budget before implementation. A candidate split is leaf admission plus its shape/budget proof, then targeted observations plus publication/recovery proof. This is an option for later owner decision, not an enacted split or deleted requirement. Source-story/dependency changes use the normal workflow. Never waive safety to fit the cap.

Excluded: durable story cache, edit history/version schemes, ownership registry or handoff redesign, timing log changes, forecast schema changes, publication saga redesign, broad authority caching, global production request limiter, HTTP telemetry overhaul, readiness-cap repairs, gate exceptions, and implementation of the remaining #2039 children.

## Review handoff

The receiving session should read #2073, this specification and `docs/superpowers/reviews/2073/spec/SAR/README.md`, verify execution-source drift and complete the estimate/transport-seam gate before producing an implementation plan. Retain review responses, author dispositions and exact hashes with ordinary collateral. Requested SAR identity and its evidence limits are recorded there. Convergence grants no native Refine/specification approval, Plan approval, lifecycle movement or implementation authority. Planning and implementation remain separate from the user's specification-only request.
