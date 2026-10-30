# Independent code review — #2044 — round 1

## Original raw report — verbatim

### Strengths

The module cleanly preserves all eight fields, Unknown values, historical metadata and independent actors. Replay, cursor alias detection, backdated ordering, detached immutable output and malformed-data refusal are covered well.

### Issues

#### Important — P2: Floating-point cancellation can silently accept overlapping positive intervals

**File:** `scripts/task-tracker/lib/story-cache/timing-events.mjs:71` and `:104`

Subtracting a small measured duration from an absolute epoch timestamp can round the interval start back to its endpoint. The subsequent strict comparison then treats positive intervals as nonoverlapping.

**Reproduction:** Two events with distinct event IDs/cursors, the same actor, timestamp `2026-10-19T12:00:00.000Z`, `activeSeconds: 0.0000001` and `idleSeconds: 0` are accepted together. Both positive intervals end at the same instant and necessarily overlap.

The arithmetic can also manufacture conflicts near the epoch: an interval ending at `1970-01-01T00:00:00.000Z`, followed by one ending at `.300Z` with active `0.1` and idle `0.2`, is rejected because its computed start is approximately `-5.68e-14` milliseconds.

**Recommendation:** Avoid subtracting fractional durations from large absolute timestamps for overlap decisions. Compare relative endpoint differences using a clearly defined precision policy; retain definite same-instant positive-overlap detection. Add regressions for both cases without rounding the stored durations.

#### Critical / Minor

None identified.

### Verification

- Focused timing-event verifier: **45 passed, 0 failed**.
- Combined command using story-cache unit glob, store integration path and unit-lane-purity path: **247 passed, 0 failed**.
- Independent inline probes reproduced both arithmetic cases above.
- Inspected the complete diff, accepted Task 13 scope, original Task 5 contract, governing timing requirements and committed review/TDD collateral.
- No edits or Git-state changes performed.

### Declined to judge

- Native cumulative-total conversion and row parsing: explicitly owned by adapters outside this pure merger.
- Persistence, crash recovery and ingestion/publication cursor advancement: later slices #2060/#2061.
- Actor emission authorization and remote publication: outside this module’s authority.
- Native lifecycle acceptance, exact-head CI and package execution: not independently exercised in this offline review.

### Assessment

**Ready to merge? With fixes.**

The implementation follows its bounded scope, but the overlap safeguard needs precision-safe arithmetic to uphold its contract for accepted fractional durations.

## Subsequent clarification — verbatim

Correction: **247 was only the story-cache unit glob**, not the author’s complete 286-test combination.

My exact command was:

```sh
node --test scripts/tests/unit/task-tracker/lib/story-cache/*.test.mjs scripts/tests/integration/story-cache-store.test.mjs scripts/tests/unit/task-tracker/core/unit-lane-purity.test.mjs
```

The two explicit paths were incorrect and did not execute. The actual paths are:

```text
scripts/tests/integration/task-tracker/lib/story-cache/store.integration.test.mjs
scripts/tests/unit/meta/unit-lane-purity.test.mjs
```

Retain my independently verified result as **247 cache unit tests passed; store integration and purity were not independently exercised**. The separately run focused suite passed all 45 tests.

The proposed decimal-coefficient BigInt repair addresses both reproduced failures while preserving recorded durations and Unknown semantics. Comparing successive positive spans chronologically is sufficient: with earlier spans already accepted as disjoint, any new overlap necessarily reaches the immediately preceding positive interval. No suite rerun performed pending the committed repair.

## Author disposition

The Important precision finding was accepted and repaired with exact canonical decimal BigInt spans and relative endpoint differences. Stored durations are not rounded, and null remains unchanged. The author reported two new regressions failing before repair (45 passed, 2 failed). Round 2 records independent review of the applied repair and corrected verification paths, authorized before commit. Reviewer model was inherited and unspecified; no specific model identity is claimed.
