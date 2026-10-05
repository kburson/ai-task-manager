# #1873 cloud verification completion

The human requires affected tests on the host and complete tests in parallel CI, with downloadable receipts. The delivered #1872 workflow already emits complete unit, integration and slow aggregates. Configure the existing declarative project verification provider; do not modify native receipt execution, evidence guards, default ceilings or historical results.

A repository-only validator must read successful exact-head CI metadata from GitHub, download the named artifacts for that run attempt, prove the tested commit is the source head or its genuine pull-request merge, and validate every expected test and worker exit through the existing shard validator. Reject missing, duplicated, stale or failed results. Compare aggregate results with downloaded worker originals and preserve all artifacts under ignored scratch storage. Local iteration uses the canonical impact selector; complete-lane escalation requires cloud verification. Final local quality retains lint and format. Native Test records the actual validator command, never a fictitious npm-test execution.

This is necessary verification completion within #1873 and the explicitly authorized cascade, not another defect or delegated task. Existing #1861 preserved evidence remains untouched.
