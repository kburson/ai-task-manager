# Feature-Oriented Test-Fixture Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce repeated Node startup and fixture construction by grouping
related tests around feature boundaries and sharing safe setup, while preserving
parallelism, isolation, readability, and behavioral coverage.

**Architecture:** First correct the timing model so it distinguishes actual lane
elapsed time from summed per-file wall time. Then migrate two measured feature
clusters: the test-runner cluster and the chore-mode cluster. Each cluster uses
feature-level files plus stateless helper modules, nested `describe` suites, and
explicit immutable/mutable fixture life cycles. The migration is retained only
when repeated measurements show a net improvement.

**Tech Stack:** Node.js ESM, `node:test` hooks, AITM test runner/timing artifact,
temporary repositories and worktrees.

**Governing spec:**
`docs/superpowers/specs/2026-08-01-execution-performance-and-adaptive-estimation-design.md`

**Predecessor:** Closed-not-planned issue #945. This is a successor with a new
performance objective; do not reopen #945 or preserve its unchanged-file-count
constraint.

**Delivery order:** Begin after stage-aware verification is integrated; complete
before resuming #1070.

**Initial planning baseline:** Human 6h; AI P50 4h; AI P80 6h. Plan must replace
these values if the timing baseline changes the migration scope.

## Backlog Story Contract

**Title:** Consolidate Tests into Feature-Oriented Shared Fixtures

**Shape:** Solo story

**Dependencies:** Stage-Aware Verification and Exact-SHA Evidence Reuse. This
story blocks resumption of #1070.

**Acceptance Criteria:**

- Timing artifact schema separates actual lane/pool/serial elapsed time from
  summed per-file wall and in-process time.
- A reproducible benchmark compares five cold and five warm samples without
  mutating the caller's worktree.
- The runner cluster is reduced from six files to three cohesive feature files;
  the chore-mode cluster is reduced from four files to two.
- Shared helpers expose explicit fixture handles, immutable shared setup,
  per-test mutable reset, isolated concurrency-sensitive resources, and
  idempotent teardown.
- Each retained cluster improves median and P80 elapsed time by at least 25%; a
  cluster missing the threshold after two compositions is restored and its
  negative evidence retained.
- Loaded full-suite actual P80 improves measurably with no repeatable material
  regression in another lane.
- The test-tree ADR records feature grouping, soft-400/hard-800 test limits,
  semantic split triggers, and unchanged production-file limits.

**Verification Commands:**

```bash
node --test scripts/task-tracker/tests/unit/fixtures/feature-fixtures.test.mjs
node --test scripts/task-tracker/tests/unit/core/run-tests-discovery-lanes.test.mjs
node --test scripts/task-tracker/tests/unit/core/run-tests-process-pool.test.mjs
node --test scripts/task-tracker/tests/unit/core/run-tests-timing-policy.test.mjs
node --test scripts/task-tracker/tests/unit/lib/chore-mode-contract.test.mjs
node --test scripts/task-tracker/tests/unit/lib/chore-mode-verb.test.mjs
npm run format:check
npm run lint
npm run test:unit
npm run test:integration
npm run test:slow
```

**Definition of Done:** Exact final SHA reviewed; old-to-new behavior map,
benchmark JSON, actual lane timing, line-count/isolation proof, and full-lane
regression analysis are attached to the issue.

## Invariants

- Feature ownership, not assertion shape or shared mocks, determines grouping.
- Test files remain in their existing lane unless measured behavior justifies an
  explicit lane change.
- Shared `before` state is immutable after construction.
- Mutable observations and state are reset in `beforeEach`.
- Helpers return new state or accept an explicit fixture; they do not expose a
  cross-file mutable singleton.
- Unique fleet registries, temp directories, repositories, and worktrees remain
  per test when they protect concurrency or cleanup correctness.
- Aggregated test files use a soft 400-line review threshold and hard 800-line
  cap. Production-file limits remain unchanged.
- A consolidation that loses more parallel execution than it saves in startup
  or setup time is rejected.
- Production behavior does not change in this story.

## Target Composition

The first migration reduces ten files to five feature files without creating a
monolith:

| Current files                                                                               | Result                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------ |
| `run-tests-discovery.test.mjs`, `run-tests-lanes.test.mjs`                                  | `run-tests-discovery-lanes.test.mjs` |
| `run-tests-pool.test.mjs`, `run-tests-kill-report.test.mjs`                                 | `run-tests-process-pool.test.mjs`    |
| `run-tests-timing.test.mjs`, `run-tests-ceiling.test.mjs`                                   | `run-tests-timing-policy.test.mjs`   |
| `chore-mode-scope.test.mjs`, `chore-mode-state.test.mjs`, `chore-mode-commit-gate.test.mjs` | `chore-mode-contract.test.mjs`       |
| `chore-mode-verb.test.mjs`                                                                  | remains `chore-mode-verb.test.mjs`   |

The existing runner cluster is roughly 781 lines and could fit below the raised
hard cap, but it must not become one file merely because it fits. Discovery,
process-pool, and timing policy use different life cycles and failure scopes, so
the three resulting runner files each own one coherent sub-capability. The
chore-mode verb stays separate because it owns the CLI/process lifecycle, while
the contract file owns state, scope, and commit gates.

