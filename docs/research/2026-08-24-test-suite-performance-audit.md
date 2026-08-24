# Test-suite performance audit — 2026-08-24

Research spike (no issue, not timed). Branch: `research/test-perf-audit` off
`origin/trunk` @ `558ea82a`.

Question asked: _why does a validation sequence need a 20-minute timeout, which
tests cover what, where is the overlap and waste, can shared fixtures and better
mocking help, and what is really slowing the integration tests?_

All numbers below are measured on this machine (10 CPU, macOS 25.5.0, Node
v25.6.0) on 2026-08-24 unless dated otherwise. Raw artifacts and the analysis
scripts are in [`2026-08-24-test-suite-performance-audit/`](2026-08-24-test-suite-performance-audit/).

---

## 1. Headline

**The integration tests are not the problem, and neither is `npm ci`.** The
integration lane is 30 files and finishes in **17.2 s**. Dependency install in a
fresh worktree is **6 s**.

The 20-minute ceiling is made of four things, in this order:

| Component                                               |             Measured | Share |
| ------------------------------------------------------- | -------------------: | ----: |
| `npm run test:slow` (53 files)                          |          **447.3 s** |  52 % |
| `npm test` — fast lane, unit + integration (893 files)  |          **333.2 s** |  39 % |
| `npm run format:check` (prettier, whole repo, no cache) |             **51 s** |   6 % |
| `npm run lint` (11 sub-linters chained)                 |             **26 s** |   3 % |
| worktree stage + `npm ci --no-audit --no-fund`          |              **7 s** |  <1 % |
| **total**                                               | **864 s ≈ 14.4 min** |       |

14.4 min on an idle-ish laptop, and the box was carrying a background load of
~33 during measurement (`corespotlightd` at 180 % CPU, Time Machine, Chrome).
On a loaded machine or in CI that lands at 18–20 min. The 20-minute timeout is
not defensive padding; it is roughly the honest cost of the current design.

**The three structural causes, in order of payoff:**

1. **Scheduling.** The runner leaves most of the machine idle for most of the
   run. The slow lane runs **50 of its 53 files strictly one at a time**
   (326.4 s of serial phase). The unit lane's four phases run behind hard
   barriers, so the 9-wide pure pool and the 2-wide subprocess pool never
   overlap. Fixing scheduling alone, with no test changes at all, takes the
   unit lane from 337 s → **~181 s** and the slow lane from 447 s → **~131 s**.
2. **Subprocess-based testing.** 74 % of unit-lane wall time sits in files that
   reach `child_process` — but the scheduler only recognises 102 of them,
   because the classifier greps the test file's own text and is blind to spawns
   that happen inside a shared fixture. The 20 heaviest files carry **506 s of
   1515 s** aggregate CPU, and they are almost all "spawn the CLI once per
   assertion".
3. **Process count.** 959 separate `node` processes, 876 of them in the unit
   lane, for 6314 test cases — a mean of 6.6 tests per process. Under the real
   run, light files that take 60–170 ms in isolation take **420–670 ms**. The
   per-file fixed cost is ~575 ms median, and 249 unit files are _entirely_
   fixed cost — 187.8 s of wall, of which 183.5 s is not test execution.

---

## 2. Corpus inventory

|             |   files | test cases | assertions |
| ----------- | ------: | ---------: | ---------: |
| unit        |     876 |      5 837 |            |
| integration |      30 |        151 |            |
| slow        |      53 |        326 |            |
| **total**   | **959** |  **6 314** | **21 418** |

549 production `.mjs` modules under `scripts/`.

### 2.1 A quarter of the corpus is not actually a test suite

**221 of 959 files (23 %) never import `node:test`.** They are top-level
`assert` scripts: no `describe`, no `it`, first failure aborts the file, no test
names in output. Consequences:

- They are invisible to the timing model (`inProcMs` is `null`), so the existing
  `--timing-report` under-reports them. In the unit lane that is **197 files
  and 236.6 s of wall time reported as zero in-process work**.
