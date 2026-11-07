# #2146 premature reconstruction and disposition

The owner requested independent concrete pre-execution review of reconstruct.mjs, then inadvertently executed its positive test while that review was pending.

Exact command:

```sh
node --test --test-name-pattern='^(?!reconstructs the available)' .scratch/inspect/2146-archive-candidate/scripts/tests/integration/task-tracker/core/2146-archive-reconstruct.test.mjs > .scratch/plan/2146-archive/task-2-preconditions-tests.log 2>&1
archive_test_exit=$?
tail -22 .scratch/plan/2146-archive/task-2-preconditions-tests.log
exit $archive_test_exit
```

Intended selection: 19 environment/configuration/allocation checks, excluding the final positive reconstruction. Actual recorded selection: all 20 tests passed, none skipped, exit0; the final name was `reconstructs the available historical object without changing carrier HEAD/index/refs`. Filter semantics require investigation against an inert registration fixture; no AITM/Node product defect is asserted.

The reviewed source at execution had SHA2565f286ac744a009d9dd0c602bc3c1c5540efe24cfcc97bd1770fc1bb9b8245323. Test source SHA2564e256425ee83d6c1ff07ef0c5bfc7ea182ee001dfa6fde325cf90113b42f9b2f. The fixed implementation checks configuration, requires historical objects, runs local clone --shared --no-checkout with a fresh empty template, changes only the new repository HEAD/index/worktree, then checks historical source identity/cleanliness. Test assertions checked actual carrier HEAD/index/refs before and after and prohibited fetch/push/pull/checkout/restore/commit in its command ledger.

Evidence limit: the command ledger and before/after Git snapshots existed only in the successful test process and were not serialized. They cannot be reconstructed as an execution transcript now. The preserved log establishes passing assertions, not independently inspectable full snapshots/argv. Newly allocated roots were removed by normal success cleanup. There is no retained failed-root claim for this successful run. Original source/raw evidence was not intentionally modified; fresh pin checks are recorded separately, not backdated.

Owner stopped, notified reviewer/coordinator, and native `npx aitm pause` exited0: `Paused #2146: +Unknown active min (wall 54), +732 words`. No Active time inferred. The coordinator authorized continued correction under explicit human AFK/best-judgment authority after reading the full review, with ordinary native resume before edits. Native `npx aitm start 2146 --role agent` subsequently exited0, `Resumed #2146`.

Independent review found two Important defects: raw unsafe Git configuration-key text can disclose sensitive URL subsections, and unexpected failures discard the command ledger while test cleanup removes their roots. The reviewer did not inspect this log or approve the premature run retroactively. Full findings and exact reviewed hashes are retained in the review history. Fix via failing-first tests; require independent acceptance of corrected code before another positive reconstruction.

Next positive execution must use a separate explicit test entry with selected names/count verified first. No broad negative name expression. Preserve this run and its limitations permanently; no retrospective approval marker, guard waiver, source reset or historical evidence rewrite.

## Investigation and correction evidence

An inert two-test fixture reproduced the selection without any Git/reconstruction call: both names ran with the same negative pattern (selection-negative-pattern.log and selection-full-names.log). The actual Node26.8.1 embedded internal/test_runner/test source function testMatchesPattern checks the test name OR any ancestor name recursively, then the combined name. The broad negative expression matches an ancestor whose name does not start with the positive-test prefix, admitting its descendant. This is selection misuse, not an established Node or AITM defect. Official reference: https://nodejs.org/api/test.html#filtering-tests-by-name.

An anchored positive expression on the inert fixture selected exactly one intended test (selection-explicit-pattern.log). The actual positive reconstruction was separated into 2146-archive-reconstruct-positive.test.mjs; static registration inspection found exactly one top-level test with the intended positive name. No further positive execution occurred while the corrected concrete implementation awaited acceptance.

The two required review fixes reproduced failures first in task-2-review-fixes-red.log. After fixed-category configuration refusals and retained sanitized outcome/argv/status diagnostics plus success-only test cleanup, the separate refusal/allocation file passed21/21, exit0 (task-2-review-fixes-tests.log). The intentional failure test intercepts Git before execution and proves diagnostics/root survival, then cleans only its expected fixture. The earlier RED retention fixture validation-vhaGxo remains for inspection.

Fresh post-resume preservation check: original manifest SHA25678afd54726726495057aacba467593b922b218d602081bf6b392274bc2514781; all1133 artifact hashes and12 source hashes matched, zero drift. These are new checks, not reconstructed before/after snapshots for the premature run.
