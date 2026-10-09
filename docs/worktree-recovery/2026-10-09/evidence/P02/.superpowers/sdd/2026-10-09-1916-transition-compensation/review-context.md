# #1916 fresh review context

Plan: docs/superpowers/plans/2026-10-09-1916-transition-compensation.md
Spec: docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md
Original plan Task 5: docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md
Ledger: .superpowers/sdd/2026-10-09-1916-transition-compensation/progress.md

## Scope

Remaining-work repair child of #1918, a sibling scope split from1855 under1847. Original1855 retains its already implemented checkpoint, historical timeline and PR1907 collateral; do not charge or rebuild that work here. Preserve the complete accepted Task5 contract and governing specification.

Published baseline14f6c5589724e9d2a33c2353c19f0c793bfe6033 differs from its preserved58-WIP/2544-source donor. Qualify reused fixes and tests on this child's integrated HEAD; old local receipts are not new-head or published CI proof.

Direct native blockers: #1912. Shared-file changes integrate in dependency order; no parallel owners of one authority protocol. No child depends on1855Done, which waits for1918.

Remaining delivery steps:
- Reuse the already extracted original bounded compensation program and public pre-getter guard.
- Connect original board-exhaustion rollback bytes/version/status, durable custody/resources/lock and actual audit.
- Prove exhaustion/mismatch/interrupted compensation; partial-result/cancellation/join reporting belongs1924.

Source review surfaces:
- `scripts/task-tracker/lib/state-recording.mjs`
- `scripts/task-tracker/lib/move-state/github-mutation.mjs`
- `scripts/task-tracker/lib/move-state/move-state-core.mjs`
- `scripts/task-tracker/lib/criteria-revision/stage-execution.mjs`
- `scripts/task-tracker/lib/criteria-revision/store.mjs`

Each child owns its actual source entrypoints and focused behavior/fault/current-authority tests plus required ordinary regression checks. Record inherited failures with their owners; a scoped repair pass is not globally green CI. No test removal, budget increase, guard weakening, authority cache, production activation or required-check waiver. The final complete/vertical and public-consumer union remain1918 obligations.

Node.js scripts and Markdown only; no compiled native binaries/addons. Add declared targeted regression files where absent during implementation; verifier declarations are not evidence already executed. Any revised Estimate >=24 is flagged and split before further work.

### Remaining-work WBS

- Original bounded rollback bytes/version/status algorithm: 3h.
- Genuine compensation/audit custody/resource/lock integration: 5h.
- Exhaustion/mismatch/interruption/audit cases: 4h.

Prospective remaining-work estimate: 12 human hours. Reuses prior implementation and tests, includes incremental authoring/diagnosis/review, excludes passive CI wall time and historical effort. No duplicated share of1855's historical52-hour-equivalent estimate.


## Explicit pending scope

All normal child lifecycle and current Linux/full/slow aggregate receipts remain pending. Actual restart/reentry belongs #1915; partial facade/cancellation/join #1924; dispatcher/cache #1913; downstream #1921; complete/vertical and runner/consumer union #1917. No production route is enabled. Current runner classification of new focused/wrapper files is a known aggregate runtime obligation, not a green CI claim. No new issue or defect will be created.

## Qualification evidence

Genuine ordinary failed rollback RED→GREEN, full native exhausted-board RED→GREEN, body/retry and audit fault RED→GREEN, and genuine forged-return getter RED→GREEN are recorded in the ledger. Final command is running with ten body/return and twelve audit/current native cases, all original fixtures/guards and four isolated workers; limits600s per semantic file and1200s combined. Audit group now passed494.34s. Prior current-source ordinary/DATA boundaries221/221 and package/import18/18 passed. Full lint/format passed after narrowing unused test-observer stack capture. Final body/whole result will be appended before dispatch.

Follow-up source change before review: two public store comparison/release roots needed pre-getter descriptor checks. Genuine unit RED19pass/2fail thenGREEN21/21. Complete native qualification is being refreshed after that source fix; earlier30/30 result was988.37s, audit494.34s/body488.77s.

Final qualification after resource guard change:30/30 top-level,22 genuine native files,31 original bounded/board/atomicity and21 public boundaries; zero skips/cancellations. Audit570.62s/body477.03s, combined1055.74s under unchanged600/1200s limits. Current affected223/223, package/import18/18, full lint/format pass. All shell sessions completed before commit/review. No current Linux/full/slow aggregate or lifecycle claim.
