# #1915 reporting qualification partition — SAR revision 2, proposed

Purpose: propose a bounded test-file scheduling change for the existing #1918 source composition needed by #1919. This is a document addendum to docs/superpowers/plans/2026-10-12-1915-completed16-original-session-resumption.md. It does not approve an implementation, establish runtime feasibility or complete any issue. Historical accepted plan, review and evidence bytes remain unchanged.

## Observed failure and unchanged obligations

At clean abe103075b29bfdd3411b8b22dbb8d45fb1e6ffd the unfiltered original criteria-revision-partial-reporting.test.mjs ran through canonical spawnTestChild/createTestFileEnvironment with no suspension flag and its original 600000 ms file cutoff. It ended ETIMEDOUT/SIGTERM after 600017.30675 ms. The complete four-case base group passed, but the aggregate and ordinary group did not complete. Logs/JSON and subset results remain RED/incomplete evidence, never a new-head pass.

Review source is 0c7ea12e8f07ddbd4b5c175606c20787270a3d3b. Original aggregator/helper/fixture bytes match the historical evidence source; that does not establish exact-head execution of the whole tree.

Retain all fourteen genuine native files: four base modes, six current reporting modes and four original interruption/comment cases. Retain all ten-mode inventory assertions, the eight ordinary facade/public test files and their minimum65 actual-case guard. Preserve the original253 statically discovered native registrations by exact filename/mode/fault set and source bytes; a count alone is insufficient. The known dynamic native wrapper remains separately owned and unchanged.

## Exact proposed file partition

All paths below are relative to the owning checkout, /Users/kpburson/.codex/worktrees/b957/ai-task-manager.

Retain scripts/tests/integration/task-tracker/lib/criteria-revision-partial-reporting.test.mjs with its complete original inventory assertions, four base native profiles and all eight ordinary files. Move only the existing ten-case current/original execution group into these new statically discovered aggregators:

- scripts/tests/integration/task-tracker/lib/criteria-revision-partial-reporting-group-a.test.mjs
- scripts/tests/integration/task-tracker/lib/criteria-revision-partial-reporting-group-b.test.mjs

Both import the existing discoverOriginalCases and qualifyOriginalCases helpers from scripts/tests/helpers/criteria-revision-transition-profiles.mjs. They execute the actual original files, preserving every native fixture, capture, assertion, cleanup and authority check. No new registerNativeStageCase wrapper is introduced. Keep explicit existing inner test concurrency so the helper can execute at most four genuine fixture cases.

Group A's exact five selected filenames:

- criteria-revision-partial-cancel.test.mjs
- criteria-revision-partial-late-authority.test.mjs
- criteria-revision-partial-late-input.test.mjs
- criteria-revision-partial-late-source.test.mjs
- criteria-revision-partial-final-authority.test.mjs

Group B's exact five selected filenames:

- criteria-revision-partial-final-source.test.mjs
- native-stage-phase-12-prefix-after-effect-readback.test.mjs
- native-stage-board-effect-readback-failAfter.test.mjs
- native-stage-sentinel-effect-readback-failAfter.test.mjs
- native-stage-transition-comment.test.mjs

Each new file rejects missing, empty or duplicate selection and checks the exact selected filename set against those literals. An additive inventory assertion proves A and B are disjoint and their union equals the original ten-case current/original population. Do not rebuild expected membership from the same selected execution result. Keep the original complete fourteen-file union assertion.

## Replacement focused verifier — F1 disposition

This addendum supersedes only the accepted ledger row “Current partial/report/final-policy regressions” at plan line496, including its unsafe outer --test-concurrency=4 command. All other plan obligations remain. The replacement verifier has this closed seven-file order:

1. scripts/tests/integration/task-tracker/lib/criteria-revision-partial-reporting.test.mjs
2. scripts/tests/integration/task-tracker/lib/criteria-revision-partial-reporting-group-a.test.mjs
3. scripts/tests/integration/task-tracker/lib/criteria-revision-partial-reporting-group-b.test.mjs
4. scripts/tests/integration/task-tracker/lib/criteria-revision-partial-16.test.mjs
5. scripts/tests/integration/task-tracker/lib/criteria-revision-partial-late-input.test.mjs
6. scripts/tests/integration/task-tracker/lib/criteria-revision-partial-final-source.test.mjs
7. scripts/tests/integration/task-tracker/lib/criteria-revision-partial-final-authority.test.mjs

