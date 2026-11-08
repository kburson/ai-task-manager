# #2071 Minimum Recovery Assessment

This is decomposition preparation and independent source review, not an accepted implementation plan or authority to implement. No product source was imported, changed, or tested during this assessment.

## Decision and constraints

The November 8 user instruction authorizes completion of the existing issues, prohibits new stories, limits stories to Medium, and requires replanning and independent review before an estimate overrun. The current estimation rubric gives Medium an 8-hour envelope. Historical effort remains Unknown; a remaining-work estimate does not erase that history.

The previous 39–52-hour design introduced a general operation-evidence framework and thirteen proposed child units. The general framework is unnecessary, and creating those children is prohibited. The independent review below instead identifies existing machinery and concrete compatibility changes.

The reviewer estimates **14–24 hours remaining for complete Task 30**, including one focused validation, independent review, and delivery cycle. This is a planning estimate, not measured execution time or an accepted replacement estimate. It does not support relabeling the unchanged issue M/8h. The published XL/52h assessment remains an unresolved state to correct through the governed workflow; it is not implementation permission.

A source-qualified subset can fit Medium, but it would leave public activation incomplete and cannot close #2071 under its present acceptance criterion. No behavior has been silently moved to #2050 or #2051. A second bounded review rejected redistribution among the three existing issues as an executable Medium-only plan on the current evidence; its findings follow below.

## Live authority checked on November 8

- #2071 is open in Develop with decomposition status `must-decompose`. Available actions are inspect, checkpoint, decomposition preparation, and governed decomposition. Current publication operation: `6d49a9a3-2b26-41a1-a44d-2cdf842883bb`.
- Root is bound as orchestrator in `/Users/kpburson/.codex/worktrees/aaff/ai-task-manager`, branch `codex/2071-public-activation-20261106`.
- Native predecessors #2049, #2070, and #2145 are closed. #2169 is not a native dependency of #2071. Its earlier role was supporting the proposed decomposition route; that does not establish a dependency for every possible unchanged-BUG route.
- #2050 and #2051 remain open in Ready for Planning and each has an open native dependency on #2071. #2051's other dependency, #2055, is closed.
- #2050 still owns the fixed S/G/D/V whole-transition budgets, including guards, coordinator, saga, unclassified calls, and Unknown costs. #2051 still owns legacy/adoption/administrative migration behavior. Neither has been declared complete.

## Source pins

| Pin | Commit | Meaning |
| --- | --- | --- |
| HEAD | `9c91cb69ae285360d6578c0bdf53a42826cbe0da` | Planning checkout inspected |
| K | `849239a672fdae97c9475e47bcc5eb8fc050f6fd` | Current parent/source baseline |
| O | `58ed1ec27c9cc88ec9dfde4d23d4ef2428a2c3d4` | Historical committed candidate |
| H | `9514fcd7d5f24fc63335fb08f6efde05d19e4275` | Historical prerequisite carrier |
| J | `0ad57329a5eb4e3aec395adb06a6216178e45c87` | Accepted outer Task 30 plan |
| T | `f2894455a97bb80f6afb82ce5ff722cad2a46c2b` | Original technical plan, Task 10 |
| S | `dafb1d276036ddc17490f76329f6aa2c09732a15` | Governing cache/publication specification |

Only immutable Git objects were read for O and H. The protected historical working directory, its dirty files, ignored evidence, owner binding, and original refs were not used as an editable source.

## Independent source review

Reviewer: `/root/review_2071_remaining_scope`, a separate read-only reviewer dispatched under the code-review skill. Review completed November 8, 2026. The following records the review findings and estimate; it does not claim a formal cross-provider attestation, runtime acceptance, or merge readiness.

### Minimum source manifest

Paths below use `C/` for `scripts/task-tracker/lib/story-cache/`, `L/` for `scripts/task-tracker/lib/`, and `E/` for `scripts/task-tracker/lib/estimation/`. Each listed name ends in `.mjs`.

