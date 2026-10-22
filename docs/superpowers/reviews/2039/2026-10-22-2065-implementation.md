# Task21 implementation evidence for #2065

Status: CODE_COMPLETE for the admitted worker slice, pending controller review and integration gates; no Test, Review, approval, Close or delivery claim.

## Authority and allocation

- Epic owner: #2039 orchestrator in b187; worker owns only `feature/child/2065` in `.worktrees/2039-wave10-2065`.
- Base HEAD: `019ea75594c73a70a907844352143ef16d170fd6`.
- Actual Codex thread/native session: `01a163c9-05bf-73a0-9e5a-a3895ed7de10`; provider adapter prioritizes `CODEX_THREAD_ID` over inherited legacy `CODEX_SESSION_ID`.
- Native binding generation: `6004dd0b-c693-4d43-91fd-502f25ea9084`; timing actor `v1:2cc146f7e03aa0b4c1c3f05f1f9395965790b9f91dea9209567b453fc9344a8b`.
- Exact task brief and AGENTS/task adapter/router/pickup/session boot/preferences API were read. `npm ci` and `npm run link:self` succeeded; self-link resolved to this physical worker checkout.
- Specification pin: `dafb1d276036ddc17490f76329f6aa2c09732a15`. Original technical Task7 pin: `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`.
- Native dependency read: blockedBy #2064, blocking #2047/#2069. Fresh #2064 read showed CLOSED and project Done before admission.
- Native Start, Plan, posted/mirrored/completed deep dive, supplied 3h estimate, Full-Auto Plan approval and Develop succeeded. Plan approval time was `2026-10-22T13:41:00Z`; Develop entry `2026-10-22T13:42:49.318Z`, verified eight-step tail and final sentinel. Explain before Develop was ready with no blockers/warnings/human decision.
- Size S and 3h allocation remain unchanged: 1.5 implementation, 0.75 focused verification, 0.75 independent review/integration repair. Controller explicitly admitted direct caller migrations under the pinned plan's caller-census requirement. No estimate used historical cloud stories, comparables or rubric discovery.

## Delivered behavior and exact caller boundary

`forecast-legacy.mjs` delegates v1/v2 reads to the original strict validators: v1 arbitrary nonnegative hours and v2 half-hour grids remain unchanged. Current v3 authority requires actual retained evidence through #2064's `resolveLocalForecast` and exact current selection through `validateLocalSelection`. It returns the detached validated snapshot, which both publication/adoption entrypoints use through awaited projection reads.

`deps.localForecast` explicitly contains `evidenceStore`, `identity` (host/repository/issue) and `selection`; generation also requires `manifestDigest`. No result snapshot is promoted into a store or source authority. Missing context/bytes and stale selection refuse before publication effects. Configured repository and expected issue correlate with actual retained identity.

The existing exported `executeAdaptivePlanEstimate` now uses local retained reader inputs rather than invoking cloud Refine/rubric/comparable loaders. It feeds the existing model's v3 opt-in exact raw evidence and provenance; explicit selected outcomes stay correlated. `runtime-adapter.mjs` only forwards the explicitly supplied context into current authority. Local calculation/model backward-compatible output validators and schema constants remain unchanged. The disabled-rubric supplied-hour manual Plan route is covered by native regressions.

The real writer exposed two additional current consumers. `record-envelope.mjs` now validates exact v3 before allowing its schema's literal `path` key through the existing semantic-key facility; credential VALUE scans, unknown-key checks and general secret policy remain intact. New forecast creation requires v3; legacy render/parse remains strict. `renderers.mjs` delegates v3 structural validation to `validateForecastProvenance` and v1/v2 to their original validator. The authority reader is intentionally stricter than presentation: rendering cannot invent a retained store. Actual cyclic module initialization, envelope creation, visible rendering and native comment read-back are covered by integration tests.

Originally owned production files were `plan-estimate-authority.mjs` and `forecast-legacy.mjs`. Controller-approved direct source extensions were `runtime-adapter.mjs`, `github-records/record-envelope.mjs` and `renderers.mjs`. Direct test extensions preserve authority interruption/race/replay/negative scenarios and historical read/grid behavior. Shared fixtures, package inventory, peer #2059 files, guards, budgets and generic secret policy were not changed.

