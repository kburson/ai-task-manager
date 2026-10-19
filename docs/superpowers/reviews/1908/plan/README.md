# #1908 planning and implementation handoff

Parent #1908 is in Develop with normal human-provenance Plan approval and no implementation started. A fresh implementing agent must read the issue, accepted specification, final accepted plan and deep dive, then use governed child pickup/worktree admission. All implementation AC/VC/DoD remain open.

## Accepted artifacts and reviews

- Specification: docs/superpowers/specs/2026-10-11-1908-reestimate-decomposition-design.md @ acb725feafc26e31bccfd18b96e9b5e517137397; SHA-256 3aa7382fdb05c1151d95fb0a74745b0ecf610671086db5e22545682e1ac554d4. Earlier SAR/XPR records remain in the issue's Plan Metadata.
- Plan: docs/superpowers/plans/2026-10-11-1908-reestimate-decomposition.md @ 84159001f66fbe4f678ac03d03d2ec762c612ced; SHA-256 3aade2c0eb0ec38fc784f61e03799f91b44f2ea7579c5d5fcc0cabfd9eed20c9.
- SPR review-b45e2fe4a2ba60ce0026775e737bfadc: this Codex author gpt-6.1-sol medium, distinct official Codex reviewer gpt-6-astra high; accepted in two reviewer rounds with one revision. Historical accepted artifact 1ed7710e7f4137be79974d3298c7e8d295745ed6, digest 9b87ec194deed5f31c118485ce2e8c5aa6e5f149085e6c41d4bf1c25e63d1873. Finalization 0f840cdcca5bfe181ec9a050fe41879b59002723. Full records are under plan/SPR/plan/2026-10-11-2026-10-11-1908-reestimate-decomposition-review-b45e2fe4a2ba60ce0026775e737bfadc/.
- XPR review-f72ed8649e6bbe30f0b4a3d179ce0f80: this Codex author gpt-6.1-sol medium, Claude reviewer claude-opus-5-5 high; accepted in three reviewer rounds with two revisions in the same registered reviewer session. Accepted artifact is the final plan pin above; finalization bf821b8bb3d906b761d9385a58e9b155abbd9cde. Full records are under plan/XPR/plan/2026-10-11-2026-10-11-1908-reestimate-decomposition-review-f72ed8649e6bbe30f0b4a3d179ce0f80/.
- Both reviews use normal commit mode; human-authority assurance unavailable. Subsequent XPR revisions do not rewrite historical SPR acceptance. Consensus is planning evidence, not implementation/test evidence or human final delivery approval.
- Deep dive: docs/superpowers/plans/2026-10-11-1908-deep-dive.md @ 86bf59c3506a2972716f25bc46651058105a3904; canonical issue comment <https://github.com/kburson/ai-task-manager/issues/1908#issuecomment-6110749017>. Posted, mirrored and complete through sanctioned commands; no material design divergence from the final accepted plan.

## Hydrated child graph

All children are Ready for Planning with current refinement evidence, P1 and the existing reliability label. They inherit exact source task sections, governing spec and Source-plan-commit 86bf59c3506a2972716f25bc46651058105a3904, whose plan bytes match the accepted digest.

| Task | Child | Refined human hours | Size | Rank/wave | Native blocked-by |
| --- | --- | --- | --- | --- | --- |
| 1 | #1986 | 6 | M | 1 | None |
| 2 | #1987 | 7 | M | 2 | #1986 |
| 3 | #1988 | 12 | L | 3 | #1986, #1987 |
| 4 | #1989 | 6 | M | 3 | #1986, #1987 |
| 5 | #1990 | 9 | M | 4 | #1988, #1989 |
| 6 | #1991 | 6 | M | 5 | #1988, #1989, #1990 |
| 7 | #1992 | 6 | M | 6 | #1990, #1991 |

Only Tasks 3/4 have disjoint parallel implementation ownership. Runtime parallel execution still uses normal sanctioned rank-wave authority; this preparation does not dispatch workers or waive admission. One active agent per task and serialized formal review handoffs preserve joint effort. Shared inventories have one owner per sequential wave. Integrate each wave before subsequent child pickup.

Root contracts referenced by each task are scope-bearing pinned dependencies. Read them with the bounded child section. Task 5's root vocabulary includes scoped-completion. Task 7 child vc:6–8 correspond to parent vc:1–3; preserve generated positional IDs.

The initial bug label caused the repository's title-normalization Action to add a prefix that the exact WBS matcher rejected. The corrective children now use the accurate reliability category; parent remains bug/epic. Each prior refinement was preserved through sanctioned Shelve history and unchanged scope/estimate was re-refined through Backlog→Refine→Ready for Planning. No accepted plan bytes, native dependencies, ranks or estimates were waived or changed to bypass decomposition.

## Estimation and readiness

Confirmed child baseline is 52 human hours; parent orchestration baseline is a separate 2h. Adaptive rubric calibration plus unavoidable repository verification yields 66h/XL on the parent. Forecast 01M4NVNKYFJGEA0KCXQR6HNXJN is at <https://github.com/kburson/ai-task-manager/issues/1908#issuecomment-6110983582>. AI engaged P50=12.5h and P80=13.5h are planning forecasts, not measured execution or parallel elapsed time. Input is docs/superpowers/plans/2026-10-11-1908-plan-estimation-input.json; its 30-minute execution allowance is an explicit planning assumption.

Substantive root story was rendered from final plan intent. Current live child reader verified all seven refinement snapshots/ranks/native edges. Parent Explain returned ready with no blockers, and the normal Plan→Develop command verified Status, timing, entry marker and final completion sentinel (8/8). Existing local singleton owner is kburson; parent authority branch is codex/1908-draft in the existing 4c2a managed worktree. Draft PR: <https://github.com/kburson/ai-task-manager/pull/1985>, base trunk.

## Verification boundary

Plan policy/intent parsing, complete seven-child proposal rendering, full sanctioned creator dry-run and real confirmed hydration passed. Canonical plan formatting, diff whitespace and configured Markdownlint passed. Accepted spec/plan digests were verified. Provider review analysis/dispositions remain in the durable response documents. All current workflow gates were satisfied with real records; no decomposition waiver or hook deletion was used.

No runtime implementation suite, product source edit or implementation commit was performed. Future red/green fixture evidence, configured exact-SHA final provider verification, code review, parent delivery and closure remain required. Hook obstructions are tracked for investigation/adjustment/possible removal in #1984; tracking is not their resolution.
