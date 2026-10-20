# #2073 refinement traffic evidence

## Retained source before production changes

Boundary: real publishFieldEstimateRevision → executeEstimateWriter → native collectors, guarded body writes and board field writes. Binding, launch, timing and whole-refine promotion are excluded. No source overlay or policy-success substitution was used.

Source: local commit `52ff0fe734cf682c604695ab0c7b005f512c2844`. Exact source/driver/population/configuration hashes, complete selected-response dispatch ledgers and successful durable snapshots are in [run 1](baseline-run1.md) and [run 2](baseline-run2.md). Both produced 313 dispatches and byte-identical business snapshots and outcomes. All production source is still unchanged at this checkpoint.

| Family | Baseline dispatches |
| --- | ---: |
| Membership | 127 |
| Estimation projection | 80 |
| Opaque issue-body read | 96 |
| Body write | 8 |
| Project field write | 2 |
| Total | 313 |

The [baseline budget review](baseline-budget-review.md) documents the discovered plan defect and structural baseline-only amendment before optimized measurement. Baseline remains below 512 total. Optimized ceilings are unchanged.

Offline costs are unknown, not zero and not synthetic live savings. GraphQL dispatches are transport invocations; opaque CLI observations can hide multiple HTTP requests. Payload sizes are UTF-8 serialized decoded response bytes at the exposed adapter, not compressed wire bytes. Real native workflow calls continue to use GraphQL usage capture separately.

Regenerate before/after evidence with the same external driver:

```sh
mkdir -p .scratch/2073-baseline
git archive 52ff0fe734cf682c604695ab0c7b005f512c2844 | tar -x -C .scratch/2073-baseline
node scripts/tests/fixtures/refinement-traffic-runner.mjs --source-root .scratch/2073-baseline --fixture changed-publication --boundary publication --report .scratch/2073-baseline-run1.md
node scripts/tests/fixtures/refinement-traffic-runner.mjs --source-root .scratch/2073-baseline --fixture changed-publication --boundary publication --report .scratch/2073-baseline-run2.md
```

Optimized implementation, safety/routing/recovery checks and live-comparison status remain pending.