The initial literal forecast-envelope census found 19 consumer files but its claim of only three actual creators was incomplete: it missed constant/generic/helper callsites. The broader native run exposed additional historical creators in `decomposition-authority.test.mjs`, `guard-registry-plan-exit.test.mjs` and `decomposition-cancellation-publication.cases.mjs` (imported by `r4p-jit-boundaries.test.mjs`), plus the obsolete current-create expectation in `records.test.mjs`. These exact files were separately admitted. Their historical records now use native validated render/parse fixtures, preserving every prior assertion instead of passing legacy records through the new-current creation API. This correction is explicit; the earlier census is not presented as exhaustive proof.

Remaining original validator uses are deliberate: `forecast-v3.mjs` validates its strict base through explicit v2; `forecast-model.mjs` preserves its backward-compatible model result and opts into v3 with retained inputs; `local-runtime.mjs` checks that unchanged model-output contract; `forecast-record.mjs` itself retains its original semantics. The new current authority, envelope and presentation consumers use version-aware dispatch.

## Semantic RED/GREEN and raw evidence

All raw files below are physically retained beneath this worker's ignored `.scratch/2065/`. They are observations, not lifecycle proof receipts.

- `red.log`: legacy v2 incorrectly reached authority projection reads; `green-initial.log` passed the exact named compatibility/model command after strict current gating.
- `red-repository.log` / `green-repository.log`: configured repository mismatch reached projection reads, then refused before them.
- `red-caller-mutation.log`: current authority published caller-mutated 999h instead of validated 40h during an awaited read; `regressions-snapshot.log` passed after detached snapshot publication.
- `red-selected-outcomes.log` / `green-selected-outcomes.log`: all-retained provenance disagreed with explicitly selected outcomes, then native selected-input correlation passed.
- `red-envelope.log`: real current v3 envelope failed the old dispatch/security heuristic. `envelope-migration-green.log` retains the subsequent partial migration attempt and fixture-lineage diagnostics. `current-fixture-green.log` passed actual publication plus records regressions after corrections.
- `red-renderer.log`: real v3 presentation failed legacy-only dispatch. `final-targeted-corrected.log` passed 409/409 tests covering exact named verifier, model, current authority, provenance, lineage, record security, production publication, races, decomposition and manual Plan/approval behavior.
- `legacy-historical-green.log`: all 128 historical guard/boundary/decomposition regressions passed after the separately admitted fixture migration. `final-owned-and-consumers.log` passed the combined 537/537 tests after those corrections; `helper-integration-final.log` separately verifies the subsequent helper-only extraction with real native publication/read-back and race cases.
- `red-snapshot-issue.log`: a diagnostic expectation initially assumed an issue-correlation error; native canonical JSON already refused accessor properties. The test was corrected to assert that real refusal; production canonical guards were not changed.
- `green-compatibility.log` and `green-compatibility-corrected.log` retain fixture mistakes (frozen mutation, wrong bootstrap confidence, exact raw-bundle shape) and were superseded by passing corrected runs. None is hidden or counted as product failure proof.

## Native runs and limits

The first intermediate `npm test` (`npm-test.log`) failed 2/995 files: known package inventory ceiling and 12 old-current cases under `decomposition-reestimate-guard.test.mjs`. The next broader run (`npm-test-final.log`, despite that historical filename) overlapped admitted test migration and failed 5/995 files: package ceiling, decomposition-authority, records, guard-registry-plan-exit and r4p-jit-boundaries. The latter four were corrected with real focused regressions. Neither intermediate run is claimed as an exact final or integrated suite pass.

`npm-lint.log` and `npm-format-check.log` passed before later admitted migrations. `npm-lint-final.log` retained a later story-tag failure caused by imports being placed before two tags; the tags were moved to the required leading position. The subsequent native line-cap check correctly refused the expanded integration test at 851 code lines versus the unchanged 800 limit. The controller admitted one new self-owned test utility, `scripts/tests/helpers/task-2065-forecast-fixture.mjs`, extracting only the new retained-context/historical-transport helpers. Existing shared fixture sources remain unchanged. `npm-lint-stable.log` passed the complete native lint chain after correction; `npm-format-stable.log` passed whole-tree format checking. The admitted helper extraction required retaining the new historical/current factory branch together; no scenario/assertion was removed. `line-cap-pass.log` confirms the unchanged hard limit, with the integration test at 800 code lines and a soft-review warning. Earlier 805/801 intermediate line-cap refusals remain retained.

The package failure was actual packed count 970 versus explicit 969 ceiling; this slice adds the required focused production module. Shared inventory was deliberately left unchanged for serialized controller integration with #2059. No passing package or full-suite claim is made.

