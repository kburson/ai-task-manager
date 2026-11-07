# #2165 CI rebalance — design/plan review, round 1

**Decision: REVISIONS_REQUIRED.** One Important plan finding remains: the required real-inventory regression has no consistent authorized file owner. Option A is credible as a bounded twelve-group experiment with the stated stop condition; it is not demonstrated durable timing tolerance. Correct the plan boundary and return the revised exact artifact in this same design/plan phase. Implementation still requires design/plan `NO_CHANGES_REMAIN` and separate Root rework authorization.

## Scope, identity and provenance

I am the same retained independent reviewer originally selected as Astra/xhigh. This is the coordinator-supplied selection; I do not independently attest platform model execution. I performed this review myself, with no subagents. This is a manual design/plan review, not an implementation review, native approval or sealed SPR/XPR receipt.

I used only `/Users/kpburson/.codex/worktrees/close-proof-parity-2165/ai-task-manager`. Source, index, HEAD, branch, refs, intent and native state remained unchanged. The sole write is this report. No provider/network action, native lifecycle operation, production planner execution, test execution, demotion or source edit occurred. The local `peer-review help --json` lookup returned a command index with no `skillPath`; I did not invent an enrollment or protocol session. The existing requesting-code-review reviewer contract supplies the finding and disposition structure.

| Reviewed identity | Exact value |
| --- | --- |
| Current source M | `2fb61439220cb9a4548522fc16fa45a8c3782ab8` |
| Current tree | `5ea3012bd30c27a2cdd17078c4fdb4ae68dea62f` |
| Existing integration target | `9622816c7ef6f8c105d3d220fbea3b5dc434a248` |
| Plan | `.scratch/plan/2026-11-05-2165-ci-rebalance-options-and-proposed-plan.md` |
| Plan SHA256 | `da51e52660848525d820a258f7d4dc6bb4c624e11d26055a837a52bf73ab41a1` |
| Replay | `.scratch/plan/2165-ci-rebalance-candidate-replay.json` |
| Replay SHA256 | `c196b06db3ba285971c1f85e540684db906c228371657d573bd7b59dc3d43208` |
| Historical exact-M source report SHA256 | `5253393f2d9232c6a9cd923a96d5a050703e8dc4f377fce91c75a0a790bb074a` |

The existing accepted exact-M source review remains historical and source-specific. This new plan verdict neither revokes that review nor extends its acceptance to the proposed amendment. Root's #2147 sequencing update does not change this review's M/962 target; no additional integration is silently introduced.

## Strengths

- The plan correctly acknowledges that a failed-only retry cannot construct same-attempt grouped qualification, and preserves the failed worker as a real ceiling failure despite all file statuses being zero.
- It preserves the actual 298-file integration inventory, file families, scheduler, isolation, 600-second limit, receipt schema and full unit/slow coverage. It does not use concurrency or repeated budget resets to hide an oversized serial phase.
- The twelve-group proposal changes the existing workflow, current bridge, owning regression and guide together, with old-three and old-nine refusal tests for the amended current source.
- Native rework is explicit: new plan authority, supported demotion with a code-change reason, fresh source-bound evidence and approval, then native intent supersession. Existing approval and intent are not manually relabeled.
- The plan offers a finite decision: one bounded amendment and genuine complete qualification, then stop and reconsider the measured heavyweight fixture if it fails. It does not authorize a retry loop or an unreviewed runner redesign.

## Findings

### Critical — must fix

None.

### Important — must resolve before plan acceptance

**CI-PLAN-R1-F001 — assign the real-inventory regression an explicit owner and reconcile the edit boundary.**

