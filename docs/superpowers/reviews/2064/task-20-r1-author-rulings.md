# Task 20 / #2064 R1 author rulings

Reviewed candidate: `a36599affe973749b6728aba1942b6d8dcabf512`, relative to base `47dc94bdcd84072ba2889d22716c69b051f99dd7`. The complete independent Sol / medium R1 response is retained byte for byte in [the raw review](task-20-r1-full-review.raw.txt). Its SHA-256 is `9b082c9ab96e54f3dd1a9f96c57af0cf6390db4dc2c1daeeb275cfa083af46a5`; the original and archive hashes match. No review content was truncated, rewritten or represented as independent execution beyond the reviewer's stated scope.

## Strengths

1. Accepted synchronous store API and reconstructed raw bundle: retained. The repair preserves `evidenceStore.read(manifestDigest)` and `{manifest, planBytes, payloads}` replay.
2. Every retained payload replayed and supplied projections distrusted: retained. The new policy check covers every validated retained record, including inactive ancestors.
3. Explicit host/repository/issue/digest correlation and unavailable without network fallback: retained. No identity check or unavailable handling is weakened.
4. Ancestry, corruption, Unknown and physical-store coverage: retained. Existing unit and integration regressions remain; the new cases extend provenance coverage.

## Issues

### Critical

None found by the reviewer; no critical repair is claimed or inferred.

### Important 1: derived-record model/policy disagreement

Accepted and verified against the current source. `validateLocalEvidence` validates derived wrapper policy shape but does not compare it with the manifest. `local-runtime.mjs` lines 99–104 already requires that comparison for every retained derived-local record and uses the concrete reason `derived-model-policy`. The reader previously omitted it.

Eight new negative cases construct valid retained hashes and exact snapshot references, then vary modelVersion or policyVersion independently on an active rubric, active outcome, inactive rubric ancestor and inactive outcome ancestor. The accepted provenance validator still accepts each raw bundle/snapshot correlation, establishing that these are policy-only mismatches. Before the repair, all eight incorrectly returned resolved. The full unit RED was 35 passed / 8 failed / 43 total. The matching-policy positive control already passed.

The minimal owned reader repair compares canonical model/policy data for every retained derived-local record with the manifest before returning it, using the accepted `derived-model-policy` unavailable reason. The full unit GREEN passed 43/43, including all eight negative cases and the positive four-record active/inactive case. Full raw RED/GREEN rounds remain in the task workspace as `raw-2064/r1-derived-red.log` and `r1-derived-green.log`.

### Important 2: shared package inventory blocker

Accepted and unresolved in this worker's scope. The retained original full-fast receipt measured 967 packed entries against 965. Physical-test relocation did not fix it. The root owns serialized exact module registration and measured adjustment, followed by combined-head gates. No shared inventory edit, broad ceiling increase, suppression or waiver is included in this repair. Targeted passes do not waive the blocker.

### Minor

None identified by the reviewer; no minor repair is claimed or inferred.

## Recommendations

The recommendation to repair derived-local provenance is implemented in the owned reader with TDD and all-retained coverage. The recommendation to preserve the package blocker is followed: acceptance remains blocked pending the root's serialized registration and aggregate verification.

## Considered and declined

1. Legacy v1/v2 reads and current-schema activation: agree with the decline; Task 21 / #2065 remains the owner. No migration or activation was added.
2. Current selected-plan/configuration freshness: agree with the decline; this interface resolves retained forecast inputs, while current-selection admission remains at calculation/publication boundaries.
3. External truth, cloud grants and lifecycle approval: agree with the decline; structural replay claims none of those authorities.
4. Asynchronous evidence stores: agree with the decline; the actual accepted API remains synchronous. No invented asynchronous adapter was added.
5. Frozen returned forecast objects: agree with the decline; the detached snapshot contract is preserved without adding an immutability requirement.
6. Forecast selecting only some active outcomes: agree with the decline; comparable subsets remain valid. The repair checks policy on all retained derived records without requiring every active outcome to be selected.
7. Byte-identical duplicate descriptors: agree with the decline; accepted upstream deduplication remains unchanged and conflicting bytes remain refused.
8. Repeating broad suites: agree with the reviewer's scoped R1 decision, which did not independently rerun unchanged broad suites. This author repair changes product code, so a new full fast run and final lint/format are required and their actual outcomes will be recorded separately. No old receipt is presented as a new exact-head run.

## Assessment and limits

Agree with the R1 verdict: not ready to merge. Important 1 requires fresh independent R2 review of the repaired frozen candidate; Important 2 remains the root's integration blocker. This is not CODE_COMPLETE, native Test/Review/Close approval, or merge authority.

The reviewer independently reproduced the in-memory provenance defect and checked exact range, clean Git and whitespace. They inspected author receipts for verifier35, purity9, compatibility160, lint/format, trace, Stop and released occupancy. They did not independently execute whole suites, combined-head CI, network/native lifecycle or acceptance verification. Those limits remain intact. Author executions are listed separately in the task report and cannot be attributed to the reviewer.

The root additionally requested the final declared verifier both normally and with `AI_TASK_MANAGER_PROJECT_DIR` set to this worktree to test outer-root compatibility. Both actual runs passed 44/44, including the physical native-store case, with the alias set exactly to `$PWD` in the stress run. No fixture edit or production-root weakening was necessary. The corresponding complete raw logs are `r1-verifier.log` and `r1-outer-root-verifier.log`; purity passed 9/9 and the accepted compatibility command passed 160/160. These are author executions, distinct from the reviewer's limited reproduction.
