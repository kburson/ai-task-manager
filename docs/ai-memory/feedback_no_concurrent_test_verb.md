---
name: feedback_no_concurrent_test_verb
description: "Never run the `/task test` sandbox verb concurrently or more than once at a time — it uses a fixed per-issue worktree path and concurrent runs corrupt each other."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 329e0bc7-06bd-462e-813c-912115881d14
---

The Test-stage sandbox verb (`npx aitm test <N>`, which `promote` delegates to on develop→test) stages a fixed-name worktree at `.tmp/.task-test-<N>-<sha8>/`. Running it more than once at a time (e.g. invoking `test` directly to "diagnose" while a `promote`-driven run is in flight, or letting the harness background two invocations) makes the runs fight over that single path — each run's cleanup deletes the other's worktree mid-execution.

**Why:** The corruption signature is `MODULE_NOT_FOUND` for test files under the deleted worktree and `spawn npm/node/git ENOENT` (the process's cwd vanished). These post **false "✗ Sandboxed verification failed"** tables onto the issue, polluting the audit trail — they are NOT real test failures.

**How to apply:** Drive develop→test with a single `npx aitm promote <N>` and read its result. If you must run `test` directly, run exactly ONE invocation, in the foreground, and wait for it to finish (npm ci + `test:all` ≈ several minutes). Never fire a second run while one is active. If a race already happened, post an audit-correction comment annotating the bad red tables, then do one clean run. Board stays on `develop` through any red (gate-first), so there's no state to repair — only the misleading comments. Relates to [[feedback_full_auto_review_audit]].
