---
name: feedback_pr_body_no_closing_keyword
description: "PR bodies must use \"Refs #N\", never \"Closes/Resolves/Fixes #N\" — closing keywords auto-close the issue on merge and bypass the /task close pipeline."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f4309608-5bed-4962-8b25-f3ba93004649
  modified: 2026-07-21T12:56:41.675Z
---

In the PR-based flow, a PR body closing keyword (`Closes #N` / `Resolves #N` / `Fixes #N`) makes GitHub auto-close the issue the moment the PR merges — **out-of-band of the `/task close` pipeline**. That skips the board review→Done move, the `review:approved → issue:wrap` timing rows, the `aitm-review-approved` marker, and the lifecycle-box ticks, leaving a split-brain: GitHub=CLOSED but board stuck at `review`.

**Why:** the aitm `close` verb is the single finalizer that reconciles board + timing + markers; a GitHub-native auto-close short-circuits it.

**How to apply:** in PR bodies, reference the issue with a NON-closing form — `Refs #N` (or "part of #N") — so the issue stays OPEN through merge and `/task close` drives finalization. If a closing keyword already auto-closed it, recover with `npx aitm approve <N>` then `npx aitm close <N> --repair`: the repair path replays the full pipeline (timing rollup, lifecycle boxes, review:approved row) and converges the already-closed issue. Happened on #921 (PR #924, "Resolves #921") 2026-07-21. See [[reference_updateref_trunk_maintree_desync]] for the related "pull trunk in the main worktree, not from a scoped worktree" step.
