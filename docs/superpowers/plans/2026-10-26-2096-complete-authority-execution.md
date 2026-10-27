# Complete R0 artifact authority implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. The human explicitly requested audit, re-plan and immediate resumed execution; do not pause for another handoff approval.

**Goal:** Deliver native #2096, close original #2090, then independently deliver #2098, with their genuine receipts and Done transitions.

**Architecture:** Keep immutable artifact commit/tree separate from the pinned actual operator tuple. Introduce one pure, in-memory comparison of the existing issue's proof authority, then use existing fresh-base callbacks and existing final provider-boundary callbacks. This is not an authority store or a new identity, lifecycle edge or R1 mechanism.

**Tech Stack:** Existing Node.js R0 runtime, Git objects/native sandboxes, versioned issue-body writer, native stage markers and verification receipts, strict CI provider and sanctioned GitHub delivery.

**Spec:** Current #2096 Scope/ACs, docs/immutable-artifact-acceptance.md, and the human instruction at 2026-10-26T20:45:29Z to complete the audit and resume through all three native completions.

## Global constraints

- Only #2096 -> original #2090 -> #2098. No new repair stories or R1 work.
- Preserve controller SID/root/ref/HEAD/issue/binding, old worktrees/refs/stash/evidence and historical Unknown. No controller checkout reset or identity substitution.
- Retain unsupported explicit-source probes and directory/evidence-v2 refusals.
- Use existing R0 stage, declaration, receipt and provider authority. Never expand frozen legacy-refusal allowances.
- Estimates use current source/scope and prospective uncertainty only. No GitHub history, comparables, learned rubric or inferred elapsed guarantee.
- User's resumed-execution instruction supersedes the earlier execution stop. Native #2096 remains Develop; no fabricated Plan stage or approval.

## Completed authority audit

Two independent read-only audit domains inspected HEAD 5d1106562209958ec733dcc5b60d30fa0c8a6b47: native entry/Test and downstream Review/approval/delivery/Close. Root cause: initial validation was treated as a durable authorization across subsequent awaits; some comparisons were inside mutate, which is not rerun on a versioned-write rebase.

| Native boundary                    | Required captured/fresh authority                                                                        | Audited result / required work                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Selector/runtime                   | Canonical immutable commit/tree; supported verb; actual controller                                       | Existing separation and unsupported-mode refusal stand                                                                   |
| AC/DoD execution                   | Pinned operator, selected source, targeted and complete declarations, permitted current state            | Retain declaration checks; add complete protected-body and final state check                                             |
| AC/DoD reuse                       | Above plus same complete still-current Test receipt and valid fresh reuse decision                       | Missing current-receipt check; add each fresh attempt, including retry                                                   |
| Develop-final upsert               | Actual execution fingerprint, fresh canonical VCs, same protected body/state/operator                    | Missing declaration callback; add before every upsert attempt, not only readback                                         |
| Develop/Test transition entry      | Guard-authorized protected body/receipt, original operator, source, current state                        | Capture before guards; recheck each entry-body attempt                                                                   |
| Transition Status write            | Above, with the transition's verified entry body as expected state                                       | Recheck after project-item resolution and before every Status mutation/retry; preserve saga rollback on refusal          |
| Test proof and inherited lanes     | Same Develop receipt/content, current VCs, same Test visit/start marker/operator/source                  | Fresh proof callback must compare before initial push and each rebase, not only inside mutate or after write             |
| Review preliminary ticks           | Initial accepted Test receipt, body/declarations, source and initial operator                            | Earlier writer lacks guards; protect it as well as completion                                                            |
| Review/Close normalization         | Caller-pinned operator; fresh complete evaluator and evidence                                            | Pass original operator; assert both before and after awaited evaluation; retain per-attempt evaluator                    |
| Review completion                  | Current original body/Test receipt, source/operator                                                      | Retain existing checks and use same protected authority comparison                                                       |
| Approval and already-approved path | Initially valid complete Test receipt/current VCs, concrete Review proof and declarations, same operator | Tuple-only check insufficient; validate complete current evidence initially and each fresh write                         |
| Delivery intent/action             | Current full scope/source/Test/Review/approval/PR/check authority                                        | Existing full boundary validation stands                                                                                 |
| Delivery receipt                   | Same full authority after final trunk reachability awaits and immediately at POST                        | Move/repeat existing full callback at final boundary; pin operator after asynchronous checks                             |
| Close                              | Fresh complete guard projection, delivery receipt and current operator                                   | Existing staged refresh remains; normalization inherits entry actor; no transaction is credited as independent readiness |