- They cannot be filtered, retried, or reported per-case.
- They defeat any future in-process consolidation, because each one owns global
  state at module scope.

Full list: [`bare-assert-files.txt`](2026-08-24-test-suite-performance-audit/bare-assert-files.txt).

### 2.2 Coverage map

`overlap.json` maps every production module to the test files that import
it. Most-covered modules by importing-test-file count:

| test files | src lines | module                                                               |
| ---------: | --------: | -------------------------------------------------------------------- |
|        248 |        96 | `lib/scratch-dir.mjs` _(a helper, not a subject — inflates the map)_ |
|         39 |           | `gh-timing-comment.mjs`                                              |
|         28 |           | `lib/github-records/record-envelope.mjs`                             |
|         25 |           | `lib/body-invariants.mjs`                                            |
|         20 |           | `lib/lifecycle-policy/index.mjs`                                     |
|         19 |     2 028 | `verbs/close.mjs`                                                    |
|         18 |           | `verbs/promote.mjs`                                                  |
|         17 |       114 | `lib/verification-commands.mjs`                                      |

**77 of 549 modules have no direct-import coverage.** That number is misleading
in a specific and important way: the largest of them are the _most_ heavily
tested modules in the repo — they are just tested by **spawning them as a CLI**
instead of importing them.

| module                            | src lines | test files that reference it | how     |
| --------------------------------- | --------: | ---------------------------: | ------- |
| `task-tracker/bash-guard.mjs`     |       751 |                           18 | spawned |
| `review/co-review.mjs`            |       685 |                            4 | spawned |
| `review/lib/start.mjs`            |       613 |                            8 | spawned |
| `task-tracker/activity-guard.mjs` |       269 |                            7 | spawned |
| `run-tests.mjs`                   |       374 |                            — | spawned |

This is the causal link between the coverage strategy and the runtime: **the
modules with no import-level coverage are exactly the ones that make the suite
slow.** Every assertion about them costs a process launch.

### 2.3 Overlap and fragmentation

393 distinct subjects; **52 subjects are covered by 4 or more separate test
files** (331 files, 625 s of wall). The worst:

| test files | tests |   wall |   in-proc | subject                         |
| ---------: | ----: | -----: | --------: | ------------------------------- |
|         23 |    65 | 40.7 s |    29.0 s | `gh-timing-comment.mjs`         |
|         15 |    96 | 69.0 s |    61.8 s | `verbs/close.mjs`               |
|         15 |    69 | 16.4 s |     4.7 s | `verbs/test.mjs`                |
|         10 |    98 | 39.6 s |    35.6 s | `verbs/promote.mjs`             |
|         10 |    84 |  5.7 s | **0.2 s** | `lib/body-invariants.mjs`       |
|          9 |    46 |  6.4 s |     0.8 s | `lib/stage-entry-markers.mjs`   |
|          9 |    15 |  4.8 s | **0.0 s** | `lib/evidence-markers.mjs`      |
|          8 |    20 |  5.0 s | **0.0 s** | `lib/auto-tick-verified.mjs`    |
|          8 |    61 | 15.0 s | **0.0 s** | `lib/close-convergence.mjs`     |
|          7 |    38 |  3.5 s | **0.0 s** | `lib/versioned-issue-write.mjs` |

The rows with ~0 s in-process are pure waste: 10 processes to run 84 assertions
that together take 200 ms. A further **156 files (425 tests, 220.7 s)** import
no production module at all beyond shared infrastructure — they are
meta/policy/lint-style checks that could be one suite.

This fragmentation is a direct consequence of the story-per-file convention
(`@story #N` tags, one file per issue). It is excellent for traceability and
expensive at runtime. The fix is not to abandon it — it is to stop paying a
**process** for each story.

---

## 3. Where the time actually goes

### 3.1 Unit lane (measured 2026-08-24, artifact `timing-unit.json`)