- **Location:** `.scratch/plan/2026-11-05-2165-ci-rebalance-options-and-proposed-plan.md:49`, with conflicting requirements at `:54` and `:55`.
- **Problem:** Line 54 requires a new real-inventory `planShards(laneFiles('integration'), 12)` regression, while line 49 explicitly lists `scripts/tests/unit/task-tracker/core/ci-test-shards.test.mjs` as unchanged and line 55 permits only the four previously listed owned-file edits. The Modify entry for `verify-ci-receipts.test.mjs:44` describes the synthetic cloud bridge fixture and does not assign the real-inventory test there. The current generic sharder test at `scripts/tests/unit/task-tracker/core/ci-test-shards.test.mjs:41` tests a six-file synthetic inventory and three groups; it does not already satisfy the new requirement.
- **Impact:** An implementer cannot tell whether to modify the natural generic sharder owner, add discovery coverage to the bridge's owner, or omit the test to honor the four-file promise. This is a concrete task/file boundary contradiction at the test that is supposed to prevent real inventory loss.
- **Correction:** Choose and name exactly one owner. A narrow solution is to move `ci-test-shards.test.mjs` into Modify, authorize the fifth source/test/guide edit, and keep its existing generic three-group receipt tests intact. An equally reviewable alternative is to explicitly assign the new real-inventory case to the already authorized bridge test and explain that ownership choice. Update the unchanged list, edit count and verification task together. Keep runtime sharder/scheduler/ceiling code unchanged. Adding a case inside an existing test file need not change the 1,360-file discovery inventory.
- **Acceptance:** Revised plan unambiguously names the file containing canonical discovery coverage, twelve nonempty groups, exact-once coverage, reversed-discovery determinism and no selection loss; its Modify/Unchanged lists and count agree. The author must retain the separate meaningful bridge RED: twelve-group acceptance should fail against the current nine-group reader before its constant changes. The generic planner already supports twelve, so its new real-inventory characterization is not itself proof of a newly failing runtime behavior.

### Minor — optional

None raised as separate findings. The timing qualifications and source-domain constraints below are substantive review conclusions to retain in the amendment, not requests to expand implementation scope.

## Independent replay and evidence reconciliation

I read all nine successful-run worker timing files and the failed attempt-2 worker timing file. I read the current `planShards` implementation and independently replayed its exact grouping algorithm in tool orchestration, using those already-read JSON values. I did not execute the production planner or a test runner. A batched filesystem-read script was refused by the Review activity hook as `WRITE_CODE`; it was not executed, and no policy bypass or demotion followed. Explicit permitted file/Git reads and offline arithmetic supplied the review.

The following checks succeeded:

- The replay has **298 paths, all unique**. They exactly equal the union of the nine successful receipts and all 298 integration test paths enumerated from the unchanged checkout. There are no missing or extra paths. The prior exact-M canonical discovery was 1,005 unit + 298 integration + 57 slow = 1,360; this source identity is unchanged.
- The independent algorithm reproduces **all nine ordered receipt inventories exactly**, not just their counts. Counts are 34 followed by eight groups of 33.
- All nine successful workers have zero file statuses. The inspected aggregate identifies source/tested commit M, run `42148747885`, attempt `1`, nine distinct successful workers and count 298. The retained provenance identifies a completed successful `workflow_dispatch` run at M. These are inspected retained artifacts, not a newly fetched or executed CI qualification.
- Attempt 2's ordered group-2 inventory exactly equals the prior group-2 inventory, all 33 statuses are zero, and measured serial elapsed is **810.8272 seconds**. The complete raw log records the unchanged 600-second refusal and exit code 1 at lines 1015–1018.
- For **all eight candidates in the replay**—9, 10, 11, 12, 15, 18, 24 and 32—the independently computed group sizes, rounded successful and mixed per-group costs and maxima exactly match the artifact. Each retains all 298 paths exactly once and is deterministic under reversed discovery. Higher cardinality is not monotonically faster under count balancing: the eighteen-group mixed maximum is 512.5 seconds, worse than twelve.

| Groups | Successful-cost maximum | Mixed-cost maximum | Mixed margin below 600s |
| --- | ---: | ---: | ---: |
| 9 | 557.0s | 810.8s | -210.8s |
| 10 | 541.1s | 582.8s | 17.2s |
| 11 | 538.9s | 540.1s | 59.9s |
| 12 | 478.3s | 499.4s | 100.6s |
| 15 | 476.8s | 486.3s | 113.7s |

