# Independent scoped fix-round review of #2012

## Verdicts and prior finding dispositions

- **Specification: PASS.** The original requirements remain appropriate and unchanged.
- **Code: ChangesRequested.** Three scoped withdrawal gaps remain below.
- **Exact bounded local-tarball adoption: Refused.** Provenance passes, but the exact package reproduces the failures.
- **Prior P1: NOT ADDRESSED in full.** All four original literal bypasses are fixed, but the same coordinated neutral/admission withdrawal still bypasses classification when expressed as an ordinary comma list (R2-1).
- **Prior P2: ADDRESSED.** Both original operational preference false withdrawals are fixed, including controls without completion context. A different withdrawal regression introduced by the preference fix is separately reported as R2-2.

All **20 original probes pass**. This does not establish complete boundary correctness: **9 of 25 additional scoped probes fail**, leaving 36 of 45 expected outcomes satisfied. All 45 source/package outcomes are identical. The full comparison records expected results and actual results for the reviewed source, rejected fix base, and exact new tarball.

## Exact scope and reviewer independence

Reviewed source: `efc7fae4750a9204b85d26c82a555991a45379bf`.
Fix base: `b5528ee33b517202aa5091d5271404e1ae79c795`.
Publication head before review: `4f8a24aff86b84e33a2b78b7a89312ebda6816a6`.
Original independent report commit: `e50b2c146327f20735c4071dc7675d37db566198`.
PR: <https://github.com/kburson/ai-task-manager/pull/2013>.

The same standalone Astra 6/high reviewer chat `01a138f7-8083-7d31-9344-a35863d2499e` performed this review directly, separate from Sol author chat `01a138e5-7d07-7671-883d-e4ef5d43f917`. No subagents, substituted native identity, environment override, guard changes, production edits, consumer/global installation, or primary checkout edits were used. This is a standalone independent report, not a sealed SPR/XPR receipt.

Boot, current Tier-1, preferences and live #2012 were reloaded. Before binding, the author active file and central #2012 occupancy were absent. Registered Start resumed the genuine reviewer with binding generation `aa923b7c-7359-4622-9d75-c344df3dfb94`, correct worktree/branch, and active Develop timer. Explain returned ready with `test-develop-finalization-pending`; no lifecycle move was performed. Stop and discharge verification follow publication.

Only the changed grammar, regression tests, prior findings, and their immediate semantic interactions were reviewed. The eight inherited modules/entrypoints were checked for unchanged bytes rather than reopened for feature review. The production fix diff is confined to `epic-rank-wave-source.mjs`; the other scripts diff is its regression test. The publication head adds three package attestation/inventory/comparison files.

## R2-1 — P1: Split all coordinated targets before treating a comma tail as a reason

Location: `scripts/task-tracker/lib/epic-rank-wave-source.mjs:351-357`, the new `coordinatedObjects` helper.

With the existing exact rank-4 grant, this authentic later command still returns `verified` in the corrected source and tarball:

> Stop deployment, tests, and parallel execution for epic #2 rank 4.

Expected: `blocked` / `rank-wave-source-contradiction`. The same bypass occurs with the deferred-pause sentence before it and with the two-item comma form `Stop deployment, parallel execution for epic #2 rank 4.`. The rejected fix base also verifies these variants: this is an incomplete repair of the original P1 finding, not a newly introduced regression.

The new normalization removes the comma immediately before `and`, but `principalObject` still truncates at the first comma. The helper therefore sees only the neutral deployment head and puts the remaining coordinated targets in `suffix`. Reattaching that suffix does not recover them because subsequent principal-object parsing truncates it again. The new test covers `deployment, and parallel execution` but not the ordinary three-item list.

Required correction: identify coordinated targets before classifying true reason/condition tails. Preserve numeric lists and independent epic/rank scope. Keep neutral-only lists neutral and add a real loader regression for a three-item comma list with a matching admission target.

## R2-2 — P1: Preserve preference negation across coordinated operations

Location: `scripts/task-tracker/lib/epic-rank-wave-source.mjs:460-468`, the new preference skip and negation transfer.

This later instruction now returns `verified`:

> When wave 4 is complete pause. I do not want to run tests or execute epic #2 rank 4.

Expected: `blocked` / `rank-wave-source-contradiction`. The negated preference applies to both operations, including executing the exact authorized wave. The rejected fix base blocks this combined statement; the corrected source and package verify it. The same regression occurs with `and execute` and `I do not want you to run tests or start epic #2 rank 4.`.

Skipping the `want` wrapper correctly prevents the old operational false positive. However, the replacement regex only transfers negation to the immediately following `run`. That operation has a neutral tests object; the subsequent `execute`/`start` verb is evaluated without the shared negative preference and is not classified as a withdrawal. Splitting objects after individual verbs cannot restore the lost operator scope.

Required correction: preserve a preference's negation over its coordinated verb phrase while ending it at genuine independent clauses/sentences. Keep `I do not want to run tests or start deployment.` neutral; retain blocking for a matching admission operation and for an independent immediate stop. The unprefixed disjunction also fails, but it already failed at the fix base; the prefixed variant above proves the fix-round regression.

## R2-3 — P1: Use the coordinated target interpretation when retaining completion context

Location: new coordinated-object evaluation at `scripts/task-tracker/lib/epic-rank-wave-source.mjs:469-493`, interacting with the unchanged completion-context consumer at lines 540-551.