## Shared Interfaces

```js
createRunnerFixture({ files, lanes, parallelSafety });
resetRunnerFixture(fixture);
destroyRunnerFixture(fixture);
createChoreModeFixture({ state, repository });
resetChoreModeFixture(fixture);
measureTestCluster({ projectDir, files, samples, environment });
compareTestClusterMeasurements({ baseline, candidate, threshold });
```

Fixture helpers live under
`scripts/task-tracker/tests/fixtures/<feature>/` and return explicit handles.
They never register global teardown as an import side effect.

---

## Task 1: Correct the Timing Model Before Optimizing

**Files:**

- Modify: `scripts/run-tests.mjs`
- Modify: `scripts/run-tests-timing.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/run-tests-timing.test.mjs`
- Create: `scripts/task-tracker/tests/unit/core/run-tests-elapsed.test.mjs`

- [ ] Add RED tests proving artifact schema 2 records actual runner elapsed,
      unit-pool elapsed, serial elapsed, and summed per-file wall time as
      separate values.
- [ ] Preserve schema 1 parsing for historical timing artifacts, labeling its
      `totals.wallMs` as a sum rather than actual lane elapsed.
- [ ] Record pool and serial section start/end times around their actual
      execution, then pass them through `serializeArtifact` metadata.
- [ ] Add report text that clearly distinguishes `elapsed`, `summed file wall`,
      `in-process`, and estimated spawn/IO cost.
- [ ] Prove parallel files can have a summed wall duration greater than actual
      pool elapsed without corrupting the report.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/core/run-tests-timing.test.mjs
node --test scripts/task-tracker/tests/unit/core/run-tests-elapsed.test.mjs
```

## Task 2: Add a Reproducible Cluster Benchmark

**Files:**

- Create: `scripts/benchmarks/compare-test-fixtures.mjs`
- Create: `scripts/task-tracker/tests/unit/tools/compare-test-fixtures.test.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`

- [ ] Add RED tests for parsing `--baseline-ref`, `--candidate-ref`, repeated
      `--file`, `--samples`, and `--output` without shell interpolation.
- [ ] Implement isolated temporary worktrees for both refs using existing
      scratch/worktree helpers; seed each with the repository-owned setup path.
- [ ] Run each file collection five cold samples and five warm samples by
      default, alternating ref order to reduce environmental bias.
- [ ] Emit JSON with environment fingerprint, sample durations, median, P80,
      file count, process count, failures, and cleanup result.
- [ ] Implement comparison output for percent change and the governing 25%
      cluster threshold. A failed sample fails the benchmark rather than being
      discarded.
- [ ] Ensure the benchmark cannot mutate the caller's working tree and removes
      only its explicit temporary worktrees.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/tools/compare-test-fixtures.test.mjs
node scripts/benchmarks/compare-test-fixtures.mjs --help
```

## Task 3: Build Stateless Feature Fixture Helpers

**Files:**

- Create: `scripts/task-tracker/tests/fixtures/run-tests/runner-fixture.mjs`
- Create: `scripts/task-tracker/tests/fixtures/chore-mode/chore-mode-fixture.mjs`
- Create: `scripts/task-tracker/tests/unit/fixtures/feature-fixtures.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/meta/test-tree-layout.baseline.json`

- [ ] Write RED tests that two runner fixtures and two chore-mode fixtures can
      coexist without paths, environment variables, state, or cleanup crossing.
- [ ] Implement one expensive immutable root per feature file, created in
      `before`, plus explicit per-test reset operations used by `beforeEach`.
- [ ] Make subprocess environment construction return a fresh object each time;
      never mutate global `process.env` outside a bounded test restoration.
- [ ] Make teardown idempotent and validate that fleet/temp artifacts no longer
      exist after `after`.
- [ ] Document in helper comments which resources are safe to share and which
      must remain per-test.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/fixtures/feature-fixtures.test.mjs
