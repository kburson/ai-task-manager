# #2059 R1 author disposition

Status: CODE_COMPLETE after author repair; fresh independent R2 is pending.
Reviewed base: `0efa34da8e6c5926fcbec0784b9e789d873d40a8`.
The repair commit is the commit containing this disposition; its resolved SHA and native commit trace are supplied in the final handoff.

The full independent review is preserved without changing any byte in [2026-10-22-2059-review-r1.raw.txt](2026-10-22-2059-review-r1.raw.txt).
SHA-256: `d26df8638f87af69303293dc0549b9766bf12964f0230f8306202422819e897c`.
The original controller scratch Markdown remains unchanged.
The `.raw.txt` extension follows the controller's explicit immutable plain-text evidence ruling; no spelling directives or normalization were added to the raw review.

## Important findings: complete repair dispositions

### I1 — Existing checked labels can launder completion into a different section

Accepted as an authority defect, including the shared native-helper effect and every repair recommendation in the full raw finding.
The prior global checked-line multiset treated completion elsewhere as authority for a different promise.
The exact P1 body pair produced zero native checkbox offenders before repair.
The shared helper now identifies a promise using its heading ancestry, repeated-heading visit, visible line identity, and same-label occurrence within that section.
Only the corresponding previously checked occurrence can remain checked without new proof.
A same-label occurrence elsewhere does not supply authority, including when the original checked occurrence is removed or unticked.
The default native mode still detects moved/changed existing promises; the staged strict mode also guards wholly new checked promises.

Focused tests cover the exact Scope-to-AC transfer, removing the checked source, inserting a checked target in another section, exchanging same-section duplicate occurrences, and repeated section headings.
The shifted-line regression and unchanged duplicate-label regression remain green.
The staged composite itself must reject each unauthorized case, in addition to the direct native-helper assertion.
The recommendation to preserve legitimate unchanged duplicates is therefore implemented without the global allowance that caused I1.
Cost of an incorrect correspondence is either false completion or conservative rejection; the added boundary tests address both outcomes within this task's scope.

### I2 — Native reviewed line numbers are used against unnormalized raw bodies

Accepted in full: both the local raw-checkbox comparison and the final raw-line reversal used the wrong coordinate system.
The native capability is genuine; its returned index refers to the normalized string, not to the original bytes.
The pre-repair native-coordinator fixture accepted the exact delta and then staged validation refused `unverified-ticks` for the blank-line variants.

The adapter now resolves the native returned target in a read-only normalized projection, obtains its unique native target label, and resolves that target separately against each original raw body.
The retained operation stores the original before/after target lines and actual raw candidate index.
The checkbox exception uses that raw index, and composite reversal replaces the exact retained raw line.
Native capability validation is still repeated after reversal against the final candidate scope.
No raw body is normalized or reconstructed to make indices agree; legacy marker bytes, surrounding whitespace, and unrelated blank-line runs survive unchanged.

Positive tests use the real coordinator-minted capability for ordinary bytes, three newlines before the policy, a legacy body-version marker surrounded by whitespace, and the marker combined with blank-line runs.
Every variant additionally appends an unrelated later edit to exercise final reversal.
Each fixture asserts that replacing only the approved target line restores the exact original body.
Serialized tokens and changed target/delta tests are preserved.
The cost of a wrong identity mapping is improper authority or rejection of a genuine operation; native unique-target resolution and the raw-byte assertions bound that risk.

## Every remaining review item

The following tables disposition the entire review, including favorable findings and boundaries. No table row claims aggregate acceptance or independent verification that was not performed.

### Spec compliance