Source review is not native execution proof. CI and actual candidate acceptance remain execution tasks.

## Review focus

1. Receipt removal, retirement, replacement or payload change while actor/source and target command remain identical must stop proof publication.
2. VC changes during verification, initial body fetch or nonoverlapping rebase must stop proof publication before a later guard runs.
3. Actor or lifecycle visit drift during awaited normalization, project-item resolution or receipt publication must refuse at that boundary.
4. Internal transition entry stamping legitimately changes state/visit; the verified entry body becomes the Status writer's expected snapshot, without accepting arbitrary changed declarations or receipts.
5. Already-merged original PR2094 uses the same final authority checks and never merges twice; Done order and renewed binding evidence remain genuine.

## Task 1: Shared comparison and all body-proof writers

**Files:** Create scripts/task-tracker/lib/issue-proof-authority.mjs and its unit tests; modify AC/DoD stampers, stamp-receipt-reuse.mjs, verbs/test.mjs, verbs/review.mjs, verbs/approve.mjs, review-derive-rescan.mjs and their existing native-path tests.

**Consumes:** Existing issue body, receipts, stage markers, canonical commands and actual operator capture.
**Produces:** Pure captureIssueProofAuthority(body) and assertIssueProofAuthority(freshBody, expectedSnapshot), plus per-writer current evidence validity.

The pure snapshot includes root User Story, Scope, Story Origin, Acceptance Criteria, Verification Commands and Definition of Done; current active verification receipt payloads and malformed-claim status; recorded state, its active visit and Test-start/DoD markers. It excludes body version, timing/rollup/other progress metadata. Comparisons are conservative: harmless protected-body edits may require a retry rather than permit stale proof.

```js
const expected = captureIssueProofAuthority(body);
await mutateIssueBody({
  mutate: (fresh) => publishProof(fresh),
  validateFreshBase: (fresh) => assertIssueProofAuthority(fresh, expected),
  validateFreshBaseAsync: async (fresh) => {
    await validateCurrentEvidence(fresh);
    assertPinnedActualOperator();
  },
});
```

- [ ] Write RED tests through the real versioned writer for AC/DoD receipt removal/replacement/retirement and initial/retry declaration drift.
- [ ] Implement complete fresh stamp decision/receipt comparison and repeat actual operator check after asynchronous state/fingerprint validation.
- [ ] Write RED tests for Develop-final VC drift, Test inherited-receipt removal/replacement, Test fresh VC rebase and Test visit drift; use real writer callbacks.
- [ ] Protect Develop minting against its pre-finalization snapshot. After genuine Test entry/start readback, capture the Test publication snapshot, compare it to actual commands, and enforce it on every final proof attempt.
- [ ] Write RED native Review preliminary-write and normalization-await actor drift tests. Preserve the initial actor through normalization and check after await.
- [ ] Write RED approval tests for initially invalid current VCs, replacement same-tuple receipt, changed concrete Review proof and protected declarations during collection/fetch/retry. Validate complete Test evidence and protected body before accepting initial/already-approved and fresh write paths.
- [ ] Run all affected legacy and explicit-artifact tests; retain explicit refusal behavior. Commit only #2096 changes with actual RED/GREEN evidence.

## Task 2: Native transition and final delivery boundaries

**Files:** move-state/guard-execution.mjs, move-state/github-mutation.mjs, move-state/move-state-core.mjs, verbs/deliver.mjs; corresponding existing native integration tests.

**Consumes:** Task 1 pure snapshots plus existing source/operator helpers.
**Produces:** Same initial artifact authority checked at entry and each sanctioned Status/provider write.

