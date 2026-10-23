# Issue 2048 implementation and review evidence

## Candidate and authority

Source candidate: `4fd03020d39a2c0c1bd5a303e99bdfdb6881f585`.
Source base: `c0ca120cc8a08d3bc74887daac5ba1f50b436fce`.
The candidate changes exactly two owned files:

- `scripts/task-tracker/lib/story-cache/completion-receipt.mjs`.
- `scripts/tests/unit/task-tracker/lib/story-cache/completion-receipt.test.mjs`.

Task 25 is pinned to active-plan commit
`0ad57329a5eb4e3aec395adb06a6216178e45c87`, original technical Task 9 at
`f2894455a97bb80f6afb82ce5ff722cad2a46c2b`, and specification
`dafb1d276036ddc17490f76329f6aa2c09732a15`. The local estimate remains S / 3h,
with no cloud history or calibration used for estimation. Predecessor #2061
is Done. #2047 is also Done but is not a dependency of #2048.

This record is required review collateral authorized after the source commit.
It changes no product code, tests, shared package inventory, configuration,
workflow consumers or runtime authority. Native Test, final acceptance and
exact-head CI remain pending. No Test, Review, approval, Close, Stop, push or
controller integration is authorized in this collateral task.

## Delivered behavior and source census

The primary `validateCompletionReceipt(receipt,{transition,confirmedEffects})`
validates original frozen completion evidence. It binds the supported receipt
schema, native executable non-noop transition, actor, positive visit, actual
provider identity, original resource digest, complete pending event subset
and attempted/confirmed prerequisite effects with matching candidate digests.
The historical companion takes original confirmations separately from a full
current `{manifest,generation,payloads}` record. It validates the current
published timing content and exact historical subset without equating the old
resource digest with today's full-comment hash. Working bytes and the latest
batch cannot replace original confirmations.

The predecessor `freezeTimingCandidate` consumes the full verified record;
confirmation retains the original batch baseline even as individual published
resource baselines advance. This slice keeps that contract. Both validators
are pure consumers of supplied evidence correlation. They cannot authenticate
a caller-created confirmed-outcome object, grant mutation authority, certify
provider freshness or independently reconstruct the original pending versus
published partition from baseline bytes.

Before implementation, neither owned file nor the validator existed. The only
new consumers are the named unit tests. Existing `batch.mjs` remains the
production consumer of `freezeTimingCandidate`; legacy transition-commit
readers are unchanged. No publisher, recovery, coordinator, reader or public
workflow route was activated. Original frozen confirmation retention is a
future coordinator obligation, not an archive inferred from current storage.

## Verification at the source candidate

The author executed the following checks. These results are distinct from the
reviewer's static assessment. Full raw logs, including failed attempts, are
retained in `evidence/` with compressed and decoded hashes and byte sizes in
`evidence/2048-manifest.json`. Exit statuses are native tool completion results
recorded in the capture index; none is inferred from a green-looking tail.

| Check | Actual result | Raw artifact |
| --- | --- | --- |
| Exact named unit after source commit | Exit 0; 36/36 | `2048-standalone-post-commit.log.gz` |
| Final receipt/timing-candidate/batch/timing-events group | Exit 0; 139/139 | `2048-targeted-final-v2.log.gz` |
| Final full fast lane, `npm test` | Exit 1; 1001/1002 files passed | `2048-npm-test-final.log.gz` |
| Final slow lane, `npm run test:slow` | Exit 0; 57/57 files passed | `2048-slow-final.log.gz` |
| Final full lint | Exit 0 | `2048-lint-final.log.gz` |
| Final full format check | Exit 0 | `2048-format-final.log.gz` |
| Staged diff check before source commit | Exit 0 | Native transcript; no raw file captured |

The sole final fast-lane failure is
`package-boundary: total entry count stays under the ceiling` in
`package-boundary.test.mjs`: measured 978 packed entries exceed the unchanged
977 ceiling. This is the expected one new runtime module. The shared inventory
remains read-only. Controller-owned integration needs exactly +1 allowance
and an inclusion assertion for `completion-receipt.mjs`, subject to any other
subsequent package changes. No full-green suite or waived inventory gate is
claimed. Test and final review evidence are still required.