The successful same-run serial measurements are 513.2847, 557.0269, 95.1193, 140.3110, 376.0444, 190.4880, 433.8087, 220.0429 and 372.0501 seconds. Summed measured serial work is approximately **2,898.176 seconds, or 48.30 runner-minutes**. The mixed model substitutes the failed retry's group-2 costs and raises that sum to approximately **3,151.976 seconds, or 52.53 runner-minutes**. Shard count redistributes those modeled costs; it does not eliminate them. Three additional integration jobs add checkout/install/quality/artifact overhead not measured by these per-file sums.

The successful run provenance spans approximately **11m02s** from run start to update; that is an observed historical run span, not a guaranteed next completion time. The exhausted failed-only retry spent **13m30.827s in its serial phase alone**, before setup/teardown. The plan's 15–30 minute cloud allowance and 2–4 hour joint-work estimate are reasonable planning envelopes, not qualifications or guaranteed caps. They must not become permission to retry until green.

## Timing decision: twelve groups versus heavyweight fixtures

I support A as the smallest evaluated candidate that supplies about 100 seconds of headroom in both supplied models while preserving existing runner semantics. Ten's 17.2-second mixed margin is weak. Eleven's 59.9-second mixed margin is materially smaller. Fifteen adds twice as many jobs as A for only about 13.1 seconds more mixed margin. C really would change the runner: `scripts/run-tests-schedule.mjs:104` runs one serial array and returns one serial duration; `scripts/run-tests.mjs:404` evaluates that whole serial section against the unchanged ceiling. Arbitrarily restarting it per file is not an existing supported option.

However, A is **an experiment supported by these observations, not a robust slowdown guarantee**. The mixed model retains successful costs for eight old groups and substitutes only the measured failed group's 33 costs. It does not model a uniformly slower environment and is not a confidence interval. The largest baseline file is `scripts/tests/integration/task-tracker/inflation/retired/after.test.mjs` at **465.2578 seconds**. Attempt 2's group-wide ratio is **1.4556338×**; applying it hypothetically to that file gives **677.245 seconds even alone**, and to the modeled twelve-group baseline maximum gives roughly **696.23 seconds**. Even applying the first failure's approximately 1.24733× ratio uniformly to the 478.3-second maximum leaves only about **3.40 seconds** below the ceiling. These are explicit stress calculations, not observed outcomes for the other files.

Therefore no matrix count can demonstrate tolerance to the second uniform stress scenario while that file remains indivisible. A genuinely durable response to that scenario requires a separately reviewed reduction or partition of heavyweight fixture/case work. The present plan correctly keeps that decision conditional on actual candidate qualification and forbids silent broadening. I do not require the larger redesign now: we have incomplete evidence about correlated host slowdown, not proof that every future group suffers the same ratio. Root should authorize A only with that risk understood and the stated stop rule preserved.

The acceptance test is a fresh **complete same-attempt run** at the amended exact head, all unit/integration/slow groups and unchanged per-worker ceiling checks included. A model, local green assertions or a passing isolated retry cannot replace it. Any further relevant required-check failure remains a failure and returns for the bounded decision described at plan line 37; do not reuse old workers or relax the bridge.

## Current and historical source domains

The plan's old-three/old-nine refusals apply to the **new current-source reader requiring twelve integration groups**. They must not be generalized into invalidating selected immutable artifact 890's own historical reader.

I independently read `890184:scripts/maintenance/verify-ci-receipts.mjs` through the current repository's Git objects. It requires three groups for integration/slow and one for unit, with the corresponding fixed historical download set. The current M reader uses `LANE_GROUPS.integration = 9` at `scripts/maintenance/verify-ci-receipts.mjs:12`; the amendment changes that current constant to twelve. In `scripts/task-tracker/verbs/test.mjs:482`, sandbox creation pins `ref` to `artifactSubject.commitSha`, and at `:1734` execution is wrapped by `withArtifactSource`. The selected source actually supplies its verifier and cwd; actual operator context remains distinct.

