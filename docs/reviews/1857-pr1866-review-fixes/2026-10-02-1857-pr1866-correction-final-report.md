# #1857 / PR #1866 Correction Final Report

## Outcome

Commit `bc977b61e32ec5f00c0449110e32e977650f27af` resolves the requested regressions against base `d4c42d7809c22acc9576d51da8938952588c207e`. Follow-up review also established owning-root cursor isolation and classified departure handling after pending-journal replay.

Astra found no remaining actionable findings in the limited 10-file fix set and independently passed 47/47 tests. This accepts the bounded correction only; it is not whole-PR release, lifecycle, or operational approval.

## Corrected behavior

- Test worktrees and their reaper share `.ai-task-manager/runtime/test-sandboxes` while preserving exact legacy `.tmp` cleanup.
- Missing actor state falls back only to the validated current actor's cursor, scoped to the owning root.
- `flushActiveToGH` replays pending journals before treating classified no-open-timer departures as idempotent for Pause, Stop, and typed/legacy switches.
- Child Close fixtures seed a local actor through `saveState` and restore exact initial ledger bytes for refusal/no-side-effect assertions.

Broader root attribution and migration remain follow-up work.

## Evidence

| Evidence                      |                                    Result | Receipt                                |
| ----------------------------- | ----------------------------------------: | -------------------------------------- |
| Focused correction batch      |                            130/130 passed | `receipts/fixes-final-focused.txt`     |
| Separate outcome batch        |                              75/75 passed | `receipts/fixes-outcome-tests.txt`     |
| Independent Astra batch       |                              47/47 passed | `receipts/astra-final-fixes-tests.txt` |
| Affected ESLint and Prettier  |                                    Passed | `receipts/affected-quality.txt`        |
| Story-tag audit               |                              1,210 passed | `receipts/affected-quality.txt`        |
| Line-cap audit                |                                    Passed | `receipts/affected-quality.txt`        |
| Base unit lane                |                     43 failed / 930 files | `receipts/base-unit.txt`               |
| Frozen exact-source unit lane | 894 passed, 36 failed / 930 files; exit 1 | `receipts/fixes-final-unit-frozen.txt` |
| Base/candidate comparison     |   0 new failures; 7 base failures cleared | `receipts/unit-comparison.json`        |

All 36 candidate failures are a subset of the 43 base failures. The comparison shows that this correction introduced no new failed file; it does not make the unit lane green. These counts are not subtracted from the historical 109/933 baseline. `npm test` is the unit-only fast lane here, not integration.

Package Markdownlint remains blocked by 19 existing errors in four earlier review files. The newly added Markdown passes a scoped check using the repository rule configuration.

## Exact reviewed identity

- Base: `d4c42d7809c22acc9576d51da8938952588c207e`
- Fix: `bc977b61e32ec5f00c0449110e32e977650f27af`
- Tracked patch SHA256: `bb70fce2b7032b6c10d636dbb4060439e83fd5dbaa7c474ac7c69a45bcd44c54`
- Regression suite SHA256: `7d9bebe6a6e7a53245e384aa35108d725d8c15a35e395312306969c6f0c937d8`

The original WIP local branch and checkout remain at `d4c42d7809c22acc9576d51da8938952588c207e` with their index provenance untouched. The remote publication fast-forwards through `bc977b61e32ec5f00c0449110e32e977650f27af` plus collateral. The original dirty checkout is deliberately not reconciled in this correction.

## Review sequence and destination

Collateral is retained under `docs/reviews/1857-pr1866-review-fixes/` and actual receipts to its `receipts/` subdirectory:

1. Original requested-changes review: `01-astra-pr-review.md`.
2. Follow-up review: `02-astra-fix-review.md`.
3. Accepted limited-fix review: `03-astra-fix-review-acceptance.md`.

Retain the focused, outcome, independent, base-unit, frozen-candidate, comparison, and affected-quality receipts without implying that focused passes replace aggregate evidence.

## Disposition

Bounded fix: **accepted with no actionable findings**.

Whole PR: **not release-ready or merge-ready on this evidence**. Thirty-six unit files still fail, and C1–C5 remain unfinished. Runtime migration, cleanup/install parity, live activation, exact-SHA combined verification, lifecycle approval, and operational admission remain governed by the accepted #1857 plan.
