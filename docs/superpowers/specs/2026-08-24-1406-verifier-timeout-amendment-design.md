# Governed Verifier Timeout Amendment Design

## Decision

Increase `TEST_RUNNER_TIMEOUT_MS` from 10 minutes to 20 minutes. The ceiling
continues to apply per declared verifier command through `runVerifiers`; no
test lane, assertion, verifier command, or failure policy changes.

## Context

At #1406 head `26ccf5c8`, `npm run quality` passed directly with all 907 fast
test files green but required about 12.5 minutes. The same command failed twice
inside `ac-stamp` because `runVerifiers` killed it at the fixed 10-minute
`TEST_RUNNER_TIMEOUT_MS` boundary. The timeout no longer provides headroom for
the repository's full safety-net runtime.

## Alternatives

1. **20-minute verifier ceiling (selected):** preserves the complete safety net
   and gives current runtime reasonable headroom while remaining bounded.
2. **Disable slow or broad tests (rejected):** reduces elapsed time by accepting
   additional regression risk before test-impact analysis is authoritative.
3. **Complete TIA first (future direction):** use explainable, fail-safe test
   selection with full-suite backstops. This is separate planned work and is not
   safe to make a prerequisite for #1406.

## Scope

- Change the centralized constant and its explanatory comment.
- Update the existing unit regression that asserts the per-command budget.
- Prove `runVerifiers` still supplies the same shared constant to each command.
- Rerun the previously blocked #1406 acceptance stamp without changing its
  declared verifier.

## Non-Goals

- No environment override, retry, lane reclassification, test removal, TIA
  implementation, or timeout change for GitHub, Git, move-state, sandbox, or
  package installation operations.
- No successor defect and no mutation of #1381.

## Verification

1. The focused timeout regression fails while production remains at 600000ms.
2. It passes after the constant becomes 1200000ms.
3. The process-timeout and lane-split evidence-runner tests pass together.
4. `npm run quality` passes through the governed `ac-stamp` path at the exact
   implementation head.

## Slow-Test Failure Metric

Current local timing data is an overwritten snapshot, not durable run history.
The implementation report will therefore calculate any available failure rate
from retained GitHub Actions runs and state the workflow, sample window,
denominator, and classification limits. If slow-lane failures cannot be
isolated from retained evidence, the report will say so rather than inventing a
rate.