Retain this explicit contract in the reviewed amendment: current amended source refuses 3/9 receipts, immutable historical source 890 uses its historical 3-group verifier through genuine selected-source execution, and neither result qualifies the other source. No compatibility branch, copied receipt, modified historical Git object, reinterpretation of current twelve-group evidence as old-source evidence, or current-reader substitution is justified. This is a design constraint within the existing four/five-file proposal, not a request for new runtime functionality or live #2161 activity.

## Authority and completion sequence

The actual source supports the proposed native path. `scripts/task-tracker/verbs/demote.mjs` permits Review/Test-to-Develop only for declared code rework; its directory invalidation at `:224` returns invalidated `test`, `review` and `approval` at `:238`. The legacy path also strips invalid evidence. The reviewer neither called it nor assumed admission. Root authorization and current native plan authority must precede implementation; if the supported path refuses, retain the refusal and reassess.

Deliver resolves the current Test/review/approval source before preflight (`scripts/task-tracker/verbs/deliver.mjs:1200`). The changed-source intent creation at `:2147` uses `supersedesIntentId: live?.record.intentId`, followed by append/readback and fresh authority checks. This supports native supersession after genuine new-head approval. It does not authorize manual intent edits or reuse of M's old approval.

Attempt 2 is a failed PR-check observation, **not a replacement for, or retrospective revocation of, the existing genuine full-M native Test receipt**. A later code-rework demotion will invalidate authority through the normal native mechanism. The earlier exact-M source review remains intact; the amended head needs its own source review, complete CI, native final/AC/VC/Test, Review and approval. Root retains provider-merge authority, and #2147 remains outside this scope until #2165 is actually delivered.

The plan correctly avoids starting the serialized Test gate before fixed source and exact-head CI qualify. The finite cost is the owned regression work and review plus complete cloud qualification and one native evidence/approval cycle. If qualification fails, the promise of one cycle is not met and the next step is an explicit bounded decision, not automatic additional Test cycles.

## Required response and recommendations

Resolve CI-PLAN-R1-F001 in the plan, identify its exact new hash and return an author disposition in this same design/plan phase. Preserve the evidence and supplied replay bytes. Carry forward the explicit source-domain and stress-model limits above in the reviewed amendment. No source implementation is authorized by this report; Root's provisional preference for A is not a replacement for final plan acceptance and rework authority.

## Declined to judge

- **Actual twelve-group runtime success and timing stability:** no candidate source exists or was executed; only offline projections are reviewed. Fresh complete same-attempt CI must establish the observed outcome.
- **Future heavyweight fixture/case partition design:** considered because the largest file defeats the uniform slowdown scenario, but deferred under the plan's explicit stop-and-return decision. No fixture refactor or runner redesign is preapproved.
- **Statistical host-performance guarantees and global cost optimization:** the data contains one complete successful environment and failed observations from one group, not a population or concurrency forecast. Three additional setup costs and hosted contention are not quantified by per-file sums.
- **Current live authority, actual native receipt validity and provider status:** relevant source and retained evidence were read, but no live network/native authority was fetched. The existing full-M Test remains distinct from the failed-only PR retry; this report neither replaces nor edits it.
- **Actual #2161 recovery and immutable artifact 890 execution:** the required source-domain contract is reviewed, but no sibling checkout or live recovery operation was used. Genuine selected-source qualification remains future coordinator work.
- **#2147 integration, new issues or further trunk movement:** sequencing is acknowledged only; this phase retains exact M/962 and does not authorize additional source integration.
- **Historical CI/provider/model authentication:** file hashes, inventories and arithmetic are independently checked; the old provider events and declared reviewer model are not freshly authenticated, and no sealed peer-review receipt is claimed.

## Assessment

**Design/plan verdict: REVISIONS_REQUIRED — one Important boundary contradiction, no Critical or Minor finding.** Option A is technically coherent as a bounded observed-performance experiment once its regression ownership is made concrete. Its timing limitations are real and appropriately require complete qualification plus a stop condition.

