# #1918 criteria-revision repair hydration plan

Status: all sixteen children and sibling epic #1918 are hydrated and independently verified in Ready for Planning. Each has current scope, acceptance criteria, declared verifiers, dependencies, priority, rank, size, estimate and a genuine refinement snapshot. This is not child implementation-plan approval or completed delivery verification. Parent rollups were recalculated and published: #1918 = 144h; #1847 = 250.5h, counting each direct child once.

**Goal:** Complete the remaining original1855/1847 Task5 protection contract through bounded repairs, preserving existing code, history and failing/passing evidence.

**Architecture:** Children work on an ordered sibling integration branch over the preserved committed1855 checkpoint. Each repair reuses its existing code, completes only its assigned gaps, passes declared checks and any mandatory provider checks, and records inherited failures truthfully. Original1855/PR1907 wait for final combined green integration. No child requires1855Done.

**Tech stack:** Node.js scripts and Markdown. No compiled native binaries/addons.

**Governing specification:** docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md; original accepted implementation plan docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md, Task5.

**Original implementation checkpoint:**14f6c5589724e9d2a33c2353c19f0c793bfe6033. The portable feature/epic/1918/parent branch also preserves the subsequent 58-path implementation checkpoint in Git history. Use the source and commit history in that branch; no prior machine-specific donor checkout is required. Old local receipts do not prove a new HEAD or published CI.

## Global constraints

Preserve original algorithms/body invariants/authority/current-source and common-lock checks; no test deletion, fixture shrinkage, budget increase, exemption or authority cache. Per-file and semantic-section budget600000ms remains. Verifier20min and lifecycle sandbox45min remain. No child code work or Plan approval during R4P hydration. Any future story forecast>=24 must split again; no agent self-waiver. Existing13/15 policy grants do not authorize the new event-field body predicate. Each child owns its own actual entrypoints, five authority states and fault/effect/lock coverage; finalunion is not an implementation dumping ground.

## Estimates and credit

Nonoverlapping remaining repair forecast144h; retains prior implementation and tests and includes incremental authoring/diagnosis/review, not passive CI time. Retained1855 accounting56h comprises52 historical human-equivalent implemented-work estimate plus4 future administration. These are forecasts, not reconstructed productive-time measurements. The prior80h whole-scope forecast is historical, not a current ceiling. The proposed24h tail/unknown recovery row was split into8+16 before hydration.

