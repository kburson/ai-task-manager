Native child merge-back rebased a child even when it already contained its integration parent, flattening reviewed merge history and replacing the reviewed SHA. Skip that unnecessary rebase using the existing ancestry predicate; retain divergent synchronization, configured verification, exact-head checks, parent checkout authority, fast-forward-only integration and cleanup.

Validation: real Git regression failed before the fix and passed afterward; 49 affected tests passed. Full hosted unit, integration and slow lanes, both npm/Node packaging checks, quality gates and CodeQL passed at 2d36e1a6c9c57039299c332ef208e09e34d1e003. Native sandbox Test consumed authenticated CI receipts and passed the declared affected checks. Independent source review and native Review passed; completion approval uses explicit AI Full-Auto provenance. Full host suites were not run.

Refs #1902
