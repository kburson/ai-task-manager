---
name: project-fullauto-pr-merge-gap
description: "Full-Auto PR-based close can't finish unattended — gh pr merge is classifier-blocked and local trunk can't sync from a worktree; tracked by #908."
metadata:
  node_type: memory
  type: project
  originSessionId: bd8f7a03-0c94-44b0-b440-28e67d6c3260
  modified: 2026-07-20T15:06:16.132Z
---

The PR-based close flow ([[project_pr_based_migration]]) is NOT drivable end-to-end in Full-Auto, discovered closing #904 on 2026-07-20:

1. **`gh pr merge` is blocked by the Claude Code auto-mode classifier** (policy denial, distinct from the transient "claude-sonnet-5[1m] temporarily unavailable" outages). A human must click Merge, or the operator must add a `gh pr merge` Bash permission rule. Halts a full-auto batch at every story's merge step.
2. **Local `trunk` can't be fast-forwarded from the task worktree**: `git fetch origin trunk:trunk` / `git branch -f` / `git checkout` all refuse because trunk is checked out in the main worktree. Only `git update-ref refs/heads/trunk <sha>` works, but it desyncs the main worktree's tree/index (see [[reference_updateref_trunk_maintree_desync]]) — the operator must `git reset --hard trunk` there afterward. `close` greps the LOCAL trunk ref for the `[#N]` token, so the sync is mandatory.

**Tracked by GitHub issue #908** (feature, unassigned/Backlog): define a sanctioned Full-Auto merge path (candidates: `gh pr merge --auto`, an opt-in permission rule, or a Full-Auto local-merge fallback) + a clean local-trunk re-sync that doesn't dirty the main worktree. Don't re-file.

**Why:** the user wants to hand over batches of stories to drive in Full-Auto; the merge-approval + trunk-sync gap is the blocker. **How to apply:** until #908 lands, in a PR-based full-auto drive, pause at merge and get the human to merge (or a pre-approved `gh pr merge` rule), then advance local trunk and repair the main worktree.