Native slow-run evidence is `npm-slow.log`: all 56 files passed, aggregate 576.5 seconds (204.9 seconds bounded parallel section, 371.6 seconds serial). It began before subsequent source/test edits and remains an intermediate run, not exact-final merged proof. Exact merged-source gates belong to the controller after fresh independent review and both workers' real Stop/absence checks.

## Native trace, refusals and capture limits

- `bootstrap-npm-ci.log`, `scratch-2065-start.log`, `scratch-2065-explain-start.json`, `scratch-2065-plan.log`, `dependencies.json`, `predecessor.json`, `plan-estimate.log`, `plan-approve.log`, `promote-develop.log` retain full admission output. Initial loose logs were physically renamed into scratch, not deleted or excluded to counterfeit cleanliness.
- Deep dive comment: `https://github.com/kburson/ai-task-manager/issues/2065#issuecomment-6342083897`. The first mirror attempt rejected the native comment command's GraphQL node ID; a numeric retry was rejected by target parsing as an issue number. Fresh Explain runs were retained; the documented URL form mirrored successfully. Completion was confirmed by the native check command.
- Supplemental source/caller ruling was posted with native owned-comment key `task21-caller-migration-supplement`; node ID `IC_kwDOSU6LgM8AAAABehBI-g`. The initial census statement in that supplement is corrected by this report and the subsequent native correction.
- Bootstrap memory read was refused outside allowed scope. `mkdir`/batched read redirection was classified WRITE_OTHER against root #2039 despite an explicit worker `workdir`; no source permission was inferred from that diagnostic. The functions apply-patch adapter rejected its payload parser; ordinary target-aware worker source writes passed. One JS regex was misclassified as an outside path; the same target-aware write used a string RegExp diagnostic. No IDs, bindings, hooks, policy or approvals were overridden.
- Native action capture initially reported unavailable because the worker state file did not yet exist. Later GraphQL usage emitted soft-byte-cap/soft-file-cap and invalid-inherited-context warnings. Those warnings do not establish a real RATE_LIMIT or TLS incident; neither occurred here. Capture completeness or cloud call counts are not asserted.

Independent review, integrated exact-source verification, Test, Review, approval, Close and delivery remain with the controller. No reviewer was launched by this worker.

## Worker commit and final handoff evidence

Product commit: `f4468fcb616c0cf6b50e8e5a1844c0a66a601ab9`, message `[#2065] Preserve legacy forecast reads and require retained current provenance`. It contains exactly five admitted production files, ten test/case files and one self-owned fixture helper. This report is a separate attributed documentation commit. All paths are visible in native Git commit output; no shared inventory or peer-owned file was committed.

Final stable worker evidence before the product commit:

| Check | Observed result | Raw file |
| --- | --- | --- |
| Exact named compatibility/model verifier | 36/36 pass, exit 0 | `exact-verifier-stable.log` |
| Complete owned/actual-consumer/historical targeted set | 537/537 pass, exit 0 | `final-owned-and-consumers.log` |
| Helper extraction and actual production publication/read-back/race | 10/10 pass, exit 0 | `helper-final-green.log` |
| Complete native lint chain | exit 0 | `npm-lint-stable.log` |
| Complete native format check | exit 0 | `npm-format-stable.log` |
| Native line cap, unchanged 800 hard limit | pass; target at 800 with soft warning | `line-cap-pass.log` |
| Git whitespace validation | exit 0 | command output in worker transcript |

The corrected native caller-census comment is `IC_kwDOSU6LgM8AAAABehJQsA` (`census-correction-post.log`). Native commit trace output is retained for both attributed commits. A scratch evidence manifest records raw-file hashes; later native Stop and absence read-back remain separate final handoff observations. They grant no Test/Review/Close authority.

The controller subsequently directed serialized integration: first Stop this clean worker, merge reviewed #2059 in the owner, then explicitly resume this same worker/branch for an ordinary epic merge and the exact two-module package inventory repair plus final integrated checks. That future shared-file repair is not claimed performed by this worker report revision. Intermediate full/slow results and all actual refusals remain preserved.

## Resumed serialized integration and final review candidate

The controller explicitly resumed this same #2065 worker after independently verifying both wave workers' Stop/absence. Native Start succeeded with unchanged provider/session `01a163c9-05bf-73a0-9e5a-a3895ed7de10`, new binding generation `dbccf4d6-ca47-46d3-98c3-8b6b987291bc`, exact physical story worktree/branch and Develop state. Fresh Explain exited 0: promotion remained blocked by the unticked AC and later finalization gate, with no human decision. No Test/Review/Close movement was attempted.