This later message returns `verified`:

> When wave 4 is complete stop deployment and parallel execution for epic #2 rank 4. Stop now.

Expected: `blocked` / `rank-wave-source-contradiction`. The first sentence schedules a valid deferred stop for both targets, but the second is an independent immediate withdrawal. Reversing target order to put parallel execution first makes the same `Stop now.` block, demonstrating that neutrality of the first target conceals the later command. A tests-first variant also verifies incorrectly.

The new verb evaluator sees the coordinated admission target and defers it correctly. The sentence-level context collector still passes the entire unsplit object into `deferredCompletionStop`; its deployment/testing head makes the boundary look non-admission, so no completion context is retained. The later bare stop then lacks relevant scope and the whole-message bare-stop fallback does not match a two-sentence message.

This also failed at the rejected fix base. It is an integration gap in the same coordinated-target repair, not a new adjacent feature request: a consumer of the newly recognized target structure still uses the old head-only interpretation. Required correction: retain context from each genuinely deferred matching admission target without attaching its completion condition to the later command. Preserve deployment-only chatter and explicitly unrelated-wave/epic targets.

## Independent verification and author evidence

- Fresh focused source/regression run: **79 tests passed**, zero failures. Exact command: `node --test scripts/tests/unit/task-tracker/lib/epic-rank-wave-source.test.mjs scripts/tests/unit/task-tracker/lib/epic-rank-wave-source-deferred-pause.test.mjs`. Output: `focused.log`.
- **45 independently executed native loader/verifier probes**, run against source, clean archived fix base, and extracted exact package: `comparison.json`. Twenty are the immutable prior review inputs, and 25 exercise the changed coordination/preference boundaries and controls. Nine variants expose the three findings; 36 meet their expectations. The exact owner's two-space future-pause wording passes.
- Controls cover other-wave/epic isolation, numeric rank lists, comma-plus-conjunction, ampersand, negated stop, actual neutral testing/deployment objects, matching negative preferences and genuine independent stops. Focused tests retain no-authorization-from-future-pause, source/hash/chronology/cutoff and complete later-human scan checks.
- All nine author verification entries' raw and committed log hashes were checked against `verification.json`; their captured summaries were inspected. The author's 151 affected tests, 19 adjacent tests, 961 fast files, full lint and format remain **author evidence**, not claimed as rerun here. Details: `author-evidence-check.json`. No duplicate whole fast/lint runs were performed.
- Reviewed production source, regression test and author report match the published hashes. The fix does not edit original grant recognition, transcript loading, source identity/hash/chronology, observation cutoff, or complete later-human scanning.
- The deferred owner instruction remains the stop boundary after completion; it supplies no authority itself and does not extend scope to another wave. No claim is made that a runtime reached that boundary.

## Exact package and preserved history

Path in the source worktree: `.scratch/runtime/2012-efc7fae47/kburson-ai-task-manager-0.1.0.tgz`.

- Size: `3005997` bytes.
- SHA256: `72b31d495dd4b828116674684276a1dc84187129d7a0e3153b297547aeb976b6`.
- SRI: `sha512-XhS7COS6LAbcUGB+KU+2SkdzeBUHzq58J0ZJU+2Ez2aO6exVROA2LqaKHqZwrUulFRhBvBYZDt+n8aw7kfKqew==`.
- Production grammar SHA256: `8781dbeade60f6f82057493a2efb1bd59b35462f60a1155e395500b5f398f1f5`.
- Regression SHA256: `8f8effadf2e165d17c425f140fcd1558f5719af8c0a3e0c9e55c8dbd39d39b26`.
- Author report SHA256: `9b209ca4ff7fcca9d0bc00b93cbcae7a6668be60384f720a0483d95c3116377b`.

All **917 regular packed files** match a clean `git archive` of the reviewed source byte-for-byte. Every raw inventory entry's path, size, SHA256 and Git blob identity matches the tarball. The committed inventory wrapper's `files` equals the immutable raw array, and both published inventory hashes match. All eight inherited module/entrypoint hashes remain identical to accepted source base `2fd90eb3f84f442e0329783943ed432b45d25473`. Details: `package-check.json`.

The original review still hashes to `e6128111a7eb51f50cda4b27c676fb0d6a7b9a4d34913059d2c7637b94329b9c`; the rejected old tarball still hashes to `5d00afbead05bb23fc824f85709d4ee91a0a4e7cdf89397e82c3f4f3c7d46626`. Neither was replaced or installed. Package extraction was solely into review scratch for verification.

## Reproduction and disposition

Use the self-contained inline native-loader reproduction in the preserved prior report, replacing its `later` string with any exact input from this report or `comparison.json`. Run from the corrected worktree so its imports resolve to the reviewed source. The transcript is synthetic and explicitly test-owned. For R2-1, R2-2 and R2-3 the actual output is `verified`, while the stated matching immediate withdrawal requires `blocked`. The full 45-case source/fix-base/tarball results are committed alongside this report.

Return to the author for scoped corrections and meaningful native-loader regressions, followed by a fresh exact-source/package review. Full upstream slow/canonical Test/Review/Done remain pending. This report authorizes no consumer/global installation, source merge/closure, broader wave execution, or live AIVC native readiness claim.
