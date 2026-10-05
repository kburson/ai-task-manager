# #1839 controlled GraphQL baseline

This directory preserves the temporary disposable-repository experiment and the offline consistency verifier. The test repository and clone are historical evidence only; runtime scripts and ordinary CI have no fixed scratch target.

## Reproduce and verify

Run `node scripts/maintenance/verify-1839-baseline.mjs` for offline qualification. Read `disposable-tests.md` for a future explicitly configured live run. Both retained live tests skip by default; ordinary test runs perform no scratch GitHub mutations.

The frozen `declaration.json` and `preflight.json` precede enrollment and collection. `run.json` preserves actual participant lifetime and successful workflow records. `smoke.json` verifies the direct query's same-response cost and accounts for title-change/restoration mutation traffic. `report.json` and `report.md` contain the metadata-only aggregate, operation/stage breakdowns and graphs; `activity.json` contains command timestamps and exit codes. Raw logs and writer records remain local.

## Result boundary

The saved qualifier accepts a controlled volume baseline: two collectors overlapped for 3,605 seconds, with four successful creation-to-planning workflows and all 24 native commands exiting zero. The accepted interval is `2026-10-05T04:29:35.298Z` through `2026-10-05T05:29:40.298Z`. Both actual collector end records follow that boundary. Frozen collector source commit: `6bfdeecf687d754becb0c0afffae08e3cd63f106`.

| Measure | Raw total | Per completed workflow |
| --- | ---: | ---: |
| Opaque CLI invocations | 703 | 175.75 |
| Exposed known point subtotal | 441 | 110.25 |
| Observations with unknown cost | 430 | 107.5 |
| Direct HTTP attempts in accepted interval | 0 | 0 |

Unknown cost affects 61.17% of observations. All 703 CLI observations have incomplete request-cost coverage, including those exposing a known same-response subtotal. Both declared groups qualify for scoped volume ranking: 533 query invocations and 169 mutation invocations. One additional undeclared mutation contributes to the whole-interval total. The largest named volume is `gh.issue.view`: 220 invocations, or 55 per workflow.

Observed activity spans `04:29:35.966Z` through `05:02:03.782Z`; collectors remained alive until the end. Native command durations sum to 605.336 seconds across concurrent worktrees, and invocation latency sums to 425.110 seconds. These sums are not exclusive wall time or point usage. Smoke accounts separately for three HTTP attempts, including restoration: query same-response cost 1 matched the recorded value; both mutation costs were unavailable; cleanup succeeded.

This is a four-workflow controlled sample, not organic fleet usage or a measured optimization result. Known point subtotals are lower bounds. Hidden CLI requests and unavailable costs prevent complete point rankings and point-savings claims. The offline consistency gate reports no qualification findings; timestamps and outcomes remain operator evidence, not independently authenticated receipts.

See `handoff-1817.md` for matched future comparison controls and `reconciliation.md` for parent acceptance ownership. `author-review.md` records the implementer's inline review; independent lifecycle review remains separate.

## Exclusions and provenance

A pilot and an undeclared aborted attempt are excluded with different session identities. The abandoned attempt produced two unclean writer records; they remain visible in common-root coverage diagnostics and do not belong to either accepted participant. No relevant declared-session collection gaps, denials or malformed records were observed. The global fleet remains a lower-bound population.

One additional anonymous mutation outside the frozen candidate list remains in raw totals and operation breakdowns. It was not inserted into either predeclared comparison group. Group totals therefore differ from whole-interval totals.

The six collector files and historical worker/configuration hashes were checked against the frozen preflight before export. A subsequent merge of current trunk verification changes happened after all four native workflows stopped and did not change a collector file. The retained future helper is formatted source with a different byte hash from the historical worker.

The three direct HTTP smoke attempts occurred before the declaration and are separate from accepted opaque-invocation totals. Mutation costs are explicitly unavailable. Cleanup restored the original scratch title. Account rate-limit samples are shared account context, not attributable point deltas.

The disposable repo, Project and local worktrees are retained for the human's later cleanup request. Deleting them will not invalidate the saved offline verifier. AITM contains no disposable test issues or Project items.