- **Reuse H, seven byte-identical files:** `C/body-template`, `C/journal`, `C/retention`, `C/snapshot-compare`, `E/local-evidence-store`, `E/local-evidence`, `E/local-runtime`. None exists at K or the inspected HEAD. Identical source is not proof of runtime acceptance.
- **Adapt seven H-to-O changes:** `C/batch`, `C/completion-receipt`, `C/stage-body`, `C/stage-capabilities`, `C/stage-comment`, `C/transition-batch`, `C/writer-handoff-bindings`.
- **Adapt fourteen O-only cache modules:** `C/activation`, `C/comment-source`, `C/native-authority`, `C/native-graph-observation`, `C/native-graph-sources`, `C/native-observers`, `C/native-ports`, `C/native-target-admission`, `C/native-target-comments`, `C/native-transition`, `C/timing-authority`, `C/transition-journal`, `C/view-payloads`, `C/views`.
- **Adapt nine O-only native/Plan modules:** `L/native-story-guard-execution`, `L/native-story-observations`, `L/plan-approval-markers`, `L/plan-approval-staging`, `L/plan-child-inventory`, `L/plan-decomposition-projection`, `L/plan-native-guard-execution`, `L/plan-transition-native`, `E/native-plan-selection`.

This accounts for all 37 candidates: seven unchanged, seven modified, and 23 O-only. The initial closure stopped at existing modules. Connecting their graph hooks adds three further O-only dependencies: `C/native-parent-graph`, `C/native-target-decomposition`, and `C/native-lifecycle-graph`.

### Reuse native store issuance and the coordinator

The current store needs the specific additions `isNativeStoryStore`, immutable commit-input snapshotting, and the `nativeApprovalIssuance` check. O binds issuance to the exact native store, claim, previous generation, and next digest. Unchanged retained approval remains admissible; clearing it requires completed-journal validation. Evidence: O `L/plan-approval-staging:224–249` and the K-to-O `C/store` diff.

Retain the native coordinator's persist-before-dispatch, confirmed dependencies, single observation after uncertainty, final snapshot comparison, and refusal to replay attempted effects. Those are implemented in O `C/transition-journal:622–789`.

Do not import the separate `C/publisher` facade merely because it appears in the old 77-file inventory. It is outside this selected dependency closure and duplicates responsibilities already owned by the native coordinator.

### Preserve current Plan approval

K includes `currentApprovalDigest` in parsed approval, while O's retained envelope permits exactly eight fields without it. Evidence: K `L/markers:237–244`; O `C/view-payloads:118–151`.

This requires more than a schema-field addition. K's current-scope producer operates in Develop, Test, and Review; reobserves actual source asynchronously; and retains `currentEvidence` in its audit. O's retained Plan batch only admits Plan-to-Develop. Evidence: K `L/plan-approve-current-scope:71–74,184–249`; O `C/batch:84–90`.

Preserve the existing producer and validators, and support their exact retained delta and audit through publication. Do not broaden the older Plan-only capability with a flag. Keep current marker codecs, current-scope dispatch, `currentEvidence` audit validation, and strict forecast-reader forwarding. K `L/plan-approval-current-source:81` uses `loadForecastProjection({readReadyForecastRecordId})`; O removes that parameter during projection extraction.

### Adapt the specific proof and comment owners

Neutral staging correctly rejects introduced proof and retained capabilities. Required producer adaptations remain for actual AC/evidence-runner execution receipts, reviewed-scope records, mutable directory/contract projections, decomposition/estimate deltas, ordinary Plan approval, and current-scope approval.

Two concrete historical limitations prevent unchanged reuse:

- O `C/stage-comment:65–72,104–121` binds the full record envelope, so mutable singleton projection updates cannot use the neutral path unchanged.
- O `L/native-story-guard-execution:132–155` resolves lifecycle proof from published records and refuses changes to accepted records. Legitimate newly staged directory proof needs an owner-validated candidate and confirmed-publication route.

Delayed provider IDs must be authorized by those actual owners. O currently permits only the coordinator's timing-comment slot in `C/native-authority:58–69` and `C/transition-journal:263–265`. No serialized permission flag, claimed provider ID, or generic grants framework establishes that authority.

### Preserve current graph and session checks

O's graph observers supply bounded target/parent identity, field membership, complete inventory, provenance, and boundary-freshness checks. Selectively add the native root selection, graph read, boundary collection, and parent/leaf dispatch paths.

Keep K's `captureConvergenceFrame`, provider/session binding, before/after operator equality, live board/recorded-state correspondence, and sole-owner checks. O deletes those unrelated current safeguards.

