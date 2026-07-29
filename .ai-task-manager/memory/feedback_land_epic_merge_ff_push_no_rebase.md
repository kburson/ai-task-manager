---
name: feedback-land-epic-merge-ff-push-no-rebase
description: 'After a direct local --no-ff merge of a feature/epic branch into trunk, push it as a fast-forward — never `git pull --rebase`, which drops the merge commit and replays every child.'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 46690279-d8a5-41c6-9552-ce3bfb3f3bd7
  modified: 2026-07-24T07:22:00.803Z
---

When an epic/feature branch lands on trunk by **direct local `git merge --no-ff`**, the very next step is `git push origin trunk` — a plain fast-forward whenever `origin/trunk` is an ancestor of the new merge commit (verify with `git merge-base --is-ancestor origin/trunk <merge-sha>`).

Do **NOT** run `git pull --rebase` (or `git rebase -i origin/trunk`) after the merge. It starts an interactive rebase that (a) **drops the `[#N] merge` deliverable commit** by default, (b) **rewrites every child SHA**, and (c) replays all N child commits one-by-one, conflicting on files that were already cleanly merged (e.g. `verify-develop.test.mjs`).

**Why:** the `--no-ff` merge already produced the correct, conflict-free trunk state; a rebase re-derives a worse version of it and manufactures conflicts.

**How to apply:** if a stray rebase is already in progress after the merge succeeded, `git rebase --abort` (restores the clean merge HEAD from reflog `trunk@{0}: merge ...`), then `git push origin trunk`. Confirm the merge SHA reached origin with `git merge-base --is-ancestor <merge-sha> origin/trunk`.

Real case: epic #859, 2026-07-24 — see [[project_epic_859_state]]. Related trunk-desync trap: [[reference_updateref_trunk_maintree_desync]]. The main-worktree local `trunk` lives outside my scope, so I advise these commands; the human runs them.