Ordinary merge `ff72a35fb45ea17574a41ee13751dd3c331ec518` has parents `48dd2f5723e7b30689aa8630bce02056388fbe3e` and owner epic `e6c47dff776e88dc1ae9d80538b11a73cf5f5db7`. The latter includes independently reviewed #2059 and the stopped worker raw archive. No rebase, reset, branch rename or foreign-worktree admission was used. Native trace succeeded for the merge and subsequent inventory commit.

The controller then exclusively admitted `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` to this worker. Actual `npm pack --dry-run --json` measured 970 entries before the epic merge and 971 after it. The merge added only `stage-capabilities.mjs`, with no removed packed path. Comparing every packed path against pinned base `019ea75594c73a70a907844352143ef16d170fd6` found exactly two absent paths: `scripts/task-tracker/lib/story-cache/stage-capabilities.mjs` and `scripts/task-tracker/lib/estimation/forecast-legacy.mjs`. The native inventory test genuinely failed at 971 > 969 before repair, then passed all 9 tests after precisely one +1 term and one inclusion assertion for each module. Existing assertions and exclusions remain intact; no headroom was added.

Raw measurement: `pack-before-epic-merge.json`, `pack-integrated-before-inventory.json`, their separate stderr captures, `pack-integrated-delta-corrected.json`, `inventory-red-integrated.log`, `inventory-green-integrated.log`. A preliminary read-only parser assumed array-shaped npm output and failed; the corrected census uses the repository's actual `parseNpmPackReport` helper for npm's package-keyed object output. The raw pack reports were never rewritten.

Final executable-source commit is `94beaeb74170f67db827f04475e68028dfaa9c09`, tree `c6e5769b60c5ab905e4b645744dfa04ae544da69`, clean `feature/child/2065` at run start (`integrated-source-identity.json`). Inventory source SHA-256: `dc465668dcb296164c95be1305a2038ea15085d45758d574d279a1226762960d`. Subsequent candidate changes update this report only; they do not change the verified executable/test/package source. Review BASE is `e6c47dff776e88dc1ae9d80538b11a73cf5f5db7`, so already-reviewed #2059 changes are excluded from this story diff.

| Integrated check at the source commit | Observed result | Unique raw output |
| --- | --- | --- |
| `npm test` | all 996 files pass, exit 0; aggregate 119.4s | `integrated-npm-test.log` |
| Named compatibility/model verifier | 36/36 pass, exit 0 | `integrated-exact-verifier.log` |
| Owned/actual-consumer/native/manual plus reviewed capability regressions | 561/561 pass, exit 0 | `integrated-combined-regressions.log` |
| `npm run lint` | complete native chain passes, exit 0 | `integrated-npm-lint.log` |
| `npm run format:check` | whole-tree pass, exit 0 | `integrated-npm-format.log` |
| Exact package boundary after measured repair | 9/9 pass, exit 0 | `inventory-green-integrated.log` |

There was exactly one settled-source integrated `npm test` run. The earlier 56-file slow success remains an intermediate run overlapping earlier edits and was not repeated or relabeled exact-final. Full applicable CI on the controller-pushed final integrated source remains required before Test.

Native root/scope read-back (`integrated-native-root-binding.json`) used actual `resolveRuntimeRoot`, `runtimeStoragePaths` and `readExactSessionBinding`, without synthetic project-root adapters. Physical `projectRoot` is `/Users/kpburson/.codex/worktrees/b187/ai-task-manager/.worktrees/2039-wave10-2065`; Git-verified `mainRoot`/outer primary checkout is `/Users/kpburson/projects/Vibe-Coding/ai-task-manager`. The local runtime/store paths remain under the worker's `.ai-task-manager/runtime`; shared runtime/store paths resolve under that primary checkout's `.ai-task-manager/runtime`. All four project-root aliases were absent. Git registration, common-directory identity and the exact #2065 Develop binding were verified by the native APIs. This read-back proves actual root selection; it does not claim that synthetic offline test fixture stores are external/cloud authority or that a public CLI writer was activated.

The worker remains natively active for the controller's fresh independent Sol-medium review and possible repairs. No reviewer was spawned here. Native Stop will occur only when separately instructed; the earlier Stop evidence belongs to the preceding handoff and is not the resumed session's current status. The 3h bottom-up allocation and all existing scope rulings remain unchanged.