```
876 files, 5837 tests
runner wall 337.0 s   =  pool 141.5 s + subprocess 124.8 s + slowPool 0.0 s + serial 70.7 s
aggregate CPU 1514.7 s   (in-proc 894.4 s, overhead 383.7 s = 25.3 %)
```

The four phases are strictly sequential barriers (`run-tests-schedule.mjs`), so
during `subprocess` (cap 2) and `serial` (cap 1) — **195.5 s of the 337 s run,
58 %** — the machine runs at 20 % and 10 % of the width it uses during `pool`.

Concentration is extreme: **p50 = 46 files carry half of all wall time**;
p80 = 299.

Top of the Pareto:

|   wall | in-proc | tests | file                                                |
| -----: | ------: | ----: | --------------------------------------------------- |
| 48.4 s |  48.3 s | **1** | `core/reviewer-co-review-command-boundary.test.mjs` |
| 44.6 s |  44.2 s |    22 | `lib/co-review-write-policy.test.mjs`               |
| 32.6 s |  32.2 s |    12 | `lib/action-capture.test.mjs`                       |
| 32.5 s |  31.7 s |     6 | `lib/commit-ownership-message-sources.test.mjs`     |
| 31.5 s |  31.0 s |    26 | `review/co-review.test.mjs`                         |
| 30.3 s |  29.8 s |    27 | `lib/coverage-source-edit-gate.test.mjs`            |
| 29.0 s |  28.8 s |    11 | `lib/exclusive-ownership-policy.test.mjs`           |
| 24.9 s |     n/a |    0* | `lib/resume-seed.test.mjs`                          |
| 24.1 s |  23.6 s |    11 | `lib/absolute-word-markers.test.mjs`                |
| 23.1 s |  22.5 s |    36 | `verbs/coverage-promote.test.mjs`                   |

\* bare-assert file — see §2.1.

**48 seconds for one test.** `reviewer-co-review-command-boundary.test.mjs`
spawns `bash`, the bash-guard hook, and the aitm CLI per assertion.

### 3.2 The classifier is blind to fixture-mediated spawning

`test-parallel-safety.mjs` decides pooling by greps the **test file's own
source** for `node:child_process`. It finds 102 files in the unit lane.

Walking the transitive import graph instead: **531 of the 774 "pure" unit files
can reach `child_process`, and they carry 1114.9 s of the 1514.7 s aggregate
(74 %)**. Transitive reach over-counts — importing a module that _contains_ a
git helper is not the same as calling it — but the top of that list is
unambiguous, and it is also the top of the Pareto:
`co-review-write-policy` (44.6 s), `action-capture` (32.6 s),
`co-review` (31.5 s), `coverage-source-edit-gate` (30.3 s). All classified
"pure". All in the 9-wide pool. Each forking real child processes.

That is the mechanism behind the observed inflation: the pure pool believes it
is running 9 cheap in-process files and is actually running 9 process trees.

### 3.3 Per-file fixed cost, and how much of it is real

Median (wall − in-proc) over 518 near-zero-work pure unit files: **575 ms**.
That is 503.7 s — **33 % of the unit lane's aggregate CPU** — spent before any
assertion runs. It decomposes as:

| step                                                  |           isolated cost |
| ----------------------------------------------------- | ----------------------: |
| bare `node -e ''` boot                                |                   42 ms |
| `node --test` on an empty file                        |              **125 ms** |
| + `import scratch-dir.mjs`                            | 54 ms (12 ms over boot) |
| + `import lib/lifecycle-policy/index.mjs`             |                   72 ms |
| + `import verbs/close.mjs`                            |                  185 ms |
| + one `mkdtempProjectIsolated()` (3 git subprocesses) |              **356 ms** |
| + `projectScratchDir()` only                          |                   73 ms |

**The import graph is not the villain.** Static analysis showed an average
transitive closure of 58 modules / 464 KB per test process, with 677 of 959
files loading the `lifecycle-policy` + `providers` + session-runtime cluster —
but measured, that costs only tens of milliseconds. Real contributors are the
`node --test` harness floor (125 ms) and `mkdtempProjectIsolated` (~300 ms of
git subprocesses, 66 files, 123 static call sites).

