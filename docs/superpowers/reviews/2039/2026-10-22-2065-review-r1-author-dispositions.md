# #2065 R1 exhaustive author dispositions

Review identity: Task21, BASE `e6c47dff776e88dc1ae9d80538b11a73cf5f5db7`, reviewed HEAD `a5dee940e1b820743955744b0f04a18dbb1ef09f`. The complete raw review is preserved byte-identically in `2026-10-22-2065-review-r1.raw.txt`, SHA-256 `5f451271d389e48e574ea0f0fb503141975d4191e0a33621c8ccfd54737dd266`. The full artifact was read before edits; these dispositions supplement rather than replace it.

## Verdicts and compliance

| ID | Reviewer statement | Author disposition |
| --- | --- | --- |
| R1-V1 | Spec compliant for the visible bounded Task21 change; strict legacy grids, retained replay/current selection and actual authority/presentation/envelope consumers are covered. | Accepted and preserved. This loop changes no production file, runtime dispatch, provenance validator, package rule or native lifecycle state. |
| R1-V2 | Admitted runtime forwarding, historical fixtures, own helper, compatibility verifier and exact two-module inventory have corresponding hunks. | Accepted. The helper remains the already admitted own fixture utility; no additional helper or source scope is introduced. |
| R1-V3 | No Critical issue found in this task-scoped review. | Recorded as the review's finding, without treating absence of a finding as whole-branch approval. |
| R1-V4 | Task quality Needs fixes because of Important duplication; runtime and focused tests otherwise satisfy the visible contract. | Accepted. R1-I1 is addressed below and awaits fresh scoped R2. The raw verdict remains unchanged. |
| R1-V5 | This is a task-scoped gate, not whole-branch approval. | Accepted. Independent R2, final whole-branch review and controller lifecycle/CI gates remain required. |

## All six strengths

| ID | Reviewer strength | Author disposition |
| --- | --- | --- |
| R1-S1 | `forecast-legacy.mjs` correlates repository, replays predecessor-retained bytes, validates exact selection and returns a detached forecast without turning the supplied forecast into a store. | Preserved unchanged; production bytes are outside this repair. |
| R1-S2 | The compatibility tests cover v1 arbitrary hours, every v2 published-grid field, strict keys, issue correlation, missing/stale evidence and both authority entrypoints before projection reads. | Preserved unchanged. The named compatibility/model verifier is included in the covering run. |
| R1-S3 | The authority regression mutates a caller payload across the actual await and checks stored forecast and board hours; production uses the replayed snapshot. | Preserved unchanged. No authority code or assertion was edited. |
| R1-S4 | Exact v3 validation precedes the literal `path` allowance; credential values and legacy reads remain guarded, with real envelope/security coverage. | Preserved unchanged. No envelope, secret-policy or security test change was needed. |
| R1-S5 | The retained integration flow drives actual publication and read-back; historical fixture migration uses native render/parse instead of relaxing new creation. | Preserved. The integration cases and claim races passed through the consolidated helper, retaining native render/parse validation and current native creation dispatch. |
| R1-S6 | The implementation report separates overlapping intermediate results from settled-source checks and retains final CI limits. | Preserved. The 996-file fast result and prior slow run remain evidence for their recorded source; neither is relabeled as a run of the deduplicated candidate. |

## Findings and recommendations

| ID | Finding/recommendation | Author disposition and evidence |
| --- | --- | --- |
| R1-I1 | Important: the same historical construction/render/parse block is maintained verbatim in three test families; consolidate it in the admitted own helper without changing scenarios/assertions. | Fixed within the exact admitted four-file boundary. Verified all three pre-edit function blocks were identical. Exported `historicalForecastEnvelope` from `scripts/tests/helpers/task-2065-forecast-fixture.mjs`; `forecastEnvelopeFixture` delegates its historical branch to it. The three test/case files import that export and delete only their local builders and unused imports. Default null predecessor/supersession values preserve the deleted builders; explicit values remain supported for existing integration history. All existing test scenarios and assertions are unchanged. Covering native tests pass 174/174. This is a maintainability repair; no pre-fix runtime failure is claimed. |
| R1-M1 | Minor: the integration target has an 800-code-line soft-review warning at the unchanged hard cap; consider moving setup while keeping assertions visible. | Deferred for final whole-branch disposition, as explicitly directed by the controller. No integration setup or source scope was rewritten for this Minor in this loop. The existing soft warning is retained; its hard cap and assertions are unchanged. |
| R1-M1-scope | Other soft warnings in the log concern unrelated pre-existing files and are not new task findings. | Accepted. No unrelated file or warning baseline was changed. |
| R1-R1 | Consolidate the newly duplicated historical transport builder before approval. | Addressed by R1-I1. Fresh R2 remains necessary; the author does not self-approve. |
| R1-R2 | Keep exact-final slow/aggregate CI as a separate controller gate. | Accepted. No package-wide local rerun was performed solely for fixture deduplication; meaningful covering tests plus native lint/format are used here. Full applicable settled-source CI remains required before Test. |

## Cannot verify, review method and evidence limits