```

## Task 4: Consolidate the Test-Runner Feature Cluster

**Files:**

- Create: `scripts/task-tracker/tests/unit/core/run-tests-discovery-lanes.test.mjs`
- Create: `scripts/task-tracker/tests/unit/core/run-tests-process-pool.test.mjs`
- Create: `scripts/task-tracker/tests/unit/core/run-tests-timing-policy.test.mjs`
- Delete after parity proof: `scripts/task-tracker/tests/unit/core/run-tests-discovery.test.mjs`
- Delete after parity proof: `scripts/task-tracker/tests/unit/core/run-tests-lanes.test.mjs`
- Delete after parity proof: `scripts/task-tracker/tests/unit/core/run-tests-pool.test.mjs`
- Delete after parity proof: `scripts/task-tracker/tests/unit/core/run-tests-kill-report.test.mjs`
- Delete after parity proof: `scripts/task-tracker/tests/unit/core/run-tests-timing.test.mjs`
- Delete after parity proof: `scripts/task-tracker/tests/unit/core/run-tests-ceiling.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/meta/test-tree-layout.baseline.json`

- [ ] Inventory every old test name and assertion in a checked test map before
      moving code. The new files must contain each behavior or an explicitly
      stronger replacement.
- [ ] Organize each file with a top-level feature `describe` and nested scenario
      `describe` blocks. Use one `before`, a state-resetting `beforeEach`, and
      one `after` per compatible lifecycle.
- [ ] Share the repository-shaped runner fixture within each file while keeping
      actual spawned child processes isolated per test.
- [ ] Keep process timeout/kill assertions in the process-pool feature because
      they share the same child-process lifecycle; do not combine them with
      pure timing serialization.
- [ ] Confirm each resulting file remains below the 800-line hard cap and has no
      unrelated conditional setup. Explain any file above the 400-line soft
      threshold in the issue evidence.
- [ ] Run old files at the baseline ref and new files at the candidate ref
      through the cluster benchmark. Retain the consolidation only when median
      and P80 improve without failures.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/core/run-tests-discovery-lanes.test.mjs
node --test scripts/task-tracker/tests/unit/core/run-tests-process-pool.test.mjs
node --test scripts/task-tracker/tests/unit/core/run-tests-timing-policy.test.mjs
npm run lint:line-cap
```

## Task 5: Consolidate the Chore-Mode Feature Cluster

**Files:**

- Create: `scripts/task-tracker/tests/unit/lib/chore-mode-contract.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/chore-mode-verb.test.mjs`
- Delete after parity proof: `scripts/task-tracker/tests/unit/lib/chore-mode-scope.test.mjs`
- Delete after parity proof: `scripts/task-tracker/tests/unit/lib/chore-mode-state.test.mjs`
- Delete after parity proof: `scripts/task-tracker/tests/unit/core/chore-mode-commit-gate.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/meta/test-tree-layout.baseline.json`

- [ ] Map old state, scope, commit-gate, and CLI assertions before moving them.
- [ ] Put pure/stateful contract scenarios in `chore-mode-contract.test.mjs` and
      retain process-level command behavior in `chore-mode-verb.test.mjs`.
- [ ] Share one immutable repository skeleton per file, resetting state content,
      git refs, fake transports, and observations before each test.
- [ ] Do not share a live fleet registry or active chore-mode state across tests.
- [ ] Confirm both files remain below the 800-line hard cap. For a file above the
      400-line soft threshold, verify its scenarios still share one feature and
      lifecycle; extract setup mechanics when that improves clarity without
      hiding mutable state.
- [ ] Benchmark old four-file and new two-file clusters with five cold and five
      warm samples.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/lib/chore-mode-contract.test.mjs
node --test scripts/task-tracker/tests/unit/lib/chore-mode-verb.test.mjs
npm run lint:line-cap
```

## Task 6: Amend the Test-Tree ADR and Prove Suite Impact

**Files:**

- Modify: `docs/decisions/0001-test-tree-convention.md`
- Create: `docs/research/2026-08-01-feature-fixture-performance.md`
- Modify: `scripts/task-tracker/tests/unit/meta/test-tree-layout.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/meta/test-tree-layout.baseline.json`

- [ ] Amend the ADR from strict module-per-file organization to the approved
      feature-oriented rule, including nested fixtures, helper isolation, the
      test-specific soft-400/hard-800 policy, semantic split triggers, and the
      measured-retention requirement. Keep production-file limits unchanged.
- [ ] Record baseline/candidate commit SHAs, machine/runtime fingerprint, raw
      samples, median/P80 comparisons, file/process counts, and full-lane timing
      in the research note.
- [ ] Require at least 25% improvement in each selected cluster. If one cluster
      misses after two compositions, restore its clearer baseline composition
      and document the negative result.
- [ ] Compare loaded full-suite actual P80 elapsed and prove no material lane
      regression. Treat a repeatable regression above 5% as material unless the
      issue evidence records and approves a stronger countervailing benefit.
- [ ] Update layout meta-tests to accept feature-oriented files while continuing
      to reject God files and lane violations.

**Final verification:**

```bash
node --test scripts/task-tracker/tests/unit/fixtures/feature-fixtures.test.mjs
node --test scripts/task-tracker/tests/unit/core/run-tests-discovery-lanes.test.mjs
node --test scripts/task-tracker/tests/unit/core/run-tests-process-pool.test.mjs
node --test scripts/task-tracker/tests/unit/core/run-tests-timing-policy.test.mjs
node --test scripts/task-tracker/tests/unit/lib/chore-mode-contract.test.mjs
node --test scripts/task-tracker/tests/unit/lib/chore-mode-verb.test.mjs
npm run format:check
npm run lint
npm run test:unit
npm run test:integration
npm run test:slow
```

## Evidence Required Before Delivery

- Old-to-new test assertion map with no unexplained behavior loss.
- Benchmark JSON for both refs and both clusters.
- Actual lane elapsed and summed per-file wall time shown separately.
- Line counts and isolation proof for every resulting feature file/helper.
- Full-lane timing comparison and regression analysis.
- Independent exact-SHA review under the existing approval policy.
