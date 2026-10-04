# #1857 rank and child-staging audit

Status: read-only live audit prompted by the user's two questions during #1861 revised Plan preparation. No rank, state, issue body, dependency or approval mutation was made. #1862 implementation remains paused.

## Rank provenance and drift

The live configured project currently reports #1857 Rank **1.2**, while its body fields/refinement snapshot still report **1501**. #1861's live project rank is **1502**, matching its own October 2 refinement snapshot. The parent body is stale relative to its live board rank; no timestamp/actor of that external board change is inferred.

The [parent's September 30 refinement comment](https://github.com/kburson/ai-task-manager/issues/1857#issuecomment-5917051469) explicitly says: “rank 1501 follows maximum open board rank 1500 without changing existing delivery order.” That is append-to-tail placement, not a user-prioritized position near the current 1.2 rank.

C1's refinement snapshot records 1502, immediately after the historical parent 1501. Its [refinement rationale](https://github.com/kburson/ai-task-manager/issues/1861#issuecomment-5962447436) explains sizing/verification but does not justify the rank. Carrying forward the old tail ordering is the supported inference; the exact original rank-selection reasoning was not recovered from that comment. It is not an independently evidenced priority decision. Explicit user-directed pickup already placed C1 in Develop; rank did not require waiting for 1,501 global issues before that pickup. Its current scheduling position remains misaligned with the reprioritized parent.

Read-only delivered `projectValuesForIssue` observations:

| Issue | Live project Status | Live Rank | Relevant refinement evidence                              |
| ----- | ------------------- | --------: | --------------------------------------------------------- |
| #1857 | Develop             |       1.2 | Body still 1501; original M/7h scope retained             |
| #1861 | Develop             |      1502 | Snapshot exists but current refinement validation refuses |
| #1862 | Backlog             |    absent | No current refinement; disposition BLOCKED                |
| #1863 | Backlog             |    absent | No current refinement                                     |
| #1864 | Backlog             |    absent | No current refinement                                     |
| #1865 | Backlog             |    absent | No current refinement; disposition BLOCKED                |

## Parent admission chronology

The parent body records Plan approval and Develop entry on **September 30**, Develop move `2026-09-30T18:32:07.940Z`. It was later converted into the remaining-work integration epic. Child Backlog creation markers are October 2 at `06:08:58` (#1861), `06:09:38` (#1862), `06:10:34` (#1863), `06:11:22` (#1864) and `06:12:17` (#1865), UTC. These are repository evidence timestamps, not generated user-facing timing claims.

The [October 2 hydration audit](https://github.com/kburson/ai-task-manager/issues/1857#issuecomment-5946651298) expressly records all five children left in Backlog, parent resumed, and no lifecycle movement/approval. Thus the original parent Develop state was retained while a new decomposition was attached; the children were not staged through Refine to Ready for Planning afterward. This explains the history but does not establish a valid current epic admission.

The accepted decomposition requires normal Backlog/Refine estimates/ranks and Ready for Planning gates. The delivered `planEpicDevelopChildrenGate` requires every executable nonterminal child at R4P or later **with current refinement evidence and finite rank**. It runs at Plan→Develop; adding children to an already-Develop parent did not itself produce a new Plan transition/revalidation. No current staging approval is implied by the old marker or review consensus.

## Actual current guard result

Read-only `planEpicDevelopChildrenGate({ cfg, issueNumber: 1857 })` returned `ok: false`, `epic-children-not-r4p`, naming all five children. #1862–#1865 are Backlog/unranked/unrefined. #1861 is Develop/rank1502, but `hasCurrentRefinement: false`; the subsequent child evidence read returns exactly `stale refinement snapshot`. The other four return `missing or malformed refinement snapshot`. Advanced state alone is insufficient.

The user's R4P expectation matches the delivered gate. The current configuration is unreconciled workflow debt from the later conversion/hydration, not evidence that Backlog children are lawful parent Develop admission. Metadata/refinement staging is distinct from starting #1862 implementation; implementation pause does not justify skipping the epic staging prerequisite.

## Supported repair boundary

Reconcile parent live rank/body and select child ranks consistent with intended scheduling; no arbitrary new numeric ranks are invented here. Re-refine affected children and stage each through normal gates, preserving dependencies, original scope/history and current interface freezes. Current #1861 scope changes also require refreshed refinement/Plan authority. Do not tick evidence, reset historical timing or jump the parent directly from Develop to Plan; the delivered demote/cancel-plan routes do not authorize that edge. Any supported re-admission/exception route must preserve actual current scope and approval provenance.

No board correction, sibling pickup or implementation was performed in response to these explanatory questions. The revised #1861 Plan remains a draft pending its concrete review/decomposition and supported authority decision.