| Review item | Author disposition |
| --- | --- |
| Initial noncompliance caused by I1/I2 | Accepted as the reviewed-head result. Repaired as above; final acceptance awaits independent R2. |
| Assigned files/interface and preserved exports | Retained. Repairs touch only assigned production/test files plus the requested review/report artifacts. No parallel or public adapter source changed. |
| Exact operation chain, local-before-composite validation, no broad permissions or mint API | Preserved. Existing chain, malformed-capability, serialization, and decomposition tests pass in the named verifier. |
| Cannot verify complete accepted schemas, caller census, provider budgets, lifecycle admission, transition publication, delayed-write recovery, dirty manifests, full fixture matrix | Accepted as a task-review boundary. Those claims remain outside this repair and require controller/aggregate evidence; no new whole-contract claim is made. |
| Known packed count 970 versus 969 | Not repaired here by explicit ownership direction. Shared inventory stays read-only; controller owns serialized repair and exact integrated-head CI. |

### Strengths

| Review item | Author disposition |
| --- | --- |
| Own-data descriptor checks and separate native capability forms | Preserved unchanged; no permission bag or accessor grant was introduced. |
| Marker/section/legacy/proof integrity and cumulative-shrink test | Preserved. Existing semantic regressions remain in the named verifier. |
| Exact authorized-delta reversal, native revalidation, live decomposition context/lock | Preserved, with I2 correcting the raw reviewed-target correspondence. Decomposition lifetime remains unchanged. |
| Genuine native tokens, serialized/expired refusal, delegating test hook | Preserved. Four reviewed-byte variants still use the actual coordinator and native validators; no replacement token or validator was added. |
| Report disclosures of package failure, overwritten log, setup failures, lifecycle diagnostics, activation limits | Preserved in the implementation report and carried below. The disclosures remain limits, not evidence of independent acceptance. |

### Other issue classifications

| Review item | Author disposition |
| --- | --- |
| No Critical issue found within the reviewed task | Recorded as the reviewer's bounded finding, not a proof that no further defect exists. |
| No additional Minor polish finding | Accepted; no unrelated polish was added. The I1/I2 boundary coverage is part of the Important repairs. |

### Focused cross-contract checks and probes

| Review item | Author disposition |
| --- | --- |
| Genuine WeakMap authority but normalization/index mismatch | Confirmed by the real coordinator tests; addressed by I2's raw target mapping. |
| Native decomposition validators and default section/shrink constraints establish no additional defect | Preserved. Relevant decomposition/native body regressions were rerun; no expansion of native capability lifetime or defaults was made. |
| Task 4 and capability/caller constraints read; reviewer did not independently resolve pins/cloud state | Scope accepted. Existing authoritative pins remain in the implementation report; this repair does not claim a new reviewer Git/cloud verification. |
| Diff package read once in full; unchanged root checks and worker probes; no Git/network/lifecycle/source mutation or suite rerun by reviewer; sole reviewer write was report | Preserved as reviewer provenance. Author tests and commits are separately recorded and do not change what the reviewer performed. |
| P1 exact command/output: staged cross-section completion returned true | Accepted as real RED evidence at the reviewed head. The author's exact body-pair regression independently failed with zero expected native offenders, and now both helper and staged assertions reject it. |
| P2 genuine native capability returned normalized index 3 versus raw index 4 and staging refused | Accepted as real RED evidence. The author's real coordinator blank-line test reproduced `unverified-ticks`; the same candidate now passes without rewriting raw bytes. |

### Evidence, recommendations, declined boundaries, and limitations