- [ ] Write RED real entry/rebase and Status resolution/retry tests: change source/operator/receipt/VC after the guard, and verify no stale entry or Status write is accepted.
- [ ] At guard context construction capture original operator and body snapshot. Before entry write validate both. After verified entry readback capture its body snapshot, retaining the original operator. Before each Status write fetch live body, compare and recheck actual source/operator.
- [ ] On pre-Status authority refusal, use the existing rollback path to restore recorded state; do not introduce a new lifecycle edge or silently advance the board.
- [ ] Write RED delivery test revoking approval during final trunk reachability. Invoke existing full authority validation after reachability and at final comment boundary; recheck pinned operator after await.
- [ ] Run full affected native transition/delivery tests. Update static line inventories only when fingerprints/semantic sites are unchanged or properly typed; do not add legacy allowances.

## Task 3: Qualify final source and finish the native sequence

**Consumes:** Tasks 1/2 green source and candidate52337be2fd900b55f75b34cf00930ca4a8b1dfb1/tree72c6a19e8d9f66b16777f18791bfb4c6fe74b5fa.
**Produces:** Actual #2096 Done, original #2090 Done, then #2098 Done.

- [ ] Complete lint/format, affected tests and exact final CI with actual unit/integration/slow coverage and strict receipt verification. Use the repository's existing dispatch inputs for real slow coverage; skipped jobs are not proof. Preserve earlier local slow ceiling failure; never raise the ceiling.
- [ ] Run one whole-source independent review for this completed audit implementation; address Critical/Important findings with RED/GREEN tests in one fix pass. No new issue/R1 detour.
- [ ] Bind original2090 and run selected-source Develop/Test/Review/approval and merged-PR reconciliation. Prove Close readiness without closing before2096. Retain original invalidated evidence and Unknown.
- [ ] Return2096, produce its own genuine current-source acceptance, exact-head governed PR delivery and Close. Do not count draft/helper output as Done.
- [ ] Renew original2090's current-binding evidence as required, then close the original through its own native gate.
- [ ] Only after both are Done, JIT plan/isolate retained omitted-rank repair under2098; independently verify, review, CI-qualify and natively deliver/close it and original2091 as its existing scope requires.
- [ ] Update the epic at resumed WIP, native stage changes and each real completion. Retain shared progress label and native2098 dependencies until genuinely cleared.

## Execution ruling

The human explicitly authorized completing this audit/re-plan and resuming through native completions without another plan/pause handoff. Execute inline under the existing approved #2096 intent. The audit is comprehensive across the supported R0 adapter; new independent scope still receives pushback rather than a repair story. No new time promise is inferred from old estimates or GitHub history.

## Authority audit addendum

The existing Review marker binds canonical User Story, Scope, Story Origin, AC, VC and DoD declarations together with the full current Test receipt. Checkbox/proof-only lifecycle changes are normalized. A renewed or changed Test receipt requires genuine renewed Review. Initial capture alone cannot detect changes made between commands; full Test evidence validation remains mandatory in delivery and Close, followed by pinned actual operator revalidation. This extends existing R0 proof contents without a new authority store or R1 protocol.

The independent complete-branch review reproduced an incomplete same-tuple Test receipt being accepted by delivery and Close. The single bounded fix pass adds complete native Review evidence validation to both readers and binds the complete receipt in the existing Review digest. Regression tests first failed with these fixes removed and then passed with them restored. Native qualification remains a separate required outcome.

## Reopened delivery-authority correction — 2026-10-26

Human authorization: reopen #2096 and complete the already promised #2090 merged-candidate recovery. Stop at 2026-10-27T01:00:00Z (8 p.m. Chicago) unless #2096 is genuinely complete; only then continue original #2090. No sister issue, R1, fabricated original intent or controller relocation. Preserve completed historical Close transaction; final Close uses the documented reopened-transaction recovery.

- [ ] Extend historical reconstruction and selected-artifact delivery tests with a complete single-source squash and interrupted prefixes; observe existing merge-method-unattributable failure. Cover missing/incomplete inventory, wrong source head/tree/parent and indistinguishable rewrite with zero ledger writes.
- [ ] Reuse existing provesSingleSourceSquash in observeMergeMethod using the live PR evidence. Keep two-parent merge behavior and all other refusals. Pass live PR to both observation entry points. Full external verification remains mandatory before reconstruction records.
- [ ] Run focused and full verification, independent review, exact-source CI and native acceptance/delivery. Reopened #2096 Close must correlate historical and current bundles. Do not claim complete from tests or a PR alone.
