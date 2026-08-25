# #1406 Slow-Suite Failure Metric

## Window and Denominator

- Source: retained GitHub Actions `CI` scheduled runs.
- Window: 2026-08-14 through 2026-08-24 UTC.
- Reason for start: earlier retained scheduled runs have no `Slow lane (slow
tests only)` job, so they cannot contribute to a slow-only denominator.
- Sample: 11 nightly slow jobs and 575 slow test-file executions.

## Result

- Job failure rate: 9 / 11 = 81.8%.
- Test-file execution failure rate: 10 / 575 = 1.7%.
- Latest state: the 2026-08-23 and 2026-08-24 nightly slow jobs passed.

## Failure Concentration

- All nine failed jobs included
  `scripts/tests/slow/articles/publish-articles-e2e.test.mjs` failing because
  Mermaid CLI could not launch its browser process.
- The 2026-08-20 run also included one failure in
  `scripts/tests/slow/review/co-review-boundaries.test.mjs`.
- Therefore the 81.8% job rate is not nine independent regressions or a broad
  81.8% per-test instability rate. One persistent CI/browser failure dominated
  the sample because any single file failure makes the whole slow job red.

## Planning Interpretation

Use both rates:

- **81.8% job-red rate** describes operator burden and the reliability of the
  nightly safety-net signal during this short window.
- **1.7% failed file-execution rate** describes failure concentration, but it
  is not a product-defect escape rate and does not distinguish deterministic
  regressions from environmental failures automatically.

TIA planning needs durable per-run, per-test-file outcomes with failure
classification, changed-path provenance, runtime, retry outcome, and the exact
tested SHA. The current local timing snapshot is overwritten and cannot supply
that history.

## Reproduction

```bash
gh run list --workflow CI --event schedule --limit 30 \
  --json databaseId,createdAt,status,conclusion,headSha,url
gh api "repos/kburson/ai-task-manager/actions/runs/<run-id>/jobs?per_page=100"
gh run view --job <slow-job-id> --log-failed
```

Observed scheduled run IDs with a slow job:

`32703940242`, `32625867448`, `32559845052`, `32459809071`,
`32345134895`, `32228762792`, `32112381401`, `32007807656`,
`31934095192`, `31872139568`, `31783228236`.