| Review item | Author disposition |
| --- | --- |
| Reviewer inspected complete report/excerpts; prior 16, 105, and 75 passes were author/controller evidence, not reviewer reruns | Accepted provenance distinction. This repair supplies new author runs; none is described as independent review. |
| Neither focused probe substitutes for regression runs after repair | Implemented: the named verifier and relevant native unit/staging regressions were rerun after both fixes. |
| Intermediate 994/995 run preceded later scope fix and is not final green | Preserved. The 995-file suite was not repeated to reproduce its known inventory failure; whole exact-head verification remains controller work. |
| Do not widen the inventory budget just to silence 970/969 | Followed. No shared inventory/budget/guard file changed. |
| Earlier standalone 15/15 physical log overwritten; transcript only, unique 16/16 retained; reviewer did not reconstruct it | Preserved. No reconstruction or retrospective physical-capture claim was made. R1 raw logs use unique names. |
| Native capture diagnostics and install vulnerabilities/script warning limit pristine execution evidence, without an established extra task defect | Preserved: `invalid-inherited-context`, `soft-byte-cap`, `soft-file-cap`, initial action-capture gap, 14 dependency vulnerabilities, and the blocked optional Puppeteer install script remain disclosed. No dependency/capture repair or complete transport accounting is claimed. |
| Opaque execution-proof producer authority absent; refusing boolean authority is conservative and does not complete producer integration | Preserved. New execution-proof introductions remain refused; no producer integration or permission token was invented. |
| Public activation, persistence retention, asynchronous freshness, unchanged adapter refusal are separate integration work | Accepted boundaries. This repair does not activate public adapters, persist authority, refresh cloud state, or prolong native capability lifetime. |
| No full transport/budget matrix, live issue admission, freshness, slow lane, package rerun, source repair, reviewer spawning, aggregate review by reviewer | Preserved as reviewer scope; author source repairs and limited regression runs are explicitly separate. No broader independent claim is made. |
| Reviewer did not independently verify lifecycle state, external raw logs, final integrated source | Accepted limitation. Worker native binding remains separately recorded; final integrated-source authority remains with the controller. |
| Add exact I1/I2 regressions and existing body/reviewed regressions, then fresh scoped review | Implemented author regression portion. Controller will dispatch independent R2; this author did not spawn a reviewer or claim acceptance. |
| Controller final integrated inventory and CI after serialization | Retained as required controller work; not marked complete by this repair. |
| Assessment: spec issues, task needs fixes; both failures central, activation/aggregate boundaries separate | Accepted as the R1 reviewed-head assessment. Both concrete findings now have semantic RED-to-GREEN author evidence; fresh R2 must judge repair quality. |

## Repair evidence and exact limits

All new raw logs are unique files under this worker's `.scratch/2059/`:

| Evidence | Result | SHA-256 |
| --- | --- | --- |
| `r1-red-all-boundaries.log` | 24 tests; 17 passed, 7 failed before repair | `e4a5b4359b3f21e15e9f693ff96196d81b9f5a7d7e33e3f3447c26cdadce11a8` |
| `r1-green-I1-red-I2.log` | I1 fixed; 22 passed, 2 I2 failures remain | `7108eea502940ec9b8788fc02ff4f1615a18de0f044c7f04001ceab135e40ba6` |
| `r1-green-all-boundaries.log` | Both repaired; 24 passed, 0 failed | `fceec2cdeed62766eef8f577d45981bfadbd8ad084e5797ce08ec2c131baab9a` |

The first attempted test-write command was refused before execution because the command scope parser read a regex assertion as an outside path. The equivalent literal error-reason assertion passed ordinary worker guards; no actual source/binding refusal was bypassed.
Native regressions passed: `r1-native-unit-regressions.log` reports 105/105, and `r1-native-stage-integration.log` reports 75/75. Package format passed in `r1-package-format.log`. Initial R1 lint stopped on one authored-prose spelling issue, corrected without altering raw evidence. Final lint, exact commit, and trace outcomes are recorded in the implementation report and final handoff after completion.
No native Test, Review, approve, Close, delivery, root/peer source change, whole-suite-green claim, or reviewer dispatch was performed.

Final R1 author results: named verifier 24/24 (`r1-target-final-24.log`); native unit regressions 105/105; staging integration 75/75; package lint passed (`r1-package-lint-final.log`); package format passed (`r1-package-format.log`). Exact P1 now refuses, and the native-normalized/raw pairs are pinned to 3/4 for P2 and 5/8 for the combined legacy/blank-line boundary, with exact original byte preservation and successful later-edit reversal. The implementation report records the final raw hashes. Final owned-file lint/format checks cover later report/test-assertion edits. These are author results, with independent R2 and controller integration still pending.
