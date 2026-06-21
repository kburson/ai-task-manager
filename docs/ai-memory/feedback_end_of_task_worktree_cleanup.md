---
name: End-of-task worktree cleanup options
description: After commit-to-trunk + Done, choose one of two cleanup paths for the worktree; PR work (#125) will change the merge target
type: feedback
originSessionId: fc42fb9c-4eb3-4be4-b7cb-fa6a4143d843
---

When a task is committed to trunk and moved to Done, pick one of:

1. **Delete the worktree entirely** (branch and directory).
2. **Delete all branches in the worktree, then rebase the worktree's trunk onto the main thread's trunk** — implying the main thread may not have pushed to origin yet, so the worktree must catch up from the local main-repo trunk, not origin.

**Why:** Solo project, no origin pushes — main-repo trunk is the source of truth, not `origin/trunk`. Stale worktree branches accumulate cruft; either remove them or fast-forward them to match main thread.

**How to apply:** At the end of every task that lands on trunk via the main thread, ask which of the two options the user wants before doing anything. Do not assume.

**Future caveat (issue #125 — PR workflow):** Once PRs are in play, the merge target is not always trunk. Be cautious — confirm the target branch before merging or rebasing.
