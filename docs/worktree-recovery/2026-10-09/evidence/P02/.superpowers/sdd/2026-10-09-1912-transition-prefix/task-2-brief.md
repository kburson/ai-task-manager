## Task 2: Close only observed owned discrepancies

**Files:** Reuse stage-execution.mjs, source-correction.mjs, store.mjs, actor-timing-state.mjs, transition-commit.mjs and github-mutation.mjs.

- Diagnose actual prefix effects/current source, request/resource and persisted custody discrepancies. Add the smallest failing real case before source changes; preserve original execution and caller/error semantics.
- Fault controls must retain only verified committed prefix facts, never report failed/unverified effects as successful, and never clear another completed resource.
- Requalify all relevant original prefix and negative-source cases. Downstream consistency/comment/status/recovery/saga contracts remain owned by their existing repair stories.

