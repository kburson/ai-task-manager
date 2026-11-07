# #2165 CI rebalance design/plan — author disposition, round 1

Manual design/plan phase; same retained independent Astra/xhigh reviewer. No implementation/native demotion/source amendment authorized by this response.

Reviewed round1 report .scratch/peer-review/2165-ci-rebalance-plan-review-r1.md SHA256 dd104f26ac59e3f9876d794134e9e1763f3a92ab633820b5220314b2619220ae, complete contents read.

## CI-PLAN-R1-F001 — accepted and resolved in proposed plan

Verified against current code: ci-test-shards.test.mjs owns generic planner tests, currently only synthetic six-file/three-group cases. Canonical laneFiles import can supply actual inventory characterization without adding a test entrypoint. The previous four-file promise and unchanged-list contradicted the required real-inventory case.

Revision2 explicitly moves scripts/tests/unit/task-tracker/core/ci-test-shards.test.mjs into Modify as fifth existing file. It owns twelve nonempty groups, exact-once equality to full canonical inventory, no missing/extra/duplicate path and deterministic ordered groups under reversed discovery. All original generic three-group negatives remain. The unchanged list and edit count now agree. The bridge's twelve-group acceptance remains the meaningful pre-change RED against the nine-group reader; generic planner characterization is not claimed newly failing behavior.

## Substantive review conclusions retained

- Twelve is a bounded experiment, not durable slowdown assurance. Largest465.258s file defeats hypothetical uniform1.45563x; uniform first-failure stress leaves only~3.4s on candidate baseline. Actual all-worker600s qualification and stop/reassess boundary remain mandatory; no heavyweight fixture work silently added.
- Current amended twelve-group source refuses historical3/9 as current-source evidence; immutable selected890 retains its own historical3-group reader through unchanged selected-source execution. No compatibility hack/object rewrite/current-reader substitution.
- Failed-only attempt2 remains PR check observation, not replacement/revocation of existing genuine full-M native Test input. New head requires fresh complete same-attempt full CI.
- Native rework requires reviewed plan authority plus separate Root decision and admitted demote --rework; known Review timing Unknown/legacy-attribution-unknown is preserved with no timing repair or silent new issue chain.
- Existing full-M source review/approval/intent remain exact-M evidence; new-source review/nativeTest/approval/Deliver supersession must be real. Root retains provider merge.

## Return pins

Revised plan .scratch/plan/2026-11-05-2165-ci-rebalance-options-and-proposed-plan-r2.md
SHA256 5bc83bd9c0239f6d0e0f8a3329ac1e83eaff65024ee3b1badd33de1c97049964.
Replay unchanged SHA256 c196b06db3ba285971c1f85e540684db906c228371657d573bd7b59dc3d43208.
Original plan unchanged SHA256 da51e52660848525d820a258f7d4dc6bb4c624e11d26055a837a52bf73ab41a1.
Source M2fb61439220cb9a4548522fc16fa45a8c3782ab8/tree5ea3012bd30c27a2cdd17078c4fdb4ae68dea62f stays fixed; working tracked tree clean at last check.
Return revised plan to same reviewer, same manual design/plan phase, for exact-byte verdict. No source tests executed; no implementation state changes.