| Rank in #1918 | Child | Scope | Remaining h | Native blockers |
|---:|---|---|---:|---|
| 1 | [#1919](https://github.com/kburson/ai-task-manager/issues/1919) | Repair UTC timestamp and validation-budget regressions | 6 | #1854 |
| 2 | [#1909](https://github.com/kburson/ai-task-manager/issues/1909) | Protect ordinary writers with revision admission and ordered locks | 8 | #1919 |
| 3 | [#1910](https://github.com/kburson/ai-task-manager/issues/1910) | Bind evidence and lifecycle decisions to the current revision | 8 | #1909 |
| 3 | [#1911](https://github.com/kburson/ai-task-manager/issues/1911) | Stop stale code work across hooks and bound sessions | 8 | #1909 |
| 4 | [#1912](https://github.com/kburson/ai-task-manager/issues/1912) | Complete actor, board and sentinel prefix conformance | 6 | #1911, #1910 |
| 5 | [#1916](https://github.com/kburson/ai-task-manager/issues/1916) | Complete original rollback and audit compensation | 12 | #1912 |
| 5 | [#1920](https://github.com/kburson/ai-task-manager/issues/1920) | Complete consistency checks and transition-comment custody | 4 | #1912 |
| 6 | [#1913](https://github.com/kburson/ai-task-manager/issues/1913) | Complete dispatcher and cache continuation | 8 | #1920 |
| 6 | [#1915](https://github.com/kburson/ai-task-manager/issues/1915) | Resume known early transition prefixes through genuine reentry | 14 | #1920 |
| 6 | [#1924](https://github.com/kburson/ai-task-manager/issues/1924) | Report committed transition facts accurately on failure and cancellation | 6 | #1920 |
| 7 | [#1921](https://github.com/kburson/ai-task-manager/issues/1921) | Complete conditional follow-up actions and tracker persistence | 10 | #1913 |
| 8 | [#1914](https://github.com/kburson/ai-task-manager/issues/1914) | Complete event-field source, resource and temporary-file protocol | 12 | #1921 |
| 9 | [#1922](https://github.com/kburson/ai-task-manager/issues/1922) | Authorize exact event-body admission and compose terminal completion | 10 | #1914 |
| 10 | [#1923](https://github.com/kburson/ai-task-manager/issues/1923) | Resume known transition tail prefixes without duplicate effects | 8 | #1922, #1915 |
| 11 | [#1925](https://github.com/kburson/ai-task-manager/issues/1925) | Reconcile unknown transition outcomes through idempotent repair | 16 | #1923 |
| 12 | [#1917](https://github.com/kburson/ai-task-manager/issues/1917) | Verify the complete consumer boundary and passing integration CI | 8 | #1925, #1924, #1916 |

## Relative execution ranks

| Rank in #1918 | Pick up | Mode |
|---:|---|---|
| 1 | #1919 | Single story |
| 2 | #1909 | Single story |
| 3 | #1910, #1911 | Parallel wave |
| 4 | #1912 | Single story |
| 5 | #1916, #1920 | Parallel wave |
| 6 | #1913, #1915, #1924 | Parallel wave |
| 7 | #1921 | Single story |
| 8 | #1914 | Single story |
| 9 | #1922 | Single story |
| 10 | #1923 | Single story |
| 11 | #1925 | Single story |
| 12 | #1917 | Single story |

Ranks are relative to immediate epic #1918, starting at1. Parallel groups are3,5,6. All sixteen ranks/snapshots and actual Project fields/Status were independently verified, with all children and parent R4P. Before parallel dispatch, approved Plans must resolve exclusive function/file ownership, shared contracts and integration order; equal rank does not grant Plan approval. Native blocker edges and all scopes/verifiers/estimates remain unchanged. This twelve-wave table supersedes the old conservative1–15 schedule.

## Refinement execution

For each issue: bind exact target; read current body/status/Explain; apply exact-precondition scope/WBS/AC/metadata operation without changing protected comments; make automated-test label truthful without dropping its declared commands; converge native blocker edges; set required priority/rank/size/estimate/labels through native refine; enter Backlog→Refine and complete Refine→Ready for Planning one edge at a time. Verify current body and Project Status/fields readback. Do not fabricate a snapshot or movement sentinel if a gate refuses.

New1918aggregate receives XL144h/P1/rank8 at native Refine. Each child remains <24h and receives an explicit relative rank. Shared source requires explicit exclusive function/file ownership, stable contracts and coordinated integration within the approved same-rank waves; do not silently add rank barriers or native blocker edges. Original1855retains all original unchecked whole-contract verification obligations while its scope/history/56h restatement and1918 blocker are governed separately in its original checkout.

## Review focus

Current versus inherited failure ownership; genuine original-entry retries rather than constructors; actual temp/body effects rather than empty-binding no-ops; early/reentrant/caller-controlled/getter side effects; linked-worktree/subprocess/holder liveness; stale proof/aggregate retirement; truthful partial facts before cleanup. Each child plan must carry its assigned cases at later Plan entry.

## Per-child remaining work

### #1919: Repair UTC timestamp and validation-budget regressions

Consumes: #1854 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Extract exact UTC and schema-scope repairs with existing regressions: 1h.
- Qualify same-family parity and current Linux linked-source budget; diagnose remaining breach: 3h.
- Bounded source/package/quality review: 2h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1909: Protect ordinary writers with revision admission and ordered locks

Consumes: #1919 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Finish owned writer/repair-delegate discovery: 2h.
- Close actual public admission/common-lock gaps: 3h.
- Real five-state/effect-spy/lock-order proof: 3h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1910: Bind evidence and lifecycle decisions to the current revision

Consumes: #1909 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Classify owned evidence/lifecycle readers: 2h.
- Close digest and preserved-individual integration gaps: 3h.
- Real five-state/retired-aggregate/Explain proof: 3h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1911: Stop stale code work across hooks and bound sessions

Consumes: #1909 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Close per-call target and binding-source edges: 2h.
- Real linked-worktree/mixed-commit/subprocess/liveness cases: 4h.
- Focused drift/refresh repair and review: 2h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1912: Complete actor, board and sentinel prefix conformance

Consumes: #1910, #1911 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Reconcile existing prefix fixtures/current code: 2h.
- Composed sentinel fault and prefix/custody verification: 2h.
- Close owned source-negative discrepancies and review: 2h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1920: Complete consistency checks and transition-comment custody

Consumes: #1912 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Integrate exact already-tested consistency/comment closure: 1h.
- Qualify positive/history/current-negative cases on integrated HEAD: 2h.
- Public/ordinary/source-contract review: 1h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1924: Report committed transition facts accurately on failure and cancellation

Consumes: #1920 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Fresh confirmed facts before holder cleanup: 2h.
- Cancellation/join/unknown-result routing: 2h.
- Genuine partial/current/refusal cases: 2h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1916: Complete original rollback and audit compensation

Consumes: #1912 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Original bounded rollback bytes/version/status algorithm: 3h.
- Genuine compensation/audit custody/resource/lock integration: 5h.
- Exhaustion/mismatch/interruption/audit cases: 4h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1913: Complete dispatcher and cache continuation

Consumes: #1920 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Qualify existing step17 private-window repair: 1h.
- Implement original step18 cache/resource/intent/readback: 4h.
- Original-input/reentry/current/fault coverage: 3h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1921: Complete conditional follow-up actions and tracker persistence

Consumes: #1913 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Original19–21 predicate and return custody: 2h.
- Original tracker22 durable actor/shared resource integration: 5h.
- Fixed fault/current/ordinary matrix: 3h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1914: Complete event-field source, resource and temporary-file protocol

Consumes: #1921 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Fixed original CLI/script/source selection: 2h.
- Real resource/temp mkdir/write/cleanup integration: 6h.
- Current/fault/ordinary contracts: 4h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1922: Authorize exact event-body admission and compose terminal completion

Consumes: #1914 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Prepare exact persisted-intent/current-body policy comparison: 4h.
- Original terminal24 classification: 2h.
- Complete/vertical and body/resource fault cases: 4h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1915: Resume known early transition prefixes through genuine reentry

Consumes: #1920 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Genuine fresh admission/current-prefix/common-lock integration: 3h.
- Original retained-clock actor/body/board/comment resume: 6h.
- Actual restart/no-duplicate/current-negative cases: 5h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1923: Resume known transition tail prefixes without duplicate effects

Consumes: #1915, #1922 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Known17–24 prefix reentry and original resource selection: 3h.
- Actual known-tail resume and no-duplicate effects: 3h.
- Known-prefix current/fault review: 2h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1925: Reconcile unknown transition outcomes through idempotent repair

Consumes: #1923 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Ambiguous-effect actual readback reconciliation: 8h.
- Original idempotent repair/fault/current cases: 8h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

### #1917: Verify the complete consumer boundary and passing integration CI

Consumes: #1925, #1916, #1924 reviewed contracts and the applicable1855 donor code. Produces: the bounded behavior/verification contract declared in this child's hydrated Scope and ACs; no blanket global-green claim.

- Independent alias/delegate/consumer union: 3h.
- Per-child five-state/common-lock coverage reconciliation: 2h.
- Exact-head Linux groups/aggregate/package/quality reconciliation: 3h.

Exact source surfaces and targeted command declarations are in the child's governed issue body. At normal Plan entry, pin its implementation plan and current source interface before code edits; old1855 approvals do not substitute.

## Next-agent pickup

Start with #1919 after normal parent/child Plan admission. Follow the twelve-wave table above and docs/superpowers/plans/2026-10-08-1918-delivery-handoff.md for baseline preservation, branch preparation, current gates and parallel-work ownership. The parent schedule comment is published and exact-readback verified: https://github.com/kburson/ai-task-manager/issues/1918#issuecomment-6069978884. Earlier schedules and rate-limit refusals remain historical records.