| ID | Reviewer limitation/observation | Author disposition |
| --- | --- | --- |
| R1-E1 | Diff review cannot independently verify final exact-source slow/aggregate CI, native admission/Stop, raw pack provenance or complete global consumer census; clean-HEAD/native trace confirmations were supplied evidence. | Accepted in full. Existing native/read-back/pack artifacts remain available, but are not recast as reviewer-executed verification. Final CI remains pending and the earlier incomplete literal census remains corrected explicitly. The resumed worker remains active, so its prior Stop is historical. |
| R1-E2 | Review identity and full package were inspected in manageable ranges; an initially truncated middle was recovered from package lines 149-390. No Git, network, suite, lifecycle mutation or subagent was used. | Recorded as the reviewer's disclosed method. No additional reviewer execution is inferred. |
| R1-E3 | Inputs were the reviewer template, exact brief, controller constraints/rulings, complete report and full review package; no memory files were used. | Accepted as the disclosed input boundary. The byte-identical artifact records it; the author does not substitute other input provenance. |
| R1-E4 | Focused unchanged lineage/reader inspection supported canonical detachment, host/repository/issue correlation and retained replay. | Accepted and preserved. Those production modules are unchanged in this repair. |
| R1-E5 | Focused provenance/selection inspection and original technical Task7 confirmed explicit v2 base validation and exact selection fields; neighboring constants/exports are outside the bounded Task21 finding. | Accepted. No global schema rename, neighboring export change or legacy-validator change is introduced. |
| R1-E6 | Focused secret-policy inspection confirmed safe keys affect key-name rejection while full envelope credential-value scanning remains. | Accepted and preserved. This loop does not edit the envelope or generic secret policy. |
| R1-E7 | Changed-file reread exception was restricted to authority lines 80-255 to inspect detached-payload publication across awaits; no other changed source was separately reread. | Recorded as the reviewer scope disclosure; no broader independent inspection is claimed. |
| R1-E8 | Existing fast/lint/format/inventory logs were inspected with focused searches, not regenerated; broad warning-search output was truncated, while relevant target/summary lines were visible. This was not a pristine-full-log assertion. | Accepted. Full raw logs remain retained; the report distinguishes reviewer inspection from author execution. The target's Minor warning remains deferred. |
| R1-E9 | Earlier fixture mistakes, transient line-cap refusals and capture warnings are historical observations; no exact-final slow success, complete native capture or cloud call-count claim was made. | Preserved. No historical raw evidence was erased or relabeled. |
| R1-E10 | No focused executable probe was necessary or run; read-only cat/sed/rg inspection and existing evidence answered risks. Only the raw-review file was written. | Recorded. There are no reviewer probe outputs to reconstruct; this complete raw artifact is copied without alteration. Author repair tests are separately identified below. |

## Repair verification and scope

Covering command: `node --test scripts/tests/unit/task-tracker/lib/decomposition-authority.test.mjs scripts/tests/unit/task-tracker/lib/guard-registry-plan-exit.test.mjs scripts/tests/unit/task-tracker/lib/r4p-jit-boundaries.test.mjs scripts/tests/integration/task-tracker/lib/estimation/adaptive-estimation.integration.test.mjs scripts/tests/integration/task-tracker/lib/estimation/adaptive-estimation-claim-races.integration.test.mjs scripts/tests/unit/task-tracker/lib/estimation/forecast-compatibility.test.mjs scripts/tests/unit/task-tracker/lib/estimation/forecast-model.test.mjs`.

Observed: 174/174 tests passed, exit 0, including cancellation cases imported through the boundary test and the actual helper integration/current publication/race consumers. Raw output is `.scratch/2065/r1-fix-covering-tests.log`. Native full lint and format both completed with exit 0 (`r1-fix-native-lint.log`, `r1-fix-native-format.log`). Repair source commit is `fd7fe1ffe046ee23dd439eb521d226845b9a603a`; production/package bytes are unchanged from the reviewed candidate. No source-text duplication test or implementation-mirroring assertion was added.

No Stop, Test, Review, approval, Close, PR or delivery action was taken. The worker remains active for fresh scoped R2; the controller owns all later gates.

### Native outer-project-root condition

The earlier integrated root read-back had all aliases absent; it did not exercise the native verifier's explicit outer-root alias. The requested additional command was:

`AI_TASK_MANAGER_PROJECT_DIR="$PWD" node --test scripts/tests/unit/task-tracker/lib/estimation/forecast-compatibility.test.mjs scripts/tests/unit/task-tracker/lib/estimation/forecast-model.test.mjs scripts/tests/integration/task-tracker/lib/estimation/adaptive-estimation.integration.test.mjs scripts/tests/integration/task-tracker/lib/estimation/adaptive-estimation-claim-races.integration.test.mjs`.

Observed: 46/46 pass, exit 0 (`r1-fix-native-outer-root-tests.log`). The current `verbs/test.mjs` contract sets that alias through `buildSandboxEnv` to its actual execution worktree. Native identity inspection with the same alias selected the actual bound physical worker and exact #2065 Develop session (`r1-fix-native-outer-root-identity.json`); no synthetic root/fixture adapter or foreign exception was used. This is targeted condition coverage, not a Test transition or final settled-source CI.
