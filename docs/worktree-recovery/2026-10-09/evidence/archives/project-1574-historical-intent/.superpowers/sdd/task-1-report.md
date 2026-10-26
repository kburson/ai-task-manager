# Task 1 Report: Version Retroactive Reconciliation Evidence

## Implementation summary

Added the exact `aitm.delivery-method-reconciliation/v2` contract for records
whose `intentOrigin` is exactly `retroactively-reconstructed`. The builder
creates frozen v2 records only for that origin, and validation chooses the
exact v1 or v2 key set based on the schema. V2 validation refuses a modified
origin. V2 rendering explicitly records that no delivery-time intent existed
and that the external intent was reconstructed from provider and Git evidence.
The v1 builder inputs, v1 keys, and v1 rendering branch remain unchanged.

## Files changed

- `scripts/task-tracker/lib/delivery-method-reconciliation.mjs`
- `scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs`

## RED evidence

Command:

```sh
node --test scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs
```

Output:

```text
✔ builds a reconciliation record carrying both methods and the reason (1.655875ms)
✖ builds a frozen v2 reconstruction record with the exact retroactive origin (0.613417ms)
✖ validates a v2 reconstruction record and refuses a tampered origin (0.429375ms)
✖ renders v2 with the no-delivery-time-intent reconstruction explanation (0.513167ms)
✔ records are frozen so a caller cannot mutate recorded evidence (0.107125ms)
✔ divergent is false when the observed method equals the configured one (0.078375ms)
✔ refuses an empty or whitespace reason (0.113917ms)
✔ refuses a reason that is only a placeholder (0.097042ms)
✔ refuses a merge method outside the known set (0.117375ms)
✔ refuses malformed shas (0.150041ms)
✔ validate accepts a freshly built record and rejects a tampered one (0.117625ms)
✔ resolve returns the declared method when observation agrees (0.070958ms)
✔ resolve refuses when the declared method contradicts observation (0.059375ms)
✔ resolve refuses a no-op reconciliation that matches configuration (0.06925ms)
✔ resolve refuses an unknown observation rather than guessing (0.055ms)
ℹ tests 15
ℹ suites 0
ℹ pass 12
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 56.550833

✖ failing tests:

test at scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs:60:1
✖ builds a frozen v2 reconstruction record with the exact retroactive origin (0.613417ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected

  + 'aitm.delivery-method-reconciliation/v1'
  - 'aitm.delivery-method-reconciliation/v2'

test at scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs:84:1
✖ validates a v2 reconstruction record and refuses a tampered origin (0.429375ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /delivery-method-reconciliation:intent-origin/. Input:

  'TypeError: delivery-method-reconciliation:keys'

test at scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs:95:1
✖ renders v2 with the no-delivery-time-intent reconstruction explanation (0.513167ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /No delivery-time intent existed/.
```

This was expected: the pre-change builder ignored `intentOrigin`, emitted a v1
record without that key, v1 validation rejected the added key, and the visible
comment had no retroactive reconstruction explanation.

## GREEN evidence

Command:

```sh
node --test scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs
```

Output:

```text
✔ builds a reconciliation record carrying both methods and the reason (1.430125ms)
✔ builds a frozen v2 reconstruction record with the exact retroactive origin (0.159458ms)
✔ validates a v2 reconstruction record and refuses a tampered origin (0.2645ms)
✔ renders v2 with the no-delivery-time-intent reconstruction explanation (0.175541ms)
✔ records are frozen so a caller cannot mutate recorded evidence (0.070958ms)
✔ divergent is false when the observed method equals the configured one (0.059208ms)
✔ refuses an empty or whitespace reason (0.090416ms)
✔ refuses a reason that is only a placeholder (0.095292ms)
✔ refuses a merge method outside the known set (0.108125ms)
✔ refuses malformed shas (0.124084ms)
✔ validate accepts a freshly built record and rejects a tampered one (0.113584ms)
✔ resolve returns the declared method when observation agrees (0.058959ms)
✔ resolve refuses when the declared method contradicts observation (0.060291ms)
✔ resolve refuses a no-op reconciliation that matches configuration (0.057958ms)
✔ resolve refuses an unknown observation rather than guessing (0.059708ms)
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 54.11875
```

## Other checks

- `git diff --check` completed with no output before the commit.

## Commit

- `1d04b8af [#1574] Record retroactive intent reconstruction`

## Self-review

- Confirmed a legacy input retains the exact v1 key set in a regression test.
- Confirmed v2 has exactly the one additional `intentOrigin` key and produces a frozen record.
- Confirmed schema-selected validation rejects a tampered v2 origin.
- Confirmed v2 visible wording explains both the missing delivery-time intent and its provider/Git reconstruction.
- Reviewed the final two-file diff; no unrelated production or test files were staged.

## Concerns

None. The prescribed focused suite is green. No broader suite was run because
this task explicitly required the focused test command and scoped this to one
TDD slice.
