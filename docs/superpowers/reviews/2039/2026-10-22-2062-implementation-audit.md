# #2062 — pure local calculation and rubric derivation

## Scope and API

Task 17 of the pinned active execution plan builds on accepted #2045 evidence validation and immutable native storage. The baseline is `3765bb13f54c600544eb30d5ca07771229f68994`; genuine planning and prior-child acceptance are committed at `cd3d441ca`. Native Plan, supplied local S/3.5-hour estimate, Plan approval and Develop admission completed. The governing specification, technical contracts and exact source bindings remain unchanged.

`calculateLocalEstimate({mode,evidence,planInput,model})` is synchronous and pure. `planInput` contains the parsed input and an explicit selection: `{selection:{host,repository,issue,configuration,plan,refine,modelPolicy},input}`. The selection must exactly match the freshly validated retained bundle, including selected plan path/section/commit/digest, Refine provenance and effective configuration. The parsed WBS is independently included in the calculation input digest. Model descriptors contain `modelVersion`, `policyVersion`, `supportsEmptyComparables` and a synchronous pure `calculate` function. The default descriptor wraps existing forecast arithmetic; no coefficient or half-hour rule was changed.

Disabled mode returns no estimate and does not inspect evidence. Invalid mode, missing/corrupt/mismatched evidence, incomplete timing, unavailable requested comparables, unsupported empty cohort, wrong model identity and malformed/model-identity-substituted output return unavailable. Model inputs and successful outputs are detached and deeply frozen. Estimated results include size/hours, a reproducible input digest, model/policy identity, explicit local provenance and the empty-comparable limitation when applicable. The current forecast payload remains v2; the later Task 19 owns v3 migration. Selected comparable provenance lists only the actual selected inputs.

`deriveLocalRubric({mode,evidence,selection,recordId,generatedAt})` is pure and returns either the unchanged current rubric or a candidate complete successor bundle. Caller-supplied valid record ID and exact time make new derivation reproducible; no clock or random allocation is hidden in calculation. Existing rubric learning computes coefficients from retained complete outcomes, preserving separately sourced human coefficients. The successor uses the accepted local wrapper, exact predecessor/supersedes, payload hash, model/policy identity and `derived-local` provenance with no fictional cloud comment or grant.

`retainLocalEstimateInputs({evidenceStore,bundle})` is a separate local IO boundary using actual branded native immutable import and read-back. A private object-identity/digest receipt permits derived inputs to reach pure calculation only after genuine persistence; caller booleans or copied objects cannot forge it. A new process/reopened store must revalidate retained bytes. `refreshLocalRubric` derives, retains and verifies before returning a usable successor ID. A failed write or final read-back exposes no usable ID, even if some exact local bytes landed. Existing `loadOrRefreshRubric` and its current callers remain compatible; the later dispatch slice owns activation and elimination of historical discovery routes. This slice itself performs no cloud estimation lookup or publication.

## TDD and verification

- Missing runtime module and permissive success stub both produced RED before implementation. The original runtime behavior tests passed 34/34.
- Missing local rubric exports and permissive derivation/refresh stubs produced RED before implementation. Combined runtime/rubric tests passed 56 after adding the genuine unpersisted-candidate refusal. The ignored ledger initially misstated intermediate counts as 48/49; these are corrected here to the actual retained log count, 56. No separate earlier count is inferred.
- A real derived candidate initially returned estimated without persistence (RED). The private native import/read-back receipt fence made that refusal GREEN.
- Two further tests produced RED for unselected outcome provenance and a non-string unavailable reason; both passed after focused repairs. The named pure verifier then passed 58/58.
- Five real native evidence-store integration tests passed: durable derivation and calculation, reopen/revalidation and unforgeable receipt, partial write recovery with the identical candidate, failed final read-back after a landed manifest, and changed-byte/manifest rejection. They exercise real runtime migration/storage and private immutable files; no fake successful store is substituted.
- The existing estimation unit family plus old/new evidence-store integration passed 235 tests before the last two provenance/reason repairs. This is retained regression evidence, not a claim about a later final head.
- Package test observed RED at 963 actual entries against the prior exact 962 allowance, then GREEN 9/9 after adding exactly one maintained runtime module and its presence assertion. No exclusion or spare headroom was added.
- Full lint passed after correcting a Markdown heading ambiguity in the planning artifact. The native mirrored narrative remains semantically identical. Full fast-suite verification passed all 988 files (949 pure unit and 39 direct-subprocess files); the expanded named verifier passed all 63 tests. Final exact-head CI and native Test remain pending.

Raw logs remain under `.superpowers/sdd/2026-10-20-2039-active-child-execution-plan/task-17-*.log`. An independently hand-calculated fixture correction preceded implementation: human total 44h; AI stages 2/22.5/4/3.5h, P50 32h, P80 47h. These synthetic fixture results are test expectations, not this story's local engineering estimate or live timing evidence.

Native root verifier vc:1 was extended, through the retained fresh-version operation `2026-10-22-2062-verifier-operation.json`, to include the actual persistence integration file. Expected body version 35 was selected live; execution returned verified version 37. The existing AC citation and all lifecycle/source markers remain intact. The targeted verifier is:

```sh
node --test scripts/tests/unit/task-tracker/lib/estimation/local-runtime.test.mjs scripts/tests/unit/task-tracker/lib/estimation/rubric-refresh.test.mjs scripts/tests/integration/task-tracker/lib/estimation/local-runtime.integration.test.mjs
```

## Review and native acceptance

Independent GPT-6.1 Sol / medium round 1 found one Important typed-error defect. Nine additional tests observed RED, then the actual-store targeted verifier passed 72 after shared defensive error normalization. The complete raw round and all ten boundary rulings are retained. A second fresh Sol / medium reviewer accepted the repaired head with no actionable findings, independently passing the 72-test child verifier, separate 63-test model/evidence selection, nine package tests and 33 adversarial typed-error checks. Its full raw report and all ten author boundary rulings are retained. The repaired-source full fast suite passed all 988 files in 129.9 seconds, and full lint/format passed. Final exact-head CI remains pending. Native Test, agent CODE_COMPLETE, same-target orchestrator Review, approval and Close are pending. Root #2039 remains Develop and PR #2081 remains the aggregate delivery route; no child is separately delivered.

## Authority, timing and capture

Own app/shell/native worktree is 7f44 on `codex/2039-draft`; source self-link resolves to itself. The native #2062 binding and singleton @kburson assignment were verified, with timer active. Timing total is Unknown; no finite duration, historic timer pause or missing endpoint is manufactured.

Every native CLI retained `AITM_GRAPHQL_USAGE=1`; standalone gh/direct gh-spawning scripts use the required capture wrapper. The collector and frozen baseline remain preserved. Direct wrapped reads outside Develop emitted invalid-inherited-context diagnostics, and the original #2055 healer wrapper omission remains an explicit capture gap. No new traffic totals or complete physical HTTP coverage are claimed in this implementation audit; the next consolidated completed-wave checkpoint will report one meaningful non-overlapping window.