Everything else is contention. Ten light files timed in isolation vs. inside the
real run:

|   in-run |   solo | file                                             |
| -------: | -----: | ------------------------------------------------ |
| 414.7 ms |  77 ms | `providers/coverage-provider-adapter.test.mjs`   |
| 567.6 ms | 170 ms | `core/docs-only-lane-skip-completeness.test.mjs` |
| 491.3 ms |  61 ms | `lib/agent-review/registry.test.mjs`             |
| 665.7 ms |  88 ms | `lib/epic-orchestration-plan.test.mjs`           |
| 642.1 ms | 101 ms | `verbs/coverage-dod-stamp.test.mjs`              |

A controlled sweep over 120 light files shows pool width alone accounts for only
~2× of that:

```
width   wall     median/file   aggregate-cpu   speedup
    1   12.9s        73ms          12.9s         1.00x
    2    6.6s       111ms          13.1s         1.97x
    4    3.7s       120ms          14.7s         3.46x
    6    2.6s       125ms          15.3s         4.97x
    9    1.9s       142ms          16.9s         6.71x
   12    1.6s       152ms          18.5s         8.07x
```

Scaling is healthy to width 12 when the files are genuinely light. The remaining
3× inflation in the real run comes from the heavy fixture-spawning files
(§3.2) sharing the pool. **The pool is not too wide; it is contaminated.**

### 3.4 Integration lane — not the bottleneck

```
30 files, 151 tests, runner wall 17.2 s, aggregate 17.2 s (serial, width 1)
```

The lane runs entirely serially and _still_ finishes in 17 s. Only 6 of the 30
files spawn anything. There is nothing to fix here; the premise that
"integration tests are slow" does not hold for this repo. What is misnamed is
the _unit_ lane — 102 declared (531 actual) subprocess-spawning files sit in it,
and **105 unit files exceed the 2000 ms slow threshold while the slow bucket
itself holds 0 of them**.

### 3.5 Slow lane — the single biggest win

```
53 files, 326 tests
runner wall 447.3 s  =  slow-parallel 120.9 s (3 files) + serial 326.4 s (50 files)
aggregate 522.1 s, in-proc 340.0 s, overhead 0.9 %
```

Only **3 of 53 files** carry the `@slow-parallel-safe (rationale)` opt-in.
The other 50 run one at a time on a 10-core machine.

Bin-packing the same measured durations:

|     width |           wall |
| --------: | -------------: |
| 1 (today) |        522.1 s |
|         2 |        261.1 s |
|         3 |        174.0 s |
|     **4** |    **130.5 s** |
|        6+ | 98.1 s (floor) |

The floor is one file: `slow/task-tracker/lib/agentic-help-runtime.test.mjs`
at **98.1 s for 9 tests**. Second is `slow/review/co-review-boundaries.test.mjs`
at 74.8 s for 7 tests.

The runner already reports **16 demotion candidates** — slow-lane files now
under 2 s — that nobody has acted on.

---

## 4. Fixture sharing

**Only 35 of 959 test files import any shared helper or fixture.**

| uses | helper                                         |
| ---: | ---------------------------------------------- |
|    8 | `helpers/pexec-body-store.mjs`                 |
|    5 | `fixtures/co-review-fixture.mjs`               |
|    4 | `fixtures/state-engine-policy-baseline.mjs`    |
|    3 | `helpers/github-record-lifecycle-fixtures.mjs` |
|    3 | `fixtures/chore-mode/chore-mode-fixture.mjs`   |

Meanwhile there are **272 `projectScratchDir(` call sites, 219 `mkdtemp` calls
in the unit lane alone, and 12 files that roll their own `git init` sandbox
from scratch** with no shared helper at all.

### The mocking answer already exists in this repo

`scripts/tests/fixtures/co-review-fixture.mjs` ships **both** paths side by side:

| slow path                                                                                | fast path                                                                                             |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `runCli(args)` — `spawnSync(process.execPath, [CLI, ...])`                               | `runCliDirect(args)` — dynamic `import()` + in-process `runCli`, stdout/stderr captured via callbacks |
| `repositoryFixture()` / `realRepositoryFixture()` — **6 real git subprocesses** per call | `memoryRepositoryFixture()` — `createMemoryRepository`, **zero subprocesses**                         |

Current adoption across the corpus:

```
runCliDirect(              74        runCli(                34
                                     runCliAsync(            3
memoryRepositoryFixture(   28        repositoryFixture(     16
                                     realRepositoryFixture(  1
```

**Roughly two-thirds migrated. The unmigrated third is the top of the Pareto.**
`reviewer-co-review-command-boundary` (48.4 s), `co-review-write-policy`
(44.6 s), `co-review` (31.5 s), and `co-review-boundaries` (74.8 s, slow lane)
are all still on the spawn path. This is not a "build a mocking layer" problem —
it is a "finish the migration someone already started" problem.

---

## 5. What-if model

Greedy longest-processing-time bin packing over the measured 2026-08-24 unit
durations (`model.mjs`), 10 CPUs:

| scenario                                                                | unit-lane wall |
| ----------------------------------------------------------------------- | -------------: |
| measured today — 4 sequential phases                                    |    **337.0 s** |
| **A.** one global pool, phases overlap (no test changes)                |    **180.8 s** |
| **B.** A + cut fixed cost 575 → 150 ms (removes 372 s of aggregate CPU) |    **136.0 s** |
| **C.** B + halve the 20 heaviest files via in-process fixtures          |    **106.1 s** |
| **D.** C + consolidate the 249 overhead-bound files 8:1 (249 → 32)      |     **95.7 s** |

Aggregate CPU breakdown for the unit lane (1514.7 s):

- process + harness fixed cost: **503.7 s (33 %)**
- top-20 heaviest files: **506.2 s (33 %)**
- 249 overhead-dominated files: 187.8 s, of which **183.5 s is not test work**

Combined with a width-4 slow lane (447 → 131 s), a full validation sequence goes
from **864 s → roughly 310 s**, inside the user's 5-minute target and well
under the 10-minute boundary.

---

## 6. Recommendations, ranked by payoff per unit of risk

**Tier 1 — scheduling only, no test changes (≈ 470 s saved, low risk)**

1. **Parallelize the slow lane.** Invert the `@slow-parallel-safe` opt-in to an
   opt-_out_ (`@slow-parallel-unsafe`) and run the lane at width 4. Measured
   447 s → ~131 s. This is the single largest win in the audit and touches no
   test logic. Cap at 4, not 9 — these files are process-heavy.
2. **Remove the phase barriers in `run-tests-schedule.mjs`.** Replace four
   sequential pools with one global scheduler holding a 9-slot budget and a
   2-slot subprocess semaphore, so subprocess and serial work overlaps pure
   work instead of following it. Measured 337 s → ~181 s.
3. **Act on the runner's own slow-bucket audit.** Promote the 105 unit files
   over 2000 ms; demote the 16 slow-lane files now under 2000 ms. The report
   has been emitting these for months with no consumer.

**Tier 2 — finish the in-process migration (≈ 250 s saved, medium risk)**

4. **Migrate the top 20 files off `runCli`/`repositoryFixture` onto
   `runCliDirect`/`memoryRepositoryFixture`.** They carry 506 s of 1515 s. Start
   with `reviewer-co-review-command-boundary.test.mjs` — 48 s for one test —
   then `co-review-write-policy`, `co-review`, `action-capture`,
   `coverage-source-edit-gate`, and slow-lane `agentic-help-runtime` (98 s) and
   `co-review-boundaries` (75 s).
5. **Fix the spawn classifier** (`test-parallel-safety.mjs`) to walk the
   transitive import graph, or require fixtures that spawn to export an explicit
   `@spawns-subprocess` marker that propagates to importers. Today the scheduler
   is making decisions on data it knows is incomplete, which is why the "pure"
   pool oversubscribes.