**Ready for implementation: No.** A revised exact plan must receive `NO_CHANGES_REMAIN`, followed by Root rework authorization and successful native admission. This remains the design/plan phase across revisions. Source M and tree stayed unchanged and tracked status remained clean.

## Additional evidence and source pins

All values below were read with `shasum -a 256` during this review. Paths are relative to the sole checkout above.

| Path | SHA256 |
| --- | --- |
| `.scratch/plan/2165-prci-group2-diagnosis.md` | `2a2f22eab7e61b5e68ea6d5317979cc94e3fe226b88bf665ef489dbb53d9d473` |
| `.scratch/plan/2165-prci-attempt2-group2-complete.log` | `b4aae76ae9c840ee999a6e804e9bd8c1b9a932e048e8109b99e4690b18199c2e` |
| `.scratch/ci-receipts/42153182575-2-failed-group2/test-timing.json` | `2b5ccc93598f5615463775c1002ebbed7d06494c1d1f7a89e786cc401fdc11ec` |
| `.scratch/ci-receipts/42148747885-1-hlZF09/provenance.json` | `0975b0e3b07c3b9678f12f0cad006b884fdb457646668a93194c6ef9136ef44c` |
| `.scratch/ci-receipts/42148747885-1-hlZF09/ci-fast-receipts-1/integration/lane-receipt.json` | `f0781fac78525e95533cd1202bc6b751e7285e0c4bfcce3b8824ee236ceea20b` |
| `.github/workflows/ci.yml` | `55a5dad689c4ca63b2cb40821b367e16cc5a07069e7571c11e04ae7d9b433d25` |
| `scripts/maintenance/verify-ci-receipts.mjs` | `2c6404167920931da2a6d02de577440856ae6fb314e8ed161495608ca060071a` |
| `scripts/tests/unit/task-tracker/core/verify-ci-receipts.test.mjs` | `50c72fb4a36ebd6e71445c9fb6d0a13c4ad0994aef1a4ded93aa3beb001ebdd6` |
| `scripts/tests/unit/task-tracker/core/ci-test-shards.test.mjs` | `1c2716e46e151c94548d12996df0457988dfc5990217660609890093d1ed5294` |
| `docs/guides/test-lane-taxonomy.md` | `e16d897fc10d67039a589c94619481d9ee9bba3d501217a37907f116dbfcf0e8` |
| `scripts/run-tests-shards.mjs` | `37feff8df2bb77959cab1c05056e689d2c2c49df8328798ea123193d50ad7dbe` |

Successful worker timing pins under `.scratch/ci-receipts/42148747885-1-hlZF09/ci-integration-N-1/test-timing.json`:

| N | SHA256 |
| --- | --- |
| 1 | `4dd0af564bb5a8d04f82df7ad80ea25d1a90c2a22ac7f9782c3b816c401f2a41` |
| 2 | `0d3882d2bae7b1789c03977814a98dd416fffeef52ef1c2635afc7c1d90af515` |
| 3 | `9fc24c30d738110a042da923ad0aa1ce833e1dbcf746b4427f52dc4b26284f7c` |
| 4 | `9f75aa6a9582b65e29a47f3b2f382402fcbd6666bb1293a938d4b99d2bcddf5c` |
| 5 | `8b78c1d87e1e1b548da6c99d414c4d5a35f25477d1bd3f667935d38641baa07b` |
| 6 | `0b03e1620b2434d6066497f540496c2fe6ff77846a2c3b91e701b5eb8de09865` |
| 7 | `81983770fff217a28ba88c9e0946a088c2e04bd6aaa2b4ba4dc83541880cf2aa` |
| 8 | `ab6dcf6ea8106842208a8185ea343a1ae68616558dd4128e85232a901a460c07` |
| 9 | `f6f1d448a0f899556969bbecbac7a4f68a6a12abe3be06be25ca83496a502b00` |
