# #2071 WBS title compatibility and decomposition route support plan

> **For agentic workers:** Root has authorized preparation and a fresh primary plan review only. After separate implementation authorization, use the repository's executing-plans or subagent-driven-development procedure. This document does not authorize issue creation or implementation.

**Goal:** Deliver one independent correction that preserves an accepted BUG child claim when native Epic conversion changes only its canonical prefix, without changing ordinary assessment authority or sibling provenance.

**Architecture:** Keep literal WBS title comparison as the default. Add one narrowly qualified BUG-to-Epic compatibility case using current native child identity and strict body kind. Retain those facts through both existing collectors and bind them into assessment digests; add no new dispatch, policy engine, metadata field, or conversion flag.

**Tech Stack:** Existing Node ESM, GitHub GraphQL collectors, native AITM lifecycle, and node:test fixtures.

**Spec:** The accepted design is `docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md`, artifact commit `00ca5ab7a9c041464846c4563532a6061c2c178b`, blob `6ed42482aad392a25d11f559091468c3cf11525b`. Its XPR finalization is `bd544bd08a93b5d46f01c16f85ac6f3110bdee53`; design acceptance does not approve this support proposal or Phase6.

## Global constraints

- Root authorized this documentation revision and a fresh primary plan review. No issue creation, source/config implementation, product tests, kind/graph change, carrier construction or lifecycle move is authorized. A separately authorized native #2071 estimate publication has completed at 52h/XL; it is not authority to implement this correction.
- This is #2071 planning support, not an invented defect ID. Its current native assessment is must-decompose with only inspection, checkpoint, decomposition preparation and governed decomposition capabilities. The historical 3.5/4h estimate cannot authorize product edits.
- Preserve all original refs P/D/O/H/C/B and their historical commits, actor identities, timing, the #2071-to-#2039 relationship, #2145 dependency, and all 31 other sibling claims: 29 closed and open #2050/#2051, as confirmed by the source-only follow-up below. Re-observe the live inventory before any future operation.
- The potential correction is one independently deliverable compatibility fix. Do not add a dual-pin metadata field, generalized prefix stripping, descendant queries, exception engine, manual retitling, sibling rebinding, or an automatic follow-on defect.
- The current-source carrier and integration route below remain conditional. A delivered title fix alone is insufficient to authorize decomposition.

## Decision and duplicate check

The defect is a real incompatibility between existing contracts: registered kind conversion and first-child tethering intentionally replace the BUG prefix with the canonical Epic prefix, while outer WBS reconciliation compares the entire live title literally. Neither a historical carrier nor a current-source carrier alone resolves that mismatch.

Live GitHub search on 2026-11-06 covered `WBS title`, `decomposition epic title`, `"2071"`, and `"kind" "title"`, followed by these narrower queries in kburson/ai-task-manager:

- `is:issue WBS in:title`
- `is:issue "title" "epic" in:title`
- `is:issue "wbs-provenance-mismatch"`
- `is:issue is:open "conversion" "title"`

No open issue for this exact compatibility contract was found. Broad searches were capped at 100 results; this is a targeted duplicate check, not a claim to have read the entire backlog. Fresh issue fetches confirmed:

| Existing issue                                                                                                                   | State             | Relationship to this proposal                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| [#1130](https://github.com/kburson/ai-task-manager/issues/1130)                                                                  | Closed, completed | Established canonical Epic metadata/title convergence; it did not relax WBS title matching.                          |
| [#1279](https://github.com/kburson/ai-task-manager/issues/1279), [#1287](https://github.com/kburson/ai-task-manager/issues/1287) | Closed, completed | Established materialized WBS coverage and readiness.                                                                 |
| [#1991](https://github.com/kburson/ai-task-manager/issues/1991)                                                                  | Closed, completed | Preserved governed kind/split recovery and readiness, without this conversion/title case.                            |
| [#2161](https://github.com/kburson/ai-task-manager/issues/2161)                                                                  | Closed, completed | Fixed truthful intermediate first-child convergence, not a converted child's outer WBS claim.                        |
| [#1091](https://github.com/kburson/ai-task-manager/issues/1091)                                                                  | Closed, completed | A provenance diagnostic appears in estimation history; its delivered estimation scope is not this compatibility fix. |
| [#2146](https://github.com/kburson/ai-task-manager/issues/2146)                                                                  | Open              | Recovery feasibility for preserved #2145; do not repurpose it for this production change.                            |

Recommendation: if Root accepts this bounded contract and its delivery route, it may separately authorize one actual defect through native creation, after refreshing duplicate/ownership checks. Do not reopen completed issues or silently expand another story.

## Qualified source seams

All five proposed production files and the existing strict-kind/prefix helpers are byte-identical between delivered baseline Z=`2e5a3feec6d6296778f767977cf8086f587d1967` and K=`849239a672fdae97c9475e47bcc5eb8fc050f6fd`. The planning branch adds documentation only. These are current-source observations, not claims about the historical O/H implementation.

| File                                                            | Current behavior and proposed responsibility                                                                                                                                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/task-tracker/lib/decomposition-wbs-coverage.mjs`       | Lines 6–13 discard kind/native context; lines 144–150 require literal title equality. Add the narrow compatibility predicate without changing path, section, duplicate, or complete-plan-byte checks.                  |
| `scripts/task-tracker/lib/decomposition-delivery-readiness.mjs` | Lines 142–159 receive issueNumber but do not forward parent context to coverage. Add repository and forward the expected parent number.                                                                                |
| `scripts/gh/lib/wave-admission.mjs`                             | Existing detail and identity-fence queries retain child IDs internally, then mapping drops them and the native parent. Add repository/root identity selections to those same requests and retain validated context.    |
| `scripts/task-tracker/lib/decomposition-hook-authority.mjs`     | Existing root, child, and final inventory observations provide the native relationship. Preserve it through mapSubIssueNodes; add child repository selection to the existing detail query.                             |
| `scripts/task-tracker/lib/decomposition-authority.mjs`          | Lines 492–500 invoke readiness. Pass the expected repository and conditionally bind only admitted conversion facts into the readiness digest at 502–524. Preserve the project observation digest at 690–707 unchanged. |

Reuse `classifyDecompositionKind(body)` from `decomposition-kind.mjs`: exactly one valid unfenced marker in Progress Markers, no ambiguity or malformed marker. Do not use permissive `parseIssueKind` to grant the exception. Reuse `KIND_PREFIXES.bug` and `EPIC_PREFIX` from `scripts/gh/lib/kind-prefix.mjs`, without calling `stripKnownPrefix`.

Native causality is established by `verbs/kind.mjs:82–91` and `scripts/gh/lib/epic-retitle.mjs:40–44`, both invoking canonical reconciliation with forceEpic=true. Existing conversion behavior remains unchanged.

## Exact compatibility contract

Literal equality remains the existing first case, with its existing title normalization. All current exact-title callers remain valid without new evidence. Only a mismatched title may try the following second case; every condition must hold:

1. The accepted task title begins with exactly `KIND_PREFIXES.bug` and has a nonempty business suffix.
2. The raw provider title equals exactly `EPIC_PREFIX + acceptedSuffix`. No trimming, case folding, Unicode normalization, removal of another prefix, or business-title edit is allowed in this case.
3. `classifyDecompositionKind(child.body)` yields kind=epic and no reasons. A fenced marker, duplicate marker, marker outside Progress Markers, title alone, label alone, or body-authored conversion claim grants nothing.
4. Current native observation identifies the same child node ID and positive safe issue number in the expected parent's complete immediate-child inventory. Its repository equals the independently supplied expected repository. The parent node ID, number, and repository come from the queried provider parent, not Plan Metadata.
5. Expected parent number equals the actual readiness subject. The collector validates root identity across existing pages/fences; missing, mixed, duplicated, or drifted identity cannot grant the exception.
6. All existing source path, exact selected heading, pinned commit, complete plan bytes, one-task/one-child, section, planning, branch, and disposition checks still run normally.

No new synthetic “converted=true” proof exists. These are current provider observations establishing a recognized current representation, not a cryptographic history of who converted the issue. The fixed native producers establish why the representation is legitimate. A mutable body flag cannot replace native relationship evidence.

### Proposed interfaces

Keep these names and shapes consistent in the implementation and its tests:

- `reconcileWbsCoverage({ tasks, acceptedPlanPath, acceptedPlanText, children, readPlanAtCommit, repository = null, parentIssueNumber = null })`.
- `evaluateMaterializedWbsReadiness({ issueNumber, repository = null, ...existing })` forwards repository and parentIssueNumber=issueNumber. The sole production caller supplies subject.repository.
- Child descriptors gain `nativeWbsIdentity: null | { repository, nodeId, number, parent: { repository, nodeId, number } }`. Repository comparisons use the existing lowercase repository identity convention; node IDs remain exact opaque strings and numbers remain positive safe integers.
- `parseWbsChildClaim(child)` retains its existing fields and adds `rawTitle`, `kindClassification: { kind, reasons }`, and `nativeWbsIdentity`. The new fields derive from the provider descriptor/body, never visible Plan Metadata.
- Derive a local `titleCompatibilityFacts` list in decomposition-authority only from `r.boundaries.coverage.matched` entries where the existing normalized title comparison was unequal and the new predicate admitted the match. Each fact carries the accepted task number/title/heading, claim source path/commit/section, rawTitle, strict kind/reasons and nativeWbsIdentity. The match already passed uniqueness, exact path/section and complete pinned-plan-byte checks; no second proof flag or provider read is needed. Sort a copy canonically; retain existing children/dependency ordering and never mutate provider arrays.

Keep the serialized `epicReadiness.children` shape unchanged: `decomposition-assessment.mjs:319–333` rejects additional child keys. The local readiness hash payload remains exactly `{ children: normalized, planning: r.deliveryReady, terminal: children.map(isAcceptedTerminalChild) }` when no admitted conversion facts exist. Only when the list is nonempty add `titleCompatibilityFacts` to that local payload. Do not add an empty array, null, undefined key, new observation resource, policy version, or serialized field for ordinary cases.

**Correction to the earlier proposal:** Leave the project-observation hash exactly `{ projectId, projectItemId, estimate, size }` for every case. Duplicating child facts there is unnecessary: `decompositionInputDigest` hashes the entire validated input, including `epicReadiness.digest`; `assessDecomposition` also publishes that digest as the existing epic-readiness observation. Moreover, `estimate-writer-publication.mjs::intendedPublishedRevisionInput` predicts precisely the existing project-field hash and copies readiness from the input. Changing the collector's project hash alone would break writer prediction. No sixth production file or estimate-writer change is required by this design.

### Assessment continuity and supported refresh

The codec uses closed shapes and validates record subjects; it does not require a completed historical publication's intended input digest to equal every later assessment. The collector independently compares the stored assessment's inputDigest/status and rendered section against current authority (`decomposition-authority.mjs:727–790`). Thus ordinary leaves and exact-title epics retain the same normalized input/readiness/project digests, not merely the same schema. Their previously current assessment and completed publication remain usable without a mass migration. Preserve ordinary literal equality, including its existing trimming behavior; the new strict native facts are required only for the exception.

For a converted match, new facts change readiness and therefore the overall input digest. Editing any fact on which that admitted match depended must change or remove that fact, or make current authority unavailable; a previously admitted projection cannot remain current. A valid identity change produces a different fact; an invalid title/kind/identity or wrong provenance loses the match and its fact. Even when another legitimate blocker keeps planning=false both before and after, the admitted fact change must invalidate the prior projection. Invalid-to-invalid differences that never granted a conversion match need not create a new authority dependency.

The supported refresh is the registered `refresh-decomposition` remediation, mapped to `resume` in `action-decision/remediations.mjs:6–18`. Public `node bin/aitm.mjs resume <fixture-issue>` reaches `inspectBoundDecomposition`, which invokes the privately owned `runtime.refresh`; the already-active path is at `verbs/resume.mjs:301–330`. This is a real bind/occupancy/reconciliation operation, not a read-only helper. Use it only in disposable native fixtures for this correction; no live resume is proposed here.

`decomposition-projection.mjs:69–190` acquires the native issue lock, collects current authority, refuses malformed/unavailable authority, owns only the assessment mutation, checks semantic drift against the fresh base, performs exact record readback, and recollects before returning confirmed. It preserves the publication record; pending remains pending and failed readback remains unconfirmed/restricted. `decompose-check` and Explain only inspect and do not refresh. An old completed writer's identical retry still enforces its sealed intended digest in `decomposition-publication.mjs:103–111`; do not promise that a genuine conversion change can be erased by replaying that writer. Refresh updates the current assessment while retaining historical publication authority.

Required regression evidence, all prospective:

- Capture legacy leaf and exact-title epic fixture records through the unmodified K collector/owned refresh before implementation; retain their actual bytes and input digests. With F loaded, assert equality of normalized input, readiness/project/input digests and current projection without rewriting those fixtures. Then exercise public resume and continuation to show ordinary supported refresh remains confirmed and capabilities unchanged.
- For an actual native-converted child with a pre-F parent assessment, show public inspection is stale/restricted, public resume confirms the new assessment, and subsequent public inspection/hook admission uses the new current digest. Preserve the old completed publication bytes and its intended digest. Use a fully admissible fixture for the positive, and a separate live-shaped fixture retaining the 29-closed/two-open other siblings and every independent blocker.
- Change raw title, strict kind, child node/number/repository, parent identity or source provenance after an admitted converted assessment, one at a time. Public inspection must invalidate that projection; owned refresh must grant only capabilities justified by the new facts. Include a still-blocked parent so a constant planning=false cannot mask fact drift.
- Exercise the real codec/normalizer, failed exact readback, malformed records, pending publication, and drift during refresh. No manual digest retag, synthetic approval, schema migration, new refresh command or framework. Count the existing collector dispatches; the title correction adds no provider calls. Public resume retains its existing refresh traffic, not a promise of zero requests.

Keep the existing return type of `fetchAllSubIssueNodes` (an array). After its existing complete inventory/fence validation, return cloned nodes carrying a native parent context, e.g. `nativeWbsParent`; do not modify body bytes. `mapSubIssueNodes` combines that context with the raw node's id/number/repository into nativeWbsIdentity, or null when context is absent. The hook collector supplies the same parent context from its already validated root after the existing fences. Legacy pure mapping callers without context retain normal exact-title behavior and cannot gain conversion compatibility.

For wave admission, add parent id/number/repository and child repository to existing detail/fence selections; validate root continuity and compare child identity tuples without another request. For hook collection, add child repository to the existing detail selection and retain root context already validated by assertRoot. A foreign child repository must stay foreign, not be overwritten with cfg.repo; it cannot use the conversion case. The fixed exception does not impose a new title policy on existing exact-title cross-repository cases.

Neither collector provides an atomic snapshot of all child bodies and titles. Preserve the existing final inventory/root continuity fence and its limits. A later fresh collection must invalidate stale title/kind/identity facts; do not claim every concurrent child edit is observable in the existing last request. No descendant query or additional dispatch is proposed.

## Review focus and proof obligations

| Input/failure class            | Required behavior and owning coverage                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Title or kind spoofing         | Pure WBS tests reject changed suffix, extra/legacy prefix, whitespace variant, lowercase prefix, title/label alone, fenced/duplicate/malformed/out-of-section kind.                                                                  |
| Foreign or incomplete identity | Coverage and both collector tests reject compatibility with missing/mixed child ID, number, repository, or wrong native parent; body-authored parent/conversion claims cannot fill gaps.                                             |
| Historical provenance          | Full fixture keeps J's original path, headings, complete bytes, and all 31 other sibling claims untouched (29 closed, two open); wrong path/section/commit content, duplicate claim, or missing task still refuses.                  |
| Stale observations             | Admitted conversion facts change readiness/input digest and invalidate old projections; project hash stays unchanged. Ordinary leaf/exact-title hashes and completed publications remain usable; public resume proves owned refresh. |
| Real conversion and traffic    | Registered kind and split→creator→tether paths produce actual Epic titles, followed by public assessment through both collectors; preserve current pagination/drift refusals and exact fixture dispatch counts.                      |

### Task 1: Preserve converted BUG children in native WBS readiness

**Deliverable:** One complete compatibility fix through both production observation paths, independently reviewed, tested, delivered, and closed under its eventual real defect ID.

**Files:** Modify the five production files above and add exactly `/docs/superpowers/plans/2026-10-20-2039-active-child-execution-plan.md` to `.prettierignore`, with an immutable-source-byte comment. This single exact root-relative entry is prospective F code/config scope, included in the estimate and review. Do not restore or archive the outer artifact in F. The rule protects that exact admitted-source path when separately authorized restoration occurs; it must not ignore an archive, another plan, a directory or a wildcard. Extend:

- `scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs`
- `scripts/tests/unit/task-tracker/lib/decomposition-delivery-readiness.test.mjs`
- `scripts/tests/unit/task-tracker/lib/decomposition-authority.test.mjs`
- `scripts/tests/unit/task-tracker/lib/decomposition-projection.test.mjs`
- `scripts/tests/unit/task-tracker/gh/lib/wave-admission.test.mjs`
- `scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.cases.mjs` and its existing test entry.

Add `scripts/tests/integration/task-tracker/wbs-converted-epic-compatibility.test.mjs`. Reuse the actual fixture entry points `firstChildFixture` and `installFirstChildCli` in `scripts/tests/fixtures/first-child-epic-provider.mjs`; extend that fixture and `first-child-epic-cli-provider.mjs` only where necessary to serve the exact new selections and outer-parent scenario. Do not replace native source collection or readiness with a success stub.

**Interfaces:** The complete proposed interfaces are above; there are no downstream implementation units or a second defect assumed by this task.

**Working estimate:** 5–6 active engineering hours, including approximately 0.5h regression/source setup, 1.25h collector/predicate/digest work, 1.5h native conversion/refresh and exact-format-preservation fixture work, 0.75h targeted qualification, and 1–2h review/delivery repair. This is a provisional proposal, not a published estimate or a promise of <=4h. If detailed review cannot keep this one causal correction within 6h, stop for rescoping before creation; do not disguise it as a 4h story or launch a repair chain.

- [ ] Add the failing pure test: a literal BUG task plus the real converted Epic title, strict Epic body, and exact native identity should cover the same task; today it fails at wbs-provenance-mismatch. Add the refusal matrix above and prove old exact-title behavior remains.
- [ ] Extend the existing provider fixtures and write failing public integration cases for registered kind and split/creator/tether convergence followed by outer-parent assessment. Use a separate disposable physical Git/provider fixture, the actual inherited native actor, and the committed J outer artifact. Preserve and compare all original 31 other sibling claim/body records, retaining their actual 29-closed/two-open states. Do not mutate live #2039/#2071.
- [ ] Add the legacy continuity, converted-assessment public refresh, pending/unconfirmed and fact-drift regression cases above. Run the named targeted tests before implementation; require the converted-title positive to fail for the actual existing mismatch while ordinary baselines remain valid.
- [ ] Implement the five-file predicate/context/digest change and the one exact ignore entry. Use only existing request boundaries, strict kind grammar, exact constants and typed existing WBS refusals. Preserve the old hash payload when the exception is unused and the project hash in every case.
- [ ] Add a disposable formatter fixture in the new integration test using the actual repository Prettier CLI and copied ignore configuration: place exact J bytes at its original path, run normal format/check, and require unchanged SHA/blob bytes. Place a deliberately unformatted sibling plan and K archive at their distinct paths; normal check must fail and normal write must format them. Assert the new ignore line occurs once and no wildcard/directory exemption is introduced. Do not edit live outer-plan bytes.
- [ ] Run the declared targeted unit suites and `node --test scripts/tests/integration/task-tracker/wbs-converted-epic-compatibility.test.mjs scripts/tests/integration/task-tracker/first-child-epic-convergence.test.mjs scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.test.mjs`. Require successful positives, zero effects in read-only assessment, exact provider call counts, stale-fact invalidation, and all specified refusals. Tests are not yet run.
- [ ] Commit under the actual assigned defect ID, record its exact commit trail, and use the ordinary native Develop/Test/Review/provider-delivery/Close sequence. The owned Test stage runs required complete suites/CI at the final source SHA; Review reuses valid receipts. No early merge-back or source-only “done” declaration.

## Independent delivery route for F

F is one standalone prerequisite with a trunk parent, based on the then-current delivered source. It must not inherit unfinished P/D/O/H code. Z and K currently agree on its five production seams; creation must recheck actual trunk, file ownership and the native dependency inventory.

After plan acceptance and separate creation/implementation authorization, create the real defect through the registered native creator, with its own bounded scope, 5–6h estimate, Story Intent, refinement and Plan approval. Use a suitable authorized trunk-based worktree and genuine issue/session. Implement F, qualify its normal verifiers, complete native Test/Review, deliver by the registered provider path, verify the merged receipt, and Close normally. F's acceptance boundary is the independent conversion/ordinary-continuity/formatter contract above. It does not depend on completing #2071, delivering P1, restoring J, constructing a carrier or closing #2145.

F delivery may advance trunk from Z to Z'. Record the exact delivered source and preserve original P/D/O/H/C/B refs. It does not activate that source in old D, clear the #2145 edge, amend accepted #2071 source pins, or authorize bulk historical integration. The downstream route requires separate source/ownership/admission qualification and Root authorization. No new prerequisite is presumed necessary merely because an earlier route analysis called it missing.

## Separate #2071 route context — unresolved, not F implementation scope

This context is retained to prevent the standalone correction from being sold as complete #2071 delivery. Review F independently; this appendix supplies constraints, not a new P1 design or a proven carrier recipe.

### Preservation and estimate facts

A bounded native inventory observed 32 immediate #2039 children, hasNextPage=false: 29 closed and three open (#2050, #2051, #2071). Preserve **31 other sibling claims**, including open #2050/#2051 and their states/refs. The accepted b097 design/review bytes remain sealed historical evidence despite inherited “31 closed” shorthand. Recording a new #2039 parent location can affect both open siblings' future lineage, so their disposition needs explicit review.

The source-only #2145 observation found the independent Epic “Native preservation-safe bridge trials”, Backlog, body version 3, empty Plan Metadata, zero immediate children and preserved f7be/default-session history. Existing scope discusses pinned-trunk trials, retained-source readiness and recorded custom sync. That scope is not proof that a new implementation leaf is needed.

Root separately authorized one native estimate publication for #2071 after accepting the design. It completed as operation `6d49a9a3-2b26-41a1-a44d-2cdf842883bb`: 52h/XL, all writer effects confirmed, input/assessment digest `287ba02ecb256ea90811ea010d26aebada7e12f0174d9b9260efe8bc5a03f80a`. Fresh public decompose-check reports current/must-decompose, planning=false/completion=false and only inspect/checkpoint/decomposition-prepare/governed-decomposition. The range is 39–52 active engineering hours for the accepted thirteen provisional units, excluding F, any independently justified #2145 support, #2050/#2051 and review wait. No estimate retry is proposed. Actual child refinements must later reconcile the aggregate; this publication is not implementation, kind or split approval.

### Correction to the earlier P1 inference

The earlier addendum overstated a missing bootstrap capability. Normal successful Stop (`verbs/stop.mjs:56–75`) clears active/timer fields and releases occupancy; `state.mjs:318–353` removes the active-task record while retaining the genuine actor's timing history. Consequently `native-worktree-bootstrap.mjs:219–221` can pass its no-binding condition after genuine successful Stop, absent another surviving binding. Terminal-review early return and failed departure are separate cases. Historical records and old refs can be preserved without keeping the old delivery simultaneously active.

Root's independent Astra source challenge is still qualifying the complete supported parent/child branch-admission route. No conclusion that P1 needs new code, a new leaf, or its own delivery topology is established. Genuine Stop/Start and truthful appended current locations may be part of a separately authorized supported route. None is authorized or performed by this proposal. Do not design/implement P1 while that source check is pending.

Current limits still require actual qualification: app create_worktree is detached and does not itself grant AITM authority; draft-branch selects the durable branch; same-HEAD renewal does not authorize prior branch creation or a changed-source/root move; cut-child uses actual parent authority; sync-epic's current graph fallback and rebase/force-push behavior cannot be assumed correct for frozen custom refs; merge-back is finished-child delivery, not synchronization-only. These observations are questions for the supported route investigation, not proof that no compliant sequence exists.

### Single-source-commit constraint

The selector takes an Epic's Decomposition-plan path but resolves its commit from Source-plan-commit, falling back to Plan-commit. A later admitted source commit SC must contain both:

- Exact J bytes at `docs/superpowers/plans/2026-10-20-2039-active-child-execution-plan.md`, blob `b67d48b254e0d26d558ae22a8ca525ff38468c3d`, preserving the original outer Task30 heading/relation and every sibling claim.
- A separately reviewed flat inner plan, e.g. `docs/superpowers/plans/2026-11-06-2071-public-activation-decomposition.md`, with real bounded Story Intent, ownership, dependencies and executable verifiers. This support proposal is not that split input.

Those files need to coexist at SC, not be added in the same commit. Preserve current K outer bytes, blob `2a5ce3d1c53f37aff9b1cc0e377d2659bbb4ae42`, at a separately admitted flat #2039 archive such as `docs/superpowers/plans/2026-11-06-2039-active-child-execution-plan-K-archive.md`. J→K has formatting and prose-leading “Issue” changes; semantic similarity does not satisfy the full-byte WBS comparison. Do not add a second commit-pin field.

Outer restoration/archive are #2039-owned preparation candidates; the inner plan is #2071-owned preparation. Both still need genuine current owner/target admission. F alone owns the prospective exact ignore entry and does not restore either artifact. A #2071 checkpoint cannot authorize #2039 file writes, config edits, new branches or changed-source admission.

Once the runtime, carrier, source-approval and exact metadata diff are independently qualified and authorized, the existing public issue-body verb supports `aitm.issue-body-operation/v1` replace-section for `## Plan Metadata`, expectedVersion and exact expected section. It preserves protected markers, requires the genuine mutation session, checks body readback and refreshes decomposition after confirmed preparation. A failed/unconfirmed refresh stays unconfirmed. This is the prospective registered writer for selecting SC and the inner path while keeping outer path/heading/parent relation. It does not confer Plan approval.

Root must separately qualify actual source activation in CLI/hooks, the outer/inner selection at SC, native conversion and reviewed split, current dependency disposition, source inventory and eventual integration ancestry. Existing #2145 remains an edge. Completing a smaller prerequisite does not close that Epic or erase remaining scope. The accepted design's historical O/H source qualification remains outstanding. No claim of autonomous #2071 closure follows from F acceptance.

## Stop boundary and verification of this proposal

The proposed production scope is exactly five existing modules, one exact .prettierignore entry and their focused tests/fixtures, with a provisional 5–6h estimate and an independent trunk delivery route. It includes no carrier construction, branch-admission implementation, metadata-schema extension, estimate writer change, source-artifact restoration, live graph mutation or automatic follow-on defect.

Source and live-state reads, the separately authorized estimate publication/readback, and documentation formatting/whitespace checks are the only executed work described here. All proposed product regressions remain unexecuted. The fresh primary review is design evidence only and must preserve the accepted b097 design and its prior XPR records. If review cannot bound F credibly within 6h, stop for explicit rescoping before issue creation rather than manufacturing a 4h estimate or assuming a repair chain.
