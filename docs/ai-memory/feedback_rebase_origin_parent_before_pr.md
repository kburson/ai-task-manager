---
name: feedback-rebase-origin-parent-before-pr
description: "Standard pre-PR hygiene — sync against origin parent branch, run tests, re-sync, then push/PR"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ce4f7882-22ff-4b20-8190-21bbc8cd85b5
---

Before pushing a branch and opening a PR, sync the local branch against the **parent branch in origin** (rebase or merge origin/trunk in), then run all tests, then sync again — if the second sync pulls no new changes, the branch is safe to push and open a PR for.

**Why:** origin's parent branch can carry commits the local branch never saw — e.g. a README edited directly in the GitHub web UI (`b8616fb`) that bypassed prettier and later failed the epic PR's Fast-lane `format:check` (PR #765, 2026-07-09). Validating only the local branch misses defects that appear in the merge result. This holds for teams pushing many branches toward a shared parent, and for parallel agents working separately and pushing to origin.

**How to apply:** as a standard PR step — (1) `git fetch origin` + merge/rebase `origin/<parent>` into the feature branch; (2) run the full test/format/lint suite on the reconciled tree; (3) fetch + sync again — a no-op second sync means the branch is current; (4) push + open PR. If the sync introduces changes (like the unformatted README), fix them on the branch first so CI validates the true merge result. Relates to [[project_pr_based_migration]].