Qualification will retain a bounded runner as an execution artifact at .scratch/batch-2026-10-19/1915-reporting-partition-qualify.mjs, derived from the existing canonical per-file budget probe. Record its complete bytes and SHA256 beside the results. It is not a shipped module or a replacement for declared lifecycle/full-suite verifiers. Its exact invocation, from the checkout root, will be:

    node .scratch/batch-2026-10-19/1915-reporting-partition-qualify.mjs

This verifier imports spawnTestChild/createTestFileEnvironment from scripts/run-tests-pool.mjs, TEST_FILE_TIMEOUT_MS from scripts/task-tracker/lib/process-timeouts.mjs and RUN_TESTS_MAX_BUFFER from scripts/run-tests-report.mjs. It asserts the original 600000 ms/64 MiB parent policy, refuses an execution-limit suspension, and uses a fresh canonical child environment for each file. Underlying qualify retains its original600000 ms/8 MiB and the fixture retains590000 ms; none are raised.

The runner uses one monotonic 1200000 ms deadline for the complete seven-file invocation. Before each launch it checks remaining time, then awaits exactly one canonical spawnTestChild, with timeout at most min(600000, remaining deadline). No retry or clock reset is permitted. A nonzero status, signal, timeout, buffer failure, exhausted deadline, failure/cancellation/skip, or empty/partial expected test result makes the whole verifier fail. Record all actual counts, elapsed times, selected paths, source HEAD, environment/budget disposition and raw stdout/stderr. Earlier successful files do not turn an incomplete verifier into a pass.

Do not overlap another native-owning file or local qualification command. Maximum four concurrently executing authentic native fixture cases applies in this owning qualification environment, not four total OS harness processes or a global account-wide count across separate CI hosts. The canonical integration runner is already serial; preserve its scheduling. On failure/timeout stop, confirm that this run's owned native processes have drained using retained PID/process evidence, and do not launch another group while cleanup is unresolved. No broad process signals or unrelated process cleanup.

Keep any other existing native-owning focused commands separate from this invocation. The original four expressly named standalone files remain in this seven-file list even where an aggregator also executes them; no accepted obligation silently disappears.

## Semantic-section boundary — F2 disposition

All three criteria-prefixed aggregators remain in the existing shared serial semantic section under nativeSerialSection. This addendum does not change that classifier, its membership table, runner section boundaries, section clock, exemption rules or ceiling. Do not rename files to native-* to acquire another section.

The complete serial section retains its single600000 ms ceiling, including all other members selected for that canonical integration invocation. Three passing files are not a passing section. Require a complete measured non-exempt canonical integration verdict at the final implementation HEAD, with its full discovered membership and unaltered section accounting. Keep every required cloud integration shard and its section verdict; a separate hosted runner is a separate actual invocation, not permission to slice an already running section or discard members.

A section breach remains blocking even if every proposed file passes. Correct performance under existing owned scope or obtain independent review of a separately specified remedy before implementation; do not introduce extra semantic sections or budgets under this addendum. Do not reset clocks around arbitrary subsets, suspend limits, override ceilings, filter away failures or use exempt all-lane output as semantic-budget proof. Keep1200000 ms focused verifier and45-minute lifecycle sandbox limits independently enforced.

## Qualification and stopping rules

Before any success claim:

- Prove both exact new paths appear in canonical integration and all discovery. They are new aggregator files, not new members of the original253 native registration set.
- Independently compare the complete original filename/mode/fault registration set and underlying wrapper/fixture/assertion bytes. Preserve every original test and assertion.
- Qualify all seven focused files through the bounded verifier, preserving full raw results; also qualify the actual complete non-exempt canonical integration sections on the final source. No test-name filtering.
- Run lint, format, required full unit/integration/slow/package/CI obligations and fresh independent final source review. npm test is the fast unit lane here and does not establish integration execution; retain the actual integration CI jobs and full slow obligations explicitly.
- Keep exact-head native Test/Review/Full-Auto approval, provider delivery and closure gates. Do not reuse historical passing receipts for a changed head.

Five-case groups may reduce a per-file timeout but their timings, base-plus-ordinary timing, whole verifier duration, shared section duration, cloud and sandbox feasibility remain unproved. Any breach is an honest RED result and blocks the dependent delivery. Document review acceptance authorizes only the proposed bounded work; it is not proof that all runtime budgets will pass.

No partition implementation or new verifier has been applied. Production source, existing tests, accepted plans, prior reviews and timing/evidence are unchanged. The current user explicitly selected independent SAR with GPT Astra6/high for this document instead of the broken primary protocol, and requires author fixes plus same-reviewer re-review until no actionable finding remains, including minor findings. Preserve each review round and its FUR hash.
