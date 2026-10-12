Native merge-back rebased a child even when it already contained the integration parent, flattening reviewed merge history and replacing the reviewed SHA. Reuse the existing ancestry predicate to skip that unnecessary rebase while retaining divergent-child synchronization, configured verification, exact-head checks, parent checkout authority, fast-forward-only integration and cleanup.

Verification: the real Git merge-containing history regression failed before the fix and passed afterward; all 49 tests in the three issue-declared affected files passed. Full lint, format and diff checks passed. No full host test suite ran.

Draft completion gates remain: native per-AC/DoD evidence, exact-head full hosted CI including the slow lane, and final native Test/Review/delivery.

Refs #1902
