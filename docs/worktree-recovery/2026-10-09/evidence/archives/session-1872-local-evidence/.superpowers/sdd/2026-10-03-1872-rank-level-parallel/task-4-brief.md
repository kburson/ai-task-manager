## Task 4: One physical parent admission lock

Files:

- Create `scripts/task-tracker/lib/epic-admission-lock.mjs` and focused unit tests.
- Create `scripts/tests/integration/task-tracker/lib/epic-rank-wave-lock.test.mjs` using repository-owned scratch helpers.

Create a real temporary Git repository with two linked worktrees and independent child branches. Prove both resolve the same physical common-directory lock and concurrent callbacks serialize. Test genuine competing processes, bounded timeout, refusal on unknown owner, and no forced eviction of a live lock. Explicit lock context allows nested calls without re-acquisition but cannot authorize another invocation.

Implement parent-before-child ordering. Keep worktree-local issue locks separate. Add a race test where revoke/record competes with Plan-to-Develop and the winning later action re-reads current authority. Run this integration red/green before lifecycle integration.