The slow lane's actual completion exit is 0, with all 57 files passing; its
recorded bounded sections total 463.9 seconds. This was observed by the author
and later inspected by the controller. The reviewer did not observe that run;
their original unverified-slow statement remains verbatim in the raw report.
No full tests are repeated for this documentation-only collateral.

## Failed trials and evidence limits

The initial and corrected missing-validator runs both exited 1. The corrected
run had 0/28 passing because the APIs were absent. The first implementation
trial had 24/28 passing: four negative tests attempted to mutate immutable
store readbacks before reaching the validator. Cloning only the negative
fixtures corrected those test failures; the next run passed 28/28.

A legacy-row compatibility test then failed 1/2: exact equality with all actor
rows was stricter than the accepted predecessor contract. Matching expected
native-row multiplicities preserves unrelated historical rows without granting
them new receipt proof. That run and the later 30/30 run are both retained.
The synchronized table/event tampering and unpublished-working-view trials
passed 2/2 and are retained separately.

Adversarial prerequisite tests exposed missing comment target/provider and
typed field-value validation. One first trial also had an unrelated
`DataCloneError` from copying fixture functions. That setup error was corrected
separately; the corrected comment-target trial still observed the missing
expected refusal. All failed tests and the later green results remain retained.
Fixture exceptions are not represented as behavioral RED proof.

The first fast lane also had only the inventory ceiling failure. Earlier
lint, format and targeted runs preceded the final hardening; the final logs
are explicitly distinguished. No failed trial was replaced or omitted.

## Independent reviews and author dispositions

Reviewer: independent GPT-6.1 Sol / medium, `/root/review_2048_contract`.
The contract audit inspected pinned requirements and predecessor contracts,
with no implementation authorship, working-source reads, tests or mutations.
Its full verbatim report is
`2026-10-23-2048-contract-audit-raw.txt`.

An initial actual-source review attempt was refused by native filesystem scope
before any 5dc6 file/hash read. That refusal was honored; no permission change,
external copy, alternate transport or outside-root retry was performed.
After the candidate was committed, the reviewer inspected those committed Git
objects within their permitted b187 context. This is a separate legitimate
source observation, not a claim that the refused filesystem read succeeded.

The full actual-source report is `2026-10-23-2048-review-r1-raw.txt`. It identifies
no Critical findings, no established Important finding within the slice and no
required Minor change. It accepts the exact source candidate conditionally on
controller verification and integration. It is static review only: no tests,
native actions or mutations were executed by the reviewer. The controller
reported accepting that exact source review; collateral, native Test, final
acceptance and CI remain pending. The assessment does not cover future edits.

`2026-10-23-2048-author-rulings.md` exhaustively records the two implementation
decisions, every contract-audit requirement, source-review strength, test
assessment, recommendation, declined boundary and stated limit. No source
change was required by that review, and no deferred minor was identified.

## Native provenance and remaining work

`2026-10-23-2048-native-provenance.md` retains actual SID/root/branch/HEAD,
original consumed observations, eight-field CLI/hook matches, native action
exit observations and the loaded-guard versus invocation-source distinction.
The diagnostic proof is not cryptographic attestation or mutation authority.

Source commit, native commit trace and source-turn Pause all exited 0. Pause
reported Unknown active duration, wall 18 minutes and +731 words. A later
post-Pause optional ledger append was refused because the binding was inactive
and stayed unwritten. It is not retried. This separately admitted review
collateral is a new authorized documentation task under the resumed binding;
it does not alter that denied ledger or treat it as having succeeded.

The source-turn Git checkout was clean. All root AC/VC/DoD checkboxes remain
unchecked. Current collateral-turn Start and Explain exited 0. Explain blocks
promotion with `develop-exit-code-complete` /
`code-complete-ac-evidence-incomplete` for the unticked AC and warns
`test-develop-finalization-pending`; no state action is attempted.

Remaining controller work: review this committed collateral, integrate the
shared package-inventory increment in the proper bound context, obtain final
suite green and exact-head CI, and perform later native Test/review/acceptance.
This report neither invents authority markers nor claims epic completion.
