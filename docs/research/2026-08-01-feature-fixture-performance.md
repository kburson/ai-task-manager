# Feature-Fixture Performance Evidence

**Story:** #1090

**Pinned design base:** `dd9573a1c1d8c8f0527dd457dbe29869a5d020b6`

**Implementation baseline:** `0373cbd9fd1259d45fd0c38e65a86d73a6307fe7`

**Environment:** Node v25.6.0, macOS arm64, Apple M1 Max, 10 logical CPUs

The machine-readable samples are in
[`2026-08-01-feature-fixture-benchmarks.json`](./2026-08-01-feature-fixture-benchmarks.json).
Every cluster run used five alternating cold and five warm invocations in detached,
repository-seeded worktrees. Failed samples are not discarded, and all temporary
worktrees reported successful cleanup.

## Retention decision

| Cluster/composition                       | Files | Test-file workers |       Combined median |          Combined P80 | Decision  |
| ----------------------------------------- | ----: | ----------------: | --------------------: | --------------------: | --------- |
| Runner baseline                           |     6 |                60 |          1,307.770 ms |          1,332.690 ms | Reference |
| Runner feature composition 1              |     3 |                30 | 1,325.905 ms (-1.39%) | 1,346.280 ms (-1.02%) | Restore   |
| Runner baseline, composition-2 run        |     6 |                60 |          1,319.955 ms |          1,337.870 ms | Reference |
| Runner lightweight-skeleton composition 2 |     3 |                30 | 1,280.415 ms (+3.00%) | 1,296.630 ms (+3.08%) | Restore   |
| Chore-mode baseline                       |     4 |                40 |            417.955 ms |            456.330 ms | Reference |
| Chore-mode feature composition            |     2 |                20 |  192.890 ms (+53.85%) |  312.010 ms (+31.63%) | Retain    |

Both runner compositions missed the required 25% median and P80 improvements. The
second composition removed git initialization from its repository-shaped fixture and
still improved only about 3%; combining files surrendered enough file-level parallelism
to erase the worker-count benefit. Commit `745d25b5` therefore restores the original
runner files, as the governing plan requires after two misses. The negative results are
retained rather than converted into a false success.

The chore-mode consolidation clears both thresholds despite a noisy candidate outlier.
It is retained because it replaces repeated per-test git repository initialization with
one immutable feature skeleton and explicit mutable reset.

## Old-to-new behavior map

| Baseline owner                    | Assertions | Retained owner                                                        | Disposition                                                        |
| --------------------------------- | ---------: | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `chore-mode-scope.test.mjs`       |          3 | `chore-mode-contract.test.mjs` via `chore-mode-scope.cases.mjs`       | Names and assertions preserved                                     |
| `chore-mode-state.test.mjs`       |          6 | `chore-mode-contract.test.mjs` via `chore-mode-state.cases.mjs`       | Names and assertions preserved                                     |
| `chore-mode-commit-gate.test.mjs` |          6 | `chore-mode-contract.test.mjs` via `chore-mode-commit-gate.cases.mjs` | Names and assertions preserved                                     |
| `chore-mode-verb.test.mjs`        |         11 | `chore-mode-verb.test.mjs`                                            | Names and assertions preserved; setup moved to one feature fixture |

The 26 chore-mode test names remain byte-for-byte recognizable in the candidate TAP
output. State/default/coercion behavior, audit append-only behavior, installed-guard
scope, commit-subject policy, live-fleet refusal, on/off/idempotence, resume, and status
formatting all remain covered. The runner assertion map is identity after restoration;
the new elapsed-schema assertions remain separately in `run-tests-elapsed.test.mjs`.

## Timing and fixture proof

Timing artifact schema 2 records actual `runnerMs`, `poolMs`, and `serialMs` under
`elapsed`, while `sums` owns `fileWallMs`, `inProcessMs`, and estimated spawn/IO time.
Schema 1 input remains readable but labels historical `totals.wallMs` as a sum, never
as actual elapsed. A loaded candidate sample, for example, reported 523,873.4 ms actual
runner elapsed against 2,745,005.5 ms summed file wall.

Runner and chore-mode helpers return explicit fixture handles with frozen setup,
fresh environment objects, resettable observations/transports/state, isolated owned
roots, and idempotent teardown. Chore-mode contract state is removed and recreated in
`beforeEach`; the verb tests retain per-test mutable case roots beneath one feature
skeleton. No live fleet registry, active chore-mode record, worktree, or child process
is shared across tests.

## Loaded full-lane comparison

An initial simultaneous-ref trial was rejected: it over-contended the 10-core host,
and the second sample exceeded 12 minutes before the runner could evaluate its
post-child 10-minute section ceiling. Its one completed pair remains diagnostic only.

The accepted comparison alternated refs sequentially for three complete pairs. The
schema-1 baseline has no actual-elapsed field, so its independent external wall clock is
the honest comparable measure. The candidate records both external wall and schema-2
actual runner elapsed.

| Ref                  | Accepted elapsed samples                   |   Median |      P80 |
| -------------------- | ------------------------------------------ | -------: | -------: |
| Baseline `0373cbd9`  | 437.790s, 340.340s, 182.140s external wall | 340.340s | 437.790s |
| Candidate `ef0d017f` | 347.102s, 346.185s, 186.414s actual runner | 346.185s | 347.102s |

Actual P80 improves 20.71%. Median changes by -1.72%, which is below the ADR's 5%
material-regression threshold and is not repeatable across the three alternating pairs.
All six accepted lane runs passed. The candidate samples also prove that actual elapsed
stays independent of much larger summed file-wall values.

## Line and layout analysis

All discovered feature files remain below the 800-code-line hard cap:

| File                           | Raw lines | Code lines |
| ------------------------------ | --------: | ---------: |
| `chore-mode-contract.test.mjs` |        27 |         22 |
| `chore-mode-verb.test.mjs`     |       313 |        280 |
| `feature-fixtures.test.mjs`    |        86 |         80 |
| `chore-mode-fixture.mjs`       |        78 |         65 |
| `runner-fixture.mjs`           |        49 |         39 |

The layout meta-test recognizes the lane-owned `fixtures/` bucket, verifies feature
owners remain in the unit lane, and continues to reject loose lane-root files, invalid
subsystem placement, dropped or lane-changed baseline tests, partition divergence, and lost
git-move provenance. Production-file limits are unchanged.
