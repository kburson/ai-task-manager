# Independent machine delta review — AITM #1889 / PR #1890

Date: 2026-10-05.
Exact reviewed head: 9bb4a2806b47ef53d30c15cc1f0dc4e05d9efc30.
Previously reviewed baseline: 9d129f9adde146f2283d8800b8b0e7cde66fb985.
Reviewer: actual Codex #144 actor, session01a10a24-0dc2-7e31-86bc-0f63380e50d6.
Mode: read-only independent machine review. No human approval or independently rerun test suite claimed.

## Findings

No actionable priority P0/P1/P2/P3 findings in this bounded exact-head delta.

## Review basis

All eight supplied after/context artifact SHA256 and byte receipts verified.
Observed delta diff SHA256:474e235fd9da39f768ebe9312dad1c84479c752a8d4b7cac0e588ac21c094e28.
Reviewed the complete delta plus unchanged actor-state-isolation, unit-lane-purity and timing-event-emitter characterization tests. Original exact-head source authority/rollback contexts remain those in the earlier verified29-entry bundle.

The earlier machine review missed the generic cross-issue state spread and the repository unit-lane/source-line policies. Real CI demonstrated those defects. The earlier failure evidence remains retained; this review supersedes no historical failure and claims no broader initial TIA pass.

## Production correction and edge cases

scripts/task-tracker/state.mjs:331-336 compares the owning session's prior binding with the supplied state. If active issue changes and the supplied non-null generation is exactly the prior issue generation, the field is omitted. Because the same-issue prior-record spread is skipped at340, omission removes the prior generation rather than accidentally retaining it in the target record.

This matches the existing actor-state-isolation regression at scripts/tests/unit/task-tracker/lib/actor-state-isolation.test.mjs:207-208, whose load/spread changes active issue and expects undefined generation. It preserves same-issue generation/bound time, cycle state continuity only for the same binding, and existing invalid-actor refusal before any binding write.

A distinct successful target claim generation is retained, so native switch remains valid; rollback restoration of a prior distinct generation remains valid. Explicit null or undefined still clears the field through the earlier worktree projection rule. An absent field cannot import a different session's record because getActiveTask selects the current session/root. Shared read/save stripping at269/369 remains unchanged. The guard invents no generation, consults no shared authority fallback and weakens no occupancy collision or rank-wave comparison.

The generic state store is not a substitute for occupancy admission: supplied nonmatching/foreign authority still requires the unchanged production occupancy/session/physical/native checks. This delta does not claim a new authenticity gate for arbitrary manually constructed private state writes.

## Regression structure

The three Git-backed generation test files move from scripts/tests/unit into scripts/tests/integration. This follows the unchanged unit-lane-purity contract, which explicitly classifies transitive fixture sandbox/Git/Node reach and requires moving offending tests rather than widening its classifier. Resume/switch relative imports remain correct at their equal directory depth; state test helper/product imports add one parent level for its new lib directory. Assertions and fixtures are preserved.

scripts/tests/fixtures/state-engine-policy-baseline.mjs changes exactly five line-number observations: resume257/504/531 and switch124/246. They match the unchanged emitter expressions at those lines in the reviewed production resume/switch snapshots. Event vocabulary, strict-reader mappings, discovery logic and full-marker requirements remain unchanged; there is no characterization waiver.

## Test evidence and limits

Read the retained original ci-unit-failure.txt: it records actor-state-isolation stale generation, unit-lane purity classification and emitter line characterization failures. Read ci-regression-green.txt: it records37 tests,37 pass,0 fail,0 skipped. These are actual supplied execution receipts, not a suite independently rerun by this reviewer.

Root reports fast CI37265976916 success at9bb; explicit full CI37266476621 is awaiting complete receipts. No full local suite was run. Broader initial TIA was stopped after a genuine stale-generation failure and is not represented as passing.

The earlier installed native bind/parent assertion coverage remains bounded fixture proof; this delta does not establish completed-member lineage, full wave publication, technical owner adoption or human approval.

## #144 admission check and timer

Fresh native npx aitm explain144 --json after #145 entered Test returned schema aitm.action-explanation/v2, actionId promote, status blocked, guardId refine-exit-wip-budget, code unclassified-refusal, noAutomaticRemediation.reason legacy-guard-requires-human-investigation. Receipt: .scratch/144/prerequisite1889-delta-explain144.stdout.txt.

No blocked lifecycle advance, #1889 action, source edit or extra agent was performed. #144 native timer was resumed using its actual paused actor before review; pause-after-review receipt will be retained separately.

Native pause succeeded; own actor verifies active:null,lastActive:#144,paused:true,pausedAtTs:2026-10-05T05:12:37.717Z. Receipt: .scratch/144/prerequisite1889-delta-pause.stdout.txt.
