# #1857 / PR #1866 Requested-changes Correction Plan

## Purpose and identity

Repair the three runtime regressions reproduced by the independent Astra review and the clean-environment Child Close harness defect, including the two boundary defects found during follow-up review.

- Base: `d4c42d7809c22acc9576d51da8938952588c207e`
- Fix commit: `bc977b61e32ec5f00c0449110e32e977650f27af`
- Changed files: 10
- Reviewed tracked patch SHA256: `bb70fce2b7032b6c10d636dbb4060439e83fd5dbaa7c474ac7c69a45bcd44c54`
- New regression suite SHA256: `7d9bebe6a6e7a53245e384aa35108d725d8c15a35e395312306969c6f0c937d8`

The accepted review patch exactly matches `git diff --abbrev=9 d4c42d78 bc977b61` when the separately hashed new regression file is excluded. This is a bounded correction, not C1–C5 completion or whole-PR release approval.

## Completed correction

1. **Test sandbox admission and cleanup**
   - Production Test creation and registered cleanup share `.ai-task-manager/runtime/test-sandboxes`.
   - Cleanup retains exact legacy `.tmp` support and rejects foreign, nested, live, or unproved candidates.
2. **Own-session cursor compatibility and root isolation**
   - Missing actor timing state uses only the validated current provider/session cursor.
   - `markerPathFor` accepts an optional owning root, and `loadState` supplies the state file's project root.
   - Cross-root same-actor cursor reads and unattributed global-history imports remain refused.
3. **Classified idempotent departure**
   - `flushActiveToGH` reconciles any pending journal before the no-open-timer return.
   - The existing classifier makes Pause, actual Stop, and typed/legacy switch departures idempotent without inventing an actor start.
4. **Clean Child Close harness**
   - The fixture creates a local actor, initializes through `saveState`, then restores exact initial compatibility-ledger bytes for refusal/no-side-effect assertions.

Broader root attribution and migration remain C1/C2 follow-up work.

## Acceptance criteria

- [x] Production Test worktrees resolve outside artifact roots.
- [x] New and legacy Test sandboxes retain exact cleanup safety.
- [x] Validated own-session cursors remain monotonic and isolated by owning root.
- [x] Pause, Stop, and typed/legacy switching publish no duplicate departure after a closed interval.
- [x] Pending journal replay precedes idempotent departure handling.
- [x] Clean Child Close fixtures reach their assertions and preserve exact refusal bytes.
- [x] The patch adds no authority bypass, live migration/default activation, cleanup action, or C1–C5 completion claim.

## Verification

- Initial RED: 7 failures, comprising 4 regression assertions and 3 Child Close fixture failures.
- Final focused controller batch: 130/130 passed, `receipts/fixes-final-focused.txt`.
- Separate outcome batch: 75/75 passed, `receipts/fixes-outcome-tests.txt`.
- Independent Astra isolated batch: 47/47 passed, `receipts/astra-final-fixes-tests.txt`.
- Affected JavaScript ESLint and Prettier: passed.
- Story-tag audit: 1,210 passed.
- Line-cap audit: passed.
- Base unit lane: 43 failed files of 930, `receipts/base-unit.txt`.
- Frozen exact-source candidate lane: 894 passed files and 36 failed files of 930, exit 1, `receipts/fixes-final-unit-frozen.txt`.
- Comparison: zero new failed files; all 36 failures are a subset of the base 43; seven files no longer fail, `receipts/unit-comparison.json`.

The remaining 36 unit-file failures block a whole-PR release claim. They are not subtracted from historical 109/933 evidence.

## Review boundary and destination

Astra found no actionable findings in the limited fix set. Subsequent source changes invalidate the exact-patch acceptance for changed paths. C1–C5 runtime migration, cleanup/install parity, live activation, aggregate repair, and operational admission remain outstanding.

Final collateral is retained under `docs/reviews/1857-pr1866-review-fixes/`, with actual receipts under `docs/reviews/1857-pr1866-review-fixes/receipts/`.
