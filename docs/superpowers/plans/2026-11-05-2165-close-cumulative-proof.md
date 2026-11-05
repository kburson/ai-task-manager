# Cumulative Close content proof — #2165 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native implementation, task by task. Steps use checkbox syntax. Fresh independent final source review is required.

**Goal:** Admit a fully proven already-applied source prefix in read-only Close readiness and qualify genuine evidence renewal after delivered runtime integration.

**Architecture:** Keep the existing confined tree comparator, adding a private complete-source prefix proof backed by actual immutable commit/tree objects. First qualify the original operator's real integration-and-renewal route through public entrypoints; preserve historical artifact receipts and generate new context-bound evidence. The existing v5 verifier retains topology, inventory, metadata, attribution and receipt equality authority.

**Tech Stack:** Node.js 24 minimum / Node 26 development, ESM, node:test, real disposable Git, strict executable synthetic GitHub transport, existing AITM public CLI and native guards. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-05-2165-close-cumulative-proof-design.md`.

## Global Constraints

- Source/operator separation is literal: accepted artifact890 retains its original commit/tree while actual operator HEAD and generation renew legitimately.
- No identity or root environment overrides, copied native binding, internal mutator carrier, fake ready result, waived guard, diagnostic-only demotion or raw state jump.
- Explain performs no fetch, merge, Git object/ref/index/worktree writes, issue/timer writes or `merge-tree --write-tree`.
- Original #2161 intent, receipt and source bytes remain immutable history. Genuine later native evidence is newly generated, not relabelled old evidence.
- #2165's source base is verified delivered `e3ca90f3bb72136da82bbd6735b779f4d6a5d067`. Existing original #2161 and human-stopped #2157 checkouts are not edited during implementation.
- #2157/#2160 partial split remains untouched until #2161 is genuinely Done; no #2146/#2147 activation or default-Explain enum repair.
- Preserve source inventory bounds and existing errors; no new public permission or general merge algorithm. Measure any package delta; no speculative ceiling increase.

## Review Focus

1. Same actor switches worktrees, then resumes with a different generation: old receipt must refuse and renewed receipt must name real new context (Task 1).
2. Operator integrates delivered runtime but keeps the old accepted artifact: public verification must use the selected artifact and actual operator independently (Task 1).
3. Accepted/merged head trees match but an unrelated integration-base change would be erased: still refuse without a complete prefix proof (Task 2).
4. Prefix observation has falsified tree/parents, incomplete inventory or wrong ancestry: correlate real objects and refuse contradictory evidence (Task 2).
5. Read-only readiness silently writes objects or uses a mutable ref, and a later retry claims a different receipt: immutable command ledger/state snapshots and byte-exact v5 comparison must refuse (Tasks 1–2).

## Scope and Plan Metadata

- Priority: P0
- Size: M
- Estimate: 6 hours; two 3h increments. Provisional Refine 4h is retained as history. Native Plan estimate publication is separate and must follow reviewed source.
- Labels: bug
- Execution: native in existing managed #2165 checkout; no implementation subagents. Builder check resolved the genuine occupancy-generation issue with the concrete integration route below. Ordered Claude XPR if establishable, otherwise human-selected Astra6/xhigh manual SAR.

## Story Intent

- **Beneficiary:** task operator closing a verified cumulative delivery
- **Capability:** prove already-applied source history through read-only Close readiness
- **Need:** the conservative whole-blob check rejects an intermediate version even after genuine delivery
- **Value or failure prevented:** accepted work can finish while unrelated lost changes remain blocked

## File Map

- Modify `scripts/task-tracker/lib/action-decision/close.mjs`: private read-only prefix proof and production closure wiring only.
- Modify `scripts/tests/helpers/close-v5-fixture.mjs`: real cumulative source/prefix-squash Git history and complete production v5 observations; existing fixture behavior remains default.
- Create `scripts/tests/fixtures/close-cumulative-provider.mjs`: strict stateful executable GitHub transport, explicit synthetic data, exhaustive operation/variables/target validation and no network fallback.
- Create `scripts/tests/fixtures/close-cumulative-trace-loader.mjs`: test-only `node:module::registerHooks` entry-observation hook for the existing private comparator. Load only in explicit test subprocesses, match one exact module/header and append observations without changing arguments/results; absent/multiple source matches refuse. Never load from production entry, CLI/env configuration or packed runtime; package-boundary checks must prove exclusion without exemptions.
- Create `scripts/tests/integration/task-tracker/lib/close-cumulative-recovery.test.mjs`: actual public CLI/native guard qualification of generation change, genuine integration and new artifact evidence, then both read-only Explain forms.
- Modify `scripts/tests/integration/task-tracker/lib/action-close-v5.test.mjs`: production-port prefix positives, lost-change and malformed-evidence negatives, effect-confinement snapshots.
- Reuse `scripts/tests/integration/task-tracker/lib/artifact-lifecycle.test.mjs`, `artifact-subject.test.mjs`, `artifact-delivery.test.mjs` and `scripts/tests/integration/task-tracker/delivery-content-comparison.integration.test.mjs`; change only if the new production-path case requires an additive assertion.
- Create `docs/guides/close-cumulative-delivery.md`: narrow operator route and limits. Keep package/runtime help unchanged unless source analysis finds a missing existing pointer; a new runtime contract requires reassessment before product edits.

## Implementation Tasks

### Task 1: Qualify genuine operator integration and receipt renewal — 3h

#### Story Intent

- **Beneficiary:** task operator returning to a delivered issue
- **Capability:** renew verification after integrating a delivered runtime under the actual resumed binding
- **Need:** cross-worktree occupancy changes the generation and makes historical operator-bound receipts stale
- **Value or failure prevented:** stale evidence cannot authorize Close and valid immutable accepted artifacts remain usable

**Interfaces:**

- Extend existing `fixture(options)` in `close-v5-fixture.mjs` with an explicit `cumulativePrefix` mode; use23 linear source commits, prefix at zero-based index7 and sufficient pre-base integration ancestry to match observed speculative-replay behavior. Return actual `sourceBase`, `prefixHead`, `prefixTree`, `integrationBase`, `head`, `merged`, complete source evidence and exact receipt in addition to existing fields. Defaults remain unchanged.
- `close-cumulative-provider.mjs` exports fixture preparation for real disposable operator/second worktrees plus a stateful executable provider. Its test-only state contains issue bodies/board/comments/PR observations and a write ledger. Explicit synthetic issue data are never genuine host receipts.
- Tests invoke actual package-owned `bin/aitm.mjs` with the real fixture operator `cwd`. Only GitHub transport is replaced; source/session/binding/occupancy/Git/receipt owners remain production code. Unknown provider requests fail closed.
- Task 2 consumes the same complete receipt/history/provider fixture; no alternate fake-ready source is introduced.

- [ ] Step 0: Before product edits, capture the actual complete retained PR2164 source inventory and run production `verifyObservedIntegration` read-only against its immutable Git objects. Implement the test-only trace loader at the exact fixture path above, using the existing registerHooks pattern solely to append a trace at the private comparator entry; preserve source logic/results, production verifier, authority and command transport. Record original source identity, each method/quartet, the throwing call, source count23/no merges/prefix index7 and whether speculative rebase-step comparisons run. Current source topology predicts no probes because e3ca90→927c53→bb0c008 is already below the23-step replay depth; do not claim the trace until executed. If actual failure is a probe, revise design before product implementation. Prove no production/package reachability of the loader; it is not a CLI/env permission or a live operator diagnostic carrier.
- [ ] Step 1: Build the topology-matching real cumulative Git fixture: source base B, source prefix P, later accepted source H changes the same file again, integration base I is a separate squash of P with the same entire tree, and final merge M. Generate the v5 receipt with the real production delivery verifier and its real content comparator. Save immutable observations and command/effect logs. Assert `tree(P) === tree(I)`, source changes P→H, exact inventory reaches H and delivery verifies the quartet. Compare the fixture's actual comparator method/quartet trace to the motivating failure rather than accepting a two-commit rebase classification. Extend existing fixtures without changing ordinary exact/disjoint behavior.
- [ ] Step 2: Add public-entry lifecycle qualification in `close-cumulative-recovery.test.mjs`. Actual Start creates the original binding and original artifact evidence; pause/switch to the second issue then actual Start of the original creates its real resumed generation. Assert old Test evidence refuses. With inherited native SID available, remove synthetic root/session aliases for this one path and directly read the binding produced by those Starts for that exact SID; do not create the asserted record. No inherited identity means an explicit honest skip for that sole host assertion.
- [ ] Step 3: Exercise the existing real code-integration route: registered demote with a substantive delivered-runtime integration reason, actual canonical Git merge of the delivered repair-shaped revision in Develop, ordinary native commit-trace for the new operator-integration SHA, then native artifact Develop finalization/AC evidence/Test/Review/approval using the original artifact and actual new operator. Use tiny truthful fixture verifier commands for fixture source; do not substitute a fabricated test receipt, ready preflight or operatorContext. Preserve original receipt bytes separately. Assert top-level receipt.commitSha and artifactSubject.commitSha equal the original selected source, artifactSubject.treeSha its original tree, operatorContext.headSha the actual merged HEAD and operatorContext.bindingGenerationId the actual resumed generation. Close's parsed testReceiptSha must equal the original intent head. Any actual Review receipt retains that split; normal receipt reuse is not an invented Review record. Assert the integration SHA remains in the trail and physically available even though its own identity is not on trunk, actual merge show/name-list output (possibly empty) reaches filesForSha/dirty guard, and real lineage still proves original delivered issue attribution. Assert native dirty/source/generation negatives refuse; never delete the integration trail entry to obtain readiness.
- [ ] Step 4: Run actual public `explain` and `close --explain --json` plus the native Bash/activity guard against the fixture. Qualification must reach the real cumulative content-proof refusal; unknown-command, guidance, admission, binding or setup failures are not an acceptable terminal RED. Snapshot both roots, Git objects/refs/index, issue/provider state and timer around each read-only call. Retain exact failure evidence in issue-scoped scratch. Confirm public carrier/admission and all renewal boundaries are supported before any product source edits. If they are not, stop and revise the concrete contract and forecast.
- [ ] Step 4a: Pin the trace branch point explicitly: ordinary commit-trace after integration must retain the new actual integration merge; artifact-specific commit-trace may select the original artifact, but must not erase the recorded integration row. If either actual native command refuses or filters contrary to this contract, preserve output and revise before implementation. Do not manufacture a trail, omit the merge or interpret an empty merge name list as delivery. The unchanged lineage and original v5 receipt must pass with that full actual trail.
- [ ] Step 5: Run the lifecycle qualification and existing artifact regression files. Commit only passing lifecycle/fixture qualification coverage as `[#2165] Qualify cumulative delivery operator renewal`; retain the separate failing readiness expectation/evidence for Task 2 without landing a falsely passing readiness assertion. This increment is independently useful coverage of stale evidence refusal and genuine renewal.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/close-cumulative-recovery.test.mjs scripts/tests/integration/task-tracker/lib/artifact-lifecycle.test.mjs scripts/tests/integration/task-tracker/lib/artifact-subject.test.mjs scripts/tests/integration/task-tracker/lib/artifact-delivery.test.mjs
```

### Task 2: Prove the prefix without losing integration-base changes — 3h

#### Story Intent

- **Beneficiary:** task operator closing accepted cumulative source
- **Capability:** establish a complete already-applied source prefix without mutating readiness
- **Need:** the integration base can hold an intermediate version of a path changed again by accepted source
- **Value or failure prevented:** a valid delivered suffix can close while unrelated or contradictory content remains refused

**Interfaces:**

- Private `compareReadOnlyDeliveryContent(input, output, observation)` retains the existing quartet/method input and boolean result. `observation` carries the exact accepted head and the same selected PR's complete source evidence from `verifyDeliveryAuthority`'s closure; it is not public or serializable authority. Actual immutable object reads and ancestry correlate every admitted candidate.
- Optional private helper `proveAppliedSourcePrefix({input,observation,output,trees}) -> Promise<boolean>` stays in `close.mjs`. It is consulted only at the current overlapping-entry indeterminate branch, never after definitive false; existing true/false and degenerate P=base/P=head cases remain with the current proof. It admits only complete accepted-head comparisons, excludes `rebase-step`, binds canonical observation identity to the exact verifier inventory, validates strict-interior candidates against actual Git trees/parents and source-base→candidate→source-head ancestry, and requires full-tree equality of prefix/integration-base plus source-head/integration-head. No receipt/schema/quartet replacement. A changed observation view refuses.
- Existing confined `output` remains the only command port. Use immutable identities and allowed read operations; no new process, write, mutable-ref or callback privilege.

- [ ] Step 1: Write the valid cumulative-ready assertions in the production-port test and both public Explain forms. Run them before production edits and retain the actual failure reached after Task 1's valid native renewal. Replay the motivating quartet with actual repository objects when available, labeling that read-only source evidence separately from fixture/native-host recovery. Confirm current ordinary delivery proof passes while Close proof fails.
- [ ] Step 2: Add strict negatives: no full-tree matching prefix despite equal final trees; unrelated integration-base file/mode/delete changes that the final source loses; foreign/non-ancestor candidate; falsified observed tree/parent; missing object; incomplete inventory; wrong accepted head; contradictory final content and receipt/source mapping. Preserve original overlapping-conflict regression. Require refusals and zero effectful commands/state changes, not one guessed error string for every fault.
- [ ] Step 3: Implement the private prefix proof and exact closure wiring in `close.mjs`. Preserve exact/disjoint behavior and all independent v5 checks. For a proven complete prefix, allow the existing content verifier to return true without changing the original quartet or receipt bytes. Missing/contradictory observations remain unavailable/refused. Do not infer safety from source-head/integration-head equality alone, add a generic merge algorithm or expose a new acceptance flag.
- [ ] Step 4: Run Task 1 tests, production v5 tests, ordinary delivery content tests and artifact acceptance regressions; require all green. Convert the retained readiness regression into ordinary passing coverage. Prove original receipt canonical equality, actual operator evidence renewal and both public forms ready, while all lost-change negatives remain refused. Check packed inclusion/exclusion and exact runtime-entry delta; no new runtime leaf is currently planned. Run affected lint/format and `git diff --check`.
- [ ] Step 5: Write `docs/guides/close-cumulative-delivery.md` with the exact bounded eligibility, immutable quartet/receipt semantics, real integration/renewal route, original evidence preservation, residual unsupported overlaps and no-force/no-identity-copy limits. Commit exact source/test/guide paths as `[#2165] Prove already-applied source prefixes at Close`.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/action-close-v5.test.mjs scripts/tests/integration/task-tracker/lib/close-cumulative-recovery.test.mjs scripts/tests/integration/task-tracker/delivery-content-comparison.integration.test.mjs scripts/tests/integration/task-tracker/lib/artifact-lifecycle.test.mjs scripts/tests/integration/task-tracker/lib/artifact-delivery.test.mjs
```

## Native acceptance, delivery and activation

- [ ] Enrich native root VC1 to include the new production-entry recovery and artifact files while retaining stable root IDs. No invented evidence marker or appendix checkbox section. Verify story semantics against this root Story Intent and preserve a source-bound audit.
- [ ] Native Plan-estimate publication must reflect accepted 6h/Size M, retaining Refine 4h as history. Obtain genuine ordered review and native Full-Auto plan approval before product implementation. Reassess if any renewal boundary is missing or estimate exceeds this forecast.
- [ ] At final clean committed source, run required native Develop finalization and individually verify/tick every AC. Obtain fresh independent Astra6/xhigh whole-branch source review and disposition every finding through exact-source final acceptance. Required CI must pass on that same source. Request the coordinator's exclusive Test slot and execute one genuine Test pass; no concurrent Test verbs.
- [ ] Report CODE_COMPLETE / REVIEW_COMPLETE. Under the orchestrator's explicit Full-Auto decision, continue native Review/approval, create PR with Refs #2165, and invoke native delivery. Send exactly one exit20 action envelope to the coordinator; never shell-merge or call the provider yourself. Reconcile the provider result through native delivery, then fresh Explain and Close from its live-verified receipt.
- [ ] Only after #2165 is genuinely Closed/Done, coordinator activates the original #2161 checkout on a fresh turn. Execute the spec's six-step Start → genuine code-rework demotion → delivered-runtime merge → fresh artifact verification/Test/Review/approval → original receipt revalidation → ready Close route. Preserve actual command outputs and source/artifact/operator identities; no second provider merge for #2161.
- [ ] Read back #2161 Closed/Done and its actual close transaction before separately resuming #2157. Preserve sole child #2160 and never replay the complete partial split.

The separate speculative rebase-step overlap parity gap noted during spec review remains outside this23-commit case. No new behavior or guard waiver for that topology is included; retain it as a separately named nonblocking follow-up and reassess only if the mandatory actual trace reaches it.

## Self-review

Task 1 owns every native renewal boundary and pre-product qualification. Task 2 owns the bounded prefix proof, strict content negatives, public readiness regression and guide. Both use the same literal artifact/operator identities and v5 fixture observation. All five review-focus cases have explicit tests. No helper-only readiness, undisclosed runtime carrier or new identity API is planned. This is a six-hour author forecast, not yet native published Plan authority or implementation approval.
