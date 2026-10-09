# Issue 1939 planning preparation handoff

Preparation status: reviewed specification and plan committed and published; all twelve native children are Ready for Planning. Parent #1939 remains in Plan while the user-requested planning-collateral merge to trunk is completed before development starts. No implementation or historical apply has begun.

## Accepted artifacts and review lineage

The accepted [specification](https://github.com/kburson/ai-task-manager/blob/108de3369e9ba93c2d314f747d44b3bcb4099aab/docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md) has raw SHA-256 `d0ef19327c13690f2aa4345d4d635cf430973a728271738abbd7f5fbe982d1bc`. Its manual Astra SAR accepted predecessor bytes; its finalized Claude XPR accepted this final revision. Both records live under `docs/peer-reviews/1939/spec/`.

The accepted [implementation plan](https://github.com/kburson/ai-task-manager/blob/2a06a6a4f94ee8a2e61f1c528f585a8638509f8d/docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md) has raw SHA-256 `6f48a829a2d8ecf657585416def0f972215ffa1915410021c65d187b6340e5a0`. Its historical draft status is part of the accepted bytes; acceptance evidence is recorded separately.

- [Astra plan SPR](https://github.com/kburson/ai-task-manager/blob/092a51e74ce4a794d2b6240c5fee714c611ccae5/docs/peer-reviews/1939/plan/spr/README.md): three rounds, two author revisions, accepted predecessor `9f8642860127229e59e4ddbbb689abed8f449638`, digest `9995905f1f17a3e0c24928ed7a34a83d550d56d53f09889797c902f692a55ddd`. Joint recorded review span 10m 08.161s.
- [Claude plan XPR](https://github.com/kburson/ai-task-manager/blob/245d6f28dd9e596075955f42cd5a22b45cfd2f9b/docs/peer-reviews/1939/plan/xpr/README.md): three rounds, two author revisions, final accepted source above. Joint recorded review span 23m 38.461s.

Each record retains actual reviewer settings, assurance, full notes, dispositions and sealed manifests. Earlier acceptance does not transfer to later bytes. Reviewer consensus does not constitute human Plan approval.

The repository-grounded [accepted-plan deep dive](https://github.com/kburson/ai-task-manager/issues/1939#issuecomment-6087081812) is mirrored as substantive issue-body prose and marked complete through the canonical command. The root and twelve task stories were reviewed against all seven semantic questions before splitting. Sources and repository findings remain in that analysis.

## Hydrated children

Native enumeration initially found no children. Shaped creation preflights passed for all twelve proposals; each was created through AITM, then advanced Backlog → Refine → Ready for Planning. Exact live read-back on 2026-10-09T19:55:50.101Z verified twelve unique native children, kburson ownership, current refinement snapshots, selected source headings, ranks and native blockers. The canonical `planEpicDevelopChildrenGate` returned `ok: true`.

All children inherit source plan commit `245d6f28dd9e596075955f42cd5a22b45cfd2f9b`, whose plan bytes equal the final accepted digest, plus the exact selected Task N heading and governing specification. None has entered Plan or implementation.

| Task | Child                                                          | Baseline hours | Size | Rank | Native blockers              |
| ---- | -------------------------------------------------------------- | -------------- | ---- | ---- | ---------------------------- |
| 1    | [1940](https://github.com/kburson/ai-task-manager/issues/1940) | 10             | L    | 2    | none                         |
| 2    | [1941](https://github.com/kburson/ai-task-manager/issues/1941) | 12             | L    | 3    | 1940                         |
| 3    | [1942](https://github.com/kburson/ai-task-manager/issues/1942) | 12             | L    | 4    | 1941                         |
| 4    | [1943](https://github.com/kburson/ai-task-manager/issues/1943) | 8              | M    | 5    | 1942, 1946                   |
| 5    | [1944](https://github.com/kburson/ai-task-manager/issues/1944) | 12 combined    | L    | 3    | 1940                         |
| 6    | [1945](https://github.com/kburson/ai-task-manager/issues/1945) | 10             | L    | 4    | 1941, 1944                   |
| 7    | [1946](https://github.com/kburson/ai-task-manager/issues/1946) | 12             | L    | 3    | 1940                         |
| 8    | [1947](https://github.com/kburson/ai-task-manager/issues/1947) | 10             | L    | 6    | 1943, 1945, 1946             |
| 9    | [1948](https://github.com/kburson/ai-task-manager/issues/1948) | 10             | L    | 7    | 1946, 1947                   |
| 10   | [1949](https://github.com/kburson/ai-task-manager/issues/1949) | 10             | L    | 8    | 1948                         |
| 11   | [1950](https://github.com/kburson/ai-task-manager/issues/1950) | 12             | L    | 9    | 1949                         |
| 12   | [1951](https://github.com/kburson/ai-task-manager/issues/1951) | 6              | M    | 10   | 1942, 1943, 1944, 1947, 1950 |

Ranks encode dependency waves. The current epic approval orchestration record uses strict sequential execution; these ranks do not authorize simultaneous workers.

Final XPR optional R3-F001 is included in #1946 Scope: the artifact-publication verb, command catalog, registry and task dispatch are explicitly owned. The original source verifier is retained and a separate catalog-policy/parser verifier is added. R3-F002 remains an estimate risk: newly explicit strict recovery is inside the proposed 12-hour baseline and initially supports Codex human sources only. Accepted plan bytes remain unchanged.

## External producer handoff

[ai-peer-review #197](https://github.com/kburson/ai-peer-review/issues/197) captures Task 5's standalone publication-envelope export and read-only verifier. It is assigned to kburson, tethered to its own project, and verified Backlog. Existing producer issues #30 and #151 remain interface coordination inputs; review algorithms remain with their current owners.

Child #1944 records an external producer admission requirement: verify the delivered producer commit, package/tarball digest and compatible public API before its consumer enters Develop. Native blocked-by relationships support only the current repository, so no cross-repository native edge is claimed. The combined Task 5 baseline is counted once across the producer and local integration boundary.

## Estimate and forecast

Scope baseline: 124 child hours plus 3 parent orchestration/integration hours = 127 joint hours. The unconstrained dependency longest path is 90 child hours; a single worker needs the full joint effort. These are engineering baselines, not measured execution.

The canonical [Plan estimation record](https://github.com/kburson/ai-task-manager/issues/1939#issuecomment-6088046618) is `01M4H33K68DM5DWSVGF4219DDV`, schema `aitm.estimation-forecast/v2`. Its calibrated board human Plan estimate is 148.5 hours, separately from the Refine estimate of 96 hours. AI engaged forecast: P50 26.5 hours, P80 29 hours; stage allocation Plan 2.5, Develop 18, Test 5, Review 1 hour. The breadth-triggered split recommendation is addressed by the twelve bounded children.

The input packet is preserved beside this handoff as `2026-10-09-1939-plan-estimation-input.json`. It includes execution-cost assumptions, external integration, retention/authority risks and Task 7 scope-growth uncertainty. Its 60-minute verification allowance is a planning assumption, not a benchmark.

## Independence interpretation for the eventual approval audit

Preserve #1592's decommission regression unchanged, with no AITM peer-review dependency/import, wrapper or revived algorithm ownership. The accepted plan permits the exact public wire schema as a transparent bundled data asset at `templates/contracts/review-publication-v1.schema.json`, loaded package-relative by a neutral validator. Production uses an authenticated configured read-only external argv verifier; the standalone packed artifact is a pinned fixture installed only in a disposable consumer. Current operator documentation keeps independent artifact-review wording. No test exception, hidden identifier or template mirror expansion is permitted. Include this concrete interpretation in the eventual truthful Plan-approval audit.

## Approval provenance incident and remaining boundary

At 2026-10-09T19:47:11Z, the author ran `npx aitm plan-approve 1939` without `TT_FULL_AUTO=1`. The runtime recorded `mode="human"` even though no human approved this exact plan. This is an author invocation mistake, not human approval evidence. It must not authorize promotion.

`npx aitm auto both` subsequently confirmed all session gates off. The implementation nevertheless selects approval provenance only from the explicit `TT_FULL_AUTO` environment value. Its complete-marker idempotent path preserves the earlier mode, so a repeat command does not correct the provenance.

The supported `cancel-plan` operation was attempted with a reason explicitly retracting the misattribution and requesting truthful JIT reapproval. It exited 4 with `snapshot-refused`; no cancellation or promotion occurred. Read-only verification established `stale refinement snapshot`: the original snapshot binds the enhancement label, while the later canonical `kind 1939 epic` added the epic label. The original Scope, AC and projected refinement fields still validate against the original enhancement-only input, but the current live labels do not. No label was removed to circumvent this refusal and no protected marker was edited.

Fresh Explain reported promotion ready because it accepts the persisted complete marker. The stored human mode does not establish human review. The author initially treated the provenance discrepancy as an implementation blocker; the user subsequently clarified that Full-Auto approval is the intended authority and additional human review is not required. The ordinary promotion query remains ready with no blockers. Preserve this historical discrepancy without claiming a human reviewed the plan; use explicit Full-Auto invocation for subsequent approvals. The user's latest boundary is to merge the specification, plan and all collateral to trunk before starting development.

## Planning-collateral integration

The original chat checkout's hook-disable snapshot is preserved on `origin/codex/1939-preserved-hook-disable`; the complete original planning branch is preserved on `origin/codex/1939-draft`. Both are published before integration. The dedicated `codex/1939-planning-to-trunk` branch restores inherited tool configuration to trunk bytes, so its final diff contains only #1939 documents and planning records. Accepted specification/plan bytes and original review-commit ancestry are retained.

This merge includes the substantive deep-dive analysis, the canonical forecast record and a compact archived hydration observation alongside existing review notes, manifests, snapshots, estimate inputs and the handoff. The hydration observation is historical evidence, not a current execution receipt. AITM issue completion and feature delivery are separate from this planning-only merge; no feature AC/VC/DoD boxes are signed off.

Preparation verification checked accepted raw hashes, twelve live child records and the canonical children gate. Formatting and Markdown checks cover this collateral. Future implementation tests, acceptance boxes, closure and historical pilot authorization remain outstanding.