Required decomposition exports are `readDecompositionSelectedPlan`, `deriveDecompositionForecastObservation`, and `deriveDecompositionAuthority`, preserving explicit frozen-candidate versus published observations. For estimation, add `recordsForProjection` and pure published-projection extraction while preserving strict-reader forwarding. Wholesale runtime-adapter replacement is unnecessary.

### Complete the public contract together

The seven public owners in Task 30 must use the admitted cache and distinguish staged/unpublished results from publication. Runtime and hooks must provide native transition context and canonical timing ingestion. Readers must select working or published authority explicitly. O's optional `ctx.storyCache` branch does not activate production by itself.

Supporting changes include bounded raw transport via `gqlRaw`; snapshot budgets and creation/field/provenance decoders; `validateOwnedCommentBody`; `storyCommentPurpose`; retained timing parsing; and `resolveTransitionEvents` for genuine demotion pairs. These prerequisites do not complete #2050's whole-transition budget proof.

Keep current governed mutation-session admission, `observeRemoteBody`, and delivered owned-comment URL handling.

### Estimate and completion boundary

| Required work | Remaining estimate |
| --- | --- |
| Selective source integration and current-boundary compatibility | 3–5h |
| Public routine writers, results, reader families, runtime/hook/timing wiring | 3–5h |
| Specific privileged producer retention, validation, and delayed IDs | 4–8h |
| Focused regressions, one independent review cycle, delivery | 4–6h |
| Total | 14–24h |

This assumes reuse behaves as its source indicates and excludes unrelated defects or additional review cycles. The uncertainty is primarily producer/public-caller integration, not a need to invent a cache engine.

The smallest independently useful subset plausibly within Medium is additive bounded transport and observation primitives: `gqlRaw`, shared snapshot budgeting, creation/field decoders, comment provenance, and focused validation. It leaves public writers and callers unchanged and therefore fails Task 30's coordinated activation and no-immediate-write requirements. It cannot be presented as completion of #2071.

The reviewer performed no writes, tests, imports, or protected-working-tree reads, and made no runtime correctness, test-pass, final-plan acceptance, or merge-readiness claim.

## Review of redistribution among existing issues

The same independent reviewer assessed explicit redistribution among #2071, #2050, and #2051 without creating any issue. The result was rejection on the current evidence, not an approved alternative plan.

Task 30 requires 14–24h remaining. The original remaining scopes of #2050 and #2051 each require 3.5h, giving **21–31h total before redistribution overhead**, against three Medium envelopes totaling 24h. The two smaller stories provide at most 9h spare capacity, while Task 30 would need to transfer 6–16h. The identified producer and caller changes do not justify narrowing Task 30 to 14–17h just to make that arithmetic fit.

Moving native coordinator/graph integration into #2050 creates a dependency problem: activation needs that implementation, while final whole-transition budget acceptance needs activated public paths. Moving privileged producers into #2051 similarly makes activation depend on those producers while final migration acceptance needs default staging to be active. Either requires an explicit staged integration protocol and revised final acceptance; partial fixtures cannot stand in for those outcomes.

Moving all public activation into #2051 would leave its original 3.5h plus 3–5h of public writer/caller work, already 6.5–8.5h before privileged adapters and integration review. Renaming responsibilities does not remove work.

Any redistribution would require reviewed changes to each open story's AC, estimate, ownership of every original obligation, integration order, and open-task plan binding. The pinned outer-plan/whole-plan relationship is an additional unresolved prerequisite: no supported governed revision was established that changes the open-task bindings while preserving closed siblings' original authority. Historical records must not be rewritten to make the new plan appear previously approved.

This follow-up involved no additional source inspection or mutation. It supplies no accepted partition, implementation permission, or waiver of the user's maximum story size.

## Continuation boundary

Preserve the accepted outer plan and closed sibling bindings. Do not publish M/8h, remove dependencies, change acceptance criteria, create an issue, import source, or close a subset as Task 30 without a concrete reviewed plan that satisfies the user's constraints and native authority.

Any accepted continuation must name its complete behavior, exact source decisions, verification commands, honest remaining estimate, and stop/replan point before implementation. The current assessment is a checkpoint for that decision, not a substitute for it.
