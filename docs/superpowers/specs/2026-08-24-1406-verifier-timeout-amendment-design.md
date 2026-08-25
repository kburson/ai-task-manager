# Governed Verifier Timeout Amendment Design

## Decision

Increase `TEST_RUNNER_TIMEOUT_MS` from 10 minutes to 20 minutes for each
declared verifier command run through `runVerifiers`. Introduce the separate
`TEST_FILE_TIMEOUT_MS` constant at the established 10 minutes for each child
spawned by `run-tests.mjs`. No test lane, assertion, verifier command, or
failure policy changes.

## Context

At #1406 head `26ccf5c8`, a direct `npm run quality` passed with all 907 fast
test files green in about 12.5 minutes. The same command failed twice inside
`ac-stamp` because `runVerifiers` killed it at the fixed 10-minute boundary.
After the budget change, the successful governed run at `73b4febf` took 17
minutes 32 seconds. The 20-minute ceiling therefore provides about 2 minutes
28 seconds, or 14%, of headroom over the longest observed governed run.

Claude's review of `73b4febf` identified that `scripts/run-tests.mjs` also used
`TEST_RUNNER_TIMEOUT_MS` as a per-test-file child cutoff. That second purpose
must retain its previous 10-minute safety boundary rather than inheriting the
larger aggregate-command budget.

## Alternatives

1. **20-minute verifier ceiling (selected):** preserves the complete safety net
   and gives current runtime reasonable headroom while remaining bounded.
2. **Disable slow or broad tests (rejected):** reduces elapsed time by accepting
   additional regression risk before test-impact analysis is authoritative.
3. **Complete TIA first (future direction):** use explainable, fail-safe test
   selection with full-suite backstops. This is separate planned work and is not
   safe to make a prerequisite for #1406.

## Scope

- Keep distinct centralized constants for the aggregate verifier command and
  individual test-file child.
- Update `scripts/run-tests.mjs` to consume the dedicated 10-minute per-file
  constant.
- Update the existing unit regression that asserts the per-command budget.
- Add regression coverage that prevents the per-file and aggregate budgets
  from being coupled again.
- Prove `runVerifiers` still supplies the same shared constant to each command.
- Rerun the previously blocked #1406 acceptance stamp without changing its
  declared verifier.

## Non-Goals

- No environment override, retry, lane reclassification, test removal, TIA
  implementation, or timeout change for GitHub, Git, move-state, sandbox,
  package installation, or individual test-file operations.
- No successor defect and no mutation of #1381.

## Verification

1. The aggregate-budget regression fails while production remains at 600000ms
   and passes after it becomes 1200000ms.
2. The per-file-budget regression fails before the dedicated 600000ms constant
   exists and passes after `run-tests.mjs` consumes it.
3. The process-timeout, runner-policy, and lane-split evidence-runner tests pass
   together.
4. `npm run quality` passes through the governed `ac-stamp` path at the exact
   implementation head.

## Slow-Test Failure Metric

The retained GitHub Actions sample and its interpretation are preserved in
[`docs/evidence/2026-08-24-1406-slow-suite-failure-metric.md`](../../evidence/2026-08-24-1406-slow-suite-failure-metric.md).
The short window reports both job-red rate and failed test-file execution rate
so a single concentrated infrastructure failure is not misrepresented as broad
test instability.

The owner's approval of this development amendment is preserved on #1406 by
the governed comment key `plan.verifier-timeout-amendment-v1`. It explicitly
does not represent human semantic final-review approval.
