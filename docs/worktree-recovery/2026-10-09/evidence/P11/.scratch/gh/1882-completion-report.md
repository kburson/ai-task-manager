### New Automated Tests

Seventeen new merge-back regressions cover validated project plans, real configured and issue-declared commands, stale and unsuccessful evidence, source mutation, malformed child JSON, invalid provider/declaration configuration, authoritative child/parent checkout routing, changed parent checkout, strict boolean admission, checkout preservation, verified-head drift, and merging the exact tested commit. Real-Git tests live in the integration lane. Default Node probes execute tiny fixture scripts, never the repository's full host suites.

The genuine red runs are retained under `.scratch/1882/`: preservation-red (3 assertion failures), provider-red (6), cli-red (4), and head-guards-red (3). Final focused and boundary execution f99dfc17-cfbf-4ab0-9f94-84be30687247 passed all 60 tests, with zero failures, cancellations or skips. AITM independently executed the focused AC verifier at source `482a7ace68070d628050952bce8c61eba5c9435f` in run dfba43c7-831f-4779-a9a7-452a0fca6204.

Canonical TIA execution 336c47e2-919a-4650-a0f4-d7f3f30f0795 completed successfully at this exact clean head, selecting 136 files without complete-lane escalation. Every selected file returned exit 0; no full repository host suite was run. Earlier failed/interrupted runs remain accurately recorded.

Complete CI run 37248866828 is successful at the same source head: all seven collection workers and both aggregate lanes, npm 11/Node 24 and npm 12/Node 26 package compatibility, guidance budget and CodeQL are green. All nine expected current-attempt worker/aggregate artifacts are available. Canonical Test validates their genuine provenance before lifecycle completion.
