# Bounded Subprocess Test Pool Design

<!-- cspell:words cpus -->

## Context

Issue #1275 is blocked in Test even though every unit assertion passes: the 105-file serial unit section took 671.0s and 726.4s on consecutive runs, beyond the fixed 600-second section ceiling. The current 10-core host has 843 unit files: 738 enter the existing `cpus - 1` pool; 95 readable files directly reference `node:child_process`; 10 additional files are explicit `@parallel-unsafe` cases.

The current boolean classifier treats direct subprocess workloads and exclusive hazards alike. Process isolation already prevents cross-file environment and working-directory leakage. The prior failure mode was CPU starvation when subprocess tests ran alongside a saturated nine-worker pure pool.

## Decision

Unit execution has three sequential phases:

1. `pooled`: readable, unmarked source with no direct `node:child_process` reference, at the unchanged `cpus - 1` concurrency.
2. `subprocess`: readable, unmarked source with a direct `node:child_process` reference, after the pure pool drains, at a hard maximum of two files.
3. `serial`: unreadable source or any `@parallel-unsafe` source, after the subprocess pool drains, one file at a time.

Integration and slow files always remain serial, regardless of source classification. `@parallel-unsafe` takes precedence over direct subprocess detection. The compatibility predicate `isParallelSafe()` remains true only for `pooled`.

The two-worker cap is `Math.min(2, poolConcurrency(cpus))`. It becomes one on one- and two-core hosts and has no environment override. A mixed weighted pool is rejected because it would overlap child-process work with the saturated pure pool and introduce fairness and starvation behavior that the current runner does not need.

## Scheduling and observability

A pure scheduling seam partitions canonical entries without running them. The runner awaits each phase before beginning the next, but emits all results in canonical input order after execution. The same child environment, no-retry flag, timeout, max-buffer, failure description, failure aggregation, and whole-run fleet-leak snapshot bracket every phase.

Timing artifact schema 3 records actual `poolMs`, `subprocessPoolMs`, and `serialMs`. Schemas 1 and 2 remain readable and normalize `subprocessPoolMs` to `null`; no elapsed value is inferred from summed per-file wall time.

Each non-empty phase is an independent section under the unchanged 600-second fail-closed ceiling. Empty phases are omitted, the aggregate remains observational, and the internal `all` lane remains exempt.

## Verification contract

Strict TDD covers the three-way classifier, marker precedence, unreadable-source fallback, the hard concurrency cap, unit-only routing, phase barriers, input-order results, timing schema compatibility, and all three ceiling sections. The candidate must then pass two consecutive full unit runs with every discovered file accounted for and every non-empty section under 600 seconds, followed by the issue-declared full, slow, lint, format, and diff checks.

Any SIGKILL/null status, timeout, registry leak, assertion failure, or section breach rejects the candidate. The response is investigation or fixture consolidation—not a higher concurrency cap or relaxed ceiling.

## Non-goals

- Moving tests between unit, integration, or slow lanes.
- Parallelizing integration or slow tests.
- Changing Node test semantics or per-child process policy.
- Adding a user-tunable concurrency override.
- Relaxing the 600-second ceiling.
- Folding in #945 fixture consolidation or unrelated test rewrites.