6. **Replace `mkdtempProjectIsolated`'s three git subprocesses with a template
   sandbox** — build one `.git` skeleton per run and `cp -R` it (or write the
   handful of loose objects directly). ~300 ms × every call site.

**Tier 3 — corpus shape (≈ 180 s saved, higher churn)**

7. **Consolidate the 249 overhead-dominated unit files** (187.8 s wall, 183.5 s
   of it not test work) into per-directory suites — one process, many
   `describe` blocks, `@story` tags preserved as `describe` names. Keep
   traceability; stop paying a process for it. The 156 files that import no
   production module (meta/policy checks) are the easiest first batch.
8. **Convert the 221 bare-assert files to `node:test`.** They are invisible to
   the timing model, un-mergeable, and abort on first failure. This is a
   prerequisite for (7), not an independent win.
9. **Cache `format:check`.** 51 s of the sequence is prettier re-reading the
   entire repo. Scope it to changed files in the pre-commit path and keep the
   full sweep in CI only.

**Not recommended**

- Trimming the shared import graph. It looked like the culprit statically
  (58 modules / 464 KB average, 677 files loading the same runtime cluster) and
  measured out at tens of milliseconds. Chasing it would be effort spent on
  ~3 % of the problem.
- Reducing pool width. Scaling is healthy to width 12 on light files; the
  problem is what is _in_ the pool, not how wide it is.

---

## 7. Caveats

- The machine carried a background load of ~33 throughout (`corespotlightd` at
  180 % CPU, `mediaanalysisd`, Time Machine, Chrome). Absolute wall times are
  therefore pessimistic; the _ratios_ and the bin-packing model are not affected.
- `npm ci` measured 6 s against a warm npm cache. A cold CI cache will be
  slower, but it is not a meaningful share of the sequence either way.
- "531 files reach `child_process`" is transitive-import reach, which
  over-counts: a file that imports a module that merely _contains_ a git helper
  is flagged. The direction of the finding is solid — the current classifier
  finds 102, the true number is materially higher — but 531 is an upper bound.
- The what-if model assumes a work-stealing scheduler with no ramp-up cost and
  perfect duration foreknowledge. Treat the scenario numbers as floors, not
  forecasts.

---

## 8. Data files

In [`2026-08-24-test-suite-performance-audit/`](2026-08-24-test-suite-performance-audit/):

| file                                                              | what                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `analyze.mjs` → `test-inventory.json`                             | 959 rows: lane, size, tests, asserts, spawn counts, mkdtemp/git-init counts, imports, helpers, `@story` |
| `overlap.mjs` → `overlap.json`                                    | module → covering tests, untested modules, helper adoption, roll-own sandboxes                          |
| `graph.mjs` → `import-graph.json`                                 | transitive import closure per test file, module fan-in ranking                                          |
| `fragmentation.mjs` → `fragmentation.json`                        | test files per subject module, with wall/in-proc per subject                                            |
| `timing-join.mjs` → `joined-*.json`                               | timing artifact joined to the inventory                                                                 |
| `model.mjs` → `model.json`                                        | bin-packing what-if scenarios                                                                           |
| `contention.mjs`                                                  | pool-width sweep over 120 light files                                                                   |
| `timing-unit.json`, `timing-integration.json`, `timing-slow.json` | raw `run-tests` artifacts, 2026-08-24                                                                   |
| `timing-fast-2026-08-22.json`                                     | prior fast-lane artifact (893 files, 333.2 s)                                                           |
| `bare-assert-files.txt`                                           | the 221 files that never import `node:test`                                                             |
| `lint-timings.txt`                                                | per-step lint and format timings                                                                        |

The `.mjs` files are the analysis scripts as run; they read and write under
`.tmp/testaudit/` (the gitignored working directory used during the spike). To
re-run them, copy this folder's contents into `.tmp/testaudit/` first.
