---
name: reference_updateref_trunk_maintree_desync
description: "Advancing trunk via git update-ref from a scope-blocked worktree leaves the main tree's worktree+index behind; resync with reset --hard trunk."
metadata: 
  node_type: memory
  type: reference
  originSessionId: af868c70-5881-4f4b-b7e8-2defce70d75b
---

When closing an issue from a worktree that is **scope-blocked** from the main
working tree (cannot `git -C <main>` / `cd` into it) AND `trunk` is checked out
there, you cannot `git branch -f trunk` (refused: checked-out) or merge in-place.
The workaround used: `git update-ref refs/heads/trunk <branch-tip>`.

**Side effect:** update-ref moves ONLY the ref pointer. The main tree's working
files and index stay at the OLD commit, so `git status` there shows a large
spurious diff — the deliverable's added files appear as "deleted", modified files
as reverted (it's the changeset inverted, because on-disk is behind the ref). No
one edited anything; it's a pure ref-vs-worktree desync.

**Resync (run in the MAIN tree, not the worktree):**
`git -C <main-tree> reset --hard trunk` — rewrites index+worktree to the new tip.
Stash first if the main tree has real uncommitted work.

**Better long-term:** the [[project_pr_based_migration]] flow (push origin → PR →
merge+pull in the main tree) updates ref+index+worktree together and avoids this
entirely. Only reach for update-ref when doing a local-only close from a
scope-blocked worktree. Seen live closing #869 (2026-07-17). Related:
[[feedback_end_of_task_worktree_cleanup]].
