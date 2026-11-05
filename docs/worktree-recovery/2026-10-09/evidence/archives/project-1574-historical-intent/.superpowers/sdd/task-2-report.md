# Task 2 Report: Intent-Free Historical Reconstruction Preflight

## Implementation summary

Added `validateHistoricalReconstructionPreflight(input)` as a separate, intent-free authority validator. It accepts only the historical input shape without `checks` or `intent`, derives its result from accepted delivery authority, requires an advanced observed local head and a matching merged PR, verifies exact Test/Review/PR-head evidence, rejects dirty overlap, validates provider-action configuration, and derives commit attribution. Its returned projection is deeply frozen. `validateHistoricalRecoveryPreflight` was not changed.

## Files changed

- `scripts/task-tracker/lib/delivery-preflight.mjs`
- `scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs`

## RED verification

Command:

```bash
node --test scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs
```

Output:

```text
SyntaxError: The requested module '../../../../task-tracker/lib/delivery-preflight.mjs' does not provide an export named 'validateHistoricalReconstructionPreflight'
✖ scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

This failure was expected: the newly added scoped tests imported the required public validator before its production export existed.

## GREEN verification

Command:

```bash
node --test scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs
```

Output:

```text
✔ auto both/review provide repeatable standing authority; off and reset revoke/re-evaluate it
✔ approval evidence must be current-head and genuine human approval remains independent
✔ fresh Test and Agent Review cannot rebind an approval from an older head
✔ stale Full-Auto body evidence cannot survive auto off or reset
✔ standing Full-Auto authorizes immutable A while a reused branch is observed at B
✔ reconstructs intent authority only from an advanced merged historical delivery
✔ historical reconstruction refuses authority that is not an advanced, clean merged delivery
✔ Full-Auto changes only review authorization; delivery safety gates still refuse independently
✔ runApprove remains the audited producer of Full-Auto approval evidence
✔ stale human approval cannot be silently rebound after head drift
ℹ tests 10
ℹ pass 10
ℹ fail 0
```

The run also emitted existing `approve: lifecycle-tick-noop` informational lines from the approval tests; it exited zero with no test failures.

## Other tests

```bash
node --test scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs scripts/tests/unit/task-tracker/lib/delivery-authority.test.mjs
```

Output: 13 passing, 0 failing. `git diff --check` exited zero before commit.

## Commit

`146845bd [#1574] Validate historical intent reconstruction authority`

## Self-review

- Confirmed the reconstruction validator has its own exact key list and refuses an `intent` field.
- Confirmed it reuses the established authority, merged-PR, accepted-head, dirty-path, configuration, and attribution primitives.
- Confirmed the existing `validateHistoricalRecoveryPreflight` implementation is unchanged.
- Confirmed success coverage proves the full frozen projection; refusal coverage includes current head, unmerged PR, SHA mismatch, dirty paths, wrong lineage, and invalid configuration.
- Confirmed the committed diff contains only the two task-required files.

## Concerns

None.
